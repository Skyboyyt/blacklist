-- Additive Phase8 migration. No identity table rewrite or deletion.
-- Applied only by the schema-owning migrator; runtime never runs DDL.
INSERT INTO blacklist.chains VALUES
 ('eip155:1','ethereum','evm','Ethereum',false,true,'ETH',18,'{"display":"latest","final":"finalized"}'),
 ('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp','solana','solana','Solana',false,true,'SOL',9,'{"display":"confirmed","final":"finalized"}');
CREATE FUNCTION blacklist.chain_receipt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF NEW.fields_digest IS DISTINCT FROM encode(sha256(convert_to(blacklist.canonical_json(NEW.normalized_fields),'UTF8')),'hex') OR
   (NEW.finality='final' AND NEW.commitment<>'finalized') OR
   NOT (NEW.snapshot ? 'kind') OR
   (NEW.chain_id='eip155:1' AND (NEW.snapshot->>'kind' IS DISTINCT FROM 'evm_block' OR
     coalesce(NEW.snapshot->>'blockHash','') !~ '^0x[0-9a-f]{64}$' OR coalesce(NEW.snapshot->>'blockNumber','') !~ '^(0|[1-9][0-9]*)$')) OR
   (NEW.chain_id LIKE 'solana:%' AND NOT coalesce((
     (NEW.snapshot->>'kind'='solana_context' AND coalesce(NEW.snapshot->>'contextSlot','') ~ '^(0|[1-9][0-9]*)$') OR
     (NEW.snapshot->>'kind'='solana_transaction' AND NEW.snapshot->>'signature'=NEW.subject AND coalesce(NEW.snapshot->>'slot','') ~ '^(0|[1-9][0-9]*)$')),false)) THEN
  RAISE EXCEPTION 'receipt invariant rejected' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chain_receipt_insert_guard BEFORE INSERT ON blacklist.verification_receipts FOR EACH ROW EXECUTE FUNCTION blacklist.chain_receipt_guard();
CREATE FUNCTION blacklist.chain_verification_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
DECLARE a blacklist.verification_receipts; b blacklist.verification_receipts;
BEGIN
 SELECT * INTO STRICT a FROM blacklist.verification_receipts WHERE id=NEW.receipt_a_id;
 IF a.chain_id IS DISTINCT FROM NEW.chain_id OR a.subject IS DISTINCT FROM NEW.fact_ref->>'subject' OR a.comparison_spec_version IS DISTINCT FROM NEW.comparison_spec_version THEN
  RAISE EXCEPTION 'verification reference mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.receipt_b_id IS NOT NULL THEN
  SELECT * INTO STRICT b FROM blacklist.verification_receipts WHERE id=NEW.receipt_b_id;
  IF b.chain_id IS DISTINCT FROM a.chain_id OR b.subject IS DISTINCT FROM a.subject OR b.capability IS DISTINCT FROM a.capability OR b.query->>'method' IS DISTINCT FROM a.query->>'method' OR
    b.comparison_spec_version IS DISTINCT FROM a.comparison_spec_version OR b.decoder_version IS DISTINCT FROM a.decoder_version THEN
   RAISE EXCEPTION 'verification comparison mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.result IN ('agree','conflict') THEN
  IF NEW.receipt_b_id IS NULL OR a.provider_id=b.provider_id OR a.independence_group=b.independence_group OR
    a.independence_group='unknown-upstream' OR b.independence_group='unknown-upstream' OR a.finality<>'final' OR b.finality<>'final' OR
    a.commitment<>'finalized' OR b.commitment<>'finalized' OR a.snapshot<>b.snapshot OR
    (NEW.result='agree' AND (a.fields_digest<>b.fields_digest OR a.normalized_fields<>b.normalized_fields)) OR
    (NEW.result='conflict' AND a.fields_digest=b.fields_digest) THEN
   RAISE EXCEPTION 'verification invariant rejected' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chain_verification_insert_guard BEFORE INSERT ON blacklist.chain_fact_verifications FOR EACH ROW EXECUTE FUNCTION blacklist.chain_verification_guard();
