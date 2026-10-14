import { describe, expect, it } from 'vitest';
import { compareReceipts, canonicalFields, fieldsDigest, eligibleForPinning } from './verification.ts';
import { registry } from './registry.ts';
import { evmAdapter, solanaAdapter } from './adapters/identity.ts';
import type { VerificationReceipt } from './types.ts';

function receipt(overrides: Partial<VerificationReceipt> = {}): VerificationReceipt {
  const chain = registry.bySlug('ethereum');
  const subject = evmAdapter.parseAddress('0x0000000000000000000000000000000000000001');
  if (!chain || !subject) throw new Error('fixture_invalid');
  return {
    chainId: chain.chainId,
    providerId: 'node-a',
    independenceGroup: 'infra-a',
    capability: 'account_info',
    method: 'eth_getBalance',
    subject,
    params: { address: subject },
    commitment: 'finalized',
    snapshot: { kind: 'evm_block', blockNumber: '10', blockHash: '0x' + 'a'.repeat(64) },
    finality: 'final',
    requestedAt: new Date('2026-10-01T00:00:00Z'),
    fetchedAt: new Date('2026-10-01T00:00:01Z'),
    fieldsDigest: fieldsDigest({ balance: '9007199254740993' }),
    normalizedFields: { balance: '9007199254740993' },
    decoderVersion: 'evm-v1',
    comparisonSpecVersion: 'account-v1',
    ...overrides,
  };
}
describe('snapshot-bound independent verification', () => {
  it('canonicalizes nested keys deterministically without losing integer strings', () => {
    expect(canonicalFields({ z: [{ b: 2, a: '9007199254740993' }], a: 1 })).toBe(
      '{"a":1,"z":[{"a":"9007199254740993","b":2}]}',
    );
    expect(fieldsDigest({ a: 1, b: 2 })).toBe(fieldsDigest({ b: 2, a: 1 }));
    for (const value of [NaN, Infinity, undefined, { token: undefined }, 9007199254740992, new Date()])
      expect(() => canonicalFields(value)).toThrow();
  });
  it('requires independent providers, same subject/spec/finality and a genuine matching snapshot', () => {
    const a = receipt(),
      b = receipt({ providerId: 'node-b', independenceGroup: 'infra-b' });
    expect(compareReceipts(a, b)).toBe('agree');
    expect(eligibleForPinning(a, b)).toBe(true);
    expect(compareReceipts(a, receipt({ providerId: 'node-b' }))).toBe('unavailable');
    expect(compareReceipts(a, receipt({ independenceGroup: 'infra-b' }))).toBe('unavailable');
    expect(
      compareReceipts(
        a,
        receipt({ providerId: 'node-b', independenceGroup: 'infra-b', finality: 'pending' }),
      ),
    ).toBe('unavailable');
    expect(compareReceipts(a, { ...b, comparisonSpecVersion: 'account-v2' })).toBe('unavailable');
    expect(compareReceipts(a, { ...b, fieldsDigest: 'f'.repeat(64) })).toBe('unavailable');
  });
  it('distinguishes genuine same-snapshot conflict from different snapshots', () => {
    const a = receipt(),
      b = receipt({
        providerId: 'node-b',
        independenceGroup: 'infra-b',
        normalizedFields: { balance: '2' },
        fieldsDigest: fieldsDigest({ balance: '2' }),
      });
    expect(compareReceipts(a, b)).toBe('conflict');
    expect(eligibleForPinning(a, b)).toBe(false);
    expect(
      compareReceipts(a, {
        ...b,
        snapshot: { kind: 'evm_block', blockNumber: '11', blockHash: '0x' + 'b'.repeat(64) },
      }),
    ).toBe('inconclusive_snapshot_mismatch');
  });
  it('never equates equal-valued Solana account reads at different context slots', () => {
    const chain = registry.bySlug('solana'),
      subject = solanaAdapter.parseAddress('1'.repeat(32));
    if (!chain || !subject) throw new Error('fixture_invalid');
    const a = receipt({
      chainId: chain.chainId,
      subject,
      params: { address: subject },
      snapshot: { kind: 'solana_context', contextSlot: '100' },
    });
    const b = {
      ...a,
      providerId: 'node-b',
      independenceGroup: 'infra-b',
      snapshot: { kind: 'solana_context' as const, contextSlot: '101' },
    };
    expect(compareReceipts(a, b)).toBe('inconclusive_snapshot_mismatch');
    expect(eligibleForPinning(a, b)).toBe(false);
    expect(compareReceipts(a, { ...b, snapshot: a.snapshot })).toBe('agree');
  });
  it('requires finalized Solana transaction receipts to bind the same signature and slot', () => {
    const chain = registry.bySlug('solana'),
      subject = solanaAdapter.parseTxHash('1'.repeat(64)),
      wrongSubject = solanaAdapter.parseAddress('1'.repeat(32));
    if (!chain || !subject || !wrongSubject) throw new Error('fixture_invalid');
    const a = receipt({
      chainId: chain.chainId,
      subject,
      capability: 'transaction',
      method: 'getTransaction',
      snapshot: { kind: 'solana_transaction', signature: subject, slot: '100' },
    });
    const b = { ...a, providerId: 'node-b', independenceGroup: 'infra-b' };
    expect(compareReceipts(a, b)).toBe('agree');
    expect(
      compareReceipts(a, { ...b, snapshot: { kind: 'solana_transaction', signature: subject, slot: '101' } }),
    ).toBe('inconclusive_snapshot_mismatch');
    expect(compareReceipts(a, { ...b, subject: wrongSubject })).toBe('unavailable');
    expect(compareReceipts({ ...a, capability: 'account_info' }, { ...b, capability: 'account_info' })).toBe(
      'unavailable',
    );
  });
});
