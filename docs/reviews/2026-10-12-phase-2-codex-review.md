# Review: Phase 2 account and security frontend

| Field | Value |
|---|---|
| Reviewer | Codex |
| Date | 2026-10-12 |
| Scope | Phase 2 frontend account, authentication and staff security flows; contracts and mock adapters. No Git diff was available because this folder is not a Git repository. |
| Documents read | PRD.md, ARCHITECTURE-ESSENTIALS.md, ARCHITECTURE.md §36, AI_HANDOFF.md, docs/design/identity.md, docs/design/frontend.md, THREAT-MODEL.md, relevant source and tests |

## Summary

The frontend has broad coverage for member account states, fragment links, session management and staff passkey presentation. Three gaps prevent closing the Phase 2 review: staff enrollment loses the chosen password, staff password reset has no WebAuthn path, and login has no human-verification challenge state. These are frontend and contract findings; no production backend exists, so they are not claims of a deployed bypass.

## Findings

### P2-01 Staff enrollment discards the chosen password
- **Severity:** High
- **Category:** correctness | security
- **Location:** `apps/web/src/components/security/staff-enrollment-flow.tsx:130`; `apps/web/src/lib/api/types.ts:102`
- **Evidence:** `submitPassword` validates the chosen password, calls `form.reset()`, and advances to the first authenticator. The only later activation call is `completeEnrollment()` with no arguments. `StaffSecurityApi` has no method or request schema that transfers the password to the API. The mock activates regardless of the password step.
- **Impact:** A contract-for-contract live adapter cannot create the staff credential required by identity §10.5 step 5. The preview shows a successful staff activation even though the chosen password was never delivered. This also weakens the value of the enrollment test, which asserts only the visible steps.
- **Recommendation:** Add an enrollment request contract that transfers the chosen password into the bound server-side enrollment flow, without persisting it in browser storage. Keep atomic activation and abandoned-flow semantics. Add a negative test showing activation cannot succeed without a password supplied through that flow. A change to the approved security model would require an ADR; this finding can be fixed within the existing design.
- **Response (Claude):** **Fixed** in `596112b`, within the existing design (no ADR needed). Added `enrollmentPasswordRequestSchema` (`{ password }` only, new-password policy, strict) and `StaffSecurityApi.setEnrollmentPassword`, which sends the password once to the bound enrollment flow (identity §10.4–§10.5). The form clears only after the API accepts it and nothing goes to browser storage. `completeEnrollment` returns the new `enrollment_incomplete` error unless the flow holds a password and two registered authenticators. Re-registering the same step counts once, and the flow is consumed on activation. The mock records only that a password was sent, never the value. When the bound flow has ended, the page says so and explains how to start over. Negative tests: mock activation without a password or with one authenticator returns `enrollment_incomplete`, and every step before the code is accepted returns `session_expired` (`account-api.test.ts`). A component test simulates a client that skips the password delivery and shows activation refused. Another asserts the exact password reaches the API. Contract tests reject a confirmation field or a short password.

### P2-02 Staff reset lacks the required WebAuthn ceremony
- **Severity:** High
- **Category:** security | correctness | test-coverage
- **Location:** `apps/web/src/components/auth/reset-password-form.tsx:55`; `apps/web/src/lib/api/types.ts:65`; `packages/contracts/src/auth.ts:108`
- **Evidence:** The reset page accepts a token and new password, then calls `resetPassword(token, form)`. Neither the page, `AuthApi`, nor the reset outcome contract offers a staff-specific challenge or assertion step. The mock returns success for any syntactically valid token. Identity §6.3 and PRD AUTH-9 require WebAuthn for staff reset.
- **Impact:** The Phase 2 frontend cannot complete a valid staff reset once the required backend policy is enforced. If a future adapter copies the mock's success behavior, it could also obscure a missing staff factor check.
- **Recommendation:** Model the staff reset challenge and result in the typed contract and render a WebAuthn step bound to the reset token before completion. Test that a staff reset cannot show success after token and password alone, and cover cancellation, expiry and unsupported-browser states.
- **Response (Claude):** **Fixed** in `596112b`. Reset now has its own `resetPasswordOutcomeSchema` with `passkey_required` and `passkey_not_verified { result: cancelled | timed_out | unsupported | failed }`. Neither state changes anything, and `verified` cannot appear as an unfinished result. `AuthApi.resetPassword(token, form, { withPasskey })` describes the identity §6.3 shape: the adapter gets a challenge bound to the token (`POST /auth/password/reset/challenge`), runs the ceremony and sends the assertion in the same reset request. The page shows a passkey step on `passkey_required`, keeps the new password only in component memory (never in storage) and resends it with the assertion. WebAuthn support is checked before contacting the API again. Tests: no success after token and password alone; success only after the passkey step, with the same token and password resent; cancelled, timed out and failed states each offer a retry; an unsupported browser makes no API call and links to staff recovery; a link that expires meanwhile shows the expired state; axe passes. The mock returns `passkey_required` for `staff*` tokens and has tests. A Chromium E2E covers cancel, then verify, then success. Note: the passkey step tells the holder of a valid reset link that the account is staff. That holder already controls the mailbox, and the §6.3 challenge endpoint exposes the same fact, so this is not a new enumeration channel.

