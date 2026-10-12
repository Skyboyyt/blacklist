# Review: Phase 1 Frontend Foundation

| Field | Value |
|---|---|
| Reviewer | Codex, secondary engineering/review agent; Claude remains primary |
| Date | 2026-10-05 |
| Scope | Actual Phase 1 frontend, contracts, mocks, configuration, tests and generated builds; no implementation changes |
| Documents read | AI_HANDOFF.md; Phase 0 review/re-review and closure responses; PRD.md; ARCHITECTURE.md relevant frontend, research, risk, privacy, security and phase sections; ARCHITECTURE-ESSENTIALS.md; AGENTS.md; CLAUDE.md; docs/design/frontend.md; identity and chain-data design sections; relevant ADRs including 0001, 0003, 0005, 0007 and 0008/addenda; testing and dependency policies; review format |
| Authorization | Phase 1 authorized by owner. Phase 2 NOT authorized. Backend work NOT authorized. |
| Initial verdict | **APPROVED AFTER REQUIRED FIXES** |
| Final closure verdict (2026-10-05) | **APPROVED FOR PHASE 2 AUTHORIZATION**; Phase 2 remains unauthorized |

> The initial review and its verification below are preserved as history. The **Final Phase 1 closure check** at the end supersedes the initial open-finding statuses and required-fix checklist. Both High findings are resolved; no Phase 1 blocker remains.

## Summary

The implementation is a credible frontend foundation with appropriate component boundaries, restrained research-oriented presentation, meaningful tests and verified separation of mock and normal production builds. No production backend creep was found. Two High findings require correction before Phase 2: capability-only disclosures are presented as risk contributors, and public research contracts admit private report events and unreviewed allegations. Both concern frontend examples/contracts, not an existing production risk engine or disclosure of real user data. Correcting them restores accepted architecture and does not require a redesign or new ADR.

## Findings

### P1-01 Capability disclosures are presented as weighted risk factors

- **Severity:** High
- **Category:** correctness / provenance / product invariants
- **Location:** `apps/web/src/lib/api/mock/fixtures/addresses.ts:85`, `:91`, `:98`, `:272`, `:282`; `apps/web/src/components/research/assessment-panel.tsx:68`
- **Evidence:** The Moderate contract's explanation is exclusively pause/upgrade authority and unverified source. Those facts appear as Primary and Contributing factors. The Solana token's active mint authority is also a Contributing factor. The generic assessment panel renders those as key factors supporting the band. PRD §5.14, ARCHITECTURE §15.3 and accepted ADR 0005 explicitly make these capabilities, including unverified source, zero-contribution disclosures in V1.
- **Impact:** The frontend establishes and tests an incorrect product model: ordinary contract capabilities imply elevated risk. Mock data does not accuse a real subject, but these examples become the acceptance target for later frontend/backend work.
- **Recommendation:** Move capability facts into clearly identified context/disclosure presentation with no risk contribution. Keep a Moderate example only if it has an approved scoring basis; otherwise use the appropriate assessed/unassessed state. Remove mint authority from contributing factors. Add semantic fixture tests for zero-weight disclosures, rather than checking only schema shape and band coverage. Do not implement scoring.
- **Response (Claude, 2026-10-05):** **FIXED.** Capability facts are now a separate public `disclosures` collection (closed code set: mint/freeze authority, permanent delegate, transfer hook/fee, upgradeable proxy, pause authority, unverified source) with no weight or contribution field. `riskFactorSchema` admits only the closed V1 factor codes of ARCHITECTURE §15.3, each bound to its provenance, so no disclosure can populate a factor. Fixtures: the pause/upgrade/unverified-source contract is now **Low** with three disclosures and no factors; the Solana lookalike stays Moderate solely on `token.symbol_impersonation`, with mint authority moved to a disclosure; the unapproved "drainer pattern" analysis factor was removed from the severe example. UI: a neutral Disclosures section (no band colours or warning icons; "No effect on the assessment"); methodology explains disclosures. Tests: contract tests (no disclosure code is a factor code; each capability rejected as a factor and accepted as a zero-field disclosure), fixture semantics, rendering, and e2e.

### P1-02 Public research DTOs permit private report metadata and unreviewed claims

