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
