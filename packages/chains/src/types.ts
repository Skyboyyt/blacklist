/**
 * Normalized chain data returned to domain code (ARCHITECTURE.md §11,
 * docs/design/chain-data.md). Provider-specific payloads never leave this package.
 *
 * Status: proposed contract (revision 3, ADRs 0003 and 0008). Changes to its semantics need an ADR.
 */
import type { Address, ChainId, Finality, TxHash } from '@blacklist/core';

// ---------------------------------------------------------------------------
// Snapshot identity and provenance
// ---------------------------------------------------------------------------

/**
 * The canonical chain state a piece of data describes. Two providers can only
 * "agree" when they answered about the same snapshot (chain-data design §5).
 */
export type ChainSnapshot =
  /** EVM state or receipt at a specific canonical block. */
  | { readonly kind: 'evm_block'; readonly blockNumber: string; readonly blockHash: string }
  /** An immutable finalized Solana transaction. */
  | { readonly kind: 'solana_transaction'; readonly signature: TxHash; readonly slot: string }
  /**
   * A Solana account read: only the response context slot is known. `minContextSlot` is a lower
   * bound, not historical targeting, so two reads agree only if their context slots are identical.
   */
  | { readonly kind: 'solana_context'; readonly contextSlot: string };

/**
 * `agree`: IDENTICAL snapshot identity (same EVM block hash; same Solana signature+slot; same Solana
 *   account context slot), providers in different independence groups, equal digests.
 * `conflict`: same snapshot, different digests. Excluded from scoring and pinning.
 * `inconclusive_snapshot_mismatch`: answers describe different snapshots, EVEN IF their values are
 *   identical. Never reported as agreement or conflict.
 * `unavailable`: no independent provider could answer for that snapshot (including when no
 *   same-slot Solana account read could be obtained).
 * `single_source`: no second read attempted (ordinary display).
 */
export type VerificationResult =
  'agree' | 'conflict' | 'inconclusive_snapshot_mismatch' | 'unavailable' | 'single_source';

/**
 * One provider answer used for verification. Persisted as an immutable receipt
 * (chain-data design §5.2). Receipts reproduce what was compared; without raw-response
 * archival they do not allow re-decoding the original provider response.
 */
export interface VerificationReceipt {
  /** CAIP-2 chain ID; also identifies the cluster/network. */
  readonly chainId: ChainId;
  readonly providerId: string;
  /** Providers sharing upstream infrastructure share a group and never corroborate each other. */
  readonly independenceGroup: string;
  /** Query type, e.g. capability 'account_info' with method 'getAccountInfo'. */
  readonly capability: string;
  readonly method: string;
  /** The queried address or transaction identifier. */
  readonly subject: Address | TxHash;
  /** Canonical request parameters (block hash, minContextSlot, encoding …). */
  readonly params: Readonly<Record<string, string>>;
  /** Requested commitment / block tag. */
  readonly commitment: string;
  readonly snapshot: ChainSnapshot;
  readonly finality: Finality;
  readonly requestedAt: Date;
  readonly fetchedAt: Date;
  /** SHA-256 (hex) over the canonical normalized fields named by the comparison spec. */
  readonly fieldsDigest: string;
  /** Bounded normalized comparison fields, never the raw provider response. */
  readonly normalizedFields: Readonly<Record<string, unknown>>;
  readonly decoderVersion: string;
  readonly comparisonSpecVersion: string;
}

/** Where a piece of chain data came from. Attached to every result. */
export interface DataProvenance {
  readonly providerId: string;
  readonly fetchedAt: Date;
  readonly snapshot: ChainSnapshot;
  readonly finality: Finality;
  readonly decoderVersion: string;
  readonly verification: VerificationResult;
  /** Bounded read receipts; required for every answer used in `crossVerify`. */
  readonly receipts?: readonly VerificationReceipt[];
  /** True when served from cache because providers were unavailable. */
  readonly degraded: boolean;
}

