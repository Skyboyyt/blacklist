# Blacklist — Testing Strategy

| Field | Value |
|---|---|
| Status | **Revision 3** (2026-10-04, after the Codex re-review). No test code exists yet. Execution is frontend-first (§13) |
| Related | [ARCHITECTURE.md §31](../ARCHITECTURE.md#31-testing-strategy), [THREAT-MODEL.md §8](../THREAT-MODEL.md#8-security-invariants-must-be-covered-by-automated-tests) (19 invariants), design docs in [design/](design/) |

## 1. Principles

- Tests protect the product's **claims** (provenance, revision-bound findings, replayable history) and its **security invariants** first, features second.
- Real dependencies where they matter: integration tests run against real PostgreSQL.
- Deterministic: no live network in blocking suites; injectable time and randomness.
- **Adversarial walkthroughs:** every security protocol gets a test that plays the attacker step by step (the R-01 lesson: consistency checks alone missed it).
- Negative tests are mandatory for identity, access, audit, evidence, moderation and risk.
- Never disable or weaken a test to make CI pass.

## 2. Tooling

| Purpose | Tool |
|---|---|
| Unit / integration / API | Vitest (TypeScript 6.x toolchain) |
| Database | Testcontainers PostgreSQL (production major), migrations from empty, app-role and elevated-role clients |
| API | Fastify `inject()` |
| E2E | Playwright (Chromium, Firefox, WebKit; mobile viewports; WebAuthn virtual authenticators; mock EIP-1193 and Solana Wallet Standard) |
| Property-based | fast-check (normalization, tier combination, ordering) |
| Accessibility | axe-core via Playwright |

## 3. Layers

| Layer | Scope | Runs |
|---|---|---|
| Unit | Pure functions: normalization, classification, `assess()`, policies, independence checks, content hashing, DTO mappers | Every commit |
| Integration | Domain services + repositories against Postgres; migrations, grants, triggers, composite FKs | Every commit |
| API | Full plugin stack: Origin, session policy, guards, validation, errors | Every commit |
| Worker | Handlers with real Postgres and fake ports (storage, processor, email, providers) | Every commit |
| Processor | `apps/evidence-processor` in its container with network disabled | Every commit (CI container job) |
| Chain adapter | Sanitized fixtures + fault injection | Every commit |
| Provider contract | Live calls detecting API drift; no secrets in logs | Scheduled, non-blocking |
| E2E | Critical journeys | PR smoke + nightly full |

## 4. Authentication tests

### 4.1 R-01 adversarial registration suite (must exist before identity merges)
1. Attacker calls `register/start` with the victim's email, then the victim completes using the genuine link: the attacker's later sign-in with **any** password fails; nothing the attacker submitted persists as a credential, session or authenticator.
2. Attacker starts, victim starts (newer): the attacker's intent is `superseded`; only the newest link completes.
3. Same link submitted twice concurrently: exactly one account; the other gets the generic error.
4. Expired, superseded, already-completed and wrong-purpose tokens all yield the same generic error.
5. `register/start` for an existing account: identical response, status and header set; the **request path performs identical DB operations** (the worker, not the API, detects existence); only a notice email (no token) is sent; notice rate limit holds.
6. GET of `/register/complete` (with a fragment token) changes no state.
7. A worker issuing a token for a superseded or expired intent skips it.
8. Completion is atomic with Better Auth user/account creation (spike S6), or the idempotent alternative recovers correctly after an injected crash.

### 4.2 Token handling and delivery outcomes (R-03, V2-01)

- After running every security-email flow, **inspect** pg-boss job tables (active, completed, failed, archive), the DLQ, captured logs, error-tracker payloads and `auth_verifications`: **no raw token and no token-bearing URL anywhere**.
- **Delivery-outcome suite** (fake provider; acceptance check S14):
  - `accepted_for_delivery` → token `active`, redeemable;
  - `retryable_failure` and **timeout** → token invalidated, **the job fails**, the retry issues a new generation, and only the latest link works;
  - `permanent_failure` → token invalidated, job completes without retry, security event;
  - **a provider that accepted but crashed before TX-B** → token stays `pending_delivery` (not redeemable), the retry sends a working link, and the first link fails;
  - provider errors containing message data never reach logs;
  - captured mail confirms which links work.
- **Concurrency (S13):** parallel issuance jobs for the same account never leave more than one `pending_delivery`/`active` reset token; duplicate jobs collapse; jobs older than 15 minutes are dropped; DLQ entries hold identifiers only; `identity.cleanup` invalidates stranded `pending_delivery` tokens.
- Expiry is measured from issuance. Fragment links: server access logs never contain tokens (E2E with log capture).

### 4.3 Sessions, login, reset, email change

- Cookie attributes exactly `__Host-bl_session; HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain` (S2).
- Revoked session rejected on the next request (cookie cache off, S4). Sessions **without** `session_policy_state` or with a **stale `security_version`** rejected (S5).
- Member idle 7 d / absolute 30 d; staff 30 min / 12 h; staff pending-WebAuthn session limited to assertion endpoints and revoked after 5 minutes.
- Login: generic errors; unknown-email timing (S12); throttle thresholds per email hash, account, IPv4 and IPv6 /64; human-verification escalation; no permanent lockout; **the sign-in response body never contains a token**.
- Passwords: 14 vs 15 code points; 128 vs 129 code points; 512 vs 513 bytes; NFKC equivalence; no truncation; HIBP fake down → local blocklist used.
- **Reset atomicity (S16):**
  - crash injection after every step of the reset transaction leaves either the complete old state (token still usable) or the complete new state (new password, token consumed, **all sessions revoked**, cooling set, security version bumped, audit row and notice job present). No mixed state;
  - a forced revocation failure rolls back the password change;
  - staff reset without WebAuthn fails.
- **Reset concurrency:**
  - two links for one account (only the latest works);
  - two simultaneous redemptions of the same link (exactly one succeeds);
  - reset vs email-change confirm, and reset vs admin recovery or suspension (the loser fails its version check);
  - sign-in racing a reset (the session created with the old version is rejected afterwards).
- **E-1 regression suite (S17, every Better Auth upgrade).** Each of these must **fail** authentication:
  - an expired session;
  - a revoked session;
  - a forged HMAC signature;
  - an unsigned value;
  - a signature under a different secret;
  - the raw stored DB token as a cookie;
  - the raw token as `Authorization: Bearer`;
  - the raw token in body or query.

  A legitimately signed cookie must succeed. A configuration test fails if any Better Auth plugin is enabled or any Better Auth route is mounted. Secret rotation plus revoke-all is rehearsed.
- **Email change (mandatory enumeration test):** the request path performs identical DB work and returns an identical response whether or not the new address belongs to an account; timing is not account-correlated; the token is bound to the target address; the confirm transaction revokes other sessions and bumps the version; the old address is notified.
- Better Auth surface: no `/api/auth/*` route reachable (S1); sign-up, verify-email, change-email and reset endpoints never invoked (S3); no outbound calls (S9).

### 4.4 Staff lifecycle (R-04)
- Staff role on a member account is impossible (service + DB test).
- Enrollment requires two authenticators with UV; an abandoned enrollment leaves no account.
- **Split secret:** enrollment with the emailed token but a wrong or missing enrollment code fails (≤ 5 attempts, then the invitation is revoked); the code alone without the token fails; the code is never sent by email; recovery notifies the subject's email.
- Staff permissions without WebAuthn assurance → denied for every staff route.
- Action-bound step-up: an assertion for action A cannot authorize action B or a different target; reuse fails; 5-minute expiry.
- Admin invitation without second-admin approval cannot be accepted; single-admin path requires the operator CLI.
- Self-approval of role requests and recovery cases fails.
- Recovery: no session is ever issued without WebAuthn; the 24-hour objection window holds; old authenticators are revoked.
- Bootstrap runs once; break-glass requires the deployment flag; the CLI never prints tokens.
- Authenticator deficit for > 7 days suspends staff permissions.

### 4.5 Origin matrix (R-15)
Generated from the route table: for every non-safe route, missing `Origin`, `Origin: null`, a foreign origin, a **sibling subdomain**, a scheme or port mismatch → 403. Includes login, logout, registration, reset, uploads (multipart). Same-site but cross-origin is rejected. Correct Origin passes. Internal SSR path: non-GET rejected; client-IP header ignored without the internal token.

## 5. Authorization tests

- Route policy coverage: every route **and method** has a policy; startup fails otherwise.
- Authorization matrix: route × method × actor (`anonymous`, `member owner`, `member non-owner`, `suspended member`, `staff without assurance`, `moderator`, `appeal_reviewer`, `admin`). Non-owner private access → 404.
- Independence:
  - a severe approver who authored any revision is rejected;
  - a conflicted approver is rejected;
  - an appeal reviewer who is a participant is rejected;
  - a standing reviewer who is a participant is rejected;
  - a reversal approver who is a participant is rejected.
- Mass assignment: forbidden fields are stripped or rejected.
- Jobs: payload-supplied roles or owners are ignored; authority-dependent jobs re-check current authority.

## 6. Security-sensitive tests

- XSS corpus through report narratives, responses, handles and token names/symbols: escaped, no execution.
- CSP nonce present; no un-nonced inline scripts.
- **Evidence (R-08):**
  - PNG/JPEG/WebP accepted.
  - Rejected: PDF, SVG, HTML, ZIP, animated GIF/WebP/APNG, polyglots, MIME mismatch, oversized bytes, > 40 MP, > 12,000 px, decompression bombs, truncated or corrupt images (fail closed).
  - Filenames with traversal sequences stored only as metadata.
- **Processor isolation:** in its container, outbound network attempts other than the storage host fail; the environment contains no DB or app secrets; it runs as non-root with a read-only filesystem; resource limits are enforced.
- Originals are unreachable through any API route. Derivative links come from the storage domain with `attachment` + `nosniff` and a ≤ 5-minute TTL.
- **Per-item evidence (R-14):** two items with identical bytes have independent objects; purging one leaves the other intact; a legal hold blocks purge; the reconciliation job detects orphaned or missing objects after an injected crash.
- Seed-phrase detector blocks BIP-39-like sequences.
- Log and telemetry capture (R-12):
  - no secrets, tokens or cookies;
  - no addresses or search terms alongside actor or session IDs;
  - route templates only.
- Client-bundle scan: no server env names or secret patterns; the web SSR token appears only in server output.
- Wallet signatures: replay (nonce, purpose, case, session, chain, domain), client-supplied message ignored, wrong address.
- Static check: banned wallet RPC methods absent.
- **Audit (R-12):**
  - the app role cannot UPDATE/DELETE or INSERT except through the append function;
  - a partial tamper (elevated role) is detected by `audit.verify_chain`;
  - a test *documents* that a full rewrite by an elevated role is **not** detected without an external checkpoint (keeps the claim honest).
- Append-only tables reject UPDATE/DELETE from the app role.

## 7. Moderation and risk tests

### 7.1 Approvals (R-05)
- An approval for revision N does not authorize revision N+1 (any field changed, including only the evidence derivative hash).
- Concurrent approve + new revision: the row lock serializes; system publication applies only to the latest revision with a matching approval, in the approval's own transaction.
- **Terminology/audit:** every public revision has exactly one `finding_publication_events` row with actor `system` and a `cause_approval_event_id`; no human "publisher" field exists. Self-approval succeeds only for non-severe revisions that do not replace a public severe revision.
- Withdrawn approval, revoked or suspended approver, NULL approver, same-person approver → publication fails.
- Evidence not `available` → publication fails.
- No independent approver exists → the severe finding stays unpublished; a separate high finding can be published.
- **Severe downgrade/edit:** publishing a new revision (high, medium, low, or text-only) over a published severe revision without a non-participant approval fails; suspending a severe finding alerts all admins.
- Emergency suspension: immediate exclusion from scoring; review deadline alert at 72 h.

### 7.2 Standing (R-09)
Each mechanism: fresh signature; authority signature with a finalized authority read (including authority changed since → denied); DNS TXT via the resolver fake; documentary standing decided by a non-participant; correction request without standing. Lost-key victim journey end to end.

### 7.3 Risk engine (R-10, R-11)
- Golden tests per ruleset version.
- **Invariants (property-based):**
  - Severe only with an approved severe finding input;
  - **V1 strong-only formula:** `score = min(ceiling, verified + analysis)`; weak-tier signals cannot be created in V1 (attempting to register one fails). The deferred `max(strong, weak)` policy is unit-tested only as an inactive policy module, if implemented later;
  - disclosures contribute 0;
  - incoming and `unknown` transfers never produce signals;
  - unreviewed reports never change any public output (band, DTO);
  - adding or removing reports leaves public responses byte-identical.
- **Replay:** store an assessment, mutate the source finding (new revision, reversal), change the active ruleset; replaying stored inputs with the stored ruleset reproduces the stored result exactly.
- **Time:** factor expiry triggers recompute via `risk.expiry_sweep` with no page view (fake clock).
- Public explanation DTO contains only published-artifact references and **no numeric score or numeric contributions** (P-11); it includes band, explanation, confidence, coverage, freshness and dispute state.

### 7.4 Stale jobs and ordering (owner §25)
- Delayed `risk.signal.upsert` for a finding reversed in the meantime → `skipped_stale`; no signal resurrected.
- Two concurrent recomputes: the pointer never moves backwards (compare-and-set); a dirty flag set during a run causes a rerun.
- Worker crash mid-job → retry is idempotent.
- Notification jobs for a reversed or suspended finding do not send.
- Withdrawn or rejected reports and granted appeals are never "re-applied" by delayed jobs.

## 8. Blockchain adapter and provider tests

Covers review findings R-06 and R-07.

- Normalization: EIP-55; Solana case preservation; 32-byte decode; CAIP-2; classifier corpus.
- **Authorization basis fixtures:**

  | EVM | Solana |
  |---|---|
  | Fake `Transfer` log from a non-asset emitter → `observed_log`, `unknown` | Fee payer ≠ authority |
  | `transferFrom` by a spender → `delegated` | Delegate and permanent-delegate transfers → `delegated` |
  | Direct `transfer` by `tx.from` → `subject_signed_direct` | CPI-invoked transfer → `protocol`/`unknown` |
  | Router/multisig/4337 relayed transactions → `unknown` | Token-account owner changed after the slot (historical owner used) |
  | Failed transaction | Address lookup table transactions |
  | EIP-7702 delegated EOA | — |

- **Verification:**
  - `agree` at the same EVM block hash;
  - `conflict` at the same snapshot;
  - different block numbers never `agree`;
  - Solana account reads at different context slots → `inconclusive_snapshot_mismatch` **even with identical values**; no same-slot pair after bounded retries → `unavailable` and **no scoring signal created**;
  - EVM block-level balance deltas recorded as an aggregate fact and never upgrade an individual transfer;
  - receipts contain chain/cluster, provider, method, parameters (address or signature), commitment, snapshot, requested/fetched timestamps and digest;
  - same independence group → refused;
  - second provider lacking capability → `unavailable`;
  - receipts stored with digests.
- Fault injection: timeouts, 429 + `Retry-After`, 5xx, malformed or oversized payloads, truncated history, stale heads, disagreement, reorg before finality, post-finality invalidation, duplicate events, cursor failover (no cross-provider cursor reuse).
- Pinned tables reject non-final rows.

## 9. Backend acceptance gates (ADR 0007, identity §14.2; Phase 7)

**Run first in Phase 7 (Backend Foundation), before any production migration or security feature merges. Record real output in `AI_HANDOFF.md`.** Earlier narrow spikes are allowed only with explicit owner authorization, isolated and labelled as validation (ARCHITECTURE §36). They do not replace these gates.

| Gate | Checks |
|---|---|
| Drizzle / pg-boss (D1–D9) | Generated SQL reviewed; custom SQL triggers and grants; `CONCURRENTLY` path; composite FKs and typed constraint errors; restore rehearsal plan; **enqueue inside a rolled-back transaction leaves no job**; pg-boss schema provisioned by the migrator, runtime DML-only; Better Auth adapter shares the transaction; append-only grants |
| Better Auth and identity (S1–S17) | Listed in identity §14.2, including delivery outcomes (S14), reset atomicity (S16) and the E-1 regression suite (S17) |

Also every backend commit: migrations from empty, drift check, constraint tests (one open registration intent per email, one open reset token per account, approval CHECKs, `seq` uniqueness, composite pointer FK, subtype kind FKs, evidence exclusive arcs), owner-scoped repositories.

## 10. End-to-end journeys (Playwright)

1. Email-first registration (Mailpit) → complete → login → logout.
2. Login page: validation, show/hide, loading, generic error, throttled state, keyboard-only, mobile, dark mode, axe.
3. Forgot/reset, including expired and reused links (fragment tokens).
4. Staff: invitation → enrollment with two virtual authenticators → login + WebAuthn → step-up action.
5. Address lookup on each chain (provider fakes) → disclosures, transfer basis wording, degraded banner.
6. Private report with images and a transaction hash → moderator authors a revision → (severe) an independent moderator approves that exact revision → system publication → public band and explanation update (no number); reporter notified.
7. Lost-key victim: documentary standing → appeal → non-participant reviewer decides.
8. Session management: revoke others; password change revokes others.

## 11. Coverage and gates

- Branch coverage floors: `identity`, `access`, `audit`, `evidence`, `moderation`, `risk` ≥ 90%; others ≥ 75%. Coverage is a floor; invariant and adversarial suites are reviewed explicitly.
- CI blocks on: lint, type check, all suites above, migration/drift, security scans, E2E smoke.

## 12. Test data and secrets

Sanitized fixtures only; generated per-run credentials; real mainnet addresses only as public chain data, never paired with allegations or personal data.

## 13. Frontend-first testing (Phases 1–6)

- **Contract-driven mocks:** the typed mock API client and its fixtures are validated against `@blacklist/contracts` Zod schemas in unit tests. A fixture that fails its schema fails CI.
- **Component and state tests** (Vitest + Testing Library): every screen covers loading, empty, error, degraded/stale, not-assessed, permission-denied (404-style) and success states defined by the PRD.
- **Playwright on mocks:**
  - the journeys in §10, each with mock adapters in place of real services;
  - mobile, tablet and desktop viewports; light and dark themes; keyboard-only flows; axe scans.
- **Security-sensitive UX checks:**
  - token pages read and strip the URL fragment and never send it in a GET;
  - generic auth errors;
  - no numeric public risk score;
  - defanged URLs;
  - the seed-phrase warning;
  - lookalike highlighting;
  - no `dangerouslySetInnerHTML` (lint).
- **Mocks confer no authority:** a build check proves the mock client is excluded from production bundles. No test treats mock role or session data as authorization.
- Frontend tests never satisfy backend gates (§9). Backend security suites (§4–§8) run when the corresponding backend phase is authorized.