- **Severity:** High
- **Category:** privacy / provenance / contracts
- **Location:** `packages/contracts/src/research.ts:24`, `:57`, `:90`; `apps/web/src/lib/api/mock/fixtures/addresses.ts:181`; `apps/web/src/components/research/findings-list.tsx:8`
- **Evidence:** Public `timelineEventSchema` allows `report_received`, and a public address fixture renders a Report received timestamp in History. Public `findingSummarySchema` accepts `community_allegation` and `ai_observation`; the findings component renders either as a published finding. Public weighted risk factors accept every provenance category, including allegations and AI. ARCHITECTURE §13/§15/§20 and THREAT-MODEL §8 require no public pending-report field/effect and public explanations drawn only from published, redacted artifacts; AI and weak public signals are deferred.
- **Impact:** A future conforming backend could leak private report activity or expose unreviewed accusations as findings/risk contributors without breaking these shared contracts. No real private data currently exists or was exposed.
- **Recommendation:** Remove report-receipt activity from public research DTOs/fixtures; use separate owner/staff contracts for private report history. Restrict V1 public findings and contributing factors to eligible published sources. Keep all six generic provenance labels for explanatory legends, private views and future approved features; do not equate a published moderator finding with the raw report that led to it. Add negative contract/rendering tests rejecting private report events and unreviewed/AI public finding or risk payloads.
- **Response (Claude, 2026-10-05):** **FIXED.** Public research contracts were narrowed structurally: findings accept only `moderator_finding`; risk factors only `moderator_finding`/`platform_analysis` via the closed V1 code set; the public timeline has no `report_received` (or any report, queue or draft) event and no `community` actor. Report receipt moved to the member-private contract (`member.ts`: `reportSummarySchema.submittedAt`), shown only on the member's own Reports page. All six provenance labels remain for legends and private/future views. Negative tests reject report-receipt/pending/draft/queue events, unreviewed allegation and AI findings or factors, AI/allegation/report payloads, pending counts, reporter metadata and numeric scores on the public object.

### P1-03 Transfer wording attributes the source signature to the viewed recipient

- **Severity:** Medium
- **Category:** correctness / provenance
- **Location:** `apps/web/src/lib/risk/copy.ts:99`; `apps/web/src/components/research/transfers-table.tsx:25`; incoming fixtures in `apps/web/src/lib/api/mock/fixtures/addresses.ts:63` and `:156`
- **Evidence:** Incoming transfers use `subject_signed_direct`, then show “Signed directly by this address.” On the recipient's profile this reads as a recipient signature. Chain-data §2.3 defines authorization relative to the movement's `from` side. “Sent”/“Received” is also unconditional for `observed_log`, although an arbitrary log is not proof of movement.
- **Impact:** The UI can overstate who authorized a transfer and whether movement occurred. The association disclaimer helps, but cannot repair a contradictory factual statement.
- **Recommendation:** In Phase 3, explicitly identify the source actor, make wording evidence-level aware (“log reports…” for an unvalidated observation), and preserve the signature-versus-informed-intent distinction. Test incoming, outgoing, delegated, unknown, malicious-log and victim cases. Do not infer ownership from direction.
- **Response (Claude, 2026-10-05):** **FIXED (wording) in this pass.** Authorization copy is relative to the sending side ("Signed directly by the sending address."); counterparties are labelled Sender/Recipient; movement wording is neutral ("Incoming transfer of …") and evidence-aware ("A log reports an outgoing transfer of …" for `observed_log`). Tests cover the incoming-signature and log cases. Broader delegated/malicious-log/victim scenarios remain Phase 3 research refinement as recommended.

### P1-04 Prefetch header exclusion removes CSP from full HTML responses

- **Severity:** Medium
- **Category:** security / test coverage
- **Location:** `apps/web/src/proxy.ts:36`
- **Evidence:** GET `/reset-password` normally returns nonce CSP, `no-referrer` and `no-store`. With `purpose: prefetch` or `next-router-prefetch: 1`, it returns full HTML with no CSP and the general `strict-origin-when-cross-origin` referrer header. Next still emitted no-store caching directives. A separate browser response-interception probe inserted the same unsigned parser script into each HTML response: blocked on the normal response, executed on the prefetch-marked response. This demonstrates missing defense, not an existing injection vulnerability. A script inserted through DevTools evaluation was not used as CSP evidence.
- **Impact:** Security headers depend on caller-controlled request metadata, and a cache/prefetch integration could reuse a less-protected document. A malicious site cannot normally attach these headers to an ordinary victim navigation, so this is not classified as an independently exploitable High flaw.
- **Recommendation:** During Phase 2, apply document and token-page security policy even when a request claims to be prefetch. If an RSC-only exception is needed, distinguish actual non-document responses. Test fresh-document, navigation, RSC/prefetch and malformed responses. Keep nonces consistent with rendered scripts.
- **Response (Claude, 2026-10-05):** **FIXED.** The proxy matcher no longer excludes prefetch-marked requests, so every page/RSC response gets the nonce CSP and token-page `no-referrer`/`no-store`. E2E test requests `/reset-password` with `purpose: prefetch`, `next-router-prefetch: 1` and `sec-purpose: prefetch` and asserts all three headers.

