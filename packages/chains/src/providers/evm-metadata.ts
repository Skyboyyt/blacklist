import { z } from 'zod';
import { decodeAbiParameters, keccak256 } from 'viem';
import type { ChainAddress } from '@blacklist/core';
import type { ProviderCallOptions } from '../ports.ts';
import type { Sourced, TokenInfo, ContractInfo, ChainSnapshot } from '../types.ts';
import { evmAdapter } from '../adapters/identity.ts';
import { createEvmStateReader, evmCodeSchema } from './evm-state.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { readReceipt } from './read-receipt.ts';
const bytes = z
  .string()
  .regex(/^0x(?:[\da-f]{2})*$/u)
  .max(2048);
const word = z.string().regex(/^0x[\da-f]{64}$/u);
const id = 'eip155:1';
export function createEvmMetadataReader(providerId: string, independenceGroup: string, rpc: RpcTransport) {
  const state = createEvmStateReader(rpc);
  async function read(ref: ChainAddress, options: ProviderCallOptions) {
    if (ref.chainId !== id || !evmAdapter.parseAddress(ref.address)) throw new ProviderFault('not_supported');
    const requestedAt = new Date();
    await state.network(options.signal);
    const block = await state.anchor(options);
    return { requestedAt, block, selector: { blockHash: block.hash, requireCanonical: true } };
  }
  function provenance(
    ref: ChainAddress,
    options: ProviderCallOptions,
    read: { requestedAt: Date; block: { hash: string; number: string } },
    capability: string,
    normalizedFields: Readonly<Record<string, unknown>>,
  ) {
    const snapshot: ChainSnapshot = {
        kind: 'evm_block',
        blockHash: read.block.hash,
        blockNumber: BigInt(read.block.number).toString(),
      },
      fetchedAt = new Date(),
      finality = options.commitment === 'finalized' ? ('final' as const) : ('pending' as const);
    return {
      providerId,
      fetchedAt,
      snapshot,
      finality,
      decoderVersion: 'evm-rpc-v1',
      verification: 'single_source' as const,
      degraded: false,
      receipts: [
        readReceipt({
          chainId: ref.chainId,
          providerId,
          independenceGroup,
          capability,
          method: capability === 'token_metadata' ? 'eth_call' : 'eth_getCode',
          subject: ref.address,
          params: { address: ref.address, blockHash: read.block.hash, requireCanonical: 'true' },
          commitment: options.commitment,
          snapshot,
          finality,
          requestedAt: read.requestedAt,
          fetchedAt,
          normalizedFields,
          decoderVersion: 'evm-rpc-v1',
          comparisonSpecVersion: capability === 'token_metadata' ? 'evm-token-v1' : 'evm-contract-v1',
        }),
      ],
    };
  }
  const text = (value: string): string | null => {
    try {
      const [decoded] = decodeAbiParameters([{ type: 'string' }], value as `0x${string}`);
      return typeof decoded === 'string' && decoded.length <= 200 ? decoded : null;
    } catch {
      return null;
    }
  };
  return {
    async token(ref: ChainAddress, options: ProviderCallOptions): Promise<Sourced<TokenInfo | null>> {
      const query = await read(ref, options),
        code = await rpc.call('eth_getCode', [ref.address, query.selector], evmCodeSchema, options.signal);
      if (code === '0x')
        return { data: null, provenance: provenance(ref, options, query, 'token_metadata', { code }) };
      const call = (data: string, schema: z.ZodType) =>
        rpc.call('eth_call', [{ to: ref.address, data }, query.selector], schema, options.signal);
      // A contract without the ERC-20 views is "not a token", not a provider failure.
      const view = async (data: string): Promise<string | null> => {
        try {
          const result = await call(data, bytes);
          return typeof result === 'string' && word.safeParse(result).success ? result : null;
        } catch (error) {
          if (error instanceof ProviderFault && error.kind === 'not_supported') return null;
          throw error;
        }
      };
      const [decimals, supply] = await Promise.all([view('0x313ce567'), view('0x18160ddd')]);
      if (decimals === null || supply === null || BigInt(decimals) > 255n)
        return {
          data: null,
          provenance: provenance(ref, options, query, 'token_metadata', { code, standard: 'none' }),
        };
      const optional = async (data: string): Promise<string | null> => {
        try {
          const result = await call(data, bytes);
          return typeof result === 'string' ? text(result) : null;
        } catch (error) {
          if (
            error instanceof ProviderFault &&
            ['timeout', 'rate_limited', 'invalid_response'].includes(error.kind)
          )
            throw error;
          return null;
        }
      };
      const [name, symbol] = await Promise.all([optional('0x06fdde03'), optional('0x95d89b41')]);
      const data: TokenInfo = {
        chainId: ref.chainId,
        address: ref.address,
        standard: 'erc20',
        nameOnchain: name,
        symbolOnchain: symbol,
        decimals: Number(BigInt(decimals)),
        totalSupplyRaw: BigInt(supply).toString(),
        mintAuthority: null,
        freezeAuthority: null,
        extensions: {},
      };
      return {
        data,
        provenance: provenance(ref, options, query, 'token_metadata', {
          code,
          decimalsRaw: decimals,
          supplyRaw: supply,
          name,
          symbol,
        }),
      };
    },
    async contract(ref: ChainAddress, options: ProviderCallOptions): Promise<Sourced<ContractInfo | null>> {
      const query = await read(ref, options),
        code = await rpc.call('eth_getCode', [ref.address, query.selector], evmCodeSchema, options.signal);
      if (code === '0x')
        return { data: null, provenance: provenance(ref, options, query, 'contract_source', { code }) };
      const bytecodeHash = keccak256(code as `0x${string}`);
      // RPC proves bytecode presence, not explorer source verification or proxy control.
      return {
        data: {
          chainId: ref.chainId,
          address: ref.address,
          deployer: null,
          deploymentTx: null,
          bytecodeHash,
          sourceVerification: null,
          proxyType: null,
          implementation: null,
          admin: null,
          upgradeAuthority: null,
        },
        provenance: provenance(ref, options, query, 'contract_source', { bytecodeHash }),
      };
    },
  };
}
