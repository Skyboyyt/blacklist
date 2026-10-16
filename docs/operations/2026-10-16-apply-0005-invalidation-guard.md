# Runbook: apply `0005_invalidation_guard.sql` to Neon staging

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-16 |
| Target | Neon staging database (ledger currently 10 entries) |
| Change | One additive migration from `main` (`db48b47`): an INSERT guard trigger and a unique index on `blacklist.chain_fact_invalidations` (review CR-14 D-1) |
| Status | **Applied to Neon staging by the owner on 2026-10-16 (owner-reported working; Step 4 output not yet reviewed by Claude)** |

## What it changes and why it is safe

- It **adds** a function, a `BEFORE INSERT` trigger and a unique index on `blacklist.chain_fact_invalidations`. It touches **no other table**, and no existing row is updated, deleted or re-checked (the trigger fires only on future inserts).
- The only way it can fail is if two existing invalidations share the same chain, type and subject. The unique index then cannot be built. The script runs in **one transaction**, so a failure changes nothing (rehearsed).
- Locks: a short `SHARE` / `SHARE ROW EXCLUSIVE` lock on that one table, which only the CLI reconciliation path writes. `lock_timeout` is 5 seconds. Users, sessions, sign-in and research are not affected.
- DDL runs **as `blacklist_migrator`** (the existing migrator role), never as the API runtime role `blacklist_app`. If your SQL Editor role is not the migrator but holds ADMIN on it, the script grants itself SET for **this transaction only** and revokes it before COMMIT. No lasting privilege change (rehearsed).
- The ledger row is written in the same transaction with the exact SHA-256 of the file on `main`, so the repository's runner and operator accept it later.
- **Rehearsal (2026-10-16, disposable PostgreSQL 18):** built at the same 10-entry state with an existing record in the table, then run as each possible editor role:

| Scenario | Result |
|---|---|
| Editor role is `blacklist_migrator` | Applied; 11 entries |
| Editor role is the owner with ADMIN | Applied; temporary SET revoked |
| Second run | Refused: "already applied", no change |
| Duplicate records present | Full rollback; still 10 entries; records intact |
| Existing record afterwards | Unchanged |
| Runtime role inserting a forged invalidation | Refused by the new guard |
| Runtime role updating a record | Still refused |
| Repository runner afterwards | Accepted all 11 checksums and applied nothing |

## Step 1: read-only checks (safe to run now)

Run in the Neon SQL Editor, on the staging database. These only read.

```sql
-- 1. Ledger vs main (read-only). Expect 10 x ok and 0005_invalidation_guard.sql MISSING (before), 11 x ok (after).
WITH expected(ord, name, sha256) AS (VALUES
  (1, '0000_fixed_alex_wilder.sql', '775f41df461cb2702685ae670216b272173ec14365999bd7f08b7bac3dcdaf29'),
  (2, '0001_rich_tomorrow_man.sql', 'f0e67d86f1c92eb764ef7cd541b3eef6eb39a36b3f5d30e3a986d2014edbe39d'),
  (3, '0002_material_thunderbird.sql', '8746fa0feb13db7fbca15952a1f0a96bb8ef207267471243e69a9ff35aa19cce'),
  (4, '0003_absurd_miek.sql', '54aa4549df9cc82ac2d4a5b61eb1dd3c4283fe16e233fcefce8d7f6713ca9c28'),
  (5, '0004_harsh_molten_man.sql', 'e46d1bcd6639a185009d2ddda6cad46a04b5933398e58e0db7987890a8d96eca'),
  (6, '0001_security_boundaries.sql', 'eccc90e793edf9a2bec8241b1527dc46d4e5990cb43567611c0426f6fe088642'),
  (7, '0002_identity_guards.sql', '197cd3b5cee18ed91ba6e12712740a96d0f7bd535b47d3e197ca11fdb60178c1'),
  (8, '0005_violet_stardust.sql', '0a29d177b7cb422cdbc4669f2d91ff9efe7568f93e905c9db0b5b28c23a8fffe'),
  (9, '0003_chain_research_foundation.sql', 'bac2ce3aa9fc0a80cb249d0a8205f892f50b3d1ffb6caa75410a54646a6c0d7b'),
  (10, '0004_pinned_transaction_time.sql', '4543f992ecbbdb7ecd0e62530dd59499641d7ec10614f369f4089f1655819db2'),
  (11, '0005_invalidation_guard.sql', '2e7b8e5a0247bdc472958a8c9350523c3231b3b4cae36a7a2cb3b7168fcfdfa6')
)
SELECT coalesce(e.ord, 99) AS ord, coalesce(e.name, a.name) AS name,
  CASE WHEN a.name IS NULL THEN 'MISSING'
       WHEN e.name IS NULL THEN 'UNEXPECTED'
       WHEN a.sha256 = e.sha256 THEN 'ok'
       ELSE 'CHECKSUM MISMATCH' END AS status,
  a.applied_at
FROM expected e FULL JOIN blacklist_migrations.applied a ON a.name = e.name
ORDER BY 1, 2;
```

