# Blacklist — Frontend Foundation and Design System

| Field | Value |
|---|---|
| Status | **Phase 5** (2026-10-12): member submission flows, connected member↔staff journeys on a shared mock store, transparency pages and backend integration contracts, on top of Phases 1–4. Implemented against `@blacklist/contracts` and mock adapters; no backend |
| Code | [`apps/web`](../../apps/web), [`packages/contracts`](../../packages/contracts) |
| Related | [ARCHITECTURE.md §15, §26, §36](../../ARCHITECTURE.md), [identity design](identity.md), [testing strategy §13](../testing-strategy.md) |

## 1. Architecture

```
UI (.tsx) ──► ResearchApi / AuthApi / AccountApi / StaffSecurityApi / ModerationApi / MemberApi / AdminApi (lib/api/types.ts) ──► adapter
                                                           ├─ mock (NEXT_PUBLIC_API_MODE=mock; dev/test only)
                                                           └─ "not connected" (every other build until Phase 7)
```

- **Server components** read through `getResearchApi()` (`lib/api/server.ts`, `server-only`). **Client components** use `getAuthApi()`, `getAccountApi()`, `getStaffSecurityApi()`, `getModerationApi()`, `getMemberApi()` and `getAdminApi()` (`lib/api/browser.ts`). Account and staff security pages load and mutate entirely through these interfaces, so connecting the real API later replaces the adapter, not the UI.
- **Mock exclusion is enforced twice.** Each import site is guarded by the literal `process.env.NEXT_PUBLIC_API_MODE === 'mock'`. The only import path, `blacklist-mock-api`, is aliased in `next.config.ts` to `lib/api/mock/index.ts` in mock builds and to a throwing stub otherwise. `pnpm --filter @blacklist/web check:mock-exclusion` proves the production build has no fixture markers, that the mock build does, and that no server-only names appear in browser bundles.
- **Mocks confer no authority.** The demo banner's preview controls set mock-only cookies (`bl_mock_viewer`: anonymous/member/moderator/admin; `bl_mock_scenario`: normal, cooling_period, session_expired, staff_recovery; `bl_mock_passkey`: the simulated authenticator result). They change what the mock returns, nothing else. Mock auth never stores, compares or logs passwords and creates no session. All mock security behaviour (re-authentication window, cooling, session revocation, enrollment, passkey results) is centralized in `lib/api/mock/account-api.ts`; components contain no fake state machines.
- **Fixtures** (`lib/api/mock/fixtures/`) are fictional (`0xb1ac…`, `Demo…`, `*.example.test`) and are parsed with the contract schemas when the mock loads and in tests.
- **Frontend validation is UX, not security.** Forms validate with the same Zod schemas the API will use; the API re-validates everything.

### Contract boundaries

| Contract | File | Audience | Admits |
|---|---|---|---|
| Public research | `packages/contracts/src/research.ts` | Anyone | Band + explanation; **risk factors only from the closed V1 set** (`finding.*` as `moderator_finding`; `token.symbol_impersonation`, `eoa.delegated_to_flagged` as `platform_analysis`); **disclosures** (capability facts, zero contribution) in a separate collection; **published moderator findings only**; public timeline events only (no report receipt, queue or draft events); no numeric score |
| Member-private | `packages/contracts/src/member.ts` | The signed-in member only | The member's own reports, including receipt time (`submittedAt`) and review status; own searches and notices |
| Member account security | `packages/contracts/src/account.ts` | The account holder only | Own email, handle, coarse session summaries (opaque revocation handle, device summary, times; no tokens, IPs or locations), own security activity, cooling period, re-authentication window, typed account errors |
| Staff security | `packages/contracts/src/staff.ts` | The staff member only, in an assured session | Their authenticators (opaque handle, label, kind, synced flag, dates; no credential IDs or keys), authenticator deficit, enrollment start results, passkey results, their own recovery progress (no reviewer identities). **No moderation or case data** |
| Staff moderation | `packages/contracts/src/moderation.ts` (Phase 4; project suggestions and standing decisions added in Phase 5) | Staff with WebAuthn assurance | Numeric score (calibration proposal), contributions, unreviewed reports, internal notes and rationales, submitter references |
| Member submissions | `packages/contracts/src/submissions.ts` (Phase 5) | The signed-in member only | Requests (report, project suggestion, correction, appeal with standing proof, information reply) and the member's own submission views: member-visible status and history, the information request, the fixed-list reason, the public outcome and link. **No internal notes, rationales or staff identities** |

