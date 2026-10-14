import { createNetworkCheck } from './network-check.ts';
import { z } from 'zod';
import type { ChainAddress, ChainTxRef } from '@blacklist/core';
import type {
  AccountInfoSource,
  TransactionSource,
  TokenMetadataSource,
  ContractSourceSource,
  ProviderCapability,
  ProviderCallOptions,
  AddressHistorySource,
  BalanceSource,
} from '../ports.ts';
import type { AccountInfo, NormalizedTransaction, Sourced, ChainSnapshot } from '../types.ts';
import { registry } from '../registry.ts';
import { evmAdapter } from '../adapters/identity.ts';
import {
  decodeEvmTransaction,
  evmTransactionSchema,
  evmReceiptSchema,
  hexQuantity,
  hash,
} from '../adapters/evm-transaction.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { readReceipt } from './read-receipt.ts';
import { createEvmMetadataReader } from './evm-metadata.ts';
import { createAlchemyHistory } from './alchemy-history.ts';
import { createAlchemyBalances } from './alchemy-balances.ts';
const blockSchema = z.object({ number: hexQuantity, hash, timestamp: hexQuantity });
const codeSchema = z
  .string()
  .regex(/^0x(?:[\da-f]{2})*$/u)
  .max(2 * 1024 * 1024);
