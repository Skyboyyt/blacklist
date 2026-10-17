-- Phase 10 slice 4 (data-model §4, §7, §8). Labels and suppressions are history: they are
-- retired or lifted once, never edited or deleted. A notification can only be marked read.
CREATE FUNCTION blacklist.label_retire_once() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'labels cannot be deleted' USING ERRCODE='42501'; END IF;
 IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
    OR (NEW.id, NEW.subject_id, NEW.text, NEW.provenance, NEW.source_name, NEW.basis_note, NEW.created_by_ref, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.subject_id, OLD.text, OLD.provenance, OLD.source_name, OLD.basis_note, OLD.created_by_ref, OLD.created_at) THEN
  RAISE EXCEPTION 'a label can only be retired, once' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER address_labels_retire_once BEFORE UPDATE OR DELETE ON blacklist.address_labels FOR EACH ROW EXECUTE FUNCTION blacklist.label_retire_once();
REVOKE ALL ON FUNCTION blacklist.label_retire_once() FROM PUBLIC;
CREATE FUNCTION blacklist.suppression_lift_once() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'suppressions cannot be deleted' USING ERRCODE='42501'; END IF;
 IF OLD.lifted_at IS NOT NULL OR NEW.lifted_at IS NULL
    OR (NEW.id, NEW.subject_id, NEW.factor_code, NEW.public_reason, NEW.internal_rationale, NEW.stepup_challenge_id, NEW.created_by_ref, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.subject_id, OLD.factor_code, OLD.public_reason, OLD.internal_rationale, OLD.stepup_challenge_id, OLD.created_by_ref, OLD.created_at) THEN
  RAISE EXCEPTION 'a suppression can only be lifted, once' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER risk_signal_suppressions_lift_once BEFORE UPDATE OR DELETE ON blacklist.risk_signal_suppressions FOR EACH ROW EXECUTE FUNCTION blacklist.suppression_lift_once();
REVOKE ALL ON FUNCTION blacklist.suppression_lift_once() FROM PUBLIC;
CREATE FUNCTION blacklist.notification_mark_read() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF OLD.read_at IS NOT NULL OR NEW.read_at IS NULL
    OR (NEW.id, NEW.recipient_user_id, NEW.type, NEW.payload, NEW.source_ref, NEW.source_revision, NEW.dedupe_key, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.recipient_user_id, OLD.type, OLD.payload, OLD.source_ref, OLD.source_revision, OLD.dedupe_key, OLD.created_at) THEN
  RAISE EXCEPTION 'a notification can only be marked read' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER notifications_mark_read_only BEFORE UPDATE ON blacklist.notifications FOR EACH ROW EXECUTE FUNCTION blacklist.notification_mark_read();
REVOKE ALL ON FUNCTION blacklist.notification_mark_read() FROM PUBLIC;