All public objects are strict: unknown fields (score, `pendingReportCount`, reporter metadata, AI payloads) are rejected, so a future backend cannot leak them through the shared contract. Provenance labels and public visibility are separate concerns: "Community allegation" and "AI observation" remain defined labels for legends and future/private views, but no public V1 schema accepts them.

## 2. Tokens and theming

- Semantic colour variables live in `src/styles/globals.css` (`--bg`, `--surface`, `--text`, `--text-muted`, `--accent`, `--danger`, `--risk-*` …) and are exposed as Tailwind utilities (`bg-surface`, `text-muted`, `text-risk-severe`). Components never use raw palette colours.
- **Themes:** light, dark and system. `system` = no `data-theme` attribute, so CSS follows `prefers-color-scheme` (works without JavaScript). An explicit choice is stored in `localStorage` (`bl-theme`) and applied before first paint by `public/theme-init.js`, loaded synchronously with the CSP nonce. There is no flash, and no `dangerouslySetInnerHTML`.
- **Risk colours:** Low is a neutral blue-grey, never "safe" green. Every band also has a distinct glyph and a text label, so colour is never the only signal.
- **Typography:** system font stacks (no font downloads or third-party requests). Identifiers use `.identifier` (monospace, tabular numbers, no ligatures). `.identifier-wrap` allows full values to break anywhere; `truncateMiddle` produces `0x1234…cdef` for display only.
- **Motion:** `prefers-reduced-motion: reduce` disables animations and transitions globally; spinners and skeletons have explicit `motion-reduce` variants.

## 3. Layout

| Viewport | Pattern |
|---|---|
| ≥ 1024 px (`lg`) | Persistent sidebar (sections: Main, Account, Staff) + sticky header (search form, theme toggle, account) |
| < 1024 px | Header with a menu button opening a Radix dialog sheet (focus trap, Escape, focus return) + bottom tab bar (Home, Research, Dashboard, Reports) |
| Auth pages | Focused card layout, no navigation, persistent seed-phrase notice |

- A skip link targets `#main`; every page has exactly one `h1`; touch targets are at least 44 px on primary controls.
- The **staff section** appears only for staff viewers to reduce clutter. This is **not access control**: `(staff)` pages render no case data, and staff data will come only from the API with WebAuthn assurance.

## 4. Components

| Layer | Components |
|---|---|
| Primitives (`components/ui`) | Button / ButtonLink (loading state blocks double submit), Input, Textarea, Select (native), Checkbox (native), PasswordInput (show/hide, paste allowed), Field (label + hint + error wired with `aria-describedby`/`aria-invalid`), Badge, Tooltip (supplementary only), Dialog / Sheet, Tabs, Skeleton, Spinner, Icon |
| App (`components/app`) | PageHeader, DataCard, EmptyState, ErrorState, Notice, CopyableValue, ChainBadge, RiskBadge, Confidence, ProvenanceLabel, UntrustedText, StatusTimeline (shell), EvidenceThumbnail (shell), ReportStatusBadge, SeedPhraseNotice |
| Research (`components/research`) | AssessmentPanel, FactsList, FindingsList, TransfersTable, AddressResearchView, TransactionResearchView, ResearchProblem |
| Search (`components/search`) | SearchBar, DetectionStatus, SearchResults |

**When to use which:** a native element first (select, checkbox); a Radix primitive when native semantics are missing (dialog, tabs, tooltip); never put essential information in a tooltip.

## 5. Risk, disclosure and provenance wording

All wording comes from `src/lib/risk/copy.ts`:

