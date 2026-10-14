import { describe, it, expect, vi } from 'vitest';
import type { z } from 'zod';
import { createEvmRpcSource } from './evm-rpc.ts';
import { createSolanaRpcSource } from './solana-rpc.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { registry } from '../registry.ts';
import { evmAdapter, solanaAdapter } from '../adapters/identity.ts';
import { TOKEN_PROGRAM } from '../adapters/solana-transaction.ts';
const eth = registry.bySlug('ethereum'),
  sol = registry.bySlug('solana'),
  ethAddress = evmAdapter.parseAddress('0x' + '1'.repeat(40)),
  solAddress = solanaAdapter.parseAddress('1'.repeat(32));
if (!eth || !sol || !ethAddress || !solAddress) throw new Error('fixture_invalid');
const ethRef = { chainId: eth.chainId, address: ethAddress },
  solRef = { chainId: sol.chainId, address: solAddress };
const block = { number: '0x10', hash: '0x' + 'a'.repeat(64), timestamp: '0x65000000' };
function rpc(handler: (method: string, params: readonly unknown[]) => unknown): RpcTransport {
  return {
    async call<S extends z.ZodType>(
      method: string,
      params: readonly unknown[],
      schema: S,
    ): Promise<z.output<S>> {
      return schema.parse(handler(method, params));
    },
  };
}
function evmRpc(method: string) {
  switch (method) {
    case 'eth_chainId':
      return '0x1';
    case 'eth_getBlockByNumber':
    case 'eth_getBlockByHash':
      return block;
    case 'eth_getBalance':
      return '0x20000000000001';
    case 'eth_getCode':
      return '0x';
    default:
      throw new ProviderFault('not_supported');
  }
}
const opts = { commitment: 'finalized' };
describe('real-protocol source clients use validated mainnet/snapshot reads', () => {
  it('anchors EVM state to a canonical EIP1898 block hash and records reproducible fields', async () => {
    const transport = rpc(evmRpc),
      calls = vi.spyOn(transport, 'call'),
      source = createEvmRpcSource('node-a', 'infra-a', transport);
    const value = await source.fetchAccountInfo(ethRef, opts);
    expect(value.data?.nativeBalanceRaw).toBe('9007199254740993');
    expect(value.provenance.snapshot).toEqual({
      kind: 'evm_block',
      blockNumber: '16',
      blockHash: block.hash,
    });
    expect(calls).toHaveBeenCalledWith(
      'eth_getBalance',
      [ethRef.address, { blockHash: block.hash, requireCanonical: true }],
      expect.anything(),
      undefined,
    );
    expect(value.provenance.receipts?.[0]).toMatchObject({
      commitment: 'finalized',
      capability: 'account_info',
      normalizedFields: { balanceRaw: '9007199254740993', code: '0x' },
    });
    expect(source.supports(ethRef.chainId, 'address_history')).toBe(false);
  });
  it('refuses wrong network identity, noncanonical snapshots and archival absence certainty', async () => {
    await expect(
      createEvmRpcSource(
        'node-a',
        'infra-a',
        rpc((method) => (method === 'eth_chainId' ? '0x2' : evmRpc(method))),
      ).fetchAccountInfo(ethRef, opts),
    ).rejects.toThrow();
    await expect(
      createEvmRpcSource('node-a', 'infra-a', rpc(evmRpc)).fetchAccountInfo(ethRef, {
        ...opts,
        blockHash: '0x' + 'b'.repeat(64),
      }),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
    const txHash = evmAdapter.parseTxHash('0x' + 'b'.repeat(64));
    if (!txHash) throw new Error('fixture_invalid');
    await expect(
      createEvmRpcSource(
        'node-a',
        'infra-a',
        rpc((method) => (method.startsWith('eth_getTransaction') ? null : evmRpc(method))),
      ).fetchTransaction({ chainId: ethRef.chainId, txHash }, opts),
    ).rejects.toMatchObject({ kind: 'history_pruned' });
  });
  it('keeps case-preserved Solana mainnet context slots and enforces the lower bound', async () => {
    const transport = rpc((method) =>
      method === 'getGenesisHash'
        ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
        : {
            context: { slot: 100 },
            value: {
              lamports: '9007199254740993',
              owner: solRef.address,
              executable: false,
              data: ['', 'base64'],
            },
          },
    );
    const source = createSolanaRpcSource('node-a', 'infra-a', transport);
    const calls = vi.spyOn(transport, 'call');
    const value = await source.fetchAccountInfo(solRef, { ...opts, minContextSlot: '100' });
    expect(value.data?.nativeBalanceRaw).toBe('9007199254740993');
    expect(value.provenance.snapshot).toEqual({ kind: 'solana_context', contextSlot: '100' });
    expect(calls).toHaveBeenCalledWith(
      'getAccountInfo',
      [solRef.address, { commitment: 'finalized', encoding: 'jsonParsed', minContextSlot: 100 }],
      expect.anything(),
      undefined,
    );
    await expect(source.fetchAccountInfo(solRef, { ...opts, minContextSlot: '101' })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
    expect(value.provenance.receipts?.[0]?.normalizedFields).toMatchObject({
      account: { lamports: '9007199254740993' },
    });
  });
  it('reads native and classic SPL mint facts without fetching metadata URLs', async () => {
    const transport = rpc((method) =>
      method === 'getGenesisHash'
        ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
        : {
            context: { slot: 100 },
            value: {
              lamports: 1,
              owner: TOKEN_PROGRAM,
              executable: false,
              data: {
                parsed: {
                  type: 'mint',
                  info: {
                    decimals: 9,
                    supply: '9007199254740993',
                    mintAuthority: solRef.address,
                    freezeAuthority: null,
                    uri: 'https://untrusted.example.test',
                  },
                },
              },
            },
          },
    );
    const calls = vi.spyOn(transport, 'call'),
      value = await createSolanaRpcSource('node-a', 'infra-a', transport).fetchTokenInfo(solRef, opts);
    expect(value.data).toMatchObject({
      standard: 'spl',
      decimals: 9,
      totalSupplyRaw: '9007199254740993',
      mintAuthority: solRef.address,
      nameOnchain: null,
    });
    expect(calls).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(value)).not.toContain('untrusted.example.test');
  });
});
