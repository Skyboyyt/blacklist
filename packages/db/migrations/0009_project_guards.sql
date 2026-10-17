-- Phase 10 slice 3 (data-model §4): project profile revisions are append-only.
-- blacklist.reject_mutation() is defined in 0001_security_boundaries.sql.
CREATE TRIGGER project_revisions_append_only BEFORE UPDATE OR DELETE ON blacklist.project_revisions FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