- **Public risk = band + explanation**, plus key factors (provenance, relative weight in words, observed time), confidence, coverage, freshness ("As of", UTC) and dispute state. **No numeric score anywhere** (decision P-11); public DTOs are strict objects that reject a `score` field.
- Low = "No significant risk indicators found. This is not a guarantee of safety." Not assessed is never reassuring. "Not found" always says "This is not a sign that it is safe."
- **Disclosures** (mint/freeze authority, upgrade or pause authority, transfer hooks/fees, unverified source …) are capability facts with **zero contribution** in V1 (ADR 0005). They render in their own neutral "Disclosures" section (no band colours, no warning icons, "No effect on the assessment") and never appear among the assessment's factors or explain a band.
- Disputes: "Disputed — under appeal" (finding stays visible); "Temporarily suspended pending review".
- Provenance labels: Blockchain fact, Blacklist analysis, Community allegation, Moderator finding, AI observation, External source.
- Transfer fixtures cover incoming, outgoing, delegated (victim of an approval), unknown-authorization, unvalidated-log and spoofed-log cases (P1-03). Delegated outgoing transfers say "Moved under an allowance or delegation granted by the sending address." with no guilt wording.
- Transfers use neutral movement wording ("Incoming transfer of …"; "A log reports an outgoing transfer of …" when the evidence is only an unvalidated log), name the counterparty as Sender or Recipient, and describe authorization **relative to the sending side** ("Signed directly by the sending address."; "Who authorized this transfer is unknown."). Receiving a transfer is never presented as the recipient's action. The disclaimer that interacting with a flagged address does not mean wrongdoing is always shown.
- Blockchain facts and disclosures show finality (facts), their own observation time and a **public source label** (review P1-05): a short sanitized phrase naming the kind of source, such as "Finalized node read". The contract rejects links and over-long labels; provider names, credentials and internal receipts never appear.
- Attacker-controlled names (token symbols, self-descriptions) are rendered as plain text and marked "unverified".

## 6. Search states

Typing states live in the search box (`lib/search/search-input-state.ts`): idle → typing ("Detecting format…") → detected address / transaction, **"Address detected — choose network"**, unsupported network, or invalid identifier. Detection is a hint only.

Remote states come from the results page (`/search?q=&chain=`): loading (skeleton), results, choose network, not found, invalid identifier, unsupported network, provider unavailable, and unexpected error (route error boundary showing an opaque reference only). **An explicitly selected network is never silently replaced:** a mismatch returns "not a valid <network> address/transaction hash", and an unknown `chain` value returns "Network not supported".

## 7. Auth UX (mock)

