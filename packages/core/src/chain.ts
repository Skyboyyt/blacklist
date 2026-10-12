/**
 * Chain and address primitives (ARCHITECTURE.md §11.4).
 *
 * Branded values are produced only inside `@blacklist/chains`:
 * - `ChainId` and `ChainSlug` by the chain registry (from its definitions),
 * - `Address` and `TxHash` by the family adapters' parse/normalize functions.
 * Never create them from raw input with a type assertion.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** CAIP-2 chain identifier, e.g. `eip155:1` or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. */
export type ChainId = Brand<string, 'ChainId'>;

/** URL slug from the chain registry, e.g. `ethereum`, `solana`. */
export type ChainSlug = Brand<string, 'ChainSlug'>;

export type ChainFamily = 'evm' | 'solana';

/**
 * Canonical address on one chain.
 * EVM: lowercase `0x` + 40 hex (display with EIP-55 checksum).
 * Solana: base58 public key — case-sensitive, never lowercased.
 */
export type Address = Brand<string, 'Address'>;

/** Canonical transaction identifier. EVM: lowercase `0x` + 64 hex. Solana: base58 signature. */
export type TxHash = Brand<string, 'TxHash'>;

/**
 * A chain-scoped address (CAIP-10 equivalent). The same address string on two
 * chains identifies two different subjects.
 */
export interface ChainAddress {
  readonly chainId: ChainId;
  readonly address: Address;
}

export interface ChainTxRef {
  readonly chainId: ChainId;
  readonly txHash: TxHash;
}

/** Only `final` data may be pinned as evidence or used in risk scoring. */
export type Finality = 'pending' | 'final' | 'orphaned';
