import type { ChainId, Address, TxHash } from '@blacklist/core';
import type { ChainSnapshot, VerificationReceipt } from '../types.ts';
import { fieldsDigest } from '../verification.ts';
/** UI-only float conveniences are excluded; raw integer amount/fee/balance fields remain intact. */
export function providerFieldsDigest(value: unknown): string {
  const sanitize = (item: unknown, depth: number): unknown => {
    if (depth > 40) throw new Error('comparison_fields_too_large');
    if (Array.isArray(item)) return item.map((v) => sanitize(v, depth + 1));
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([k]) => !['uiAmount', 'uiAmountString'].includes(k))
          .map(([k, v]) => [k, sanitize(v, depth + 1)]),
      );
    return item;
  };
  return fieldsDigest(sanitize(value, 0));
}
export function readReceipt(input: {
  chainId: ChainId;
  providerId: string;
  independenceGroup: string;
  capability: string;
  method: string;
  subject: Address | TxHash;
  params: Readonly<Record<string, string>>;
  commitment: string;
  snapshot: ChainSnapshot;
  finality: 'final' | 'pending';
  requestedAt: Date;
  fetchedAt: Date;
  normalizedFields: Readonly<Record<string, unknown>>;
  decoderVersion: string;
  comparisonSpecVersion: string;
}): VerificationReceipt {
  return { ...input, fieldsDigest: fieldsDigest(input.normalizedFields) };
}