- `/login`: email (`autocomplete=username`) + password (`current-password`), show/hide, forgot/register links, inline errors with focus on the first invalid field, no double submit, a generic "Email or password is incorrect", rate-limit and request-reference states, a human-verification challenge when throttling escalates (identity §12), and a validated same-origin `next`.
- `/register` is email-first and returns the same "Check your email" response whether or not an account exists. The handle is described as visible to the user and staff only (PRD §5.3: no public profiles in V1). `/register/complete`, `/reset-password` and `/email-change/confirm` read the token from the URL **fragment**, strip it with `history.replaceState`, keep it in memory only, and send it only on submit. They show missing, invalid, expired and used states and are served with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- Mock rules: `member@` signs in, `staff@` goes to `/staff/verify`, `limited@` is rate-limited, `error@` returns an unexpected error, `challenge@` asks for human verification first (all `@example.test`). Tokens starting `expired`, `used` or `invalid` produce those states; reset tokens starting `staff` belong to a staff account and need a passkey (the demo banner's passkey control picks the result).

## 7a. Account and security UX (Phase 2, mock)

Normative source: [identity design](identity.md). Everything below is presentation over typed contracts; the API (Phase 7) enforces every rule.

| Area | Route | Behaviour |
|---|---|---|
| Login | `/login` | As above, plus "temporarily unavailable", and a calm banner when returning after `reason=session_expired` or `staff_verification_expired`. Unknown email and wrong password are the same message. **Human verification:** on `human_verification_required` the fields are kept, a provider-neutral challenge (`HumanVerifierClient`, provider O-6) renders, and sign-in is retried once with its opaque response. A failed check offers a retry; an unavailable check fails closed (sign-in stays paused, retry offered). Non-mock builds have no provider yet and always fail closed |
| Logout | Sidebar, mobile menu, security page | POST-style action (no GET link), pending state, failure keeps you signed in and says so, then the public home page |
| Session ended | `(app)` pages | `SessionExpiredPanel`: explains without implying data loss; "Sign in again" carries the current path through `safeNextPath` (unsafe paths become `/dashboard`) |
| Registration | `/register`, `/register/complete` | Email-first; generic "Check your email"; invalid, expired, used and **superseded** link states; no terms checkbox (terms are a pending legal decision) |
| Reset | `/forgot-password`, `/reset-password` | Generic request answer; superseded link state; success explains that every session ends and email change pauses for **72 hours** (identity §6.3). **Staff reset:** `passkey_required` opens a WebAuthn step bound to the reset token; the password is resubmitted with the assertion and held only in component memory meanwhile. Cancelled, timed out, failed and unsupported (feature-detected) states retry without success; a link that expires meanwhile shows the expired state. Nothing changes until the assertion verifies |
| Security overview | `/settings/security` | Password, email, sessions, recovery, recent activity; staff see a link to their security keys |
| Password change | `/settings/security/password` | Current + new + confirm; reusing the current password rejected; incorrect current password marked on its field; other sessions end, this one stays (identity §6.4) |
| Email change | `/settings/security/email` | Blocked during cooling; re-authentication (10 minutes) when the API asks; the same answer whether or not the new address has an account; link to the new address (1 hour); the old address is told after the change (identity §7) |
| Sessions | `/settings/security/sessions` | Coarse device summary and times only; revoke one (confirmed); the current session can only sign out; already-ended sessions reported as done; revoke all others requires re-authentication |
| Staff keys | `/settings/security/staff` | Authenticators with a synced flag and failure-domain guidance; fewer than two raises a banner (7-day suspension rule); removal needs an action-bound step-up, then confirmation |
| Staff verify | `/staff/verify` | Passkey states: waiting, verified, cancelled, timed out, unsupported (feature-detected), failed, session ended; retry |
| Staff enrollment | `/staff/enroll` | Fragment token + 10-character out-of-band code (attempts remaining), password (sent once to the bound enrollment flow, then cleared from the form), two authenticators with honest "two registrations ≠ two devices" guidance, atomic activation. Activation is refused (`enrollment_incomplete`) unless the flow holds the password and two authenticators; an ended enrollment flow explains how to start over |
| Staff recovery | `/staff/recovery` | Explains the two-person process and shows the holder's own case progress (requested → identity verification (2) → second admin → 24-hour objection window → fresh enrollment → completed; rejected/cancelled). **No break-glass or bypass control exists in the UI** |

Reusable patterns: `ConfirmDialog` (consequences, cancel, pending, error; no typed phrases), `ReauthDialog`, `StepUpDialog` (bound to one action and target), `PasskeyPrompt` + `usePasskeyCeremony`, `SecurityBanner` (session ended, re-auth, cooling, change pending, recovery pending, staff verification), `CoolingPeriodNotice`, `SecurityActivity`, typed account errors with plain-language copy (`lib/auth/account-error-copy.ts`). Member MFA is post-V1 and is not shown as available.

Passwords: 15+ code points after NFKC, up to 128 and 512 bytes, no composition rules or expiry, paste and password managers supported. New-password fields show a live length count (not a strength meter) and a Caps Lock hint. Component state keeps at most a character count; passwords, tokens, codes and challenges never touch `localStorage`/`sessionStorage`.

## 7b. Project research UX (Phase 3, mock)

Normative sources: PRD §5.10 and §5.17 (V1 projects are staff-created profiles), ADR 0005 and P-11 (no public number). Proposed ADRs 0009–0011 (numeric score, project submissions and verification, extra EVM networks) are **not implemented**.

| Area | Route | Behaviour |
|---|---|---|
| Directory | `/projects` | Plain GET form (works without JavaScript; the URL is the source of truth): text search over names and official domains, or an official address; **Network** (all supported, Ethereum, Solana; list from `CHAIN_SLUGS`); category; findings status (any, has published findings, none, finding under appeal or suspended); sort (name, recently reviewed, most findings); 6 per page with previous/next links. An address query needs a network and is matched on that network only (`choose_network` otherwise; a wrong-network address is invalid). An unknown `chain` value shows "Network not supported" and is never silently dropped. States: loading skeleton, results, no results ("does not mean safe or unsafe"), empty directory, choose network, invalid query, provider unavailable, route error boundary |
| Cards | | Category, network badges, an official identifier (on the selected network when one is chosen), published-findings count, dispute state, partial/stale badge, last staff review date. **No band and no score:** projects have no combined rating in V1 |
| Detail | `/project/[slug]` | Identity (name, category, networks, slug identifier, description); "What this profile means" notice (staff-reviewed evidence, not endorsement or verification, no guarantee of safety or returns, no combined rating); last reviewed (revision), last updated, data status; partial/stale notice; **official addresses**, each with full copyable identifier, link to its own address research, attribution basis with date ("not proof of ownership or control"), its own assessment (band, explanation, approved factors, confidence, as-of, dispute state; "Assessment unavailable right now" when it cannot be loaded, never shown as not assessed or low) and its capability disclosures in a **separate** section; official domains as plain text; published findings with dispute state; responses with their standing mechanism; profile history |
| Entry points | | Signed out: "Sign in to respond, correct or appeal" → `/login?next=/project/<slug>`. Signed in: "Propose a correction" → `/corrections/new?project=<slug>` and "Report a concern" → `/reports/new`. Each published finding links "Appeal this finding" → `/appeals/new?finding=<id>`; the directory links "Suggest a project" → `/projects/suggest` (§7d). A link choice only; the API authorizes (Phase 7) |
| Risk ranking | `/scoreboard` | ADR 0012 (accepted, band-only): reviewed projects ranked by the highest band among their official addresses (on the chosen network). Ranks are shared within a band and listed A–Z; each row names the address that sets the band and how many addresses are assessed. Stale, unavailable, suspended, unassessed or low-confidence data is listed as "Not ranked" with the reason. No score, no "safest" list; methodology link and as-of time shown |
| Universal search | `/search` | A non-identifier query offers "Search project profiles" → `/projects?q=…` |

Mock rules: 14 fictional profiles (`fixtures/projects.ts`); each official address reuses or adds an address research record, so project and address pages agree. Directory query `provider-down-demo` → unavailable, `error-demo` → error boundary; detail slugs `demo-provider-down` and `demo-error` likewise.

## 7c. Staff review UX (Phase 4, mock)

Normative sources: [moderation design](moderation.md) (report lifecycle §10, approvals §4, independence §7, appeals §9), ARCHITECTURE §9.2 (roles), §15.6 (staff assessment DTO), data-model §5–§6. Staff DTOs live in `@blacklist/contracts` `moderation.ts` and are never part of a public response.

| Area | Route | Behaviour |
|---|---|---|
| Review dashboard | `/mod` | Counts derived from the case records in the caller's scope (open reports, waiting for information, open appeals, open corrections, unassigned, revisions awaiting approval). Filters: search (ID, title, address, project), case type, status (only the documented statuses of the chosen type), network, assignment (anyone / me / unassigned), sort (deadline with open cases first, newest, recent activity), 8 per page. States: loading, empty, error with retry, access denied |
| Appeal reviews | `/mod/appeals` | The dashboard locked to appeal cases |
| Case workspace | `/mod/cases/[id]` | Subject identity (network + full identifier, or project slug); private report narrative / appeal context (original decision with author and approver, grounds, standing scope) / correction (statement and current-vs-proposed table with the current public profile revision); evidence with source role, time, state, visibility (unavailable states explain why; images only as sanitized-derivative placeholders; statements as plain text; URLs defanged; nothing rendered as markup); staff assessment; decision panel; internal notes; case history (mock) |
| Decisions | | Offered by case type and status: report `queued → in_review`, `in_review → needs_info / accepted / rejected / rejected_abusive`; appeal `submitted → in_review`, then a pending documentary standing is granted or denied (`standing:decide`), then `upheld / amended / reversed` (only after standing is granted); correction `submitted → in_review → accepted / rejected`; project suggestion (ADR 0010 Part A) `submitted → needs_information / accepted_into_profile / not_accepted`, accepting needs `project:manage`; subject response `submitted → in_review`, standing first when documentary, then `published / rejected` (`response:moderate`); suspension review `open → reinstated / reversed` by a non-participant (a severe finding cannot be reversed by its suspender). Public explanation, reason shown to the submitter (fixed list) and internal rationale are separate, labelled fields. Consequential decisions: confirmation screen (consequences, public vs internal text) then an action-bound passkey step-up. Accepting a report drafts a finding revision; it never publishes |
| Approvals | `/mod/approvals` | Revisions with severity, author, content hash, public text and internal rationale. Approve or reject one exact revision after confirmation and step-up; publication is shown as a system effect. Severe revisions need an approver who authored no revision; outdated revisions and unavailable evidence are refused |
| Audit history | `/admin/audit` | Administrators only (`audit:read`). Actor, action, time, internal reason and field changes, labelled as mock history |
| Published findings | `/mod/findings` | Moderators and admins (`finding:suspend`). Emergency suspension with an internal reason and a step-up opens a 72-hour suspension review; a severe suspension alerts every admin (moderation §8.3) |

Enforcement lives in the mock service (`lib/api/mock/moderation-api.ts`), not in hidden buttons: staff check, scope (appeal reviewers see appeals only; other cases are `not_found`), role permission (`lib/staff/permissions.ts`, mirroring §9.2), optimistic version (`conflict`; case `RPT-1007` simulates another reviewer's edit on first action), transition, assignment (only the assigned reviewer decides; take-over needs confirmation), independence (appeal participants and severe-revision authors refused) and single-use step-up grants. Accepting a project-profile correction needs `project:manage` (administrators). Staff scores follow the §15.3 calibration proposal and are labelled "not signed off (O-12)"; `not_assessed` subjects are unscored. Mock viewers: `moderator`, `moderator_b`, `appeal_reviewer`, `admin`.

## 7d. Member flows and connected journeys (Phase 5, mock)

Normative sources: PRD §5.11–§5.12 and §5.18, [moderation design](moderation.md) §6 (standing), §9 (appeals), §10 (reports), ADR 0010 Part A (private project suggestions). Contracts: `submissions.ts`. Service: `MemberApi` (`lib/api/types.ts`); integration contract: [api-integration-contracts.md](api-integration-contracts.md).

| Area | Route | Behaviour |
|---|---|---|
| Report | `/reports/new` → `/reports/[id]` | Category, title, 1–5 addresses each with its own network (format checked per network), what happened, date, optional loss amount and asset, up to 10 transaction hashes (per network) and 10 links (kept as text, never fetched), screenshots. Private; an unreviewed report has no public effect |
| Project suggestion | `/projects/suggest` → `/projects/suggestions/[id]` | Name, category, network, contract or mint address, 1–5 official links, description, connection to the project, images. States that a suggestion, a wallet connection or an address never proves ownership |
| Correction | `/corrections/new?project=<slug>` → `/corrections/[id]` | Current profile shown; new description, add or retire an official domain (at least one change), reason, images. No standing needed |
| Appeal | `/appeals/new?finding=<id>` → `/appeals/[id]` | The finding being appealed, grounds, and a standing mechanism: a one-time message signature (**simulated**, shows the exact text, authorizes no transaction), a DNS TXT record (**simulated**), or documents reviewed by staff (explanation + at least one image). The finding shows "Disputed — under appeal" while the appeal is open |
| Submission status | `/reports/[id]` etc. | Member-visible status and history (no staff identities or notes), the staff information request with a reply form (message + images), withdrawal (before a decision, with confirmation), the fixed-list reason after a rejection, the published outcome and a link to the public page. Replies and withdrawals carry the version seen; a change made meanwhile is reported ("Load the latest status") instead of overwritten |
| Dashboard and notices | `/dashboard`, `/notifications` | "Your submissions" (all kinds, "Your reply is needed" when staff asked) and the member's own notices |
| Response | "Respond as the subject" (address pages), "Respond as the project" (project pages) → `/responses/new` → `/responses/[id]` | Plain-text right of reply (moderation §9) with standing fitted to the subject: control signature (wallets), authority signature (contracts and tokens), DNS on an official domain (projects), or documents. Published only after safety moderation, shown as "a party that proved control … on <date>" |
| Profile | `/settings/profile` | Fixed handle; optional private display name (PRD §5.3) |
| Transparency | `/methodology`, `/privacy`, `/security`, `/terms` | Linked from every page's footer. Privacy, security and terms are **drafts pending qualified legal review** (a launch blocker, PRD §6.7); methodology explains how reviews and appeals work |

**Evidence uploads are simulated.** `EvidenceUpload` validates type (PNG, JPEG, WebP), extension, size (≤ 10 MiB, non-empty) and count (≤ 10), shows simulated progress, simulates a failure for names containing "fail" (with retry and remove), and passes only **metadata** (name, type, size) to the service. No file content leaves the browser, nothing is previewed, and the UI says that nothing was uploaded or scanned.

**Shared demo store (mock builds only).** All mock services read and write one in-memory store per demo session on the Next server (`lib/api/mock/store.ts`). `proxy.ts` gives each browser an httpOnly `bl_mock_session` cookie (a random UUID; no personal data). Server components pass it to the research mock; client components reach the same store through the mock-only route `POST /api/mock/rpc` (`rpc-server.ts`): same-origin only, exactly `{ service, method, args }`, method allowlist shared with the browser client (`rpc-methods.ts`), at most 4 arguments; it answers 404 outside mock builds and its handler is a stub there. So a member's report, a moderator's decision and the public address or project page all see the same data. Public effects (`public-effects.ts`) follow the documented workflows: an approval publishes the finding and recomputes the band from the §15.3 proposal; an appeal marks "under appeal" (never downgrading a suspension) and its outcome upholds, amends or removes the finding; an accepted correction adds a profile revision; an accepted suggestion creates a staff profile. The banner's **Reset demo data** restores the fixtures for that browser only. The store is capped (500 sessions), lost on restart, and holds fictional data only. Nothing is kept in browser storage.

**Not production authorization.** Role restrictions in the mock services (ownership, permissions, independence, transitions, versions, step-up) demonstrate the expected API behaviour and keep the UI honest; they are not security controls. The mock viewer, passkey result and session are cookies anyone can set. The real API enforces all of it server-side (Phase 7).

## 7e. Administrator console (Phase 5 follow-up, mock)

Normative sources: PRD §5.24, identity §10 (staff lifecycle), ARCHITECTURE §9.2 and §9.4, moderation §8.3. Contracts: `admin.ts`; service: `AdminApi`, mock `lib/api/mock/admin-api.ts`.

| Area | Route | Behaviour |
|---|---|---|
| Overview | `/admin` | Counts of what waits on an admin; alerts every admin must see |
| Staff | `/admin/staff` | Staff list (masked email, roles, authenticator count); invitations (admin role waits for a second, different admin; the one-time enrollment code is shown once with delivery guidance); role changes (grants and removing another admin wait for a second admin; reductions immediate; the last admin is kept); suspension; offboarding (roles, authenticators and issued invitations revoked, cases released); recovery (two different verifiers, approval by a different admin, 24-hour objection window, then a re-enrollment invitation) |
| Members | `/admin/users` | Suspend or restore with an internal reason; a suspended member can read but not submit |
| Public labels | `/admin/labels` | Add (staff-verified or named external source) and retire; labels show on address pages and never change the band |
| Suppressions | `/admin/signals` | Analysis indicators only; the public assessment shows "Suppressed indicators" with the public reason; lifting restores the indicator |

Every consequential action goes through `ProtectedAction`: a confirmation screen (with an internal reason where required), then an action-bound security-key step-up, then the action. The service enforces the rules itself (active admin, two-person rules, step-up grants); a suspended or offboarded staff member loses access in the moderation service at once. Preview viewer `admin_b` is the second administrator. **None of this is production authorization.**

## 7f. Frontend quality pass (Phase 6, mock)

- **Finding revisions** (`/mod/findings/[id]`, linked from `/mod/findings`): the immutable history newest first with status, author, source case and content hash; the current public text; and an editor that names its exact base (revision number and hash). Saving proposes a new revision; nothing public changes until that revision is approved on `/mod/approvals`. A stale base reports a conflict with "Load the latest revision". The page says when an independent approver is needed (new or public revision severe) and when an open suspension review blocks publication.
- **Appeal amendment**: the "Amend finding" decision asks for the new severity and the amended public summary (labelled as becoming public only after approval) and creates a revision from the appeal case.
- **Recovery verification** (`/mod/recovery`, moderators and administrators): open recovery cases with the verifications so far and a "How did you verify identity?" field. It warns never to verify through the account email and never to ask for a password, recovery code or seed phrase.
- **Quality fixes from the audit**: the header keeps the menu button at 44 px and hides the brand name visually below 360 px; danger buttons use a theme token (`--danger-fg`) so system dark mode keeps contrast; tab panels keep the global focus outline; badges wrap instead of overflowing under WCAG 1.4.12 text spacing.
- **Audit spec** `tests/e2e/specs/quality-audit.spec.ts`: 39 routes at 320, 375, 768, 1024, 1280 and 1440 px and 740×360 landscape (no sideways scroll, no element wider than the viewport, controls ≥ 24 px), text spacing at 320 px, axe in dark theme, visible focus through 40 Tab presses on five pages, and dialog focus trap and restore.

## 8. Security headers

`src/proxy.ts` sets a per-request nonce CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`. It runs for **every** page and RSC request, including prefetch-marked ones, so document security headers never depend on caller-controlled request metadata (review P1-04). It also answers 400 to malformed path percent-encoding (malformed query strings render a normal UI state), and it never makes authorization decisions. `next.config.ts` adds `nosniff`, `Referrer-Policy`, `X-Frame-Options`, COOP and `Permissions-Policy`.

**Styles (narrowed in Phase 2):** in production, `<style>` elements need the per-request nonce (`style-src 'self' 'nonce-…'`). Radix's runtime scroll-lock styles receive it through `get-nonce` (`components/layout/style-nonce.tsx`). Style **attributes** remain allowed (`style-src-attr 'unsafe-inline'`): they cannot carry selectors, so the remaining CSS-injection risk is small. Removing that last allowance is tracked for Phase 6. Development keeps inline styles for hot reloading.

**No eval:** the CSP has no `'unsafe-eval'` in production, so Zod runs **jitless** (`packages/contracts/src/zod.ts`, imported by every contract module before any schema exists). Otherwise Zod 4 probes `Function('')` and Firefox reports a CSP violation. `apps/web` may import Zod types only (lint rule).

**`upgrade-insecure-requests`** is sent on real hosts but omitted for loopback hosts: WebKit applies it to `http://localhost` and breaks local production-mode runs. Real deployments rely on HTTPS and HSTS.

**Root background:** `<html>` carries the theme background as well as `<body>`, so iOS overscroll areas and contrast checkers never see default white.

**Focus return:** `DialogContent` records the element that opened a dialog (`onOpenAutoFocus`) and returns focus to it on close, including dialogs opened programmatically. Safari does not focus buttons on mouse click, so after a mouse click there may be no opener to return to; keyboard users always get focus back.

**Caching:** account, auth, staff and other private areas send `Cache-Control: no-store`, including prefetch requests (`NO_STORE_PREFIXES`); token pages also send `Referrer-Policy: no-referrer`.

## 9. Running

```
pnpm --filter @blacklist/web dev               # mock mode, http://localhost:3000
pnpm --filter @blacklist/web build             # production build (no mock; pages show "not connected")
pnpm --filter @blacklist/web build:mock        # mock build (.next-mock)
pnpm --filter @blacklist/web check:mock-exclusion
pnpm test:e2e                                  # Playwright + axe on the mock build (port 3100), Chromium desktop + mobile
E2E_ALL_BROWSERS=1 pnpm test:e2e               # also auth/account journeys in Firefox, WebKit and WebKit mobile
```

The demo banner's preview controls switch the fictional viewer, the account scenario and the simulated passkey result. Mock rules: re-authentication or current passwords starting with `wrong` fail; `limited@example.test` is rate-limited; `unavailable@example.test` is temporarily unavailable; the enrollment code is `DEMO2026AB`; token prefixes `expired`, `used`, `invalid`, `superseded`, `revoked` select those link states.

## Codex review repairs (2026-10-13)

The frontend now passes exact confirmed mutation arguments to mock step-up verification. Grants bind to the actor and demo session, expire after five minutes, are single-use and are invalidated on staff security transitions. Severe replacements require independent approval; unresolved suspension reviews block normal publication. New reported addresses get a minimal public record only when approved, with no invented chain facts. Stale profile corrections return a conflict and must be resubmitted against the latest profile. DNS standing is restricted to a project's official domains, never wallets/contracts/token addresses. These remain fictional mock behaviors; backend enforcement and acceptance gates are still Phase 7+.
