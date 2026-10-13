# Phase 7 backend acceptance spikes

This package is **isolated validation, not production features**. Nothing in `apps/api`, `apps/worker`, `packages/domain`, `packages/config` or `packages/db` imports it. Its reduced tables, Fastify probe routes and fictional accounts must never be used as an application backend or applied to a shared database.

The exact gate requirements come from [ADR 0007](../../docs/adr/0007-toolchain-and-foundation-acceptance.md) D1–D9 and [identity §14.2](../../docs/design/identity.md#142-acceptance-checks-gate-phase-7-backend-foundation-before-identity-migrations-or-security-features-merge) S1–S17. See [the Phase 7 evidence map](../../docs/phase7-acceptance.md).

## Run

Requirements: Node 24 LTS (`>=24.20 <25`), pnpm 12.7.0, Docker daemon, and Chromium at `/usr/bin/chromium` (the cloud image's installed browser). No production credentials, provider accounts or live user data are used.

```bash
pnpm install --frozen-lockfile
pnpm --filter @blacklist/backend-acceptance run typecheck
pnpm --filter @blacklist/backend-acceptance run test
pnpm --filter @blacklist/backend-acceptance run test:integration
pnpm --filter @blacklist/backend-acceptance run schema:generate
pnpm --filter @blacklist/backend-acceptance run test:coverage
```

The integration runner starts a fresh digest-pinned PostgreSQL 18 Docker container for each database suite, uses an ephemeral loopback port and random passwords, provisions distinct migrator/runtime login roles, applies the fixture SQL, and removes only its own containers and temporary credentials at completion. A missing Docker daemon or browser fails the suite. Nothing is silently skipped. The member and staff reset tests verify real database state and real Better Auth/password primitives; Chromium's virtual WebAuthn authenticator produces cryptographic assertions verified by SimpleWebAuthn.

The coverage command runs the application regressions and runtime security units and reports external domain source with the pinned Vitest V8 provider. It enforces the existing testing-strategy floors: identity/access/audit branches at least 90%, other domain branches at least 75%. The isolated gate protocols have their own complete run; their reduced schema and duplicate implementation are not coverage of the application. Run their timing proof without coverage instrumentation or concurrent browser/build workloads. A green assertion count does not override a failed coverage threshold. Migration regressions apply the actual application SQL, rehearse populated-row upgrades and logical restore with ownership/ACLs, deny runtime DDL/audit mutation, and reject a changed applied checksum. These remain local rehearsals, not a production PITR drill.

For a machine without `/usr/bin/chromium`, install the matching Playwright Chromium and provide an executable path when adapting this local harness. Browser substitution must be recorded; do not weaken assertions. The browser checks here used Chromium 154 with Playwright 1.63.0.

## Migration proof and limits

- `fixtures/generated/` is Drizzle-generated, reviewable SQL and snapshots. `fixtures/append-only.sql` adds handwritten grants, triggers and the serialized audit append function. These are fixture migrations only.
- Fixture migration transactions are explicit `BEGIN`/`COMMIT`, with rollback on any failure. `CONCURRENTLY` uses a separate migrator connection outside a transaction; it is intentionally tested to fail inside one. Migrator lock/statement timeouts are set.
- The application login has no database/schema CREATE, temporary-table privilege, object ownership or DDL grants. pg-boss schema and known queues are provisioned by the migrator; runtime uses `migrate:false`, `createSchema:false`, `supervise:false`, `schedule:false`. Production maintenance/queue provisioning still needs its reviewed operational design; these flags do not prove unattended production maintenance.
- Transactional enqueue uses an explicitly checked-out `pg` client with Drizzle's transaction API and pg-boss's documented `db.executeSql` adapter, never an internal-driver hack.
- D5 rehearses logical backup/restore into a second fresh database and compares audit hashes. It does not prove managed PITR, encryption, separate-account storage, RPO or RTO.
- PostgreSQL 18's `uuidv7()` is used in fixtures. PostgreSQL 17 and the final hosting choice are untested; production migrations must target the selected platform explicitly.
- Audit fixture encoding sorts object keys, preserves array order, removes insignificant whitespace and encodes UTC timestamps with milliseconds, per the normative data model. Node independently recomputes the stored hash. This reduced fixture is not a production audit record or protection against a database administrator. The production actor map, details allowlists and scheduled verifier are not implemented here.

## Identity proof and limits

- Better Auth 1.7.6 is headless: only `signInEmail`, `getSession`, and `signOut` are invoked, with returned headers. No generic library router or plugin is mounted. Raw library DTOs are never forwarded by the probe server.
- Exact `__Host-bl_session` is obtained with supported cookie configuration: automatic prefixing off and explicit `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no Domain. A real browser proves storage and signed-cookie authentication.
- Drizzle relations and supported `advanced.database.joins:true` avoid the known-email-only credential fallback query. S12 retains its original median tolerance (20 interleaved samples after 4 warmups per class; absolute difference <=20 ms and ratio <=1.5).
- Login verification and policy stamping share the per-account transaction/lock. A password verified before reset cannot be stamped with the reset's new security version.
- Email/recovery/suspension race fixtures exercise the common security lock/version boundary. Full production email-change and staff-recovery workflows are not implemented.
- Security email uses a deliberately injected provider in tests, as required by the gate. It never claims real delivery: the worker distinguishes acceptance, retryable failure, timeout, permanent failure and crash-before-activation, with actual pg-boss retry and DLQ transitions.
- Egress proof instruments fetch, HTTP, HTTPS and socket connections, allowing only the test database port. It is a process-level gate check, not proof of a hosting firewall policy.
- Staff reset accepts only a receipt from actual SimpleWebAuthn UV verification, bound to account/token/challenge and consumed with credentials/sessions/version/audit/jobs in the reset transaction. The test requires two registered credentials, proves wrong-origin/token/expiry/replay failures, and injects rollback after every mutation boundary. No staff permission or enrollment API exists in this package.

The production backend foundation, staff lifecycle, operator CLI, durable throttling, breach-check provider/fallback, SMTP adapter, local service Compose, frontend HTTP integration and production migrations remain separate implementation work after preflight and gate review. No unavailable feature is replaced by mock authorization or success.

## Application runtime checks

The original fixtures remain isolated, disposable gate proofs. runtime.integration.test.ts now imports the application packages (never the reverse), applies their reviewed SQL under a migrator, and exercises real API/worker/SMTP/WebAuthn flows. runtime-security.test.ts adds configuration/policy negatives. Use `pnpm exec vitest run --reporter=json --outputFile=<ignored-or-temporary-path>` here to preserve actual complete runner evidence. Current gate/status/limitations live in docs/phase7-acceptance.md and AI_HANDOFF.md. No production deployment or real-device assurance is implied.
