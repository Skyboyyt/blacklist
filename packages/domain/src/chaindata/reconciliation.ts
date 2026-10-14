import type { DatabaseRuntime } from '@blacklist/db';
import type { ChainTxRef } from '@blacklist/core';
import { canonicalFields, compareReceipts, type ChainDataService } from '@blacklist/chains';
import type { OperatorActor } from '../access/types.ts';
import { DomainError } from '../shared/errors.ts';
import { recordChainRead, recordChainConflict } from './repository.ts';
import { readPinnedTransaction, completePinnedReconciliation } from './reconciliation-repository.ts';

/** On-demand operator reconciliation only. No scheduler, wallet monitor or public mutation. */
export async function reconcilePinnedTransaction(
  runtime: DatabaseRuntime,
  chains: Pick<ChainDataService, 'getTransaction'>,
  actor: OperatorActor,
  ref: ChainTxRef,
  signal?: AbortSignal,
) {
  if (actor.kind !== 'cli') throw new DomainError('forbidden');
  const pinned = await readPinnedTransaction(runtime, ref);
  if (!pinned) return { status: 'not_pinned' as const };
  // An agreeing later read never clears an append-only invalidation/review barrier.
  if (pinned.invalidation_id)
    return {
      status: 'invalidated' as const,
      invalidationId: pinned.invalidation_id,
      dependentReviewRequired: true as const,
    };
  const result = await chains.getTransaction(ref, { minFinality: 'final', crossVerify: true, signal });
  if (!result.ok) {
    if (result.error.kind === 'data_conflict')
      await recordChainConflict(runtime, 'transaction', ref.txHash, ref.chainId, result.error);
    return { status: 'unavailable' as const, reason: result.error.kind };
  }
  const value = result.value,
    [a, b] = value.provenance.receipts ?? [];
  if (
    !a ||
    !b ||
    !value.data ||
    value.provenance.degraded ||
    value.provenance.finality !== 'final' ||
    value.provenance.verification !== 'agree' ||
    compareReceipts(a, b) !== 'agree' ||
    a.subject !== ref.txHash ||
    a.chainId !== ref.chainId ||
    a.capability !== 'transaction' ||
    value.data.chainId !== ref.chainId ||
    value.data.txHash !== ref.txHash ||
    canonicalFields(value.provenance.snapshot) !== canonicalFields(a.snapshot) ||
    a.decoderVersion !== pinned.decoder_version
  )
    return { status: 'unavailable' as const, reason: 'independent_finalized_reconciliation_required' };
  const normalized = { ...value.data, blockTime: value.data.blockTime?.toISOString() ?? null };
  const snapshot = a.snapshot;
  if (
    (snapshot.kind === 'evm_block' &&
      (value.data.block !== snapshot.blockNumber || value.data.blockHash !== snapshot.blockHash)) ||
    (snapshot.kind === 'solana_transaction' &&
      (value.data.block !== snapshot.slot || value.data.txHash !== snapshot.signature)) ||
    snapshot.kind === 'solana_context'
  )
    return { status: 'unavailable' as const, reason: 'receipt_snapshot_mismatch' };
  // A forged service provenance label cannot authorize invalidation or a different payload.
  if (canonicalFields(normalized) !== canonicalFields(a.normalizedFields['normalizedTransaction']))
    return { status: 'unavailable' as const, reason: 'receipt_payload_mismatch' };
  await recordChainRead(runtime, 'transaction', ref.txHash, value, ref.chainId);
  const consistent = canonicalFields(normalized) === canonicalFields(pinned.normalized);
  // Later-phase signal/finding services are absent. Do not claim retraction/review was executed.
  // Recheck the barrier under the writer's same lock after RPC; never hold a DB lock during network I/O.
  return completePinnedReconciliation(
    runtime,
    ref,
    actor.actorRef,
    consistent ? null : { receiptDigests: [a.fieldsDigest, b.fieldsDigest] },
  );
}