```sql
-- 2. Safety pre-checks (read-only).
SELECT current_user, session_user,
  pg_has_role('blacklist_migrator', 'MEMBER') AS member_of_migrator,
  pg_has_role('blacklist_migrator', 'SET') AS can_set_migrator;
-- Must return zero rows, or the unique index cannot be created (the script would roll back safely).
SELECT chain_id, fact_type, fact_ref->>'subject' AS subject, count(*)
FROM blacklist.chain_fact_invalidations GROUP BY 1, 2, 3 HAVING count(*) > 1;
SELECT count(*) AS existing_invalidations FROM blacklist.chain_fact_invalidations;
-- Must all be false before applying.
SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'chain_invalidation_guard') AS guard_function_exists,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'chain_invalidation_insert_guard') AS guard_trigger_exists,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chain_fact_invalidations_one_per_fact') AS unique_index_exists;
SELECT pg_get_userbyid(relowner) AS table_owner FROM pg_class WHERE oid = 'blacklist.chain_fact_invalidations'::regclass;
SELECT (SELECT count(*) FROM blacklist.auth_users) AS users, (SELECT count(*) FROM blacklist.auth_sessions) AS sessions;
-- note these counts; they must be the same after applying
```

Expected:
- the ledger query shows 10 rows `ok` and `0005_invalidation_guard.sql` `MISSING`;
- the duplicates query returns **no rows**;
- the three `exists` flags are all `false`;
- the table owner is `blacklist_migrator`;
- either `current_user` is `blacklist_migrator`, or `member_of_migrator` is `true`.

**Stop and report instead of applying if** any row says `CHECKSUM MISMATCH` or `UNEXPECTED`, if duplicates exist, or if your role is neither the migrator nor a member of it.

## Step 2: restore point (before applying)

In the Neon Console: **Branches**, then **Create branch**, with parent = the staging database's current branch and **Head (current data)**. Name it `pre-0005-guard-2026-10-16`. A branch is an instant copy-on-write snapshot; it does not touch the live branch, its data or its connection string. Confirm it appears in the branch list with today's timestamp. Do not point Render or Vercel at it. The Free plan also keeps about 6 hours of point-in-time history and allows one manual snapshot (see `render-staging.md`), as a second fallback. Delete it later, once the change is confirmed.

## Step 3: apply (only after the owner approves)

Paste the whole block and run it once:

```sql
-- Blacklist staging: apply ONLY 0005_invalidation_guard.sql as blacklist_migrator,
-- atomically with its ledger row. Any error rolls back everything.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- If the editor role is not blacklist_migrator and may not SET it, grant SET for this
-- transaction only; it is revoked again before COMMIT (no lasting privilege change).
DO $role$ BEGIN
  IF current_user <> 'blacklist_migrator' AND NOT pg_has_role('blacklist_migrator', 'SET') THEN
    EXECUTE 'GRANT blacklist_migrator TO ' || quote_ident(current_user) || ' WITH INHERIT FALSE, SET TRUE';
    PERFORM set_config('blacklist.temporary_set_grant', current_user, true);
  END IF;
END $role$;
SET LOCAL ROLE blacklist_migrator;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM blacklist_migrations.applied WHERE name = '0005_invalidation_guard.sql') THEN
    RAISE EXCEPTION 'already applied; nothing changed';
  END IF;
  IF (SELECT count(*) FROM blacklist_migrations.applied) <> 10 THEN
    RAISE EXCEPTION 'ledger is not at the expected 10 entries; nothing changed';
  END IF;
END $guard$;
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
INSERT INTO blacklist_migrations.applied(name, sha256)
  VALUES ('0005_invalidation_guard.sql', '2e7b8e5a0247bdc472958a8c9350523c3231b3b4cae36a7a2cb3b7168fcfdfa6');
RESET ROLE;
DO $role$ DECLARE granted text := current_setting('blacklist.temporary_set_grant', true); BEGIN
  IF coalesce(granted, '') <> '' THEN
    EXECUTE 'REVOKE blacklist_migrator FROM ' || quote_ident(granted);
  END IF;
END $role$;
COMMIT;
```

If any statement errors, the transaction rolls back and nothing is changed. Report the error text, with no connection strings or passwords.

## Step 4: verify

Run the Step 1 ledger query again: expect **11 rows, all `ok`**. Then:

```sql
-- 3. After applying (read-only). Run query 1 again first: expect 11 x ok.
SELECT tgname, tgenabled = 'O' AS enabled FROM pg_trigger
WHERE tgrelid = 'blacklist.chain_fact_invalidations'::regclass AND NOT tgisinternal ORDER BY 1;
-- expect chain_invalidation_insert_guard and invalidations_append_only, both enabled
SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'chain_fact_invalidations_one_per_fact';
SELECT pg_get_userbyid(proowner) AS function_owner, proacl FROM pg_proc WHERE proname = 'chain_invalidation_guard';
-- expect owner blacklist_migrator and no PUBLIC execute
SELECT has_table_privilege('blacklist_app', 'blacklist.chain_fact_invalidations', 'INSERT') AS app_insert,
  has_table_privilege('blacklist_app', 'blacklist.chain_fact_invalidations', 'UPDATE') AS app_update,
  has_table_privilege('blacklist_app', 'blacklist.chain_fact_invalidations', 'DELETE') AS app_delete,
  pg_has_role('blacklist_migrator', 'SET') AS editor_can_still_set_migrator;
-- expect true, false, false, and false unless your editor role is blacklist_migrator itself
SELECT count(*) AS existing_invalidations FROM blacklist.chain_fact_invalidations;
-- expect the same number as the pre-check
SELECT (SELECT count(*) FROM blacklist.auth_users) AS users, (SELECT count(*) FROM blacklist.auth_sessions) AS sessions;
-- record before and after: must be unchanged
```

## Rollback

- A failure during Step 3 needs no rollback; the transaction is atomic.
- After a successful commit, do **not** edit or drop the migration. Any change is a new migration (AGENTS §7).
- If something unexpected appears, the `pre-0005-guard-2026-10-16` branch holds the exact prior state for comparison or restore. Restoring would discard any writes made after the snapshot, so it is a last resort.
