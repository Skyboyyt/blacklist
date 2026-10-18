import { describe, expect, it, vi } from 'vitest';
import type { ChainAddress } from '@blacklist/core';
import { createEvmMetadataReader } from './evm-metadata.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { budgetedTransport } from './policy.ts';

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

describe('EVM contract proxy detection (EIP-1967)', () => {
  const IMPLEMENTATION = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const ADMIN = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
  const BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
  const empty = '0x' + '0'.repeat(64);
  const holding = (hex: string) => '0x' + '0'.repeat(24) + hex.repeat(40);
  function rpcWithSlots(slots: Record<string, string>, fail?: ProviderFault): RpcTransport {
    return {
      call: vi.fn(async (method: string, params: readonly unknown[]) => {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') return block;
        if (method === 'eth_getCode') return '0x6080';
        if (method === 'eth_getStorageAt') {
          if (fail) throw fail;
          const [, slot, selector] = params as [string, string, { blockHash: string }];
          // Every slot is read at the same block as the bytecode.
          expect(selector.blockHash).toBe(block.hash);
          return slots[slot] ?? empty;
        }
        throw new Error('unexpected_method');
      }),
    } as unknown as RpcTransport;
  }

  it('reports an EIP-1967 proxy with its implementation and admin', async () => {
    const reader = createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      rpcWithSlots({ [IMPLEMENTATION]: holding('3'), [ADMIN]: holding('4') }),
    );
    const result = await reader.contract(ref, options);
    expect(result.data).toMatchObject({
      proxyType: 'eip1967',
      implementation: '0x' + '3'.repeat(40),
      admin: '0x' + '4'.repeat(40),
    });
  });

  it('reports a beacon proxy, and a contract with empty slots as not a proxy', async () => {
    const beacon = await createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      rpcWithSlots({ [BEACON]: holding('5') }),
    ).contract(ref, options);
    expect(beacon.data).toMatchObject({
      proxyType: 'beacon',
      implementation: null,
      admin: null,
    });
    const plain = await createEvmMetadataReader('alchemy', 'unknown-upstream', rpcWithSlots({})).contract(
      ref,
      options,
    );
    expect(plain.data).toMatchObject({ proxyType: 'none', implementation: null, admin: null });
  });

  it('reports an older ZeppelinOS-style proxy (USDC) with its implementation and admin', async () => {
    const ZOS_IMPLEMENTATION = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';
    const ZOS_ADMIN = '0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b';
    const result = await createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      rpcWithSlots({ [ZOS_IMPLEMENTATION]: holding('6'), [ZOS_ADMIN]: holding('7') }),
    ).contract(ref, options);
    expect(result.data).toMatchObject({
      proxyType: 'other',
      implementation: '0x' + '6'.repeat(40),
      admin: '0x' + '7'.repeat(40),
    });
  });

  it('stays within the budgeted transport concurrency limit', async () => {
    // The production transport refuses calls beyond its concurrency limit instead of queuing.
    const reader = createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      budgetedTransport(rpcWithSlots({ [IMPLEMENTATION]: holding('3') }), {
        perMinute: 120,
        total: 1000,
        concurrency: 2,
      }),
    );
    expect((await reader.contract(ref, options)).data).toMatchObject({ proxyType: 'eip1967' });
  });

  it('surfaces a failed slot read instead of claiming the contract is not a proxy', async () => {
    const reader = createEvmMetadataReader(
      'alchemy',
      'unknown-upstream',
      rpcWithSlots({}, new ProviderFault('rate_limited')),
    );
    await expect(reader.contract(ref, options)).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});