CREATE FUNCTION blacklist.pinned_transaction_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
DECLARE v blacklist.chain_fact_verifications; r blacklist.verification_receipts;
BEGIN
 SELECT * INTO STRICT v FROM blacklist.chain_fact_verifications WHERE id=NEW.verification_id;
 SELECT * INTO STRICT r FROM blacklist.verification_receipts WHERE id=v.receipt_a_id;
 IF v.result<>'agree' OR v.chain_id<>NEW.chain_id OR v.fact_type<>'transaction' OR v.fact_ref->>'subject' IS DISTINCT FROM NEW.tx_hash OR
    r.finality<>'final' OR r.capability<>'transaction' OR r.decoder_version IS DISTINCT FROM NEW.decoder_version OR
    NEW.normalized IS DISTINCT FROM r.normalized_fields->'normalizedTransaction' OR
    r.normalized_fields->'execution'->>'txHash' IS DISTINCT FROM NEW.tx_hash OR
    r.normalized_fields->'execution'->>'block' IS DISTINCT FROM coalesce(NEW.block_number,NEW.slot) OR
    r.normalized_fields->'execution'->>'status' IS DISTINCT FROM NEW.status OR
    r.normalized_fields->'execution'->>'feeRaw' IS DISTINCT FROM NEW.fee_raw::text OR
    (r.snapshot->>'kind'='evm_block' AND (r.snapshot->>'blockHash' IS DISTINCT FROM NEW.block_hash OR r.snapshot->>'blockNumber' IS DISTINCT FROM NEW.block_number)) OR
    (r.snapshot->>'kind'='solana_transaction' AND (r.snapshot->>'signature' IS DISTINCT FROM NEW.tx_hash OR r.snapshot->>'slot' IS DISTINCT FROM NEW.slot)) OR
    r.snapshot->>'kind' NOT IN ('evm_block','solana_transaction') OR
    NEW.normalized->>'chainId' IS DISTINCT FROM NEW.chain_id OR NEW.normalized->>'txHash' IS DISTINCT FROM NEW.tx_hash OR
    NEW.normalized->>'status' IS DISTINCT FROM NEW.status OR NEW.normalized->>'feeRaw' IS DISTINCT FROM NEW.fee_raw::text OR
    NEW.normalized->>'block' IS DISTINCT FROM coalesce(NEW.block_number,NEW.slot) THEN
  RAISE EXCEPTION 'pinned fact requires finalized independent agreement' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER pinned_transaction_insert_guard BEFORE INSERT ON blacklist.chain_transactions FOR EACH ROW EXECUTE FUNCTION blacklist.pinned_transaction_guard();
CREATE FUNCTION blacklist.chain_transfer_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
DECLARE parent jsonb; movement jsonb;
BEGIN
 SELECT normalized INTO STRICT parent FROM blacklist.chain_transactions WHERE chain_id=NEW.chain_id AND tx_hash=NEW.tx_hash;
 SELECT item INTO STRICT movement FROM jsonb_array_elements(coalesce(parent->'transfers','[]'::jsonb)) item WHERE item->>'ordinal'=NEW.ordinal;
 IF movement->>'from' IS DISTINCT FROM NEW.from_address OR movement->>'to' IS DISTINCT FROM NEW.to_address OR
    movement->>'amountRaw' IS DISTINCT FROM NEW.amount_raw::text OR movement->>'transferKind' IS DISTINCT FROM NEW.transfer_kind OR
    movement->>'evidenceLevel' IS DISTINCT FROM NEW.evidence_level OR movement->>'emitter' IS DISTINCT FROM NEW.emitter OR
    movement->>'authorization' IS DISTINCT FROM NEW.authorization_basis OR movement->>'authority' IS DISTINCT FROM NEW.authority_address OR
    movement->>'topLevel' IS DISTINCT FROM NEW.top_level::text OR movement->'asset'->>'address' IS DISTINCT FROM NEW.asset_address THEN
  RAISE EXCEPTION 'transfer differs from pinned transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
 RAISE EXCEPTION 'transfer requires one pinned movement' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER pinned_transfer_insert_guard BEFORE INSERT ON blacklist.asset_transfers FOR EACH ROW EXECUTE FUNCTION blacklist.chain_transfer_guard();
CREATE TRIGGER receipts_append_only BEFORE UPDATE OR DELETE ON blacklist.verification_receipts FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER verifications_append_only BEFORE UPDATE OR DELETE ON blacklist.chain_fact_verifications FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER pinned_transactions_append_only BEFORE UPDATE OR DELETE ON blacklist.chain_transactions FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER transfers_append_only BEFORE UPDATE OR DELETE ON blacklist.asset_transfers FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER invalidations_append_only BEFORE UPDATE OR DELETE ON blacklist.chain_fact_invalidations FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
REVOKE ALL ON FUNCTION blacklist.chain_receipt_guard(),blacklist.chain_verification_guard(),blacklist.pinned_transaction_guard(),blacklist.chain_transfer_guard() FROM PUBLIC;
