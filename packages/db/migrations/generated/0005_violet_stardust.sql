CREATE TABLE "blacklist"."chain_fact_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"verification_key" text NOT NULL,
	"chain_id" text NOT NULL,
	"fact_type" text NOT NULL,
	"fact_ref" jsonb NOT NULL,
	"receipt_a_id" uuid NOT NULL,
	"receipt_b_id" uuid,
	"comparison_spec_version" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_fact_verifications_verification_key_unique" UNIQUE("verification_key"),
	CONSTRAINT "verification_key_sha256" CHECK ("blacklist"."chain_fact_verifications"."verification_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "verification_ref_bounded" CHECK (octet_length("blacklist"."chain_fact_verifications"."fact_ref"::text)<=2048 AND jsonb_typeof("blacklist"."chain_fact_verifications"."fact_ref"->'subject')='string'),
	CONSTRAINT "verification_result" CHECK ("blacklist"."chain_fact_verifications"."result" IN ('agree','conflict','inconclusive_snapshot_mismatch','unavailable','single_source')),
	CONSTRAINT "agreement_has_two_receipts" CHECK ("blacklist"."chain_fact_verifications"."result"<>'agree' OR "blacklist"."chain_fact_verifications"."receipt_b_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."chains" (
	"chain_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL,
	"is_testnet" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"native_symbol" text NOT NULL,
	"native_decimals" integer NOT NULL,
	"finality_policy" jsonb NOT NULL,
	CONSTRAINT "chains_slug_unique" UNIQUE("slug"),
	CONSTRAINT "chain_family" CHECK ("blacklist"."chains"."family" IN ('evm','solana')),
	CONSTRAINT "native_decimals_range" CHECK ("blacklist"."chains"."native_decimals" BETWEEN 0 AND 255)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."verification_receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"receipt_key" text NOT NULL,
	"chain_id" text NOT NULL,
	"capability" text NOT NULL,
	"subject" text NOT NULL,
	"query" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"commitment" text NOT NULL,
	"finality" text NOT NULL,
	"provider_id" text NOT NULL,
	"independence_group" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fields_digest" text NOT NULL,
	"normalized_fields" jsonb NOT NULL,
	"decoder_version" text NOT NULL,
	"comparison_spec_version" text NOT NULL,
	CONSTRAINT "verification_receipts_receipt_key_unique" UNIQUE("receipt_key"),
	CONSTRAINT "receipt_key_sha256" CHECK ("blacklist"."verification_receipts"."receipt_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "receipt_finality" CHECK ("blacklist"."verification_receipts"."finality" IN ('pending','final','orphaned')),
	CONSTRAINT "receipt_query_bounded" CHECK (jsonb_typeof("blacklist"."verification_receipts"."query")='object' AND octet_length("blacklist"."verification_receipts"."query"::text)<=8192 AND "blacklist"."verification_receipts"."query" ? 'method' AND jsonb_typeof("blacklist"."verification_receipts"."query"->'method')='string' AND jsonb_typeof("blacklist"."verification_receipts"."query"->'params')='object'),
	CONSTRAINT "receipt_snapshot_bounded" CHECK (jsonb_typeof("blacklist"."verification_receipts"."snapshot")='object' AND octet_length("blacklist"."verification_receipts"."snapshot"::text)<=2048),
	CONSTRAINT "receipt_provider_id" CHECK ("blacklist"."verification_receipts"."provider_id" ~ '^[a-z0-9_-]{1,64}$'),
	CONSTRAINT "receipt_group" CHECK ("blacklist"."verification_receipts"."independence_group" ~ '^[a-z0-9_-]{1,64}$'),
	CONSTRAINT "receipt_times" CHECK ("blacklist"."verification_receipts"."fetched_at">="blacklist"."verification_receipts"."requested_at"),
	CONSTRAINT "receipt_digest_sha256" CHECK ("blacklist"."verification_receipts"."fields_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "receipt_fields_bounded" CHECK (jsonb_typeof("blacklist"."verification_receipts"."normalized_fields")='object' AND octet_length("blacklist"."verification_receipts"."normalized_fields"::text)<=1048576),
	CONSTRAINT "receipt_versions" CHECK (length("blacklist"."verification_receipts"."decoder_version") BETWEEN 1 AND 64 AND length("blacklist"."verification_receipts"."comparison_spec_version") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."asset_transfers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"ordinal" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"asset_address" text,
	"amount_raw" numeric(78, 0) NOT NULL,
	"transfer_kind" text NOT NULL,
	"evidence_level" text NOT NULL,
	"emitter" text NOT NULL,
	"authorization_basis" text NOT NULL,
	"authority_address" text,
	"top_level" boolean NOT NULL,
	CONSTRAINT "asset_transfers_chain_id_tx_hash_ordinal_unique" UNIQUE("chain_id","tx_hash","ordinal"),
	CONSTRAINT "transfer_amount_positive" CHECK ("blacklist"."asset_transfers"."amount_raw">=0),
	CONSTRAINT "transfer_kind" CHECK ("blacklist"."asset_transfers"."transfer_kind" IN ('native','fungible','nft')),
	CONSTRAINT "transfer_evidence" CHECK ("blacklist"."asset_transfers"."evidence_level" IN ('observed_log','asset_contract_log','balance_verified','native_consensus')),
	CONSTRAINT "transfer_authorization" CHECK ("blacklist"."asset_transfers"."authorization_basis" IN ('subject_signed_direct','delegated','protocol','unknown'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."chain_fact_invalidations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"chain_id" text NOT NULL,
	"fact_type" text NOT NULL,
	"fact_ref" jsonb NOT NULL,
	"reason" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invalidation_ref_bounded" CHECK (octet_length("blacklist"."chain_fact_invalidations"."fact_ref"::text)<=2048),
	CONSTRAINT "invalidation_reason_bounded" CHECK (length("blacklist"."chain_fact_invalidations"."reason") BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."chain_transactions" (
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" text,
	"slot" text,
	"block_hash" text,
	"block_time" timestamp with time zone,
	"status" text NOT NULL,
	"fee_raw" numeric(78, 0),
	"finality" text NOT NULL,
	"normalized" jsonb NOT NULL,
	"decoder_version" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned_reason" text NOT NULL,
	"verification_id" uuid NOT NULL,
	CONSTRAINT "chain_transactions_chain_id_tx_hash_pk" PRIMARY KEY("chain_id","tx_hash"),
	CONSTRAINT "pinned_finalized_only" CHECK ("blacklist"."chain_transactions"."finality"='final'),
	CONSTRAINT "transaction_status" CHECK ("blacklist"."chain_transactions"."status" IN ('success','failed')),
	CONSTRAINT "transaction_fee_positive" CHECK ("blacklist"."chain_transactions"."fee_raw">=0),
	CONSTRAINT "transaction_bounded" CHECK (octet_length("blacklist"."chain_transactions"."normalized"::text)<=1048576),
	CONSTRAINT "transaction_snapshot_family" CHECK (("blacklist"."chain_transactions"."block_number" IS NOT NULL AND "blacklist"."chain_transactions"."block_hash" IS NOT NULL AND "blacklist"."chain_transactions"."slot" IS NULL) OR ("blacklist"."chain_transactions"."slot" IS NOT NULL AND "blacklist"."chain_transactions"."block_number" IS NULL AND "blacklist"."chain_transactions"."block_hash" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."research_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"capability" text NOT NULL,
	"normalized" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decoder_version" text NOT NULL,
	CONSTRAINT "cache_key_sha256" CHECK ("blacklist"."research_cache"."cache_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cache_payload_bounded" CHECK (octet_length("blacklist"."research_cache"."normalized"::text)<=1048576),
	CONSTRAINT "cache_expiry" CHECK ("blacklist"."research_cache"."expires_at">"blacklist"."research_cache"."fetched_at")
);
--> statement-breakpoint
ALTER TABLE "blacklist"."chain_fact_verifications" ADD CONSTRAINT "chain_fact_verifications_chain_id_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "blacklist"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."chain_fact_verifications" ADD CONSTRAINT "chain_fact_verifications_receipt_a_id_verification_receipts_id_fk" FOREIGN KEY ("receipt_a_id") REFERENCES "blacklist"."verification_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."chain_fact_verifications" ADD CONSTRAINT "chain_fact_verifications_receipt_b_id_verification_receipts_id_fk" FOREIGN KEY ("receipt_b_id") REFERENCES "blacklist"."verification_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."verification_receipts" ADD CONSTRAINT "verification_receipts_chain_id_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "blacklist"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."asset_transfers" ADD CONSTRAINT "asset_transfers_chain_id_tx_hash_chain_transactions_chain_id_tx_hash_fk" FOREIGN KEY ("chain_id","tx_hash") REFERENCES "blacklist"."chain_transactions"("chain_id","tx_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."chain_fact_invalidations" ADD CONSTRAINT "chain_fact_invalidations_chain_id_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "blacklist"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."chain_transactions" ADD CONSTRAINT "chain_transactions_chain_id_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "blacklist"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."chain_transactions" ADD CONSTRAINT "chain_transactions_verification_id_chain_fact_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "blacklist"."chain_fact_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."research_cache" ADD CONSTRAINT "research_cache_chain_id_chains_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "blacklist"."chains"("chain_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_cache_expiry" ON "blacklist"."research_cache" USING btree ("expires_at");