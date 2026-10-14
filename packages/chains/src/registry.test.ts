import { describe, expect, it } from 'vitest';
import { registry } from './registry.ts';
import { evmAdapter, solanaAdapter } from './adapters/identity.ts';

describe('mainnet registry and family identity', () => {
  it('resolves only explicit mainnets; never chooses a network for an EVM address', () => {
    expect(registry.list().map((c) => c.chainId)).toEqual([
      'eip155:1',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    ]);
    expect(registry.bySlug('ethereum')?.finality.final).toBe('finalized');
    expect(registry.bySlug('solana')?.nativeDecimals).toBe(9);
    expect(registry.bySlug('')).toBeNull();
    expect(registry.byId('eip155:11155111')).toBeNull();
    expect(evmAdapter.classifyInput('0x0000000000000000000000000000000000000001')).toMatchObject({
      kind: 'address',
      family: 'evm',
    });
    expect(evmAdapter.classifyInput('ethereum:0x0000000000000000000000000000000000000001')).toEqual({
      kind: 'unrecognized',
    });
  });
  it('enforces mixed-case EIP55, canonical storage and checksummed display', () => {
    const valid = '0x52908400098527886E0F7030069857D2E4169EE7';
    const address = evmAdapter.parseAddress(valid);
    expect(address).toBe(valid.toLowerCase());
    if (!address) throw new Error('fixture_invalid');
    expect(evmAdapter.formatAddress(address)).toBe(valid);
    expect(evmAdapter.parseAddress('0x52908400098527886E0F7030069857D2E4169Ee7')).toBeNull();
    for (const value of ['', '0x1', ' 0x0000000000000000000000000000000000000001', '0x' + 'g'.repeat(40)])
      expect(evmAdapter.parseAddress(value)).toBeNull();
    expect(evmAdapter.parseTxHash('0x' + 'AB'.repeat(32))).toBe('0x' + 'ab'.repeat(32));
    expect(evmAdapter.parseTxHash('0x' + 'ab'.repeat(31))).toBeNull();
  });
  it('preserves Solana base58 case and requires exact decoded lengths', () => {
    const pubkey = 'So11111111111111111111111111111111111111112';
    expect(solanaAdapter.parseAddress(pubkey)).toBe(pubkey);
    expect(solanaAdapter.parseAddress('1'.repeat(32))).toBe('1'.repeat(32));
    expect(solanaAdapter.parseAddress('1'.repeat(31))).toBeNull();
    expect(solanaAdapter.parseAddress('0'.repeat(32))).toBeNull();
    expect(solanaAdapter.parseAddress(pubkey.toLowerCase())).not.toBe(pubkey);
    expect(solanaAdapter.parseTxHash('1'.repeat(64))).toBe('1'.repeat(64));
    expect(solanaAdapter.parseTxHash('1'.repeat(63))).toBeNull();
    expect(solanaAdapter.parseTxHash('1'.repeat(64) + ' ')).toBeNull();
    expect(solanaAdapter.classifyInput('1'.repeat(64))).toMatchObject({
      kind: 'transaction',
      family: 'solana',
    });
  });
});
