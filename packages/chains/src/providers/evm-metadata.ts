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
/**
 * EIP-1967 storage slots (keccak256('eip1967.proxy.<name>') - 1), and the older ZeppelinOS
 * slots (keccak256('org.zeppelinos.proxy.<name>')) that proxies such as USDC still use.
 */
const PROXY_SLOTS = {
  implementation: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  admin: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
  beacon: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
  zosImplementation: '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
  zosAdmin: '0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b',
} as const;
/** The low 20 bytes of a storage word, or null when the slot is empty. */
const slotAddress = (value: string) =>
  BigInt(value) === 0n ? null : evmAdapter.parseAddress('0x' + value.slice(-40));
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
          method: capability === 'token_metadata' ? 'eth_call' : 'eth_getCode+eth_getStorageAt',
          subject: ref.address,
          params: { address: ref.address, blockHash: read.block.hash, requireCanonical: 'true' },
          commitment: options.commitment,
          snapshot,
          finality,
          requestedAt: read.requestedAt,
          fetchedAt,
          normalizedFields,
          decoderVersion: 'evm-rpc-v1',
          comparisonSpecVersion: capability === 'token_metadata' ? 'evm-token-v1' : 'evm-contract-v2',
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
      // EIP-1967 and ZeppelinOS slots at the same block. RPC still proves nothing about
      // explorer source verification, and any other proxy pattern reads as 'none'.
      const slot = (key: string): Promise<string> =>
        rpc.call('eth_getStorageAt', [ref.address, key, query.selector], word, options.signal);
      // One at a time: the budgeted transport refuses calls beyond its concurrency limit.
      const implementationSlot = await slot(PROXY_SLOTS.implementation),
        adminSlot = await slot(PROXY_SLOTS.admin),
        beaconSlot = await slot(PROXY_SLOTS.beacon),
        zosImplementationSlot = await slot(PROXY_SLOTS.zosImplementation),
        zosAdminSlot = await slot(PROXY_SLOTS.zosAdmin);
      const implementation = slotAddress(implementationSlot),
        beacon = slotAddress(beaconSlot),
        zosImplementation = slotAddress(zosImplementationSlot);
      return {
        data: {
          chainId: ref.chainId,
          address: ref.address,
          deployer: null,
          deploymentTx: null,
          bytecodeHash,
          sourceVerification: null,
          proxyType: implementation ? 'eip1967' : beacon ? 'beacon' : zosImplementation ? 'other' : 'none',
          // A beacon proxy's implementation lives in the beacon contract, which is not read here.
          implementation: implementation ?? (beacon ? null : zosImplementation),
          admin: implementation || beacon ? slotAddress(adminSlot) : slotAddress(zosAdminSlot),
          upgradeAuthority: null,
        },
        provenance: provenance(ref, options, query, 'contract_source', {
          bytecodeHash,
          implementationSlot,
          adminSlot,
          beaconSlot,
          zosImplementationSlot,
          zosAdminSlot,
        }),
      };
    },
  };
}
