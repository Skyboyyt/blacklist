# Review: Phase 7 prepublication validation

| Field | Value |
|---|---|
| Reviewer | Codex (reviewing its assigned implementation; independent Claude review pending) |
| Date | 2026-10-13 |
| Scope | Phase 7 working tree on `feat/phase7-backend-foundation-review`, based on `4b16cdb`; integrated Phase 6 PR #7 retained |
| Documents read | AGENTS, PRD, ARCHITECTURE-ESSENTIALS, ARCHITECTURE Phase 7/security boundaries, THREAT-MODEL, AI_HANDOFF, identity/moderation/chain-data designs, ADR 0007/0008, dependency/testing policy, API contracts |

## Summary

The owner requested tests, security and secret review, PostgreSQL migration verification, then conditional commit/push and a PR to main without merging. GitHub currently has no main; the owner approved creating it from `chore/initial-repository`. Publication remains conditional on validation. No branch, credential, service or production deployment is substituted for a failed check.

The review walks signed-cookie/session ownership and version transitions, exact-Origin and internal-proxy boundaries, staff enrollment and action-bound existing-factor proof, independent approvals and recovery barriers, SMTP activation/generation state, queue/log/DTO privacy, audit append/grants and migration checksums. A critical stale-mailbox reset race, inconsistent lock ordering and a member-session contract mismatch were reproduced and fixed. Existing moderation revision/appeal/reversal protections remain integrated.

## Findings

### R-01 Revoke-other-sessions bypassed member reauthentication

- **Severity:** Medium
- **Category:** security / contract correctness
- **Location:** `packages/domain/src/identity/account.ts`, `revokeSessions`; approved frontend mock `account-api.ts` and account security UX.
- **Evidence:** a real queued-SMTP registration and two real signed member sessions reproduced HTTP 200 for `sessionId: others` without reauthentication; the new assertion expected 400 `reauth_required` and failed before the fix. The domain now checks the locked session policy for fresh member reauthentication before this bulk revocation.
- **Impact:** a stolen signed cookie could remove the member's other sessions without proving the password; the backend also disagreed with the existing frontend contract.
- **Recommendation:** retain the regression: deny without reauthentication, allow after password proof, immediately deny the revoked other signed session.
- **Implementation response (Codex):** fixed and focused regression passed; final complete-suite evidence recorded below.
- **Response (Claude):** pending independent review.

### R-02 Full dependency audit remains failing

- **Severity:** High (upstream advisory severity; development dependency only)
- **Category:** security / supply chain
- **Location:** `@next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`.
- **Evidence:** full `pnpm audit --json` exits 1: GHSA-vfj7-8cjw-p6xm, stack exhaustion on deeply nested patterns; registry latest remains 3.0.3 and the audit has no patched version. Production audit reports zero vulnerabilities; critical-level audit passes.
- **Impact:** vulnerable development glob tooling remains installed. This is not a clean full audit or an assertion that production is ready.
- **Recommendation:** adopt an upstream compatible fix when available, or obtain an explicit, scoped owner decision for publication with this disclosed risk. Do not remove lint rules, suppress the advisory or weaken dependency settings.
- **Response (Claude):** pending.

### R-03 Unresolved normative recovery decisions

- **Severity:** Medium
- **Category:** architecture / availability
- **Location:** Proposed ADR 0013 and identity §10.11–§10.13.
- **Evidence:** sole-administrator verifier authority, objection resolution and a suspended subject's objection channel still lack an approved protocol. The implementation leaves these paths unavailable and objections blocking activation.
- **Impact:** these recovery cases cannot be completed. CLI labels do not establish distinct humans or administrator authority.
- **Recommendation:** Claude review and owner decision on ADR 0013; preserve independent verification, existing-factor proof and objection barriers.
- **Response (Claude):** pending; no exception implemented.

### R-04 Reset issuance could authorize a stale mailbox during an email transition

- **Severity:** Critical
- **Category:** security / concurrency
- **Location:** `packages/domain/src/identity/token-delivery.ts`, issuance TX-A.
- **Evidence:** the worker read the user/email before acquiring the account lock, then used the current security version with the earlier mailbox snapshot. A controlled PostgreSQL test held the account lock, let reset issuance wait, changed the email/version and released it; the old implementation sent a reset link to the old mailbox and failed the expected zero-send assertion.
- **Impact:** control of an old mailbox could supply reset authority over an account whose email had just changed.
- **Recommendation:** reload request/current mailbox under the account lock, require reset request email to match it, and use the current mailbox as recipient; retain the interleaving regression.
- **Implementation response (Codex):** fixed; the new stale-mailbox regression passes.
- **Response (Claude):** pending independent review.

### R-05 Inconsistent token/account lock ordering could deadlock

