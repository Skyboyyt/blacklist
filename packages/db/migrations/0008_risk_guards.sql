-- Phase 10 (ARCHITECTURE §15.4, §15.7; data-model §7): assessment history and signal
-- revisions are append-only. blacklist.reject_mutation() is defined in 0001_security_boundaries.sql.
CREATE TRIGGER signal_revisions_append_only BEFORE UPDATE OR DELETE ON blacklist.risk_signal_revisions FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER assessments_append_only BEFORE UPDATE OR DELETE ON blacklist.risk_assessments FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER assessment_inputs_append_only BEFORE UPDATE OR DELETE ON blacklist.risk_assessment_inputs FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER assessment_factors_append_only BEFORE UPDATE OR DELETE ON blacklist.risk_assessment_factors FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER assessment_annotations_append_only BEFORE UPDATE OR DELETE ON blacklist.assessment_annotations FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
-- The current pointer only moves forward (compare-and-set by sequence) and never to another subject.
CREATE FUNCTION blacklist.current_assessment_forward() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF NEW.subject_id <> OLD.subject_id OR NEW.seq <= OLD.seq THEN
  RAISE EXCEPTION 'current assessment can only move forward' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER current_assessment_forward_only BEFORE UPDATE ON blacklist.current_risk_assessments FOR EACH ROW EXECUTE FUNCTION blacklist.current_assessment_forward();
REVOKE ALL ON FUNCTION blacklist.current_assessment_forward() FROM PUBLIC;
-- Signals, rulesets and the current pointer are never deleted (history and replay depend on them).
CREATE FUNCTION blacklist.reject_risk_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 RAISE EXCEPTION 'risk records cannot be deleted' USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER current_assessment_no_delete BEFORE DELETE ON blacklist.current_risk_assessments FOR EACH ROW EXECUTE FUNCTION blacklist.reject_risk_delete();
CREATE TRIGGER risk_signals_no_delete BEFORE DELETE ON blacklist.risk_signals FOR EACH ROW EXECUTE FUNCTION blacklist.reject_risk_delete();
CREATE TRIGGER risk_rulesets_no_delete BEFORE DELETE ON blacklist.risk_rulesets FOR EACH ROW EXECUTE FUNCTION blacklist.reject_risk_delete();
REVOKE ALL ON FUNCTION blacklist.reject_risk_delete() FROM PUBLIC;
