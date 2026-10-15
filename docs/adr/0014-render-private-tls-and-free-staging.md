# ADR 0014: Restricted free staging hosting constraints

| Field | Value |
|---|---|
| Status | **Owner hosting selection recorded; free operating-limit and independent architecture review pending** |
| Proposed by | Codex, 2026-10-13 |
| Reviewed by | Claude review pending |
| Decided by | Owner selected free Render + Neon PostgreSQL + Resend + protected Vercel; authenticated public Neon TLS explicitly accepted for staging |
| Affects | Hosting O-4/O-7, infrastructure profile only; application schema, identity protocol and separate service boundaries preserved |

## Problem

Restricted staging must preserve independent API and email-worker services, authenticated database transport, DML-only runtime credentials, mailbox-proof semantics and Vercel same-origin authentication. Free Render has no background-worker plan or pre-deploy/one-off/SSH support. Its web services sleep after 15 idle minutes. An API health result or queued email is insufficient proof of a functioning authentication environment.

Earlier Render-managed PostgreSQL preparation encountered a private self-signed TLS conflict with certificate/hostname validation. The owner subsequently chose **Neon PostgreSQL** and explicitly accepted authenticated public TLS for restricted staging. That resolves the former transport-choice blocker without disabling certificate verification. Production transport remains undecided.

## Evidence

Official documentation retrieved on 2026-10-13:

- [Render free instances](https://render.com/docs/free): idle sleep, limited shared instance-hours, no free background-worker plan or operator shell/pre-deploy/one-off command. A separate free web-hosted worker cannot promise continuous jobs.
- [Neon secure connections](https://github.com/neondatabase/website/blob/main/content/docs/connect/connect-securely.md): verified TLS is supported. [Neon roles](https://github.com/neondatabase/website/blob/main/content/docs/manage/roles.md): console/API-created roles inherit privileged `neon_superuser`; SQL-created roles have ordinary permissions.
- [Neon pooling](https://github.com/neondatabase/website/blob/main/content/docs/connect/connection-pooling.md): transaction pooling does not preserve session advisory locks or session settings. Direct connections preserve the existing migration lock and timeout options.
- [Neon plans](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md): free compute/egress/storage/history limits apply. Worker polling can keep compute awake and exhaust a free quota. Six-hour history is not a production backup policy.
- Local PostgreSQL 18 role/migration, API ingress, worker-health and Resend negative tests pass. No actual provider account, TLS connection, restore, Vercel protection or external email delivery has been tested.

## Impact

Free staging is a synthetic-data test environment with cold starts and potentially paused jobs. Manual wake-up and quota monitoring are necessary. Existing application retry, generation and shutdown protocols must remain intact. No claim of production reliability, managed recovery or unrestricted service availability is supported.

## Prepared solution and review items

1. Preserve mandatory `sslmode=verify-full` on direct Neon endpoints. A separate operator creates SQL runtime/migrator roles and applies the seven unchanged reviewed migrations; API/worker never acquire DDL or migrate on boot. Verify PG18, real roles, session options, connection limits and restoration in the actual staging account.
2. Host the existing worker as a **separate optional** free web service with a disabled-by-default status-only listener. It exposes GET/HEAD `/healthz` after startup and a DB probe; all other requests fail closed. It receives no API signer/internal/staging credentials and adds no actor authority. Unit and local process tests must distinguish health from real email delivery.
3. Require manual worker wake-up before synthetic test windows, disclose idle sleep and quota exhaustion, and verify backlog/retry/stale-generation behavior on the provider. No automated keepalive, new scheduler or API-worker combination is introduced. Acceptance of free operating limits remains a review item before staging availability.
4. Keep Vercel Authentication plus the independent server-only API ingress token. Verify exact Vercel origin, Render ingress peer/header handling and SSR before availability; never hide routing failures by weakening trusted peers, cookies, Origin or CORS.

## Alternatives

- Paid independent worker/database: stronger operations but unauthorized under the owner's free-only selection; requires a separate cost/approval decision.
- Historical free Render database: superseded, expires after 30 days and has no managed backups; not the selected configuration.
- API-worker combination, privileged runtime role, unverified TLS, cross-domain cookies or fake mail acceptance: rejected; violate existing boundaries or conceal failures.

## Consequences

No service, database, billing change or production Vercel setting has been created. Safe configuration is prepared for review on a feature branch. Baseline coverage/audit/browser and ADR 0013 barriers remain open. Claude reviews compatibility and operating limits; owner staging and production acceptance require actual evidence. No Phase 8 is started.

## Recommendation (Claude)

**Amend, then accept** (Claude, 2026-10-15; [review](../reviews/2026-10-15-claude-phase7-8-review.md) CR-01, CR-04, CR-10). Sound and acceptable: mandatory `verify-full`, separate non-DDL SQL roles, no migrations at start-up, a separate worker, no keepalive or scheduler, provider acceptance as the delivery fact. Amendments:
1. The later owner instruction removed Vercel visitor protection, which contradicts item 4 and the synthetic-data premise. Record the owner's acceptance of real-user data in staging, or restore a registration gate (CR-10).
2. Make a verified per-client IP (or a working human verifier) a precondition of public exposure (CR-01).
3. Record the anonymous quota-burn path through the public worker `/healthz` (CR-04).
4. Give the ADR a valid status from `docs/adr/README.md` and a title that covers the Neon decision.

## Owner decision

Owner confirmed Neon PostgreSQL and authenticated public TLS for restricted staging. This is an explicit staging transport choice, not a blanket TLS exception or production approval. No paid service, public/production launch, automatic merge, silent keepalive or Phase 8 is authorized.

## Subsequent owner hosting instruction — 2026-10-13

After the disclosed failed coverage/full audit and ingress/review gaps, the owner explicitly requested merging the infrastructure work, removing restrictions and going live. PR8 was merged and the existing Free API/worker activated; project-level Vercel visitor SSO protection removed. This changes visitor hosting access only: identity protocol, API/internal credentials, trusted-peer checks, role/resource checks and verified DB TLS remain unchanged. No paid resource, production DB/credential change, new backend phase or readiness claim. Site/API/worker health passes; signed-in SSR remains fail-closed on missing trusted ingress. This records the owner's rollout instruction, not an independent Claude review or security-gate pass; latest evidence/handoff govern operations.
