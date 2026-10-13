-- Acceptance fixture; not a production migration.
CREATE FUNCTION gate.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON gate.audit_log
FOR EACH ROW EXECUTE FUNCTION gate.reject_mutation();
CREATE TRIGGER deliveries_append_only BEFORE UPDATE OR DELETE ON gate.security_email_deliveries
FOR EACH ROW EXECUTE FUNCTION gate.reject_mutation();
CREATE FUNCTION gate.canonical_json(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, gate AS $$
DECLARE encoded text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    SELECT '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || gate.canonical_json(item), ',' ORDER BY key COLLATE "C"), '') || '}'
      INTO encoded FROM jsonb_each(value) AS entries(key, item);
    RETURN encoded;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT '[' || coalesce(string_agg(gate.canonical_json(item), ',' ORDER BY ordinal), '') || ']'
      INTO encoded FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item, ordinal);
    RETURN encoded;
  ELSE
    RETURN value::text;
  END IF;
END;
$$;
CREATE FUNCTION gate.append_audit(event_action text, target uuid, event_details jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, gate AS $$
DECLARE
  next_seq bigint;
  prior_hash text;
  row_id uuid := uuidv7();
  event_time timestamptz := clock_timestamp();
  event_row jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(730023);
  SELECT seq + 1, row_hash INTO next_seq, prior_hash FROM gate.audit_log ORDER BY seq DESC LIMIT 1;
  next_seq := coalesce(next_seq, 1);
  prior_hash := coalesce(prior_hash, repeat('0', 64));
  event_row := jsonb_build_object('seq', next_seq, 'id', row_id, 'occurred_at', to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', event_action, 'target_id', target, 'details', event_details);
  INSERT INTO gate.audit_log VALUES (next_seq, row_id, event_time, event_action, target,
      event_details, prior_hash, encode(sha256(convert_to(prior_hash || gate.canonical_json(event_row), 'UTF8')), 'hex'));
  RETURN next_seq;
END;
$$;
REVOKE ALL ON FUNCTION gate.append_audit(text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION gate.reject_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION gate.canonical_json(jsonb) FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gate TO gate_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON gate.audit_log FROM gate_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON gate.security_email_deliveries FROM gate_runtime;
GRANT EXECUTE ON FUNCTION gate.append_audit(text, uuid, jsonb) TO gate_runtime;
GRANT USAGE ON SCHEMA gate TO gate_runtime;
