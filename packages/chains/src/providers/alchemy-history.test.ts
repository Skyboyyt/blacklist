import { describe, it, expect, vi } from 'vitest';
import type { z } from 'zod';
import { createEvmRpcSource } from './evm-rpc.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { registry } from '../registry.ts';
import { evmAdapter } from '../adapters/identity.ts';
const chain = registry.bySlug('ethereum'),
  address = evmAdapter.parseAddress('0x' + '1'.repeat(40));
if (!chain || !address) throw new Error('fixture_invalid');
const ref = { chainId: chain.chainId, address },
  other = '0x' + '2'.repeat(40),
  hash = '0x' + 'a'.repeat(64),
  blockHash = '0x' + 'b'.repeat(64);
const block = { number: '0x10', hash: blockHash, timestamp: '0x65000000' };
const receipt = {
  transactionHash: hash,
  blockHash,
  blockNumber: '0x10',
  transactionIndex: '0x0',
  status: '0x1',
  gasUsed: '0x5208',
  effectiveGasPrice: '0x1',
  logs: [],
};
function fixture(direction: 'in' | 'out' = 'out', override: (method: string) => unknown = () => undefined) {
  const rpc: RpcTransport = {
    async call<S extends z.ZodType>(
      method: string,
      _params: readonly unknown[],
      schema: S,
    ): Promise<z.output<S>> {
      const replacement = override(method);
      return schema.parse(
        replacement ??
          (method === 'eth_chainId'
            ? '0x1'
            : method === 'alchemy_getAssetTransfers'
              ? {
                  transfers: [
                    {
                      hash,
                      blockNum: '0x10',
                      from: direction === 'out' ? address : other,
                      to: direction === 'out' ? other : address,
                      value: 0.123456789,
                      metadata: {
                        blockTimestamp: new Date(Number(BigInt(block.timestamp) * 1000n)).toISOString(),
                      },
                    },
                  ],
                  pageKey: 'opaque-indexer-page',
                }
              : method === 'eth_getTransactionReceipt'
                ? receipt
                : block),
      );
    },
  };
  return {
    rpc,
    calls: vi.spyOn(rpc, 'call'),
    source: createEvmRpcSource('alchemy', 'unknown-upstream', rpc, false, true),
  };
}
describe('capability-gated Ethereum indexed history', () => {
  it.each(['in', 'out'] as const)(
    'uses bounded %s protocol pagination and independently checks canonical receipts',
    async (direction) => {
      const { source, calls } = fixture(direction);
      const page = await source.fetchAddressHistory(
        ref,
        { limit: 20, cursor: null, direction },
        { commitment: 'finalized' },
      );
      expect(page.data.items[0]).toMatchObject({ txHash: hash, direction, status: 'success', block: '16' });
      expect(page.data).toMatchObject({ nextCursor: 'opaque-indexer-page', truncated: true });
      expect(calls).toHaveBeenCalledWith(
        'alchemy_getAssetTransfers',
        [
          expect.objectContaining({
            maxCount: '0x14',
            toBlock: '0x10',
            ...(direction === 'in' ? { toAddress: address } : { fromAddress: address }),
          }),
        ],
        expect.anything(),
        undefined,
      );
      expect(JSON.stringify(page)).not.toContain('0.123456789');
      await source.fetchAddressHistory(
        ref,
        { limit: 20, cursor: 'opaque-indexer-page', direction },
        { commitment: 'finalized', blockHash },
      );
      expect(calls).toHaveBeenLastCalledWith(
        'eth_getBlockByNumber',
        ['0x10', false],
        expect.anything(),
        undefined,
      );
      expect(calls).toHaveBeenCalledWith(
        'alchemy_getAssetTransfers',
        [expect.objectContaining({ pageKey: 'opaque-indexer-page' })],
        expect.anything(),
        undefined,
      );
    },
  );
  it('keeps unverified indexing off and rejects unsupported aggregate directions/large pages', async () => {
    const { source, rpc } = fixture();
    const disabled = createEvmRpcSource('alchemy', 'unknown-upstream', rpc);
    expect(disabled.supports(ref.chainId, 'address_history')).toBe(false);
    await expect(
      disabled.fetchAddressHistory(
        ref,
        { limit: 20, cursor: null, direction: 'out' },
        { commitment: 'finalized' },
      ),
    ).rejects.toBeInstanceOf(ProviderFault);
    for (const query of [
      { limit: 26, cursor: null, direction: 'out' as const },
      { limit: 20, cursor: null, direction: 'all' as const },
    ])
      await expect(source.fetchAddressHistory(ref, query, { commitment: 'finalized' })).rejects.toMatchObject(
        { kind: 'not_supported' },
      );
  });
  it('rejects reorganization, wrong address/indexer block and receipt mismatch', async () => {
    for (const override of [
      (m: string) =>
        m === 'eth_getTransactionReceipt' ? { ...receipt, blockHash: '0x' + 'c'.repeat(64) } : undefined,
      (m: string) =>
        m === 'eth_getTransactionReceipt'
          ? { ...receipt, transactionHash: '0x' + 'c'.repeat(64) }
          : undefined,
      (m: string) =>
        m === 'alchemy_getAssetTransfers'
          ? {
              transfers: [
                {
                  hash,
                  blockNum: '0x11',
                  from: address,
                  to: other,
                  metadata: { blockTimestamp: '2026-10-01T00:00:00Z' },
                },
              ],
            }
          : undefined,
    ])
      await expect(
        fixture('out', override).source.fetchAddressHistory(
          ref,
          { limit: 20, cursor: null, direction: 'out' },
          { commitment: 'finalized' },
        ),
      ).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
