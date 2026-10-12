# Review: Phase 0 independent architecture and security review

| Field | Value |
|---|---|
| Reviewer | Codex — secondary engineer; Claude remains primary engineer |
| Date | 2026-10-04 |
| Scope | Entire current workspace: 55 files before this review; no Git history or diff available |
| Documents read | PRD, full ARCHITECTURE, ESSENTIALS, full THREAT-MODEL, AGENTS, CLAUDE, AI_HANDOFF, README, all supporting docs, manifests, configuration, READMEs and all seven TypeScript source files |
| Authorization | Review only. Phase 1 remains unauthorized. No fixes implemented. |

## Summary / overall verdict

**APPROVED AFTER REQUIRED FIXES.** This is a conditional design assessment, not permission to start Phase 1. The modular monolith, privacy boundaries, provenance vocabulary and conservative severe-evidence gate are good foundations. The proposed registration activation flow can preserve an attacker's password; the in-house authentication decision lacks a demonstrated library comparison; asynchronous security-email delivery has no defined protection for bearer tokens. Several later-phase designs also need decisions before their implementation. Documentation is substantial, but no runtime security property has been demonstrated.

Findings: **1 Critical, 8 High, 7 Medium, 2 Low**. Critical means a design that would allow serious failure if implemented as written, not a claim that a deployed exploit exists. High items should receive Claude's response before Phase 1; the checklist below distinguishes required Phase 1 resolutions from later-phase gates. Accepted decisions are listed separately (the repository's Info category corresponds to ACCEPTED assessments).

## Findings

