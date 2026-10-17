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
| Phase 8 (Chain Data & Research) | Authorized 2026-10-14, merged (PR #12) on explicit owner instruction despite disclosed blockers. **Research on staging authorized by the owner 2026-10-17** (free Alchemy and Helius, default request caps; recorded in ADR 0018); production stays off. ADR 0018 accepted provisionally 2026-10-16 (waiver recorded); O-3 open |
| Deployment | Free staging services are public on explicit owner instruction (2026-10-13): Vercel web, Render API and worker, Neon PostgreSQL 18 staging database. **Not production-ready**; Phase 11 gates (legal, retention, recovery, monitoring) remain |
| Authorized now | **Phase 11** (owner, 2026-10-17, "launch readiness"): integration, hardening and launch readiness; plan in [docs/phase11-plan.md](docs/phase11-plan.md); exit is the owner-signed [docs/launch-checklist.md](docs/launch-checklist.md). **Phase 10** (owner, 2026-10-17; merged and deployed): risk engine, assessments and jobs, projects, admin backend, notifications, band-only scoreboard; plan in [docs/phase10-plan.md](docs/phase10-plan.md); public bands only after O-12. **Phase 9a** (owner, 2026-10-16; merged and deployed): reports, moderation cases, finding revisions/approval/system publication, standing, responses, appeals, corrections on the existing Render/Neon. **Waiver:** Phase 9 work may merge before the Phase 7 independent security review. Also owner decisions of 2026-10-16 (ADR 0013 design, member password 12 / staff 8, invite-only sign-up, ADR 0018 provisional) and review follow-up fixes inside the approved design. **Phase 9b** (owner, 2026-10-17): ADR 0020 accepted for staging, test images only; plan in [docs/phase9b-plan.md](docs/phase9b-plan.md). **Not authorized:** a production environment (O-4), paid resources, cloud migrations, provider activation |
| Primary / reviewer | Claude / Codex |
| Last agent | Claude: Phase 10 merged and deployed (PRs #21–#29, Neon ledger 20, 78 tables); Phase 11 plan and launch checklist drafted |
| Last updated | 2026-10-17 |

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

### 2026-10-17: Claude, Phase 9b requested; hosting ADR proposed

- The owner paused Phase 11 and asked to start Phase 9b (image evidence). Its gate is an accepted hosting ADR, so no code yet.
- [ADR 0020](docs/adr/0020-phase9b-evidence-hosting-on-staging.md) (**Proposed**): object storage on Backblaze B2 or Cloudflare R2 free, and the processor as a secretless third Render free service. Verified from Render's docs: free services cannot receive private traffic, and there is no outbound restriction, so ADR 0004's network isolation is not met on staging. Proposed as an owner risk acceptance with **test images only**; production keeps full isolation (O-4). Provider card requirements and versioning or object lock were not confirmed from official sources, so they are listed as sign-up conditions.
- [docs/phase9b-plan.md](docs/phase9b-plan.md): six slices.
- **Owner decision 2026-10-17:** ADR 0020 accepted for staging, test images only (asked directly in the session). Recorded in ARCHITECTURE §14.3 and §30, ESSENTIALS, THREAT-MODEL T-33, AGENTS and the launch checklist.

### 2026-10-17: Claude, Phase 11 authorized; plan and launch checklist

- The owner authorized Phase 11 ("launch readiness"). [docs/phase11-plan.md](docs/phase11-plan.md) sets nine workstreams, each marked Claude, owner or paid; [docs/launch-checklist.md](docs/launch-checklist.md) is the exit document for the owner to sign.
- Critical path: legal review (owner must engage counsel). No production environment exists; O-4 decides hosting and needs the owner's instruction.
- Workstream 1: P10-07 and P10-08 fixed; P10-06 partly (profiles load four at a time). Tests: lint, typecheck and format clean; backend acceptance 34 files / 161 tests passed locally (Docker Postgres), then the project tests again after the extra assertion.
- Runbooks written: [restore drill](docs/operations/restore-drill.md), [staff recovery and break-glass drills](docs/operations/staff-recovery-and-break-glass-drills.md), [monitoring](docs/operations/monitoring.md). Checked against the code: staff recovery needs two admins plus the subject; free-tier health monitors would keep Render/Neon awake (CR-04), so staging monitors only the website.
- **P11-01 (Medium, open):** the break-glass flag is read from the operator's local `.env`, not the hosting platform, so identity §10.13's platform audit trail does not exist. Mitigated by the audit row, staff-wide email and session revocation; technical fix needs an ADR with P-13.
- Next for Claude, needing nothing from the owner: the independent security review brief and the counsel pack (legal and retention).

### 2026-10-17: Claude, Phase 10 slices 1–2 (risk engine, assessments)

- Slice 1: pure V1 risk engine (`packages/domain/src/risk/`), golden, invariant and replay tests.
- Slice 2:
  - risk tables in migration 0008, with an owner runbook rehearsed on disposable PostgreSQL 18 (16 entries, 69 tables);
  - signals and assessments follow published findings in the same transaction;
  - staff see the score in case detail;
  - public bands stay off (`RISK_PUBLIC_BANDS=false`, O-12);
  - the worker runs a 15-minute expiry sweep.
- Slice 3: projects (migration 0009), suggestions and corrections through the case workflow, public profiles and directory.
- Slice 4: labels, signal suppressions, notifications and 14-day appeal escalation (migration 0010), the audit viewer.
- Merged and deployed 2026-10-17: PR #21 (slices 1–4; owner applied 0008–0010 on Neon: 20 ledger entries, 78 tables), #22 (search detects the network), #23 (research retry while the API wakes), #24 (privacy-safe research failure log). Research on staging is on (owner authorization, ADR 0018), with `RPC_API_TOTAL_REQUEST_BUDGET=1000`.
- **Incident 2026-10-17 (resolved):** the 0008–0010 scripts were first applied to the Neon backup branch `pre-phase10-2026-10-17` (the SQL Editor switches to a new branch after it is created). The API's `staging` branch stayed at 14 ledger entries, so `/projects` and `/scoreboard` returned 503 (`relation "blacklist.projects" does not exist`); actions writing notifications or risk rows may also have failed between the PR #21 deploy and the fix. The owner re-applied all three scripts on `staging`: 20 ledger entries, 78 tables; pages confirmed working. The backup branch also holds the migrations and is unused. The runbooks now say to switch back to `staging` after creating the restore branch.
- PR #25 (slice 5) merged and deployed 2026-10-17.
- Research readability (2026-10-17, owner request): native balances show in ETH/SOL with the exact raw value beside them; token balances and supply apply their decimals (`formatTokenAmount` in contracts). Owner to switch on `ALCHEMY_INDEXED_HISTORY_VERIFIED` and `ALCHEMY_TOKEN_BALANCES_VERIFIED` on the staging API (existing code; research-on-staging authorization). USD values, tracing and watchlists remain out of V1 (PRD §4.4).
- Ethereum history pages request 10 rows (each row costs a receipt and a block read). Staging API limits to set: `RPC_API_REQUESTS_PER_MINUTE=120`, `RPC_API_TOTAL_REQUEST_BUDGET=5000` (still far inside the free Alchemy and Helius plans).
- Phase 10 self-review (`docs/reviews/2026-10-17-claude-phase10-review.md`): P10-01 to P10-05 fixed with tests (suspended dispute state, review-time loop, escalation order, domain retirement, worker sweep logging); scale items deferred. O-12 decision brief for the owner: `docs/o-12-decision-brief.md`.
- Slice 5: band-only scoreboard and profile-state routes; live web adapters for projects, scoreboard, suggestions, corrections, audit log, labels and suppressions; "Show finalized data" on address pages. No migration.
- **Owner (after the PR):** apply 0008, 0009 then 0010 on Neon, then deploy the API, worker and Vercel.

### 2026-10-17: Claude, Phase 10 authorized; plan drafted

- The owner authorized Phase 10. [docs/phase10-plan.md](docs/phase10-plan.md) proposes five slices and four owner decisions (O-12 public-band switch, deferred analysis feeders, admin-only `project:manage`, interim status sets). Waiting for the owner's go-ahead before slice 1.
- Earlier the same day: PR #19 (`main` into the old default branch) was closed unmerged; the owner switched the GitHub default branch to `main`. The Reports list and the live dashboard now list submissions from the member API (PR #20).

### 2026-10-17: Claude, first staff admin and slice 5 (web live adapters)

- **First admin enrolled on staging** by the owner (`sanifahad24@gmail.com`, bootstrap via the operator CLI). Lessons and the manual step are in [docs/operations/2026-10-17-staff-bootstrap.md](docs/operations/2026-10-17-staff-bootstrap.md):
  - the first invitation was never sent (the worker woke after the 15-minute window), and the owner expired it by SQL (no audit row);
  - the worker now uses a second Resend account for the staff address, so **staging email reaches only `sanifahad24@gmail.com`** until a domain is verified (launch blocker);
  - the GitHub default branch is still `chore/initial-repository`.
- **Slice 5:**
  - live `MemberApi` and `ModerationApi` adapters, with wallet signing for standing (`personal_sign` / Solana `signMessage` only);
  - live-build notices replace image pickers;
  - standing decisions need no step-up (aligned with identity §10.7 and the mock);
  - the CLI prints a safe failure reason and a reminder to wake the worker.

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
