/**
 * Blockchain abstraction contracts (ARCHITECTURE.md §11, docs/design/chain-data.md).
 *
 *   domain modules ──► ChainDataService (router) ──► ChainFamilyAdapter (no I/O)
 *                                                └─► provider clients (capability ports, network I/O)
 *
 * Domain code depends on `ChainDataService` only. Swapping or adding a provider
 * changes provider clients and configuration, never domain code.
 *
 * Status: proposed contract (revision 3, ADRs 0003 and 0008). Changes to its semantics need an ADR.
 */
import type {
  Address,
  ChainAddress,
  ChainFamily,
  ChainId,
  ChainSlug,
  ChainTxRef,
  TxHash,
} from '@blacklist/core';
import type {
  AccountInfo,
  ChainSnapshot,
  ContractInfo,
  NormalizedTransaction,
  Page,
  Sourced,
  TokenBalance,
  TokenInfo,
  TransactionSummary,
  VerificationReceipt,
} from './types.ts';

// ---------------------------------------------------------------------------
// Chain registry (constructs ChainId / ChainSlug brands)
// ---------------------------------------------------------------------------

export interface FinalityPolicy {
  /** Commitment / block tag used for display (EVM `latest`, Solana `confirmed`). */
  readonly display: string;
  /** Commitment / block tag required before data may be pinned or scored (EVM `finalized`, Solana `finalized`). */
  readonly final: string;
}

export interface ChainDefinition {
  readonly chainId: ChainId;
  readonly slug: ChainSlug;
  readonly family: ChainFamily;
  readonly name: string;
  /** Testnets are never enabled in production. */
  readonly isTestnet: boolean;
  readonly nativeSymbol: string;
  readonly nativeDecimals: number;
  readonly finality: FinalityPolicy;
}

export interface ChainRegistry {
  list(): readonly ChainDefinition[];
  byId(chainId: string): ChainDefinition | null;
  bySlug(slug: string): ChainDefinition | null;
}

// ---------------------------------------------------------------------------
// Family adapters: chain-specific logic, NO network I/O (construct Address / TxHash brands)
// ---------------------------------------------------------------------------

/**
 * Result of classifying raw user input. EVM input is valid on every EVM chain,
 * so the classification never picks a chain; callers must ask the user or show
 * per-chain results.
 */
export type InputClassification =
  | { readonly kind: 'address'; readonly family: ChainFamily; readonly address: Address }
  | { readonly kind: 'transaction'; readonly family: ChainFamily; readonly txHash: TxHash }
  | { readonly kind: 'unrecognized' };

export interface ChainFamilyAdapter {
  readonly family: ChainFamily;
  /**
   * Validate and normalize an address. Returns null for invalid input (e.g. a
   * mixed-case EVM address with a bad EIP-55 checksum, or base58 that does not
   * decode to 32 bytes). Solana addresses are case-sensitive and never lowercased.
   */
  parseAddress(input: string): Address | null;
  parseTxHash(input: string): TxHash | null;
  /** Display form: EIP-55 checksum for EVM; unchanged base58 for Solana. */
  formatAddress(address: Address): string;
  classifyInput(input: string): InputClassification;
}

// ---------------------------------------------------------------------------
// Errors and results
// ---------------------------------------------------------------------------

export type ProviderCapability =
  | 'account_info'
  | 'transaction'
  | 'address_history'
  | 'balances'
  | 'token_metadata'
  | 'contract_source'
  /** Deferred: webhooks/streams for watched addresses. */
  | 'activity_stream';

export type ChainDataErrorKind =
  | 'not_supported'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'invalid_response'
  | 'history_pruned'
  | 'data_conflict';

export interface ChainDataFailure {
  readonly kind: ChainDataErrorKind;
  readonly capability: ProviderCapability;
  readonly chainId: ChainId;
  /** Providers attempted, in order. */
  readonly providerIds: readonly string[];
  readonly retryAfterMs?: number;
  /** Internal conflicting finalized answers; never serialize into public errors. */
  readonly receipts?: readonly [VerificationReceipt, VerificationReceipt];
}

/**
 * Router results are values, not exceptions, so callers must handle degradation
 * explicitly. "Not found" is a successful result with `null` data, not a failure.
 */
export type ChainResult<T> =
  | { readonly ok: true; readonly value: Sourced<T> }
  | { readonly ok: false; readonly error: ChainDataFailure };