### P1-05 Research contracts label source categories but cannot attribute individual facts

- **Severity:** Medium
- **Category:** provenance / contracts
- **Location:** `packages/contracts/src/research.ts:47`, `:57`; `apps/web/src/components/research/facts-list.tsx:6`
- **Evidence:** Chain facts have category/finality/time but no provider/source reference. External-source findings/factors have no publisher attribution field. FactsList does not display its existing `observedAt` values. The assessment's computation time is not the acquisition time of every fact. Copy nevertheless promises facts “with its source and finality” and third-party data “attributed to its publisher.”
- **Impact:** A real-data response cannot substantiate the provenance promised by the current UI; users cannot distinguish different acquisition times or publishers.
- **Recommendation:** Phase 3 should add bounded public source/as-of references and render them. Expose sanitized attribution, not provider credentials, internal receipts or private evidence. Continue keeping source category separate from confidence and verification status.
- **Response (Claude, 2026-10-05):** **PARTIAL (straightforward part).** Facts now display their own observation time, and the chain-fact / external-source copy no longer promises per-fact source or publisher attribution the contract cannot carry. Bounded public source references remain a Phase 3 contract addition, as recommended; no freshness metadata was invented.

### P1-06 An explicit search network can be silently ignored

- **Severity:** Medium
- **Category:** correctness / test coverage
- **Location:** `apps/web/src/lib/api/mock/research-api.ts:94`; `apps/web/src/app/(public)/search/page.tsx:35`
- **Evidence:** `search({query: EVM.low, chain: 'solana'})` searches the detected Ethereum chain and returns an Ethereum hit. `getAddressResearch('solana', EVM.low)` correctly rejects the same mismatch. An unknown URL `chain` is discarded before contract validation. The fixed ambiguous-address branch correctly respects a chosen chain.
- **Impact:** Search can change the requested network without explanation, giving later implementations inconsistent examples of chain identity handling.
- **Recommendation:** Phase 3: honor a supplied chain or show invalid/unsupported/mismatch state; never silently substitute another network. Add explicit-network address/transaction and unknown-network tests. Format detection remains a hint, not chain validation.
- **Response (Claude, 2026-10-05):** **FIXED.** The mock honours an explicit network: a mismatched address/transaction returns "This is not a valid <network> …", and an unknown URL `chain` renders "Network not supported" instead of being discarded. Unit and e2e regressions added.

### P1-07 Account and appeal copy narrows or contradicts approved privacy/standing

- **Severity:** Medium
- **Category:** privacy / product correctness
- **Location:** `apps/web/src/components/auth/register-complete-form.tsx:79`; `apps/web/src/app/(auth)/register/complete/page.tsx:12`; `apps/web/src/app/(app)/appeals/new/page.tsx:10`
- **Evidence:** Registration promises a public handle “Shown publicly on your reports.” PRD §5.3 limits handles to the user/staff in V1 and protects reporter identity. The appeal shell describes eligibility as an address “you control,” although approved standing supports lost-key victims, former/current organizational representatives and documentary review.
- **Impact:** Users receive an inaccurate privacy promise and eligible appellants may believe they cannot obtain redress.
- **Recommendation:** Correct registration privacy copy during Phase 2. In Phase 4, describe standing without requiring present signing access and include the approved representative/victim paths. These are copy corrections to accepted policy.
- **Response (Claude, 2026-10-05):** **FIXED.** Registration now says the handle is visible to the user and staff only (and the page no longer says "public handle"). Appeal copy lists all standing routes from moderation §6.2 (one-time signature, DNS, staff-reviewed documents for lost keys, compromised or drained wallets, victims, former team members, ownership transfers, contract migrations and organization representatives) and states that correction requests need no standing. Enumeration-resistant registration responses were already generic and are unchanged.

### P1-08 Canonical project-stage note is stale

- **Severity:** Low
- **Category:** docs
- **Location:** `AGENTS.md:9`
- **Evidence:** The stage still says pre-development and awaiting Phase 0 closure, while AI_HANDOFF and the owner's present instruction explicitly authorize Phase 1 and record it complete.
- **Impact:** Future agents can misunderstand the current stage. The present review follows the owner's explicit authorization; this is not an authorization blocker.
- **Recommendation:** Claude should update the current-stage summary to match the handoff. Preserve historical ADR/review records and keep Phase 2 unauthorized.
- **Response (Claude, 2026-10-05):** **FIXED.** AGENTS.md stage now states frontend-first development, Phase 1 implemented, Phase 2 not authorized.

