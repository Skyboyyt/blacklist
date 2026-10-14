import { describe, it, expect, vi } from 'vitest';
import type { z } from 'zod';
import { createEvmRpcSource } from './evm-rpc.ts';
import type { RpcTransport } from './rpc-transport.ts';
import { registry } from '../registry.ts';
import { evmAdapter } from '../adapters/identity.ts';
const chain = registry.bySlug('ethereum'),
  address = evmAdapter.parseAddress('0x' + '1'.repeat(40));
if (!chain || !address) throw new Error('fixture_invalid');
const ref = { chainId: chain.chainId, address },
  token = '0x' + '2'.repeat(40),
  block = { number: '0x10', hash: '0x' + 'a'.repeat(64), timestamp: '0x65000000' };
function transport(discovery: unknown, decimals = 18): RpcTransport {
  return {
    async call<S extends z.ZodType>(
      method: string,
      params: readonly unknown[],
      schema: S,
    ): Promise<z.output<S>> {
      return schema.parse(
        method === 'eth_chainId'
          ? '0x1'
          : method === 'alchemy_getTokenBalances'
            ? discovery
            : method === 'eth_call'
              ? '0x' +
                ((params[0] as { data: string }).data === '0x313ce567' ? BigInt(decimals) : 9007199254740993n)
                  .toString(16)
                  .padStart(64, '0')
              : block,
      );
    },
  };
}
const page = {
  address,
  tokenBalances: [{ contractAddress: token, tokenBalance: '0x1', error: null }],
  pageKey: 'private-next-page',
};
describe('Ethereum token discovery is separate from snapshot-bound balances', () => {
  it('reads actual same-block amounts instead of trusting an indexer value or exposing its page key', async () => {
    const rpc = transport(page),
      calls = vi.spyOn(rpc, 'call'),
      source = createEvmRpcSource('a', 'unknown-upstream', rpc, false, false, true);
    expect(source.supports(ref.chainId, 'balances')).toBe(true);
    const value = await source.fetchBalances(ref, { commitment: 'finalized' });
    expect(value.data).toEqual([{ token, amountRaw: '9007199254740993', decimals: 18 }]);
    expect(calls).toHaveBeenCalledWith(
      'eth_call',
      [expect.objectContaining({ to: token }), { blockHash: block.hash, requireCanonical: true }],
      expect.anything(),
      undefined,
    );
    expect(JSON.stringify(value)).not.toContain('private-next-page');
    expect(value.provenance.verification).toBe('single_source');
  });
  it('keeps actual-plan capabilities disabled and rejects wrong wallet, duplicates and invalid decimals', async () => {
    const disabled = createEvmRpcSource('a', 'unknown-upstream', transport(page));
    expect(disabled.supports(ref.chainId, 'balances')).toBe(false);
    await expect(disabled.fetchBalances(ref, { commitment: 'finalized' })).rejects.toMatchObject({
      kind: 'not_supported',
    });
    for (const rpc of [
      transport({ ...page, address: token }),
      transport({ ...page, tokenBalances: [...page.tokenBalances, ...page.tokenBalances] }),
      transport(page, 256),
    ])
      await expect(
        createEvmRpcSource('a', 'unknown-upstream', rpc, false, false, true).fetchBalances(ref, {
          commitment: 'finalized',
        }),
      ).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  it('caps amplification to ten assets and does not return raw discovery errors', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      contractAddress: '0x' + (i + 3).toString(16).padStart(40, '0'),
      tokenBalance: '0x1',
      error: null,
    }));
    const rpc = transport({ address, tokenBalances: rows }),
      calls = vi.spyOn(rpc, 'call');
    expect(
      (
        await createEvmRpcSource('a', 'unknown-upstream', rpc, false, false, true).fetchBalances(ref, {
          commitment: 'finalized',
        })
      ).data,
    ).toHaveLength(10);
    expect(calls.mock.calls.filter(([method]) => method === 'eth_call')).toHaveLength(20);
    const errors = createEvmRpcSource(
      'a',
      'unknown-upstream',
      transport({
        address,
        tokenBalances: [{ contractAddress: token, tokenBalance: null, error: 'private provider error' }],
      }),
      false,
      false,
      true,
    );
    expect(JSON.stringify(await errors.fetchBalances(ref, { commitment: 'finalized' }))).not.toContain(
      'private provider error',
    );
  });
});
