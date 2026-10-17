-- Phase 9b (data-model §5, ADR 0004, ADR 0020). Stored objects and derivatives are history:
-- their identity, location and hashes never change and rows are never deleted. Purging the
-- bytes is recorded once, by setting the purge columns.
CREATE FUNCTION blacklist.evidence_object_purge_once() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'evidence objects cannot be deleted' USING ERRCODE='42501'; END IF;
 IF OLD.purged_at IS NOT NULL OR NEW.purged_at IS NULL
    OR (NEW.id, NEW.evidence_item_id, NEW.role, NEW.bucket, NEW.storage_key, NEW.object_version_id, NEW.sha256, NEW.size_bytes, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.evidence_item_id, OLD.role, OLD.bucket, OLD.storage_key, OLD.object_version_id, OLD.sha256, OLD.size_bytes, OLD.created_at) THEN
  RAISE EXCEPTION 'an evidence object can only be marked purged, once' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER evidence_objects_purge_once BEFORE UPDATE OR DELETE ON blacklist.evidence_objects FOR EACH ROW EXECUTE FUNCTION blacklist.evidence_object_purge_once();
REVOKE ALL ON FUNCTION blacklist.evidence_object_purge_once() FROM PUBLIC;
CREATE FUNCTION blacklist.evidence_derivative_purge_once() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,blacklist AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'evidence derivatives cannot be deleted' USING ERRCODE='42501'; END IF;
 IF OLD.purged_at IS NOT NULL OR NEW.purged_at IS NULL
    OR (NEW.id, NEW.evidence_item_id, NEW.kind, NEW.bucket, NEW.storage_key, NEW.sha256, NEW.size_bytes, NEW.format, NEW.width, NEW.height, NEW.processor_version, NEW.created_by_ref, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.evidence_item_id, OLD.kind, OLD.bucket, OLD.storage_key, OLD.sha256, OLD.size_bytes, OLD.format, OLD.width, OLD.height, OLD.processor_version, OLD.created_by_ref, OLD.created_at) THEN
  RAISE EXCEPTION 'an evidence derivative can only be marked purged, once' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER evidence_derivatives_purge_once BEFORE UPDATE OR DELETE ON blacklist.evidence_derivatives FOR EACH ROW EXECUTE FUNCTION blacklist.evidence_derivative_purge_once();
REVOKE ALL ON FUNCTION blacklist.evidence_derivative_purge_once() FROM PUBLIC;
