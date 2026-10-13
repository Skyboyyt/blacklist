# Local Backend Foundation

Use Node 24 LTS and pnpm 12.7.0. These commands create local services only:

```bash
pnpm local:init
pnpm local:up
pnpm local:provision
pnpm db:migrate
pnpm dev:api
# Separate terminal:
pnpm dev:worker
```

`local:init` creates an ignored, mode-0600 `.env` with independent CSPRNG database-role passwords, cookie secret and internal token. It preserves an existing file. Provisioning preserves existing role credentials, revokes database CREATE/TEMP and public-schema CREATE, and gives schema creation only to the migrator. Do not delete the credential file while keeping its database volume.

PostgreSQL 18 and Mailpit 1.27.8 images are digest pinned. Ports bind to loopback. API defaults to port 4000, Mailpit SMTP to 1025 and its local mailbox to 8025. The API/worker launch wrapper passes only their configuration fields: neither gets the provisioning password or migrator URL, and the worker gets no cookie-signing secret. This is local configuration hygiene, not operating-system isolation. Do not package the local `.env` with application artifacts or database backups.

Application migrations run explicitly, under the migrator. Startup refuses a DDL-capable runtime role. pg-boss uses preprovisioned queues, `migrate:false`, `createSchema:false`, and DML supervision; partitioned warning/stat persistence and index rebuilding are disabled. Jobs validate strict identifier-only payloads and reload eligibility. Evidence processing, object storage and chain providers belong to later phases.

For live frontend auth, provide only `API_INTERNAL_URL` and `INTERNAL_API_TOKEN` to Next.js, leave `NEXT_PUBLIC_API_MODE` unset, and build with the internal URL configured so its same-origin `/api/v1` rewrite exists. The browser-facing origin must exactly match API `APP_ORIGIN`; RP ID must match its hostname. Use the framework's normal build/start commands, rather than the mock development wrapper. Research/submission/finding/label/suppression operations remain unavailable until their authorized backend phases. Production API origins must use HTTPS; production SMTP requires TLS.

Operator commands use the application database role. Example (address/name are placeholders):

```bash
pnpm staff:operator --command bootstrap --email first-admin@example.test --operator "Local operator"
```

Only the one-time enrollment code is printed; deliver it through a verified separate channel. The worker mails the bearer link only after eligibility checks. Bootstrap cannot repeat after activation; next invite a second administrator. Break-glass is disabled by default and requires an incident reference. The flag plus CLI do not prove two people. P-13 and [ADR 0013](../../docs/adr/0013-small-team-recovery-and-objection-resolution.md) require owner/Claude decisions before real staff onboarding.

Validate with `pnpm check`, `pnpm build:backend`, and `pnpm test:backend`. The acceptance package starts and removes disposable PostgreSQL/Mailpit containers; the checked-in Compose volume is preserved. Its crypto/browser checks use installed Chromium at `/usr/bin/chromium`. Close only processes you started. `docker compose --env-file infrastructure/local/.env -f infrastructure/local/compose.yaml stop` preserves the database volume; destructive volume removal is not a normal shutdown.

No hosting, production infrastructure, paid service or deployment is configured by these commands. Production mail/human-verification providers and the PostgreSQL hosting choice remain owner decisions.
