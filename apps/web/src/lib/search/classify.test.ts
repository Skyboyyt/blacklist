import { describe, expect, it } from 'vitest';
import { classifyInput } from './classify';

const evm = `0x${'Ab'.repeat(20)}`;
const evmTx = `0x${'cd'.repeat(32)}`;
const solana = 'DemoWa11etBLackListFixture22222222222222222';

describe('classifyInput', () => {
  it('treats blank input as empty', () => {
    expect(classifyInput('   ')).toEqual({ kind: 'empty' });
  });

  it('detects and lowercases EVM addresses (canonical form)', () => {
    expect(classifyInput(`  ${evm} `)).toEqual({
      kind: 'address',
      chains: ['ethereum'],
      normalized: evm.toLowerCase(),
    });
  });

  it('detects EVM transaction hashes', () => {
    expect(classifyInput(evmTx)).toEqual({ kind: 'transaction', chain: 'ethereum', normalized: evmTx });
  });

  it('rejects malformed 0x input with guidance', () => {
    const result = classifyInput('0x1234');
    expect(result.kind).toBe('invalid');
  });

  it('never lowercases Solana addresses (case-sensitive)', () => {
    expect(classifyInput(solana)).toEqual({ kind: 'address', chains: ['solana'], normalized: solana });
  });

  it('detects Solana signatures', () => {
    const sig = `DemoSig${'2'.repeat(81)}`;
    expect(classifyInput(sig)).toEqual({ kind: 'transaction', chain: 'solana', normalized: sig });
  });

  it('asks the user to choose when 40 hex characters are also valid base58', () => {
    expect(classifyInput('b1acb1acb1acb1acb1acb1acb1acb1acb1acb1ac')).toEqual({
      kind: 'ambiguous_address',
      candidates: ['ethereum', 'solana'],
    });
  });

  it('treats unprefixed hex containing 0 as an Ethereum address only (0 is not base58)', () => {
    const value = 'b1ac000000000000000000000000000000000001';
    expect(classifyInput(value)).toEqual({ kind: 'address', chains: ['ethereum'], normalized: `0x${value}` });
  });

  it('reports unsupported networks and name services', () => {
    expect(classifyInput('bc1qexampleexampleexample')).toEqual({ kind: 'unsupported', network: 'Bitcoin' });
    expect(classifyInput('example.eth').kind).toBe('unsupported');
  });

  it('rejects overly long input and free text', () => {
    expect(classifyInput('a'.repeat(201)).kind).toBe('invalid');
    expect(classifyInput('send me your seed phrase').kind).toBe('invalid');
    expect(classifyInput('<script>alert(1)</script>').kind).toBe('invalid');
  });
});
