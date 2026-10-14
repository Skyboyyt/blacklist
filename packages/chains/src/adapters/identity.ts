import type { Address, TxHash } from '@blacklist/core';
import { getAddress, isAddress } from 'viem';
import { getBase58Encoder } from '@solana/kit';
import type { ChainFamilyAdapter } from '../ports.ts';

const base58 = getBase58Encoder();
function solanaValue(input: string, length: number): boolean {
  if (input.length > 90 || !/^[1-9A-HJ-NP-Za-km-z]+$/u.test(input)) return false;
  try {
    return base58.encode(input).length === length;
  } catch {
    return false;
  }
}
function classify(adapter: ChainFamilyAdapter, input: string) {
  const address = adapter.parseAddress(input);
  if (address) return { kind: 'address' as const, family: adapter.family, address };
  const txHash = adapter.parseTxHash(input);
  return txHash
    ? { kind: 'transaction' as const, family: adapter.family, txHash }
    : { kind: 'unrecognized' as const };
}
// Family adapters are the only constructors of address/transaction brands.
export const evmAdapter: ChainFamilyAdapter = Object.freeze({
  family: 'evm',
  parseAddress: (input: string) =>
    /^0x[\da-fA-F]{40}$/u.test(input) && isAddress(input, { strict: true })
      ? (input.toLowerCase() as Address)
      : null,
  parseTxHash: (input: string) =>
    /^0x[\da-fA-F]{64}$/u.test(input) ? (input.toLowerCase() as TxHash) : null,
  formatAddress: (address: Address) => getAddress(address),
  classifyInput: (input: string) => classify(evmAdapter, input),
});
export const solanaAdapter: ChainFamilyAdapter = Object.freeze({
  family: 'solana',
  parseAddress: (input: string) => (solanaValue(input, 32) ? (input as Address) : null),
  parseTxHash: (input: string) => (solanaValue(input, 64) ? (input as TxHash) : null),
  formatAddress: (address: Address) => address,
  classifyInput: (input: string) => classify(solanaAdapter, input),
});
