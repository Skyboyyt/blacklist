# Runbook: staff recovery and break-glass drills

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-17 (Phase 11, workstream 5), from `packages/domain/src/staff/recovery.ts`, `operators.ts` and identity §10.10–§10.13 |
| Status | **Not yet performed.** Both are launch checklist items |
| Where | **Staging only.** Never on production |
| Cost | None |

There are three situations. Each has its own drill.

| Situation | Who can fix it | Section |
|---|---|---|
| A staff member lost **one** of their two security keys | They fix it themselves | A |
| A staff member lost **all** their security keys | Two other staff verify them, a second admin approves, then a 24-hour wait | B |
| **Every** admin is locked out | The operator, using the break-glass command | C |

## A. One security key lost (self-service)

1. Sign in with the remaining key.
2. Open **Settings → Security → Staff** (`/settings/security/staff`), remove the lost key, and register a new one.
3. Until you have two keys again, your account is flagged. After **7 days** with fewer than two, your staff powers are suspended.
4. If the lost key was synced with the remaining one (for example, both are passkeys in the same phone account), treat it as a possible break-in and use **B** instead.

**Drill:** register a third key, then remove it. That proves the add and remove screens work.

## B. All security keys lost (staff recovery)

### Who is needed

The code enforces these rules:

- The **subject** is the person who lost their keys.
- **Opener:** an admin who is not the subject.
- **Two verifiers:** two different staff members (moderator or admin), neither of them the subject, and at least one an admin. Each records how they checked the person's identity (for example "video call") and why they are satisfied.
- **Approver:** an admin who is not the opener and not the subject.

So the drill needs **at least two admins plus the subject**. For example: admin A opens the case and verifies; admin B verifies and approves; the subject is a test staff account. Today there is only one admin, so **this drill must wait for a second admin**.

### Steps

1. **Admin A** opens a recovery case for the subject on **Admin → Staff** (`/admin/staff`), confirming with their security key. The subject is suspended at once: signed out, keys removed.
2. **Admin A** and **admin B** each verify the subject's identity on **Moderation → Recovery** (`/mod/recovery`) and record method and reason.
3. **Admin B** approves, confirming with their security key.
4. A **24-hour objection window** starts. All admins and the subject's own email are told. The subject's email contains a link to object if they did **not** ask for this. For the drill, don't object.
5. After 24 hours, an admin completes the case. The subject gets a new enrollment email. **The enrollment code is given to them over the channel used to verify them** (for example, read out on the video call), never by email.
6. The subject sets a new password and registers two new keys.

**Optional extra test:** run the drill once more and, during step 4, use the subject's objection link. The case should stop (state `objected`).

## C. Break-glass: every admin is locked out

### What it does

From the operator's computer, the command:

- signs **every** staff member out and invalidates their sessions;
- creates a 24-hour **admin** invitation for the email given, printing the enrollment code on screen;
- writes an audit record with the incident reference;
- emails every staff member that break-glass was used.

It needs the setting `BREAK_GLASS_ENABLED=true`, and the email must be one that no account uses yet.

### Finding P11-01: the safety switch is on the operator's computer

The design (identity §10.13) treats `BREAK_GLASS_ENABLED` as a setting on the **hosting platform**, whose change history shows that someone turned it on. In fact the command reads the setting from the operator's **local** settings file (`infrastructure/local/.env`), the same file used for bootstrap. Anyone who has the API's database credentials and auth secret can therefore run break-glass without touching Render, so Render's change history records nothing.

What still protects us:

- the audit record;
- the email to every staff member;
- everyone being signed out, which is noticeable.

**Recommendation:** treat the API's database credentials and auth secret as "break-glass level". Only the owner holds them, and they are never on a shared computer. Before launch, decide P-13: who the operator is, and whether a second person must agree before break-glass. A technical fix (for example, the command checking a value only Render holds) needs an ADR and is listed in the Phase 11 plan.

### Drill steps (staging)

**Warning:** this signs out every staff member, including you.

1. Choose an incident name like `INC-DRILL-2026-10-20` and a **new** email address that no account uses. A drill doubles as a way to create a second admin, if the email belongs to the person you want as second admin.
2. Open the **worker's** `/healthz` web address and wait until it answers. The invitation email is only sent while the worker is awake, within 15 minutes.
3. Create `infrastructure\local\.env` exactly as for the bootstrap (see [staff bootstrap runbook](2026-10-17-staff-bootstrap.md), step 1), and add one line: `BREAK_GLASS_ENABLED=true`.
4. In the project folder, run (one line):
   `node --env-file=infrastructure/local/.env apps/api/src/cli/staff.ts --command break-glass --email <new email> --incident INC-DRILL-2026-10-20 --operator "<your name>"`
5. Write down the enrollment code it prints. Give it to the new admin **by phone or in person**, not by email.
6. **Delete `infrastructure\local\.env` straight away.** Deleting the file also removes the break-glass setting.
7. Check:
   - you were signed out, and you can sign back in with your keys;
   - every staff member received the break-glass email;
   - the new admin receives the enrollment email and can register;
   - **Admin → Audit** shows `staff.breakglass.invoked` with your incident name.
8. Write a short post-incident note: what was done, by whom, when, and why. A review is required after every break-glass, drills included.

## Result

| Drill | Date | Performed by | Result | Notes |
|---|---|---|---|---|
| A. One key lost | | | | |
| B. Staff recovery | | | | |
| C. Break-glass | | | | |
