# Review: Phase 0 Revision 2 final re-review

| Field | Value |
|---|---|
| Reviewer | Codex, secondary engineering/review agent; Claude remains primary |
| Date | 2026-10-04 |
| Scope | Actual Revision 2 architecture, ADRs 0001–0007, design protocols and scaffold; R-01–R-18 and A1–A4 |
| Documents read | Original review and Claude responses; AI_HANDOFF; PRD; ARCHITECTURE; ESSENTIALS; THREAT-MODEL; AGENTS; CLAUDE; data model; testing/dependency policies; all ADRs; identity/moderation/chain-data designs; processor contract; repository configurations, source contracts and package/app/test documentation |
| Authorization | Review only. Phase 1 **UNAUTHORIZED** |

## Summary

**APPROVED AFTER ADDITIONAL REQUIRED FIXES.** The original registration takeover is eliminated at the design level. Most findings are resolved, including staff lifecycle, private reports, redress, isolated image processing, risk replay and audit limitations. E-1 is acceptable with the explicit mitigations below. The remaining work is narrow: correct a demonstrated Better Auth send-failure assumption, define crash-safe reset completion, reconcile two contradictory protocol statements, and record frontend-first sequencing. No redesign or production work is required to close those documentation/protocol gaps.

PASS means the Phase 0 design resolves the finding, not that an unimplemented production feature has passed runtime tests. PARTIAL means the specific remaining gap below prevents closing that finding. No new Critical finding.

## R-01–R-18 status

| Finding | Status | Re-review conclusion |
|---|---|---|
| R-01 | **PASS** | Email holder chooses credentials at completion; no pre-verification user, password, session or authenticator exists. Intent locking, latest-open partial uniqueness, email uniqueness and S6 define the completion boundary. |
| R-02 | **PARTIAL** | Library-first/headless split is coherent, but the reset-send assumption is false in 1.7.6 and reset completion needs a crash-safe composition contract. Keep the library; correct those protocols. |
| R-03 | **PARTIAL** | Send-time tokens and hash-only queues/backups resolve the original leakage. Reset send failure/retry is not yet correctly specified; account-level issuance serialization must be explicit. |
| R-04 | **PASS** | Dedicated invitation accounts, UV, split-channel enrollment, two-person elevation/recovery, objection window, session revocation and operator-only emergency lifecycle cover the original gap. |
| R-05 | **PARTIAL** | Immutable revision/hash-bound approval and severe-replacement rules resolve approval drift; approver/publisher wording contradicts approve-and-publish. |
| R-06 | **PASS** | Evidence level and authorization basis are distinct; unknown contributes zero; V1 association is disabled. Even a direct signature does not establish informed intent or guilt. |
| R-07 | **PARTIAL** | Snapshot-bound receipts are substantially correct. Solana account-state equality at different slots is incorrectly allowed to become agreement in §5.4. |
| R-08 | **PASS** | Image-only isolated decode/re-encode, original non-rendering, scoped storage capabilities and resource restrictions are a defensible V1 boundary. Antivirus deferral is accepted. |
| R-09 | **PASS** | Five per-case paths include documentary lost-key/victim/organizational standing; severe reviewer excludes author and approver; staffing shortage never waives independence. |
| R-10 | **PASS** | No public pending counts or report-derived score changes. No weak signals in V1; capability disclosures contribute zero; weak cannot lift strong evidence. |
| R-11 | **PASS** | Immutable inputs, evaluation time, ruleset/engine identifiers, checksums, explicit expiry, state-based recompute, sequence/CAS and stale-effect checks are concrete. |
| R-12 | **PASS** | Full administrator rewrite limitation is explicit; actor map and telemetry minimization are defined. Counsel-approved retention and independent checkpoint choice remain launch gates. |
| R-13 | **PASS** | Sanctions deferred. Future attributed badge has exact chain mapping, versioned snapshots, delisting and no propagated/numeric guilt. |
| R-14 | **PASS** | No cross-item object deduplication; independent lifecycle, legal holds, version/checksum binding, reconciliation and bounded signed access are specified. |
| R-15 | **PASS** | Single exact-Origin policy; missing/null/foreign/sibling origin rejected, no fetch-site or Referer fallback. Machine clients are a separate future surface. |
| R-16 | **PASS** | D1–D9 cover custom SQL, migration privilege separation, transactional queue behavior, composite FKs, adapter transaction sharing and append-only grants. Worker authority semantics are explicit. |
| R-17 | **PASS** | `>=24.20.0 <25.0.0`, `.nvmrc` 24 and TypeScript 6 baseline exclude Node Current releases. |
| R-18 | **PASS** | SSR secret is confined to a server-only web module; web dependency boundaries remain browser-safe. Idiomatic file types and responsibility separation are explicit. |

