-- Review CR-14 D-1: a permanent invalidation must point at a real pinned transaction and
-- cite an independent finalized agreement whose transaction differs from the pin. The
-- runtime keeps INSERT for the CLI reconciliation path, so the database enforces this.
CREATE FUNCTION blacklist.chain_invalidation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
DECLARE t blacklist.chain_transactions; digests jsonb := NEW.fact_ref->'receiptDigests';
BEGIN
 IF NEW.fact_type<>'transaction' OR jsonb_typeof(NEW.fact_ref->'subject')<>'string' OR
    jsonb_typeof(digests)<>'array' OR jsonb_array_length(digests)<>2 OR
    (SELECT count(*) FROM jsonb_object_keys(NEW.fact_ref))<>2 THEN
  RAISE EXCEPTION 'invalidation reference rejected' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM blacklist.chain_transactions WHERE chain_id=NEW.chain_id AND tx_hash=NEW.fact_ref->>'subject';
 IF NOT FOUND THEN
  RAISE EXCEPTION 'invalidation requires a pinned transaction' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM blacklist.chain_fact_verifications v
   JOIN blacklist.verification_receipts a ON a.id=v.receipt_a_id
   JOIN blacklist.verification_receipts b ON b.id=v.receipt_b_id
   WHERE v.result='agree' AND v.chain_id=NEW.chain_id AND v.fact_type='transaction'
     AND v.fact_ref->>'subject'=t.tx_hash
     AND a.fields_digest=digests->>0 AND b.fields_digest=digests->>1
     AND a.capability='transaction' AND a.decoder_version=t.decoder_version
     AND a.normalized_fields->'normalizedTransaction' IS DISTINCT FROM t.normalized) THEN
  RAISE EXCEPTION 'invalidation requires independent finalized evidence of a changed fact' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chain_invalidation_insert_guard BEFORE INSERT ON blacklist.chain_fact_invalidations FOR EACH ROW EXECUTE FUNCTION blacklist.chain_invalidation_guard();
REVOKE ALL ON FUNCTION blacklist.chain_invalidation_guard() FROM PUBLIC;
CREATE UNIQUE INDEX chain_fact_invalidations_one_per_fact
  ON blacklist.chain_fact_invalidations (chain_id, fact_type, (fact_ref->>'subject'));