const chain = registry.bySlug('ethereum');
if (!chain) throw new Error('mainnet_registry_missing');
const ethereumId = chain.chainId;
const decoderVersion = 'evm-rpc-v1';
export function createEvmRpcSource(
  id: string,
  independenceGroup: string,
  rpc: RpcTransport,
  completeTransactionHistory = false,
  indexedHistoryVerified = false,
  indexedBalancesVerified = false,
): AccountInfoSource &
  TransactionSource &
  TokenMetadataSource &
  ContractSourceSource &
  AddressHistorySource &
  BalanceSource {
  const metadata = createEvmMetadataReader(id, independenceGroup, rpc);
  const history = createAlchemyHistory(id, rpc);
  const balances = createAlchemyBalances(id, rpc);
  const network = createNetworkCheck(rpc, 'eth_chainId', '0x1');
  function provenance(snapshot: ChainSnapshot, finality: 'pending' | 'final', fetchedAt: Date) {
    return {
      providerId: id,
      fetchedAt,
      snapshot,
      finality,
      decoderVersion,
      verification: 'single_source' as const,
      degraded: false,
    };
  }
  async function anchor(options: ProviderCallOptions) {
    if (!['latest', 'finalized'].includes(options.commitment)) throw new ProviderFault('not_supported');
    const head = await rpc.call(
      'eth_getBlockByNumber',
      [options.commitment, false],
      blockSchema,
      options.signal,
    );
    const block = options.blockHash
      ? await rpc.call('eth_getBlockByHash', [options.blockHash, false], blockSchema, options.signal)
      : head;
    if (options.blockHash && block.hash !== options.blockHash) throw new ProviderFault('invalid_response');
    const canonical = await rpc.call(
      'eth_getBlockByNumber',
      [block.number, false],
      blockSchema,
      options.signal,
    );
    if (
      canonical.hash !== block.hash ||
      canonical.number !== block.number ||
      BigInt(block.number) > BigInt(head.number)
    )
      throw new ProviderFault('invalid_response');
    return block;
  }
  return {
    id,
    independenceGroup,
    supports: (chainId, capability: ProviderCapability) =>
      chainId === ethereumId &&
      (['account_info', 'transaction', 'token_metadata', 'contract_source'].includes(capability) ||
        (indexedHistoryVerified && capability === 'address_history') ||
        (indexedBalancesVerified && capability === 'balances')),
    async fetchBalances(ref, options) {
      if (!indexedBalancesVerified) throw new ProviderFault('not_supported');
      return balances(ref, options);
    },
    fetchAddressHistory: async (ref, query, options) => {
      if (!indexedHistoryVerified) throw new ProviderFault('not_supported');
      return history(ref, query, options);
    },
    fetchTokenInfo: metadata.token,
    fetchContractInfo: metadata.contract,
    async fetchAccountInfo(
      ref: ChainAddress,
      options: ProviderCallOptions,
    ): Promise<Sourced<AccountInfo | null>> {
      if (ref.chainId !== ethereumId || !evmAdapter.parseAddress(ref.address))
        throw new ProviderFault('not_supported');
      const requestedAt = new Date();
      await network(options.signal);
      const block = await anchor(options),
        selector = { blockHash: block.hash, requireCanonical: true };
      const [balance, code] = await Promise.all([
        rpc.call('eth_getBalance', [ref.address, selector], hexQuantity, options.signal),
        rpc.call('eth_getCode', [ref.address, selector], codeSchema, options.signal),
      ]);
      const delegated = /^0xef0100[\da-f]{40}$/u.test(code)
        ? evmAdapter.parseAddress('0x' + code.slice(8))
        : null;
      const snapshot: ChainSnapshot = {
        kind: 'evm_block',
        blockNumber: BigInt(block.number).toString(),
        blockHash: block.hash,
      };
      const source = provenance(
        snapshot,
        options.commitment === 'finalized' ? 'final' : 'pending',
        new Date(),
      );
      return {
        data: {
          chainId: ref.chainId,
          address: ref.address,
          nativeBalanceRaw: BigInt(balance).toString(),
          kind: code === '0x' ? 'eoa' : delegated ? 'eoa_delegated' : 'contract',
          ...(delegated ? { delegateAddress: delegated } : {}),
        },
        provenance: {
          ...source,
          receipts: [
            readReceipt({
              chainId: ref.chainId,
              providerId: id,
              independenceGroup,
              capability: 'account_info',
              method: 'eth_getBalance',
              subject: ref.address,
              params: { address: ref.address, blockHash: block.hash, requireCanonical: 'true' },
              commitment: options.commitment,
              snapshot,
              finality: source.finality,
              requestedAt,
              fetchedAt: source.fetchedAt,
              normalizedFields: { balanceRaw: BigInt(balance).toString(), code },
              decoderVersion,
              comparisonSpecVersion: 'evm-account-v1',
            }),
          ],
        },
      };
    },
    async fetchTransaction(
      ref: ChainTxRef,
      options: ProviderCallOptions,
    ): Promise<Sourced<NormalizedTransaction | null>> {
      if (ref.chainId !== ethereumId || !evmAdapter.parseTxHash(ref.txHash))
        throw new ProviderFault('not_supported');
      const requestedAt = new Date();
      await network(options.signal);
      const [tx, receipt] = await Promise.all([
        rpc.call('eth_getTransactionByHash', [ref.txHash], evmTransactionSchema.nullable(), options.signal),
        rpc.call('eth_getTransactionReceipt', [ref.txHash], evmReceiptSchema.nullable(), options.signal),
      ]);
      const finalHead = await rpc.call(
        'eth_getBlockByNumber',
        ['finalized', false],
        blockSchema,
        options.signal,
      );
      if (!tx && !receipt) {
        if (!completeTransactionHistory) throw new ProviderFault('history_pruned');
        return {
          data: null,
          provenance: provenance(
            {
              kind: 'evm_block',
              blockNumber: BigInt(finalHead.number).toString(),
              blockHash: finalHead.hash,
            },
            'final',
            new Date(),
          ),
        };
      }
      // No execution status exists for a mempool transaction; never fabricate "success".
      if (!tx || !receipt) throw new ProviderFault('unavailable');
      if (tx.hash !== ref.txHash || (options.blockHash && receipt.blockHash !== options.blockHash))
        throw new ProviderFault('invalid_response');
      const block = await rpc.call(
        'eth_getBlockByNumber',
        [receipt.blockNumber, false],
        blockSchema,
        options.signal,
      );
      if (block.hash !== receipt.blockHash || block.number !== receipt.blockNumber)
        throw new ProviderFault('invalid_response');
      const finality = BigInt(receipt.blockNumber) <= BigInt(finalHead.number) ? 'final' : 'pending';
      if (options.commitment === 'finalized' && finality !== 'final') throw new ProviderFault('unavailable');
      const seconds = BigInt(block.timestamp);
      if (seconds > 8640000000000n) throw new ProviderFault('invalid_response');
      const data = decodeEvmTransaction(ref.chainId, tx, receipt, new Date(Number(seconds) * 1000));
      const snapshot: ChainSnapshot = {
        kind: 'evm_block',
        blockNumber: BigInt(receipt.blockNumber).toString(),
        blockHash: receipt.blockHash,
      };
      const source = provenance(snapshot, finality, new Date());
      return {
        data,
        provenance: {
          ...source,
          receipts: [
            readReceipt({
              chainId: ref.chainId,
              providerId: id,
              independenceGroup,
              capability: 'transaction',
              method: 'eth_getTransactionReceipt',
              subject: ref.txHash,
              params: {
                transaction: ref.txHash,
                blockHash: receipt.blockHash,
                finalizedHead: BigInt(finalHead.number).toString(),
                requestedCommitment: options.commitment,
              },
              commitment: finality === 'final' ? 'finalized' : options.commitment,
              snapshot,
              finality,
              requestedAt,
              fetchedAt: source.fetchedAt,
              normalizedFields: {
                normalizedTransaction: { ...data, blockTime: data.blockTime?.toISOString() ?? null },
                receipt,
                transaction: tx,
                execution: {
                  txHash: data.txHash,
                  block: data.block,
                  status: data.status,
                  feeRaw: data.feeRaw,
                },
              },
              decoderVersion,
              comparisonSpecVersion: 'evm-transaction-v1',
            }),
          ],
        },
      };
    },
  };
}
