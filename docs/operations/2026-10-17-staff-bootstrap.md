# Runbook: create the first staff administrator (bootstrap)

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-17, from the owner's first bootstrap on Neon staging (`blacklist_staging`) |
| Status | **Done on staging 2026-10-17.** The first admin is enrolled; bootstrap now refuses to run again (identity §10.3) |
| Needs | Node 24, the repository on `main`, the Render **API** service's settings, a staff email that no account uses and that the mail sender can reach, two passkeys or security keys |

## Lessons from the first run

1. **Clone `main`.** The GitHub default branch was still `chore/initial-repository`, which has no operator CLI. Use `git checkout main` after cloning, or switch the default branch.
2. **Wake the worker first.** The worker sends an invitation only within **15 minutes** of its creation. On Render Free the worker sleeps, and the CLI does not wake it. If it wakes later, the job completes without sending, and the invitation is unusable until it expires (24 hours). Open the worker's `/healthz` URL and wait for a reply **before** running the command.
3. **The mail sender must reach the staff address.** With `EMAIL_FROM=onboarding@resend.dev`, Resend delivers only to its own account address. The staff email must be different from every member email, so staging used a second Resend account for the staff address. **Public sign-up emails reach only that address until a domain is verified in Resend** (launch blocker).
4. **A first connection can fail while Neon wakes.** The CLI now prints a safe reason; on `unavailable`, retry once.
5. **Write the enrollment code down at once.** It is shown once and stored only as a hash.

## Steps

1. Create `infrastructure\local\.env` with `NODE_ENV=production`, `DATABASE_URL`, `APP_ORIGIN`, `BETTER_AUTH_SECRET`, `WEBAUTHN_RP_ID` and `INTERNAL_API_TOKEN`, copied from the Render **API** service (the runtime role `blacklist_app`; the CLI refuses a more powerful role). Do not set `DEPLOYMENT_ENV`.
2. Open the worker's `/healthz` URL and wait for a reply.
3. Run `node --env-file=infrastructure/local/.env apps/api/src/cli/staff.ts --command bootstrap --email <staff email> --operator "<name>"` and write down the enrollment code.
4. Delete `infrastructure\local\.env`.
5. Open the "Blacklist staff enrollment" email, enter the code, choose a password and register two authenticators on different devices.

## Recovering a stuck invitation

If no email arrives, check the invitation and its job (read-only):

```sql
SELECT i.state, i.delivered_at IS NOT NULL AS delivered, i.expires_at,
       (SELECT string_agg(j.state::text, ', ') FROM pgboss.job j
         WHERE j.name = 'identity.staff_invitation.issue' AND j.data->>'invitationId' = i.id::text) AS job
FROM blacklist.staff_invitations i WHERE i.basis = 'bootstrap' ORDER BY i.created_at DESC LIMIT 1;
```

A job `completed` with `delivered = false` means it ran too late. The owner then marked that one undeliverable invitation `expired`, which is outside the application and has no audit row (recorded here and in AI_HANDOFF), and ran the bootstrap again:

```sql
UPDATE blacklist.staff_invitations SET state = 'expired'
WHERE basis = 'bootstrap' AND state = 'issued' AND delivered_at IS NULL AND token_hash IS NULL
RETURNING id, state;
```
