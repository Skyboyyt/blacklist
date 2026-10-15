import { describe, expect, it, vi } from 'vitest';
import type { ChainAddress } from '@blacklist/core';
import { createEvmMetadataReader } from './evm-metadata.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';

const block = { number: '0x10', hash: '0x' + 'a'.repeat(64), timestamp: '0x5' };
const ref = { chainId: 'eip155:1', address: '0x' + '2'.repeat(40) } as unknown as ChainAddress;
const options = { commitment: 'finalized' as const };
const word = (n: number) => '0x' + n.toString(16).padStart(64, '0');

function rpcAnswering(ethCall: (data: string) => unknown): RpcTransport {
  return {
    call: vi.fn(async (method: string, params: readonly unknown[]) => {
      if (method === 'eth_chainId') return '0x1';
      if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') return block;
      if (method === 'eth_getCode') return '0x6080';
      if (method === 'eth_call') {
        const [{ data }] = params as [{ data: string }];
        return ethCall(data);
      }
      throw new Error('unexpected_method');
    }),
  } as unknown as RpcTransport;
}

describe('EVM token metadata', () => {
  it('reports a contract without ERC-20 views as not a token instead of failing the provider', async () => {
    for (const answer of [
      () => {
        throw new ProviderFault('not_supported');
      },
      () => '0x',
    ]) {
      const reader = createEvmMetadataReader('alchemy', 'unknown-upstream', rpcAnswering(answer));
      const result = await reader.token(ref, options);
      expect(result.data).toBeNull();
    }
  });

  it('still surfaces transport failures so they are not mistaken for "not a token"', async () => {
    const reader = createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      rpcAnswering(() => {
        throw new ProviderFault('timeout');
      }),
    );
    await expect(reader.token(ref, options)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('decodes a standard token', async () => {
    const reader = createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      rpcAnswering((data) => (data === '0x313ce567' ? word(18) : data === '0x18160ddd' ? word(1000) : '0x')),
    );
    const result = await reader.token(ref, options);
    expect(result.data).toMatchObject({ standard: 'erc20', decimals: 18, totalSupplyRaw: '1000' });
  });
});