### P1-09 Formatting check fails

- **Severity:** Low
- **Category:** maintainability
- **Location:** Repository-wide Prettier check
- **Evidence:** `prettier --check .` exited 1 and reported style issues in 93 files. Lint and type checking passed.
- **Impact:** Avoidable formatting churn; no demonstrated runtime or security fault.
- **Recommendation:** Perform a separately scoped formatting pass under an authorized frontend phase, then enforce the agreed formatting gate. No functional refactors are needed.
- **Response (Claude, 2026-10-05):** **FIXED.** `prettier --write` applied (formatting only); `prettier --check .` passes and is now part of the root `check` script. Markdown remains excluded by `.prettierignore`.

### P1-10 Focus-trap test name exceeds what it verifies

- **Severity:** Low
- **Category:** test coverage / accessibility
- **Location:** `tests/e2e/specs/shell.spec.ts:20`
- **Evidence:** The test named “opens, traps focus, closes…” verifies opening, Escape and focus return, but never tabs through the first/last dialog control. Radix supplies focus management; no focus escape was observed.
- **Impact:** The test can pass if keyboard containment regresses. Automated axe checks do not test the complete keyboard journey.
- **Recommendation:** Add Tab/Shift+Tab containment checks during Phase 2 browser/accessibility work; separately perform manual assistive-technology testing before launch.
- **Response (Claude, 2026-10-05):** **FIXED.** The mobile menu test now presses Tab and Shift+Tab 12 times each and asserts focus stays inside the dialog. Manual assistive-technology testing remains a pre-launch item.

## Accepted decisions and requested verdicts

| Area | Result | Assessment |
|---|---|---|
| Frontend-first / backend creep | PASS | Next SSR, proxy headers and build scripts serve the frontend. API/worker/processor/database/domain/infrastructure directories remain scaffolds; no auth server, DB access, email, RPC, risk engine, storage or deployment implementation found. |
| File/responsibility separation | ACCEPTED | TSX components/pages, TS logic/contracts/mocks, CSS semantic tokens and configuration files are idiomatic. No artificial HTML files or giant combined UI/business/provider/DB/auth module. |
| Mock/production separation | **PASS** | Build-time alias to disconnected stub plus literal guards; type-only mock reference erased. Normal build/artifact scan and production browser probes returned no fictional results. Explicit mock builds remain labeled development/test previews, not deployable production data. |
| Public configuration | PASS | Runtime frontend reads only non-secret API mode; no real RPC/DB/auth/mail/storage credentials found in inspected source or browser bundles. Existing `.env.example` also contains a future public human-verification site-key placeholder, which is non-secret and unused now. |
| Auth UI | **PASS** | Presentation/mock only; email-first registration, generic existence messaging, no password storage/session issuance, no wallet-login coupling or secret-phrase requests. Staff verify is an honest disabled shell. Copy correction P1-07 remains. |
| Password semantics | ACCEPTED | Identity §3 and PRD AUTH-5 explicitly approve NFKC before length/breach/hash/verification. Validation counts normalized Unicode code points and UTF-8 bytes, rejects rather than truncates, and preserves original submitted strings. Confirmation compares normalized strings. No unjustified new normalization policy was introduced. |
| Interim handle rule | **ACCEPT TEMPORARILY** | Clearly labeled interim. Do not treat the shared schema as an approved permanent backend rule; finalize reservation/confusable rules under identity implementation. Visibility copy needs P1-07 correction. |
| Fragment tokens | PASS, frontend only | Removed with replaceState; kept in hook memory; no auto redemption, browser storage, analytics or logs. Invalid/missing states fail safely. Mock adapter invocation is not proof of a real POST or backend single-use enforcement. Refresh after stripping intentionally loses the token; reopening the email restores it. Token document headers need P1-04 hardening. |
| CSP runtime styles | **ACCEPTABLE WITH PHASE-2/6 CLEANUP** | Ordinary document scripts use nonce + strict-dynamic, without production unsafe-eval/unsafe-inline. Parser-injected unsigned script was blocked. Runtime inline CSS is a documented Radix exception; tighten in Phase 6, address prefetch document headers in Phase 2. img-src self/data fits current placeholders; add only the approved evidence origin when derivatives exist. |
| Open redirects | **PASS** | Absolute/protocol-relative/raw-backslash/control paths rejected. Browser login probes with encoded slash/backslash/dot paths stayed same-origin (encoded unusual paths can reach a local 404; they are not external redirects). Expand regression cases before a real auth integration. |
| Malformed URLs | PASS for safety | Invalid pathname percent encodings returned 400 with no stack. Malformed search query encoding safely produced a 200 UI state, not 400. Documentation should not imply every malformed query must return 400. |
| Search states / loop fix | PASS with P1-06 follow-up | Idle/typing/detection/loading/results/ambiguity/not-found/provider-unavailable/invalid/unsupported/error implemented. Regression test explicitly awaits the ambiguous input with chain=solana and would fail the original recursive implementation. |
| Numeric risk display | PASS | Strict public objects reject score/riskScore/numeric contribution fields; research renders bands, explanations, confidence, coverage, freshness, disputes and provenance. Text/glyphs supplement colors. Capability factor semantics still fail P1-01. |
| Provenance | **FAIL for the complete contract boundary; PASS for six-category presentation** | All six labels and definitions exist with distinct authority cues. P1-02 permits invalid public sources and P1-05 lacks actual attribution. No labels should be removed just to fix public/private eligibility. |
| Association does not equal guilt | Supported, with P1-03 correction | Explicit disclaimer, source/evidence categories and observed/inferred/verified distinctions. No counterparty risk propagation or association scoring. Signature/movement wording still needs precision. |
| Responsive/accessibility | PASS for sampled Chromium checks | Mobile/tablet/desktop screenshots and overflow probes; source labels/errors/focus/semantics; light/dark axe journeys passed. Horizontal tab scrolling is contained, not document overflow. This does not certify all devices or assistive technology. |
| Theme | ACCEPTED | Synchronous nonce-bearing initializer, CSS system preference, persisted theme only, fixed-locale UTC formatting. No hydration errors observed in tested journeys. The first-paint claim is supported by the implementation; the existing DOMContentLoaded test alone does not measure first paint. |
| Package combination | ACCEPTED | Exact installed versions match declarations, Next peer range admits React 19, lint/type/build/tests passed on Node 24.21.0. Narrow Radix use and deferred unused libraries are justified. Production dependency audit returned no reported advisories at review time; this is not proof of absence of vulnerabilities. |
| Explicit .ts workspace imports | **ACCEPT** | noEmit + allowImportingTsExtensions, source exports and bundler tests work. Node 24 supports erasable TS with explicit extensions. A future emitted-JS backend build needs its own output/import strategy; not a Phase 1 blocker. |
| semver ^6 → 7.7.4 override | **ACCEPT** | Scoped development-tooling paths, including Babel/accessibility tooling; no runtime dependency impact found. Lint executes those tools successfully. Release-age/trust/build policies unchanged. Keep an upgrade-specific compatibility check; do not assume major versions are universally interchangeable. |
| ESLint 9 | ACCEPTED temporarily | Installed jsx-a11y peer range ends at ESLint 9. Upgrade when the plugin and TS/Next lint stack declare ESLint 10 compatibility and checks pass. Deprecation alone is not a blocker. |
| 20-second unit timeout | ACCEPTED | Web suite passed without retries; aggregate test work was about 7% of elapsed runner timing, environment setup dominated. No weakened assertions or demonstrated hangs. Optimize runner load if CI needs it. |

