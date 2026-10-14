import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at } from './columns.ts';
export const chains = bl.table(
  'chains',
  {
    chainId: text('chain_id').primaryKey(),
    slug: text('slug').notNull().unique(),
    family: text('family').notNull(),
    name: text('name').notNull(),
    isTestnet: boolean('is_testnet').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    nativeSymbol: text('native_symbol').notNull(),
    nativeDecimals: integer('native_decimals').notNull(),
    finalityPolicy: jsonb('finality_policy').notNull(),
  },
  (t) => [
    check('chain_family', sql`${t.family} IN ('evm','solana')`),
    check('native_decimals_range', sql`${t.nativeDecimals} BETWEEN 0 AND 255`),
  ],
);
export const verificationReceipts = bl.table(
  'verification_receipts',
  {
    id: id(),
    receiptKey: text('receipt_key').notNull().unique(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    capability: text('capability').notNull(),
    subject: text('subject').notNull(),
    query: jsonb('query').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    commitment: text('commitment').notNull(),
    finality: text('finality').notNull(),
    providerId: text('provider_id').notNull(),
    independenceGroup: text('independence_group').notNull(),
    requestedAt: at('requested_at'),
    fetchedAt: at('fetched_at'),
    fieldsDigest: text('fields_digest').notNull(),
    normalizedFields: jsonb('normalized_fields').notNull(),
    decoderVersion: text('decoder_version').notNull(),
    comparisonSpecVersion: text('comparison_spec_version').notNull(),
  },
  (t) => [
    check('receipt_key_sha256', sql`${t.receiptKey} ~ '^[0-9a-f]{64}$'`),
    check('receipt_finality', sql`${t.finality} IN ('pending','final','orphaned')`),
    check(
      'receipt_query_bounded',
      sql`jsonb_typeof(${t.query})='object' AND octet_length(${t.query}::text)<=8192 AND ${t.query} ? 'method' AND jsonb_typeof(${t.query}->'method')='string' AND jsonb_typeof(${t.query}->'params')='object'`,
    ),
    check(
      'receipt_snapshot_bounded',
      sql`jsonb_typeof(${t.snapshot})='object' AND octet_length(${t.snapshot}::text)<=2048`,
    ),
    check('receipt_provider_id', sql`${t.providerId} ~ '^[a-z0-9_-]{1,64}$'`),
    check('receipt_group', sql`${t.independenceGroup} ~ '^[a-z0-9_-]{1,64}$'`),
    check('receipt_times', sql`${t.fetchedAt}>=${t.requestedAt}`),
    check('receipt_digest_sha256', sql`${t.fieldsDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      'receipt_fields_bounded',
      sql`jsonb_typeof(${t.normalizedFields})='object' AND octet_length(${t.normalizedFields}::text)<=1048576`,
    ),
    check(
      'receipt_versions',
      sql`length(${t.decoderVersion}) BETWEEN 1 AND 64 AND length(${t.comparisonSpecVersion}) BETWEEN 1 AND 64`,
    ),
  ],
);
export const chainFactVerifications = bl.table(
  'chain_fact_verifications',
  {
    id: id(),
    verificationKey: text('verification_key').notNull().unique(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    factType: text('fact_type').notNull(),
    factRef: jsonb('fact_ref').notNull(),
    receiptAId: uuid('receipt_a_id')
      .notNull()
      .references(() => verificationReceipts.id),
    receiptBId: uuid('receipt_b_id').references(() => verificationReceipts.id),
    comparisonSpecVersion: text('comparison_spec_version').notNull(),
    result: text('result').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    check('verification_key_sha256', sql`${t.verificationKey} ~ '^[0-9a-f]{64}$'`),
    check(
      'verification_ref_bounded',
      sql`octet_length(${t.factRef}::text)<=2048 AND jsonb_typeof(${t.factRef}->'subject')='string'`,
    ),
    check(
      'verification_result',
      sql`${t.result} IN ('agree','conflict','inconclusive_snapshot_mismatch','unavailable','single_source')`,
    ),
    check('agreement_has_two_receipts', sql`${t.result}<>'agree' OR ${t.receiptBId} IS NOT NULL`),
  ],
);
