-- Phase 9a (moderation design §2–§4, data-model §5–§6): history tables are append-only.
-- blacklist.reject_mutation() is defined in 0001_security_boundaries.sql.
CREATE TRIGGER report_history_append_only BEFORE UPDATE OR DELETE ON blacklist.report_status_history FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER case_messages_append_only BEFORE UPDATE OR DELETE ON blacklist.moderation_case_messages FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER case_notes_append_only BEFORE UPDATE OR DELETE ON blacklist.moderation_case_notes FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER finding_revisions_append_only BEFORE UPDATE OR DELETE ON blacklist.finding_revisions FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER approval_events_append_only BEFORE UPDATE OR DELETE ON blacklist.finding_approval_events FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER publication_events_append_only BEFORE UPDATE OR DELETE ON blacklist.finding_publication_events FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER decisions_append_only BEFORE UPDATE OR DELETE ON blacklist.moderation_decisions FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER decision_evidence_append_only BEFORE UPDATE OR DELETE ON blacklist.decision_evidence FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER finding_history_append_only BEFORE UPDATE OR DELETE ON blacklist.finding_status_history FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER custody_events_append_only BEFORE UPDATE OR DELETE ON blacklist.evidence_custody_events FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
-- A publication event must name the same revision as its causing approval, which must be an
-- 'approve' event with the revision's exact content hash (moderation §4.2 checks 1–2).
CREATE FUNCTION blacklist.publication_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
DECLARE a blacklist.finding_approval_events; r blacklist.finding_revisions;
BEGIN
 SELECT * INTO a FROM blacklist.finding_approval_events WHERE id=NEW.cause_approval_event_id;
 SELECT * INTO r FROM blacklist.finding_revisions WHERE id=NEW.revision_id;
 IF NOT FOUND OR a.event<>'approve' OR a.publication_blocked IS NOT NULL OR a.revision_id<>NEW.revision_id
    OR a.finding_id<>NEW.finding_id OR a.revision_content_hash<>r.content_hash THEN
  RAISE EXCEPTION 'publication requires a matching unblocked approval' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER publication_insert_guard BEFORE INSERT ON blacklist.finding_publication_events FOR EACH ROW EXECUTE FUNCTION blacklist.publication_guard();
REVOKE ALL ON FUNCTION blacklist.publication_guard() FROM PUBLIC;
