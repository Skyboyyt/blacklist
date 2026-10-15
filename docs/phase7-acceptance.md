# Phase 7 acceptance and implementation evidence — 2026-10-13

> **Status update (2026-10-15):** this work was later published and merged to `main` (PRs #8–#11), and Phase 8 followed. Statements below about local, uncommitted or unpublished state are historical. The exit criteria still open are listed in [Claude's review](reviews/2026-10-15-claude-phase7-8-review.md) (CR-11).

**Scope:** the exact acceptance spikes were implemented and passed before runtime features. The approved local Backend Foundation now exists; application checks supplement those isolated proofs. Claude remains primary engineer and architecture owner. This is reviewable, unpublished work, not production readiness.

## Git and repair integration

Initial clean HEAD was 93356a16ee8f2031813dfd60d01778f8f0707486 (PR #6). The initially unavailable unpushed Phase 6 repair branch was documented while independent gates ran. The owner then instructed continuation from this checkout.

A later GitHub verification found **fix/phase6-review-findings at 20eaa494933f3598b7ce4dd75fff4ceb0f03ca75**, merged in [PR #7](https://github.com/Skyboyyt/blacklist/pull/7), **4b16cdb6324e1f5d3b979bd8d5e82ef36ca168ba**. Phase 7 changes were preserved in a named stash and a tracked binary patch, the dedicated branch fast-forwarded, and all work reapplied. The sole handoff conflict was resolved by retaining both histories. Appeal revision checks, reversal tombstones, six maintained regressions and full cross-browser test selection are integrated. This repair-preservation prerequisite is now resolved.

Branch **feat/phase7-backend-foundation** is local, with uncommitted changes; no Phase 7 commit, push or PR publication occurred. The preservation stash remains available. No production deployment, paid service or Phase 8 implementation occurred.

## Exact gate map

The requirements below are copied verbatim from ADR 0007 and identity §14.2. PASS means the named isolated proof ran; it does not mean the production feature exists or has independent architecture/security sign-off.

| Gate | Exact requirement | Implementation / validation / evidence | Spike status |
|---|---|---|---|
| D1 | `drizzle-kit generate` produces reviewable SQL for representative tables (identity, audit) that matches the design (types, CHECKs, partial uniques, composite FKs) | database.integration.test.ts — generated SQL inspection and fresh migration application | PASS |
| D2 | Hand-written SQL migrations work for triggers (append-only enforcement), grants, roles and the audit append function | database.integration.test.ts — function, roles, grants, trigger and hash verification | PASS |
| D3 | Migration transaction behaviour is understood and documented; a `CREATE INDEX CONCURRENTLY` path exists outside a transaction | database.integration.test.ts — transactional failure and successful nontransactional CONCURRENTLY | PASS |
| D4 | Composite foreign keys (subject/subtype kind, owner consistency, assessment↔subject pointer) and constraint violations surface as typed errors | database.integration.test.ts — SQLSTATE/constraint checks on valid-parent subtype, owner and assessment mismatches | PASS |
| D5 | Forward-only production policy plus a rehearsed restore (point-in-time recovery or backup) for recovery; no down-migrations in production | database.integration.test.ts — actual pg_dump/pg_restore into restore_gates, audit-hash comparison | PASS |
| D6 | **pg-boss transactional enqueue:** a job enqueued inside a Drizzle transaction that rolls back does **not** exist; a committed one does. Same `pg` client and driver as production | database.integration.test.ts — pg-boss send through the same checked-out pg client/Drizzle transaction | PASS |
| D7 | pg-boss schema is created/migrated by the **migrator role** in the deploy step; the runtime starts with the DML-only application role and never needs DDL | database.integration.test.ts — migrator provisioning; runtime startup/fetch/complete; DDL/TEMP denials | PASS |
| D8 | Better Auth's Drizzle adapter participates in the same transaction (identity spike S6) | identity.integration.test.ts — Better Auth adapter writes roll back at every registration boundary | PASS |
| D9 | Application role cannot UPDATE/DELETE append-only tables; trigger and grant tests pass | database.integration.test.ts — UPDATE/DELETE rejected by grants and owner-executed triggers | PASS |
| S1 | Only approved `auth.api.*` calls with `returnHeaders`; no `/api/auth/*` route reachable | identity.integration.test.ts — declared route inventory and real HTTP 404 for forbidden library endpoints | PASS |
| S2 | Exact `__Host-bl_session` cookie with the required attributes (browser test) | identity.integration.test.ts — real Chromium cookie storage and signed-cookie request | PASS |
| S3 | Better Auth reset and verification endpoints are never invoked; `auth_verifications` stays empty in normal flows | identity.integration.test.ts; delivery.integration.test.ts — auth_verifications stays empty | PASS |
| S4 | A revoked session is rejected on the next request (cookie cache disabled) | identity.integration.test.ts — immediate rejection after actual Better Auth signOut | PASS |
| S5 | Sessions with a stale `security_version` or without `session_policy_state` are rejected | identity.integration.test.ts — no policy or stale version fails authentication | PASS |
| S6 | Registration completion is atomic with Better Auth user/account creation, or the idempotent alternative is proven | identity.integration.test.ts — rollback after each adapter/account/security/intent/audit boundary | PASS |
| S7 | Blacklist Argon2id hash/verify in use; rehash-on-login works | password.test.ts; identity.integration.test.ts — Argon2id hooks and real login rehash | PASS |
| S8 | Normalization and length/byte validation precede Better Auth; boundary tests; no truncation | password.test.ts — NFKC/code-point/UTF-8 boundaries, controls, rejection without truncation | PASS |
| S9 | No outbound network calls from the library (egress-blocked test) | identity.integration.test.ts — deny HTTP/HTTPS/fetch and non-DB sockets during real library flows | PASS |
| S10 | Better Auth tables are reviewed SQL migrations applied by the migrator role; runtime is DML-only | identity.integration.test.ts — all four auth tables owned by migrator; runtime DDL denied | PASS |
| S11 | Session records expose creation and activity data for Blacklist lifetime enforcement | identity.integration.test.ts — actual creation/activity records checked after login | PASS |
| S12 | Unknown-email sign-in timing within tolerance of wrong-password timing | identity.integration.test.ts — interleaved known/unknown medians within unchanged <=20ms and <=1.5 ratio | PASS |
| S13 | Concurrent issuance never leaves more than one `active` or `pending_delivery` reset token per account; tokens never become `active` without `accepted_for_delivery` | delivery.integration.test.ts — concurrent issuers, pending rejection, latest generation, unique index, stale/cleanup paths | PASS |
| S14 | Delivery outcomes reach the worker: forced `retryable_failure`/timeout fails the job and retries with a new generation; `permanent_failure` completes without retry; captured mail shows only the latest link working; no token in logs, job tables or DLQ | delivery.integration.test.ts — actual pg-boss retry/DLQ/completion; provider errors/timeout/crash; actual redemption and leak scans | PASS |
| S15 | Dependency footprint reviewed (`pnpm why`, transitive adapters, no unapproved install scripts) | pnpm install --frozen-lockfile; pnpm why; pnpm audit; dependency review below | PASS |
| S16 | Reset transaction (§6.3) writes Better Auth credential and session tables atomically; crash injection at every step yields all-or-nothing; concurrent reset/login/email-change/recovery races resolve per §6.5 | reset.integration.test.ts; webauthn.integration.test.ts — crash/race/member/staff/UV/challenge/cooling/session/audit/job proof | PASS |
| S17 | E-1 regression suite (M8) passes, including with forbidden-plugin detection (configuration test fails if any plugin is enabled) | identity.integration.test.ts; auth.test.ts — E-1 attack variants, forbidden-plugin detection, rotation/revoke-all | PASS |

The test files above are under [tests/backend-acceptance/src](../tests/backend-acceptance/src/). Full runner and limitations: [README](../tests/backend-acceptance/README.md).

## Runtime implementation and evidence

Application source lives in packages/config, packages/db, packages/domain, apps/api and apps/worker; these never import the spike package. PostgreSQL 18/Mailpit are local digest-pinned Compose services. The 27-table identity/staff/audit schema and reviewed generated/hand SQL use a separate migrator, runtime DML/TEMP/DDL denials, account-kind guard, append-only triggers and canonical chained audit append.

Identity uses the proven headless Better Auth configuration, Argon2id/NFKC/breach checks, signed host cookies, serialized verification/security-version stamping, durable throttle/human-verifier port, uniform mailbox-first requests, real SMTP acceptance, hashed/latest-only tokens, atomic reset/password/email transitions, session lifetimes/ownership and cooling. Worker has no cookie-signing secret or migrator/provisioning credentials. Runtime supervision uses supported DML-only options.

Staff uses split-secret bound enrollment, two verified UV credentials before activation, action/session/token-bound challenges, independent approvals, offboarding/revocation, recovery/objection barriers, operator bootstrap/break-glass controls and factor-deficit handling. A replacement factor needs a fresh action-bound assertion from an existing factor; registration alone is insufficient. Cryptographic preview acknowledgements do not consume a challenge or grant authority: the command carries the raw assertion and re-verifies/consumes/executes atomically. Password-change action hashes bind an immutable Argon2 draft ID rather than a fast digest of a password.

Live frontend auth/account/staff/admin/profile/recovery adapters validate allowlisted contracts; unsupported later-phase operations remain unavailable. Recovery invitation issuance is distinct from completed re-enrollment, with the code displayed once for verified separate-channel delivery.

The maintained runtime suite exercises migrated application tables, real Fastify/pg-boss/Nodemailer/Mailpit, signed-cookie rejection, exact Origin, the authorization inventory, signup/reset/replay/cooling, staff enrollment/assurance/independence, lost-factor replacement/deficit/replay, ordinary recovery and offboarding. Pure runtime negatives cover configuration sanitization, RP/TLS, permission default-deny, IP buckets, Unicode/password/handle policy and breach fallback. Virtual authenticators prove protocol verification, not physical-device independence.

The initial 35-proof evidence remains at [initial gates](evidence/2026-10-13-phase7-gates.json). Current complete runner results and route inventory are saved separately after the integrated checkout validation. No skipped/zero-test run is a gate pass. Detailed commands/results and limits are in AI_HANDOFF.md.

The [prepublication review](reviews/2026-10-13-phase7-prepublication-review.md) reproduced and repaired a stale-mailbox reset race, account/token lock inversion and member bulk-session reauthentication mismatch. Maintained application regressions now also cover populated migration upgrades, logical restore/ACLs and applied-checksum drift. The owner subsequently authorized direct publication to main; implementation and receipt commits are recorded in AI_HANDOFF.md. Assertion/gate passes do not override the failing branch coverage floors or the full dependency audit. Protected staging preparation is a separate authorized infrastructure task; availability still requires the documented deployment/security checks. Current validation evidence is in `docs/evidence/2026-10-13-phase7-prepublication.json`.

## Dependency review and audit

See docs/dependency-policy.md for exact pins, necessity/maintenance/alternatives and resolution changes. Frozen installation retains release-age/no-downgrade trust/strict builds/exact versions. Only the owner-approved esbuild 0.18.20/0.25.12/0.28.2 build entries exist. Next/optional peers, source-map-js and old esbuild loader ranges were patched without weakening policies.

Full audit **fails with one high braces advisory (GHSA-vfj7-8cjw-p6xm), no published patch**, via development lint tooling. Critical/moderate/low counts are zero. No advisory is suppressed, and no production exception is claimed. Earlier nine-advisory output is historical.

## Phase 7 boundaries and blockers

[Proposed ADR 0013](adr/0013-small-team-recovery-and-objection-resolution.md) records the sole-admin/small-team verification contradiction and undefined objection resolution/subject objection channel. Current controls fail closed. Claude and the owner must settle these before real staff onboarding/Phase 7 closure. P-13 and O-6 remain decisions; the owner selected free Render backend/API, Neon PostgreSQL with authenticated TLS, protected Vercel Frankfurt staging and Resend for the infrastructure task, with provider capability, account access and cost approval still pending; human verification is unavailable by default rather than faked. Branch coverage is now measured and fails the documented floors; local Gitleaks and actual-local-secret scans found no real credential exposure after specific false-positive triage. The complete browser run had two timeouts that passed an unchanged focused rerun, so the complete run is not reported green. Production hosting/PITR, real-device/assistive-technology/multi-browser verification, CI/OSV/formal SBOM workflows and external audit checkpoints remain unverified. No launch readiness is claimed.