export interface Sourced<T> {
  readonly data: T;
  readonly provenance: DataProvenance;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** Kinds change over time (CREATE2 deployments, EIP-7702 delegation), so a kind is an observation. */
export type AccountKind =
  'eoa' | 'eoa_delegated' | 'contract' | 'program' | 'token_mint' | 'token_account' | 'pda' | 'unknown';

export interface AccountInfo {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly kind: AccountKind;
  /** Native balance in base units (wei / lamports) as a decimal string. */
  readonly nativeBalanceRaw: string;
  /** EIP-7702 delegate contract, present only when `kind` is `eoa_delegated`. */
  readonly delegateAddress?: Address;
  /** Owner wallet of a Solana token account at this snapshot. */
  readonly ownerAddress?: Address;
}

// ---------------------------------------------------------------------------
// Transfers: observed events are not authorization (chain-data design §2)
// ---------------------------------------------------------------------------

export type AssetRef = { readonly kind: 'native' } | { readonly kind: 'token'; readonly address: Address };

/** How strongly the chain data supports that value actually moved. */
export type MovementEvidenceLevel =
  /** A transfer-shaped log or instruction from any emitter (may be fake). */
  | 'observed_log'
  /** Emitted by the asset's own token contract (still only that contract's claim). Strongest per-transfer level for EVM tokens. */
  | 'asset_contract_log'
  /**
   * Confirmed by TRANSACTION-scoped balance deltas (Solana pre/post token balances, when the
   * transaction moved that account/mint once). Not assigned per transfer on EVM: block-level state
   * reads only prove a net change across the whole block and are recorded as a separate aggregate fact.
   */
  | 'balance_verified'
  /** Native value transfer established by consensus (top-level value / system program + lamport deltas). */
  | 'native_consensus';

/**
 * Who authorized the movement, relative to its `from` side. `unknown` must
 * contribute zero to any risk computation. Even `subject_signed_direct` proves a
 * signature, not informed intent (victims sign drainer-crafted transfers).
 */
export type AuthorizationBasis = 'subject_signed_direct' | 'delegated' | 'protocol' | 'unknown';

export interface AssetTransfer {
  /** Log index (EVM) or instruction path including inner index (Solana); unique within the transaction. */
  readonly ordinal: string;
  readonly from: Address;
  readonly to: Address;
  readonly asset: AssetRef;
  /** Raw integer amount in base units as a decimal string. Never a float. */
  readonly amountRaw: string;
  readonly transferKind: 'native' | 'fungible' | 'nft';
  /** EVM log emitter or Solana program that produced the record. */
  readonly emitter: Address;
  readonly evidenceLevel: MovementEvidenceLevel;
  readonly authorization: AuthorizationBasis;
  /** The authority that signed or authorized the movement, where determinable (owner, delegate, program). */
  readonly authority: Address | null;
  /** False for transfers produced by inner calls / CPI. */
  readonly topLevel: boolean;
}

export interface NormalizedTransaction {
  readonly chainId: ChainId;
  readonly txHash: TxHash;
  /** Block number (EVM) or slot (Solana) as a decimal string; null while pending. */
  readonly block: string | null;
  /** EVM block hash; null for Solana or while pending. */
  readonly blockHash: string | null;
  readonly blockTime: Date | null;
  readonly status: 'success' | 'failed';
  readonly feeRaw: string | null;
  /**
   * Transaction signers. EVM: `[from]`. Solana: all signer accounts (the fee payer is
   * the first signer). Being a signer does not by itself authorize any particular transfer.
   */
  readonly signers: readonly Address[];
  readonly transfers: readonly AssetTransfer[];
  /** Contracts / programs invoked by the transaction. */
  readonly invoked: readonly Address[];
}

export interface TransactionSummary {
  readonly chainId: ChainId;
  readonly txHash: TxHash;
  readonly block: string | null;
  readonly blockTime: Date | null;
  readonly status: 'success' | 'failed';
  /** Direction relative to the queried address. Direction is not authorization. */
  readonly direction: 'in' | 'out' | 'self' | 'other';
}

export interface Page<T> {
  readonly items: readonly T[];
  /**
   * Opaque, provider-scoped cursor (encodes provider and snapshot boundary). After
   * failover, pagination restarts from the snapshot boundary; a cursor is never
   * reinterpreted by another provider.
   */
  readonly nextCursor: string | null;
  /** True when provider limits mean the window is incomplete. The UI must disclose this. */
  readonly truncated: boolean;
  /** True when failover restarted from the recorded snapshot boundary. */
  readonly restarted?: boolean;
}

// ---------------------------------------------------------------------------
// Tokens and contracts
// ---------------------------------------------------------------------------

export interface TokenBalance {
  readonly token: Address;
  readonly amountRaw: string;
  readonly decimals: number | null;
}

export interface TokenInfo {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly standard: 'erc20' | 'erc721' | 'erc1155' | 'spl' | 'spl_token_2022' | 'unknown';
  /** On-chain name and symbol are UNTRUSTED text chosen by the token creator. */
  readonly nameOnchain: string | null;
  readonly symbolOnchain: string | null;
  readonly decimals: number | null;
  readonly totalSupplyRaw: string | null;
  /** Capability facts: shown as disclosures, zero risk contribution in V1. */
  readonly mintAuthority: Address | null;
  readonly freezeAuthority: Address | null;
  /** Token-2022 extensions keyed by extension name (e.g. `permanentDelegate`, `transferHook`). */
  readonly extensions: Readonly<Record<string, unknown>>;
}

export interface ContractInfo {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly deployer: Address | null;
  readonly deploymentTx: TxHash | null;
  readonly bytecodeHash: string | null;
  /**
   * Explorer source verification is `external_source` (attributed to the explorer),
   * not a chain fact. null = unknown.
   */
  readonly sourceVerification: { readonly verified: boolean; readonly attributedTo: string } | null;
  readonly proxyType: 'none' | 'eip1967' | 'eip1822' | 'beacon' | 'other' | null;
  readonly implementation: Address | null;
  readonly admin: Address | null;
  /** Solana program upgrade authority. */
  readonly upgradeAuthority: Address | null;
}