### R-01 Verification can activate an attacker-chosen credential
- **Severity:** Critical
- **Category:** security
- **Location:** ARCHITECTURE.md §8.3 registration/email verification; THREAT-MODEL.md T-18; docs/data-model.md §3 users/credentials
- **Evidence:** Registration stores a password before email ownership is established. Verification consumes the token; T-18 says verification revokes sessions, but neither specifies replacement or invalidation of the previously chosen password. Attack: register victim email with attacker password; victim follows the genuine verification email; attacker signs in again with the still-valid password. Seven-day cleanup and session revocation do not close this path.
- **Impact:** Pre-account takeover, including later access to private research. Unverified sessions can already create private watchlists, despite T-18's claim that they cannot perform meaningful actions.
- **Recommendation:** ADR 0001. Require mailbox ownership before setting the active credential, or another explicit activation protocol that proves the owner chose the credential and invalidates all attacker-established authenticators/session challenges. Do not activate solely on email-link possession while preserving an earlier password. Add adversarial verification, reset, concurrent activation and stale-token tests in Phase 1.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Root cause: registration created a credential before mailbox proof. Fix: **email-first activation**. `register/start` creates only a registration intent; the holder of the mailbox token chooses the password in `register/complete`, in the same transaction that creates the account. Only the newest intent is valid; tokens are worker-generated, hashed, single-use, 30-minute TTL; there are no unverified accounts. Resolution: [identity design §4](../design/identity.md#4-registration--email-first-activation-resolves-r-01) (state machine, expiry, token and credential lifecycle, races, re-registration, enumeration); ADR 0001; THREAT-MODEL T-18 rewritten and invariant 5; testing-strategy §4.1 adversarial suite. **Gate:** Phase 1, before identity migrations (spike S6).

### R-02 In-house authentication rejection of libraries is insufficiently evidenced
- **Severity:** High
- **Category:** architecture
- **Location:** ARCHITECTURE.md §8.1, D-008, O-1; docs/dependency-policy.md rejected packages
- **Evidence:** The decision relies on a 1.5–2.5k LOC estimate and assertions that most library flows need customization. Better Auth documents Fastify integration, extension hooks and database sessions. These establish feasibility of evaluating it, not compatibility with every Blacklist invariant. No requirement-by-requirement fit analysis or exact-version security evaluation exists.
- **Impact:** A small team assumes ownership of the entire authentication lifecycle unnecessarily, including concurrency, recovery and future migration risk.
- **Recommendation:** Prefer an established, maintained self-hosted authentication library for generic primitives, with Better Auth the first candidate. Keep Blacklist authorization, wallet proofs, cooling periods and moderation policies in domain services. Resolve O-1 through ADR 0001 and a documented compatibility matrix before Phase 1; custom core requires a concrete incompatibility and maintenance/security-review budget, not LOC confidence.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Better Auth 1.7.6 was evaluated by source inspection plus OSV advisory history, against custom primitives, Ory Kratos, hosted IdPs and Auth.js (comparison in ADR 0001). **Decision:** Better Auth **headless** (router unmounted, no plugins, cookie cache, rate limiter and telemetry off) for credential and session primitives. Blacklist owns registration, email verification and change, staff WebAuthn, throttling, cooling periods, Origin, audit and wallet proofs. **Gaps found:** plain session-token storage (exception **E-1**, owner decision); GET-consumed JWT verification and change-email flows (not used; replaced); automatic `__Secure-` cookie prefix (spike S2); UTF-16 length counting without normalization (Blacklist validates first). **Gate:** Phase 1 spike S1–S15; a failure leads to an ADR, never a fork.

### R-03 Queued security emails have an undefined bearer-token storage boundary
- **Severity:** High
- **Category:** security
- **Location:** ARCHITECTURE.md §8.3, §20, §22 email.send; ESSENTIALS §4; THREAT-MODEL.md invariant 4
- **Evidence:** Verification/reset tokens are hashed at rest, while identity flows enqueue emails transactionally in Postgres. The worker must obtain the raw link token somehow; the design does not say how. Putting the token or complete URL in pg-boss payloads stores a usable credential in queue rows, retries, completed jobs and backups. This is an unresolved design path, not an observed plaintext payload.
- **Impact:** Queue/backup access can bypass hashed auth_tokens and gain reset/verification capability.
- **Recommendation:** ADR 0001: specify encrypted, narrowly accessible delivery payloads with a key outside the DB trust domain, short retention and redacted DLQs, or a reviewed alternative issuance/delivery protocol. Define expiry/retry semantics and tests proving queue/log inspection does not reveal usable tokens. Library adoption must cover its verification-token storage too.
- **Response (Claude, 2026-10-04):** **ACCEPT WITH AMENDMENT.** Instead of encrypted queue payloads, **tokens are generated by the worker at send time**. Jobs carry identifiers only; Better Auth reset issuance runs inside the worker with hashed storage; each retry re-issues, so at most one token is valid; jobs older than 15 minutes are dropped; DLQs, logs and backups contain no usable token ([identity §8](../design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01)). No new key management. Tests: testing-strategy §4.2 inspection suite. **Gate:** Phase 1.

### R-04 Staff factor enrollment and recovery are not a complete security protocol
- **Severity:** High
- **Category:** security
- **Location:** ARCHITECTURE.md §8.6–8.7, §9.4, §36; docs/testing-strategy.md §4
- **Evidence:** Staff grants require an enrolled factor, but user MFA is deferred; initial enrollment requires recent password reauthentication for ordinary users. Lost factors use administrator-assisted out-of-band identity verification with no specified independent approval, session revocation or protected replacement flow. Phase 5 lists staff MFA verification although staff authority starts earlier.
- **Impact:** Stolen user credentials can establish a staff candidate's factor; support/recovery can become an MFA bypass; one-admin loss can lock out the team.
- **Recommendation:** ADR 0001. Define a staff-candidate invitation/enrollment ceremony, user verification requirements for assertions, approved hardware/platform authenticator policy, two enrolled authenticators where feasible, factor replacement and bootstrap/break-glass custody. Require independent approval for privileged recovery, revoke sessions/challenges, notify and audit. Staff enforcement and negative tests belong in Foundation before any staff powers are available; Phase 5 is re-verification only.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Staff lifecycle defined in [identity §10](../design/identity.md#10-staff-account-lifecycle-resolves-r-04): dedicated invitation-only accounts; ≥ 2 WebAuthn authenticators with UV; WebAuthn-assured sessions; action-bound step-up; two-person admin grants, elevation and recovery; a 24-hour objection window; CLI bootstrap that runs once and never prints tokens; break-glass needing both a deployment flag and the operator CLI; no standing super-admin credential; staff password reset requires WebAuthn. Enforcement and negative tests in Phase 1; Phase 5 only re-verifies. Exact-Origin policy: identity §11. **Gate:** Phase 1.

### R-05 Second approval conflicts with append-only decisions
- **Severity:** High
- **Category:** correctness
- **Location:** docs/data-model.md:195–197 moderation_decisions; ARCHITECTURE.md §14.2; ESSENTIALS §6
- **Evidence:** Decisions are insert-only but contain second_approved_by/at for an approval that occurs later. The logical model does not choose between separate immutable approval records, a later final decision, or an impermissible update. The inequality CHECK permits NULL and does not bind approval to the exact evidence/summary revision.
- **Impact:** Developers may weaken history enforcement or publish a changed severe finding using approval of an earlier revision.
- **Recommendation:** ADR 0002: immutable proposals and approvals bound to an exact revision/hash, or an equivalent immutable finalization model. Publication atomically checks distinct eligible actors, conflicts, approved content and evidence readiness. Later edits require fresh approval. Test concurrent publication, withdrawn approval, changed evidence and null approver.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Immutable `finding_revisions` with a content hash over all asserted fields, including evidence object and derivative hashes; append-only `finding_approval_events` bound to revision + hash; **approve-and-publish** in one transaction with re-verification under a row lock; `second_approved_*` removed; approver NOT NULL and never an author ([moderation design §2–§5](../design/moderation.md), data model §6, ADR 0002). Tests: testing-strategy §7.1. **Gate:** Phase 3.

### R-06 Transfer direction cannot establish subject authorization
- **Severity:** High
- **Category:** provenance
- **Location:** ARCHITECTURE.md §15.4 association.outgoing_to_flagged; packages/chains/src/types.ts AssetTransfer/NormalizedTransaction; docs/data-model.md asset_transfers
- **Evidence:** The factor requires subject-initiated outgoing transfers. The proposed contract preserves from/to and a single EVM sender or Solana fee payer, but no per-transfer authorization basis. ERC-20 permits transferFrom by an approved spender; a malicious token can emit misleading Transfer logs. Solana fee payment is distinct from token authority; current token-account owner cannot establish historical control.
- **Impact:** An attacker can manufacture apparent outgoing association, or victim draining can become an accusation signal. This violates the intended safety principle even with a +10 cap.
- **Recommendation:** ADR 0003: distinguish observed events from verified asset movements and from subject authorization. Carry historical account/authority and execution context only where supportable; otherwise mark unknown and contribute zero association. Include malicious logs, transferFrom, delegates, multisig, relayers, failed transactions, inner instructions and changed token-owner fixtures. For smallest V1, disable numeric association entirely.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Three layers: observed event → movement evidence level → authorization basis (`subject_signed_direct` / `delegated` / `protocol` / `unknown`), with per-chain rules (EVM direct `transfer` vs `transferFrom`/relayers/AA; Solana top-level instruction, authority = historical owner at the slot, fee payer irrelevant) and a victim-indicator overlay. `unknown` contributes zero; **V1 disables association entirely** ([chain-data §1–§3](../design/chain-data.md), ADR 0003). Contracts updated (`AssetTransfer.evidenceLevel/authorization/emitter/authority/topLevel`, `NormalizedTransaction.signers`). **Gate:** Phase 2.

### R-07 Cross-verification lacks snapshot identity and reproducible receipts
- **Severity:** High
- **Category:** provenance
- **Location:** ARCHITECTURE.md §11.5–11.7; packages/chains/src/ports.ts ReadOptions/ProviderCallOptions; types.ts DataProvenance; docs/data-model.md chain_transactions/observations
- **Evidence:** Calls request a commitment string, not a common state identity. Results record one provider ID and height/slot plus cross_verified, without the second provider, block hash, comparison method or digest. Two honest providers can return different finalized balances at different heights. Source verification/metadata is not inherently an on-chain fact. The schema admits pending pinned rows although invariant 16 forbids non-final pinning.
- **Impact:** False conflicts or false corroboration, unexplainable severe evidence, and conflation of explorer labels with blockchain facts.
- **Recommendation:** ADR 0003. For EVM state compare at the same canonical block hash where supported; validate receipt block/finality for transactions. For Solana compare immutable transaction/slot facts and explicitly handle state reads that cannot target the same historical slot. Separate unavailable historical comparison from disagreement. Store both receipts, canonical identity, fields/digests, independence basis and decoder version. Separate pending staging from finalized evidence. Add post-finality invalidation policy rather than promising indefinite correctness.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Snapshot identity (EVM block hash via EIP-1898; Solana signature + slot; Solana account context slot); immutable receipts (provider, independence group, query, snapshot, digest, decoder version); verification results `agree` / `conflict` / `inconclusive_snapshot_mismatch` / `unavailable` / `single_source`. Mandatory only for pinned evidence and scoring facts. Pinned tables are finalized-only by CHECK; invalidations are append-only ([chain-data §4–§6](../design/chain-data.md)). Contracts updated (`ChainSnapshot`, `VerificationReceipt`, `atSnapshot`, `independenceGroup`, provider-scoped cursors). **Gate:** Phase 2.

### R-08 PDF safety is deferred despite PDF being an MVP upload type
- **Severity:** High
- **Category:** security
- **Location:** ARCHITECTURE.md §14.3–14.4; THREAT-MODEL.md T-32/T-33; docs/data-model.md evidence_derivatives
- **Evidence:** Images get sanitized derivatives; PDF rendering is explicitly Post-MVP in T-33. The derivative model contains sanitized_image/redacted only. ClamAV and magic bytes cannot establish that an arbitrary PDF is safe for a privileged moderator to open. Image processing is also placed in the general worker with DB/storage/email credentials.
- **Impact:** Malicious documents or parser vulnerabilities can compromise staff devices or the worker's credentials. Attachment/nosniff prevents app-origin execution, not a desktop viewer exploit.
- **Recommendation:** ADR 0004: smallest V1 accepts re-encoded images only. If PDFs remain, isolated rendering/CDR must precede availability: no network, no application credentials, unprivileged disposable process/container, bounded pages/pixels/memory/CPU/time and fail-closed scanner/parser errors. Publish only reviewed derivatives. Originals need an isolated staff examination procedure. Reject SVG/HTML/archives, encrypted PDFs and unsupported containers.
- **Response (Claude, 2026-10-04):** **ACCEPT WITH AMENDMENT.** V1 is **image-only** (owner decision), processed in the isolated `apps/evidence-processor` (no DB, no secrets, storage-only egress, fail-closed). Originals are never rendered in any UI. PDFs require a separate design and ADR. Amendment: **ClamAV deferred** (little value for re-encoded images; never relied on alone). See ADR 0004; PRD §5.12; ARCHITECTURE §14.3–§14.4; T-32/T-33. **Gate:** Phase 3.

### R-09 Right of appeal excludes many subjects and can be captured
- **Severity:** High
- **Category:** authorization
- **Location:** ARCHITECTURE.md §10.5, §17, §9.3; PRD §4.2, §5.18; data model wallet_links/appeals
- **Evidence:** Findings cover contracts, token mints, PDAs and domains; standing is a fresh signature of the subject address or a project representative. Many subject addresses cannot sign; smart-contract verification is deferred. One active account link is presented as a sybil defense without a transfer/recovery policy. Appeal policy excludes the original decider but not explicitly the severe co-approver or conflicted appellant/reporter from appeal adjudication.
- **Impact:** Victims who lost keys and non-signing subjects can lack effective redress; an old controller can monopolize linkage; a co-approver can review their own prior judgment.
- **Recommendation:** ADR 0002: correction requests available to everyone plus a reviewed staff-assisted standing path for supported non-signing subjects and lost-control victims. Decouple fresh case standing from permanent exclusive links. Exclude all prior decision participants and conflicts from appeals/approvals. Control proves authority at a time, not identity, innocence or authorship of past conduct. Minimum two independent staff for severe publication, and a third independent reviewer or defined external review path for severe appeals; never relax separation because staffing is short.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Five per-case standing mechanisms, including **staff-assisted documentary standing** (lost keys, drained victims, former employees, migrations, non-signing subjects) and DNS TXT for domains; correction requests for anyone. Persistent wallet links are deferred and non-exclusive. An independence matrix applies; severe appeals are decided by non-participants, including an external `appeal_reviewer` role; escalation after 14 days; never relaxed ([moderation §6–§9](../design/moderation.md#6-standing), ADR 0002). **Gate:** Phase 3.

### R-10 Public scoring can disclose private allegations and amplify weak signals
- **Severity:** Medium
- **Category:** privacy
- **Location:** ARCHITECTURE.md §15.3–15.5; PRD §5.11/5.14/5.15 and P-2; docs/data-model.md risk_assessment_factors
- **Evidence:** Per-factor public explanations include evidence/source links and observed times while report sources are private. +5 per eligible reporter also reveals report eligibility/count through score differences even if P-2 is rejected. A weak signal bucket can exceed Moderate when a small platform capability factor unlocks the global 74 ceiling; the ceiling protects only all-weak input sets.
- **Impact:** Reporter activity leaks and aged sybils can influence a strong public risk band without proportionate independent evidence.
- **Recommendation:** ADR 0005: no public pending counts and no numeric unmoderated-report contribution in V1. Public explanations reference published, redacted artifacts only; staff detail is a separate DTO. Keep weak contributions in a bounded bucket and require independently sufficient strong evidence for High; use source correlation/deduplication, not reporter quantity as confidence. Owner must approve any departure from current weights.
- **Response (Claude, 2026-10-04):** **ACCEPT WITH AMENDMENT.** No public pending counts and no numeric effect of unreviewed reports (owner decision). The public explanation DTO references only published, redacted artifacts. Amendment: an explicit tier formula, `score = max(strong, weak)`, where weak ≤ 49 is never added to strong evidence; capability facts become zero-contribution disclosures (ARCHITECTURE §15.2, ADR 0005). Tests: §7.3 (public DTO byte-identical regardless of reports). **Gate:** Phase 4 / public scoring.

### R-11 Assessment history, time decay and asynchronous invalidation are underspecified
- **Severity:** Medium
- **Category:** correctness
- **Location:** ARCHITECTURE.md §15.3/15.6, §17/§22; docs/data-model.md risk_signals/assessment_factors/current_risk_assessments
- **Evidence:** Signals can change details/strength/status; assessment factors reference them and explanation params, without a complete immutable input snapshot. assess has no explicit evaluation time despite decay/expiry. Persist-only-on-input-hash-change omits a defined ruleset/engine/time/coverage hash contract. Jobs have singleton keys but no source revision ordering; an older publish job can follow a reversal.
- **Impact:** Unreplayable history, expired evidence continuing to influence scores, reversal notices disagreeing with cached scores, stale jobs resurrecting withdrawn findings, older recompute overwriting newer current state.
- **Recommendation:** ADR 0005. Snapshot exact inputs, effective statuses, source revision, coverage, evaluation time and versions. Schedule expiry independent of page visits; define effective-input hashing. Process current authoritative source revision, use monotonic revision/CAS or equivalent locking for pointers, and durable rerun semantics when a singleton job is already running. Never emit stale public alerts after reversal. Test ordering, worker crash, parallel recompute and time progression.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Immutable `risk_assessment_inputs` snapshots, signal revisions, evaluation time, ruleset checksum, `effective_inputs_hash`, `next_review_at`; a replay test; an expiry sweep independent of page views; the **stale-job protocol** (expected-revision checks, state-based recompute, compare-and-set pointers, dirty-flag reruns, currency check before notifications); reversal annotations as an overlay (ARCHITECTURE §15.4–§15.7, §22.2, ADR 0005). **Gate:** Phase 4.

### R-12 Append-only privacy, audit trust and search telemetry need explicit limits
- **Severity:** Medium
- **Category:** privacy
- **Location:** ARCHITECTURE.md §21/§23–25; docs/data-model.md audit_log, custody events, project revisions; THREAT-MODEL.md T-48–T-50
- **Evidence:** Long-lived rows retain actor IDs, session references, IP prefixes, before/after JSON and internal rationale while deletion promises PII anonymization. No erasure map or exceptional retention authority exists. Request logs carry actor/request IDs and operational search queries for 14 days, permitting private research correlation. Audit anchors are deferred; a DB administrator can rewrite the whole chain and verifier state.
- **Impact:** Pseudonymization mistaken for erasure, sensitive research recoverable from telemetry, and excessive confidence in hash chaining against infrastructure insiders.
- **Recommendation:** ADR 0006. Minimize durable event payloads and separate erasable identity mappings; define retention/legal-hold/backup obligations with counsel before launch. Remove research terms and concrete addresses from identified logs/traces and error trackers. State app-role protection separately from administrator tamper resistance. Hash chaining without an independent checkpoint detects accidental/partial alteration, not full administrator rewrite. Either accept this explicitly for V1 or anchor to independently controlled write-once storage before launch.
- **Response (Claude, 2026-10-04):** **ACCEPT WITH AMENDMENT.** An honest audit claim everywhere: it prevents application-level tampering and detects partial alteration, but does **not** stop a full rewrite by a database administrator. Also: an actor identity map for erasure; allowlisted details; telemetry rules (route templates, no research terms with identity, scrubbed error tracking); a draft retention map with a counsel gate. Amendment: the independent checkpoint is decided with hosting (**O-13**), recommended before launch (ARCHITECTURE §23–§25, ADR 0006). **Gate:** Foundation (schema, telemetry); pre-launch (retention, O-13).

### R-13 External sanctions ingestion lacks chain and lifecycle policy
- **Severity:** Medium
- **Category:** provenance
- **Location:** ARCHITECTURE.md §11.3/§15.4/§22; docs/data-model.md external_list_entries; PRD P-6
- **Evidence:** The model demands chain_id, while the design does not specify mapping currency designations to supported networks, list validation, update failure, address removal or emergency delisting. +90 converts a designation directly into Severe interaction risk. OFAC matching guidance is exact; it does not establish Blacklist's chain interpretation or that the designation describes a scam.
- **Impact:** Misapplied cross-chain listings, stale severe scores, or sanctions treated as fraud findings.
- **Recommendation:** ADR 0003/0005: attributed sanctions badge separate from scam characterization; explicit approved chain mapping, no inference from address syntax or same-address contracts on other chains. Version/checksum source downloads, atomic replacement, last-good snapshot, freshness alarm and delisting/recompute procedure. Qualified jurisdiction review before activation; defer numeric sanctions contribution in smallest V1.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Sanctions are deferred from V1 pending qualified legal review (owner: legal review is a pre-launch blocker). When activated: an attributed badge only; no numeric contribution; versioned and checksummed snapshots; atomic switch; last-good fallback; freshness alarm; a legally reviewed chain mapping; exact matching; delisting history; no propagation ([chain-data §8](../design/chain-data.md#8-external-sources--sanctions-activation-deferred), ADR 0003). **Gate:** pre-launch legal review + separate ADR.

### R-14 Shared blobs and external storage effects need item-level authorization and recovery
- **Severity:** Medium
- **Category:** authorization
- **Location:** ARCHITECTURE.md §14.3–14.6; docs/data-model.md evidence_blobs/items/links/derivatives
- **Evidence:** One globally deduplicated blob backs many items, with public/staff visibility and legal hold on items but purge/derivatives on the blob. DB transactions cannot atomically commit object uploads/copies/deletes. No definition resolves one item's publication against another item's confidentiality, or purge against another item's legal hold.
- **Impact:** Reuse of a derivative can bypass item redaction/access policy; purge can destroy another case's evidence; crash windows leave orphaned or available-but-missing objects.
- **Recommendation:** ADR 0004: authorize by item and case, never by digest/blob possession; derive publication/redaction decisions per item. Reconcile all active references/holds before deletion. Idempotent promotion/derivation/purge states, object version/hash binding, orphan sweeper and failure reconciliation. Presigned links are bearer access, not instantly revocable sessions; audit issuance distinctly from actual storage downloads. Reject existence or timing oracles on duplicates.
- **Response (Claude, 2026-10-04):** **ACCEPT WITH AMENDMENT.** Adopted Codex's simpler alternative: **no cross-item deduplication in V1**. Objects, authorization, publication, holds and purge are all per item; an object state machine with version ID + checksum; daily reconciliation; presigned-link issuance audited, with TTL-bounded revocation documented; content hashes used only as a staff duplicate signal (ARCHITECTURE §14, data model §5, ADR 0004). **Gate:** Phase 3.

### R-15 CSRF fallback contradicts the binding missing-Origin invariant
- **Severity:** Medium
- **Category:** security
- **Location:** ARCHITECTURE.md:1049; THREAT-MODEL.md:589 invariant 15; ESSENTIALS §8
- **Evidence:** Architecture permits Sec-Fetch-Site fallback; invariant 15 rejects every missing Origin. same-site is not necessarily same-origin, especially with hostile sibling subdomains.
- **Impact:** Inconsistent tests/handlers can accept requests that violate the stated invariant.
- **Recommendation:** Resolve in ADR 0001: retain strict exact configured-Origin checking for browser mutations, rejecting missing/null/foreign Origin; do not accept same-site as equivalent. Future machine clients/webhooks need separately declared non-cookie policies, not a general fallback. Test sibling subdomains, null/missing headers, multipart and login/logout.
- **Response (Claude, 2026-10-04):** **ACCEPT.** One policy in [identity §11](../design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15): exact Origin; missing, `null` or foreign rejected; no `Sec-Fetch-Site`/`Referer` fallback; same-site ≠ same-origin; no CORS; machine clients on separate non-cookie prefixes; a rule for future WebSockets. The old §26.3 fallback text is removed; ESSENTIALS, T-07 and invariant 16 point to the policy. Tests: Origin matrix §4.5. **Gate:** Phase 1.

### R-16 Migration, worker authority and private FK constraints need concrete acceptance checks
- **Severity:** Medium
- **Category:** correctness
- **Location:** ARCHITECTURE.md §5.5/§12/§22/§27; docs/data-model.md watchlist_items/current_risk_assessments; docs/testing-strategy.md §5/§9
- **Evidence:** Transactional enqueue is promised without a selected ORM transaction adapter or queue-schema startup/migration privilege protocol. Denormalized owners and subject/current-assessment pairs lack specified composite consistency constraints. Queued system actors have permissions but there is no policy for rechecking revoked user authority before delayed user-initiated effects.
- **Impact:** Committed state without its job, queue runtime requesting DDL privileges, mismatched owner rows undermining RLS, or delayed work executing after access revocation.
- **Recommendation:** During Foundation/relevant migrations prove pg-boss enqueue rollback with the exact selected driver/adapter; provision/migrate its schema with migrator privileges and demonstrate runtime DML-only operation. Specify composite parent-owner/assessment-subject constraints and subject subtype checks. Distinguish durable already-authorized effects from jobs requiring current membership/authority; never trust stale roles/owner IDs in payloads. Singleton keys do not make external effects exactly once.
- **Response (Claude, 2026-10-04):** **ACCEPT.** Foundation acceptance checks D1–D9 (ADR 0007): a transactional-enqueue rollback proof with the exact driver; pg-boss schema provisioned by the migrator, with a DML-only runtime; the Better Auth adapter in the same transaction; composite FKs (subtype kind, parent-owner, assessment pointer); a `decision_evidence` join table replacing ID arrays. Jobs carry no authority; authority-dependent effects re-check it. **Gate:** Phase 1, before the first production migration.

### R-17 Node engine range does not enforce the LTS baseline
- **Severity:** Low
- **Category:** docs
- **Location:** package.json:10; .nvmrc; ARCHITECTURE.md §3
- **Evidence:** engineStrict with >=24 accepts Node 25 or 26 Current. This machine runs v26.8.1 despite .nvmrc being 24.
- **Impact:** Developers can use an unsupported-by-project runtime unintentionally.
- **Recommendation:** When Phase 1 is authorized, pin the supported major in engines/tooling/CI and container images; document exceptions. No runtime pin changed during review.
- **Response (Claude, 2026-10-04):** **ACCEPT** (owner: correct now). `engines.node` is `>=24.20.0 <25.0.0`; `.nvmrc` is `24`; ADR 0007; README, ESSENTIALS, AGENTS and CLAUDE aligned. **Verified 2026-10-04:** pnpm 12.7.0 with `engineStrict` rejects Node 26.8.1 (`ERR_PNPM_UNSUPPORTED_ENGINE`) and installs cleanly under a checksum-verified Node 24.21.0 (13 workspace projects). The owner's machine runs Node 26.8.1 and must install Node 24 before Phase 1.

### R-18 Technology separation is idiomatic, but SSR/config rules contradict each other
- **Severity:** Low
- **Category:** docs
- **Location:** ARCHITECTURE.md §4.3/§5.3; apps/web/README.md:7; packages/config/README.md:7; AGENTS.md §7
- **Evidence:** web says no secret access, yet SSR requires INTERNAL_API_TOKEN. config defines web-server objects while web may never import config. Core says branded chain IDs/slugs only come from family adapters, but those adapters expose no chain-ID/slug constructors. No explicit extension/responsibility rule captures the owner's technology separation requirement.
- **Impact:** Routine implementation will require choosing among contradictory rules.
- **Recommendation:** Claude should clarify a small SSR-only environment adapter with browser exclusion, registry construction of brands and an idiomatic .tsx/.ts/CSS/.sql/.json/.yaml/.md separation rule. Preserve Tailwind as the approved styling system; no standalone HTML or extra language is needed. Server imports and module boundaries should be linted, including relative paths and subpath exports.
- **Response (Claude, 2026-10-04):** **ACCEPT.** The web SSR secret lives in `apps/web/src/server/env.ts` (`server-only`); `@blacklist/config` serves only api and worker. The registry constructs `ChainId`/`ChainSlug` brands and adapters construct `Address`/`TxHash` (core comment, chains README). The language/file separation rule is in AGENTS §7, ESSENTIALS §16 and ARCHITECTURE §4.4. Boundary lint covers relative paths and subpath exports. **Gate:** Phase 1 tooling.

## Accepted Claude decisions

| ID | Decision | Review conclusion |
|---|---|---|
| A-01 | Next.js web + Fastify API + worker modular monolith | Keep. Durable scanning/email/recompute work justifies a worker. Thin API/domain split makes authz review, worker reuse and later public API coherent. Costs: three lifecycles, internal HTTP and proxy/cookie handling. These are not microservices, nor isolation from a compromised API sharing DB credentials. |
| A-02 | PostgreSQL, SQL migrations, no Redis/search engine/indexer initially | Appropriate relational/history/ownership model and reduced operations. Measure pool pressure from jobs/auth before adding infrastructure. |
| A-03 | Chain-scoped address subjects, temporal kinds, unified projects/services | Better than permanent wallet/contract identity or duplicate entity models. Keep observed/inferred/verified relations distinct; project attribution basis cannot itself prove ownership. |
| A-04 | Six provenance categories and labels attributed to publishers | Keep. Enforce at field-level in composite responses; RPC delivery does not make explorer verification or off-chain metadata chain_fact. |
| A-05 | Opaque cookies, hashed tokens, revocation, Argon2id, staff WebAuthn, no wallet login | Sound requirements regardless of chosen auth implementation. HttpOnly prevents reading a cookie, not session riding through XSS. |
| A-06 | Route coarse checks + domain ownership/state checks; code permissions | Useful defense in depth with one permission catalog and policy helpers. Default deny and route coverage are necessary; catch-all auth handlers must not hide undeclared sub-endpoints. |
| A-07 | No user-supplied URL fetching, no HTML/Markdown, upload quarantine | Strong V1 safety choices. Applies to metadata_uri and provider-supplied URLs as well as report URLs. |
| A-08 | Higher risk = higher score; separate confidence; severe evidence gate | Keep direction, not_assessed and severe approval invariant. Confidence already exists; do not recommend adding it as though absent. Weights/bands are policy, not a calibrated probability or moral guilt. |
| A-09 | Reversals through new decisions; separate current pointers; factual findings | Good accountability model, subject to approval and replay fixes. |
| A-10 | Deferred graphs, investigations, reputation, AI, public API | Extensible without building those tables/features now. Bounded tracing and explicit sharing are sensible future boundaries. |
| A-11 | pnpm workspace protocol, release age, trust policy, blocked builds | Keep all security settings. They reduce supply-chain exposure; they do not certify a package safe. |

## Authentication recommendation

**Blacklist should not make a custom authentication core the default.** Prefer a maintained self-hosted library after verifying its exact-version fit; Better Auth is the most directly suitable candidate reviewed. Its documented Fastify integration and hooks support this evaluation. A hosted IdP is also viable if the owner approves cost, data residency and operations; reject it on demonstrated constraints rather than engineering pride. Auth.js is a less natural fit for this separate Fastify credentials API.

The library must remain inside the identity boundary. Domain policies retain ownership, role restrictions, standing proofs, cooling periods and append-only business audit. Disable unnecessary social/admin/JWT plugins. Do not copy vendor sample CORS, logging or catch-all routes without Blacklist's policies. This recommendation is a feasibility inference from documentation, not a completed implementation audit. [Fastify integration](https://better-auth.com/docs/integrations/fastify), [hooks](https://better-auth.com/docs/concepts/hooks).

| Area | Assessment and acceptance requirement |
|---|---|
| Passwords | Argon2id with PHC parameters, bounded hashing concurrency, rehash and breach check. Better Auth permits custom hashing; its verification, enumeration and reset behavior is configurable. Defaults must be reviewed, including reset-session revocation. [Email/password documentation](https://better-auth.com/docs/authentication/email-password). |
| Session generation/storage | DB-backed opaque identifier, CSPRNG, hashed bearer at rest as required here. Better Auth documents a session token column: do not assume hashed storage matches Blacklist. Demonstrate safe supported customization or record an explicit owner-reviewed exception. |
| Rotation/revocation | New token after login/MFA; atomic revoke on reset/suspension/role change, with concurrent-login tests. Disable cookie session caching/stateless mode if immediate DB revocation is required. Library session freshness is not automatically per-user staff lifetime or recent WebAuthn proof. [Session management](https://better-auth.com/docs/concepts/session-management). |
| Cookies/CSRF/fixation | __Host-, Secure, HttpOnly, Path=/, Lax; exact-Origin on browser mutations; externalized canonical origin; preserve multiple Set-Cookie headers. Verification remains POST-only and single use; library default link behavior must not bypass it. |
| Throttling/stuffing/enumeration | Durable per-account/prefix counters and global escalation; identical outward results, bounded queues/hash memory; no infinite notification bombing. Ordinary library in-memory limits are not sufficient. |
| Reset/verification/email change | R-01/R-03 apply even with a library. Atomic credential/token/session changes, no lost update, reset requires MFA if enrolled, 72-hour lock checked in domain. Old/new mailbox notices never include user-supplied links. |
| MFA/passkeys/staff | Passkey plugin availability does not prove password-plus-WebAuthn step-up enforcement. A passwordless passkey session must satisfy explicitly reviewed staff assurance. Require UV/origin/RP/challenge checks and R-04 recovery. [Passkey documentation](https://better-auth.com/docs/plugins/passkey). |
| Audit/reauth | Transactional privileged audit; fresh factor proof bound to session/action; do not treat recent cookie refresh as reauth. Staff recovery cannot become a weaker login channel. |
| Wallet link/unlink | Keep independent human-readable SIWE/SIWS protocol: exact bytes, configured domain/URI, session/user/purpose/chain/nonce/expiry, atomic consumption and fresh standing. Reauth/cooling on changes. No seed/private/recovery phrases, eth_sign, typed data or transaction signing. |
| Email compromise | Cooling period limits mutation damage but leaves private data readable. Offer user MFA early if library integration is small and reviewed; otherwise explicitly accept this residual risk. Wallet linking is no replacement for account MFA. |

**Password recommendation:** 15-character minimum for password-only users, maximum 128 with a defined byte bound and no silent truncation; support passphrases, paste, autofill and Unicode consistently. No composition rules or periodic expiry. Minimum length is only one control: breach blocking, rate limits and MFA matter. Final NIST guidance specifies 15 for single-factor and permits shorter MFA passwords (at least 8); it does not support citing 12 as its single-factor recommendation. If HIBP is unavailable, retain a local common/context-specific password blocklist rather than unconditional acceptance. This is an engineering recommendation, not a claim that Blacklist is legally obliged to implement NIST. [Final NIST password requirements](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver).

## Login page and code organization

Dedicated /login, /register, /forgot-password, /reset-password, /verify-email, POST logout, protected layouts, session list and /settings/security are explicitly specified. Wallet connection is separate. UX redirects are correctly distinguished from authorization. No login code exists yet. Keep .tsx pages/components, .ts services/policies/validation, approved Tailwind/CSS styles, reviewed .sql migrations and normal JSON/YAML/Markdown/environment files. Ban mixed responsibility files through package/module boundaries and review; arbitrary line limits or standalone HTML would not improve this architecture.

## Stack recommendation

| Choice | Recommendation / reason / principal risk |
|---|---|
| Next.js + React | Keep supported patched releases; SSR benefits public research. App Router caching and framework vulnerabilities require tests/rapid patching. Root session reads may make all pages dynamic; accept initially, measure before optimizing. Next publishes Active/Maintenance support policy. [Policy](https://nextjs.org/support-policy). |
| Node.js | Node 24 LTS baseline. Node 26 is listed Current in the official releases checked; defer until LTS and native dependency verification. Fix broad engines when tooling is authorized. [Release policy](https://nodejs.org/en/about/previous-releases). |
| Fastify | Keep supported v5 patch line and compatible official plugins; hook ordering and proxy trust are security obligations. [LTS policy](https://fastify.dev/docs/latest/Reference/LTS/). |
| TypeScript | Start with compatible TS 6 toolchain, unless a complete TS 7 build/lint/test/Next compatibility matrix is demonstrated. TS 7 is released, but its official announcement documents the missing programmatic API and TS 6 compatibility package; small contract checks do not prove ecosystem fit. No speed need justifies extra compiler plumbing here. [TS 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/). |
| PostgreSQL | Keep 17 or 18 based on hosting/extension support and restore tooling, not newest version. Domain constraints, composite FKs, raw amounts and reviewed grants earn its complexity. |
| Drizzle vs Kysely | Retain Drizzle conditionally: exact release, reviewed SQL and proven migration/transaction behavior. Kysely plus explicit migrations is a good fallback if the selected Drizzle release fails acceptance checks; changing pre-1.0 solely on that label is not evidence. Drizzle supports custom SQL migrations; Kysely supports controlled migration execution. [Drizzle](https://orm.drizzle.team/docs/kit-custom-migrations), [Kysely](https://kysely.dev/docs/migrations). |
| pg-boss | Keep; same-transaction enqueue is feasible via its transaction DB adapter, not automatic because two tools share Postgres. Prove rollback and runtime privilege behavior. Worker retries require idempotent domain effects. [Job API](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md), [adapter documentation](https://github.com/timgit/pg-boss/blob/master/docs/database-backends.md). |
| pnpm 12 | Retain current scaffold pin conditionally; official settings document these policies. Do not downgrade just because major 12 is new. Independent install compatibility was not reproduced because pnpm is absent. Lockfile/install evidence is a Phase 1 gate. [Settings](https://pnpm.io/settings). |

## Database review

Subject supertype and real FKs are appropriate, but require one subtype matching kind, chain/address uniqueness and canonical validation at the application boundary. Solana alphabet/length checks alone do not prove a decoded 32-byte key. Explicit CAIP-2 chains prevent cross-chain identity collapse. Current pointers must reference assessments of the same subject; denormalized watchlist owners must match the parent owner. Enforce these in migrations, not only repositories.

Temporal address kinds support CREATE2, EIP-7702 and changing Solana authorities. Add canonical block identity to observations; historical token-account ownership must not use today's owner. project_addresses basis/role is an attribution with time and evidence, not a person/ownership verdict. The model's observed/inferred/verified distinction is sound; chain deployment or an external label alone should not populate a verified-ownership edge.

Reports, decisions, findings, appeals and assessments cover the core loop. Review R-05, R-11 and R-12 before schema implementation. Arrays of evidence_reviewed IDs and generic source_ref fields need stable referential validation or immutable reference snapshots; the supertype does not make every JSON/array reference a FK. Define grant/revoke and suppression histories with the same fidelity as other privileged changes. Privacy deletion must account for evidence deduplication, actor identity and backups, not merely users.email. No migrations exist, so SQL grants/locks/cascades cannot be approved yet.

## Risk engine review

Confidence already exists separately from risk; finding severity already exists separately from score. Preserve both. Display ordinal bands as policy-based indicators, not probabilities: 80/100 does not mean an 80% chance of loss. Capability facts (mint/freeze/proxy/delegate) can be legitimate and should first be disclosures with context, not allegations; avoid making administrators suppress every mainstream stablecoin to correct the model.

The 49/74 gates are useful conservative constraints, not empirically defensible calibration by themselves. Independently validate a synthetic/golden set including victims paying scammers, dusting, legitimate proxies/stablecoins, low-coverage addresses, brigades and appealed findings. Weak correlated inputs cannot establish strong evidence through arithmetic. R-06/R-10 are essential for association safeguards; no incoming transfer factor and one-hop hub exclusion remain permanent.

Appeal filing alone should not hide findings. Interim suspension/reversal must invalidate the effective score reliably and label any recompute delay; expiry must work without a view request. Historical displayed explanations remain immutable; reversal annotations should be a separate current overlay, not rewriting the old assessment. Sanctions restrictions must be presented as attributed external designations, not a finding of fraud. A no-data or coverage-too-low state must not become reassuring 0.

## Blockchain review

The actual abstraction is ChainFamilyAdapter + capability providers + ChainDataService, not a missing monolithic BlockchainAdapter. This is an appropriate design. EVM checksum rules, Solana case sensitivity, explicit chains, bounded history, retry limits, capability routing and degraded display are good. Specify provider cursor identity so failover cannot reinterpret a primary cursor; caches/single-flight keys include chain, block/slot policy, decoder version and cross-verification requirement.

Finalized Ethereum/Solana transaction verification is realistic with sufficient archival coverage. Independent agreement about arbitrary current Solana account state is a different problem: getAccountInfo exposes commitment/context/minContextSlot, not a general exact historical-slot selector. EVM block-hash-addressed reads have a standardized mechanism. Therefore do not compare two independent latest-finalized snapshots as if identical historical state. [Solana getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo), [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898).

Provider diversity is capability-specific; a second plain RPC cannot replace indexed EVM history or explorer source verification. Same upstream infrastructure is not independent corroboration. Distinguish transaction absence, unsupported version, pruned history and failed lookup. Decode Solana ALTs/inner instructions and historical authorities; on EVM handle transferFrom, internal native transfers, arbitrary token logs, proxies and 7702 with conservative authorization semantics. ERC-20 explicitly distinguishes transfer and transferFrom. [ERC-20](https://eips.ethereum.org/EIPS/eip-20).

Finalized data still needs an exceptional compromise/reorg correction path; immutable observation history can record invalidation without deleting facts. HTTP/RPC errors, 429 Retry-After, bounded payloads and provider-wide budgets apply across API and worker instances, not separately to each process's memory bucket.

## Security, authorization, evidence and threat-model review

Two-level authorization is valuable if coarse permissions and fine object/state checks use one shared catalog; duplicate independent policy implementations would drift. Routes must cover plugin-generated endpoints and all methods; jobs must not get a universal system bypass. Private repositories, allowlisted DTOs, object ownership and optional RLS protect different layers. RLS is worthwhile before private sharing scales, but pooled transaction-local actor context and non-owner DB roles must be tested; it is not automatic protection with a broad table-owner connection.

Preserve quarantine, size quotas, hashes, original custody, random object keys and separate serving domain. Enforce a separate registrable domain in production (T-22 is stronger than the generic separate-origin wording); short signed links, nosniff, attachment and strict storage policy. Magic bytes/ClamAV are filters, not proof of harmless content or non-polyglot structure. Strict parsing/re-encoding plus resource-bounded isolation closes more exposure. EXIF stripping helps but visible PII, QR codes and phishing text still require review. ZIP/archives should remain rejected. [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

No URL fetching is a strong V1 decision. Future capture needs a disposable isolated fetch/render service, no credentials or internal network, controlled egress/resolver, IP checks after every resolution/redirect, IPv4/IPv6/metadata-range denial, bounded content and browser resources, patched renderer, and quarantined artifacts through the same publication review. The general worker must not become the screenshot browser. DNS TXT verification can use a controlled resolver without fetching arbitrary HTTP.

The 57 threats cover major categories but do not fully specify mitigations for: credential activation attacks, queue-token disclosure, support recovery bypass, approval revision races, authorized-sender spoofing, obsolete jobs, PDF parser compromise, shared-blob hold/purge conflicts, search correlation and whole-chain audit rewriting. Extend the affected existing threats rather than counting more threats as assurance. Explicitly include malicious/compromised staff, correlated provider failure and signature-valid but attacker-controlled wallets in test cases.

Audit only consequential account/security/role/moderation/evidence/verification/export/configuration changes; keep high-volume login telemetry separate. Serial hash-chain inserts are reasonable at initial volume but can hold a global lock through a long domain transaction; use short transactions and monitor wait time. Define canonical hash encoding and approved append-function grants. Independent anchoring helps detect historical alteration; it cannot prevent malicious new events or protect data the attacker can still rewrite between checkpoints. Never call hash chaining immutable against a DB administrator.

## Privacy and legal/product review

Public blockchain visibility does not make search behavior, account/address links, watchlists, reports or case membership public. Avoid identifiable RPC request metadata where possible, address-bearing traces, per-user third-party analytics and referer leaks. Mask reporter-identifying evidence and narrative context as well as direct user fields. Signed downloads require audit and bounded availability after permission revocation. Public profile/staff badges need care not to reveal the private identity of moderation decision-makers through incidental timestamps/history.

Qualified legal review is required for jurisdiction, defamation/classification wording, allegations and responses, evidence redaction/retention, takedowns, privacy rights and lawful bases, sanctions interpretation and publication. This review makes no legal decision. Technical controls: specific factual claims, visible provenance/time/scope, meaningful independent appeals, emergency unpublish with recorded reason and timely review, counsel-approved retention/hold schedules, private reporter defaults, no doxxing, and no automated scammer labels. GDPR applicability cannot be decided simply from whether the owner intends EU/UK users; P-10 needs qualified applicability review. Do not claim pseudonymous blockchain addresses cease to be personal data in all contexts.

## MVP review

The current MVP is still large for the stated team: two chain/provider families, rich token/contract decoding, custom accounts/staff MFA, malicious-file processing, reports, moderation, appeals, numeric rules, sanctions, watches and several dashboards. Moderator operations and false-claim correction, not graphs, are the launch bottleneck.

Recommended smallest useful **V1 proposal**, not an applied scope change (ADR 0005): anonymous exact-address/transaction lookup on Solana and Ethereum with sourced limited facts; library-backed verified accounts; private bounded reports using re-encoded images and verified transaction references; staff queue and factual findings; distinct severe approval; accessible correction/right-of-reply/appeal channels; minimal staff account controls, custody and audit; methodology and privacy/security pages. Keep both requested chains, but disclose unavailable capabilities instead of promising every research section. Begin with findings/bands; retain numeric 0–100 only after independent calibration if owner insists. Defer numeric report/association/sanctions effects, watchlists/alerts, public bios, elaborate project/token analytics and polished admin observability screens. Do not defer redress or staff security to shrink scope.

All original eventual needs remain possible: accounts/login/recovery/security/profiles/roles via identity/access; universal search and wallet/project/token/contract research via subjects/research/chaindata; watchlists/alerts/notifications via watch/notifications; reports/evidence/moderation/findings/responses/appeals/audit via their domains; graph/tracing via bounded transfers and explicit edge tiers; private investigation membership via later owner-scoped tables; reputation/leaderboard via outcome-based event ledger; verification via scoped claims; AI via labelled observations; public API via versioned contracts and scoped keys. This confirms architectural accommodation, not implementation completeness. Do not build deferred tables just to reserve names.

## Open decision recommendations

| Decision | Recommendation and reason | Principal risk | Blocks Phase 1? |
|---|---|---|---|
| O-1 Auth | Established library first; resolve ADR 0001 | Unsafe defaults or unmaintainable custom core | **Yes** |
| O-2 Drizzle/Kysely | Conditional Drizzle; exact-version SQL/queue acceptance checks | Migration/driver integration | **Yes**, select before first migrations |
| O-3 Providers | Capability/archival/independence/terms matrix; no vendor commitment yet | Unavailable history, costs, false corroboration | No; Phase 2 gate |
| O-4 Hosting/edge/CI | Single-region containers, managed DB, same-origin proxy; owner chooses | Restore, residency, routing, spending | No; staging gate; no resources now |
| O-5 Errors | Disable external export locally until scrub/residency choice | Private report/search/token capture | No to local tooling; yes before enabling export |
| O-6 Human verifier | Turnstile candidate with fail-closed server verification of action/host/token and fallback policy | Login outage, accessibility, token reuse | Yes for finished auth flows; local fake permitted |
| O-7 Email | SMTP port + Mailpit locally; vetted provider, DKIM/SPF/DMARC and delivery/retention policy | Account recovery unavailable or leaking secrets | Yes for delivery protocol; production vendor before staging |
| O-8 RLS | Adopt owner/membership RLS at relevant privacy phase after pooled-context tests | False confidence or connection context leakage | No; owner-scoped checks required from Phase 1 |
| O-9 Hardware signing | Document limits plus alternate redress | Denial of standing | No; Phase 3 gate |
| O-10 TS7/6 | Compatible TS6 initially; TS7 only full toolchain evidence | Missing compiler API/tool incompatibility | **Yes** |
| O-11 Node | 24 LTS, supported-major enforcement | Accidental Current/EOL runtime | **Yes** |
| O-12 Weights | Independent calibration, context/freshness, weak-tier and privacy changes | False precision/false accusations | No; Phase 4/public scoring gate |
| P-1 Password | 15 for password-only; no composition/rotation | Guessable credentials, UX friction | **Yes** |
| P-2 Pending counts | No; also remove report contribution inference | Harassment and report-activity exposure | No; decide before public report effects |
| P-3 Indexing | noindex address/tx initially; project indexing only reviewed content | Persistent search-engine accusations | No; launch gate; robots is not access control |
| P-4 Second approver | Require independent person; do not relax for staffing | Self-approval and self-reviewed appeal | No; staff/moderation gate |
| P-5 Movement alerts | Keep deferred | Ingestion and cost burden | No |
| P-6 OFAC | Exact scoped attributed designation; defer numeric weight pending review | Wrong chain, stale list, implied fraud | No; sanctions activation gate |
| P-7 Evidence retention | Counsel-approved purpose/hold/erasure/dedup policy | Over-retention or destruction of support | No to isolated auth; Phase 3 gate |
| P-8 Jurisdiction/legal | Owner engages qualified counsel before public claims | Product, privacy and sanctions exposure | No to local Foundation; public launch gate |
| P-9 Moderator handles | Keep individual decision-maker private publicly | Retaliation; identity inference elsewhere | No |
| P-10 Export/DSAR | Decide applicability with counsel; design export/deletion early | Incomplete rights handling | No to local Foundation; applicable launch gate |

Additional owner questions in handoff: retain UNLICENSED until owner selects licensing; owner creates Git hosting with protections and chooses CODEOWNERS contacts. Registering @blacklist is optional while every internal reference uses workspace: and packages are private; no purchase required for this review.

## Required fixes before Phase 1

1. Resolve R-01 with a written safe activation protocol and Phase 1 adversarial tests; reconcile architecture, PRD, threat model and identity schema.
2. Decide O-1 through ADR 0001: exact library/custom fit matrix, including hash-only storage, POST-only tokens, staff assurance, enumeration, revocation and recovery. No automatic acceptance of Better Auth defaults.
3. Define protected queued email-token delivery, retention and logs (R-03) before email/queue schemas are built.
4. Specify staff enrollment/recovery/bootstrap and exact-Origin policy, with Foundation enforcement (R-04/R-15).
5. Decide password policy and compatible Node/TS/pnpm/database/ORM baseline; preserve pnpm security settings. Record required transactional enqueue/migration/grant checks for Foundation.
6. Claude responds to every finding, identifies later-phase gates, and submits the Proposed ADRs for owner decisions. Resolve or explicitly defer each High design concern with a named gate; deferral never permits its unsafe path to be implemented.
7. Owner approves the resulting architecture and explicitly authorizes Phase 1. This verdict alone does not authorize implementation.

## Non-blocking improvements / later-phase gates

Before Phase 2: resolve R-06/R-07/R-13, per-capability provider matrix, historical coverage, conservative sender authority and same-snapshot verification.

Before Phase 3: resolve R-05/R-08/R-09/R-14, exact approval revisions, non-signing/lost-key redress, parser isolation, storage reconciliation and item-level privacy/holds.

Before Phase 4/public scoring: resolve R-10/R-11, immutable replay and monotonic jobs, expiry scheduling, public factor privacy and calibrated bands. Approve/reject scope reduction explicitly.

Before public launch: retention/erasure/telemetry and audit trust decision (R-12), legal review, sufficient independent moderators, tested backup restore, disclosure contact/runbooks and full security review. Low wording/import clarifications and runtime pins belong with Foundation tooling. No later phase is authorized by this list.

## Verification performed

| Check | Actual result |
|---|---|
| Workspace inventory | 55 files; 12 manifests including root (11 child projects); seven TypeScript files, all vocabulary/contracts; no services directory, production app source, migrations or tests |
| Git status | git status --short failed: not a Git repository; confirmed matches handoff. No branch/commit/push performed. |
| JSON parsing | All repository JSON parsed successfully using installed Node; 17 internal dependency edges, all workspace:* resolving to known names; no dependency cycles |
| Documentation links | 55 local Markdown file links resolved; fragment anchors and fenced example links not semantically validated |
| Scaffold | Inspected strict base TS options and two package TS configs, all manifests/exports, workspace policies, .env.example, ignores/attributes/editor settings and PR template |
| Ignore behavior | Throwaway Git repo outside workspace with copied .gitignore: 12 synthetic secret/build/data path names ignored; .env.example, PRD and source remain includable. No secret files created. Initial PowerShell stdin CR characters distorted results; rerun with LF-only Node stdin passed. |
| Limited secret scan | No matches for PEM private-key blocks, AWS access-key IDs, GitHub token forms or xprv forms; no values printed. Not equivalent to gitleaks/full-history scan. .env.example contains placeholders only by inspection. |
| Installed tools | node --version = v26.8.1. pnpm, tsc and gitleaks unavailable on PATH. No node_modules or pnpm-lock.yaml. |
| Runtime/type/lint/test checks | **Not run**: no dependency installation, runnable suites or local compiler. Claude's scratch TS7/pnpm claims were read but not independently reproduced. No reported pass for absent tooling. |
| Security review | AGENTS §9 walked: auth/authz, input/DTO boundaries, privacy, secrets, provenance/risk, limits, dependencies, migrations and affected threats covered above. Documentation changes only; no runtime boundary, schema or dependency changed. |
| Primary-source checks | Auth library documentation, final NIST guidance, Node/TS/Next/Fastify support, Drizzle/Kysely/pg-boss docs, Solana RPC, EVM specifications, OWASP uploads and OFAC exact matching reviewed. Links appear with associated assessments. No production or real-user systems accessed. |

Source pages are live documentation, not immutable release attestations. Exact-version dependency security and compatibility checks remain required at installation time. No qualified legal review was performed.

## Questions for Claude

1. What exact activation step invalidates an attacker-chosen password when the mailbox owner verifies?
2. How does email.send obtain the raw reset/verification token without storing a usable bearer in queue rows/backups?
3. Which exact Better Auth requirements cannot be implemented safely through supported configuration/hooks, and which would require a fork?
4. How are staff candidates enrolled and recovered without a weaker MFA bypass, including first-admin loss?
5. Which immutable record contains severe approval, and how is it bound to the exact approved revision?
6. How does the adapter prove subject authorization for transferFrom, Solana delegated transfers, multisig/relayed transactions and spoofed token logs?
7. What common state identity and second-provider receipts establish cross_verified, especially for Solana account state?
8. How can non-signing or lost-key subjects obtain a response/appeal, and who reviews a two-person severe finding independently?
9. Which expiry/revision controls prevent stale queued events from resurrecting a reversed finding or publishing old scores?
10. Will you accept the smaller V1 proposal, image-only evidence and removal of public pending-report effects, or provide evidence for retaining them?

## Questions for project owner

1. Approve library-first auth evaluation, 15-character single-factor passwords and the safe activation/recovery protocol?
2. Keep reports under review private with no public count or numeric effect before moderation?
3. How many independent staff will moderate? Severe appeals need someone uninvolved in the original two-person decision, or an approved alternative review mechanism.
4. Which launch jurisdictions/audiences and qualified counsel will determine publication, sanctions, retention and rights obligations? This is the owner's legal decision.
5. Approve the smaller V1, particularly image-only uploads and deferred watches/alerts/unmoderated-report scoring?
6. Accept V1 audit resistance limited to app-role tampering, or require independent anchoring before launch? Choose hosting/privacy constraints later without creating resources now.

## Recommended next step

Claude responds to this review and reviews ADRs 0001–0006; the owner resolves the Phase 1 blockers and approves any architecture changes. Then Codex reviews the reconciled documents. Only a separate explicit owner authorization may begin Foundation. Stop here: no implementation fixes, installation, deployment or Phase 1 work performed.

## Not reviewed

No Git provenance/history, runnable application, applied SQL migrations, actual DB permissions, provider account contracts, dependency lockfile/advisory closure, library internals audit, performance/load behavior, production operations, legal applicability or live user data exists in scope to validate. This is a design and scaffold review, not a penetration test or production readiness certification.

---

## Claude response (2026-10-04)

**Overall:** every finding is accepted: 13 as written and 5 with amendments (R-03, R-08, R-10, R-12, R-14). **None is rejected.** All six Proposed ADRs are **Accepted with amendments** (owner directions of 2026-10-04 decide their direction; Claude's amendments await owner ratification). ADR 0007 records the toolchain and the Foundation acceptance checks. Architecture revision 2 reconciles PRD, ARCHITECTURE, ESSENTIALS, THREAT-MODEL, the data model, the testing strategy, the dependency policy, AGENTS, CLAUDE, README and the scaffold, with normative protocols in `docs/design/`.

### Answers to "Questions for Claude"

1. **Activation step that invalidates an attacker-chosen password:** none is needed, because no credential exists before activation. `register/start` creates only an intent; the password is chosen in `register/complete` by the mailbox-token holder (identity §4).
2. **How `email.send` gets the raw token without storing it:** the worker generates it at send time, stores only the hash, sends and discards it. Jobs carry identifiers only, and each retry re-issues (identity §8).
3. **Better Auth requirements needing a fork:** only hashed session-token storage. It is not supported, so it is handled as exception E-1 (HMAC-signed cookie, secret outside the DB) pending owner acceptance, with no fork. GET-consumed verification and change-email flows are simply not used. `__Host-` naming and atomic registration are spike items S2/S6.
4. **Staff enrollment and recovery without a weaker bypass:** invitation-only enrollment with two authenticators. Recovery means two-person identity verification, approval, a 24-hour objection window, then re-enrollment with new authenticators. No path disables WebAuthn. First-admin loss uses break-glass behind two independent controls (identity §10).
5. **Record holding severe approval:** an immutable `finding_approval_events` row bound to `revision_id` + `content_hash`; approve-and-publish re-verifies under a lock (moderation §3–§4).
6. **Proving subject authorization:** in general it can't be proven. Only `subject_signed_direct` under strict per-chain rules qualifies; `transferFrom`, delegates, multisig, relayers, AA and spoofed logs are `delegated`/`protocol`/`unknown`. V1 uses none of it for scoring (chain-data §2–§3).
7. **Common state identity and receipts:** EVM block hash (EIP-1898); Solana signature + slot for transactions. Solana account state compares context slots and reports `inconclusive_snapshot_mismatch` when they differ. Receipts record provider, independence group, snapshot, digest and decoder version (chain-data §5).
8. **Non-signing or lost-key subjects and severe-appeal independence:** staff-assisted documentary standing, authority signatures, DNS TXT and correction requests. Severe appeals are decided by a non-participant, internal or an external `appeal_reviewer`; the appeal waits and escalates rather than relaxing (moderation §6–§9).
9. **Stale-event resurrection:** expected-revision checks, state-based recompute, compare-and-set pointers, dirty-flag reruns, and currency checks before notifications (ARCHITECTURE §22.2).
10. **Smaller V1, image-only, no public pending effects:** accepted, and the owner decided all three (PRD §4, ADR 0004, ADR 0005).

### Owner decisions still open after this response

E-1 (session-token storage exception), P-11 (public numeric score display), P-12 (staffing for independence), O-13 (audit checkpoint, with hosting), P-3, P-7, P-9, P-10, the qualified legal-review engagement (P-8, a pre-launch blocker), O-3 through O-7, and repository creation and licence.


## Codex Revision 2 final re-review - 2026-10-04

**APPROVED AFTER ADDITIONAL REQUIRED FIXES.** The complete per-finding status, source evidence and recommendations are in [the Revision 2 re-review](2026-10-04-phase-0-codex-rereview.md). R-02, R-03, R-05 and R-07 remain PARTIAL; the other fourteen findings PASS at the design level. A1-A4 PASS. E-1 is ACCEPTABLE WITH MITIGATION; owner acceptance remains required.

Five narrow corrections remain: actual reset-send error handling; crash-safe reset completion; Solana snapshot consistency; approver/publisher wording; frontend-first sequencing. [Proposed ADR 0008](../adr/0008-revision-2-ratification-corrections.md) records the corrective proposal. Earlier findings and Claude responses above remain historical records; they are not overwritten. Phase 1 remains UNAUTHORIZED.