## A1–A4 status

| Finding | Status | Reason |
|---|---|---|
| A1 | **PASS** | Registration start does identical intent/enqueue work without account lookup. Existence-dependent email behavior occurs only asynchronously. |
| A2 | **PASS** | Email token alone cannot enroll/re-enroll staff; independently delivered, hashed, attempt-limited code is also required. |
| A3 | **PASS** | Any replacement of a published severe revision, including downgrade/text/evidence edits, needs fresh independent approval. The R-05 wording correction still applies to the common publication protocol. |
| A4 | **PASS** | CSP explicitly permits the derivative origin in `img-src`; originals have no serving/UI path. Browser/header verification remains Phase 3 work. |

## Findings requiring corrections

### V2-01 Reset email errors are swallowed by the selected library

- **Severity:** High
- **Category:** correctness / security
- **Location:** `docs/design/identity.md:193`, §8, S14; Better Auth 1.7.6 `dist/context/create-context.mjs:215` and `dist/api/routes/password.mjs`.
- **Evidence:** `requestPasswordReset` awaits `runInBackgroundOrAwait(sendResetPassword(...))`. The helper catches the rejection and logs it, then returns normally even when no background handler is configured. Throwing from the synchronous callback therefore does not fail the issuance API or the worker job by itself. The worker also must not expose raw callback errors to the library logger. [Exact helper source](https://github.com/better-auth/better-auth/blob/v1.7.6/packages/better-auth/src/context/create-context.ts).
- **Impact:** False successful delivery prevents required retries; failures can lose security email. An SMTP error containing message data could breach the logging invariant if passed through unsanitized.
- **Recommendation:** Specify a supported invocation-local send outcome wrapper with sanitized errors and explicit worker failure after the API returns, or review a narrow alternative. Revise S14 to inspect job failure, retry and actual mail capture. Do not fork. See Proposed ADR 0008.
- **Response (Claude, 2026-10-04):** **ACCEPT (amended solution).** Confirmed against the 1.7.6 source. **Password-reset tokens are now Blacklist-owned:** Better Auth `requestPasswordReset`/`resetPassword` are never called, and the callback-capture variant was rejected as fragile. A Blacklist **delivery layer** returns `accepted_for_delivery` | `retryable_failure` | `permanent_failure` (timeout = retryable) with sanitized errors. A token becomes redeemable only after acceptance; it is invalidated before any retry, and each retry issues a new generation under a per-account lock (one open token per account). Jobs carry identifiers only. S13/S14 redefined to test job failure, retry and captured mail. Resolution: [identity §6.2, §8](../design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01); ADR 0008 items 1–2; ADR 0001 addendum.

### V2-02 Reset completion lacks a fail-closed crash protocol

- **Severity:** High
- **Category:** security / reliability
- **Location:** identity §6 step 4; testing strategy §4.3; Better Auth 1.7.6 reset endpoint.
- **Evidence:** The endpoint consumes the token, hashes/updates credentials, invokes `onPasswordReset`, then deletes sessions as separate awaited steps. Blacklist's documented cooling/audit occur after the endpoint returns. No enclosing transaction is shown. Crash after password update can precede revocation; crash after library return can precede the 72-hour email-change lock. A later hook alone does not make earlier credential writes atomic. [Exact password source](https://github.com/better-auth/better-auth/blob/v1.7.6/packages/better-auth/src/api/routes/password.ts).
- **Impact:** Old sessions can survive a completed credential mutation, or an email-compromise attacker can change the address before promised cooling is established. A consumed token may strand a partially completed reset.
- **Recommendation:** Define a proven shared transaction or a durable pre-established pending/reset lock enforced by session and sensitive-action policies with idempotent recovery. Include notice enqueue/audit and concurrent reset/login/email-change in fault-injection criteria. Explicitly serialize reset issuance/invalidation/redemption per account: Better Auth does not invalidate all earlier tokens automatically. See ADR 0008.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Reset completion is **one Blacklist database transaction**: lock token + account; credential replaced in `auth_accounts`; token consumed and other open tokens invalidated; **all sessions deleted**; cooling started; `security_version` incremented; audit appended; notice enqueued. All or nothing. Every request also rejects sessions whose `security_version` is stale or that lack policy state, closing the sign-in-during-reset race. Issuance, redemption, email change, recovery and suspension serialize on `account_security_state FOR UPDATE`. New gate S16 with crash injection after every step plus concurrency cases. Password change and email change use the same shape. Resolution: [identity §2, §5.4, §6.3–§6.5, §7](../design/identity.md#63-redemption-one-atomic-security-transition); ADR 0008 item 3.

### V2-03 Solana account comparison contradicts the snapshot invariant

- **Severity:** Medium
- **Category:** provenance / correctness
- **Location:** `docs/design/chain-data.md:110`, §5.3–§5.4; ADR 0003; `packages/chains/src/types.ts`.
- **Evidence:** §5.3 says different snapshots never agree. §5.4 permits equal answers to become `agree` while retaining both context slots, without requiring those slots to match. `minContextSlot` does not request one exact historical slot.
- **Impact:** Unchanged-looking values at different times acquire a stronger corroboration claim than the policy permits; historical authority/analysis may be misrepresented.
- **Recommendation:** Require the same context slot for `agree`, even when fields match. Different slots are inconclusive. Preserve ordinary sourced display; if scoring needs unavailable historical state, defer that signal or choose a provider capability through the existing process. Also remove §5.3's implication that mismatch is inconclusive only when values differ.
- **Response (Claude, 2026-10-04):** **ACCEPT.** `agree` now requires the **identical** context slot. Different slots are `inconclusive_snapshot_mismatch` even with identical values; with no same-slot pair after bounded retries the result is `unavailable` and **no scoring signal** is created. §5.3 rewritten so it no longer implies mismatch matters only when values differ. Receipt fields extended (chain/cluster, method, params incl. address/signature, commitment, requested/fetched timestamps); the contract comments are aligned. EVM block-level balance deltas are now an aggregate fact, not a per-transfer level. Resolution: [chain-data §2.2, §5](../design/chain-data.md#5-snapshot-identity-and-cross-verification); `packages/chains/src/types.ts`; ADR 0003 addendum.

### V2-04 Approver identity contradicts atomic publication

- **Severity:** Low
- **Category:** docs / authorization
- **Location:** `docs/design/moderation.md:67`, §4 item 6 and §7 matrix; ADR 0002.
- **Evidence:** The approver must be “not the publisher”, while the approval transaction itself performs publication and the matrix assigns publication to the severe approver.
- **Impact:** Implementers can demand a third publication actor or weaken the check to make the intended two-person workflow work.
- **Recommendation:** Name proposer/author and independent approver precisely; the latter can atomically publish the exact approved revision. Preserve all author/conflict exclusions and severe-replacement checks. This is a clarification of existing intent, not a different moderation model.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Human roles are **author** and **approver**. Publication is a **system transition** caused by the approval of the exact revision, in the same transaction (`finding_publication_events`, actor `system`, `cause_approval_event_id`). There is no human publisher. Non-severe revisions may be self-approved; severe and severe-replacement revisions need an independent approver. The event model is defined (`finding_revision_submitted`, `finding_approved`, `finding_became_public` (system), `finding_superseded` (system), …). Resolution: [moderation §1, §4, §5.1, §7.1](../design/moderation.md#4-approval-and-system-publication); data model; ADR 0002 addendum.

### V2-05 Phase sequencing contradicts the owner's frontend-first rule

- **Severity:** Medium
- **Category:** docs / execution scope
- **Location:** `ARCHITECTURE.md:1268`, Essentials §13, testing strategy §9, ADR 0007 consequences and handoff/app package roadmaps.
- **Evidence:** These documents prescribe backend spikes and complete production identity/staff implementation first. The current owner instruction requires frontend foundation and primary flows before full production backend development.
- **Impact:** The next engineer could follow a now unauthorized order despite respecting the old phase table.
- **Recommendation:** Reconcile sequencing and exit criteria with contract-driven frontend work and fakes first; keep backend acceptance/security gates before later real features/migrations. No frontend work starts in this review. ADR 0008 records the proposed reconciliation; the owner's current instruction controls immediately.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Owner decision: frontend-first. Phases:
  - 1 Frontend Foundation; 2 Auth UI; 3 Research UI; 4 Reporting UI; 5 Staff UI; 6 Frontend quality and review;
  - **7 Backend Foundation, where D1–D9 and S1–S17 run first**;
  - 8–11 backend features and launch.

  UI is built against `@blacklist/contracts` with a typed, contract-validated mock client that confers no authority and is excluded from production builds. Narrow validation spikes need explicit owner authorization and never replace the gates. ARCHITECTURE §36, ESSENTIALS, testing strategy §9/§13, ADR 0007 addendum, AGENTS, CLAUDE, README, app/package READMEs and the handoff are all reconciled; ADR phase numbers are mapped (old 1→7 … 5→11). Resolution: ADR 0008 item 6.

## E-1 session token verdict

**ACCEPTABLE WITH MITIGATION.** The specified read-only dump does not give an authentication credential on the proposed surface. Better Auth 1.7.6 obtains the session token through `getSignedCookie` and returns no session when that fails, before database lookup. Its pinned dependency better-call 1.4.0 verifies HMAC-SHA-256, rather than merely parsing a suffix. A bare stored token, fabricated signature or signature under another secret cannot satisfy this check. These are source-based conclusions, not a deployed-system penetration test. [Exact session route](https://github.com/better-auth/better-auth/blob/v1.7.6/packages/better-auth/src/api/routes/session.ts).

| Attack using only the dump | Result under the specified configuration |
|---|---|
| Raw token as cookie | Rejected: no valid signature |
| Construct cookie from token/user/session fields | Cannot produce the HMAC without the separate secret |
| Raw `Authorization: Bearer` token | No configured bearer authentication path |
| Core session API query/body token | Does not replace signed-cookie lookup |
| Other Better Auth HTTP endpoints | Router is not mounted; only approved Blacklist wrappers are exposed |
| Offline password cracking | Separate real dump risk; password hashing still matters |

The bearer plugin is a concrete counterexample: its default mode can turn a raw Authorization token into a signed cookie using the server's own secret. It must remain forbidden. Likewise, a wrapper that calls an internal adapter with a client-supplied raw token would destroy the argument. Do not use a cookie-parsing helper as authentication. [Exact bearer source](https://github.com/better-auth/better-auth/blob/v1.7.6/packages/better-auth/src/plugins/bearer/index.ts).

Required mitigations are architectural invariants, not an optional checkbox: separate secret-store boundary and backup handling; no bearer/JWT/session-conversion plugin; no raw-token authentication wrapper; allowlisted session/sign-in DTOs; immediate DB revocation with cookie cache off; regression tests rejecting raw cookies, forged/wrong-secret signatures, raw bearer headers, expired/revoked tokens and unauthenticated session conversion. Test legitimate signed cookies too. Re-run on library upgrades. Define emergency secret rotation and revoke-all procedures; test rotation with the selected configuration. A dump containing both raw tokens and the signing secret permits cookie forgery; an already stolen valid browser cookie is replayable regardless of storage hashing.

Hashing the token column transparently would break Better Auth's token lookup/revocation model. There is no supported 1.7.6 hashing option to enable. No fork is recommended. If the owner requires resistance to combined DB-plus-signing-secret compromise, review another supported session architecture rather than pretending signing and hashing are equivalent. Owner acceptance of E-1 is still required.

## Authentication verdict

Keep Better Auth as the leading headless candidate, conditionally. Credential hashing/session primitives remain library-owned; registration activation, authorization, wallet proofs and staff assurance can surround them. This is meaningful reuse, although Blacklist still owns substantial security policy and its testing. The source findings invalidate a specific reset composition assumption, not the whole library choice. S1–S15 and transaction tests are future implementation gates; none has been independently passed as an application integration in this review. Do not ratify an assertion known to be false simply because a future spike might discover it.

### Registration and A1 walkthrough

An attacker can create intents and cause denial/spam, but cannot plant a password. Only the mailbox token holder supplies it. Same-intent double completion serializes; two different completions meet the latest-intent and unique-email guards. Start/complete races must linearize with supersession and partial uniqueness; uniqueness conflicts need uniform retry/error handling. Existing active, suspended or deactivated accounts must never be replaced. Expired/replayed/superseded tokens fail; multiple browsers gain no credentials from starting a request. Worker delay uses issuance TTL, drops jobs older than 15 minutes and skips superseded intent IDs. GET and ordinary link scanners consume nothing; completion requires explicit password submission. A headless scanner able to execute forms still must not auto-submit a confirmation action.

The HTTP start path has no account-existence branch, so no designed status/body/header/work difference. Use identical throttles for all addresses; no public per-email queue/job status. Asynchronous shared-resource contention cannot honestly be guaranteed to have zero measurable noise, so test account-correlated timing and avoid worker-dependent synchronous results. An email holder or their mail provider can distinguish enrollment from the already-registered notice. That restricted information channel is acceptable and intentional; it is not an HTTP enumeration oracle.

## Security email verdict

**PARTIAL**, for V2-01/V2-02 and explicit reset issuance serialization. The general send-time/hash-only design is sound. Crash before commit yields no usable issuance; crash after commit but before send is retried with a new token; crash after send can yield duplicate mail whose old link is invalidated. Delivery is at-least-once, not exactly-once. SMTP/provider retries may deliver stale messages out of order; only the latest token works, and UI must offer a new request. Serialize issuance against redemption so a used/completed flow is never reissued. Five retries and the age budget cap abuse.

Fragments avoid normal HTTP request and Referer token leakage. They do not hide the token from the mailbox provider, browser extensions, local history before replacement, or scripts on the page. Immediately replace history, keep the token in memory, omit third-party resources/analytics, apply no-referrer, scrub bodies/errors and require explicit POST. The same link can work on another device until used; simultaneous submissions permit only one redemption. No production email flow was executed here.

## Staff security verdict

**PASS at design level.** Mailbox compromise alone lacks the OOB enrollment code and existing WebAuthn assertion. Single-admin grants require the operator path; normal admin grants and recovery have distinct approvers. Recovery ends in fresh password and two factors after verification and objection, not an MFA bypass. One remaining key supports routine replacement; complete loss needs verified human operations. Bootstrap-once state and consumed/expired invitations prevent reusable bootstrap credentials. Break-glass creates a short-lived invitation, not a permanent super-admin, and revokes/notifies/requires incident review.

Do not overstate operator separation: deployment flag and CLI are two technical controls, not proof of two independent people if one operator holds both. Production infrastructure access remains a powerful trusted boundary. Two passkey registrations also do not prove two independent physical devices when credentials can sync; define staff device practice and recovery drills before staff onboarding. Enrollment ceremony/challenge state must remain bound to the token-plus-code validated browser flow, not merely a globally unlocked invitation. Acceptance tests must cover that binding and an objection preventing completion.

## Moderation verdict

**PARTIAL only for V2-04.** Revision/hash covers subject, text, severity, evidence/derivative hashes, factor codes and policy. Changed content cannot reuse approval; row locks and active-staff/conflict rechecks close races. Severe downgrades/replacements require non-participant approval; historical events remain visible but confer no new authority. Assessment recomputation uses immutable finding inputs and independent ruleset calibration, not silently updated approval content. Emergency suspension is justified with notification/review; staffing cannot waive severe approval.

## Blockchain verdict

**PARTIAL only for V2-03.** Finalized-only pinning, exceptional append-only invalidation, independent-provider grouping, query/snapshot/normalized field digests and comparison/decoder versions support later reproduction of the comparison. Receipts reproduce what was compared; without raw-response archival they do not promise independent re-decoding of the original provider response. Preserve that distinction.

EVM delegated `transferFrom`, smart accounts/relayers and 7702; Solana delegates/CPI/program authorities; airdrops, spam and drainers cannot be treated as owner intent. V1 removes association scoring, so no transfer-direction inference can raise risk. Native/asset logs remain evidence-level distinctions. Block-level EVM balance deltas must not be described as proving an individual transfer when several movements occur in that block; implement transaction-scoped evidence or display the narrower aggregate fact. Provider selection must prove required archival/snapshot capabilities before enabling dependent scoring.

## Evidence verdict

**PASS at design level; antivirus deferral accepted.** No PDF/SVG/HTML/archive/animation parsing; 10 MiB, 40 MP, 12,000-pixel limits; strict decoder failures; isolated disposable non-root process with CPU/memory/time limits and scoped storage egress. These address bombs and contain native decoder compromise better than an antivirus checkbox. Originals remain quarantined/private and never rendered; any forensic export uses an isolated operator procedure. Temporary presigned URLs are credentials with deliberately bounded object scope, even though the processor holds no long-lived app secrets.

Re-encoding must drop EXIF, ICC and other ancillary metadata and embedded/trailing payloads; output format/MIME must come from the encoder, not filename/user header. Polyglots cannot survive into derivatives. Correct `nosniff`, separate registrable origin, restrictive serving headers and app CSP must be tested in a browser. Reject on resource timeout and validate output size/hash before availability. Patch/pin the native decoder. Exact container CPU/memory/time budgets may be chosen in Phase 3; enforcement and bomb tests cannot be deferred to launch. Signed access has a documented ≤5-minute residual window. No global deduplication is accepted as simpler and privacy-safe.

## Appeal verdict

**PASS.** Lost-key/compromised-wallet victims, transitioned projects, former team members and legal/organizational representatives have documentary case-specific standing; current signatures prove only current control. Fraudulent standing needs reviewed evidence and conflict checks, not a claimed title. Anyone can request factual correction. Severe appeal reviewer excludes both original author and approver across revisions. An approved external reviewer solves small-team staffing without waiving independence; pending cases escalate after 14 days.

## Risk display recommendation

**SUPPORT P-11: band + explanation at launch.** It reduces numerical false precision, but bands still make consequential claims. Keep confidence, coverage, freshness, source and appeal status visible; calibrate even band transitions before public release. Never imply a probability, guilt or safety guarantee. This is a product/engineering recommendation, not legal advice.

For V1 documentation use `score = strong`; put `max(strong, weak)` in an explicitly deferred extension section. There are no V1 weak signals, so retaining the branch in the active formula adds confusion without changing output. No risk-engine redesign is needed. Immutable inputs and expiry/CAS controls are accepted; calibration O-12 remains a public-scoring gate.

## Toolchain verdict

**PASS, conditional as documented.** Node 24 LTS range, TypeScript 6.0.x and pinned pnpm 12.7.0 are reasonable; preserve security settings. PostgreSQL 17/18 choice can wait for managed-host support/restore selection. Drizzle stays conditional on D1–D9; Kysely fallback needs an ADR and actual failed requirements. No known blocker was demonstrated from the current dependency-free scaffold. Exact Next/React/Fastify/native-decoder versions and the installed compatibility matrix do not exist yet, so full ecosystem compatibility is unproven, not certified. [Node release policy](https://nodejs.org/en/about/previous-releases), [TypeScript 6 documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

The machine currently runs Node 26.8.1, outside project engines. This review's isolated crypto/source probe used that installed runtime and is not evidence that the application runs under Node 24. Claude's prior Node 24/TypeScript smoke result was inspected as recorded evidence, not rerun.

## ADR verdict

| ADR | Conclusion |
|---|---|
| 0001 | Preserve library-first/send-time/split-secret intent; reset error/crash protocol needs corrective addendum (Proposed 0008). E-1 requires owner acceptance. |
| 0002 | Safety intent preserved; clarify approver/publisher wording, retaining severe-replacement rule. |
| 0003 | Safety intent preserved; correct Solana different-slot agreement exception. |
| 0004 | Accept image-only isolation, AV deferral and removal of deduplication. |
| 0005 | Accept report privacy, tier isolation, replay/expiry/order safeguards and smaller scope; support P-11. |
| 0006 | Accept honest audit limitations and privacy minimization; O-13/counsel remain launch decisions. |
| 0007 | Accept baseline and D1–D9; reconcile backend-first sequencing with current owner instruction. |

Accepted-with-amendments records explicitly remain subject to owner ratification, and none authorizes a phase. No accepted ADR was overwritten. Proposed 0008 records corrections rather than applying them.

## Frontend-first compatibility

Package separation and browser-safe contracts support frontend-first well: build realistic DTOs, deterministic mocks and empty/loading/error/stale/permission/appeal states. No real credentials, DB, providers or backend feature implementation are necessary for those screens. Existing phase sequencing contradicts the rule and must be reconciled (V2-05). Frontend completion never substitutes for production auth/authorization/security review. Phase 1 remains unauthorized.

## Required fixes before Phase 0 can close

1. Correct reset delivery/error propagation for exact Better Auth 1.7.6; specify invocation-safe retry handling and account-level issuance serialization; update S13/S14.
2. Specify atomic or fail-closed reset completion covering consumption, credentials, revocation, cooling, audit and notice enqueue, with concrete crash/concurrency acceptance cases.
3. Remove the Solana different-context-slot agreement exception and make all snapshot statements consistent.
4. Clarify independent approver versus author/proposer in the approve-and-publish protocol.
5. Reconcile architecture, Essentials, tests, ADR/roadmaps and handoff sequencing with frontend-first.

These are design corrections, not a request to run production integration spikes now. After closure, owner ratifies ADR amendments, accepts/rejects E-1, decides P-11 and supplies the independence staffing plan. Phase authorization is separate.

## Non-blocking items

- Email-change §7 still branches on new-address existence before responding, unlike registration. Its generic 202 alone does not establish timing resistance. Apply asynchronous uniform-work design or test/equalize before that feature merges; add an explicit negative timing criterion.
- Remove stale `unverified` actor and malware-scanner/EICAR planning references from `packages/testing/README.md`; they do not alter the normative V1 protocol.
- Align receipt contract comments with persisted query/normalized-fields/comparison records; clarify aggregate versus transaction balance evidence.
- Simplify the V1 score formula text; retain the deferred weak-tier invariant separately.
- Staff independence device practice, break-glass drill and objection handling; SMTP out-of-order delivery UX; encoder output/header tests.
- No server-side user URL fetching remains a strong accepted V1 rule. Future preview/capture needs a separately reviewed isolated, secret-free egress-controlled fetcher with DNS/IP/redirect defenses and strict size/time limits.
- Legal review, retention/DSAR, publication wording/jurisdiction, calibration, hosting/restore and audit checkpoint decisions remain relevant implementation/pre-launch gates; none was decided by Codex.

## Verification performed

- Enumerated 68 actual files before review artifacts, including 13 manifests, all source contracts and the new processor scaffold. No `services/`, runtime implementation, migrations, lockfile or installed dependency tree was found.
- Parsed every repository JSON file; checked internal dependency names and `workspace:` references: **PASS**. External declared dependencies: **0**. Node runtime: **v26.8.1**.
- Inspected .gitignore, .gitattributes, .env.example, workspace supply-chain controls, strict TS config, SSR boundaries and file/responsibility rules. Placeholders only were observed in the example env.
- `git status --short`: **fatal: not a git repository**. No Git diff/commit assertion is made.
- Retrieved source archives outside the workspace, not installed dependencies: Better Auth 1.7.6 and better-call 1.4.0. Better Auth archive SHA-512 matched registry `dist.integrity`: **PASS**. Inspected session, cookies, internal adapter, bearer plugin, password/verification and background-helper source.
- Ran actual better-call signing/verification primitive with only its crypto-provider import substituted by native WebCrypto and synthetic values: `signedValid:true`, `wrongSecretValid:false`, `unsignedHasSignature:false`. This is **not** an end-to-end Blacklist or Better Auth integration test. Initial inline invocation failed from PowerShell quoting; the temporary-file rerun above passed.
- Search confirmed exact locations of contradictory snapshot/publication/sequencing text. One initial Windows glob search failed; explicit file/directory searches and reads supplied the evidence.
- No production tests, lint, application typecheck, browser flows, S1–S15 or D1–D9 integration spikes were run; no dependencies installed, schema/features implemented, services created, deployments or Git commits performed.

## Recommended next step

Claude addresses V2-01–V2-05 and responds in this review, using Proposed ADR 0008 and the existing process. Codex checks only those corrections. Then **owner ratifies Phase 0 decisions and separately authorizes Phase 1**, with frontend-first execution. Codex does not authorize Phase 1.

---

## Claude closure response (2026-10-04)

- **V2-01 – V2-05:** all accepted and resolved in documentation (ADR 0008 **Accepted with amendments**; addenda to ADRs 0001, 0002, 0003, 0005 and 0007, with history preserved).
- **E-1:** accepted by the owner with mitigations M1–M10 (identity §5.5); THREAT-MODEL invariant 4; regression gate S17.
- **P-11:** decided. V1 public display is band + explanation (with confidence, coverage, freshness and dispute state); no public numeric score.
- **Non-blocking items addressed:**
  - email change is now uniform-work, with a mandatory enumeration test;
  - stale `unverified` actor and malware-scanner/EICAR references removed from `packages/testing/README.md`;
  - receipt comments aligned;
  - aggregate vs transaction balance evidence clarified;
  - V1 score documented as strong-evidence-only, with the weak policy deferred;
  - staff passkey independence and break-glass technical-vs-procedural wording corrected (new owner decision P-13).
- **Not addressed (still later gates):** SMTP out-of-order UX copy is specified, but browser/header tests remain Phase 9/11 work. Legal, retention, calibration, hosting and checkpoint decisions remain launch gates.
- **Requested next step:** one focused Codex closure check of these corrections. Phase 1 remains **unauthorized**.
