-- Forward-only guards. Account kind is fixed at creation; dedicated staff
-- enrollment cannot be replaced with converting an existing member account.
CREATE FUNCTION blacklist.reject_kind_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, blacklist AS $$
BEGIN
  IF NEW.account_kind IS DISTINCT FROM OLD.account_kind THEN
    RAISE EXCEPTION 'account kind is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_kind_immutable BEFORE UPDATE ON blacklist.auth_users
FOR EACH ROW EXECUTE FUNCTION blacklist.reject_kind_change();
REVOKE ALL ON FUNCTION blacklist.reject_kind_change() FROM PUBLIC;
