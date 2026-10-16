import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import { createIdentity } from '@blacklist/domain';
import { createServer } from '@blacklist/api';
import { readApiConfig } from '@blacklist/config';
import {
  addressResearchSchema,
  transactionResearchSchema,
  researchResultSchema,
  searchResponseSchema,
} from '@blacklist/contracts';
import {
  createChainDataService,
  createEvmRpcSource,
  createSolanaRpcSource,
} from '../../../packages/chains/src/index.ts';
import type { RpcTransport } from '../../../packages/chains/src/providers/rpc-transport.ts';
import type { z } from 'zod';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { startDatabase } from './database.ts';
function connection(pool: Pool, port: number) {
  const url = new URL(`postgresql://127.0.0.1:${port}/postgres`);
  url.username = pool.options.user ?? '';
  if (typeof pool.options.password !== 'string') throw new Error('fixture_password_missing');
  url.password = pool.options.password;
  return url.toString();
}
describe('real API/domain/Postgres research boundary (synthetic RPC, mock mode off)', () => {
  it('returns contract-valid sourced facts, caches single-source reads without receipts, rejects private/forged/input paths and caps abuse', async () => {
    const h = await startDatabase();
    let ctx: ReturnType<typeof createIdentity> | undefined, app: ReturnType<typeof createServer> | undefined;
    try {
      await migrate(connection(h.migrator, h.port), 'gate_runtime');
      const config = readApiConfig({
        DATABASE_URL: connection(h.runtime, h.port),
        APP_ORIGIN: 'http://localhost:3000',
        WEBAUTHN_RP_ID: 'localhost',
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
        TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
      });
      ctx = createIdentity(config.DATABASE_URL, {
        secret: config.BETTER_AUTH_SECRET,
        origin: config.APP_ORIGIN,
        rpId: 'localhost',
        rpName: 'Blacklist',
        breakGlassEnabled: false,
        registration: { mode: 'open' },
      });
      await ctx.runtime.start();
      const transport: RpcTransport = {
        async call<S extends z.ZodType>(
          method: string,
          _params: readonly unknown[],
          schema: S,
        ): Promise<z.output<S>> {
          const responses: Record<string, unknown> = {
            eth_chainId: '0x1',
            eth_getBlockByNumber: { number: '0x10', hash: '0x' + 'a'.repeat(64), timestamp: '0x65000000' },
            eth_getBalance: '0x20000000000001',
            eth_getCode: '0x',
            eth_getTransactionByHash: {
              hash: '0x' + 'b'.repeat(64),
              from: '0x' + '1'.repeat(40),
              to: '0x' + '2'.repeat(40),
              value: '0x1',
              input: '0x',
              blockHash: '0x' + 'a'.repeat(64),
              blockNumber: '0x10',
              transactionIndex: '0x0',
            },
            eth_getTransactionReceipt: {
              transactionHash: '0x' + 'b'.repeat(64),
              blockHash: '0x' + 'a'.repeat(64),
              blockNumber: '0x10',
              transactionIndex: '0x0',
              status: '0x1',
              gasUsed: '0x5208',
              effectiveGasPrice: '0x1',
              logs: [],
            },
            getTransaction: {
              slot: 100,
              blockTime: 1700000000,
              version: 0,
              transaction: {
                signatures: ['1'.repeat(64)],
                message: {
                  accountKeys: [{ pubkey: '1'.repeat(32), signer: true, writable: true }],
                  instructions: [],
                },
              },
              meta: {
                err: null,
                fee: 5000,
                preBalances: [10000],
                postBalances: [5000],
                preTokenBalances: [],
                postTokenBalances: [],
                innerInstructions: [],
              },
            },
            getGenesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
            getAccountInfo: {
              context: { slot: 100 },
              value: {
                lamports: '9007199254740993',
                owner: '1'.repeat(32),
                executable: false,
                data: ['', 'base64'],
              },
            },
          };
          if (!(method in responses)) throw new Error('unsupported_fixture_method');
          return schema.parse(responses[method]);
        },
      };
      const chains = createChainDataService([
        createEvmRpcSource('synthetic-evm', 'unknown-upstream', transport),
        createSolanaRpcSource('synthetic-solana', 'unknown-upstream', transport),
      ]);
      app = createServer(ctx, config, false, { runtime: ctx.runtime, chains });
      await app.ready();
      const address = '0x' + '1'.repeat(40),
        url = '/api/v1/addresses/ethereum/' + address;
      const res = await app.inject({ method: 'GET', url, remoteAddress: '192.0.2.1' });
      expect(res.statusCode).toBe(200);
      const parsed = researchResultSchema(addressResearchSchema).parse(res.json());
      expect(parsed.kind).toBe('found');
      if (parsed.kind !== 'found') throw new Error('fixture_result_missing');
      expect(parsed.data.facts[0]?.value).toBe('9007199254740993');
      // Phase 9a slice 3 connects published findings; none exist for this address.
      expect(parsed.data.availability?.findings).toBe('available');
      expect(parsed.data.findings).toEqual([]);
      expect(parsed.data.provenance).toMatchObject({
        snapshot: { kind: 'evm_block', blockHash: '0x' + 'a'.repeat(64), blockNumber: '16' },
        verification: 'single_source',
      });
      expect(parsed.data.assessment.band).toBe('not_assessed');
      expect(JSON.stringify(parsed)).not.toMatch(/"(?:email|userId|sessionId|token|score|providerId)"/u);
      const sol = await app.inject({
        method: 'GET',
        url: '/api/v1/addresses/solana/' + '1'.repeat(32),
        remoteAddress: '192.0.2.2',
      });
      expect(researchResultSchema(addressResearchSchema).parse(sol.json()).kind).toBe('found');
      // CR-03: single-source display reads fill the disposable cache, never append-only receipts.
      expect(
        (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts')).rows[0]
          ?.n,
      ).toBe(0);
      expect(
        Number(
          (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.research_cache')).rows[0]?.n,
        ),
      ).toBeGreaterThan(0);
      const again = await app.inject({ method: 'GET', url, remoteAddress: '192.0.2.3' });
      expect(again.statusCode).toBe(200);
      expect(
        (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts')).rows[0]
          ?.n,
      ).toBe(0);
      expect(
        (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.chain_transactions')).rows[0]?.n,
      ).toBe(0);
      for (const bad of [
        '/api/v1/addresses/ethereum/0x1',
        '/api/v1/addresses/ethereum/0x52908400098527886E0F7030069857D2E4169Ee7',
        '/api/v1/addresses/solana/' + '0'.repeat(32),
      ])
        expect((await app.inject({ method: 'GET', url: bad, remoteAddress: '192.0.2.4' })).statusCode).toBe(
          400,
        );
      const noNetwork = await app.inject({
        method: 'GET',
        url: '/api/v1/search?query=' + address,
        remoteAddress: '192.0.2.5',
      });
      expect(searchResponseSchema.parse(noNetwork.json()).kind).toBe('invalid_identifier');
      const search = await app.inject({
        method: 'GET',
        url: '/api/v1/search?query=' + address + '&chain=ethereum',
        remoteAddress: '192.0.2.5',
      });
      expect(searchResponseSchema.parse(search.json()).kind).toBe('results');
      const internal = '/api/internal/v1/addresses/ethereum/' + address;
      expect((await app.inject({ method: 'GET', url: internal })).statusCode).toBe(404);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: internal,
            remoteAddress: '192.0.2.6',
            headers: { 'x-bl-internal-token': config.INTERNAL_API_TOKEN },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: internal,
            remoteAddress: '127.0.0.1',
            headers: { 'x-bl-internal-token': config.INTERNAL_API_TOKEN },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/me/security',
            headers: { cookie: '__Host-bl_session=forged' },
          })
        ).statusCode,
      ).toBe(401);
      for (let i = 0; i < 16; i++) {
        const reply = await app.inject({ method: 'GET', url, remoteAddress: '198.51.100.7' });
        expect(reply.statusCode).toBe(i < 15 ? 200 : 429);
      }
      expect(
        app.authorizationMatrix
          .filter((r) => r.path.includes('/addresses/'))
          .every((r) => ['public', 'internal'].includes(r.policy.auth)),
      ).toBe(true);
      for (const [network, hash] of [
        ['ethereum', '0x' + 'b'.repeat(64)],
        ['solana', '1'.repeat(64)],
      ] as const) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/transactions/${network}/${hash}`,
          remoteAddress: '203.0.113.11',
        });
        expect(response.statusCode).toBe(200);
        const parsed = researchResultSchema(transactionResearchSchema).parse(response.json());
        expect(parsed.kind).toBe('found');
        if (parsed.kind !== 'found') throw new Error('fixture_result_missing');
        expect(parsed.data.status).toBe('success');
        expect(parsed.data.transferCoverage).toBe('incomplete');
        expect(parsed.data.feePaid).toBe(network === 'ethereum' ? '21000 wei' : '5000 lamports');
      }
      // Actual domain persistence failure must not become a successful API response or partial receipt batch.
      const before = (
        await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts')
      ).rows[0]?.n;
      await h.migrator.query('REVOKE INSERT ON blacklist.research_cache FROM gate_runtime');
      try {
        const failed = await app.inject({
          method: 'GET',
          url: '/api/v1/addresses/ethereum/0x' + '2'.repeat(40),
          remoteAddress: '198.51.100.9',
        });
        expect(failed.statusCode).toBe(503);
        expect(failed.body).not.toMatch(/permission denied|research_cache|gate_runtime|stack|postgresql/iu);
        expect(
          (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts'))
            .rows[0]?.n,
        ).toBe(before);
      } finally {
        await h.migrator.query('GRANT INSERT ON blacklist.research_cache TO gate_runtime');
      }
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/addresses/ethereum/0x' + '2'.repeat(40),
            remoteAddress: '198.51.100.10',
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts')).rows[0]
          ?.n,
      ).toBe(Number(before));
    } finally {
      await app?.close();
      await ctx?.runtime.close();
      await h.stop();
    }
  });
});
