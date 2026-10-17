# Runbook: apply `0006_easy_impossible_man.sql` (recovery objections) to Neon staging

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-16 |
| Target | Neon staging database (ledger at 11 entries after the 0005 runbook) |
| Change | One generated migration for ADR 0013 C: tables `staff_recovery_objections` and `staff_recovery_objection_links`, column `staff_recovery_cases.reopens_case_id`, and `one_open_recovery` rebuilt to exclude `objected` cases |
| Status | **Applied to Neon staging (`blacklist_staging`) by the owner on 2026-10-16 at 19:31 UTC.** An earlier owner report of "12 rows ok" did not match this database: on 2026-10-16 it still showed 11 entries and 34 tables, so 0006 was applied then. Verified with the 14-row ledger query (rows 1–12 `ok`) |

## Order matters

1. Merge the PR (owner approval).
2. Apply this migration to Neon (Steps 1–4).
3. Then deploy the Render API and worker (manual deploy; auto-deploy is off), and Vercel.

The new code reads the new tables, so deploying it first would make the admin recovery screens fail. The old code keeps working against the new schema (the change is additive). No new queue is needed: the subject's objection link rides the existing `identity.security_notice` queue.

## What it changes and why it is safe

- **Adds** two empty tables and one nullable column. No existing row is updated, deleted or rewritten.
- **Rebuilds one partial unique index** (`one_open_recovery`) on `staff_recovery_cases`, which has at most a handful of rows. The new predicate is looser (it also excludes `objected`), so it cannot fail on existing data.
- New foreign keys and the `recovery_reopens_other` CHECK only involve the new column, which is null on every existing row.
- Locks: brief `ACCESS EXCLUSIVE` on `staff_recovery_cases` (index rebuild, column add). Recovery screens pause for milliseconds; sign-in, research and members are unaffected. `lock_timeout` is 5 seconds.
- DDL runs **as `blacklist_migrator`**, never as `blacklist_app`, with the same temporary-SET handling as the 0005 runbook.
- The runtime role gets exactly what the repository runner would grant: SELECT, INSERT, UPDATE and DELETE on the link table; SELECT, INSERT and UPDATE on the objection table (**no DELETE**: objections are history).
- The ledger row uses the exact SHA-256 of the file on the branch: `8421e441188518328d9b42c2218ab011b227c9da4971fdf5f152c0dd626592ca`.

**Rehearsal (2026-10-16, disposable PostgreSQL 18, pinned image):** 11 entries applied by the repository runner from `4b148a9`, an existing staff user and open recovery case seeded, then Step 3 run as an owner role that holds ADMIN on `blacklist_migrator` without SET (the Neon situation):

| Check | Result |
|---|---|
| Apply as the owner role | Applied; 12 entries; 36 tables |
| `one_open_recovery` | Rebuilt with `objected` excluded |
| Runtime grants | Objections: INSERT yes, DELETE no. Links: UPDATE yes. Owner `blacklist_migrator` |
| Existing recovery case | Unchanged (`reopens_case_id` null) |
| Temporary SET for the editor role | Revoked (false afterwards) |
| Second run | Refused: "already applied; nothing changed" |
| Repository runner afterwards | Accepted all 12 checksums and applied nothing; objections DELETE still revoked |
| Runtime role deleting an objection | `permission denied` |

The only notice is PostgreSQL truncating one generated foreign-key name to 63 characters, which the repository runner produces identically.

## Step 1: read-only checks

Run the ledger query from the [0005 runbook](2026-10-16-apply-0005-invalidation-guard.md) (Step 1, query 1): expect **11 rows `ok`**. Then:

```sql
SELECT current_user, pg_has_role('blacklist_migrator', 'MEMBER') AS member_of_migrator;
SELECT to_regclass('blacklist.staff_recovery_objections') AS objections_table,
  to_regclass('blacklist.staff_recovery_objection_links') AS links_table,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'blacklist'
    AND table_name = 'staff_recovery_cases' AND column_name = 'reopens_case_id') AS reopens_column;
-- expect null, null, false
SELECT state, count(*) FROM blacklist.staff_recovery_cases GROUP BY 1;
SELECT (SELECT count(*) FROM blacklist.auth_users) AS users, (SELECT count(*) FROM blacklist.auth_sessions) AS sessions;
-- note these counts; they must be the same after applying
```

**Stop and report** if the ledger is not 11 × `ok`, if either table already exists, or if your role is neither the migrator nor a member of it.

## Step 2: restore point

Neon Console: **Branches**, **Create branch** from the staging branch at **Head (current data)**, named `pre-0006-recovery-2026-10-16`. Do not point Render or Vercel at it.

## Step 3: apply (only after the owner approves)

