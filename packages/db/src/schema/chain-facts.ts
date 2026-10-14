import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { bl, id, at } from './columns.ts';
import { chains, chainFactVerifications } from './chain-verification.ts';
export const chainTransactions = bl.table(
  'chain_transactions',
  {
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    txHash: text('tx_hash').notNull(),
    blockNumber: text('block_number'),
    slot: text('slot'),
    blockHash: text('block_hash'),
    blockTime: timestamp('block_time', { withTimezone: true }),
    status: text('status').notNull(),
    feeRaw: numeric('fee_raw', { precision: 78, scale: 0 }),
    finality: text('finality').notNull(),
    normalized: jsonb('normalized').notNull(),
    decoderVersion: text('decoder_version').notNull(),
    fetchedAt: at('fetched_at'),
    pinnedReason: text('pinned_reason').notNull(),
    verificationId: uuid('verification_id')
      .notNull()
      .references(() => chainFactVerifications.id),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.txHash] }),
    check('pinned_finalized_only', sql`${t.finality}='final'`),
    check('transaction_status', sql`${t.status} IN ('success','failed')`),
    check('transaction_fee_positive', sql`${t.feeRaw}>=0`),
    check('transaction_bounded', sql`octet_length(${t.normalized}::text)<=1048576`),
    check(
      'transaction_snapshot_family',
      sql`(${t.blockNumber} IS NOT NULL AND ${t.blockHash} IS NOT NULL AND ${t.slot} IS NULL) OR (${t.slot} IS NOT NULL AND ${t.blockNumber} IS NULL AND ${t.blockHash} IS NULL)`,
    ),
  ],
);
export const assetTransfers = bl.table(
  'asset_transfers',
  {
    id: id(),
    chainId: text('chain_id').notNull(),
    txHash: text('tx_hash').notNull(),
    ordinal: text('ordinal').notNull(),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    assetAddress: text('asset_address'),
    amountRaw: numeric('amount_raw', { precision: 78, scale: 0 }).notNull(),
    transferKind: text('transfer_kind').notNull(),
    evidenceLevel: text('evidence_level').notNull(),
    emitter: text('emitter').notNull(),
    authorizationBasis: text('authorization_basis').notNull(),
    authorityAddress: text('authority_address'),
    topLevel: boolean('top_level').notNull(),
  },
  (t) => [
    unique().on(t.chainId, t.txHash, t.ordinal),
    foreignKey({
      columns: [t.chainId, t.txHash],
      foreignColumns: [chainTransactions.chainId, chainTransactions.txHash],
    }),
    check('transfer_amount_positive', sql`${t.amountRaw}>=0`),
    check('transfer_kind', sql`${t.transferKind} IN ('native','fungible','nft')`),
    check(
      'transfer_evidence',
      sql`${t.evidenceLevel} IN ('observed_log','asset_contract_log','balance_verified','native_consensus')`,
    ),
    check(
      'transfer_authorization',
      sql`${t.authorizationBasis} IN ('subject_signed_direct','delegated','protocol','unknown')`,
    ),
  ],
);
export const chainFactInvalidations = bl.table(
  'chain_fact_invalidations',
  {
    id: id(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    factType: text('fact_type').notNull(),
    factRef: jsonb('fact_ref').notNull(),
    reason: text('reason').notNull(),
    discoveredAt: at('discovered_at'),
    recordedBy: text('recorded_by').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    check('invalidation_ref_bounded', sql`octet_length(${t.factRef}::text)<=2048`),
    check('invalidation_reason_bounded', sql`length(${t.reason}) BETWEEN 1 AND 300`),
  ],
);
export const researchCache = bl.table(
  'research_cache',
  {
    cacheKey: text('cache_key').primaryKey(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    capability: text('capability').notNull(),
    normalized: jsonb('normalized').notNull(),
    fetchedAt: at('fetched_at'),
    expiresAt: at('expires_at'),
    decoderVersion: text('decoder_version').notNull(),
  },
  (t) => [
    check('cache_key_sha256', sql`${t.cacheKey} ~ '^[0-9a-f]{64}$'`),
    check('cache_payload_bounded', sql`octet_length(${t.normalized}::text)<=1048576`),
    check('cache_expiry', sql`${t.expiresAt}>${t.fetchedAt}`),
    index('research_cache_expiry').on(t.expiresAt),
  ],
);
