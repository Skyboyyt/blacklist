import { z } from 'zod';
import { keccak256, toHex } from 'viem';
import type { Address, ChainId } from '@blacklist/core';
import type { NormalizedTransaction, AssetTransfer } from '../types.ts';
import { evmAdapter } from './identity.ts';
import { ProviderFault } from '../providers/rpc-transport.ts';

export const hexQuantity = z
  .string()
  .regex(/^0x(?:0|[1-9a-f][\da-f]*)$/u)
  .max(66);
const address = z.string().refine((v) => evmAdapter.parseAddress(v) !== null);
export const hash = z.string().regex(/^0x[\da-f]{64}$/u);
const hexData = z
  .string()
  .regex(/^0x(?:[\da-f]{2})*$/u)
  .max(2 * 1024 * 1024);
export const evmTransactionSchema = z.object({
  hash,
  from: address,
  to: address.nullable(),
  value: hexQuantity,
  input: hexData,
  blockHash: hash.nullable(),
  blockNumber: hexQuantity.nullable(),
  transactionIndex: hexQuantity.nullable(),
});
export const evmReceiptSchema = z.object({
  transactionHash: hash,
  blockHash: hash,
  blockNumber: hexQuantity,
  transactionIndex: hexQuantity,
  status: z.enum(['0x0', '0x1']),
  gasUsed: hexQuantity,
  effectiveGasPrice: hexQuantity,
  logs: z
    .array(
      z.object({
        address,
        topics: z.array(hash).max(4),
        data: hexData,
        logIndex: hexQuantity,
        transactionHash: hash,
        blockHash: hash,
        removed: z.boolean().optional(),
      }),
    )
    .max(10000),
});
const TRANSFER = keccak256(toHex('Transfer(address,address,uint256)'));
const canonicalAddress = (value: string): Address => {
  const parsed = evmAdapter.parseAddress(value);
  if (!parsed) throw new ProviderFault('invalid_response');
  return parsed;
};
const topicAddress = (value: string): Address => {
  if (!/^0x0{24}[\da-f]{40}$/u.test(value)) throw new ProviderFault('invalid_response');
  return canonicalAddress('0x' + value.slice(-40));
};
/** Pure decoding. knownAssets is an independently obtained asset classification, never inferred from a log name. */
export function decodeEvmTransaction(
  chainId: ChainId,
  transaction: unknown,
  receipt: unknown,
  blockTime: Date,
  knownAssets: ReadonlySet<Address> = new Set(),
): NormalizedTransaction {
  const tx = evmTransactionSchema.parse(transaction),
    r = evmReceiptSchema.parse(receipt);
  if (
    tx.hash !== r.transactionHash ||
    tx.blockHash !== r.blockHash ||
    tx.blockNumber !== r.blockNumber ||
    tx.transactionIndex !== r.transactionIndex ||
    !Number.isFinite(blockTime.getTime())
  )
    throw new ProviderFault('invalid_response');
  const txHash = evmAdapter.parseTxHash(tx.hash);
  if (!txHash) throw new ProviderFault('invalid_response');
  const from = canonicalAddress(tx.from),
    to = tx.to ? canonicalAddress(tx.to) : null;
  const transfers: AssetTransfer[] = [];
  const ordinals = new Set<string>();
  if (r.status === '0x1') {
    if (to && BigInt(tx.value) > 0n)
      transfers.push({
        ordinal: 'native',
        from,
        to,
        asset: { kind: 'native' },
        amountRaw: BigInt(tx.value).toString(),
        transferKind: 'native',
        emitter: from,
        evidenceLevel: 'native_consensus',
        authorization: 'subject_signed_direct',
        authority: from,
        topLevel: true,
      });
    for (const log of r.logs) {
      if (log.removed || log.blockHash !== r.blockHash || log.transactionHash !== tx.hash)
        throw new ProviderFault('invalid_response');
      const ordinal = BigInt(log.logIndex).toString();
      if (ordinals.has(ordinal)) throw new ProviderFault('invalid_response');
      ordinals.add(ordinal);
      if (log.topics[0] !== TRANSFER || log.topics.length !== 3 || !/^0x[\da-f]{64}$/u.test(log.data))
        continue;
      const sender = topicAddress(log.topics[1] ?? ''),
        recipient = topicAddress(log.topics[2] ?? ''),
        emitter = canonicalAddress(log.address);
      const evidenceLevel = knownAssets.has(emitter) ? 'asset_contract_log' : 'observed_log';
      let authorization: AssetTransfer['authorization'] = 'unknown';
      let authority: Address | null = null;
      const direct =
        /^0xa9059cbb[\da-f]{128}$/u.test(tx.input) &&
        tx.to?.toLowerCase() === emitter &&
        sender === from &&
        '0x' + tx.input.slice(34, 74) === recipient &&
        BigInt('0x' + tx.input.slice(74)) === BigInt(log.data);
      const transferFromCall =
        /^0x23b872dd[\da-f]{192}$/u.test(tx.input) &&
        tx.to?.toLowerCase() === emitter &&
        '0x' + tx.input.slice(34, 74) === sender &&
        '0x' + tx.input.slice(98, 138) === recipient &&
        BigInt('0x' + tx.input.slice(138)) === BigInt(log.data);
      // Delegation is a third party moving the owner's tokens (chain-data §2.3). The owner
      // calling transferFrom on their own balance fits neither rule, so it stays unknown.
      const delegated = transferFromCall && sender !== from;
      if (evidenceLevel === 'asset_contract_log' && direct) {
        authorization = 'subject_signed_direct';
        authority = from;
      } else if (evidenceLevel === 'asset_contract_log' && delegated) {
        authorization = 'delegated';
        authority = from;
      }
      transfers.push({
        ordinal,
        from: sender,
        to: recipient,
        asset: { kind: 'token', address: emitter },
        amountRaw: BigInt(log.data).toString(),
        transferKind: 'fungible',
        emitter,
        evidenceLevel,
        authorization,
        authority,
        topLevel: direct || transferFromCall,
      });
    }
  }
  return {
    chainId,
    txHash,
    block: BigInt(r.blockNumber).toString(),
    blockHash: r.blockHash,
    blockTime,
    status: r.status === '0x1' ? 'success' : 'failed',
    feeRaw: (BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice)).toString(),
    signers: [from],
    transfers,
    invoked: to ? [to] : [],
  };
}
