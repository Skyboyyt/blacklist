# Review: Phases 7–8 as merged on `main`

| Field | Value |
|---|---|
| Reviewer | Claude (primary engineer), with six parallel read-only review passes; every High and the key Medium findings were re-checked by hand against the code |
| Date | 2026-10-15 |
| Scope | `origin/main` at `c11dcca` against `origin/chore/initial-repository` (`4b16cdb`): PRs #7–#12, about 380 files and 58k added lines. Identity, staff and step-up; database and migrations; Phase 8 chain research; deployment, worker and email; web live adapter; governance and document consistency. ADRs 0013–0018 |
| Documents read | AGENTS.md, CLAUDE.md, AI_HANDOFF.md, PRD.md, ARCHITECTURE.md (§7, §9, §36), ARCHITECTURE-ESSENTIALS.md, docs/data-model.md, THREAT-MODEL.md, docs/design/identity.md, chain-data.md, api-integration-contracts.md, ADRs 0001–0018, docs/reviews/2026-10-13-* and 2026-10-14-*, docs/evidence/** |
| Gates run by Claude | `pnpm install --frozen-lockfile` exit 0. `pnpm check` exit 0: 81 contract, 61 chain, 52 backend non-database and 405 web tests, lint, types, production build. `pnpm audit --prod`: no vulnerabilities. Full `pnpm audit`: one high, dev-only (`braces`, GHSA-vfj7-8cjw-p6xm, no patch). **Not run:** the backend database integration suites (they need Docker, which this environment does not have), coverage, browser E2E, anything against Render, Vercel, Neon or a provider |

## Summary

The core protocols hold when walked step by step:
- **Mailbox proof and tokens:** no credential before mailbox proof. Tokens become redeemable only after `accepted_for_delivery`. Fragment links, IDs-only job payloads and code-only errors.
- **Better Auth** runs headless.
- **Step-up** is bound to session, purpose and canonical action, single use, verified and executed in one transaction.
- **Append-only** tables are guarded by triggers and revoked grants.
- **No secrets** are committed. **TLS** is never relaxed, and the CSP is unchanged.
- **Phase 8:** RPC origins are a fixed allowlist with size and time caps and Zod validation. Authorization semantics follow ADR 0003. Unavailable data is never shown as zero, and no score is public.

The main problems are availability on the public deployment and process:
- **CR-01:** every user shares one throttle identity, so one anonymous visitor can lock all users out of login, registration and reset. Research is limited the same way.
- **CR-02:** password re-entry has no throttle, which makes a stolen session a password-guessing oracle.
- **Process:** Phase 8 provider code was merged from a Proposed ADR, four ADRs went live without the Claude review AGENTS §6 requires, and Phase 6 sign-off and Phase 7 closure are not recorded.

**Verdict:** the code is in good shape for a foundation, but the public URL should not take real users until CR-01, CR-02 and CR-10 are resolved, and `RESEARCH_ENABLED` should stay `false` until CR-03 and CR-06–CR-08 are fixed. Nothing here is a production-readiness judgement; Phase 11 gates remain.

## Findings

### CR-01 One throttle identity for every user of the public site
- **Severity:** High
- **Category:** security (availability)
- **Location:** `apps/api/src/plugins/security.ts:89-96`; `packages/domain/src/identity/throttle.ts:29-60,85-90,111`; `apps/api/src/main.ts:5-11`; `apps/web/src/lib/api/live/research.ts:36-40`
- **Evidence:**
  - `X-Forwarded-For` is trusted only as a single IP from the exact Render peer. `docs/evidence/2026-10-13-render-ingress-repair.json` records `"forwardedIsSingleIp": false` for every Vercel-proxied probe, so browser traffic falls back to one socket prefix. The handoff admits SSR "shares gateway throttling".
  - The web tier never sends `x-bl-client-ip` (no occurrence in `apps/web/src`).
  - `createIdentity` gets no `human` port, so `unavailableHumanVerifier` is used. A prefix key with `failures >= 5` demands a challenge that can only return `temporarily_unavailable`.
- **Impact:**
  - About five wrong passwords every 15 minutes, from anyone, lock every user out of login. This contradicts identity §12 / T-03 ("no attacker-induced denial of service").
  - 50 registrations or reset requests per day per prefix become a site-wide daily cap.
  - Research allows 30 cost units per minute per prefix, so roughly three page views a minute across the whole site.
  - Per-IP credential-stuffing detection (T-02) is meaningless.
- **Recommendation:**
  - Carry one verified client IP from the web tier: a header the trusted peer preserves, bound to the internal or staging credential, and validated with `isIP`, like `x-bl-client-ip`. Send it on SSR research and viewer calls too.
  - Until a human verifier exists, a challenge state should fall back to delay-only, never to a hard deny.
  - Add a test that two clients through the gateway get different prefixes.
  - Do not widen trusted CIDRs.
- **Response (Claude):** fixed in code (2026-10-15, this branch); **takes effect only after the owner sets `CLIENT_IP_FORWARDING_TOKEN`** (independent secret) on both the Vercel web project and the Render API.
  - **Browser requests:** the web proxy deletes any browser-supplied `x-bl-client-ip`/`x-bl-client-ip-token`. On `/api/v1/*` it sets them from the edge-reported visitor IP plus the secret. The API honours the IP only with a constant-time match of that secret.
  - **Server-side calls:** SSR research and viewer calls now send the visitor IP with the internal token, which the API already honoured.
  - **Tests:**
    - New web unit tests, run and passing.
    - An updated research adapter test, run and passing.
    - A new API integration test: two visitors get different prefixes, and an unproven or unconfigured header is ignored. It typechecks but was **not run here** (needs Docker).
  - **Not changed:** with no human verifier, five failures on one *email* key still lock that account for the 15-minute window (per identity §12, human verification fails closed). Wiring the `HumanVerifier` port (O-6) remains an owner decision.

### CR-02 Member re-authentication and the staff current-password check have no throttle
- **Severity:** Medium
- **Category:** security
- **Location:** `packages/domain/src/identity/account.ts:23-34` (`POST /api/v1/auth/reauth`); `packages/domain/src/staff/credentials.ts:86-90`
- **Evidence:** `reauthenticate` runs `lockActor` then `verifyCurrent` with no `throttle.admit`, no failure count and no failure security event.
- **Impact:**
  - A stolen member session cookie can brute-force the password at Argon2 speed.
  - Success unlocks email change, which is permanent account takeover and survives session revocation. The 8-character minimum (ADR 0016) makes this more practical.
  - Flooding the endpoint also fills the shared hashing queue, so other users' logins return 503.
- **Recommendation:** apply the login throttle keys (account, email digest, prefix) to both paths. Add a `reauth_failed` security event and negative tests.
- **Response (Claude):** fixed (2026-10-15, this branch). `throttledPasswordCheck` wraps member re-authentication and the staff current-password check:
  - admit first; on `invalid_credentials`, record a throttle failure and a `reauth_failed` security event; on success, record success;
  - routes pass the request's client prefix.
  - New negative integration test: five wrong attempts, then the sixth is refused even with the correct password, and five `reauth_failed` events are recorded. Existing call sites are updated. It typechecks but was **not run here** (needs Docker).

### CR-03 Research reads write permanent receipts, and the provider budget never resets
- **Severity:** Medium
- **Category:** security (availability) / architecture
- **Location:** `packages/domain/src/research/service.ts:198`; `packages/domain/src/chaindata/repository.ts:24-27,78-135`; `packages/chains/src/policy.ts:14-27`; `packages/config/src/index.ts:67-68`
- **Evidence:**
  - Every successful read calls `recordChainRead`, which appends to `verification_receipts` and `chain_fact_verifications`, including single-source and pending reads. The key hashes request and fetch times, so every cache miss is a new row, up to 1 MB each.
  - `budgetedTransport.total` only increases (default 100, cap 10,000). One Ethereum history page can make about 54 sequential calls, while the edge limiter charges a flat 2.
- **Impact:**
  - Anonymous users can grow append-only tables without bound.
  - The research budget runs out permanently until restart, after one or two page views at the defaults.
  - It goes beyond chain-data.md §4 and §5.2: non-final data belongs only in caches, and receipts are for verification.
- **Recommendation:**
  - Write receipts only for cross-verify, pinning and operator flows, on finalized data, with normalized fields limited to the §5.4 set.
  - Use a budget window matching the provider plan.
  - Charge the edge limiter per provider call.
- **Response (Claude):** partly fixed (2026-10-15).
  - **Fixed:** the total budget is now spent per `RPC_API_BUDGET_WINDOW_HOURS` window (default 24) and then restored. Unit test added; the ops doc and `.env.example` are updated.
  - **Fixed (2026-10-15, database tests run):** `recordChainRead` writes receipts only for a cross-verified read (two receipts). Single-source display reads go to `research_cache` only. `research.integration.test.ts` now asserts zero receipts and a cache row for ordinary reads.
  - **Still open:** charge the edge limiter per provider call.

### CR-04 The worker `/healthz` is public and probes the database, so anonymous traffic can burn free quotas
- **Severity:** Medium
- **Category:** security (availability)
- **Location:** `apps/worker/src/health.ts:5-31`; `apps/worker/src/worker.ts:17` (2-second polling); the worker URL is committed in the Render blueprint
- **Impact:**
  - One GET every few minutes keeps the free worker awake, and its polling keeps Neon from scaling to zero.
  - Free instance-hours and compute can run out, suspending the services for the month.
  - ADR 0017's gating does not bound this.
- **Recommendation:** answer liveness without a database query (or rate-limit it), raise the free-tier polling interval, and add quota alerts.
- **Response (Claude):** not changed in code. A public health check keeps the free worker awake, and its queue polling keeps the database awake, whatever the endpoint itself does. The real fix is an ADR 0017 amendment (authenticate the wake, or drop the public listener), which is an owner decision; see the ADR 0017 recommendation.

### CR-05 The offline password denylist has 20 entries but is documented as "expanded"
- **Severity:** Low
- **Category:** security / docs
- **Location:** `packages/domain/src/identity/password-policy.ts:7-28,49`
- **Evidence:** a 20-entry `Set`. Any HIBP error or 5-second timeout falls back to it, so `iloveyou`, `sunshine` and `11111111` are accepted while HIBP is down. ADR 0016, THREAT-MODEL and the public-registration review call it "expanded".
- **Recommendation:** bundle a real top-N list of at least 8 characters plus context terms, and correct the documents.
- **Response (Claude):** open. A real list needs an owner-approved source and licence, since bundling one is a new data dependency.

### CR-06 Failures caused by the queried item trip a provider-wide circuit breaker
- **Severity:** Medium
- **Category:** correctness / availability
- **Location:** `packages/chains/src/router.ts:155-160`; `rpc-transport.ts:142-155`; `evm-metadata.ts:84-86`
- **Evidence:**
  - A contract without `decimals()` reverts, which maps to `unavailable`, is retried twice, and counts toward the circuit.
  - Oversized receipts and schema failures count the same way.
- **Impact:** three views of any non-token contract shut off token metadata for all users for 30 seconds, repeatably, at three times the provider cost. A non-token contract is reported as "unavailable" instead of "not a token".
- **Recommendation:** give execution reverts their own error kind that is not retried and not counted. Return `standard: 'unknown'` for non-ERC-20 contracts. Count only transport failures.
- **Response (Claude):** fixed (2026-10-15).
  - JSON-RPC code 3, and -32000 "execution reverted", map to `not_supported`, which is not retried and does not count toward the circuit.
  - A contract without ERC-20 views returns `data: null` (not a token).
  - The router counts only `unavailable`/`timeout` toward the circuit.
  - New tests: transport revert mapping, router circuit, token metadata. Chain coverage is 81.7% branches against the 75% floor.

### CR-07 Digest inputs include fields that legitimately differ between providers
- **Severity:** Low (latent until a second provider exists)
- **Category:** correctness
- **Location:** `evm-transaction.ts:45`; `evm-rpc.ts:250-251`; `solana-transaction.ts:18`
- **Evidence:** the digests cover the optional log `removed` field, the raw receipt and transaction, and Solana's version-dependent `jsonParsed` output.
- **Impact:** genuine matches between two providers would be reported as `data_conflict`.
- **Recommendation:** digest exactly the chain-data §5.4 fields.
- **Response (Claude):** fixed for EVM (2026-10-15). The transaction receipt digests only the §5.4 fields (`comparison`: block hash, number, index, status and a logs digest over `{address, topics, data, logIndex}`) plus the decoded transaction. Raw receipt and transaction objects are no longer stored, and the spec version is bumped to `evm-transaction-v2`. A test proves that a log with and without `removed:false` gives the same digest.
  - **Still open:** the Solana instruction digest still uses `jsonParsed` output. Fixing it means switching to raw encoding in the Solana source; it is latent until a second provider exists.

### CR-08 An owner calling `transferFrom` on their own tokens is labelled `delegated`
- **Severity:** Low
- **Category:** provenance
- **Location:** `packages/chains/src/evm-transaction.ts:119-130`
- **Evidence:** there is no `sender !== from` check. ADR 0003 / chain-data §2.3 define `delegated` as a third-party `transferFrom`.
- **Recommendation:** require `sender !== from`, otherwise `unknown`, and add a test.
- **Response (Claude):** fixed (2026-10-15): `delegated` now requires `sender !== from`, otherwise `unknown` (still marked top level). Test added.

### CR-09 ADR 0013 gaps visible in code: the sole-admin recovery path is dead and objections are unrecoverable
- **Severity:** Medium
- **Category:** security / architecture
- **Location:** `packages/domain/src/staff/recovery.ts:121-142,172`
- **Evidence:**
  - `approveTx` requires an admin verifier, so the operator branch for a sole admin can never run.
  - `objected` is terminal, and `objectRecovery` needs no step-up.
- **Impact:** one compromised admin can suspend another (allowed by identity §10.12) and then object to every recovery, permanently.
- **Recommendation:** the transition model in ADR 0013's recommendation. Until it is accepted, keep today's fail-closed behaviour but add step-up to objections.
- **Response (Claude):** recommendation recorded in ADR 0013.

### CR-10 Real users' data in a staging database without retention, recovery or legal gates
- **Severity:** Medium
- **Category:** privacy / governance
- **Location:** ADR 0014 items 4 and 29–38, against its "Subsequent owner hosting instruction"; AI_HANDOFF (visitor protection removed)
- **Impact:**
  - Registration intents store the email of anyone who tries. Once a sender domain is verified, real accounts land in a free database with 6-hour history and no approved retention, privacy notice or recovery (PRD §6, AGENTS §5.6).
  - The owner authorized going live, but no record accepts this risk.
- **Recommendation:** before verifying a sender domain, either restore a registration gate (allowlist or invitation) or record the owner's risk acceptance and an interim data policy in an ADR.
- **Response (Claude):** decision for the owner.

### CR-11 Process: implementation from unaccepted ADRs and skipped phase exits
- **Severity:** High (process)
- **Category:** architecture / governance
- **Evidence:**
  - Phase 8 provider code was merged while ADR 0018 is Proposed and O-3 is open (AGENTS §6; ARCHITECTURE §36: "providers (after O-3)").
  - ADRs 0015–0017 were implemented with "Claude independent review pending". ADR 0014 has no valid status.
  - There is no Phase 6 owner sign-off. Phase 7 has no closure, and its only security reviews were by the implementer (§36 requires a Codex security review; Codex implemented it).
  - Review findings across seven review files still read "Response (Claude): pending". These include the Critical R-04 stale-mailbox reset race, fixed by Codex but never independently checked.
- **Recommendation:**
  - The owner records explicit waivers, or closes Phases 6 and 7 formally.
  - Phase 7 gets a non-implementer security review.
  - Claude's ADR recommendations are now recorded (0013–0018).
  - The pending finding responses get a dedicated pass, with R-04 first.
- **Response (Claude):** ADR recommendations recorded in this change; the remaining items are listed for the owner.

### CR-12 Architecture documents are stale and contradict each other
- **Severity:** Medium
- **Category:** docs
- **Evidence:**
  - `ARCHITECTURE.md`:
    - :5 says "Phase 1 is not authorized"; :12 lists only ADRs 0001–0008.
    - :162 says "Cache: none in V1", but migration 0005 adds `research_cache`, which is in neither chain-data.md nor data-model §4. That is a new table without an ADR.
    - The decision log stops at D-052.
  - ESSENTIALS and THREAT-MODEL still describe Phase 8 as an undeployed review branch.
  - ADR 0001 still says the minimum is 15.
  - `docs/adr/README.md` lacks 0013, 0014, 0016 and 0017.
  - `docs/phase7-acceptance.md` and `README.md` say no backend exists.
  - `docs/dependency-policy.md:28` claims CI runs audits, but no CI workflow exists.
  - chain-data §111 requires that operators are alerted on conflicts; this is unimplemented and not recorded as a deviation.
  - AGENTS §1 contradicts itself.
- **Recommendation:**
  - One consistency pass (Claude).
  - An ADR or data-model entry for `research_cache`.
  - A minimal CI workflow, or a correction to the dependency policy.
- **Response (Claude):** done (2026-10-15) for the status and consistency items:
  - AGENTS §1 is one current block;
  - ARCHITECTURE header and stack rows (database, cache, email), ESSENTIALS stage, THREAT-MODEL status and Phase 8 notes, data-model status and the `research_cache` flag, the chain-data alert deviation note, the ADR index (0013–0018), the ADR 0001 supersession note, README, phase7-acceptance and the dependency-policy CI note are updated.
  - **Still open:** the `research_cache` decision, the ARCHITECTURE decision log (D-053+) and a CI workflow (owner).

### CR-13 The handoff and evidence are stale and hard to audit
- **Severity:** Medium
- **Category:** docs
- **Evidence:**
  - AI_HANDOFF still says "UNDEPLOYED", "actual merge receipt follows" and "based on main5967afa".
  - The evidence JSON says `"merged": false`.
  - Nobody has recorded whether the Phase 8 web changes are live on Vercel.
  - The 1,792-line handoff has run-together text throughout ("backend189tests/38files PASS", "Production audit0PASS/full audit1…").
  - Test totals are self-written summaries; no raw runner or coverage output is committed.
- **Recommendation:**
  - Read back Vercel and Render after the merge and record it.
  - Reset the handoff to a short current-state block, with per-session tables linking to raw evidence, and archive the history.
- **Response (Claude):** done (2026-10-15) for the handoff. AI_HANDOFF.md is now a short current-state file, and the full history is moved unchanged to `docs/handoff-archive/AI_HANDOFF-to-2026-10-15.md`. **Still open (owner/Codex):** reading back Vercel and Render after the Phase 8 merge; committing raw runner and coverage output with evidence.

### CR-14 Database hardening
- **Severity:** Medium (D-1, D-2) and Low (the others)
- **Category:** architecture
- **Evidence and recommendations:**
  - **D-1:** `chain_fact_invalidations` has no INSERT guard tying a row to a pinned fact. The runtime role (shared with the staff CLI) can append a permanent invalidation. Add a BEFORE INSERT guard and a unique index.
  - **D-2:** `migrate.ts` applies all generated files before all hand-written ones, so fresh and existing databases apply migrations in different orders. Use one ordered sequence, record the order in the ledger, and test that fresh and incremental applies produce the same catalog.
  - **D-3:** runtime grants are allow-by-default followed by a hand-kept revoke list. Move grants into migrations and add a catalog test.
  - **D-4:** about 11 enum columns lack the CHECKs data-model §1 requires. Hashes are hex `text`, not `bytea`. Several columns are undocumented.
  - **D-5:** NOT VALID plus VALIDATE in one transaction, and a timezone-dependent cast in a CHECK.
- **Response (Claude):** D-1 and D-2 fixed (2026-10-15, database tests run).
  - **D-1:** new hand migration `0005_invalidation_guard.sql`. A BEFORE INSERT guard requires a pinned transaction and an `agree` verification whose receipts carry the cited digests, the pin's decoder version and a transaction different from the pin. A unique index allows one invalidation per fact. Tests show that forged, unpinned, extra-field, wrong-type and duplicate inserts are refused.
  - **D-2:** `migrations/order.json` is the single apply order, matching the order staging used, and is used by both the runner and the operator. An unlisted, missing or duplicate file stops the run. The operator's hard-coded count of 10 is removed.
  - **Still open:** D-3 to D-5.

### CR-15 Smaller issues
- **Severity:** Low / Info
- **Category:** correctness / hardening
- **Items:**
  1. ~~The moderator recovery verification stores `method` twice.~~ **Fixed 2026-10-15:** the contract, both screens, the mock and live adapters and the API moderator route now carry a separate rationale (10–1000 characters). Mock unit test and Chromium E2E pass.
  2. ~~Invalid tokens trigger Argon2 and an HIBP call before the token is checked.~~ **Fixed 2026-10-15:** a cheap token pre-check now runs before password work, and the locked re-check stays authoritative. An integration test shows the breach service is not called for an unknown token.
  3. `MAIL_WORKER_HEALTH_URL` accepts any `*.onrender.com` host.
  4. ~~`API_INTERNAL_URL` accepts `http:` for non-loopback hosts.~~ **Fixed 2026-10-15:** HTTPS is required except for loopback, in the rewrite and both SSR adapters (`internal-url.ts`, with a test).
  5. `NODE_EXTRA_CA_CERTS` is passed to the runtime.
  6. ~~Password change maps `password_breached` to "temporarily unavailable".~~ **Fixed 2026-10-15:** the account contract gains `password_policy_rejected`/`password_breached`, and the member and staff paths and the form show the rejection on the new-password field.
  7. ~~Admin and member live adapters map `conflict` and `session_expired` to `temporarily_unavailable`.~~ **Fixed 2026-10-15:** member `session_expired` maps to `sign_in_required`; admin `conflict`/`invalid_request` map to `invalid_transition`, and `not_eligible` is kept. Admin `session_expired` to `forbidden` already matched §7.
  8. The research view renders `incomplete` sections as complete zeros (latent; today's API sends `unavailable`).
  9. `allowBuilds` still lists `esbuild@0.18.20`, which is gone from the lockfile.
  10. The mock-exclusion check is not in `pnpm check` and there is no CI.
  11. The Phase 6 repairs (P6-01–P6-03) are sound. A stale open appeal is now stranded until the appellant withdraws, so the backend design needs a reconcile path.

## Recommended order

1. **CR-01** (shared throttle identity) and **CR-02** (re-auth throttle). Until they are fixed, restore a registration or visitor gate (CR-10).
2. Owner records waivers or closes Phases 6 and 7 (**CR-11**), and decides on the ADR recommendations now recorded in ADRs 0013–0018.
3. Conditions for `RESEARCH_ENABLED=true`: **CR-03**, **CR-06**, **CR-07**, **CR-08**.
4. Database hardening, **CR-14** D-1 and D-2, before the next migration.
5. Documentation consistency and handoff reset: **CR-12**, **CR-13**. Then the pending finding responses, R-04 first.
