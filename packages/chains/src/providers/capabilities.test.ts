import { describe, it, expect, vi } from 'vitest';
import type { z } from 'zod';
import { encodeAbiParameters } from 'viem';
import { createEvmRpcSource } from './evm-rpc.ts';
import { createSolanaRpcSource } from './solana-rpc.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { registry } from '../registry.ts';
import { evmAdapter, solanaAdapter } from '../adapters/identity.ts';
import { TOKEN_PROGRAM, TOKEN_2022 } from '../adapters/solana-transaction.ts';
const eth = registry.bySlug('ethereum'),
  sol = registry.bySlug('solana'),
  ea = evmAdapter.parseAddress('0x' + '1'.repeat(40)),
  sa = solanaAdapter.parseAddress('1'.repeat(32)),
  txHash = evmAdapter.parseTxHash('0x' + 'a'.repeat(64)),
  sig = solanaAdapter.parseTxHash('1'.repeat(64));
if (!eth || !sol || !ea || !sa || !txHash || !sig) throw new Error('fixture_invalid');
const er = { chainId: eth.chainId, address: ea },
  sr = { chainId: sol.chainId, address: sa },
  etr = { chainId: eth.chainId, txHash },
  str = { chainId: sol.chainId, txHash: sig };
function transport(handler: (method: string, params: readonly unknown[]) => unknown): RpcTransport {
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
const block = { number: '0x10', hash: '0x' + 'b'.repeat(64), timestamp: '0x65000000' },
  final = { commitment: 'finalized' };
const tx = {
  hash: txHash,
  from: ea,
  to: ea,
  value: '0x0',
  input: '0x',
  blockHash: block.hash,
  blockNumber: block.number,
  transactionIndex: '0x0',
};
const receipt = {
  transactionHash: txHash,
  blockHash: block.hash,
  blockNumber: block.number,
  transactionIndex: '0x0',
  status: '0x1',
  gasUsed: '0x5208',
  effectiveGasPrice: '0x1',
  logs: [],
};
const evm = (m: string) =>
  m === 'eth_chainId'
    ? '0x1'
    : m === 'eth_getTransactionByHash'
      ? tx
      : m === 'eth_getTransactionReceipt'
        ? receipt
        : m === 'eth_getCode'
          ? '0x6000'
          : block;
const genesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const solTx = {
  slot: 100,
  blockTime: 1700000000,
  version: 0,
  transaction: {
    signatures: [sig],
    message: { accountKeys: [{ pubkey: sa, signer: true, writable: true }], instructions: [] },
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [10000],
    postBalances: [5000],
    preTokenBalances: [],
    postTokenBalances: [],
    innerInstructions: [],
  },
};
describe('metadata and transaction source fault coverage', () => {
  it('rejects a canonical block response with a height different from the transaction receipt', async () => {
    const rpc = transport((method, params) =>
      method === 'eth_getBlockByNumber' && params[0] === block.number
        ? { ...block, number: '0x11' }
        : evm(method),
    );
    await expect(createEvmRpcSource('a', 'infra-a', rpc).fetchTransaction(etr, final)).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
  it('reads anchored ERC20 integer metadata and bytecode without claiming explorer verification', async () => {
    const rpc = transport((m, params) => {
      if (m !== 'eth_call') return evm(m);
      const call = params[0] as { data: string };
      if (call.data === '0x313ce567') return '0x' + 18n.toString(16).padStart(64, '0');
      if (call.data === '0x18160ddd') return '0x' + 9007199254740993n.toString(16).padStart(64, '0');
      return encodeAbiParameters(
        [{ type: 'string' }],
        [call.data === '0x06fdde03' ? '<script>untrusted</script>' : 'TOKEN'],
      );
    });
    const source = createEvmRpcSource('a', 'infra-a', rpc);
    expect((await source.fetchTokenInfo(er, final)).data).toMatchObject({
      decimals: 18,
      totalSupplyRaw: '9007199254740993',
      nameOnchain: '<script>untrusted</script>',
    });
    const contract = await source.fetchContractInfo(er, final);
    expect(contract.data).toMatchObject({ sourceVerification: null, deployer: null, proxyType: null });
    expect(contract.provenance.receipts?.[0]?.fieldsDigest).toMatch(/^[a-f\d]{64}$/u);
    for (const method of ['fetchTokenInfo', 'fetchContractInfo'] as const)
      expect(
        (
          await createEvmRpcSource(
            'a',
            'infra-a',
            transport((m) => (m === 'eth_getCode' ? '0x' : evm(m))),
          )[method](er, final)
        ).data,
      ).toBeNull();
  });
  it('marks missing optional ERC20 text unknown while propagating malicious/rate-limited text responses', async () => {
    const rpc = transport((m, params) => {
      if (m !== 'eth_call') return evm(m);
      const selector = (params[0] as { data: string }).data;
      if (['0x313ce567', '0x18160ddd'].includes(selector)) return '0x' + '0'.repeat(63) + '1';
      throw new ProviderFault('not_supported');
    });
    expect((await createEvmRpcSource('a', 'infra-a', rpc).fetchTokenInfo(er, final)).data).toMatchObject({
      nameOnchain: null,
      symbolOnchain: null,
    });
    const limited = transport((m, p) => {
      if (m === 'eth_call' && (p[0] as { data: string }).data === '0x06fdde03')
        throw new ProviderFault('rate_limited');
      return m === 'eth_call' ? '0x' + '0'.repeat(63) + '1' : evm(m);
    });
    await expect(createEvmRpcSource('a', 'infra-a', limited).fetchTokenInfo(er, final)).rejects.toMatchObject(
      { kind: 'rate_limited' },
    );
  });
  it('rejects unfinalized, orphaned and unavailable EVM transactions and retains failed execution fees', async () => {
    const source = createEvmRpcSource('a', 'infra-a', transport(evm));
    const value = await source.fetchTransaction(etr, final);
    expect(value.data).toMatchObject({ status: 'success', feeRaw: '21000' });
    expect(value.provenance.receipts?.[0]?.normalizedFields).toMatchObject({
      execution: { txHash, status: 'success', block: '16', feeRaw: '21000' },
    });
    const failed = createEvmRpcSource(
      'a',
      'infra-a',
      transport((m) => (m === 'eth_getTransactionReceipt' ? { ...receipt, status: '0x0' } : evm(m))),
    );
    expect((await failed.fetchTransaction(etr, final)).data).toMatchObject({
      status: 'failed',
      transfers: [],
    });
    const pending = createEvmRpcSource(
      'a',
      'infra-a',
      transport((m, p) =>
        m === 'eth_getBlockByNumber' && p[0] === 'finalized' ? { ...block, number: '0xf' } : evm(m),
      ),
    );
    await expect(pending.fetchTransaction(etr, final)).rejects.toMatchObject({ kind: 'unavailable' });
    expect((await pending.fetchTransaction(etr, { commitment: 'latest' })).provenance.finality).toBe(
      'pending',
    );
    for (const rpc of [
      transport((m) => (m === 'eth_getTransactionReceipt' ? null : evm(m))),
      transport((m) => (m === 'eth_getBlockByNumber' ? { ...block, hash: '0x' + 'c'.repeat(64) } : evm(m))),
    ])
      await expect(createEvmRpcSource('a', 'infra-a', rpc).fetchTransaction(etr, final)).rejects.toThrow();
  });
  it('records finalized Solana signature/slot execution and refuses unsupported versions/pruned data', async () => {
    const rpc = transport((m) => (m === 'getGenesisHash' ? genesis : solTx)),
      source = createSolanaRpcSource('s', 'infra-s', rpc);
    expect((await source.fetchTransaction(str, final)).provenance).toMatchObject({
      snapshot: { kind: 'solana_transaction', signature: sig, slot: '100' },
      finality: 'final',
    });
    for (const payload of [
      null,
      { ...solTx, version: 1 },
      { ...solTx, transaction: { ...solTx.transaction, signatures: ['2'.repeat(64)] } },
    ])
      await expect(
        createSolanaRpcSource(
          's',
          'infra-s',
          transport((m) => (m === 'getGenesisHash' ? genesis : payload)),
        ).fetchTransaction(str, final),
      ).rejects.toThrow();
    const absent = createSolanaRpcSource(
      's',
      'infra-s',
      transport((m) => (m === 'getGenesisHash' ? genesis : m === 'getSlot' ? 100 : null)),
      true,
    );
    expect((await absent.fetchTransaction(str, final)).data).toBeNull();
  });
});
describe('Solana history and classic SPL balances have explicit coverage', () => {
  const rows = [{ signature: sig, slot: 100, err: null, blockTime: 1700000000 }];
  it.each(['in', 'out'] as const)(
    'derives %s movement from transaction execution rather than signature direction',
    async (direction) => {
      const other = TOKEN_PROGRAM,
        from = direction === 'out' ? sa : other,
        to = direction === 'out' ? other : sa;
      const value = {
        ...solTx,
        transaction: {
          signatures: [sig],
          message: {
            accountKeys: [
              { pubkey: from, signer: true, writable: true },
              { pubkey: to, signer: false, writable: true },
            ],
            instructions: [
              {
                programId: '1'.repeat(32),
                parsed: { type: 'transfer', info: { source: from, destination: to, lamports: 10 } },
              },
            ],
          },
        },
        meta: { ...solTx.meta, preBalances: [10000, 0], postBalances: [4990, 10] },
      };
      const source = createSolanaRpcSource(
        's',
        'infra-s',
        transport((m) =>
          m === 'getGenesisHash' ? genesis : m === 'getSlot' ? 100 : m === 'getTransaction' ? value : rows,
        ),
      );
      expect(
        (await source.fetchAddressHistory(sr, { limit: 1, cursor: null, direction }, final)).data.items[0]
          ?.direction,
      ).toBe(direction);
      const opposite = direction === 'in' ? 'out' : 'in';
      const filtered = await source.fetchAddressHistory(
        sr,
        { limit: 1, cursor: null, direction: opposite },
        final,
      );
      expect(filtered.data.items).toEqual([]);
      expect(filtered.data.nextCursor).toBe(sig);
      expect(filtered.data.truncated).toBe(true);
    },
  );
  it('preserves provider pagination and execution status without inventing transfer direction', async () => {
    const rpc = transport((m) => (m === 'getGenesisHash' ? genesis : m === 'getSlot' ? 100 : rows)),
      calls = vi.spyOn(rpc, 'call'),
      source = createSolanaRpcSource('s', 'infra-s', rpc);
    const page = await source.fetchAddressHistory(sr, { limit: 1, cursor: null, direction: 'all' }, final);
    expect(page.data).toMatchObject({
      nextCursor: sig,
      truncated: true,
      items: [{ direction: 'other', status: 'success' }],
    });
    await source.fetchAddressHistory(sr, { limit: 1, cursor: sig, direction: 'all' }, final);
    expect(calls).toHaveBeenCalledWith(
      'getSignaturesForAddress',
      [sa, expect.objectContaining({ before: sig, limit: 1, commitment: 'finalized' })],
      expect.anything(),
      undefined,
    );
    await expect(
      source.fetchAddressHistory(sr, { limit: 26, cursor: null, direction: 'in' }, final),
    ).rejects.toMatchObject({ kind: 'not_supported' });
  });
  it('rejects duplicate/oversized/stale-slot history pages and unsupported cursor syntax', async () => {
    for (const data of [[...rows, ...rows], [{ ...rows[0], slot: 101 }]])
      await expect(
        createSolanaRpcSource(
          's',
          'infra-s',
          transport((m) => (m === 'getGenesisHash' ? genesis : m === 'getSlot' ? 100 : data)),
        ).fetchAddressHistory(sr, { limit: 1, cursor: null, direction: 'all' }, final),
      ).rejects.toMatchObject({ kind: 'invalid_response' });
    const source = createSolanaRpcSource(
      's',
      'infra-s',
      transport((m) => (m === 'getGenesisHash' ? genesis : m === 'getSlot' ? 100 : rows)),
    );
    await expect(
      source.fetchAddressHistory(sr, { limit: 1, cursor: 'invalid', direction: 'all' }, final),
    ).rejects.toMatchObject({ kind: 'not_supported' });
    await expect(
      source.fetchAddressHistory(
        sr,
        { limit: 1, cursor: null, direction: 'all' },
        { ...final, minContextSlot: '101' },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  const account = (amount: string, decimals = 9, pubkey = TOKEN_PROGRAM) => ({
    pubkey,
    account: {
      owner: TOKEN_PROGRAM,
      data: { parsed: { type: 'account', info: { mint: sa, owner: sa, tokenAmount: { amount, decimals } } } },
    },
  });
  it('rejects duplicated SPL token accounts and accounts owned by another wallet', async () => {
    const row = {
      ...account('10'),
      pubkey: TOKEN_PROGRAM,
      account: {
        ...account('10').account,
        data: {
          parsed: {
            type: 'account',
            info: { mint: sa, owner: sa, tokenAmount: { amount: '10', decimals: 9 } },
          },
        },
      },
    };
    for (const rows of [
      [row, row],
      [
        {
          ...row,
          account: {
            ...row.account,
            data: {
              parsed: {
                ...row.account.data.parsed,
                info: { ...row.account.data.parsed.info, owner: TOKEN_PROGRAM },
              },
            },
          },
        },
      ],
    ]) {
      const rpc = transport((method) =>
        method === 'getGenesisHash' ? genesis : { context: { slot: 100 }, value: rows },
      );
      await expect(createSolanaRpcSource('s', 'infra-s', rpc).fetchBalances(sr, final)).rejects.toMatchObject(
        { kind: 'invalid_response' },
      );
    }
  });
  it('aggregates classic SPL balances with integer precision and checks the returned context lower bound', async () => {
    const source = createSolanaRpcSource(
      's',
      'infra-s',
      transport((m) =>
        m === 'getGenesisHash'
          ? genesis
          : { context: { slot: 100 }, value: [account('9007199254740993'), account('1', 9, TOKEN_2022)] },
      ),
    );
    expect((await source.fetchBalances(sr, final)).data).toEqual([
      { token: sa, amountRaw: '9007199254740994', decimals: 9 },
    ]);
    await expect(source.fetchBalances(sr, { ...final, minContextSlot: '101' })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
    await expect(source.fetchBalances(sr, { commitment: 'processed' })).rejects.toMatchObject({
      kind: 'not_supported',
    });
  });
  it('rejects contradictory mint decimals and keeps Token2022 extensions unavailable', async () => {
    const source = createSolanaRpcSource(
      's',
      'infra-s',
      transport((m) =>
        m === 'getGenesisHash'
          ? genesis
          : { context: { slot: 100 }, value: [account('1'), account('1', 8, TOKEN_2022)] },
      ),
    );
    await expect(source.fetchBalances(sr, final)).rejects.toMatchObject({ kind: 'invalid_response' });
    const token = createSolanaRpcSource(
      's',
      'infra-s',
      transport((m) =>
        m === 'getGenesisHash'
          ? genesis
          : {
              context: { slot: 100 },
              value: {
                lamports: 1,
                owner: TOKEN_2022,
                executable: false,
                data: {
                  parsed: {
                    type: 'mint',
                    info: { decimals: 9, supply: '1', mintAuthority: null, freezeAuthority: null },
                  },
                },
              },
            },
      ),
    );
    await expect(token.fetchTokenInfo(sr, final)).rejects.toMatchObject({ kind: 'not_supported' });
  });
});
