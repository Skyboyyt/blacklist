# AI_HANDOFF.md

Read this first at the start of every session, and update it at the end (AGENTS.md §11). Report results faithfully: if something was not run, say so.

This file holds the **current state only**. Each session adds one short entry under "Session log" and links to its evidence. The full history up to 2026-10-15 (Phases 0–8, every Claude and Codex session) is preserved unchanged in [docs/handoff-archive/AI_HANDOFF-to-2026-10-15.md](docs/handoff-archive/AI_HANDOFF-to-2026-10-15.md).

---

## Status

| Field | Value |
|---|---|
| Project | **Blacklist**: Web3 anti-scam, wallet intelligence, project verification and investigation platform |
| Canonical branch | `main` (PRs #8–#14 target it). `chore/initial-repository` is an older ancestor. The GitHub default branch and Vercel production branch should be switched or recorded by the owner (review CR-12/G-8) |
| Frontend | Phases 1–6 implemented on contracts and mocks and merged. **Phase 6 owner sign-off not recorded** |
| Phase 7 (Backend Foundation) | Authorized 2026-10-13, merged (PRs #8–#11). Acceptance gates D1–D9 and S1–S17 recorded as passing by Codex. **Exit not closed:** independent security review; ADR 0013 accepted 2026-10-16 and part C implemented on the open branch (P-13 still open) |
| Phase 8 (Chain Data & Research) | Authorized 2026-10-14, merged (PR #12) on explicit owner instruction despite disclosed blockers. **Research is off** (`RESEARCH_ENABLED=false`). ADR 0018 accepted provisionally 2026-10-16 (waiver recorded); O-3 open |
| Deployment | Free staging services are public on explicit owner instruction (2026-10-13): Vercel web, Render API and worker, Neon PostgreSQL 18 staging database. **Not production-ready**; Phase 11 gates (legal, retention, recovery, monitoring) remain |
| Authorized now | **Phase 9a** (owner, 2026-10-16): reports, moderation cases, finding revisions/approval/system publication, standing, responses, appeals, corrections on the existing Render/Neon. **Waiver:** Phase 9 work may merge before the Phase 7 independent security review. Phase 9b (image evidence, object storage, processor) waits for a hosting ADR. Also owner decisions of 2026-10-16 (ADR 0013 design, member password 12 / staff 8, invite-only sign-up, ADR 0018 provisional) and review follow-up fixes inside the approved design. **Not authorized:** Phase 9b cloud resources, Phase 10 or later, paid resources, cloud migrations, provider activation |
| Primary / reviewer | Claude / Codex |
| Last agent | Claude: Phase 9a slices 1–4 merged (PR #17); 0006 and 0007 applied to Neon staging by the owner and verified; Render deploy pending |
| Last updated | 2026-10-16 |

## Open work, by owner

**Owner decisions and actions**
1. **Neon migrated (verified 2026-10-16):** `blacklist_staging` has 0006 (19:31 UTC) and 0007 (19:38 UTC): ledger 14 rows `ok`, 60 tables. 0006 was **not** on this database before then, despite the earlier report. PR #17 merged (`ecc50ae`). Next: deploy the Render API and worker from `main`; confirm a fresh sign-up receives its email and needs 12 characters; the admin recovery screens should now load.
2. **P-13:** name the recovery operator and decide whether a second person approves operator actions. Until then sole-admin recovery is break-glass only.
3. ADRs 0014, 0015 and 0017: Claude's amendments still await decisions. Record the Phase 6 sign-off, Phase 7 closure, and waivers for going live (review CR-11).
4. Run the two-network lockout test (decision brief §3) and report the result.
5. ADR 0017 wake design: the public worker health check can burn free quotas (CR-04).
6. A human verifier (O-6): without one, five failures on one email lock that account for 15 minutes.
7. Pagination model; correction and response status sets; `staff:recovery:verify` in ARCHITECTURE §9.2; `research_cache` (data-model or ADR).
8. Canonical branch (above); CI workflow (none exists).

**Codex**
1. An independent security review of Phase 7 and of PR #14 (CR-11). R-04 is the priority.
2. CR-07 for Solana: raw instruction encoding for the instruction digest.
3. CR-14 D-3 to D-5: grants in migrations, enum CHECKs, migration-safety style.

**Claude**
1. CR-05: a real bundled common-password list, pending an owner-approved source.
2. Responses still pending in earlier review files (see review CR-11).

## Session log

### 2026-10-16: Claude, PR #17 merged and Neon migrated

- PR #17 merged on the owner's instruction (`ecc50ae`).
- Owner checks on `blacklist_staging` showed 11 entries and 34 tables, so 0006 had not been applied there. The owner applied 0006, then 0007, with a backup branch taken first. Verified: 14 ledger rows `ok` with matching checksums and 60 tables.
- Runbook status lines corrected. Next: Render deploy, then slice 5 (web live adapters).

### 2026-10-16: Claude, Phase 9a slice 4 (standing, appeals, responses)

- Domain `packages/domain/src/moderation/standing.ts` and `redress.ts`, routes `apps/api/src/routes/redress.ts`. Standing challenges are built by the server (SIWE/SIWS-format text, 10 minutes, bound to member, session, purpose and target, single use). EVM (EIP-191, viem) and Solana (Ed25519, node:crypto) verification is in `packages/chains/src/signatures.ts`; no new dependency.
- Documentary standing is decided by a non-participant standing reviewer, and a reply after a denial reopens it.
- Appeals: `uphold`, `amend` (a new revision that still needs approval) and `reverse`. Deciding is bound to the appealed revision; a stale appeal gets `conflict`.
- Responses are published as plain text with their standing mechanism and date.
- Public address research shows `under_appeal`, published responses, and appeal and response timeline events.
- Two interim rules for the owner: a standing reviewer decides without taking the case, and upholding an appeal does not make the reviewer a participant (plan interim decisions 6–7).
- Deferred, with reasons in the plan: authority signatures (`temporarily_unavailable`); DNS standing and finding corrections (Phase 10, with projects); 14-day escalation and outcome notices (notifications table).
- 0007 regenerated before any apply (adds `subject_responses.submitter_reason`), checksum `04d79a17…`. Runbook re-rehearsed on disposable PostgreSQL 18: all checks pass.
- Tests: `moderation-redress.integration.test.ts` (4 tests: replay across nonce, session, member, purpose and target; edited text; wrong key; expiry; appeal reviewer independence; lost-key journey; amendment; stale appeal; responses) and HTTP guards for the new routes in `moderation-reports.integration.test.ts`. One behaviour change in a test: `publicFindings` now also returns `subjectId`.

### 2026-10-16: Claude, Phase 9a slice 3 (findings)

- `packages/domain/src/moderation/findings.ts`, routes `apps/api/src/routes/findings.ts`: report acceptance authors revision 1; canonical content hashes; approve-and-publish in one locked transaction with §4.1 independence (self-approval only for non-severe; severe needs a non-author with `finding:approve_severe`; replacing a public severe revision also excludes its author and approver); rejection; new revisions of published findings (base hash, unchanged content refused); legal hold recorded as a blocked approval; emergency suspension with a `suspension_review` case (non-participant review; the severe suspender cannot reverse alone; severe suspension notifies admins); public findings and timeline on address research.
- Changed tests (behaviour changed): research availability for findings is now `available`; `accept_report` now needs a step-up instead of being refused.
- **Limits:** no risk signals or assessments (Phase 10); public findings show only where research is enabled; no conflict-declaration UI yet (the `staff_conflicts` check runs).

### 2026-10-16: Claude, Phase 9a slice 2 (reports and cases backend)

- Domain `packages/domain/src/moderation/` (subjects, reports, cases, labels, refs) and routes `apps/api/src/routes/moderation.ts`: member submit/list/detail/withdraw/respond/notices; staff queue, case detail, assignment, notes, decisions (`start_review`, `request_info`, `reject_report`, `reject_abusive` with step-up). `accept_report` waits for slice 3.
- 0007 regenerated before any apply: adds `moderation_case_messages` (append-only) and `reports.submitter_reason` (20 tables, 56 total). Apply script now generated by `scripts/build-neon-apply.mjs`; rehearsal repeated.
- New domain error codes `invalid_transition`, `not_eligible`, `stepup_required`, `evidence_unavailable`, with fixed `detail` and `currentVersion` in problem+json.
- Live web adapters are not wired yet (slice 5); the web app still uses mocks for these screens.

### 2026-10-16: Claude, Phase 9a slice 1 (data model and permission catalog)

- Plan: [docs/phase9a-plan.md](docs/phase9a-plan.md) (five slices; interim decisions on response/correction statuses, standing proof contract, projects, member notices, error codes).
- Migrations `generated/0007_smiling_quentin_quire.sql` + `0007_moderation_guards.sql`: 20 tables, append-only triggers, publication guard (14 ledger entries, 56 tables). **Not applied to Neon**: [runbook](docs/operations/2026-10-16-apply-0007-phase9a.md), rehearsed on disposable PostgreSQL 18.
- **Bug found and fixed:** a CHECK of the form `x = 'a' OR char_length(y) BETWEEN …` passes when `y` is NULL. The 0006 recovery objection reason CHECK had this flaw (the domain always required a reason); 0007 replaces it.
- Permission catalog extended per ARCHITECTURE §9.2: member, moderator, appeal_reviewer (queue limited to appeals by the domain), admin. Member permissions are member-account only.
- Staging operator checks expect 56 tables and no UPDATE/DELETE on the history tables.

### 2026-10-16: Claude, public registration (owner decision)

- **Merged** as PR #16 (`3558cc2`). **Deployed by the owner (2026-10-16):** Render API and worker on `main`, Vercel redeployed, `REGISTRATION_MODE` open on both services (owner-reported). Claude has no access to Render, Vercel or Neon and has not observed the live result.

- Owner: "allow everyone to register without any needing approval, make it public registration". ADR 0019 superseded, with a recorded risk acceptance for review CR-10 (real-user data in staging).
- `REGISTRATION_MODE` now defaults to `open` everywhere; the blueprint sets `open`; the invite gate is opt-in. Sign-up copy no longer mentions invitations. Identity §4.3, ESSENTIALS, ARCHITECTURE, THREAT-MODEL T-01 and AGENTS §1 updated.

### 2026-10-16: Claude, owner decisions implemented (ADRs 0013, 0016, 0018, 0019)

- **Recorded:** ADR 0013 accepted with Claude's design (P-13 open); ADR 0016 amended to staff 8 / members 12; ADR 0018 accepted provisionally with an early-merge waiver; new ADR 0019 (invite-only member registration). Index and [decision brief](docs/reviews/2026-10-15-adr-0013-0018-decision-brief.md) §5 updated.
- **Password split:** members need 12 code points at registration, member change and reset (reset decides by account kind under lock); staff keep 8; existing passwords still verify.
- **Invite gate:** `REGISTRATION_MODE` (default `invite` when `NODE_ENV=production`) and `REGISTRATION_INVITE_EMAILS_SHA256` on the API and worker. The worker closes uninvited intents silently (`not_invited`); completion re-checks. Render blueprint lists both variables.
- **ADR 0013 C/D:** staff objection with step-up bound to the reason; the subject's single-use, POST-only link (`/recovery/object`; redeemable only after `accepted_for_delivery`; records an objection and, once, its withdrawal); withdrawal by the objector within 24 hours; resolution as a new case referencing the objected one, never verified or approved by an objector; a pattern alert on repeated objections; the dead operator approval branch replaced by an explicit refusal until P-13. Admin UI actions and mock support.
- **Migration:** `generated/0006_easy_impossible_man.sql` (12 entries, 36 tables). Neon runbook prepared and rehearsed on disposable PostgreSQL 18; **not applied**.
- **Docs:** identity §3, §4.3, §10.11.1, §10.14; data model; THREAT-MODEL T-01/T-17; ARCHITECTURE and ESSENTIALS summaries; api-integration-contracts; `.env.example`.
- **Checks (actual):** `pnpm check` exit 0 (contracts 82, chains 69, backend non-database 56, web 414; format, lint, types, build). Backend coverage with all database integration tests: 40 files, 200 tests passed, 83.66% branches, floors pass. Chromium E2E on the mock build: 420 passed, 84 skipped (desktop-only specs in the mobile project), 0 failed. 0006 runbook rehearsed on disposable PostgreSQL 18. **Not run:** anything against Render, Vercel or Neon.
- **Merged** as [PR #15](https://github.com/Skyboyyt/blacklist/pull/15) on the owner's instruction ("open the pr and merged"). **0006 applied to Neon by the owner (2026-10-16): ledger 12 rows, all `ok` (owner-reported).** Not yet deployed.

### 2026-10-16: Claude, Neon migration `0005_invalidation_guard.sql` (applied by the owner)

- The owner reports the Neon staging ledger at 10 entries; `main` expects 11.
- Runbook: [docs/operations/2026-10-16-apply-0005-invalidation-guard.md](docs/operations/2026-10-16-apply-0005-invalidation-guard.md). It contains read-only checks, an expected checksum for every file, a restore-point branch, an atomic apply script run as `blacklist_migrator`, verification queries and rollback notes.
- Rehearsed on disposable PostgreSQL 18 at the same 10-entry state: success as the migrator, success as an owner role with ADMIN (temporary SET revoked), refusal on re-run, full rollback with duplicates, existing records untouched, the repository runner accepting all 11 checksums.
- **Applied by the owner (2026-10-16), owner-reported as working.** The owner ran the runbook in the Neon SQL Editor. Claude has no Neon access and has not seen the Step 4 output; the staging ledger is reported at 11 entries. Claude cannot independently confirm the checksums or the guard state until the output is shared.


### 2026-10-15: Claude, ADR 0013–0018 decision brief (owner task 2)

- **Owner reported** setting `CLIENT_IP_FORWARDING_TOKEN` on Vercel and Render. Claude could **not** verify it: this environment's egress policy blocks `*.vercel.app` and `*.onrender.com` (not bypassed). The forwarding code is only on PR #14, which is not merged, so the deployed services do not use the secret yet. A safe owner check is in the brief.
- **Wrote** [docs/reviews/2026-10-15-adr-0013-0018-decision-brief.md](docs/reviews/2026-10-15-adr-0013-0018-decision-brief.md).
- **ADR 0013:** concrete sole-admin and objection transition model; nothing weakened.
- **ADR 0014:** explicit staging-only scope.
- **ADR 0018:** a seven-row provider verification table.
- **Statuses unchanged.** No infrastructure change, merge or deploy.


### 2026-10-15: Claude, Phase 7–8 review and follow-up (PR #14)

- **Review:** [docs/reviews/2026-10-15-claude-phase7-8-review.md](docs/reviews/2026-10-15-claude-phase7-8-review.md), CR-01 to CR-15. ADR recommendations are recorded in ADRs 0013–0018.
- **Fixed:**
  - CR-01: verified per-visitor client IP behind the gateway (inactive until the secret is set).
  - CR-02: re-authentication throttle.
  - CR-03 (part): RPC budget window.
  - CR-06: reverts and item failures no longer trip the circuit; non-tokens are reported as such.
  - CR-08: `delegated` labelling.
  - CR-15: password-change rejections, error mapping per api-integration-contracts §7, HTTPS for the internal URL, and a separate recovery-verification rationale (identity §10.11; Chromium E2E for recovery and admin: 52 passed, 14 skipped by design).
  - CR-12: documentation consistency pass (AGENTS §1, ARCHITECTURE header and stack table, ESSENTIALS, THREAT-MODEL, data-model, chain-data deviation note, ADR index, ADR 0001 supersession note, README, phase7-acceptance, dependency policy).
  - CR-13: this handoff reset, with the history archived.
- **Database work (2026-10-15, Docker started in this environment):**
  - CR-03 receipts are written only for verification reads.
  - CR-07: the EVM digest uses only the spec fields.
  - CR-14 D-1: invalidation guard migration `0005_invalidation_guard.sql`.
  - CR-14 D-2: single `migrations/order.json`.
  - CR-15.2: token pre-check before password work.
- **Actual checks (last full run):**
  - `pnpm check` exit 0: 81 contract, 69 chain, 54 backend non-database and 411 web tests, plus format, lint, types and Next build.
  - Backend-acceptance typecheck passes.
  - Chain coverage: 81.72% branches against the 75% floor.
  - `build:mock` and `check:mock-exclusion` pass, 4/4.
  - `pnpm audit --prod` is clean. The full audit has one high, dev-only advisory (`braces`).
  - **Backend coverage run, including all database integration tests: 39 files and 194 tests passing; 83.61% branches; all floors pass.** The browser-dependent tests needed `/usr/bin/chromium`, which I symlinked to the pre-installed Chromium (an environment change, not a repo change).
  - Chain coverage: 81.93% branches.
  - **Not run:** anything against Render, Vercel, Neon or providers. The new migration has not been applied in the cloud.
- **Next:** owner decisions 1–4 above; Codex runs the integration suite on PR #14.
