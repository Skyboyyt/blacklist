import type { DatabaseRuntime } from '@blacklist/db';
import type { ChainTxRef } from '@blacklist/core';

export interface PinnedTransaction {
  readonly normalized: unknown;
  readonly decoder_version: string;
  readonly invalidation_id: string | null;
}
export async function readPinnedTransaction(runtime: DatabaseRuntime, ref: ChainTxRef) {
  const result = await runtime.pool.query<PinnedTransaction>(
    `SELECT t.normalized,t.decoder_version,
      (SELECT i.id FROM blacklist.chain_fact_invalidations i
       WHERE i.chain_id=t.chain_id AND i.fact_type='transaction' AND i.fact_ref->>'subject'=t.tx_hash
       LIMIT 1) AS invalidation_id
     FROM blacklist.chain_transactions t WHERE t.chain_id=$1 AND t.tx_hash=$2`,
    [ref.chainId, ref.txHash],
  );
  return result.rows[0];
}

/** Serialize retries without UPDATE locks/grants on the immutable pinned fact. */
export async function completePinnedReconciliation(
  runtime: DatabaseRuntime,
  ref: ChainTxRef,
  recordedBy: string,
  evidence: { readonly receiptDigests: readonly string[] } | null,
) {
  return runtime.transaction(async (_tx, client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [ref.chainId, ref.txHash]);
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM blacklist.chain_fact_invalidations
       WHERE chain_id=$1 AND fact_type='transaction' AND fact_ref->>'subject'=$2 LIMIT 1`,
      [ref.chainId, ref.txHash],
    );
    if (existing.rows[0])
      return {
        status: 'invalidated' as const,
        invalidationId: existing.rows[0].id,
        dependentReviewRequired: true as const,
      };
    if (!evidence) return { status: 'consistent' as const };
    const result = await client.query<{ id: string }>(
      `INSERT INTO blacklist.chain_fact_invalidations(chain_id,fact_type,fact_ref,reason,recorded_by)
       VALUES($1,'transaction',$2,'finalized_independent_fact_changed',$3) RETURNING id`,
      [ref.chainId, { subject: ref.txHash, ...evidence }, recordedBy],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('chain_invalidation_write_failed');
    return { status: 'invalidated' as const, invalidationId: id, dependentReviewRequired: true as const };
  });
}
