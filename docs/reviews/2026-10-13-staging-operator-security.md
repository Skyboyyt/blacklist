# Temporary staging database operator review — 2026-10-13

Codex implementation review under owner-accepted ADR0015. Claude independent review is pending. Scope: T-45 (secrets), T-48 (operator authority), T-49 (audit); no application identity/moderation/schema change.

## Controls reviewed

- An attacker cannot trigger SQL over HTTP: only GET/HEAD health and independent-token status exist; other paths/methods return404. Health reports liveness, not success. Constant-time token comparison follows length/format checks; strict config and allowlisted receipts exclude URLs, records, provider errors and secrets.
- Wrong branch/commit, role, host, database, pooled endpoint, weakened TLS or driver overrides fail before writes. Verified connector checks authorized native TLS plus server role/database/version/SSL. No environment switch bypasses TLS checks.
- Provision preflight rejects populated targets/existing roles. Existing provision script uses transactional advisory locking, safe flags and no password reset. Phase2 has no provisioner/API key; child environments contain only phase inputs. Original credentials are retained in unlinked protected operator storage, never application/build environments. Restarts cannot silently reprovision existing state.
- Migrations are the unchanged seven reviewed SQL files, with existing transactions/checksums/advisory locks/queue setup. Two executions plus exact journal hashes,27migrator-owned tables, queues, role/schema grants and rollback-safe permission denials prove the intended result. No test account, reset/drop or user-row deletion is part of cloud execution.
- Docker uses a digest-pinned Node24.21 base and existing frozen pnpm12.7 policies; non-root build/run. Runtime secret filename is excluded at any depth. No credential ARG/ENV/build-secret mount; optional ARG is only a public CA path. Dormant provider build has no operator credentials; activation reuses that verified build without rebuilding. Local context/layer/history sentinel and runtime checks are required before publication.
- Controller scope is fixed owner/service IDs/Free/Frankfurt, rechecks held states, authenticates receipts, preserves unrelated settings and removes only temporary executors. API/worker get only app URL after proof, stay suspended. No production/default-branch/PR merge, billing upgrade or Phase8 authority.

## Remaining risks

- Render and Neon are trusted credential/compute providers; protected operator storage is accessible to authorized workspace administrators. Unlinked group must be checked on each use; future linking would violate the design. Retained migrator credential requires controlled access and rotation/retention policy.
- Controller interruption preserves original credentials/journal; incomplete SQL remains for reviewed recovery. No automatic retry. Provider restarts may cause a fresh-target refusal; this is fail-closed, not proof the first run never wrote anything.
- Local image checks do not directly inspect Render's private image layers. Credential-free initial build, excluded runtime files, exact deployed commit/build identity and reuse without a new build establish the remote build boundary; record remote build/receipt evidence separately.
- Owner reports no payment method; actual remaining free budgets are unavailable. Provider exhaustion may block/suspend work. No paid fallback.
- Independent Claude review, required coverage, full development dependency audit, trusted ingress, hosted auth/email/restart/restore and production recovery/legal controls remain unresolved. This operator work does not authorize application activation or production readiness.

## Validation

Eight new operator tests passed; full PostgreSQL integration suite47passed; root498unit tests, format/lint/types and Next build passed. Production dependency audit0 vulnerabilities. Image/runtime/secret scanning and actual cloud execution evidence are recorded separately; no unexecuted hosted check is claimed here.

## Failed-run diagnostic follow-up

First authenticated cloud execution failed generically; no success or absence of partial writes is claimed. Executor suspended, protected file removed, original credentials retained in unlinked operator storage. Follow-up adds strictly validated read-only inspection, static error-category mapping and catalog-only counts; inspection reports failed/inspection-only and cannot authorize a migration/runtime write. Unknown provider payloads are redacted. Parsing a status token before source/permission validation permits authenticated failure reporting only: target/source/file/environment checks still precede all database work. The whole-container watchdog is scheduled before operations. Focused diagnostic/config/catalog tests10passed, expanded strict typecheck passes; final root/database/image checks continue.

## Verified endpoint / compute SSL distinction

Actual readonly run passed authorized native TLS and expected SQL identity/version, then failed the overly strict compute-SSL flag gate. Correction validates the approved Neon endpoint TLS boundary and separately records compute `pg_stat_ssl.ssl`; this is not a client-TLS exception. Native pg driver still requires verify-full; no unverified socket/CA/hostname can proceed. Real signed TLS proxy + local PG18 regression permits verified edge/plaintext compute while rejecting wrong CA and hostname before callback. Eleven focused tests pass. Original empty-target guard and no-write investigation remain required before any provision retry.

## Actual cloud result and cleanup

Reviewed source `ede3929` completed existing role provisioning and separate two-pass migration on Neon staging. Native endpoint TLS/SQL identity, role/grant/schema/hash/queue proofs and actual app permission negatives passed;7migrations/27tables/16queues. Both held service URLs now use the tested app credential with verify-full; settings/role separation and signed-out Vercel Authentication rechecked. Temporary services/files/admin/control copies deleted and deletion verified; retained group contains only runtime/migrator URLs, zero links. No account seeds, shared reset/drop, production changes or exposed secret/data values. Full same-source rebuild was necessary to apply runtime settings; actual secret exclusion and no ARG/build mount controls preserved. Inspection counters in execution receipts are defaults; role proof independently enforces exactly two safe roles.

Full DB48passed, focused operator/proxy11passed (overlap), root500unit/format/lint/types/Next and backend build passed. Production audit0, full dev audit1high and coverage59.16% thresholds still fail. Required ingress, independent Claude review, hosted workflows/restart/provider restore, sender/recovery/retention/monitoring remain open. API/worker stay suspended; no production/Phase8 readiness claimed.
