import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { fieldsDigest } from '../../../packages/chains/src/verification.ts';
import { startDatabase } from './database.ts';
function connection(pool: Pool, port: number) {
  const url = new URL(`postgresql://127.0.0.1:${port}/postgres`);
  url.username = pool.options.user ?? '';
  if (typeof pool.options.password !== 'string') throw new Error('fixture_password_missing');
  url.password = pool.options.password;
  return url.toString();
}
describe('Phase8 receipt and pinned-fact SQL security boundaries', () => {
  it('enforces independent same-snapshot final agreement and immutable least-privilege records', async () => {
    const h = await startDatabase();
    try {
      await migrate(connection(h.migrator, h.port), 'gate_runtime');
      const snapshot = { kind: 'evm_block', blockNumber: '10', blockHash: '0x' + 'a'.repeat(64) },
        subject = '0x' + 'b'.repeat(64);
      const execution = { txHash: subject, block: '10', status: 'success', feeRaw: '9007199254740993' },
        movement = {
          ordinal: '0',
          from: '0x' + '1'.repeat(40),
          to: '0x' + '2'.repeat(40),
          asset: { kind: 'native' },
          amountRaw: '1',
          transferKind: 'native',
          evidenceLevel: 'native_consensus',
          emitter: '0x' + '1'.repeat(40),
          authorization: 'subject_signed_direct',
          authority: '0x' + '1'.repeat(40),
          topLevel: true,
        },
        fields = {
          execution,
          normalizedTransaction: {
            chainId: 'eip155:1',
            ...execution,
            blockTime: '2026-10-14T00:00:00.000Z',
            transfers: [movement],
          },
        };
      let seq = 0;
      const receipt = async (
        group: string,
        snap: unknown = snapshot,
        finality = 'final',
        provider = 'node-' + ++seq,
      ) => {
        const row = await h.runtime.query<{ id: string }>(
          `INSERT INTO blacklist.verification_receipts
          (receipt_key,chain_id,capability,subject,query,snapshot,commitment,finality,provider_id,independence_group,requested_at,fetched_at,fields_digest,normalized_fields,decoder_version,comparison_spec_version)
          VALUES ($1,'eip155:1','transaction',$2,$3,$4,'finalized',$5,$6,$7,now(),now(),$8,$9,'decoder-v1','tx-v1') RETURNING id`,
          [
            String(++seq).padStart(64, '0'),
            subject,
            { method: 'eth_getTransactionReceipt', params: { transaction: subject } },
            snap,
            finality,
            provider,
            group,
            fieldsDigest(fields),
            fields,
          ],
        );
        const id = row.rows[0]?.id;
        if (!id) throw new Error('fixture_receipt_missing');
        return id;
      };
      const a = await receipt('infra-a'),
        b = await receipt('infra-b'),
        same = await receipt('infra-a'),
        pending = await receipt('infra-c', snapshot, 'pending'),
        mismatch = await receipt('infra-d', { ...snapshot, blockNumber: '11' }),
        unknown = await receipt('unknown-upstream');
      const verification = async (second: string, result = 'agree', ref: unknown = { subject }) =>
        h.runtime.query<{ id: string }>(
          `INSERT INTO blacklist.chain_fact_verifications
        (verification_key,chain_id,fact_type,fact_ref,receipt_a_id,receipt_b_id,comparison_spec_version,result)
        VALUES($1,'eip155:1','transaction',$2,$3,$4,'tx-v1',$5) RETURNING id`,
          [String(++seq).padStart(64, '0'), ref, a, second, result],
        );
      for (const bad of [same, pending, mismatch, unknown])
        await expect(verification(bad)).rejects.toMatchObject({ code: '23514' });
      await expect(verification(b, 'agree', {})).rejects.toMatchObject({ code: '23514' });
      const v = (await verification(b)).rows[0]?.id;
      if (!v) throw new Error('fixture_verification_missing');
      const pin = (
        finality: string,
        hash = subject,
        normalized: unknown = { ...fields.normalizedTransaction, txHash: hash },
        blockTime: string | null = fields.normalizedTransaction.blockTime,
      ) =>
        h.runtime.query(
          `INSERT INTO blacklist.chain_transactions
        (chain_id,tx_hash,block_number,block_hash,status,fee_raw,finality,normalized,decoder_version,fetched_at,pinned_reason,verification_id,block_time)
        VALUES('eip155:1',$1,'10',$2,'success','9007199254740993',$3,$4,'decoder-v1',now(),'synthetic-local-test',$5,$6)`,
          [hash, snapshot.blockHash, finality, normalized, v, blockTime],
        );
      await expect(pin('pending')).rejects.toMatchObject({ code: '23514' });
      await expect(pin('final', '0x' + 'c'.repeat(64))).rejects.toMatchObject({ code: '23514' });
      await expect(
        pin('final', subject, { chainId: 'eip155:1', ...execution, status: 'failed' }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pin('final', subject, {
          ...fields.normalizedTransaction,
          transfers: [{ ...movement, amountRaw: '2' }],
        }),
      ).rejects.toMatchObject({ code: '23514' });
      for (const time of [null, '2026-10-13T00:00:00.000Z'])
        await expect(pin('final', subject, fields.normalizedTransaction, time)).rejects.toMatchObject({
          code: '23514',
        });
      await pin('final');
      await h.runtime.query(
        `INSERT INTO blacklist.asset_transfers(chain_id,tx_hash,ordinal,from_address,to_address,amount_raw,transfer_kind,evidence_level,emitter,authorization_basis,authority_address,top_level)
        VALUES('eip155:1',$1,'0',$2,$3,1,'native','native_consensus',$2,'subject_signed_direct',$2,true)`,
        [subject, movement.from, movement.to],
      );
      await expect(
        h.runtime.query(
          `INSERT INTO blacklist.asset_transfers(chain_id,tx_hash,ordinal,from_address,to_address,amount_raw,transfer_kind,evidence_level,emitter,authorization_basis,top_level)
        VALUES('eip155:1',$1,'invented',$2,$2,1,'native','native_consensus',$2,'subject_signed_direct',true)`,
          [subject, '0x' + '1'.repeat(40)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (await h.runtime.query('SELECT fee_raw::text FROM blacklist.chain_transactions')).rows[0]?.fee_raw,
      ).toBe('9007199254740993');
      for (const table of [
        'verification_receipts',
        'chain_fact_verifications',
        'chain_transactions',
        'asset_transfers',
        'chain_fact_invalidations',
      ]) {
        await expect(
          h.runtime.query(
            `UPDATE blacklist.${table} SET ${table === 'chain_transactions' ? 'pinned_reason=pinned_reason' : table === 'asset_transfers' ? 'ordinal=ordinal' : 'id=id'}`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(h.runtime.query(`DELETE FROM blacklist.${table}`)).rejects.toMatchObject({
          code: '42501',
        });
        await expect(h.runtime.query(`TRUNCATE blacklist.${table} CASCADE`)).rejects.toMatchObject({
          code: '42501',
        });
      }
      await expect(h.runtime.query('UPDATE blacklist.chains SET enabled=false')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(h.runtime.query('CREATE TABLE blacklist.forbidden_probe(id int)')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(h.runtime.query('CREATE TEMP TABLE forbidden_probe(id int)')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        h.migrator.query('UPDATE blacklist.verification_receipts SET provider_id=provider_id'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await h.stop();
    }
  });
  it('rolls back failed receipt/verification batches and applies migration hashes idempotently', async () => {
    const h = await startDatabase();
    try {
      const url = connection(h.migrator, h.port);
      await migrate(url, 'gate_runtime');
      const before = (
        await h.migrator.query('SELECT name,sha256 FROM blacklist_migrations.applied ORDER BY name')
      ).rows;
      await migrate(url, 'gate_runtime');
      expect(
        (await h.migrator.query('SELECT name,sha256 FROM blacklist_migrations.applied ORDER BY name')).rows,
      ).toEqual(before);
      expect(before).toHaveLength(22);
      const client = await h.runtime.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO blacklist.research_cache(cache_key,chain_id,capability,normalized,fetched_at,expires_at,decoder_version)
          VALUES($1,'eip155:1','account_info','{}',now(),now()+interval '15 seconds','v1')`,
          ['a'.repeat(64)],
        );
        await expect(
          client.query(
            `INSERT INTO blacklist.chain_fact_verifications(verification_key,chain_id,fact_type,fact_ref,receipt_a_id,comparison_spec_version,result)
          VALUES($1,'eip155:1','transaction','{}',uuidv7(),'v1','agree')`,
            ['b'.repeat(64)],
          ),
        ).rejects.toThrow();
        await client.query('ROLLBACK');
        expect(
          (await h.runtime.query('SELECT count(*)::integer AS n FROM blacklist.research_cache')).rows[0]?.n,
        ).toBe(0);
      } finally {
        client.release();
      }
    } finally {
      await h.stop();
    }
  });
});
