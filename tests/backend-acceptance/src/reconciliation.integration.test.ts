import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { createDatabase } from '@blacklist/db';
import { migrate } from '../../../packages/db/src/migrate.ts';
import {
  createChainDataService,
  createEvmRpcSource,
  registry,
  evmAdapter,
} from '../../../packages/chains/src/index.ts';
import type { RpcTransport } from '../../../packages/chains/src/providers/rpc-transport.ts';
import { recordChainRead } from '../../../packages/domain/src/chaindata/repository.ts';
import { reconcilePinnedTransaction } from '../../../packages/domain/src/chaindata/reconciliation.ts';
import { startDatabase } from './database.ts';

describe('on-demand pinned-fact reconciliation on isolated PostgreSQL', () => {
  it('requires independent finalized receipts, preserves pins and appends one idempotent invalidation', async () => {
    const h = await startDatabase();
    const url = (role: 'migrator' | 'runtime') => {
      const pool = h[role],
        u = new URL(`postgresql://127.0.0.1:${h.port}/postgres`);
      u.username = pool.options.user ?? '';
      if (typeof pool.options.password !== 'string') throw new Error('fixture_password_missing');
      u.password = pool.options.password;
      return u.toString();
    };
    const runtime = createDatabase(url('runtime'));
    try {
      await migrate(url('migrator'), 'gate_runtime');
      const chain = registry.bySlug('ethereum'),
        hash = evmAdapter.parseTxHash('0x' + 'a'.repeat(64)),
        address = evmAdapter.parseAddress('0x' + '1'.repeat(40));
      if (!chain || !hash || !address) throw new Error('fixture_invalid');
      const ref = { chainId: chain.chainId, txHash: hash },
        actor = {
          kind: 'cli' as const,
          actorRef: 'cli:reconciliation-test',
          operator: 'Synthetic reconciliation operator',
        };
      let blockHash = '0x' + 'b'.repeat(64),
        secondaryFee = '0x1';
      const provider = (id: string, group: string) => {
        const rpc: RpcTransport = {
          async call<S extends z.ZodType>(
            method: string,
            _params: readonly unknown[],
            schema: S,
          ): Promise<z.output<S>> {
            const result =
              method === 'eth_chainId'
                ? '0x1'
                : method === 'eth_getTransactionByHash'
                  ? {
                      hash,
                      from: address,
                      to: address,
                      value: '0x0',
                      input: '0x',
                      blockHash,
                      blockNumber: '0x10',
                      transactionIndex: '0x0',
                    }
                  : method === 'eth_getTransactionReceipt'
                    ? {
                        transactionHash: hash,
                        blockHash,
                        blockNumber: '0x10',
                        transactionIndex: '0x0',
                        status: '0x1',
                        gasUsed: '0x5208',
                        effectiveGasPrice: id === 'node-b' ? secondaryFee : '0x1',
                        logs: [],
                      }
                    : { number: '0x10', hash: blockHash, timestamp: '0x65000000' };
            return schema.parse(result);
          },
        };
        return createEvmRpcSource(id, group, rpc);
      };
      const service = (group = 'infra-b') =>
        createChainDataService([provider('node-a', 'infra-a'), provider('node-b', group)]);
      const initial = await service().getTransaction(ref, { minFinality: 'final', crossVerify: true });
      if (!initial.ok || !initial.value.data) throw new Error('fixture_transaction_missing');
      expect(initial.value.provenance.verification).toBe('agree');
      await recordChainRead(runtime, 'transaction', hash, initial.value, chain.chainId);
      const v = (
        await h.runtime.query<{ id: string }>(
          "SELECT id FROM blacklist.chain_fact_verifications WHERE result='agree'",
        )
      ).rows[0];
      if (!v) throw new Error('fixture_verification_missing');
      const data = initial.value.data,
        normalized = { ...data, blockTime: data.blockTime?.toISOString() ?? null };
      await h.runtime.query(
        `INSERT INTO blacklist.chain_transactions(chain_id,tx_hash,block_number,block_hash,block_time,status,fee_raw,finality,normalized,decoder_version,fetched_at,pinned_reason,verification_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,'final',$8,$9,now(),'synthetic-reconciliation-test',$10)`,
        [
          chain.chainId,
          hash,
          data.block,
          data.blockHash,
          data.blockTime,
          data.status,
          data.feeRaw,
          normalized,
          initial.value.provenance.decoderVersion,
          v.id,
        ],
      );
      expect(await reconcilePinnedTransaction(runtime, service(), actor, ref)).toEqual({
        status: 'consistent',
      });
      await expect(
        Reflect.apply(reconcilePinnedTransaction, undefined, [
          runtime,
          service(),
          { kind: 'user', actorRef: 'synthetic-user' },
          ref,
        ]),
      ).rejects.toThrow('forbidden');
      await expect(
        Reflect.apply(reconcilePinnedTransaction, undefined, [
          runtime,
          service(),
          { kind: 'system', actorRef: 'synthetic-system' },
          ref,
        ]),
      ).rejects.toThrow('forbidden');
      const base = initial.value;
      const otherChain = registry.bySlug('solana'),
        wrongHash = evmAdapter.parseTxHash('0x' + 'e'.repeat(64));
      if (!otherChain || !wrongHash) throw new Error('fixture_invalid');
      for (const value of [
        { ...base, data: { ...data, chainId: otherChain.chainId } },
        { ...base, data: { ...data, txHash: wrongHash } },
        { ...base, provenance: { ...base.provenance, degraded: true } },
        { ...base, provenance: { ...base.provenance, finality: 'pending' as const } },
        { ...base, provenance: { ...base.provenance, verification: 'conflict' as const } },
        {
          ...base,
          provenance: {
            ...base.provenance,
            snapshot: { kind: 'evm_block' as const, blockNumber: '17', blockHash },
          },
        },
        { ...base, data: { ...data, block: '17' } },
        { ...base, data: { ...data, feeRaw: '1' } },
      ]) {
        expect(
          await reconcilePinnedTransaction(
            runtime,
            { getTransaction: async () => ({ ok: true, value }) },
            actor,
            ref,
          ),
        ).toMatchObject({ status: 'unavailable' });
      }
      // A provider conflict is evidence to retain, never authority to invalidate the pin.
      secondaryFee = '0x2';
      const conflictsBefore = (
        await h.runtime.query(
          "SELECT count(*)::integer AS n FROM blacklist.chain_fact_verifications WHERE result='conflict'",
        )
      ).rows[0]?.n;
      const cacheBefore = (
        await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.research_cache')
      ).rows[0]?.n;
      expect(await reconcilePinnedTransaction(runtime, service(), actor, ref)).toEqual({
        status: 'unavailable',
        reason: 'data_conflict',
      });
      expect(
        (
          await h.runtime.query(
            "SELECT count(*)::integer AS n FROM blacklist.chain_fact_verifications WHERE result='conflict'",
          )
        ).rows[0]?.n,
      ).toBe(Number(conflictsBefore) + 1);
      expect(
        (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.research_cache')).rows[0]?.n,
      ).toBe(cacheBefore);
      expect((await h.runtime.query('SELECT id FROM blacklist.chain_fact_invalidations')).rowCount).toBe(0);
      expect(
        (await h.runtime.query('SELECT normalized FROM blacklist.chain_transactions')).rows[0]?.normalized,
      ).toEqual(normalized);
      const receiptsBefore = (
        await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts')
      ).rows[0]?.n;
      await h.migrator.query('REVOKE INSERT ON blacklist.chain_fact_verifications FROM gate_runtime');
      try {
        await expect(reconcilePinnedTransaction(runtime, service(), actor, ref)).rejects.toThrow();
        expect(
          (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.verification_receipts'))
            .rows[0]?.n,
        ).toBe(receiptsBefore);
      } finally {
        await h.migrator.query('GRANT INSERT ON blacklist.chain_fact_verifications TO gate_runtime');
      }
      secondaryFee = '0x1';
      blockHash = '0x' + 'c'.repeat(64);
      expect(
        await reconcilePinnedTransaction(runtime, service('unknown-upstream'), actor, ref),
      ).toMatchObject({ status: 'unavailable' });
      expect((await h.runtime.query('SELECT id FROM blacklist.chain_fact_invalidations')).rowCount).toBe(0);
      // A failed write rolls back; read receipts may remain as independent immutable observations.
      await h.admin.query('REVOKE INSERT ON blacklist.chain_fact_invalidations FROM gate_runtime');
      await expect(reconcilePinnedTransaction(runtime, service(), actor, ref)).rejects.toMatchObject({
        code: '42501',
      });
      expect((await h.runtime.query('SELECT id FROM blacklist.chain_fact_invalidations')).rowCount).toBe(0);
      await h.admin.query('GRANT INSERT ON blacklist.chain_fact_invalidations TO gate_runtime');
      type TransactionResult = Awaited<ReturnType<ReturnType<typeof service>['getTransaction']>>;
      let releaseOld: ((value: TransactionResult) => void) | undefined, entered: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const staleRead = reconcilePinnedTransaction(
        runtime,
        {
          getTransaction: () => {
            entered?.();
            return new Promise<TransactionResult>((resolve) => {
              releaseOld = resolve;
            });
          },
        },
        actor,
        ref,
      );
      await started;
      const [first, second] = await Promise.all([
        reconcilePinnedTransaction(runtime, service(), actor, ref),
        reconcilePinnedTransaction(runtime, service(), actor, ref),
      ]);
      expect(first).toMatchObject({ status: 'invalidated', dependentReviewRequired: true });
      expect(second).toEqual(first);
      releaseOld?.(initial);
      expect(await staleRead).toEqual(first);
      // Finality recovery must not silently resurrect an already invalidated pin.
      blockHash = '0x' + 'b'.repeat(64);
      expect(await reconcilePinnedTransaction(runtime, service(), actor, ref)).toEqual(first);
      expect((await h.runtime.query('SELECT id FROM blacklist.chain_fact_invalidations')).rowCount).toBe(1);
      expect(
        (await h.runtime.query('SELECT normalized FROM blacklist.chain_transactions')).rows[0]?.normalized,
      ).toEqual(normalized);
      // CR-14 D-1: the database itself refuses invalidations that are forged, unpinned or repeated.
      const [row] = (
        await h.runtime.query<{ chain_id: string; fact_ref: { subject: string; receiptDigests: string[] } }>(
          'SELECT chain_id,fact_ref FROM blacklist.chain_fact_invalidations',
        )
      ).rows;
      if (!row) throw new Error('fixture_invalid');
      const insert = (factRef: unknown, factType = 'transaction') =>
        h.runtime.query(
          `INSERT INTO blacklist.chain_fact_invalidations(chain_id,fact_type,fact_ref,reason,recorded_by)
           VALUES($1,$2,$3,'direct_insert_attempt','cli:test')`,
          [row.chain_id, factType, factRef],
        );
      await expect(insert(row.fact_ref)).rejects.toMatchObject({ code: '23505' });
      await expect(
        insert({ ...row.fact_ref, receiptDigests: ['a'.repeat(64), 'a'.repeat(64)] }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(insert({ ...row.fact_ref, subject: '0x' + 'd'.repeat(64) })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert({ ...row.fact_ref, extra: true })).rejects.toMatchObject({ code: '23514' });
      await expect(insert(row.fact_ref, 'account_info')).rejects.toMatchObject({ code: '23514' });
      expect((await h.runtime.query('SELECT id FROM blacklist.chain_fact_invalidations')).rowCount).toBe(1);
      const missing = evmAdapter.parseTxHash('0x' + 'd'.repeat(64));
      if (!missing) throw new Error('fixture_invalid');
      expect(
        await reconcilePinnedTransaction(runtime, service(), actor, { ...ref, txHash: missing }),
      ).toEqual({ status: 'not_pinned' });
    } finally {
      await runtime.close();
      await h.stop();
    }
  });
});
