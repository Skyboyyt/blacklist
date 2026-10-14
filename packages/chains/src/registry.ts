import type { ChainId, ChainSlug } from '@blacklist/core';
import type { ChainDefinition, ChainRegistry } from './ports.ts';

// Brands are constructed only here; no user input can create a chain definition.
const chains: readonly ChainDefinition[] = Object.freeze([
  Object.freeze({
    chainId: 'eip155:1' as ChainId,
    slug: 'ethereum' as ChainSlug,
    family: 'evm',
    name: 'Ethereum',
    isTestnet: false,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    finality: Object.freeze({ display: 'latest', final: 'finalized' }),
  }),
  Object.freeze({
    chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId,
    slug: 'solana' as ChainSlug,
    family: 'solana',
    name: 'Solana',
    isTestnet: false,
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    finality: Object.freeze({ display: 'confirmed', final: 'finalized' }),
  }),
]);
export const registry: ChainRegistry = Object.freeze({
  list: () => chains,
  byId: (id: string) => chains.find((c) => c.chainId === id) ?? null,
  bySlug: (slug: string) => chains.find((c) => c.slug === slug) ?? null,
});
