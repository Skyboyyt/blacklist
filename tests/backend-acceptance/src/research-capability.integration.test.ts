import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createServer } from '@blacklist/api';
import { readApiConfig } from '@blacklist/config';
import {
  addressHistorySchema,
  tokenResearchSchema,
  contractResearchSchema,
  tokenBalancesSchema,
  researchResultSchema,
  searchResponseSchema,
} from '@blacklist/contracts';
import { createChainDataService, createEvmRpcSource } from '../../../packages/chains/src/index.ts';
import { ProviderFault, type RpcTransport } from '../../../packages/chains/src/providers/rpc-transport.ts';
import { startApplicationFixture, fixtureUrl, type ApplicationFixture } from './application-fixture.ts';
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
const address = '0x' + '1'.repeat(40),
  hash = '0x' + 'a'.repeat(64),
  block = { number: '0x10', hash: '0x' + 'b'.repeat(64), timestamp: '0x65000000' };
function appFor(mode: 'ok' | 'no_code' | 'timeout' | 'rate_limited' | 'absent' | 'complete_absent' = 'ok') {
  const rpc: RpcTransport = {
    async call<S extends z.ZodType>(
      method: string,
      params: readonly unknown[],
      validator: S,
    ): Promise<z.output<S>> {
      if (mode === 'timeout' || mode === 'rate_limited') throw new ProviderFault(mode);
      let value: unknown;
      if (method === 'eth_chainId') value = '0x1';
      else if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') value = block;
      else if (method === 'eth_getCode') value = mode === 'no_code' ? '0x' : '0x6000';
      else if (method === 'eth_getBalance') value = '0x2a';
      else if (method === 'eth_getStorageAt') value = '0x' + '0'.repeat(64);
      else if (method === 'eth_getTransactionCount') value = '0x1';
      else if (method === 'eth_getTransactionByHash')
        value =
          mode === 'absent' || mode === 'complete_absent'
            ? null
            : {
                hash,
                from: address,
                to: address,
                value: '0x0',
                input: '0x',
                blockHash: block.hash,
                blockNumber: block.number,
                transactionIndex: '0x0',
              };
      else if (method === 'eth_call') {
        const selector = z.object({ data: z.string() }).parse(params[0]).data;
        if (selector === '0x313ce567') value = '0x' + 18n.toString(16).padStart(64, '0');
        else if (selector === '0x18160ddd' || selector.startsWith('0x70a08231'))
          value = '0x' + 9007199254740993n.toString(16).padStart(64, '0');
        else throw new ProviderFault('not_supported');
      } else if (method === 'alchemy_getTokenBalances')
        value = { address, tokenBalances: [{ contractAddress: address, tokenBalance: '0x1', error: null }] };
      else if (method === 'alchemy_getAssetTransfers')
        value = {
          transfers: [
            {
              hash,
              blockNum: block.number,
              from: address,
              to: address,
              metadata: { blockTimestamp: new Date(Number(BigInt(block.timestamp) * 1000n)).toISOString() },
            },
          ],
          pageKey: 'synthetic-next-page',
        };
      else if (method === 'eth_getTransactionReceipt')
        value =
          mode === 'absent' || mode === 'complete_absent'
            ? null
            : {
                transactionHash: hash,
                blockHash: block.hash,
                blockNumber: block.number,
                transactionIndex: '0x0',
                status: '0x1',
                gasUsed: '0x5208',
                effectiveGasPrice: '0x1',
                logs: [],
              };
      else throw new Error('fixture_unexpected_method');
      return validator.parse(value);
    },
  };
  const chains = createChainDataService([
    // Synthetic provider capabilities only; does not enable any production indexing flags.
    createEvmRpcSource('fixture-rpc', 'unknown-upstream', rpc, mode === 'complete_absent', true, true),
  ]);
  return createServer(
    f.ctx,
    readApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: fixtureUrl(f.h, 'runtime'),
      APP_ORIGIN: f.ctx.settings.origin,
      BETTER_AUTH_SECRET: f.ctx.settings.secret,
      INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
      WEBAUTHN_RP_ID: f.ctx.settings.rpId,
    }),
    false,
    { runtime: f.ctx.runtime, chains },
  );
}
describe('API metadata/history/balance capabilities use actual adapters and database boundaries', () => {
  it('search detects an unambiguous network, honours a chosen one, resolves addresses/transactions and retains unavailable outcomes', async () => {
    const app = appFor();
    try {
      expect(
        searchResponseSchema.parse(
          (await app.inject({ method: 'GET', url: '/api/v1/search?query=' + address })).json(),
        ),
      ).toMatchObject({ kind: 'results', hits: [{ chain: 'ethereum', id: address }] });
      expect(
        searchResponseSchema.parse(
          (await app.inject({ method: 'GET', url: '/api/v1/search?query=unrecognized' })).json(),
        ).kind,
      ).toBe('invalid_identifier');
      expect(
        searchResponseSchema.parse(
          (
            await app.inject({ method: 'GET', url: '/api/v1/search?chain=ethereum&query=unrecognized' })
          ).json(),
        ).kind,
      ).toBe('invalid_identifier');
      for (const [id, kind] of [
        [address, 'address'],
        [hash, 'transaction'],
      ] as const) {
        const result = searchResponseSchema.parse(
          (await app.inject({ method: 'GET', url: '/api/v1/search?chain=ethereum&query=' + id })).json(),
        );
        expect(result.kind).toBe('results');
        if (result.kind !== 'results') throw new Error('fixture_search_result_missing');
        expect(result.hits[0]?.kind).toBe(kind);
        expect(result.hits[0]?.id).toBe(id);
        expect(result.hits[0]?.band).toBeNull();
        expect(result.hits[0]?.summary).toContain('no risk assessment');
      }
    } finally {
      await app.close();
    }
    const unavailable = appFor('timeout');
    try {
      expect(
        searchResponseSchema.parse(
          (
            await unavailable.inject({ method: 'GET', url: '/api/v1/search?chain=ethereum&query=' + address })
          ).json(),
        ).kind,
      ).toBe('provider_unavailable');
    } finally {
      await unavailable.close();
    }
    for (const mode of ['absent', 'complete_absent'] as const) {
      const missing = appFor(mode);
      try {
        const result = searchResponseSchema.parse(
          (
            await missing.inject({ method: 'GET', url: '/api/v1/search?chain=ethereum&query=' + hash })
          ).json(),
        );
        expect(result.kind).toBe(mode === 'complete_absent' ? 'not_found' : 'provider_unavailable');
      } finally {
        await missing.close();
      }
    }
  });
  it('returns allowlisted, integer-preserving capability DTOs with explicit incomplete inventory', async () => {
    const app = appFor();
    try {
      const base = `/api/v1/addresses/ethereum/${address}`;
      const token = await app.inject({ method: 'GET', url: base + '/token?finality=final' });
      expect(token.statusCode).toBe(200);
      const t = researchResultSchema(tokenResearchSchema).parse(token.json());
      expect(t.kind).toBe('found');
      if (t.kind !== 'found') throw new Error('fixture_token_result_missing');
      expect(t.data.totalSupplyRaw).toBe('9007199254740993');
      expect(t.data.source.verification).toBe('single_source');
      expect(t.data.nameOnchain).toBeNull();
      const contract = researchResultSchema(contractResearchSchema).parse(
        (await app.inject({ method: 'GET', url: base + '/contract?finality=final' })).json(),
      );
      expect(contract.kind).toBe('found');
      if (contract.kind !== 'found') throw new Error('fixture_contract_result_missing');
      expect(contract.data.sourceVerification).toBe('unknown');
      const balance = researchResultSchema(tokenBalancesSchema).parse(
        (await app.inject({ method: 'GET', url: base + '/balances?finality=final' })).json(),
      );
      expect(balance.kind).toBe('found');
      if (balance.kind !== 'found') throw new Error('fixture_balance_result_missing');
      expect(balance.data.balances[0]?.amountRaw).toBe('9007199254740993');
      expect(balance.data.coverage).toContain('incomplete');
      const response = await app.inject({ method: 'GET', url: base + '/transactions?direction=out&limit=1' });
      const history = researchResultSchema(addressHistorySchema).parse(response.json());
      expect(history.kind).toBe('found');
      if (history.kind !== 'found') throw new Error('fixture_history_result_missing');
      expect(history.data.items[0]?.hash).toBe(hash);
      expect(history.data.items[0]?.status).toBe('success');
      expect(history.data.truncated).toBe(true);
      expect(typeof history.data.nextCursor === 'string').toBe(true);
      expect(history.data.nextCursor === 'synthetic-next-page').toBe(false);
      const next = await app.inject({
        method: 'GET',
        url:
          base +
          '/transactions?direction=out&limit=1&cursor=' +
          encodeURIComponent(history.data.nextCursor ?? ''),
      });
      expect(researchResultSchema(addressHistorySchema).parse(next.json()).kind).toBe('found');
      expect(
        (await app.inject({ method: 'GET', url: base + '/transactions?direction=all' })).json(),
      ).toMatchObject({ kind: 'provider_unavailable', reason: 'not_supported' });
      for (const suffix of ['/token?finality=invalid', '/balances?verify=invalid', '/transactions?limit=101'])
        expect((await app.inject({ method: 'GET', url: base + suffix })).statusCode).toBe(400);
      expect(
        (await app.inject({ method: 'GET', url: base.replace('/api/v1/', '/api/internal/v1/') + '/token' }))
          .statusCode,
      ).toBe(404); // Internal ingress intentionally hides routes from untrusted peers.
      expect(
        app.authorizationMatrix.some(
          (route) =>
            route.path === '/api/internal/v1/addresses/:chain/:identifier/token' &&
            route.policy.auth === 'internal',
        ),
      ).toBe(true);
      expect(
        (await f.h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.chain_transactions')).rows[0]
          ?.n,
      ).toBe(0);
    } finally {
      await app.close();
    }
  });
  it('missing code is not a fabricated token/contract and provider failures stay typed unavailable', async () => {
    const empty = appFor('no_code');
    try {
      for (const suffix of ['token', 'contract'])
        expect(
          (
            await empty.inject({ method: 'GET', url: `/api/v1/addresses/ethereum/${address}/${suffix}` })
          ).json(),
        ).toMatchObject({ kind: 'not_found' });
    } finally {
      await empty.close();
    }
    for (const mode of ['timeout', 'rate_limited'] as const) {
      for (const suffix of ['token', 'contract', 'balances', 'transactions?direction=out']) {
        const app = appFor(mode);
        try {
          const response = await app.inject({
            method: 'GET',
            url: `/api/v1/addresses/ethereum/${address}/${suffix}`,
          });
          expect(response.statusCode).toBe(200);
          expect(response.json()).toMatchObject({ kind: 'provider_unavailable', reason: mode });
          expect(response.body).not.toMatch(/postgresql|fixture-rpc|stack|password|api_key/iu);
        } finally {
          await app.close();
        }
      }
    }
  });
});
