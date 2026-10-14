import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { createServer } from '@blacklist/api';
import { readApiConfig } from '@blacklist/config';
import { readResearchAddress } from '@blacklist/domain';
import { addressResearchSchema, researchResultSchema } from '@blacklist/contracts';
import { createChainDataService, createEvmRpcSource } from '../../../packages/chains/src/index.ts';
import type { ChainDataFailure } from '../../../packages/chains/src/ports.ts';
import type { RpcTransport } from '../../../packages/chains/src/providers/rpc-transport.ts';
import { recordChainConflict } from '../../../packages/domain/src/chaindata/repository.ts';
import { startApplicationFixture, fixtureUrl, type ApplicationFixture } from './application-fixture.ts';
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
const address = '0x' + '1'.repeat(40);
function chainsForConflict() {
  const rpc = (balance: string): RpcTransport => ({
    async call<S extends z.ZodType>(
      method: string,
      _params: readonly unknown[],
      validator: S,
    ): Promise<z.output<S>> {
      const responses: Record<string, unknown> = {
        eth_chainId: '0x1',
        eth_getBlockByNumber: { number: '0x10', hash: '0x' + 'b'.repeat(64), timestamp: '0x65000000' },
        eth_getBalance: balance,
        eth_getCode: '0x',
        eth_getTransactionCount: '0x1',
      };
      return validator.parse(responses[method === 'eth_getBlockByHash' ? 'eth_getBlockByNumber' : method]);
    },
  });
  return createChainDataService([
    createEvmRpcSource('synthetic-a', 'synthetic-infra-a', rpc('0x1')),
    createEvmRpcSource('synthetic-b', 'synthetic-infra-b', rpc('0x2')),
  ]);
}
async function conflict() {
  const chains = chainsForConflict(),
    chain = chains.registry.bySlug('ethereum');
  if (!chain) throw new Error('fixture_chain_missing');
  const parsed = chains.adapterFor(chain.chainId).parseAddress(address);
  if (!parsed) throw new Error('fixture_address_missing');
  const result = await chains.getAccountInfo(
    { chainId: chain.chainId, address: parsed },
    { crossVerify: true },
  );
  if (result.ok || result.error.kind !== 'data_conflict' || !result.error.receipts)
    throw new Error('fixture_conflict_missing');
  return { chains, chain, failure: result.error };
}
async function counts() {
  return (
    await f.h.runtime.query(`SELECT
    (SELECT count(*)::integer FROM blacklist.verification_receipts) AS receipts,
    (SELECT count(*)::integer FROM blacklist.chain_fact_verifications) AS verifications,
    (SELECT count(*)::integer FROM blacklist.research_cache) AS cache,
    (SELECT count(*)::integer FROM blacklist.chain_transactions) AS pins`)
  ).rows[0];
}
describe('conflicting finalized evidence is retained without authorizing disputed facts', () => {
  it('persists both independent same-snapshot receipts and conflict; retries are idempotent and rows immutable', async () => {
    const { chains, chain, failure } = await conflict();
    const before = await counts();
    const result = await readResearchAddress({ chains, runtime: f.ctx.runtime }, null, 'ethereum', address, {
      crossVerify: true,
    });
    expect(result.result).toMatchObject({
      ok: false,
      error: { kind: 'data_conflict', receipts: expect.any(Array) },
    });
    const after = await counts();
    expect(after).toMatchObject({
      receipts: before.receipts + 2,
      verifications: before.verifications + 1,
      cache: before.cache,
      pins: 0,
    });
    if (result.result.ok) throw new Error('fixture_conflict_missing');
    const saved = result.result.error;
    await Promise.all([
      recordChainConflict(f.ctx.runtime, 'account_info', address, chain.chainId, saved),
      recordChainConflict(f.ctx.runtime, 'account_info', address, chain.chainId, saved),
    ]);
    expect(await counts()).toEqual(after);
    expect((await f.h.runtime.query('SELECT result FROM blacklist.chain_fact_verifications')).rows).toEqual([
      { result: 'conflict' },
    ]);
    await expect(
      f.h.migrator.query('UPDATE blacklist.verification_receipts SET provider_id=provider_id'),
    ).rejects.toThrow();
    expect(failure.receipts?.[0].fieldsDigest).not.toEqual(failure.receipts?.[1].fieldsDigest);
  });
  it('rejects forged conflict, shared infrastructure, snapshot mismatch and wrong subject/capability before writing', async () => {
    const { chain, failure } = await conflict();
    const pair = failure.receipts;
    if (!pair) throw new Error('fixture_receipts_missing');
    const [a, b] = pair;
    const invalid: ChainDataFailure[] = [
      { ...failure, kind: 'timeout' },
      { ...failure, receipts: undefined },
      { ...failure, capability: 'balances' },
      { ...failure, chainId: 'wrong-network' as typeof chain.chainId },
      { ...failure, receipts: [a, { ...b, independenceGroup: a.independenceGroup }] },
      {
        ...failure,
        receipts: [
          a,
          { ...b, snapshot: { kind: 'evm_block', blockHash: '0x' + 'c'.repeat(64), blockNumber: '16' } },
        ],
      },
      { ...failure, receipts: [a, { ...b, fieldsDigest: a.fieldsDigest }] },
    ];
    const before = await counts();
    for (const bad of invalid)
      await expect(
        recordChainConflict(f.ctx.runtime, 'account_info', address, chain.chainId, bad),
      ).rejects.toThrow('chain_conflict_receipts_invalid');
    await expect(
      recordChainConflict(f.ctx.runtime, 'account_info', '0x' + '2'.repeat(40), chain.chainId, failure),
    ).rejects.toThrow('chain_conflict_receipts_invalid');
    expect(await counts()).toEqual(before);
  });
  it('rolls back partial receipt writes on database failure and safely persists a retry', async () => {
    const { chain, failure } = await conflict();
    const before = await counts();
    await f.h.migrator.query('REVOKE INSERT ON blacklist.chain_fact_verifications FROM gate_runtime');
    try {
      await expect(
        recordChainConflict(f.ctx.runtime, 'account_info', address, chain.chainId, failure),
      ).rejects.toThrow();
      expect(await counts()).toEqual(before);
    } finally {
      await f.h.migrator.query('GRANT INSERT ON blacklist.chain_fact_verifications TO gate_runtime');
    }
    await recordChainConflict(f.ctx.runtime, 'account_info', address, chain.chainId, failure);
    expect(await counts()).toMatchObject({
      receipts: before.receipts + 2,
      verifications: before.verifications + 1,
      cache: before.cache,
      pins: 0,
    });
  });
  it('allows only the safe under-verification DTO; database errors do not leak receipts or privilege details', async () => {
    const chains = chainsForConflict();
    const config = readApiConfig({
      DATABASE_URL: fixtureUrl(f.h, 'runtime'),
      APP_ORIGIN: 'http://localhost:3000',
      WEBAUTHN_RP_ID: 'localhost',
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
      TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
    });
    // Synthetic capability port requests cross-verification; no live provider flag is enabled.
    const app = createServer(f.ctx, config, false, {
      runtime: f.ctx.runtime,
      chains: {
        ...chains,
        getAccountInfo: (ref, options) => chains.getAccountInfo(ref, { ...options, crossVerify: true }),
      },
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/addresses/ethereum/' + address });
      expect(response.statusCode).toBe(200);
      expect(researchResultSchema(addressResearchSchema).parse(response.json())).toMatchObject({
        kind: 'provider_unavailable',
        reason: 'under_verification',
      });
      expect(response.body).not.toMatch(
        /synthetic-infra|providerId|normalizedFields|fieldsDigest|nativeBalanceRaw/u,
      );
      await f.h.migrator.query('REVOKE INSERT ON blacklist.chain_fact_verifications FROM gate_runtime');
      try {
        const failed = await app.inject({ method: 'GET', url: '/api/v1/addresses/ethereum/' + address });
        expect(failed.statusCode).toBe(503);
        expect(failed.body).not.toMatch(
          /permission denied|verification_receipts|gate_runtime|stack|normalizedFields/iu,
        );
      } finally {
        await f.h.migrator.query('GRANT INSERT ON blacklist.chain_fact_verifications TO gate_runtime');
      }
    } finally {
      await app.close();
    }
  });
});
