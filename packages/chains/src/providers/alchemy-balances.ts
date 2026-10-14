import { z } from 'zod';
import type { ChainAddress } from '@blacklist/core';
import type { ProviderCallOptions } from '../ports.ts';
import type { Sourced, TokenBalance } from '../types.ts';
import { evmAdapter } from '../adapters/identity.ts';
import { createEvmStateReader } from './evm-state.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
const address = z.string().refine((v) => evmAdapter.parseAddress(v) !== null);
const hex = z.string().regex(/^0x[\da-f]{1,64}$/u);
const response = z.object({
  address,
  tokenBalances: z
    .array(
      z.object({
        contractAddress: address,
        tokenBalance: hex.nullable(),
        error: z.string().max(2048).nullable(),
      }),
    )
    .max(1000),
  pageKey: z.string().max(256).optional(),
});
const word = z.string().regex(/^0x[\da-f]{64}$/u);
/** Indexer supplies discovery only; displayed balances come from same-block canonical eth_call. */
export function createAlchemyBalances(providerId: string, rpc: RpcTransport) {
  const state = createEvmStateReader(rpc);
  return async (
    ref: ChainAddress,
    options: ProviderCallOptions,
  ): Promise<Sourced<readonly TokenBalance[]>> => {
    if (ref.chainId !== 'eip155:1') throw new ProviderFault('not_supported');
    await state.network(options.signal);
    const block = await state.anchor(options),
      selector = { blockHash: block.hash, requireCanonical: true };
    const page = await rpc.call('alchemy_getTokenBalances', [ref.address, 'erc20'], response, options.signal);
    if (
      page.address.toLowerCase() !== ref.address ||
      new Set(page.tokenBalances.map((v) => v.contractAddress.toLowerCase())).size !==
        page.tokenBalances.length
    )
      throw new ProviderFault('invalid_response');
    const balances: TokenBalance[] = [];
    // Bound query amplification. Inventory intentionally incomplete; never expose discovery errors/page keys.
    for (const item of page.tokenBalances
      .filter((v) => v.error === null && v.tokenBalance !== null)
      .slice(0, 10)) {
      const token = evmAdapter.parseAddress(item.contractAddress);
      if (!token) throw new ProviderFault('invalid_response');
      const [amount, decimals] = await Promise.all([
        rpc.call(
          'eth_call',
          [{ to: token, data: '0x70a08231' + ref.address.slice(2).padStart(64, '0') }, selector],
          word,
          options.signal,
        ),
        rpc.call('eth_call', [{ to: token, data: '0x313ce567' }, selector], word, options.signal),
      ]);
      if (BigInt(decimals) > 255n) throw new ProviderFault('invalid_response');
      balances.push({ token, amountRaw: BigInt(amount).toString(), decimals: Number(BigInt(decimals)) });
    }
    return {
      data: balances,
      provenance: {
        providerId,
        fetchedAt: new Date(),
        snapshot: { kind: 'evm_block', blockNumber: BigInt(block.number).toString(), blockHash: block.hash },
        finality: options.commitment === 'finalized' ? 'final' : 'pending',
        verification: 'single_source',
        decoderVersion: 'alchemy-balances-v1',
        degraded: false,
      },
    };
  };
}
