import { z } from 'zod';
import type { ChainAddress } from '@blacklist/core';
import type { ProviderCallOptions } from '../ports.ts';
import type { Page, TransactionSummary, Sourced } from '../types.ts';
import { evmAdapter } from '../adapters/identity.ts';
import { evmReceiptSchema, hexQuantity, hash } from '../adapters/evm-transaction.ts';
import { createEvmStateReader, evmBlockSchema } from './evm-state.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
const address = z.string().refine((v) => evmAdapter.parseAddress(v) !== null);
const result = z.object({
  transfers: z
    .array(
      z.object({
        hash,
        blockNum: hexQuantity,
        from: address,
        to: address.nullable(),
        metadata: z.object({ blockTimestamp: z.iso.datetime() }),
      }),
    )
    .max(25),
  pageKey: z.string().min(1).max(256).optional(),
});
/** Protocol confirmed from Alchemy's official SDK; Free-plan access/history coverage is separately gated (O-3). */
export function createAlchemyHistory(providerId: string, rpc: RpcTransport) {
  const state = createEvmStateReader(rpc);
  return async (
    ref: ChainAddress,
    query: { cursor: string | null; limit: number; direction: 'in' | 'out' | 'all' },
    options: ProviderCallOptions,
  ): Promise<Sourced<Page<TransactionSummary>>> => {
    if (
      ref.chainId !== 'eip155:1' ||
      query.direction === 'all' ||
      query.limit < 1 ||
      query.limit > 25 ||
      !Number.isInteger(query.limit)
    )
      throw new ProviderFault('not_supported');
    await state.network();
    const anchor = await state.anchor(options);
    const page = await rpc.call(
      'alchemy_getAssetTransfers',
      [
        {
          fromBlock: '0x0',
          toBlock: anchor.number,
          order: 'desc',
          ...(query.direction === 'in' ? { toAddress: ref.address } : { fromAddress: ref.address }),
          category: ['external', 'erc20', 'erc721', 'erc1155'],
          maxCount: '0x' + query.limit.toString(16),
          withMetadata: true,
          excludeZeroValue: false,
          ...(query.cursor ? { pageKey: query.cursor } : {}),
        },
      ],
      result,
      options.signal,
    );
    const rows = [...new Map(page.transfers.map((row) => [row.hash, row])).values()];
    const items: TransactionSummary[] = [];
    // Verify execution/block identity with RPC receipts; never trust indexer status or float values.
    for (const row of rows) {
      if (
        BigInt(row.blockNum) > BigInt(anchor.number) ||
        (query.direction === 'in' ? row.to?.toLowerCase() : row.from.toLowerCase()) !== ref.address
      )
        throw new ProviderFault('invalid_response');
      const receipt = await rpc.call(
        'eth_getTransactionReceipt',
        [row.hash],
        evmReceiptSchema.nullable(),
        options.signal,
      );
      if (!receipt) throw new ProviderFault('history_pruned');
      if (receipt.transactionHash !== row.hash || receipt.blockNumber !== row.blockNum)
        throw new ProviderFault('invalid_response');
      const canonical = await rpc.call(
        'eth_getBlockByNumber',
        [row.blockNum, false],
        evmBlockSchema,
        options.signal,
      );
      if (
        canonical.hash !== receipt.blockHash ||
        canonical.number !== row.blockNum ||
        new Date(row.metadata.blockTimestamp).getTime() !== Number(BigInt(canonical.timestamp) * 1000n)
      )
        throw new ProviderFault('invalid_response');
      const txHash = evmAdapter.parseTxHash(row.hash);
      if (!txHash) throw new ProviderFault('invalid_response');
      items.push({
        chainId: ref.chainId,
        txHash,
        block: BigInt(row.blockNum).toString(),
        blockTime: new Date(row.metadata.blockTimestamp),
        status: receipt.status === '0x1' ? 'success' : 'failed',
        direction: row.from.toLowerCase() === row.to?.toLowerCase() ? 'self' : query.direction,
      });
    }
    return {
      data: { items, nextCursor: page.pageKey ?? null, truncated: true },
      provenance: {
        providerId,
        fetchedAt: new Date(),
        snapshot: {
          kind: 'evm_block',
          blockNumber: BigInt(anchor.number).toString(),
          blockHash: anchor.hash,
        },
        finality: options.commitment === 'finalized' ? 'final' : 'pending',
        decoderVersion: 'alchemy-history-v1',
        verification: 'single_source',
        degraded: false,
      },
    };
  };
}