```sql
-- Blacklist staging: apply ONLY generated/0006_easy_impossible_man.sql as blacklist_migrator,
-- atomically with its grants and ledger row. Any error rolls back everything.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $role$ BEGIN
  IF current_user <> 'blacklist_migrator' AND NOT pg_has_role('blacklist_migrator', 'SET') THEN
    EXECUTE 'GRANT blacklist_migrator TO ' || quote_ident(current_user) || ' WITH INHERIT FALSE, SET TRUE';
    PERFORM set_config('blacklist.temporary_set_grant', current_user, true);
  END IF;
END $role$;
SET LOCAL ROLE blacklist_migrator;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM blacklist_migrations.applied WHERE name = '0006_easy_impossible_man.sql') THEN
    RAISE EXCEPTION 'already applied; nothing changed';
  END IF;
  IF (SELECT count(*) FROM blacklist_migrations.applied) <> 11 THEN
    RAISE EXCEPTION 'ledger is not at the expected 11 entries; nothing changed';
  END IF;
END $guard$;
-- ---- begin generated/0006_easy_impossible_man.sql (verbatim) ----
CREATE TABLE "blacklist"."staff_recovery_objection_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"case_id" uuid NOT NULL,
	"token_hash" text,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "staff_recovery_objection_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "recovery_link_state_valid" CHECK ("blacklist"."staff_recovery_objection_links"."state" in ('pending_delivery','active','objected','withdrawn','invalidated')),
	CONSTRAINT "recovery_link_hash_state" CHECK (("blacklist"."staff_recovery_objection_links"."token_hash" is null) = ("blacklist"."staff_recovery_objection_links"."state" in ('invalidated','withdrawn')))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_recovery_objections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"case_id" uuid NOT NULL,
	"objector" text NOT NULL,
	"objector_kind" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "recovery_objector_kind_valid" CHECK ("blacklist"."staff_recovery_objections"."objector_kind" in ('staff','subject','operator')),
	CONSTRAINT "recovery_staff_objection_reason" CHECK ("blacklist"."staff_recovery_objections"."objector_kind" = 'subject' or char_length("blacklist"."staff_recovery_objections"."reason") between 10 and 1000)
);
--> statement-breakpoint
DROP INDEX "blacklist"."one_open_recovery";--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD COLUMN "reopens_case_id" uuid;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_objection_links" ADD CONSTRAINT "staff_recovery_objection_links_case_id_staff_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_objections" ADD CONSTRAINT "staff_recovery_objections_case_id_staff_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_objections_by_objector" ON "blacklist"."staff_recovery_objections" USING btree ("objector","created_at");--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD CONSTRAINT "recovery_reopens_case_fk" FOREIGN KEY ("reopens_case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_reopen_per_case" ON "blacklist"."staff_recovery_cases" USING btree ("reopens_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_recovery" ON "blacklist"."staff_recovery_cases" USING btree ("subject_user_id") WHERE "blacklist"."staff_recovery_cases"."state" not in ('completed','cancelled','objected');--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD CONSTRAINT "recovery_reopens_other" CHECK ("blacklist"."staff_recovery_cases"."reopens_case_id" is null or "blacklist"."staff_recovery_cases"."reopens_case_id" <> "blacklist"."staff_recovery_cases"."id");
-- ---- end generated/0006_easy_impossible_man.sql ----
GRANT SELECT, INSERT, UPDATE, DELETE ON blacklist.staff_recovery_objection_links TO blacklist_app;
GRANT SELECT, INSERT, UPDATE ON blacklist.staff_recovery_objections TO blacklist_app;
INSERT INTO blacklist_migrations.applied(name, sha256)
  VALUES ('0006_easy_impossible_man.sql', '8421e441188518328d9b42c2218ab011b227c9da4971fdf5f152c0dd626592ca');
RESET ROLE;
DO $role$ DECLARE granted text := current_setting('blacklist.temporary_set_grant', true); BEGIN
  IF coalesce(granted, '') <> '' THEN
    EXECUTE 'REVOKE blacklist_migrator FROM ' || quote_ident(granted);
  END IF;
END $role$;
COMMIT;
```

## Step 4: verify

Run this ledger query (the 0005 runbook's query lists only 11 files, so it would mark row 12 `UNEXPECTED`). Expect **12 rows `ok`**:

```sql
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
  (11, '0005_invalidation_guard.sql', '2e7b8e5a0247bdc472958a8c9350523c3231b3b4cae36a7a2cb3b7168fcfdfa6'),
  (12, '0006_easy_impossible_man.sql', '8421e441188518328d9b42c2218ab011b227c9da4971fdf5f152c0dd626592ca')
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

Then:

```sql
SELECT count(*) AS tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'blacklist' AND c.relkind IN ('r','p');                     -- expect 36
SELECT indexdef FROM pg_indexes WHERE indexname = 'one_open_recovery';        -- predicate includes 'objected'
SELECT has_table_privilege('blacklist_app', 'blacklist.staff_recovery_objections', 'INSERT') AS obj_insert,
  has_table_privilege('blacklist_app', 'blacklist.staff_recovery_objections', 'DELETE') AS obj_delete,
  has_table_privilege('blacklist_app', 'blacklist.staff_recovery_objection_links', 'UPDATE') AS link_update,
  pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'blacklist.staff_recovery_objections'::regclass)) AS owner;
-- expect true, false, true, blacklist_migrator
SELECT state, count(*) FROM blacklist.staff_recovery_cases GROUP BY 1;     -- same as Step 1
SELECT (SELECT count(*) FROM blacklist.auth_users) AS users, (SELECT count(*) FROM blacklist.auth_sessions) AS sessions;
-- must be unchanged
```

## Rollback

- A failure in Step 3 needs no rollback; the transaction is atomic.
- After commit, never edit or drop the migration; any change is a new migration (AGENTS §7).
- The `pre-0006-recovery-2026-10-16` branch holds the prior state for comparison or, as a last resort, restore.