- **Severity:** Medium
- **Category:** correctness / availability
- **Location:** application `token-delivery.ts` and `reset.ts`; isolated gate `delivery.ts` and `reset.ts`.
- **Evidence:** S13 failed when delivery finalization held a token and waited for account state, while issuance held account state and needed the token. A controlled application test held account state during finalization and attempted token invalidation; the old implementation rejected rather than completing both transitions.
- **Impact:** concurrent issuance/confirmation/security transitions could abort otherwise valid work. Automatic retries are not evidence of correct serialization.
- **Recommendation:** lock the account first, then request/token rows; treat preliminary token/request lookups as non-authoritative and revalidate under lock.
- **Implementation response (Codex):** fixed in runtime and gate implementations, including reset/email confirmation; the controlled application regression passes. No transaction/race assertions or timing thresholds were weakened.
- **Response (Claude):** pending independent review.

### R-06 Required branch coverage is below its floors

- **Severity:** High
- **Category:** test coverage
- **Location:** `tests/backend-acceptance/vitest.config.ts`, application foundation suites and `docs/testing-strategy.md` §11.
- **Evidence:** the first valid full application coverage report passed all 16 assertions but failed coverage. Identity branches were 58.61%, access 77.27%, audit 80%, staff 48.66%, shared 78.26%; the domain total was 54.93%. Identity/access/audit require 90%, other modules require 75%. An earlier empty report was a configuration failure and supplies no coverage evidence.
- **Impact:** successful isolated gates and a small number of broad workflow tests leave substantial application branches unverified; the implementation does not meet the documented coverage gate.
- **Recommendation:** add meaningful adversarial/transition tests for the uncovered paths and rerun the maintained coverage command. Keep the floors and negative tests unchanged. The final configuration measures config/db/API/worker too, with explicit module floors so aggregate coverage cannot hide a deficient module.
- **Implementation response (Codex):** measurement and enforcement added; coverage remains a publication blocker. No assertion-only or zero-denominator pass is claimed.
- **Response (Claude):** pending.

## Validation record

The [durable validation evidence](../evidence/2026-10-13-phase7-prepublication.json) records the final uninstrumented backend run **51 passed / 0 failed / 0 pending**, including D1–D9/S1–S17; `pnpm check` **480 unit/component assertions** plus format/lint/types/production web build; backend builds for all five packages; strict full frozen installation; Drizzle no drift and mock exclusion 4/4. The local API/worker launch wrappers were restarted after the security fixes: health 200, foreign Origin 403, registration 202 and actual queued SMTP observation passed.

Coverage passed all 16 application assertions but failed its floors: global 56.22%; identity 58.61%, access 77.27%, audit 80% (required 90%); staff 48.65%, db 62.5%, API 63.44%, worker 26.31% (required 75%). Config 85.18% and shared 78.26% meet 75%. No floor was lowered. Full browser execution recorded 416 passed / 2 desktop journey timeouts / 82 existing skips; both timeouts passed an unchanged isolated rerun with the same 30-second limit. The complete browser run remains failing in the record.

The application migration tests exercise all seven exact SQL files, repeated application/checksum equality, populated-row backfills and retirement of old pending approvals, logical backup/restore preserving object ownership and ACLs, unchanged audit hashes, runtime DDL/TEMP/audit/verification-table denials and checksum-tamper rejection.

Gitleaks 8.30.0 ran in a digest-pinned network-disabled container with 100% redaction. The candidate source scan reported three findings, and all-ref history (including the preservation stash) reported two: two prose passages about security boundaries and an explicitly fictional configuration placeholder. All were manually inspected; no real credential was found and no scanner rule was disabled. A separate exact-value scan found no actual local secret values in candidate files and production/mock/review frontend builds; counts are in the evidence. The generated local env is ignored and mode 0600. Reports contain no matched secret values or mail bodies.

The browser suite uses the current isolated mock build in `apps/web/.tmp/review-mock`, preserving the preexisting mock server/build. Playwright 1.63.0 uses system Chromium 154 for desktop/mobile; this is not Firefox/WebKit or real-device validation. One old enrollment-heading assertion was updated to require the current heading **and** the fictional-code warning; all independent-approval assertions remain. A filtered dependency addition initially broke workspace links; full frozen installation repaired them before final runs. A temporary build artifact was excluded from ESLint with the same generated-output treatment as existing `.next`/dist exclusions; source rules remain unchanged.

## Not reviewed / publication limits

No production deployment, real user data, production provider account, managed PITR, physical authenticator independence, assistive-technology review, external audit anchoring or Phase 8 work. OSV and formal SBOM CI workflows remain unimplemented; the local dependency/license inventory is not presented as an SBOM. The default human-verification port fails closed while O-6 is undecided. Git remote reads work, but GitHub REST metadata/PR access returns Forbidden in this environment, including an escalated read attempt. No automatic approval rejection occurred; the API request itself was denied.

No commit, push, main creation or PR will be claimed unless actually performed after the conditional checks are satisfied.
