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

### P2-02 Staff reset lacks the required WebAuthn ceremony
- **Severity:** High
- **Category:** security | correctness | test-coverage
- **Location:** `apps/web/src/components/auth/reset-password-form.tsx:55`; `apps/web/src/lib/api/types.ts:65`; `packages/contracts/src/auth.ts:108`
- **Evidence:** The reset page accepts a token and new password, then calls `resetPassword(token, form)`. Neither the page, `AuthApi`, nor the reset outcome contract offers a staff-specific challenge or assertion step. The mock returns success for any syntactically valid token. Identity §6.3 and PRD AUTH-9 require WebAuthn for staff reset.
- **Impact:** The Phase 2 frontend cannot complete a valid staff reset once the required backend policy is enforced. If a future adapter copies the mock's success behavior, it could also obscure a missing staff factor check.
- **Recommendation:** Model the staff reset challenge and result in the typed contract and render a WebAuthn step bound to the reset token before completion. Test that a staff reset cannot show success after token and password alone, and cover cancellation, expiry and unsupported-browser states.

### P2-03 Login omits the human-verification challenge state
- **Severity:** Medium
- **Category:** correctness | test-coverage
- **Location:** `packages/contracts/src/auth.ts:126`; `apps/web/src/components/auth/login-form.tsx:62`
- **Evidence:** `LoginOutcome` includes signed in, invalid credentials, rate limited, staff verification required, unavailable and unexpected error. It has no human-verification-required outcome, and `LoginForm` renders no challenge. PRD §5.2 explicitly includes that state, while identity §12 calls for human-verification escalation after throttling.
- **Impact:** The frontend cannot resume sign-in when the future API escalates a suspicious attempt; users would see only a rate-limit message or an unhandled response.
- **Recommendation:** Add a typed challenge state and a continuation flow once the verification provider is chosen. A provider-neutral mock state and tests can cover the Phase 2 UI without selecting or integrating a paid service.

## Security checklist

Review scope was frontend and contracts. No route policy, database migration, dependency or server enforcement changed. Checked private DTO shape, token placement, provenance/risk non-interference, mock exclusion approach, and affected threats T-01, T-02, T-03, T-05, T-17, T-18 and T-24. Server authorization, exact-Origin enforcement, credential verification and delivery acceptance remain Phase 7 gates.

## Verification and limits

Static source and test inspection only. No tests, lint, typecheck or build were run: this machine exposes Node 26.8.1 and no `pnpm` command, while the repository requires Node 24 and pnpm 12.7.0. No Git diff or history was available. The review did not audit every Phase 1 research route, perform a browser accessibility pass or assess a backend implementation.
