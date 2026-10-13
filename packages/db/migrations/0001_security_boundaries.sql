-- Reviewed hand migration. Run only as the schema-owning migrator.
-- No rewrite of live data; all objects are new. Lock/statement timeouts come from runner.
CREATE FUNCTION blacklist.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only table' USING ERRCODE = '42501'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON blacklist.audit_log
FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE TRIGGER deliveries_append_only BEFORE UPDATE OR DELETE ON blacklist.security_email_deliveries
FOR EACH ROW EXECUTE FUNCTION blacklist.reject_mutation();
CREATE FUNCTION blacklist.canonical_json(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, blacklist AS $$
DECLARE encoded text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    SELECT '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || blacklist.canonical_json(item), ',' ORDER BY key COLLATE "C"), '') || '}'
      INTO encoded FROM jsonb_each(value) AS entries(key,item);
    RETURN encoded;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT '[' || coalesce(string_agg(blacklist.canonical_json(item), ',' ORDER BY ordinal),'') || ']'
      INTO encoded FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item,ordinal);
    RETURN encoded;
  ELSE RETURN value::text;
  END IF;
END;
$$;
CREATE FUNCTION blacklist.append_audit(event jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, blacklist AS $$
DECLARE next_seq bigint; prior_hash text; row_id uuid := uuidv7();
  event_time timestamptz := date_trunc('milliseconds',clock_timestamp()); event_row jsonb;
BEGIN
  IF NOT (event ?& ARRAY['actor_type','actor_ref','action','target_type','target_id','details']) OR
     event->>'actor_type' NOT IN ('user','system','cli') OR jsonb_typeof(event->'details') <> 'object' OR
     octet_length(event::text) > 8192 OR EXISTS (SELECT 1 FROM jsonb_object_keys(event) k WHERE k NOT IN
       ('actor_type','actor_ref','actor_session_ref','actor_label','action','target_type','target_id','request_id','ip_prefix','details')) THEN
    RAISE EXCEPTION 'invalid audit event';
  END IF;
  PERFORM pg_advisory_xact_lock(730024);
  SELECT seq+1,row_hash INTO next_seq,prior_hash FROM blacklist.audit_log ORDER BY seq DESC LIMIT 1;
  next_seq := coalesce(next_seq,1); prior_hash := coalesce(prior_hash,repeat('0',64));
  event_row := jsonb_build_object('seq',next_seq,'id',row_id,'occurred_at',to_char(event_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor_type',event->>'actor_type','actor_ref',event->>'actor_ref','actor_session_ref',event->>'actor_session_ref',
    'actor_label',event->>'actor_label','action',event->>'action','target_type',event->>'target_type','target_id',event->>'target_id',
    'request_id',event->>'request_id','ip_prefix',event->>'ip_prefix','details',event->'details');
  INSERT INTO blacklist.audit_log(seq,id,occurred_at,actor_type,actor_ref,actor_session_ref,actor_label,action,target_type,target_id,request_id,ip_prefix,details,prev_hash,row_hash)
    VALUES(next_seq,row_id,event_time,event->>'actor_type',event->>'actor_ref',event->>'actor_session_ref',event->>'actor_label',
    event->>'action',event->>'target_type',event->>'target_id',event->>'request_id',event->>'ip_prefix',event->'details',prior_hash,
    encode(sha256(convert_to(prior_hash || blacklist.canonical_json(event_row),'UTF8')),'hex'));
  RETURN next_seq;
END;
$$;
CREATE FUNCTION blacklist.staff_role_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, blacklist AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM blacklist.auth_users WHERE id = NEW.user_id AND account_kind = 'staff') THEN
    RAISE EXCEPTION 'staff role requires dedicated staff account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_role_account_guard BEFORE INSERT OR UPDATE ON blacklist.user_role_assignments
FOR EACH ROW EXECUTE FUNCTION blacklist.staff_role_guard();
INSERT INTO blacklist.system_state(key) VALUES (1);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA blacklist FROM PUBLIC;
