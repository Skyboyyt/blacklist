-- Additive integrity repair; preserve all previous migration bytes and existing records.
-- Fail closed if any previously pinned timestamp disagrees with its immutable normalized fact.
ALTER TABLE blacklist.chain_transactions
 ADD CONSTRAINT pinned_transaction_time_matches_receipt
 CHECK (block_time IS NOT DISTINCT FROM (normalized->>'blockTime')::timestamptz)
 NOT VALID;
ALTER TABLE blacklist.chain_transactions
 VALIDATE CONSTRAINT pinned_transaction_time_matches_receipt;
