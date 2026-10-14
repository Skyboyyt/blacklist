import { createHash } from 'node:crypto';
import type { VerificationReceipt, VerificationResult, ChainSnapshot } from './types.ts';
import { registry } from './registry.ts';
import { evmAdapter, solanaAdapter } from './adapters/identity.ts';

/** JSON comparison encoding: sorted object keys, array order preserved, no lossy numbers. */
export function canonicalFields(value: unknown): string {
  let nodes = 0;
  const encode = (item: unknown, depth: number): string => {
    if (++nodes > 100000 || depth > 40) throw new Error('comparison_fields_too_large');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isSafeInteger(item)) return JSON.stringify(item);
    if (Array.isArray(item)) return '[' + item.map((v) => encode(v, depth + 1)).join(',') + ']';
    if (typeof item === 'object' && item !== null && Object.getPrototypeOf(item) === Object.prototype)
      return (
        '{' +
        Object.keys(item)
          .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
          .map((k) => JSON.stringify(k) + ':' + encode(Reflect.get(item, k), depth + 1))
          .join(',') +
        '}'
      );
    throw new Error('comparison_fields_invalid');
  };
  const result = encode(value, 0);
  if (Buffer.byteLength(result) > 1048576) throw new Error('comparison_fields_too_large');
  return result;
}
export const fieldsDigest = (value: unknown): string =>
  createHash('sha256').update(canonicalFields(value)).digest('hex');
const decimal = (v: string) => /^(0|[1-9]\d*)$/u.test(v) && v.length <= 78;
function validSnapshot(snapshot: ChainSnapshot, family: 'evm' | 'solana'): boolean {
  if (snapshot.kind === 'evm_block')
    return family === 'evm' && decimal(snapshot.blockNumber) && /^0x[\da-f]{64}$/u.test(snapshot.blockHash);
  if (snapshot.kind === 'solana_context') return family === 'solana' && decimal(snapshot.contextSlot);
  return (
    family === 'solana' && decimal(snapshot.slot) && solanaAdapter.parseTxHash(snapshot.signature) !== null
  );
}
function valid(receipt: VerificationReceipt): boolean {
  try {
    const chain = registry.byId(receipt.chainId);
    if (!chain || !validSnapshot(receipt.snapshot, chain.family)) return false;
    const adapter = chain.family === 'evm' ? evmAdapter : solanaAdapter;
    if (
      ![
        'account_info',
        'transaction',
        'address_history',
        'balances',
        'token_metadata',
        'contract_source',
      ].includes(receipt.capability)
    )
      return false;
    if (
      receipt.capability === 'transaction' &&
      chain.family === 'solana' &&
      (receipt.snapshot.kind !== 'solana_transaction' || receipt.snapshot.signature !== receipt.subject)
    )
      return false;
    if (
      receipt.capability !== 'transaction' &&
      chain.family === 'solana' &&
      receipt.snapshot.kind !== 'solana_context'
    )
      return false;
    return (
      !!(receipt.capability === 'transaction'
        ? adapter.parseTxHash(receipt.subject)
        : adapter.parseAddress(receipt.subject)) &&
      /^[a-z0-9_-]{1,64}$/u.test(receipt.providerId) &&
      /^[a-z0-9_-]{1,64}$/u.test(receipt.independenceGroup) &&
      receipt.independenceGroup !== 'unknown-upstream' &&
      Number.isFinite(receipt.requestedAt.getTime()) &&
      Number.isFinite(receipt.fetchedAt.getTime()) &&
      receipt.fetchedAt >= receipt.requestedAt &&
      /^[\da-f]{64}$/u.test(receipt.fieldsDigest) &&
      receipt.fieldsDigest === fieldsDigest(receipt.normalizedFields)
    );
  } catch {
    return false;
  }
}
export function compareReceipts(a: VerificationReceipt, b: VerificationReceipt): VerificationResult {
  if (
    !valid(a) ||
    !valid(b) ||
    a.chainId !== b.chainId ||
    a.subject !== b.subject ||
    a.capability !== b.capability ||
    a.method !== b.method ||
    a.decoderVersion !== b.decoderVersion ||
    a.comparisonSpecVersion !== b.comparisonSpecVersion ||
    a.providerId === b.providerId ||
    a.independenceGroup === b.independenceGroup ||
    a.finality !== 'final' ||
    b.finality !== 'final' ||
    a.commitment !== 'finalized' ||
    b.commitment !== 'finalized'
  )
    return 'unavailable';
  if (canonicalFields(a.snapshot) !== canonicalFields(b.snapshot)) return 'inconclusive_snapshot_mismatch';
  return a.fieldsDigest === b.fieldsDigest ? 'agree' : 'conflict';
}
export const eligibleForPinning = (a: VerificationReceipt, b: VerificationReceipt): boolean =>
  compareReceipts(a, b) === 'agree';