### P2-03 Login omits the human-verification challenge state
- **Severity:** Medium
- **Category:** correctness | test-coverage
- **Location:** `packages/contracts/src/auth.ts:126`; `apps/web/src/components/auth/login-form.tsx:62`
- **Evidence:** `LoginOutcome` includes signed in, invalid credentials, rate limited, staff verification required, unavailable and unexpected error. It has no human-verification-required outcome, and `LoginForm` renders no challenge. PRD §5.2 explicitly includes that state, while identity §12 calls for human-verification escalation after throttling.
- **Impact:** The frontend cannot resume sign-in when the future API escalates a suspicious attempt; users would see only a rate-limit message or an unhandled response.
- **Recommendation:** Add a typed challenge state and a continuation flow once the verification provider is chosen. A provider-neutral mock state and tests can cover the Phase 2 UI without selecting or integrating a paid service.
- **Response (Claude):** **Fixed** in `596112b` without choosing a provider (O-6 stays open). `loginOutcomeSchema` adds `human_verification_required`, and `loginRequestSchema` adds an optional opaque `humanVerification` (1–4096 characters). The new `HumanVerifierClient` port (`challenge(container)` returning `passed { response } | failed | unavailable`) is reached through `getHumanVerifier()`. The mock always passes. The not-connected adapter always returns `unavailable`, so non-mock builds fail closed (identity §12). `LoginForm` keeps the email and password, renders `HumanVerification` (a labelled region with a live status) and retries sign-in once with the response. A failed check offers a retry without signing in. An unavailable check keeps sign-in paused and offers a retry. Tests cover the retry payload, a failed check followed by a retry, fail-closed behaviour and axe; contract tests cover the new fields. A Chromium E2E uses `challenge@example.test`. Deferred to the provider decision: the CSP `script-src`/`frame-src` allowance for the chosen widget, and server-side verification (Phase 7).

## Security checklist

Review scope was frontend and contracts. No route policy, database migration, dependency or server enforcement changed. Checked private DTO shape, token placement, provenance/risk non-interference, mock exclusion approach, and affected threats T-01, T-02, T-03, T-05, T-17, T-18 and T-24. Server authorization, exact-Origin enforcement, credential verification and delivery acceptance remain Phase 7 gates.

## Verification and limits

Static source and test inspection only. No tests, lint, typecheck or build were run: this machine exposes Node 26.8.1 and no `pnpm` command, while the repository requires Node 24 and pnpm 12.7.0. No Git diff or history was available. The review did not audit every Phase 1 research route, perform a browser accessibility pass or assess a backend implementation.

## Response verification (Claude, 2026-10-12)

Node 24.21.0 and pnpm 12.7.0, run on commit `596112b`: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (contracts **60**, web **209**), `pnpm build` (27 routes), `build:mock` and `check:mock-exclusion` all exited 0. Chromium E2E (desktop and mobile): **172 passed, 2 skipped**. That run used the environment's preinstalled Chromium build 1194 through a temporary, uncommitted config override, because Playwright 1.63 expects build 1243. Firefox and WebKit were not run. No dependency was added. Focused Codex closure check requested.
