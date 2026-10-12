# AI_HANDOFF.md

Read this first at the start of every session. Update it at the end of every session (AGENTS.md §11). Report results faithfully: if something was not run, say so.

---

## Status

| Field | Value |
|---|---|
| Project | **Blacklist**: Web3 anti-scam, wallet intelligence, project verification and investigation platform |
| **Current Stage** | **FRONTEND-FIRST DEVELOPMENT (Phase 3 implemented, awaiting Codex review)** |
| Current phase | **Phase 3 — Research UI (project directory and profiles, research refinements): implemented on mocks, awaiting Codex review.** Phase 2 passed review and testing (owner, 2026-10-12) |
| Authorized phase | Phase 3 (explicit owner authorization, 2026-10-12). **Phase 4 is NOT authorized.** |
| **Primary Engineer** | **Claude** |
| **Secondary/Review Engineer** | **Codex** |
| Last agent | Claude (primary engineer): Phase 3 implementation |
| Last updated | 2026-10-12 |

> **Development order: FRONTEND-FIRST** (ARCHITECTURE §36). Phases 1–6 are frontend on contracts and mocks; Phase 7 is Backend Foundation (gates D1–D9, S1–S17 first).
>
> **No backend exists.** The web app runs on typed contracts and a mock adapter with fictional data (`NEXT_PUBLIC_API_MODE=mock`); non-mock builds exclude the mock and show "not connected". No database, migrations, CI, infrastructure, deployments or paid services. The public GitHub repository is [Skyboyyt/blacklist](https://github.com/Skyboyyt/blacklist); the pushed branches are `chore/initial-repository` and `claude/amazing-goodall-drtbc9` (Phase 2 corrections).

---

## Session log

| # | Agent | Session | Outcome |
|---|---|---|---|
| 1 | Claude | Phase 0 foundation | PRD, architecture, threat model, rules, scaffold |
| 2 | Codex | Independent review | APPROVED AFTER REQUIRED FIXES: 1 Critical, 8 High, 7 Medium, 2 Low; six Proposed ADRs (details preserved below) |
| 3 | Claude | **Review response + foundation fixes** | All 18 findings accepted (13 as written, 5 with amendments); ADRs 0001–0006 Accepted with amendments; ADR 0007 added; architecture revision 2; four additional flaws found and fixed by adversarial self-review |
| 4 | Codex | Revision 2 final re-review | APPROVED AFTER ADDITIONAL REQUIRED FIXES; 14 PASS / 4 PARTIAL; A1-A4 PASS; E-1 acceptable with mitigation; Proposed ADR 0008 |
| 5 | Claude | **Final Phase 0 closure corrections** | V2-01–V2-05 accepted and resolved; ADR 0008 Accepted with amendments; addenda to ADRs 0001/0002/0003/0005/0007; E-1 and P-11 owner decisions recorded; frontend-first plan; revision 3 |
| 6 | Claude | **Phase 1: Frontend Foundation** | Next.js 16 app, design system, shell, mock-backed auth/search/research UIs, contracts; 122 unit + 110 e2e tests passing; mock exclusion verified |
| 7 | Codex | **Independent Phase 1 review** | APPROVED AFTER REQUIRED FIXES: 2 High, 5 Medium, 3 Low; reproduced tests/builds; no backend creep; Phase 2 remains unauthorized |
| 8 | Claude | **Phase 1 correction pass** | P1-01/P1-02 fixed with negative contract tests; P1-03, P1-04, P1-06–P1-10 fixed; P1-05 partial (rest is Phase 3); all gates pass |
| 10 | Claude | **Phase 2: Account & security frontend** | Login/logout/session-ended, registration and reset states, security settings, password/email change, sessions, staff enrollment/verification/step-up/recovery; member and staff DTOs; 242 unit + 168 Chromium e2e passing; Firefox/WebKit 95/96 (one load timeout, passes in isolation) |
| 9 | Codex | **Final Phase 1 closure check** | APPROVED FOR PHASE 2 AUTHORIZATION; required fixes verified; root check exit 0, 149 unit/component passes, focused E2E 25 passes/1 skip; Phase 2 NOT authorized |
| 11 | Codex | **Phase 2 initial review** | Three open findings: staff enrollment password discarded (High), staff reset lacks WebAuthn (High), login lacks human-verification challenge (Medium). Static review only; see review file. |
| 14 | Claude | **Phase 3: Research UI (projects)** | Owner-authorized. Project directory and profiles on mocks; P1-05 source labels; P1-03 transfer scenarios; Proposed ADRs 0009–0011 for the owner's out-of-scope requests (not implemented); contracts 70 + web 243 unit tests, Chromium E2E 212 passed / 2 skipped |
| 13 | Claude | **Phase 2 review corrections** | P2-01, P2-02 and P2-03 fixed within the approved design, with negative tests; contracts 60 + web 209 unit tests, Chromium E2E 172 passed / 2 skipped; Codex closure check requested |
| 12 | Codex | **GitHub repository setup** | Owner requested a public `blacklist` repository and push. Created `Skyboyyt/blacklist`, pushed `chore/initial-repository`, verified remote commit and enabled secret scanning/push protection. |

---

## Session 14: Claude Phase 3 — Research UI: project discovery and profiles (2026-10-12)

### Authorization and scope

- **Owner instruction (2026-10-12):** "Continue … with Phase 3. Phase 2 has passed review and testing." This authorizes Phase 3. **Phase 4 and backend work are not authorized**; none was done.
- **Conflicts between the brief and the approved architecture**, explained to the owner before coding. Owner decisions:

| Brief asked for | Approved rule | Owner decision | Result |
|---|---|---|---|
| Public 0–100 score on cards and detail | P-11: band + explanation only (PRD §5.14, ADR 0005, ESSENTIALS §17) | Change P-11 via ADR | **Proposed ADR 0009**; no number built. UI shows band, explanation, factors, confidence, as-of, dispute state |
| Project submission, verification statuses, rejection reasons, representative updates | V1 projects are staff-created; self-service verification is not V1 (PRD §4.1, §4.4, §5.16) | Documented scope + ADR | **Proposed ADR 0010** (private suggestions/updates in Phase 4; claim verification Post-V1). Directory and profiles built within the V1 model; contracts reject verification/submission fields |
| Solana + "supported EVM networks" | V1 = Solana + Ethereum (PRD §4.1) | Add Post-V1 EVM chains | **Proposed ADR 0011** (Base, Arbitrum, BNB, Polygon; per-chain Phase 8 gate). Ships Ethereum + Solana; selector reads `CHAIN_SLUGS` |
| Evidence uploads and appeals | Phase 4 (ARCHITECTURE §36); images only (ADR 0004) | Entry points only | Profile links to `/appeals/new` and `/reports/new` (sign-in first when signed out) |

- **Status distinctions in the V1 model:** "not assessed" (insufficient data; never 0, never reassuring), "assessment unavailable right now" (`null`; shown as neither not assessed nor low), "no published findings" (not "safe"). V1 has no public "rejected" state: rejected reports stay private (PRD §5.11). Appeal outcomes appear in history.

### Completed work

- **Contracts (`packages/contracts/src/project.ts`, new):** project slug, category (interim descriptive list), attribution basis, official address (with its own `assessment | null` and separate `disclosures`), official domain (hostname text only), response with standing, history events, freshness, detail, summary (no band or score), directory request (query, chain, category, findings status, sort, page) and response (`results`, `no_results`, `empty_directory`, `choose_network`, `invalid_query`, `provider_unavailable`). `common.ts`: `DisputeState` type and `publicSourceSchema`. `research.ts`: required `source` on chain facts and disclosures (P1-05).
- **API boundary:** `ResearchApi.listProjects` / `getProject`; the not-connected adapter rejects both (non-mock builds show no data).
- **Mock service:** `lib/api/mock/project-api.ts` holds pure, deterministic catalog logic: network-scoped address matching, name/domain text match, filters, sort, page size 6, and the card identifier on the selected network. `fixtures/projects.ts` has 14 fictional profiles covering findings, under appeal, suspended, no findings, no official addresses, not assessed, unavailable assessment, stale, partial, multi-network and a project response. Project-only address records are merged into address research so links resolve.
- **UI:** `/projects` (GET-form filters, cards, pagination, every state) and `/project/[slug]` (identity, limits notice, review and update dates, data status, official addresses with assessments and separate disclosures, domains, findings, responses, history, entry points). "Projects" nav item. Universal search offers a project-directory link for non-identifier queries. `components/projects/*`, `lib/projects/{copy,directory-params}.ts`.
- **Research refinements:**
  - **P1-05:** facts and disclosures render their source label.
  - **P1-03:** delegated-outgoing (victim) and spoofed-incoming-log fixtures, with tests.
- **ADRs:** 0009, 0010 and 0011, all **Proposed**, each with a Claude recommendation; ADR index updated.
- **Docs:**
  - frontend.md: new §7b, plus P1-05/P1-03 notes in §5.
  - ARCHITECTURE: `/projects` route and the `GET /projects` endpoint.
  - AGENTS §1 and README status lines.
  - Mock-exclusion markers for project fixtures.

### Files changed

New: `packages/contracts/src/project{,.test}.ts`; `apps/web/src/app/(public)/projects/page.tsx`, `apps/web/src/app/(public)/project/[slug]/{page,loading}.tsx`; `apps/web/src/components/projects/{project-filters,project-card,pagination,project-directory-results,project-detail-view,official-address-list,address-assessment-summary,project-actions}.tsx` and `projects.test.tsx`; `apps/web/src/lib/projects/{copy,directory-params,directory-params.test}.ts`; `apps/web/src/lib/api/mock/{project-api,project-api.test}.ts`, `fixtures/projects.ts`; `tests/e2e/specs/projects.spec.ts`; `docs/adr/0009–0011`.
Changed: contracts `common.ts`, `research.ts`, `index.ts`, `research.test.ts`; web `lib/api/{types,not-connected}.ts`, mock `research-api.ts`, `fixtures/{addresses,transactions,ids}.ts`; `components/research/{facts-list,disclosures-list}.tsx` and tests; `components/app/status-timeline.tsx` (accepts any entry with id/label/at/actor); `components/search/search-results.tsx`; `components/layout/nav-list.tsx`; `lib/nav/nav-items.ts`; `scripts/check-mock-exclusion.mjs`; `tests/e2e/specs/a11y-security.spec.ts`; docs listed above. **Migrations:** none. **Dependencies:** none.

### Validation (real exit codes, Node 24.21.0, pnpm 12.7.0)

| Check | Result |
|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0: contracts **70**, web **243** |
| `pnpm build` (production) | exit 0, 28 routes |
| `build:mock` | exit 0 |
| `check:mock-exclusion` (now includes project fixtures) | exit 0, 4/4 PASS |
| Chromium E2E, desktop + mobile (all specs, including Phase 1 and Phase 2 auth/account flows, new projects spec, axe light/dark on 5 new pages, 360 px overflow check) | **212 passed, 2 skipped** |
| Firefox / WebKit E2E | **Not run.** Those browsers are not installed in this cloud environment |

E2E ran on the image's preinstalled Chromium 1194 through a temporary config override, deleted before commit, because Playwright 1.63 expects build 1243. Layout was also checked visually from screenshots (desktop light, mobile dark).

### Mock-service boundaries and backend integration points (Phase 8)

- The UI depends only on `ResearchApi.listProjects(query)` and `getProject(slug)` and the contract schemas. A live adapter replaces `createProjectCatalog` contract-for-contract; `GET /projects` and `GET /projects/:slug` (ARCHITECTURE research endpoints) must return exactly these DTOs.
- The server must enforce what the mock only simulates:
  - network-scoped address matching, with `choose_network` and never a cross-chain match;
  - published-only findings and responses;
  - staff-only profile creation;
  - freshness computation;
  - per-address assessments from the risk module.
- The source label (P1-05) must come from sanitized registry data, never raw provider names, URLs or receipts.
- Mocks grant nothing. Entry-point links are not authorization.

### Known issues and unfinished work

- Proposed ADRs 0009–0011 await owner decisions. Nothing they describe is implemented.
- Project categories are an interim descriptive list for owner review.
- The project directory is not in the mobile bottom tab bar (it is in the menu); revisit in the Phase 6 quality pass.
- Firefox/WebKit not run here; cross-browser timing notes from Session 10 still apply.
- Phase 6 items unchanged (style-src-attr allowance, broader quality pass).

### Security check

- No public number (contract tests).
- Disclosures separate from factors (contract and component tests).
- Attributions are labelled as not proof of ownership.
- Domains are text only, never links.
- Untrusted text is rendered as text.
- No browser storage was added.
- Unknown networks are reported, not dropped.
- No private data in project DTOs: no report receipts, submitter identity or rejected items.

Threats considered: impersonation via names (identifiers first, name warning), false legitimacy (no verified/pending labels), cross-chain confusion (network-scoped matching).

### Recommended next step

1. Codex Phase 3 review, especially:
   - network scoping;
   - status distinctions;
   - the no-score and no-combined-rating rules;
   - P1-05/P1-03 closure.
2. Owner decisions on ADRs 0009–0011.
3. Phase 4 needs separate owner authorization.

---

## Session 13: Claude Phase 2 review corrections (2026-10-12)

- **Safety check:** the task is inside authorized Phase 2: findings on Phase 2 frontend code. No backend, no Phase 3 work, no new dependency, no architecture change (identity §6.3, §10.5 and §12 already require these behaviours). No ADR needed.
- **Completed (commit `596112b`, branch `claude/amazing-goodall-drtbc9`):** full responses are in [the Phase 2 review](docs/reviews/2026-10-12-phase-2-codex-review.md).
  - **P2-01:** `enrollmentPasswordRequestSchema` and `StaffSecurityApi.setEnrollmentPassword` send the chosen password to the bound enrollment flow. A new `enrollment_incomplete` account error blocks activation without a password and two authenticators. The mock tracks the flow state (whether a password was sent, never the value).
  - **P2-02:** `resetPasswordOutcomeSchema` (`passkey_required`, `passkey_not_verified`) and `AuthApi.resetPassword(token, form, { withPasskey })`. `ResetPasswordForm` adds a token-bound passkey step. Mock reset tokens starting `staff` need a passkey.
  - **P2-03:** `human_verification_required` login outcome and an optional opaque `humanVerification` on the login request. A provider-neutral `HumanVerifierClient` port and the `HumanVerification` component; the not-connected adapter fails closed. Mock email `challenge@example.test`.
- **Files changed:** contracts `auth.ts`, `account.ts`, `staff.ts` and tests; web `lib/api/{types,browser,not-connected,mock-disabled}.ts`, mock `auth-api.ts`, `account-api.ts`, `fixtures/ids.ts`, `index.ts` and tests; `components/auth/{login-form,reset-password-form,human-verification}.tsx` and tests; `components/security/staff-enrollment-flow.tsx` and tests; `lib/auth/account-error-copy.ts`; `tests/e2e/specs/auth.spec.ts`; `docs/design/frontend.md` (§7, §7a); the review file; this handoff. **Migrations:** none. **Dependencies:** none.
- **Tests and results (real exit codes, Node 24.21.0, pnpm 12.7.0):**
  - Baseline before changes: all checks exit 0; contracts 55 and web 187 tests.
  - After changes: `format:check`, `lint`, `typecheck`, `test` (contracts **60**, web **209**), `build` (27 routes), `build:mock` and `check:mock-exclusion` all exit 0.
  - Chromium E2E: **172 passed, 2 skipped**. It ran on the cloud image's preinstalled Chromium 1194 through a temporary config override, deleted before commit, because Playwright 1.63 expects build 1243.
  - Firefox and WebKit were **not** run.
- **Security check:** T-01, T-02, T-03, T-05, T-17 and T-18.
  - Passwords, reset tokens and verification responses never touch browser storage (tested). The reset password is held in component memory only between the two submissions.
  - Each new outcome keeps responses generic. The staff passkey step tells the holder of a valid reset link that the account is staff; that holder already controls the mailbox, and the §6.3 challenge endpoint exposes the same fact.
  - Mocks still grant nothing. The mock-exclusion check passes.
- **Decisions:** none architectural. Contract additions are recorded in the review file and frontend.md.
- **Deferred:**
  - Human-verification provider (O-6, owner). When chosen: the CSP `script-src`/`frame-src` allowance for its widget, and a live `HumanVerifierClient`.
  - Server enforcement of all three behaviours (Phase 7: S-gates, identity suites).
- **Known issues:** the cloud image's Playwright browsers do not match the pinned Playwright version, so E2E needs the override described above. This is not a repository issue.
- **Recommended next step:** a focused Codex closure check of P2-01 to P2-03, ideally including the Firefox/WebKit E2E run (`E2E_ALL_BROWSERS=1`). Phase 3 still needs separate owner authorization.

---

## Session 12: Codex GitHub repository setup (2026-10-12)

- **Owner instruction:** create a new public GitHub repository named `blacklist` and push the project. This authorizes a commit and push for this setup task. Phase 3 remains unauthorized.
- **Completed:** initialized local Git on `chore/initial-repository` and committed the initial 304-file snapshot as `9704983` (`Initialize Blacklist repository`). Updated README to describe Phase 2 accurately and replaced one historical local user path with a generic temporary-directory reference.
- **GitHub result:** browser authorization through Git Credential Manager completed. Created the public [Skyboyyt/blacklist](https://github.com/Skyboyyt/blacklist) repository and pushed `chore/initial-repository`. The remote ref matched local commit `1194358b1812f7cb53cbea2d1c0bb6fcf525ee01` after the handoff commit. GitHub reported the default branch as `chore/initial-repository`; no `main` branch was pushed. The connected GitHub app can read the repository, and GitHub REST reported `secret_scanning=enabled` and `secret_scanning_push_protection=enabled`.
- **Files changed:** README.md, docs/reviews/2026-10-05-phase-1-codex-review.md and this handoff; local `.git` created. **Migrations/dependencies/production code:** none.
- **Tests and results:** 304 staged paths inspected; ignored `.env`, `node_modules`, `.next` and TypeScript build info confirmed; high-confidence secret-pattern and long assignment-value searches over staged content returned no matches; `.env.example` contains placeholders. `git diff --cached --check` identified only three existing blank lines at EOF in ADR files. No product tests, lint, typecheck or build run (Node 24/pnpm unavailable).
- **Security concerns:** repository is public; no real credentials were identified in the staged snapshot. GitHub secret scanning and push protection were verified enabled. No token value was printed or stored in project files.
- **Decisions:** public visibility per owner; initial branch is `chore/initial-repository`, honoring the no-direct-push-to-`main` rule. Local Git author uses the connected account's GitHub noreply identity. No architecture decision changed.
- **Unfinished/recommended next step:** Phase 2 review findings P2-01 through P2-03 remain open; Claude should respond to and correct them, then request a Codex closure check. Phase 3 still needs separate owner authorization. The repository has no `main` branch; any future default-branch change or merge should follow the owner's Git rules.

---

## Session 11: Codex Phase 2 initial review (2026-10-12)

- **Completed:** inspected the approved phase/design/security documents, Phase 2 auth and account components, contracts, mock adapters and relevant tests. Recorded P2-01 through P2-03 in [the Phase 2 review](docs/reviews/2026-10-12-phase-2-codex-review.md). Phase 2 review remains open; Phase 3 remains unauthorized.
- **Current work:** primary engineer response and corrections to the three findings, then a focused Codex closure check.
- **Files changed:** this handoff and the Phase 2 review file. **Migrations/dependencies/production code:** none.
- **Tests and results:** no tests, lint, typecheck or build run. The available Node is 26.8.1 and `pnpm` is unavailable; the approved baseline is Node 24 and pnpm 12.7.0. Static inspection only. Git status/diff could not run because the folder has no `.git` directory.
- **Security concerns:** P2-01 affects staff credential creation (T-17/T-18); P2-02 affects staff reset (T-01/T-05/T-17); P2-03 affects login abuse handling (T-02/T-03). No deployed bypass is claimed because no backend exists. No secret values were read or printed.
- **Decisions:** none; existing architecture remains in force. **Deferred decisions:** human-verification provider choice remains with the owner; a provider-neutral UI contract can be corrected within Phase 2.
- **Recommended next step:** Claude fixes or responds to P2-01 through P2-03, obtains Node 24/pnpm 12.7.0 verification results, and requests a focused Codex re-review before Phase 2 closure. The owner must separately authorize Phase 3.

---

## Session 10: Claude Phase 2 — Frontend Account, Authentication & Security (2026-10-05/06)

### Safety check

Codex closed Phase 1 (Session 9) with no remaining blocker, and the owner explicitly authorized Phase 2. Backend work remains unauthorized; none was done.

### Routes (new or changed)

| Route | Purpose |
|---|---|
| `/login` (changed) | Temporarily unavailable state; calm banner for `reason=session_expired` and `reason=staff_verification_expired`; generic credential error unchanged |
| `/register`, `/register/complete`, `/forgot-password`, `/reset-password`, `/email-change/confirm` (changed) | Superseded-link and temporarily-unavailable states. Reset success explains that all sessions end and email change pauses for 72 hours. Live length count and Caps Lock hint on new passwords |
| `/settings/security` (rebuilt) | Overview: password, email, sessions, recovery, recent activity, staff link, sign out |
| `/settings/security/password` (new) | Password change |
| `/settings/security/email` (new) | Email change initiation (cooling block, re-authentication, generic pending state) |
| `/settings/security/sessions` (new) | Session list, revoke one, revoke all others |
| `/settings/security/staff` (new) | Staff authenticators, deficit banner, step-up removal (staff viewers only; presentation) |
| `/staff/enroll` (new) | Invitation link + out-of-band code → password → two authenticators → activation |
| `/staff/verify` (rebuilt) | Passkey verification with every outcome state |
| `/staff/recovery` (new) | Recovery process explanation and own case progress |
| `(app)` layout (changed) | Shows the session-ended panel when the viewer reports an ended session |

### Components and logic

- **`components/security/`** (`.tsx`):
  - SecurityOverview, PasswordChangeForm, EmailChangeFlow / EmailChangePanel, SessionManager / SessionList;
  - SecurityActivity, SecurityBanner, CoolingPeriodNotice, SessionExpiredPanel, AccountSecurityLoader;
  - ReauthDialog, StepUpDialog, PasskeyPrompt;
  - StaffVerify, StaffEnrollmentFlow / EnrollmentSteps, StaffSecurityPanel, RecoveryProgress, StaffRecoveryInfo, LogoutButton.
- **Other components:** `components/app/confirm-dialog.tsx`, `components/layout/settings-section.tsx`, `mock-preview-controls.tsx` and `style-nonce.tsx`.
- **Updated components:** PasswordInput (Caps Lock hint, requirement count), DataCard (always a named region), Dialog (focus returns to the opener).
- **Logic (`.ts`):**
  - `lib/auth/account-error-copy.ts` and `password-copy.ts`;
  - `lib/security/use-passkey-ceremony.ts`, `use-account-security.ts` and `security-event-copy.ts`;
  - `lib/security/csp.ts`: no-store scope and loopback handling.

### Contracts

- **`account.ts` (member-private):**
  - typed account errors;
  - sessions: opaque handle, coarse device summary and times; no tokens, IPs or locations;
  - security events, cooling period, account security overview;
  - re-authentication, password change and email change requests.
- **`staff.ts` (staff-only, narrow):**
  - authenticators: no credential IDs or keys;
  - staff security overview, passkey results, enrollment start and results;
  - own recovery status: no reviewer identities;
  - no moderation or case data.
- **`auth.ts`:** `superseded` link state, `temporarily_unavailable` outcomes and a shared `emailOnlyRequestSchema`. **`session.ts`:** an anonymous viewer may carry `reason` (session or staff verification expired).
- **`zod.ts`:** a single Zod entry that sets **jitless** mode, so no eval is needed under the CSP. `sideEffects` now declares it.
- **Unchanged:** public research contracts; P1-01 and P1-02 tests still pass.

### Mock services

- **Adapters:** `AccountApi` and `StaffSecurityApi` interfaces (`lib/api/types.ts`), each with a not-connected adapter and a mock adapter.
- **Mock store:** all mock behaviour is centralised in `lib/api/mock/account-api.ts`, an injectable store covering:
  - the 10-minute re-authentication window and 72-hour cooling period;
  - a uniform email-change answer and current-session protection;
  - the enrollment code and passkey results.
- **Preview controls:** the demo banner sets the viewer, the scenario (normal, cooling_period, session_expired, staff_recovery) and the passkey result.
- **Fixtures:** fictional (`fixtures/account.ts`) and covered by the exclusion check.

### Dependencies

- **Added:** `get-nonce@1.0.1`, a direct pin of an existing Radix transitive dependency, used to give runtime `<style>` elements the CSP nonce. It has no dependencies and no install scripts, and passed the release-age and trust policies.
- **Also installed:** Playwright's Firefox and WebKit browsers.
- **Not installed:** none of the other deferred libraries.

### Security decisions

1. **Narrower production CSP for styles:** `style-src 'self' 'nonce-…'`, with `style-src-attr 'unsafe-inline'` (attributes only). Development is unchanged. Removing the attribute allowance remains Phase 6.
2. **No eval:** Zod is jitless, and `apps/web` may import Zod types only (lint rule).
3. **`upgrade-insecure-requests` omitted for loopback hosts:** WebKit applied it to `http://localhost` and broke local runs. Real hosts keep it, and HSTS applies.
4. **`Cache-Control: no-store`** on all account, auth, staff and private prefixes, including prefetches.
5. **No terms checkbox at registration:** terms are a pending legal decision.
6. **Member MFA** (post-V1) is not presented as available.
7. **No break-glass control** exists anywhere in the UI.

### Verification (real exit codes, Node 24.21.0, final run)

| Check | Result |
|---|---|
| `pnpm format:check` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0: contracts **55**, web **187** |
| `next build` (production) | exit 0, 27 routes |
| `build:mock` | exit 0 |
| `check:mock-exclusion` (now also scans account fixtures) | exit 0, 4/4 PASS |
| Playwright Chromium desktop + mobile | **exit 0: 168 passed, 2 skipped** (viewport-specific) |
| Playwright Firefox + WebKit + WebKit mobile (auth + account specs, `E2E_ALL_BROWSERS=1`, 2 workers) | **exit 1: 95 passed, 1 failed.** The failure was the Firefox token-page test hitting a 90 s page-load timeout. Re-run alone it passed **3/3** (12–15 s each). Classified as load-induced on this machine, not a product defect |

**Failures found and fixed during this session (not hidden):**

- **Real bugs:**
  - Focus did not return to the opener after a programmatically opened dialog; fixed in `DialogContent`.
  - Titled DataCards were not named regions; fixed.
  - WebKit loaded no assets because of `upgrade-insecure-requests` on localhost; fixed.
  - Firefox reported a CSP eval violation from Zod's JIT probe; fixed with jitless mode in a shared entry module.
  - WebKit-mobile dark contrast was intermittently measured against white, because `<html>` had no background; fixed. This also fixes iOS overscroll.
- **Test-side issues:**
  - ambiguous selectors;
  - jsdom Caps Lock event construction;
  - copy assertions updated to the new reset wording;
  - keyboard-based focus test, because WebKit does not focus buttons on click;
  - a `settle()` helper so axe audits a fully rendered page.

**Not run:** gitleaks, manual screen-reader testing, real-device iOS/Android, coverage.

### Known issues

- **Cross-browser timing:** Firefox and WebKit are slow on this machine under parallel workers. Their projects use 90 s test and 15 s assertion timeouts; run them with one worker in CI.
- **Mock state:** account state lives in memory for the page session, so a full reload resets it.
- **Staff enrollment password:** validated and discarded in the preview. The future API receives it in the bound enrollment flow.

### Deferred

- **Phase 3:** P1-05 per-fact sources; P1-03 wider transfer scenarios.
- **Phase 6:** remove the `style-src-attr` allowance; broader quality and accessibility pass.
- **Pre-launch:** manual screen reader, real devices, gitleaks.
- **Phase 7:** all real enforcement: sessions, re-authentication, cooling, WebAuthn, rate limits, Origin checks.

### Recommended Phase 3 (frontend only; not authorized)

**Research UI:**
- per-fact public source and as-of references (P1-05);
- evidence-level-aware transfer wording for delegated, malicious-log and victim cases (P1-03);
- project and finding pages (`/project/[slug]`, `/finding/[id]`);
- research pagination and empty or partial data states;
- token detail and disclosures depth.

**Phase 3 requires explicit owner authorization.**

---

## Session 9: Codex final Phase 1 closure check (2026-10-05)

**APPROVED FOR PHASE 2 AUTHORIZATION.** Detailed closure evidence and finding dispositions are appended to [the Phase 1 review](docs/reviews/2026-10-05-phase-1-codex-review.md). Claude remains primary engineer. **Phase 2 remains NOT authorized.**

### Verified outcome

- P1-01 and P1-02 closed: capabilities are neutral, zero-contribution disclosures, not eligible factors; public contracts structurally reject private/unreviewed/AI/numeric payloads; report receipt belongs to member-private `member.ts`.
- Corrected fixtures passed: capability-only contract Low with no factors; Solana Moderate solely on approved impersonation factor; unsupported drainer-pattern analysis removed.
- Provenance vocabulary remains distinct from publication permission.
- Transfer source wording, explicit network selection, registration privacy, multi-route appeal standing, ordinary/prefetch document security headers and mock exclusion passed.
- P1-03 current wording, P1-04, P1-06–P1-10 closed. P1-05 source attribution remains accepted non-blocking Phase 3 work; fact observation times now render.
- Root unit/component and separate E2E scripts now have truthful independently verified exit statuses. Session 8's correction of the original Session 6 root-test failure is acknowledged; no architecture issue remains.

### Actual verification

Used existing **Node 24.21.0**. No dependency installation or pnpm-policy change.

| Check | Result |
|---|---|
| Root `pnpm check` | **Exit 0**: format, lint, typecheck, unit/component tests, production build; no e2e invocation |
| Unit/component tests | **149 passed**: contracts 36 / 2 files / 2.68 s; web 113 / 16 files / 113.68 s |
| Production build | Pass, 21 routes, mock mode unset |
| Mock build | Exit 0, 21 routes |
| Mock exclusion + additional fixture-canary scan | Pass; production fixture markers absent, mock positive control present; no checked server-only names in browser bundles |
| Focused root E2E, isolated `--workers=1` | **Exit 0: 25 passed, 1 intentional viewport skip**, 1.6 min; desktop/mobile Chromium |
| Independent contract probes | All eight disclosures rejected as factors; private/AI/numeric/public-member boundaries passed |
| Token/header/browser probes | Twelve normal/prefetch combinations across three token pages passed; unsigned parser scripts blocked in both normal and prefetch HTML |
| Production HTTP smoke | No fictional findings/markers on home or research search; disconnected stub preserved |

**Failures are recorded:** Initial focused E2E with two workers ran concurrently with the root check and a browser probe; two tests timed out setting up `page`, before assertions. Interrupted with exit 1, then the unchanged selection passed after other work finished, with one worker and original timeouts. No failure was filtered from the closure report. A temporary Fetch-probe `status()` typo was corrected outside the repository and the helper rerun passed.

The full **118 pass / 2 skip** correction-suite count is Claude-reported; Codex reran the relevant subset. Not run: Firefox/WebKit, manual screen reader, gitleaks, coverage. Backend acceptance gates remain future work. Prettier passes its configured scope (Markdown excluded). Verification servers were stopped.

### Remaining work / files changed

- Blockers: **none for Phase 1 closure**.
- Phase 3: bounded per-fact source references; wider delegated/malicious-log/victim scenarios, before real research integration.
- Phase 6: inline-style CSP tightening.
- Pre-launch: Firefox/WebKit, manual screen reader and gitleaks; retain quality-phase coverage/human visual review.
- Changed only the Phase 1 review document and `AI_HANDOFF.md`; no migrations, runtime feature edits, deployments or services created.
- **Recommended next step: Owner explicitly authorizes Phase 2 — Frontend Account & Security Flows.** This review does not grant that authorization, and no Phase 2 work began.

---

## Session 8: Claude Phase 1 correction pass (2026-10-05)

Responds to [docs/reviews/2026-10-05-phase-1-codex-review.md](docs/reviews/2026-10-05-phase-1-codex-review.md) (responses recorded there). **Phase 2 remains unauthorized.** No backend work, no new dependency, no pnpm policy change.

### High findings

| Finding | Resolution |
|---|---|
| **P1-01** capability facts shown as risk factors | Separate public `disclosures` collection (closed code set: mint/freeze authority, permanent delegate, transfer hook/fee, upgradeable proxy, pause authority, unverified source; no weight or contribution field). `riskFactorSchema` admits only the closed V1 factor codes of ARCHITECTURE §15.3, each bound to its provenance. Fixtures: the pause/upgrade/unverified contract is now **Low** with disclosures and no factors; the Solana lookalike is Moderate on `token.symbol_impersonation` only, with mint authority a disclosure; the unapproved "drainer pattern" factor was removed. UI: a neutral Disclosures section ("No effect on the assessment"); methodology section added |
| **P1-02** public contracts admitted private/unreviewed/AI data | Public findings accept only `moderator_finding`; factors only the V1 codes (`moderator_finding`/`platform_analysis`); the public timeline has no report, queue or draft events and no `community` actor. Report receipt moved to member-private `packages/contracts/src/member.ts` (`submittedAt`), shown only on the member's Reports page. All six provenance labels kept for legends and private/future views |

### Medium and low findings

- **P1-03:** authorization wording is relative to the sending side; counterparties labelled Sender/Recipient; neutral, evidence-aware movement wording ("A log reports …" for unvalidated logs).
- **P1-04:** the proxy now runs for prefetch-marked requests too; CSP and token headers no longer depend on request metadata.
- **P1-05 (partial):** facts show their own observation time; copy no longer promises per-fact source or publisher attribution. Bounded source references remain Phase 3.
- **P1-06:** an explicit network is honoured (mismatch → "not a valid <network> …"; unknown `chain` → "Network not supported").
- **P1-07:** the handle is described as visible to the user and staff only; appeal copy lists all standing routes (moderation §6.2), including documentary standing for people who cannot sign today.
- **P1-08:** the AGENTS.md stage was updated.
- **P1-09:** Prettier was applied; `format:check` passes and is now part of `pnpm check`.
- **P1-10:** the mobile menu test asserts Tab and Shift+Tab containment.

### Tests added

- **Contracts (36, previously 20):**
  - no disclosure code is a factor code;
  - each capability is rejected as a factor and accepted as a zero-field disclosure;
  - factor provenance is bound to its code;
  - report-receipt, pending, draft and queue events are rejected;
  - allegation, AI, external and analysis findings are rejected;
  - AI and allegation factors are rejected;
  - pending counts, reporter metadata, moderation queues, AI assessments, allegations and member reports on the public object are rejected;
  - numeric score is rejected;
  - member-private reports are accepted.
- **Web (113, previously 102):**
  - DisclosuresList is neutral and accessible;
  - fixture semantics: zero-factor disclosures, Moderate only on an approved factor, no capability wording in explanations;
  - the assessment panel never shows disclosures;
  - fixtures contain only published findings and public events;
  - explicit network honoured;
  - incoming-transfer and log wording.
- **E2E (118 passed, previously 110):**
  - disclosures shown neutrally and the band stays Low;
  - explicit network;
  - no report-receipt activity;
  - prefetch-marked requests keep CSP, no-referrer and no-store;
  - focus containment.

### Verification (real results, Node 24.21.0)

| Check | Result |
|---|---|
| `pnpm format:check` | Pass |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` | Pass, **exit 0**: contracts 36, web 113 |
| `next build` (production) | Pass, 21 routes |
| `build:mock` | Pass |
| `check:mock-exclusion` | Pass (no fixture markers in production; marker present in mock; no server-only names in browser bundles) |
| Playwright (desktop + mobile Chromium, mock build) | **118 passed, 2 skipped** (viewport-specific), 0 failed |

**Correction to Session 6:** the root `pnpm test` then also ran the e2e package's `playwright test` script, which cannot run without its server. The command therefore exited non-zero, even though both unit-test suites passed. Session 6 reported the suite counts but not this exit code. Fixed by renaming the e2e package script to `e2e` (`pnpm test:e2e` still runs it).

**Not run:** gitleaks, Firefox/WebKit, manual screen-reader testing, coverage (unchanged from the review's not-run list).

### Remaining non-blocking items

- **P1-05 (Phase 3):** per-fact public source references.
- **P1-03 (Phase 3):** broader scenarios (delegated, malicious-log, victim).
- **Phase 6:** style-src tightening.
- **Pre-launch:** Firefox/WebKit, screen-reader and gitleaks.

### Recommended next step

A focused **Codex Phase 1 closure check** of P1-01 and P1-02, plus the network-selection, privacy-copy and header fixes. **Phase 2 is not authorized** and must not start without explicit owner authorization.

---

## Session 7: Codex Phase 1 review (2026-10-05)

### Outcome

**APPROVED AFTER REQUIRED FIXES.** Detailed findings and requested verdicts: [Phase 1 review](docs/reviews/2026-10-05-phase-1-codex-review.md). Claude remains primary engineer. No application code, contracts, fixtures, dependency declarations, architecture, migrations or infrastructure were modified. No Phase 2 work was started or authorized.

### Required corrections before Phase 2

1. **P1-01 (High):** Mock assessments wrongly present pause/upgrade authority, unverified source and mint authority as weighted risk factors. Restore zero-contribution disclosures and add semantic fixture tests.
2. **P1-02 (High):** Public research contracts permit report-receipt events and unreviewed/AI public findings or risk factors. Separate private report history and restrict V1 public eligible sources; add negative tests.

These restore accepted policy; no redesign or new ADR is proposed. No real user data exists or leaked. Claude's finding responses are pending.

### Non-blocking follow-up

- **Phase 2:** P1-04, preserve CSP/token-document headers on prefetch-marked full HTML; P1-07, fix registration's incorrect public-reporter-handle promise; P1-10, verify dialog Tab/Shift+Tab containment. Finish account/security UI with mock interfaces only.
- **Phase 3:** P1-03, identify transfer source authorization without claiming recipient signatures or treating arbitrary logs as confirmed movement; P1-05, source/as-of attribution; P1-06, honor explicit search chain.
- **Phase 4:** P1-07 appeal eligibility copy must include approved documentary/victim/representative paths, not require present wallet control.
- **Low:** P1-08 stale AGENTS current-stage note; P1-09 formatting in 93 files. Phase 6 retains broader browser/accessibility review and style-CSP cleanup.

### Verification (actual results)

Used the existing **Node 24.21.0** runtime; default Node 26 was not used for project checks. No production dependencies installed.

| Check | Result |
|---|---|
| ESLint | Exit 0, no problems |
| Type checks | core, contracts, contracts tests, web: no diagnostics |
| Contracts Vitest | 20 passed / 2 files / 5.22 s |
| Web Vitest | 102 passed / 15 files / 190.47 s, no retries; setup dominated time |
| Production build (mock mode unset) | Exit 0; 21 routes |
| Mock build reproduction | Exit 0; 21 routes |
| Mock exclusion | Exit 0; production markers absent, mock positive control present, checked server-only names absent in browser bundles |
| Playwright (existing mock build, desktop/mobile Chromium) | **110 passed, 2 viewport-specific skips**, 5.5 min, no retries |
| Independent browser probes | No sampled overflow at 390/768/1440 px; tokens stripped with no request/storage leakage; redirects stayed same-origin; malformed pathname 400/no stack |
| CSP probe | Normal document blocked parser-inserted unsigned script; prefetch-marked full HTML omitted CSP (P1-04). No existing injection exploit established |
| Production browser | No demo fixtures/banner; research correctly unavailable rather than fabricated |
| pnpm audit --prod | Exit 0; no reported advisories (154 production/optional dependency records) |
| Prettier --check . | Exit 1; 93 formatting warnings; no formatting applied |

Screenshots visually inspected by Codex; no human design sign-off. **Not run:** gitleaks (unavailable), Firefox/WebKit, manual screen-reader testing, coverage. Not a Git repository, so no commit/diff baseline. Temporary probes/screenshots are outside the workspace; local verification servers were stopped. Backend gates and real authentication/security enforcement were not tested or satisfied by mocks.

### Files changed / migrations / unfinished work

- Changed only `docs/reviews/2026-10-05-phase-1-codex-review.md` and `AI_HANDOFF.md`.
- Migrations: none. Production services/deployments: none.
- Unfinished: Claude corrects P1-01/P1-02 and records responses; Codex performs focused re-review.
- Recommended next step: resolve the two High findings within Phase 1, then seek **separate owner authorization** for Phase 2 account/security frontend. **Phase 2 is NOT authorized.**

---

## Session 6: Claude Phase 1 — Frontend Foundation (2026-10-05)

### Safety check

The only open High items (re-review findings V2-01 and V2-02) carry closure responses. No Critical/High Phase 0 blocker remained, and the owner explicitly authorized Phase 1.

### Delivered

| Area | Result | Where |
|---|---|---|
| Toolchain | Next.js 16.3.6 (Turbopack), React 19.3.0, TypeScript 6.0.3, Tailwind 4.3.3, Radix (dialog, tabs, tooltip), Zod 4.6.5, Vitest 5, Playwright 1.63. pnpm 12.7.0 on Node 24.21.0. All versions exact and at least 7 days old; no install scripts | package manifests, docs/dependency-policy.md §2.1 |
| Contracts | Auth requests and outcomes (15–128 code points, ≤ 512 bytes, NFKC), search, public research DTOs (strict: a numeric score is rejected), viewer, dashboard | packages/contracts/src |
| API boundary | ResearchApi / AuthApi interfaces → mock adapter or a "not connected" adapter. The mock is reachable only via the blacklist-mock-api alias (a stub in non-mock builds) plus a literal env guard | apps/web/src/lib/api, next.config.ts |
| Design system | Semantic tokens; light/dark/system without a flash (pre-paint script with the CSP nonce); monospace identifiers; reduced motion; primitives and app components | src/styles/globals.css, src/components, docs/design/frontend.md |
| Shell | Desktop sidebar + header; mobile menu sheet + bottom tab bar; skip link; staff section structural only | src/components/layout |
| Pages | Home (research-first), search (all states, including "Address detected — choose network"), address and transaction research, methodology, dashboard, reports, appeals, settings, staff shells, login, register (email-first), register/complete, forgot/reset password, email-change confirm, staff verify | src/app |
| Security | Nonce CSP + baseline headers. Token pages: fragment token stripped, sent only by POST, no-referrer + no-store. Safe next redirect; generic auth errors; dangerouslySetInnerHTML lint-banned; package-boundary and mock-import lint rules; 400 for malformed URLs | src/proxy.ts, src/lib/security, src/lib/auth, eslint.config.js |

### Verification (real results, Node 24.21.0)

| Check | Result |
|---|---|
| pnpm lint | Pass (0 problems) |
| pnpm typecheck | Pass (core, contracts including tests, web) |
| pnpm test | **122 passed** (contracts 20, web 102; includes axe-core checks on key components) |
| next build (production, no mock) | Pass, 21 routes |
| build:mock | Pass |
| check:mock-exclusion | Pass: no fixture markers in the production build; marker present in the mock build; no server-only names in browser bundles |
| Playwright (mock build, desktop + mobile Chromium) | **110 passed, 2 skipped** (viewport-specific). Includes axe WCAG 2.2 AA on 14 pages in light and dark, no-flash theme, no console/CSP errors, reduced motion, auth flows, staff boundary |

**Not run:** prettier --check (formatting not yet enforced), gitleaks (binary not installed), Firefox/WebKit, real screen-reader testing, coverage. Visual review was automated only (no human design review).

### Decisions and deviations (for review)

1. **.ts import specifiers** in packages/* with allowImportingTsExtensions. Turbopack could not resolve ./x.js to .ts inside workspace packages, and this also matches Node 24 type stripping.
2. **pnpm override semver@^6 → 7.7.4** (dev-only Babel path), because trustPolicy no-downgrade flagged semver 6.3.1. No policy setting was relaxed.
3. **ESLint 9.39.5** (npm marks it deprecated): eslint-plugin-jsx-a11y does not support ESLint 10 yet.
4. **style-src 'unsafe-inline'** in the CSP (Radix's scroll lock injects styles). Scripts remain nonce + strict-dynamic. Tighten in Phase 6.
5. **Deferred planned dependencies:** TanStack Query, React Hook Form (forms are small, and the contract schemas validate directly), web fonts, an icon library, next-themes.
6. **Interim handle rule** (3–30 characters, a-z, 0-9 and underscore). The identity design does not fix one; the API decides.
7. **"Choose network"** is triggered in V1 by 40 hex characters without 0x that are also valid base58 (Ethereum vs Solana). It generalizes when more EVM chains are added.
8. **Vitest testTimeout raised to 20 s:** jsdom + user-event typing timed out under parallel load on this machine. No assertion was weakened.
9. A mock-search bug (infinite recursion for ambiguous input with chain=solana) was found by e2e and fixed, with a regression test.

### Known limitations

- Staff pages, reports, appeals and settings are honest placeholders ("not available in this preview").
- The mock viewer switcher exists only in mock builds and grants nothing.
- EIP-55 checksums are not computed (display is lowercase); checksum validation belongs to the API and chains package.
- Error-boundary digests are opaque; there is no client error reporting yet (O-5 pending).

### Recommended next step

Codex review of Phase 1, then owner authorization of **Phase 2 (Auth UI)**. **Phase 2 is not authorized.**

---

## Session 5: Claude final Phase 0 closure corrections (2026-10-04/05)

### Completed

| Item | Resolution | Where |
|---|---|---|
| **V2-01** Reset email errors swallowed by Better Auth | Password-reset tokens are **Blacklist-owned**; Better Auth reset endpoints are unused. Delivery layer outcomes: `accepted_for_delivery` / `retryable_failure` / `permanent_failure` (timeout = retryable). A token is redeemable only after acceptance and is invalidated before retry; each retry issues a new generation; jobs carry identifiers only | identity §6.2, §8 |
| **Reset retries / serialization** | Per-account lock (`account_security_state FOR UPDATE`); at most one open reset token per account (partial unique); generation checks; behaviour defined for crash, duplicate, delayed, timeout and DLQ cases | identity §8.3–§8.4, §6.5 |
| **V2-02** Non-atomic reset | One transaction: credential replaced, token consumed, all sessions deleted, cooling started, `security_version` bumped, audit appended, notice enqueued. Every request rejects stale-version sessions. Password and email change use the same shape | identity §5.4, §6.3, §6.4, §7 |
| **V2-03** Solana different-slot agreement | Identical context slot required; different slots are inconclusive even with equal values; no same-slot pair → `unavailable`, no scoring signal. Receipts extended. EVM block-level balance deltas no longer upgrade transfers | chain-data §2.2, §5; `packages/chains/src/types.ts` |
| **V2-04** Approver vs publisher | Author and approver are the only human roles; publication is a **system transition** caused by approval (`finding_publication_events`, actor `system`); event model defined | moderation §1, §4, §5.1, §7.1; data model |
| **V2-05** Frontend-first | Phases 1–6 frontend (foundation, auth UI, research UI, reporting UI, staff UI, quality pass); Phase 7 Backend Foundation, starting with D1–D9 and S1–S17; 8–11 backend and launch. Typed mock client confers no authority; narrow spikes only with owner authorization | ARCHITECTURE §36; ESSENTIALS; testing §9, §13; ADR 0007 addendum; AGENTS; READMEs |
| **E-1** (owner: accepted with mitigation) | Mandatory mitigations M1–M10 (no bearer/JWT/conversion plugins, no mounted routes, no raw-token authentication or conversion wrappers, secret outside DB and backups, no token fields in DTOs, immediate revocation, regression tests, rehearsed rotation, re-evaluate before upgrades). DB + secret compromise documented as account-session compromise | identity §5.5; THREAT invariant 4; S17; ADR 0001 addendum |
| **P-11** (owner) | V1 public risk = band + explanation (+ factors, confidence, coverage, freshness, dispute state). No public numeric score | ARCHITECTURE §15.1, §15.6; PRD §5.14, §10; ADR 0005 addendum |
| V1 risk simplification | Active V1 formula is strong-evidence-only; the weak-signal policy is documented as inactive and deferred | ARCHITECTURE §15.2; ESSENTIALS §10; THREAT invariant 9 |
| Staff assurance wording | Two registered passkeys ≠ two independent devices; flag + CLI are technical controls, two-person only under a procedural control (new owner decision **P-13**) | identity §10.1, §10.13; ARCHITECTURE §9.4; PRD P-13 |
| Non-blocking items | Uniform-work email change + mandatory enumeration test; stale testing README fixed; receipt comments aligned; purge wording no longer overstates two-person control | identity §7; testing §4.3; packages/testing README |
| Reviews / ADRs | V2-01–V2-05 responses and a closure section added to the re-review (Codex text preserved). ADR 0008 Accepted with amendments; addenda to 0001, 0002, 0003, 0005 and 0007 (history preserved); index updated with a phase-number mapping | docs/reviews, docs/adr |

### Files changed

`docs/design/identity.md` (rewritten, rev 3), `docs/design/moderation.md`, `docs/design/chain-data.md`, `ARCHITECTURE.md` (rev 3; D-046–D-052; §36 phase plan; §37.3), `ARCHITECTURE-ESSENTIALS.md`, `THREAT-MODEL.md` (rev 3; 21 invariants), `PRD.md` (rev 3; P-11 decided, P-13 added), `docs/data-model.md` (rev 3), `docs/testing-strategy.md` (rev 3; §13 frontend testing), `docs/dependency-policy.md`, `docs/adr/0001`, `0002`, `0003`, `0005`, `0007`, `0008`, `docs/adr/README.md`, `docs/reviews/2026-10-04-phase-0-codex-rereview.md`, `docs/reviews/2026-10-04-phase-0-codex-review.md` (anchor links only), `AGENTS.md`, `CLAUDE.md`, `README.md`, `.env.example`, `apps/{web,api,worker,evidence-processor}/README.md`, `packages/{chains,config,contracts,db,testing}/README.md`, `packages/chains/src/types.ts` and `ports.ts` (comments and receipt fields), `infrastructure/README.md`, `tests/e2e/README.md`, this handoff.

### Migrations, dependencies, tests

None created or installed. No frontend, backend, migration, provider or email integration work. Not a git repository.

### Verification performed (real results)

| Check | Result |
|---|---|
| Stale-statement sweep (reset-email throwing, reset retries/atomicity, Solana different-slot agreement, human publisher, backend-first Phase 1, numeric public score, weak V1 scoring, staff device independence, bearer usage, S1–S15, old phase numbers) | All remaining hits are in "not used / forbidden / deferred / historical" contexts; the stale ones were fixed (.env.example phase label, O-1 row, threat-model reviewer line, T-31 formula, two overstated two-person claims) |
| Link + anchor checker | 241 relative links, 0 broken (5 renamed anchors updated) |
| TypeScript **6.0.3** check of `packages/core` and revised `packages/chains` under checksum-verified Node **24.21.0** (scratch copy with `@types/node` 24.x) | Both pass; repository files byte-identical to the checked copies |
| Secret-pattern scan | No matches |
| Workspace state | 70 files; no `node_modules`, no lockfile |

**Not run:** gitleaks, lint, runtime or integration tests, S1–S17, D1–D9 (Phase 7 gates).

### Final self-review answers

1. Reset email failure reaches retry logic: yes, through the delivery layer's own outcome, not a library callback.
2. Only one reset token can be valid: yes; partial unique index, lock, generation check, redeemable only when `active`.
3. Reset cannot partially complete: one transaction.
4. Sessions are revoked inside it, and stale-version sessions are rejected anyway.
5. Cooling begins inside the same transaction.
6. Solana different slots are never "agree".
7. and 8. Author, independent approver and system publication are defined, with an event model.
9. Frontend-first is reflected in ARCHITECTURE, ESSENTIALS, AGENTS, CLAUDE, README, testing, ADRs and READMEs.
10. Backend gates are retained in Phase 7.
11. E-1 mitigations are documented as invariants with tests.
12. Public risk shows band + explanation only.
13. Weak scoring is marked inactive.
14. No Phase 1 implementation was performed.

### Owner decisions still needed

- Ratify amended ADRs 0001–0008.
- **P-12** staffing for independence.
- **P-13** break-glass procedural control.
- P-3, P-7, P-9, P-10; legal counsel (pre-launch blocker); O-3–O-7, O-12, O-13.
- Repository creation, licence and CODEOWNERS.
- Install Node 24 on the development machine.

### Recommended next step

**One final, focused Codex closure check** of V2-01–V2-05 and the owner decisions as written. Then owner ratification of Phase 0 and a **separate, explicit** authorization of Phase 1 (Frontend Foundation). **Phase 1 is not authorized.**

---

## Session 4: Codex Revision 2 final re-review (2026-10-04)

- **Verdict:** APPROVED AFTER ADDITIONAL REQUIRED FIXES. [Full review](docs/reviews/2026-10-04-phase-0-codex-rereview.md); original review appended with cross-reference. Claude remains primary. Phase 1 remains **UNAUTHORIZED**.
- **Statuses:** fourteen R findings PASS; R-02/R-03/R-05/R-07 PARTIAL. A1-A4 PASS at the design level, not runtime certification. Original R-01 activation vulnerability is resolved.
- **E-1:** ACCEPTABLE WITH MITIGATION. Exact Better Auth 1.7.6 signed-cookie lookup rejects unsigned tokens; dump-only attacker cannot authenticate on the specified headless, plugin-free surface. Owner acceptance and negative wrapper/cookie/bearer tests required.
- **Current work / known concerns:** Better Auth catches reset-email send errors; reset completion needs atomic or fail-closed recovery for credentials/revocation/cooling; Solana different-slot agreement exception contradicts policy; moderation approver/publisher wording conflicts; phase plan must reflect owner frontend-first rule.
- **ADR:** [0008](docs/adr/0008-revision-2-ratification-corrections.md), **Proposed**, not implemented. No accepted architecture/ADR was overwritten.
- **Files changed:** this handoff; original Codex review appended; new Revision 2 review; new Proposed ADR 0008. No source/config/schema changes.
- **Verification:** 68 pre-review files, 13 manifests; JSON/workspace references PASS; zero external declared deps, no node_modules/lockfile. git status failed: not a Git repository. Better Auth source archive integrity PASS. Isolated actual better-call crypto primitive: signedValid=true, wrongSecretValid=false, unsignedHasSignature=false. Temporary source/probe files live outside workspace; no dependency installation. Probe runtime Node 26.8.1, not a Node 24 application check. Initial inline probe quoting failed, corrected file invocation passed.
- **Not run:** production integration, lint, application typecheck, browser tests, S1-S15/D1-D9. No migrations, feature work, services, deployments or commits.
- **Owner instruction:** after Phase 0, development is **frontend-first**. Contracts/types/mocks and minimal scaffolding may support frontend flows; full backend development waits for frontend foundation/primary-flow completion. This instruction controls over older backend-first phase text. No frontend work is authorized by this review.
- **Deferred decisions:** owner ratification, E-1, P-11, independence staffing; later hosting/providers/calibration/legal/retention/checkpoint gates remain unchanged.
- **Recommended next step:** Claude corrects the five protocol/documentation items and responds to review/ADR 0008; focused Codex closure check; owner ratifies Phase 0 and then separately authorizes Phase 1.

---

## Session 3: Claude review response (2026-10-04)

### Completed

- **Responded to every finding** in [docs/reviews/2026-10-04-phase-0-codex-review.md](docs/reviews/2026-10-04-phase-0-codex-review.md) (R-01 … R-18). Each response gives the disposition, the resolution and the phase gate; Claude's answers to Codex's ten questions are appended. None was rejected.
- **ADR dispositions** ([docs/adr/README.md](docs/adr/README.md)):
  - 0001–0006 are **Accepted with amendments**. The direction follows the owner's directions of 2026-10-04; the amended text awaits owner ratification. Codex's original proposals are preserved verbatim.
  - **ADR 0007** (toolchain + Foundation acceptance checks) added, Accepted.
- **New normative design documents:**
  - [docs/design/identity.md](docs/design/identity.md): Better Auth headless split, email-first registration (R-01), password policy, sessions, worker-generated security tokens (R-03), staff lifecycle with split-secret enrollment (R-04), the single exact-Origin policy (R-15), the Better Auth acceptance spike S1–S15.
  - [docs/design/moderation.md](docs/design/moderation.md): finding revisions, revision-bound approve-and-publish, severe rules (never relaxed; replacing a severe publication needs independent approval), five standing mechanisms, independence matrix, appeals.
  - [docs/design/chain-data.md](docs/design/chain-data.md): evidence levels + authorization basis (no association in V1), snapshot-bound verification receipts, finalized-only pinning, sanctions design (activation deferred).
- **Authentication evidence:**
  - Better Auth 1.7.6 source inspected, plus `@better-auth/core` and `@better-auth/telemetry`.
  - OSV advisory histories queried for Better Auth (22), SimpleWebAuthn (1), @node-rs/argon2 (0), next-auth (14), @auth/core (3) and Ory Kratos (4).
  - Comparison and file-level findings recorded in ADR 0001.
- **Reconciled documents** (revision 2): PRD, ARCHITECTURE (rev 2, decision log D-031–D-045, open decisions, phases, §37 self-review), ESSENTIALS (incl. §16 language/file/module separation), THREAT-MODEL (extended T-01/04/05/07/10–12/16–18/24–28/31–33/35/38–41/43–44/46–47/49–50/52; 19 invariants; residual risks), data model rev 2, testing strategy rev 2, dependency policy, AGENTS, CLAUDE, README, app/package READMEs, PR template.
- **Scaffold corrections:**
  - `engines.node` set to `>=24.20.0 <25.0.0`.
  - `packages/chains` contracts revised (snapshot identity, receipts, independence groups, evidence level, authorization basis, signers, explorer attribution, provider-scoped cursors).
  - `packages/core` brand-construction comment.
  - New `apps/evidence-processor` (README + manifest).
  - `.env.example` adds `BETTER_AUTH_SECRET`, `BREAK_GLASS_ENABLED`, `DNS_RESOLVER_URL` and processor variables; ClamAV removed.
  - Infrastructure and e2e READMEs updated.

### Adversarial self-review findings (not in Codex's list; fixed)

| # | Flaw | Fix |
|---|---|---|
| A1 | Registration timing oracle (different DB work for existing vs new email) | API never checks existence; worker decides |
| A2 | Mailbox takeover could hijack staff recovery/invitations | Split-secret enrollment code delivered out of band |
| A3 | A single moderator could downgrade a published severe finding | Replacing a severe publication needs independent approval; suspensions alert admins |
| A4 | CSP lacked `img-src` for the evidence domain | Added (derivatives only) |

### Files changed this session

```
New:      docs/design/identity.md  docs/design/moderation.md  docs/design/chain-data.md
          docs/adr/0007-toolchain-and-foundation-acceptance.md
          apps/evidence-processor/README.md  apps/evidence-processor/package.json
Rewritten: ARCHITECTURE.md  ARCHITECTURE-ESSENTIALS.md  PRD.md  docs/data-model.md  docs/testing-strategy.md
          README.md  .env.example  AI_HANDOFF.md
          apps/web/README.md  apps/api/README.md  apps/worker/README.md
          packages/chains/README.md  packages/config/README.md  packages/domain/README.md  packages/db/README.md
          packages/chains/src/types.ts  packages/chains/src/ports.ts
Edited:   THREAT-MODEL.md  AGENTS.md  CLAUDE.md  docs/dependency-policy.md  docs/adr/README.md
          docs/adr/0001…0006 (recommendation, amended decision, owner record; original text preserved)
          docs/reviews/2026-10-04-phase-0-codex-review.md (responses + answers appended; Codex text preserved)
          package.json  packages/core/src/chain.ts  infrastructure/README.md  tests/e2e/README.md
          .github/pull_request_template.md
```

### Database migrations

None. Schema designed in `docs/data-model.md` revision 2.

### Tests

No test code exists (by design). Test plans: `docs/testing-strategy.md` revision 2.

### Verification performed (real results, 2026-10-04)

| Check | Result |
|---|---|
| pnpm 12.7.0 install under **Node 26.8.1** with new engines | **Rejected** (`ERR_PNPM_UNSUPPORTED_ENGINE`, wanted `>=24.20.0 <25.0.0`), as intended |
| pnpm 12.7.0 install under **Node 24.21.0** (official zip; SHA-256 verified against nodejs.org SHASUMS256) | Pass: 13 workspace projects (incl. evidence-processor) |
| **TypeScript 6.0.3** type check of `packages/core` and revised `packages/chains` (under Node 24; `@types/node` 24.x added in the scratch copy only) | Both pass. The repo files are byte-identical to the checked copy |
| Markdown link + anchor checker (GitHub slug rules) over all `.md` | 212 relative links, 0 broken (2 anchors fixed) |
| Stale-term sweep across current docs | Remaining hits are only in deferred, prohibited or historical contexts (reviewed line by line). ClamAV in the e2e README and old MVP wording were fixed |
| Cross-document parameter check (passwords, TTLs, staff authenticators, evidence limits, lifetimes, ceilings) | Consistent |
| Secret-pattern scan | No matches |
| `.gitignore` on a throwaway git copy | Decoy secrets ignored; all 68 project files (including new ones and `.env.example`) committable |
| Better Auth evidence | Source inspection and OSV queries as listed above; claims in ADR 0001 cite the inspected files |

**Not performed:** gitleaks (not installed), linting (no tooling), any runtime test, any Better Auth integration (that is spike S1–S15 in Phase 1), Drizzle/pg-boss checks (D1–D9 in Phase 1). Codex has not yet reviewed revision 2.

### Known bugs

None (no code). Scaffold limitation: `packages/chains` will not type-check in the repo until Phase 1 installs `@types/node` 24.x (expected). The owner's machine runs Node 26.8.1, which the project now rejects; Node 24 must be installed before Phase 1.

### Security concerns to carry forward

1. **Exception E-1:** Better Auth stores session tokens unhashed (HMAC-signed cookies compensate). Needs owner acceptance or an ADR for a custom session layer.
2. **Member accounts have no MFA in V1.** Mailbox compromise → takeover via reset (accepted residual; member MFA is the first Post-V1 identity item).
3. **Full audit rewrite by a DB administrator** is undetectable until the O-13 checkpoint decision.
4. **Better Auth advisory cadence:** keep the headless/no-plugin configuration; track GHSA; the spike may surface gaps that need ADRs.
5. **Independence requires staff:** two independent people to publish severe findings, a third for severe appeals (P-12).
6. **Legal review is a pre-launch blocker** (P-8).
7. Enable GitHub secret scanning, push protection and gitleaks when the repository is created.

### Architecture decisions this session

ADR 0001 (Better Auth headless + Blacklist identity policy; email-first registration; worker-generated tokens; staff lifecycle; exact Origin; 15-character passwords); ADR 0002 (revision-bound approvals; standing; independence); ADR 0003 (transfer authorization semantics; snapshot verification; sanctions deferred); ADR 0004 (image-only; isolated processor; per-item objects; AV deferred); ADR 0005 (private reports; tier combination; replay; stale jobs; smaller V1); ADR 0006 (honest audit; identity map; telemetry; retention gate); ADR 0007 (Node 24, TypeScript 6, pnpm 12.7.0, Drizzle acceptance D1–D9). Decision log: ARCHITECTURE §34 (D-031–D-045; D-008, D-019, D-024 and D-030 superseded).

### Owner decisions still needed

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| **E-1** | Accept plain session-token storage compensated by HMAC-signed cookies | Accept | Phase 1 identity work |
| **Ratification** | Amended text of ADRs 0001–0006 (incl. ClamAV deferral, no global dedup, split-secret enrollment, severe-replacement rule) | Ratify | Phase 1 start |
| **P-11** | Public numeric score display | Band + explanation at launch; numeric after calibration | Phase 4 |
| **P-12** | Staffing for independence (2 for severe publication, 3rd/external for severe appeals) | Plan before Phase 3 | Phase 3 operations |
| **O-13** | Independent audit checkpoint | Yes, decided with hosting | Launch |
| P-8 | Engage qualified legal counsel (jurisdictions, defamation, privacy, retention, sanctions, publication) | Required | Public launch |
| P-3, P-7, P-9, P-10 | Indexing, retention, moderator identities, DSAR | See PRD §10 | Launch |
| O-6, O-7 | Human-verification and email providers | Turnstile; SMTP provider meeting identity §8 criteria | Finishing Phase 1 auth (local fakes OK before) |
| O-3, O-4, O-5 | Providers, hosting/edge/CI, error tracking | See ARCHITECTURE §35 | Phase 2 / staging |
| Repo | Create the GitHub repository (secret scanning + push protection), licence (currently `UNLICENSED`), CODEOWNERS handles | Owner action | Before first commit |
| Machine | Install Node 24 LTS on the development machine | Owner action | Phase 1 |

### Remaining blockers for Phase 1

1. Owner + Codex review of revision 2 (this response).
2. Owner ratification of the amended ADRs and a decision on **E-1**.
3. Explicit owner authorization of Phase 1.
4. Node 24 installed on the development machine; git repository created with protections.

Phase 1 must then **start with the acceptance spikes** (Better Auth S1–S15, Drizzle/pg-boss D1–D9) before identity migrations or features.

### Recommended next step

**Owner + Codex review of these corrections.** Codex should re-review revision 2, focusing on:

- the new design documents;
- whether R-01–R-18 are genuinely resolved;
- adversarial fixes A1–A4;
- ADR amendments, especially the ClamAV deferral and generating tokens at send time instead of encrypting them.

The owner should decide E-1 and ratify the ADRs. **Do not start Phase 1 without explicit owner authorization.**

---

## Codex independent review session (2026-10-04, preserved history)

- **Completed:** inspected all 55 existing files, including full product/architecture/threat/data/testing/dependency docs, all source contracts, manifests and configurations; checked primary-source authentication, password, technology and blockchain claims. Created [review](docs/reviews/2026-10-04-phase-0-codex-review.md) with every O-1…O-12/P-1…P-10 recommendation, requirements coverage, findings and phase gates. Filed six Proposed ADRs; no approved architecture was changed.
- **Verdict:** APPROVED AFTER REQUIRED FIXES. One Critical, eight High, seven Medium and two Low findings; accepted decisions documented separately. This is a conditional review conclusion, not owner approval or phase authorization.
- **Current work:** none executing; Claude response and owner decisions pending.
- **Files changed this session:** review above; `docs/adr/0001-authentication-lifecycle-and-delivery.md`, `0002-immutable-approvals-and-effective-redress.md`, `0003-chain-evidence-and-authorization-semantics.md`, `0004-hostile-evidence-isolation-and-lifecycle.md`, `0005-risk-evidence-privacy-and-v1-scope.md`, `0006-audit-trust-retention-and-private-telemetry.md`; ADR index; this handoff.
- **Migrations/dependencies/production code:** none created, changed or installed. No infrastructure, deployments, purchases or production/user-data access.
- **Actual checks:** all JSON parsed; 12 manifests including root / 11 child projects; 17 valid internal workspace dependency edges and no cycles; 55 initial local Markdown file links resolve (anchors not tested); seven TypeScript vocabulary/contract files and zero tests; no lockfile/node_modules. Limited private-key/AWS/GitHub-token/xprv pattern scan found zero matching files without printing values. Scratch Git ignore test outside workspace passed for 12 synthetic secret/build/data paths and preserved `.env.example`, documentation and source. Initial PowerShell stdin CR artifacts were corrected by LF-only Node stdin. Workspace `git status --short` fails because no Git repository exists.
- **Tool evidence:** installed Node reports `v26.8.1`; pnpm/tsc/gitleaks are unavailable on PATH. No independent install, typecheck, lint, runtime suite or performance test was run. Claude's earlier scratch results remain historical author-reported evidence, not independently reproduced results.
- **Known design issues:** activation preserves attacker credentials unless resolved (R-01); auth-library fit unproven; queued auth token handling and staff recovery undefined; append-only approval ambiguity; subject-authorized association and same-state provider receipts absent; unsafe MVP PDF viewing; limited appeal standing; public report inference and historical score/job ordering gaps. See review for evidence, not deployed bug claims.
- **Security concerns:** affected T-01…07, T-11…18, T-21, T-24…29, T-31…42, T-44, T-46…50, T-52, T-55…57 as detailed in review/ADRs. No secrets observed or introduced. AGENTS §9 checked for review-only scope; no runtime/migration security pass claimed.
- **Recommendations made, not decisions accepted:** library-first auth evaluation; 15-character password-only minimum; no public pending counts/numeric report effects; image-only smallest V1; preserve modular monolith, provenance and chain-scoped subjects; require explicit audit trust/retention policy and independent appeal capacity.
- **Deferred decisions:** all owner/Claude approvals remain pending; original architecture still governs until accepted ADRs reconcile it. No Phase 1 authorization.
- **Unfinished:** finding responses, ADR acceptance/rejection, document reconciliation, exact-version compatibility/security checks during authorized Foundation, relevant phase tests and qualified pre-launch legal review.
- **Recommended next step:** Claude reviews these findings and proposals, then the owner resolves blockers. Stop after review; implement nothing without separate authorization.

## Claude session 1 (2026-10-04, preserved summary)

Created the Phase 0 foundation: PRD, ARCHITECTURE (rev 1), ESSENTIALS, THREAT-MODEL, AGENTS, CLAUDE, README, data model, testing strategy, dependency policy, ADR/review templates, scaffold (pnpm workspace, `core`/`chains` contracts). Verified then: pnpm 12.7.0 settings recognized (with a negative control), release-age and `saveExact` behaviour, TypeScript 7.0.2 check of the contracts (TypeScript 6 is now the baseline, re-verified in session 3), `.gitignore` decoys, secret-pattern scan.
