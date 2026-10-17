import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  chainSlugSchema,
  researchResultSchema,
  addressResearchSchema,
  transactionResearchSchema,
  searchRequestSchema,
  addressHistorySchema,
  tokenResearchSchema,
  contractResearchSchema,
  tokenBalancesSchema,
} from '@blacklist/contracts';
import { DomainError, validateResearchIdentifier, type ResearchContext } from '@blacklist/domain';
import { searchResearch, detectAndSearch } from '../presenters/search.ts';
import { addressResearch, transactionResearch } from '../presenters/research.ts';
import {
  historyResearch,
  tokenResearch,
  contractResearch,
  balanceResearch,
} from '../presenters/chain-reads.ts';

const parameters = z.object({ chain: chainSlugSchema, identifier: z.string().min(1).max(90) });
const options = z.object({
  finality: z.enum(['pending', 'final']).default('pending'),
  verify: z.enum(['true', 'false']).default('false'),
});
export function researchRoutes(app: FastifyInstance, ctx: ResearchContext | undefined, publicBands = false) {
  const limits = new Map<string, { start: number; cost: number }>();
  app.addHook('onRequest', async (req) => {
    if (
      !req.routeOptions.url?.includes('/search') &&
      !req.routeOptions.url?.includes('/addresses/') &&
      !req.routeOptions.url?.includes('/transactions/')
    )
      return;
    const now = Date.now(),
      key = req.clientPrefix || 'unknown',
      prior = limits.get(key);
    const entry = prior && now - prior.start < 60000 ? prior : { start: now, cost: 0 };
    entry.cost += 2;
    if (limits.size >= 1000 && !limits.has(key)) {
      for (const [k, v] of limits) if (now - v.start >= 60000) limits.delete(k);
    }
    if (limits.size >= 1000 && !limits.has(key)) throw new DomainError('rate_limited', 60);
    limits.set(key, entry);
    if (entry.cost > 30) throw new DomainError('rate_limited', 60);
  });
  for (const prefix of ['/api/v1', '/api/internal/v1']) {
    const config = {
      security: {
        auth: prefix.includes('/internal/') ? ('internal' as const) : ('public' as const),
        mutation: false,
      },
    };
    app.get(`${prefix}/addresses/:chain/:identifier/transactions`, { config }, async (req) => {
      const { chain, identifier } = parameters.parse(req.params),
        query = z
          .object({
            limit: z.coerce.number().int().min(1).max(100).default(20),
            cursor: z.string().min(1).max(2048).optional(),
            direction: z.enum(['in', 'out', 'all']).default('all'),
          })
          .parse(req.query);
      validateResearchIdentifier(chain, identifier, 'address');
      if (!ctx) return { kind: 'provider_unavailable', retryAfterSeconds: 30, reason: 'unconfigured' };
      return researchResultSchema(addressHistorySchema).parse(
        await historyResearch(ctx, req.actor, chain, identifier, query),
      );
    });
    for (const [suffix, handler, schema] of [
      ['token', tokenResearch, tokenResearchSchema],
      ['contract', contractResearch, contractResearchSchema],
      ['balances', balanceResearch, tokenBalancesSchema],
    ] as const) {
      app.get(`${prefix}/addresses/:chain/:identifier/${suffix}`, { config }, async (req) => {
        const { chain, identifier } = parameters.parse(req.params),
          query = options.parse(req.query);
        validateResearchIdentifier(chain, identifier, 'address');
        if (!ctx) return { kind: 'provider_unavailable', retryAfterSeconds: 30, reason: 'unconfigured' };
        const result = await handler(ctx, req.actor, chain, identifier, {
          minFinality: query.finality,
          crossVerify: query.verify === 'true',
        });
        return researchResultSchema(schema).parse(result);
      });
    }
    app.get(`${prefix}/addresses/:chain/:identifier`, { config }, async (req) => {
      const { chain, identifier } = parameters.parse(req.params),
        query = options.parse(req.query);
      validateResearchIdentifier(chain, identifier, 'address');
      if (!ctx) return { kind: 'provider_unavailable', retryAfterSeconds: 30, reason: 'unconfigured' };
      return researchResultSchema(addressResearchSchema).parse(
        await addressResearch(
          ctx,
          req.actor,
          chain,
          identifier,
          {
            minFinality: query.finality,
            crossVerify: query.verify === 'true',
          },
          publicBands,
        ),
      );
    });
    app.get(`${prefix}/transactions/:chain/:identifier`, { config }, async (req) => {
      const { chain, identifier } = parameters.parse(req.params),
        query = options.parse(req.query);
      validateResearchIdentifier(chain, identifier, 'transaction');
      if (!ctx) return { kind: 'provider_unavailable', retryAfterSeconds: 30, reason: 'unconfigured' };
      return researchResultSchema(transactionResearchSchema).parse(
        await transactionResearch(ctx, req.actor, chain, identifier, {
          minFinality: query.finality,
          crossVerify: query.verify === 'true',
        }),
      );
    });
    app.get(`${prefix}/search`, { config }, async (req) => {
      const query = searchRequestSchema.parse(req.query);
      if (!ctx) return { kind: 'provider_unavailable', retryAfterSeconds: 30 };
      return query.chain
        ? searchResearch(ctx, req.actor, query.chain, query.query)
        : detectAndSearch(ctx, req.actor, query.query);
    });
  }
}
