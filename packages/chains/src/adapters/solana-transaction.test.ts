import { describe, it, expect } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import { decodeSolanaTransaction, TOKEN_PROGRAM, TOKEN_2022 } from './solana-transaction.ts';
import { solanaAdapter } from './identity.ts';
import { registry } from '../registry.ts';
const encode = getBase58Decoder();
const key = (n: number) => encode.decode(new Uint8Array(32).fill(n));
const payer = key(1),
  owner = key(2),
  source = key(3),
  destination = key(4),
  mint = key(5),
  delegate = key(6);
const chain = registry.bySlug('solana'),
  signature = solanaAdapter.parseTxHash('1'.repeat(64));
if (!chain || !signature) throw new Error('fixture_invalid');
const chainId = chain.chainId,
  txHash = signature;
const instruction = {
  programId: TOKEN_PROGRAM,
  parsed: {
    type: 'transferChecked',
    info: { source, destination, authority: owner, mint, tokenAmount: { amount: '9007199254740993' } },
  },
};
const balance = (accountIndex: number, amount: string, tokenOwner = owner) => ({
  accountIndex,
  mint,
  owner: tokenOwner,
  uiTokenAmount: { amount, decimals: 9 },
});
function payload(authority = owner, programId = TOKEN_PROGRAM, inner = false) {
  const ix = {
    ...instruction,
    programId,
    parsed: { ...instruction.parsed, info: { ...instruction.parsed.info, authority } },
  };
  return {
    slot: 123,
    blockTime: 1700000000,
    version: 0,
    transaction: {
      signatures: [txHash, txHash],
      message: {
        accountKeys: [
          { pubkey: payer, signer: true, writable: true },
          { pubkey: authority, signer: true, writable: false },
          { pubkey: source, signer: false, writable: true },
          { pubkey: destination, signer: false, writable: true },
        ],
        instructions: inner ? [] : [ix],
      },
    },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [10000, 0, 0, 0],
      postBalances: [5000, 0, 0, 0],
      preTokenBalances: [balance(2, '9007199254740993'), balance(3, '0')],
      postTokenBalances: [balance(2, '0'), balance(3, '9007199254740993')],
      innerInstructions: inner ? [{ index: 0, instructions: [ix] }] : [],
    },
  };
}
describe('historical Solana authority and transaction-scoped movements', () => {
  it('uses source-token owner and preserves amounts; fee payer is not the authority', () => {
    const data = decodeSolanaTransaction(chainId, txHash, payload());
    expect(data.feeRaw).toBe('5000');
    expect(data.transfers[0]).toMatchObject({
      amountRaw: '9007199254740993',
      authority: owner,
      evidenceLevel: 'balance_verified',
      authorization: 'subject_signed_direct',
    });
    expect(data.transfers[0]?.authority).not.toBe(payer);
  });
  it('recognizes signer delegation, including Token2022, and CPI program control', () => {
    expect(decodeSolanaTransaction(chainId, txHash, payload(delegate)).transfers[0]?.authorization).toBe(
      'delegated',
    );
    expect(
      decodeSolanaTransaction(chainId, txHash, payload(delegate, TOKEN_2022)).transfers[0]?.authorization,
    ).toBe('delegated');
    expect(
      decodeSolanaTransaction(chainId, txHash, payload(owner, TOKEN_PROGRAM, true)).transfers[0],
    ).toMatchObject({ authorization: 'protocol', topLevel: false });
  });
  it('never upgrades multiple movements or attributes absent historical ownership', () => {
    const multiple = payload();
    multiple.transaction.message.instructions.push(instruction);
    expect(
      decodeSolanaTransaction(chainId, txHash, multiple).transfers.every(
        (t) => t.evidenceLevel === 'observed_log' && t.authorization === 'unknown',
      ),
    ).toBe(true);
    const missing = payload();
    const pre = missing.meta.preTokenBalances.map(({ owner: _owner, ...item }) => item);
    expect(
      decodeSolanaTransaction(chainId, txHash, {
        ...missing,
        meta: { ...missing.meta, preTokenBalances: pre },
      }).transfers[0]?.authorization,
    ).toBe('unknown');
  });
  it('does not create successful movements for failed or malformed transactions', () => {
    const value = payload();
    expect(
      decodeSolanaTransaction(chainId, txHash, {
        ...value,
        meta: { ...value.meta, err: { InstructionError: [0, 'Custom'] } },
      }).transfers,
    ).toEqual([]);
    expect(() => decodeSolanaTransaction(chainId, txHash, { ...value, version: 1 })).toThrow();
    expect(() => decodeSolanaTransaction(chainId, txHash, { ...value, slot: 9007199254740992 })).toThrow();
    expect(() =>
      decodeSolanaTransaction(chainId, txHash, { ...value, meta: { ...value.meta, preBalances: [] } }),
    ).toThrow();
    expect(() => decodeSolanaTransaction(chainId, txHash, { ...value, blockTime: null })).toThrow();
  });
});