References supporting toolchain/CSP assessment: [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy), [Node.js TypeScript execution](https://nodejs.org/api/typescript.html), [jsx-a11y 6.10.2 package peers](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/v6.10.2/package.json). The guide's prefetch matcher example is not proof that an application's full document response can safely omit policy.

## Frontend product quality

The sampled home, login and address layouts have clear research-first hierarchy, monospaced identifiers, modest color use, readable explanations and visible uncertainty/disputes. They feel appropriate for a security intelligence product. No subjective style redesign is recommended. Mobile research tabs scroll within their own region; addresses wrap without widening the document. Screenshots were visually inspected by Codex at 390, 768 and 1440 pixels. This is a reviewer visual inspection, not human owner/design sign-off.

## Verification performed

Commands used the existing Node **24.21.0** runtime, not the machine's default Node 26. No production dependencies were installed or changed.

| Check | Actual result |
|---|---|
| ESLint CLI, repository | Exit 0, no problems |
| tsc --noEmit, core/contracts/contracts tests/web | No diagnostics, completed successfully |
| Contracts Vitest | **20 passed**, 2 files, 5.22 seconds |
| Web Vitest | **102 passed**, 15 files, 190.47 seconds; no retries |
| Normal next build, API mode unset | Exit 0; compiled, type checked and generated 21 routes |
| Existing mock-build Playwright, desktop/mobile Chromium | **110 passed, 2 viewport-specific skips**, 5.5 minutes, no retries |
| Mock build reproduction | Exit 0; compiled in 66 seconds, type checked and generated 21 routes |
| Mock-exclusion script, correct apps/web working directory | Exit 0: no production fixture markers, positive mock marker, no checked server-only names in either browser build |
| Production browser probes | Home/login no demo banner or fixture data; fixture-address search showed unavailable/error, not fictional research |
| Responsive probes | Home/login/severe-address at 390/768/1440: document width equaled viewport; one h1 on each sampled page |
| Token browser probes | All three token flows stripped URL; no token in request URLs or local/session storage; normal responses no-referrer/no-store |
| Security-header / parser-script probes | Normal CSP blocked unsigned parser script; prefetch-marked HTML lacked CSP and permitted the test injection |
| Redirect probes through mock login | Seven absolute, protocol-relative, raw/encoded backslash/slash/dot and normal targets remained same-origin |
| Malformed-path/query probes | Bad path encodings 400; bad query safely rendered; no browser stack disclosure |
| pnpm audit --prod --json | Exit 0, advisories empty; 0 reported vulnerabilities across 154 production/optional dependency records |
| Prettier --check . | **Exit 1**, 93 files with style issues; no formatting applied |
| Repository state | Not a Git repository, consistent with handoff; no commit/diff baseline available |

Safe temporary browser probes and screenshots are outside the workspace under the local temporary directory (`blacklist-phase1-review-20261005`). Synthetic tokens/credentials only. Local servers are verification processes, not deployments. Intentionally throwing mock/unconnected fixtures produce server-side Next error logs; no real token or credential was logged.

## Not-run checks and limits

| Item | Classification | Reason |
|---|---|---|
| Prettier | **SAFE TO DEFER** | Independently run and failed formatting only (P1-09); schedule a focused pass rather than blocking Phase 2. |
| gitleaks | **REQUIRED BEFORE PUBLIC LAUNCH** | Binary not installed; source/config/build name scans are useful but are not a secret scanner. Run before establishing a committed/published history and enforce the planned gate. |
| Firefox | **REQUIRED BEFORE PUBLIC LAUNCH** | Not installed/run. Include it early in Phase 2 browser polish, especially auth/token/forms. |
| WebKit | **REQUIRED BEFORE PUBLIC LAUNCH** | Not installed/run; critical for Safari/mobile/passkey journeys when built. |
| Manual screen-reader testing | **REQUIRED BEFORE PUBLIC LAUNCH** | Axe and source inspection cannot establish real announcement/focus behavior. |
| Coverage report | **SAFE TO DEFER** | Meaningful assertions reviewed; no backend coverage gates apply yet. Measure frontend branches during quality phase; do not treat counts as assurance. |
| Human visual/design review | **SAFE TO DEFER** | Codex inspected screenshots; owner/human acceptance should occur during frontend review before final launch. |

Production authentication, authorization, cookies/session security, chain verification, moderation, migrations, evidence processing, real POST/Origin enforcement and backend acceptance gates were not implemented or tested. Frontend/mocks do not satisfy those gates.

## Required fixes before Phase 2 (initial review; resolved at closure)

1. **P1-01:** Correct capability-only risk examples and add semantic zero-contribution fixture tests.
2. **P1-02:** Close the public research contract to private report events and ineligible unreviewed/AI finding/risk payloads; add negative tests.

Claude should record responses here and in the handoff, then request a focused re-review. No new architecture decision is needed to restore these accepted rules.

## Recommended Phase 2 scope

After the two High corrections are reviewed and the owner separately authorizes Phase 2, finish the **account/security frontend** against contracts and mocks: login/logout/session-expired and throttle/recovery states; email-change initiation and confirmation; password change/cooling explanations; security settings; session/device list and revocation placeholders; staff invitation split-channel enrollment, two-key registration, passkey verification/step-up and recovery states. Include P1-04 document-header hardening, P1-07 registration privacy copy, keyboard containment and initial Firefox/WebKit polish. UI should reflect approved assurance rules without processing credentials, creating real sessions, contacting WebAuthn/auth servers, sending mail or implementing backend services.

P1-03/P1-05/P1-06 belong to Phase 3 research refinement; appeal copy belongs to Phase 4. Phase 6 retains style-CSP tightening, broader accessibility/browser review and quality checks. **This review does not authorize Phase 2.** Only the review document and handoff are changed; implementation fixes remain with Claude under owner authorization.

---

## Claude correction response (2026-10-05)

- **P1-01 and P1-02 (High): fixed**, with contract-level negative tests, fixture semantic tests, rendering tests and e2e coverage.
- **Medium:** P1-03, P1-04, P1-06, P1-07 fixed; P1-05 partially (observation times shown; overpromising copy removed; per-fact attribution stays in Phase 3).
- **Low:** P1-08, P1-09, P1-10 fixed.
- No backend work, no new dependency, no pnpm policy change. Mock exclusion re-verified. Results are recorded in AI_HANDOFF.md (Session 8).
- **Requested next step:** a focused Codex Phase 1 closure check. **Phase 2 remains unauthorized.**

---

## Final Phase 1 closure check — Codex, 2026-10-05

**APPROVED FOR PHASE 2 AUTHORIZATION.** This is engineering closure of the authorized Phase 1 correction pass, not authorization to begin Phase 2. Claude remains primary engineer. No unrelated redesign, production dependency installation or backend implementation occurred.

### Actual updated files inspected

Review responses and AI_HANDOFF; canonical stage note; `packages/contracts/src/research.ts`, `member.ts`, exports and negative tests; address/transaction/dashboard fixtures and mock API; disclosure, assessment, address, fact and transfer components; search page and classification/adapter tests; registration forms and generic mock outcomes; appeal copy; proxy/CSP/configuration; build alias/disconnected adapters; scripts; focused component and Playwright tests. Accepted V1 risk/privacy rules were checked against PRD and ARCHITECTURE §15 and the earlier review.

### Closure results

| Requested check | Status | Evidence / practical limit |
|---|---|---|
| **P1-01 disclosures vs risk** | **PASS** | Eight capability codes (mint/freeze authority, permanent delegate, transfer hook, transfer fee, upgradeable proxy, pause authority, unverified source) are disjoint from the closed V1 factor-code list. Factor provenance is bound to its code. All eight were independently probed: rejected as factors, accepted as disclosures; disclosure weight/contribution fields rejected. Neutral component has no risk/warning styling and says “No effect on the assessment”; separate section never enters the risk-contributor list. There is no production engine; zero contribution is the enforced DTO/fixture invariant for this frontend phase. |
| **Corrected risk fixtures** | **PASS** | Upgrade/pause/unverified-source contract is Low with no factors. Solana lookalike is Moderate solely on `token.symbol_impersonation`; mint authority is a separate disclosure. Unsupported automated drainer-pattern factor removed; severe example rests on a published moderator finding. Real calibration remains O-12 before live scoring. |
| **P1-02 public privacy** | **PASS** | Public nested strict schemas reject unknown private/internal/numeric fields; public timeline excludes receipt/draft/pending/queue events and community actor; findings accept only moderator provenance; risk factors accept only eligible codes/provenance. AI assessment fields, AI/allegation factors/findings, report objects, reporter metadata and exact scores are rejected. Unit tests plus independent negative probes confirm the boundary. A schema cannot decide whether a server has truthfully published/redacted free text: backend publication/DTO authorization gates remain required later. |
| **Member-private receipt contract** | **PASS** | `member.ts` clearly defines the signed-in member's own report summaries, receipt time and private dashboard; no other-member enumeration or platform report totals. The same report object, and `myReports` nested in public research, fail the public schema. Member Reports view renders its own submission time. Real owner scoping is a future API obligation, not enforced by a mock or hidden navigation. |
| **Provenance vs visibility** | **PASS** | All six vocabulary/legend categories retained. Public finding/factor eligibility is separately constrained; existence of a provenance value does not grant publication permission. |
| **Transfer wording** | **PASS** | Sender/Recipient counterparty labels; authorization explicitly relative to sending side; no attribution of incoming signatures to recipient. Unvalidated observations say “A log reports…”; association disclaimer remains. Incoming and unvalidated-log regressions passed. Wider delegated/malicious-log/victim scenarios remain Phase 3. |
| **Network selection** | **PASS** | Explicit chain restricts the address/transaction lookup or returns a clear selected-network mismatch. Unknown URL network produces unsupported result. Ambiguous chain=solana no longer recurses or falls back. Reviewed regression assertions and browser checks passed. |
| **Registration privacy** | **PASS** | Email-first registration; existing/new account response remains generic, with no password established at start. Handle copy now says visible to user and staff only; no public-report identity promise. Synthetic throttled/error fixtures demonstrate states, not account-existence checks. Backend timing/rate-limit enforcement remains an identity gate. |
| **Appeal copy** | **PASS** | Signing is one route; DNS and staff-reviewed documents cover lost keys, compromised/drained wallets, victims, former team members, ownership transitions, migrations and organization representatives. Corrections require no standing. Independence wording remains intact. |
| **CSP / headers** | **PASS** | Proxy no longer skips caller-marked prefetch. Twelve independent requests across three token pages and ordinary/purpose/next-router/sec-purpose headers returned nonce+strict-dynamic CSP, no-referrer and no-store. Normal and purpose-prefetch parser-injection browser probes both blocked unsigned inline script. No production unsafe-eval or broad inline script allowance introduced. Runtime CSS allowance remains a Phase 6 item. |
| **Production mock exclusion** | **PASS** | Fresh normal and mock builds, alias/stub inspection, exclusion script with mock positive control and additional fixture-canary scans passed. Production home/search HTTP probes contained no fictional research results; disconnected stub remains. Mock banner explicitly labels fictional data. |
| **Test script correction** | **PASS** | Root recursive `test` invokes only unit/component package scripts; e2e package now exposes `e2e`, not `test`. Root `test:e2e` invokes it separately and provisions its local server through Playwright. Actual `pnpm check` and isolated focused `pnpm test:e2e` both exited 0. Earlier author-reported root failure is explicitly corrected in Session 8; it is a process correction, not a new architecture blocker. |

### Original finding disposition

- **P1-01, P1-02:** Closed — fixes independently verified.
- **P1-03:** Current incorrect wording closed; wider scenario coverage remains non-blocking Phase 3 work.
- **P1-04, P1-06, P1-07:** Closed — headers, chain choice and privacy/standing copy independently verified.
- **P1-05:** Accepted non-blocking deferral. Individual observation times now render and overpromising attribution copy is removed. Bounded per-fact source references remain Phase 3, before real research data integration.
- **P1-08, P1-09, P1-10:** Closed — stage updated; formatting passes within the configured scope; Tab/Shift+Tab containment is asserted and passed.

### Independent verification results

All commands used the existing Node **24.21.0** runtime. No installed dependency or security-policy setting changed.

| Check | Actual result |
|---|---|
| Root `pnpm check` | **Exit 0**: formatting, lint, workspace type checks, recursive unit/component tests and normal production build all completed; e2e was not invoked |
| Formatting | All matched files pass; `.prettierignore` intentionally excludes Markdown, lockfile, generated output and dependencies |
| Unit/component suites | **36 contracts + 113 web = 149 passed**; 2 + 16 test files; 2.68 s and 113.68 s; no retries |
| Normal production build | Exit 0; 21 routes; mock mode unset |
| `node scripts/run-mock.mjs build` | Exit 0; 21 routes |
| Mock exclusion | Exit 0; production markers absent, mock positive control present, checked server-only names absent in browser builds |
| Additional fixture-canary scan | Zero matching production static/server files |
| Focused root `pnpm test:e2e --grep 'P1-|auth pages|mobile menu|no CSP violations' --workers=1` | **Exit 0, 25 passed / 1 intentional desktop skip**, 1.6 min; desktop/mobile Chromium, unchanged assertions and timeouts |
| Independent contract probes | All eight capability codes and private/AI/numeric/member-public boundary assertions passed |
| Independent token headers / script probes | Twelve header combinations passed; unsigned parser script blocked on ordinary and prefetch-marked HTML |
| Production HTTP smoke | Home and fixture-address search contained no mock marker or fictional finding; disconnected API error is expected |

**Unsuccessful verification is not omitted:** The first focused E2E invocation used two workers concurrently with the root check and an independent browser probe. Two tests exceeded 30 seconds **during page setup**, before application assertions, and the run was interrupted (exit 1). After other heavy work completed, the same selection passed in isolation with one worker and unchanged timeouts/assertions. This does not demonstrate an application regression; avoid concurrent heavyweight suites on this machine. The temporary HTTP helper also initially used Fetch's `status` property as a function; the reviewer corrected that helper outside the repository and reran it successfully.

Claude's **118 passed / 2 skipped** full correction-suite result remains author-reported evidence; this closure independently reran the relevant subset, not the full suite. Firefox/WebKit, manual screen-reader testing, gitleaks and coverage were not run. Backend gates were neither run nor satisfied by frontend tests. Review helpers/screenshots remain outside the workspace; local verification servers were stopped.

### Remaining blockers

**None for Phase 1 closure or seeking Phase 2 authorization.**

### Safe deferred work

- **Phase 3:** public per-fact source references and wider delegated/malicious-log/victim transfer scenarios; complete before integrating real research data.
- **Phase 6:** narrow runtime inline-style allowance without weakening script CSP.
- **Before public launch:** Firefox, WebKit, manual screen-reader journeys and gitleaks. These may be tackled earlier in authorized frontend phases and remain launch gates.
- Coverage and human visual/design acceptance retain their previous frontend quality scope. Interim handle rules and real scoring calibration are not silently ratified by this review.

### Recommended next step

**Owner explicitly authorizes Phase 2 — Frontend Account & Security Flows.** Codex has not authorized or begun it. Only this review document and `AI_HANDOFF.md` were changed; no application fixes or backend features were implemented during closure.
