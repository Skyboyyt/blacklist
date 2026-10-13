# Review: Phase 6 frontend quality pass

| Field | Value |
| --- | --- |
| Reviewer | Codex |
| Date | 2026-10-13 |
| Repository | Skyboyyt/blacklist |
| Scope | PR #6; merge commit `93356a16ee8f2031813dfd60d01778f8f0707486`, compared with `0e9bf58` |
| Documents consulted | AGENTS.md, AI_HANDOFF.md, approved Phase 6 brief, ARCHITECTURE and normative identity/moderation protocols, frontend requirements checklist, integration contracts, previous Codex findings |

## Summary

**Required fixes before Phase 6 sign-off.** The revision editor, appeal-amendment flow, recovery verification screen and quality audit are present, and the six previous repairs remain unchanged and pass their regression suite. However, three targeted checks reproduce two High lifecycle defects, and the test listing confirms one Medium cross-browser coverage gap. These are frontend mock defects and verification gaps, not findings about a deployed backend.

All existing checks pass: 79 contract tests and 378 web tests (457 total), formatting, lint, type checks, production/mock builds and mock-exclusion verification. Passing the existing suite does not cover the failures below. Backend development and its acceptance gates remain Phase 7; this review implements no backend or application fixes.

## Findings

### P6-01 Appeal decisions are not bound to the public revision they reviewed

- **Severity:** High
- **Category:** correctness / authorization
- **Location:** `apps/web/src/lib/api/mock/member-api.ts:672–686`; `apps/web/src/lib/api/mock/moderation-api.ts:871–879`, appeal decision effects; `apps/web/src/lib/api/mock/public-effects.ts:156–169`
- **Evidence:** Publish revision 2 of finding `demo-finding-301` through `proposeRevision` and `approveRevision`. Then decide the existing `APL-2002`, which reviewed revision 1, as the assigned independent appeal reviewer. `reverse` returns `ok` and removes the current revision-2 finding instead of rejecting or explicitly reconciling the stale decision. The case-version and step-up checks pass because they bind the case and submitted parameters, not the current finding revision. A second test files a new appeal after revision 2 is public: its `appealedDecision.revisionNumber` is still hard-coded to `1` despite including revision-2 public text.
- **Impact:** A decision based on old evidence/text can reverse or amend a newer public assessment; newly filed appeals misidentify their subject revision. Adding the revision editor makes these states reachable through normal workflows.
- **Recommendation:** Capture the actual published revision and content hash at appeal creation. Before public effects or an amendment proposal, check that the decision is authoritative for its target revision/current finding state. Return a conflict or use an explicitly approved reconciliation/re-review flow when publication changes; never silently apply an old decision to a new revision. Add tests for new appeals after revision 2 and stale uphold/amend/reverse decisions, asserting no public, case or audit mutation on refusal.
- **Requirement:** Moderation §9 requires revision-bound decisions; the approved invariants prohibit stale authority changing current state.
- **Response (Claude):** Pending.

### P6-02 A pending revision can resurrect a reversed finding

- **Severity:** High
- **Category:** correctness / lifecycle
- **Location:** `apps/web/src/lib/api/mock/moderation-api.ts:975–1073`; `apps/web/src/lib/api/mock/public-effects.ts:165–169` and reversal helpers
- **Evidence:** Propose revision 2 of `demo-finding-301` without publishing it. The independent appeal reviewer then reverses the still-public revision 1 through `APL-2002`; the public finding disappears. Switch to the revision author, obtain a fresh correctly bound step-up, and approve pending revision 2. Approval returns `ok` and `publishFinding` restores the finding and its risk factor. Reversal removed the public projection but did not make the pending proposal non-authoritative, and approval checks suspension/latest/hash without checking a reversed lifecycle state.
- **Impact:** The approvals screen can undo an independent reversal using a proposal that predates the decision. The public page and scoreboard can again count the reversed allegation without a new authorized review.
- **Recommendation:** Represent and guard the finding's authoritative lifecycle/state revision. On reversal, preserve history but invalidate/supersede outstanding publication authority; approval must reject proposals whose expected finding state is obsolete. Apply the same rule to appeal reversal and suspension-review reversal. Add tests showing that stale proposals cannot restore reversed text or factors, even with fresh step-up verification.
- **Requirement:** THREAT-MODEL §8 invariant 12; moderation §8.2 and revision-bound publication.
- **Response (Claude):** Pending.

### P6-03 The documented cross-browser command excludes Phase 6 workflows

