# Runbook: database restore drill (Neon)

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-17 (Phase 11, workstream 4) |
| Status | **Not yet performed.** Record the result at the bottom |
| Who | The owner, in the Neon website. About 20 minutes |
| Cost | None. It uses one temporary branch, deleted at the end |
| Launch checklist item | "Restore drill performed and timed" |

## Why

If the database is damaged (a bad script, a mistake, an attack), we must be able to get it back as it was at an earlier moment. This drill proves that works **before** we need it, and tells us how long it takes.

A restore here never touches the live data. Neon makes a **copy** of the database as it was at a chosen time, as a new branch. The live `staging` branch keeps running.

## Before you start

- Write down the time you start.
- In Neon, open the project **blacklist-staging**, then **Settings**, and look for the **restore window** (also called history retention). It says how far back you can go. Choose a time inside it, for example **one hour ago**.

## Steps

1. **Note today's numbers on the live branch.**
   1. In Neon, click **SQL Editor**.
   2. At the top, check the branch says **`staging`** and the database says **`blacklist_staging`**.
   3. Paste this and click **Run**:
      ```sql
      SELECT (SELECT count(*) FROM blacklist_migrations.applied) AS ledger,
             (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'blacklist') AS tables,
             (SELECT count(*) FROM blacklist.audit_log) AS audit_rows;
      ```
   4. Write the three numbers down.
2. **Make the restored copy.**
   1. Click **Branches** in the left menu, then **Create branch** (or **New branch**).
   2. Name it `restore-drill-YYYY-MM-DD` (today's date).
   3. Parent: **`staging`**.
   4. Choose the option for **past data** (it may say "Point in time" or "Specific time") and pick the time you chose, for example one hour ago.
   5. Click **Create**. Do **not** copy or reveal any connection string Neon shows; you don't need it.
3. **Check the copy.**
   1. Go back to **SQL Editor**.
   2. At the top, switch the branch to **`restore-drill-…`**. The database stays `blacklist_staging`.
   3. Run the same query as step 1.
   4. Expected: `ledger` and `tables` match step 1, unless a script was applied in the last hour. `audit_rows` is the same or a little lower, because actions after the chosen time are not in the copy.
4. **Switch back.** At the top of the SQL Editor, switch the branch back to **`staging`**. (Last time a script went to the wrong branch; always switch back.)
5. **Delete the copy.** Click **Branches**, open `restore-drill-…`, and choose **Delete**. Check you are deleting the drill branch, **not** `staging`.
6. Write down the end time.

While you are on the Branches page, the old backup branch `pre-phase10-2026-10-17` is no longer needed and can be deleted the same way.

## What to send Claude

The three numbers from step 1, the three numbers from step 3, the time you chose, and how many minutes the drill took. **Do not** send connection strings or passwords.

## In a real emergency (not part of the drill)

A real restore means switching the API and worker to the restored data. That needs the database's connection settings to change on Render. Don't attempt it alone: tell Claude what happened and when, and we'll go through it step by step. Production will need its own tested version of this runbook.

## Result

| Date | Point in time chosen | Live numbers (ledger / tables / audit) | Restored numbers | Minutes | Done by |
|---|---|---|---|---|---|
| | | | | | |
