import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  appealRequestSchema,
  appealTargetSchema,
  responseRequestSchema,
  responseTargetSchema,
  standingChallengeSchema,
  chainSlugSchema,
} from '@blacklist/contracts';
import {
  appealTarget,
  appealChallenge,
  submitAppeal,
  responseTarget,
  responseChallenge,
  submitResponse,
  DomainError,
  type IdentityContext,
  type Permission,
} from '@blacklist/domain';

// Phase 9a slice 4: appeals and right-of-reply responses (moderation §6, §9). Standing
// challenges are built by the server; the client only returns the challenge ID and signature.
const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};
const findingId = (req: FastifyRequest) => z.strictObject({ id: z.uuid() }).parse(req.params).id;
const member = (permission: Permission, mutation: boolean) =>
  ({ security: { auth: 'member', permission, mutation } }) as const;
const addressTarget = z.strictObject({
  kind: z.literal('address'),
  chain: chainSlugSchema,
  address: z.string().trim().min(1).max(128),
});
const created = z.strictObject({ id: z.string() });

export function redressRoutes(app: FastifyInstance, ctx: IdentityContext) {
  app.get('/api/v1/findings/:id/appeal-target', { config: member('appeal:create', false) }, async (req) => ({
    kind: 'ok',
    data: appealTargetSchema.parse(await appealTarget(ctx, actor(req), findingId(req))),
  }));
  app.post(
    '/api/v1/findings/:id/standing-challenges',
    { config: member('standing:prove', true) },
    async (req) => {
      z.strictObject({}).parse(req.body ?? {});
      return {
        kind: 'ok',
        data: standingChallengeSchema.parse(await appealChallenge(ctx, actor(req), findingId(req))),
      };
    },
  );
  app.post('/api/v1/findings/:id/appeals', { config: member('appeal:create', true) }, async (req) => {
    const input = appealRequestSchema.parse(req.body);
    if (input.findingId !== findingId(req)) throw new DomainError('not_found');
    return { kind: 'ok', data: created.parse(await submitAppeal(ctx, actor(req), input, req.clientPrefix)) };
  });
  app.get('/api/v1/responses/target', { config: member('response:create', false) }, async (req) => ({
    kind: 'ok',
    data: responseTargetSchema.parse(
      await responseTarget(ctx, actor(req), addressTarget.parse({ kind: 'address', ...(req.query ?? {}) })),
    ),
  }));
  app.post(
    '/api/v1/responses/standing-challenges',
    { config: member('standing:prove', true) },
    async (req) => ({
      kind: 'ok',
      data: standingChallengeSchema.parse(
        await responseChallenge(ctx, actor(req), addressTarget.parse(req.body)),
      ),
    }),
  );
  app.post('/api/v1/responses', { config: member('response:create', true) }, async (req) => ({
    kind: 'ok',
    data: created.parse(
      await submitResponse(ctx, actor(req), responseRequestSchema.parse(req.body), req.clientPrefix),
    ),
  }));
}