- **Severity:** Medium
- **Category:** test coverage
- **Location:** `tests/e2e/playwright.config.ts:12–13` and Firefox/WebKit `testMatch`; AI_HANDOFF.md Session 19 cross-browser instructions
- **Evidence:** With `E2E_ALL_BROWSERS=1`, `playwright test --list` lists 602 cases. Desktop/mobile each list 88 cases from `revisions.spec.ts`, `recovery.spec.ts` and `quality-audit.spec.ts`; Firefox, WebKit and WebKit-mobile each list 34 auth/account tests and **zero** tests from those three Phase 6 specs. `CROSS_BROWSER_SPECS = /(auth|account)\.spec\.ts$/` filters them out. Installing the browsers and running the documented command will not validate the new screens or quality audit there.
- **Impact:** The remaining cross-browser gate cannot be completed with the prescribed command, and regressions in the new revision/recovery surfaces would remain untested.
- **Recommendation:** Expand the cross-browser projects to the required Phase 6 journeys and suitable quality checks. Keep legitimate viewport/project exclusions explicit. Verify the test listing includes the intended new suites before recording any cross-browser pass.
- **Response (Claude):** Pending.

## Independent validation

| Check | Result |
| --- | --- |
| Runtime / package manager | Node 24.21.0 / pnpm 12.7.0 |
| `pnpm check` on unmodified reviewed source | Exit 0: format, lint, type checks, 79 contract + 378 web tests, production build |
| Prior six-finding regression source | Unchanged from PR #5; passes within the web suite |
| Additional Phase 6 lifecycle tests | 3 failed: stale appeal decision accepted, new appeal records revision 1 instead of 2, reversed finding's pending revision accepted |
| Mock build | Exit 0 |
| Mock-exclusion scan | 4/4 PASS: production mock-marker absence, mock positive control, no scanned server-only names in either browser bundle |
| All-browser test listing | 602 listed; each Firefox/WebKit project excludes all three new Phase 6 specs |
| Independent browser execution / visual inspection | Not performed: this environment has no installed compatible browsers; the prior installation attempt failed. Claude's screenshot inspection and 418 Chromium passes are author-reported evidence |

The reproduction file is preserved as `docs/reviews/reproductions/2026-10-13-phase-6.test.ts.sample`. Copy it to `apps/web/src/lib/api/mock/phase6-review.test.ts`, then run `pnpm --filter @blacklist/web exec vitest run src/lib/api/mock/phase6-review.test.ts`. Remove the temporary copy afterward. The sample stays outside the normal test suite to preserve evidence without altering baseline results.

## Requirements assessment and remaining decisions

- **Implemented:** exact-base revision editor and history; fresh approval for amendments; staff recovery verifier screen and two-verifier/one-admin rule; documented responsive/focus/contrast fixes; new scripted quality coverage.
- **Preserved:** severe-replacement independence, actor/session/parameter binding, emergency suspension publication barrier, DNS standing eligibility, stale project-correction checks and new-address public records.
- **Not closed:** revision-bound appeal effects and reversed-state publication authority (P6-01/P6-02); planned cross-browser coverage (P6-03); actual Firefox/WebKit execution and assistive-technology/manual audit remain open rather than passes.
- **Documentation/owner decisions:** retain the listed pagination and interim-status decisions. Staff recovery permission reconciliation/exclusion of appeal reviewers is already disclosed by Claude and should be explicitly ratified/reconciled with normative identity §10.11 before backend contracts are finalized. No architecture decision is made by this review.
- **Minor documentation:** `findingHistorySchema` says oldest-first and `publicText` null during suspension, whereas the service/editor use newest-first and show the saved pre-suspension text under “Current public text.” Clarify the contract and distinguish staff-visible withheld text from what the public actually sees.

## Not reviewed

No real backend, database, WebAuthn assertions, email provider, upload processor, blockchain adapters, production deployment or launch security gates exist in this commit. No browser conformance, real-device testing, penetration test or legal readiness is claimed.

No application code was repaired, and no commit, push, merge or GitHub comment was made during this review. The next step is Claude's response and fixes for P6-01–P6-03, followed by a focused Codex recheck before Phase 6 closure.

## Repair validation (Codex, 2026-10-13)

The owner requested the fixes. P6-01, P6-02 and P6-03 are repaired locally on `fix/phase6-review-findings`.

- P6-01: appeal submission captures the current published revision; case decisions reject stale or reversed revision authority before mutation. Immutable revision numbers bind the existing appeal DTO without a contract change. Legacy suspended demo fixtures retain the original revision-1 snapshot.
- P6-02: appeal and suspension reversal record a lifecycle tombstone and supersede all previous publication authority while preserving revision content. Pending approval cannot resurrect a reversed finding.
- P6-03: all browser projects select the full suite; `E2E_ALL_BROWSERS=1 ... --list` lists 1,250 cases, 250 per project and 88 Phase 6 cases per project.
- Six maintained regressions in `apps/web/src/lib/api/mock/phase6-regressions.test.ts` pass. Stale uphold/amend/reverse leave case, public projection, revisions and audit unchanged; new appeals capture revision 2; both reversal paths prevent subsequent approval.
- `pnpm check` passed: format, lint, typecheck, 79 contract + 384 web tests and production build.
- Mock build passed; mock-exclusion scan passed all four checks.
- Browser execution remains unavailable; the expanded selection is verified by discovery only. Existing owner decisions and manual accessibility checks remain open. No backend, dependencies, migrations or architecture changes. Owner authorized publication and merge of the repair branch; verify the resulting PR status on GitHub.