export interface ReadOptions {
  /** Use `final` for anything that will be pinned as evidence or used in risk scoring. */
  readonly minFinality?: 'pending' | 'final';
  /**
   * Require a second read from a provider in a different independence group at the
   * same snapshot (pinned evidence, facts behind scoring signals). The result's
   * provenance carries the receipts and a VerificationResult.
   */
  readonly crossVerify?: boolean;
  /** Read state at this snapshot (EVM: EIP-1898 block hash; Solana: used as minContextSlot). */
  readonly atSnapshot?: ChainSnapshot;
  readonly signal?: AbortSignal;
}

export interface HistoryQuery extends ReadOptions {
  /** Opaque provider-scoped cursor from a previous page. */
  readonly cursor?: string | null;
  /** Page size; the router enforces a maximum. */
  readonly limit: number;
  readonly direction?: 'in' | 'out' | 'all';
}

// ---------------------------------------------------------------------------
// Router: the only entry point for domain code
// ---------------------------------------------------------------------------

/**
 * Implementations route each call by capability with failover, retries for
 * idempotent reads only, circuit breakers, rate-limit budgets, single-flight,
 * caching and snapshot-bound verification, and attach provenance to every
 * result (ARCHITECTURE.md §11.6–§11.9, chain-data design §5–§6).
 */
export interface ChainDataService {
  readonly registry: ChainRegistry;
  adapterFor(chainId: ChainId): ChainFamilyAdapter;
  getAccountInfo(ref: ChainAddress, options?: ReadOptions): Promise<ChainResult<AccountInfo | null>>;
  getTransaction(ref: ChainTxRef, options?: ReadOptions): Promise<ChainResult<NormalizedTransaction | null>>;
  getAddressHistory(ref: ChainAddress, query: HistoryQuery): Promise<ChainResult<Page<TransactionSummary>>>;
  getBalances(ref: ChainAddress, options?: ReadOptions): Promise<ChainResult<readonly TokenBalance[]>>;
  getTokenInfo(ref: ChainAddress, options?: ReadOptions): Promise<ChainResult<TokenInfo | null>>;
  getContractInfo(ref: ChainAddress, options?: ReadOptions): Promise<ChainResult<ContractInfo | null>>;
}

// ---------------------------------------------------------------------------
// Provider clients: network-facing capability ports
// ---------------------------------------------------------------------------

/**
 * A provider client (e.g. a Solana RPC provider, an EVM indexer). Provider
 * responses are untrusted input and must be schema-validated and size-capped
 * before normalization; provider-supplied URLs are never followed. Methods
 * reject with a `ProviderError`.
 */
export interface ProviderClient {
  readonly id: string;
  /** Providers sharing upstream infrastructure share a group (never corroborate each other). */
  readonly independenceGroup: string;
  supports(chainId: ChainId, capability: ProviderCapability): boolean;
}

export interface ProviderError {
  readonly providerId: string;
  readonly kind: Exclude<ChainDataErrorKind, 'data_conflict'>;
  readonly retryAfterMs?: number;
}

export interface ProviderCallOptions {
  /** Commitment / block tag to request, taken from the chain's FinalityPolicy. */
  readonly commitment: string;
  /** EVM: read state at this canonical block hash (EIP-1898, requireCanonical). */
  readonly blockHash?: string;
  /** Solana: minimum context slot for account reads. */
  readonly minContextSlot?: string;
  readonly signal?: AbortSignal;
}

export interface AccountInfoSource extends ProviderClient {
  fetchAccountInfo(ref: ChainAddress, options: ProviderCallOptions): Promise<Sourced<AccountInfo | null>>;
}

export interface TransactionSource extends ProviderClient {
  fetchTransaction(
    ref: ChainTxRef,
    options: ProviderCallOptions,
  ): Promise<Sourced<NormalizedTransaction | null>>;
}

export interface AddressHistorySource extends ProviderClient {
  fetchAddressHistory(
    ref: ChainAddress,
    query: {
      readonly cursor: string | null;
      readonly limit: number;
      readonly direction: 'in' | 'out' | 'all';
    },
    options: ProviderCallOptions,
  ): Promise<Sourced<Page<TransactionSummary>>>;
}

export interface BalanceSource extends ProviderClient {
  fetchBalances(ref: ChainAddress, options: ProviderCallOptions): Promise<Sourced<readonly TokenBalance[]>>;
}

export interface TokenMetadataSource extends ProviderClient {
  fetchTokenInfo(ref: ChainAddress, options: ProviderCallOptions): Promise<Sourced<TokenInfo | null>>;
}

export interface ContractSourceSource extends ProviderClient {
  fetchContractInfo(ref: ChainAddress, options: ProviderCallOptions): Promise<Sourced<ContractInfo | null>>;
}
