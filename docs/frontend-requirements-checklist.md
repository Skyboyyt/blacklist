# Frontend Requirements Checklist (Phase 5)

| Field | Value |
|---|---|
| Status | Phase 5 audit, 2026-10-12; updated by the Phase 5 follow-up (remaining gaps and the administrator console) |
| Scope | PRD §4.1 V1 areas and the §5 functional requirements that have a frontend. Backend-only requirements are listed with their Phase 7 owner |
| Legend | **Done (mock)**: built against contracts and the mock service, with test evidence. **Partial**: built with a stated limit. **Gap**: not built in the frontend phases (reason given). **Backend**: no frontend work; enforced by the API |

Test evidence paths: unit tests are under `apps/web/src/**.test.ts(x)` and `packages/contracts/src/*.test.ts`; E2E specs are in `tests/e2e/specs/`. Every E2E spec runs on Chromium desktop and Pixel 7 (mobile).

## Visitors (public)

| Requirement (PRD) | Pages | Interaction | Evidence | Status |
|---|---|---|---|---|
| Universal search with explicit network (§5.5) | `/search`, header search | Exact address or transaction lookup; ambiguous input asks for a network; project names route to the directory | `research.spec.ts`, `search-bar.test.tsx`, `search-input-state.test.ts`, `search-results.test.tsx`, `classify.test.ts` | Done (mock) |
| Address research (§5.6) | `/address/[chain]/[address]` | Kind, balances, transfers with evidence level and authorization basis, disclosures separate from factors, findings with dispute state, history tab, unavailable data shown as unavailable | `research.spec.ts`, `risk-components.test.tsx`, `disclosures.test.tsx`, `transfers-table.test.tsx` | Done (mock) |
| Transaction research (§5.8, V1 part) | `/tx/[chain]/[hash]` | Status, finality, fee, transfers, involved addresses | `research.spec.ts` | Done (mock) |
| Project directory by network (§5.10) | `/projects` | Text or address search, network, category, findings status, sort, pages; filters kept in the URL | `projects.spec.ts`, `projects.test.tsx` | Done (mock) |
| Project profile and history (§5.10, §5.17) | `/project/[slug]` | Official addresses with their own assessments, domains, findings, responses, revision history, freshness | `projects.spec.ts`, `projects.test.tsx` | Done (mock) |
| Public score handling (P-11) | All public pages | Band and explanation only; no number anywhere public | `public-effects.test.ts`, `moderation-api.test.ts` (public data), contract strictness tests | Done (mock) |
| Public result of a review (§5.13) | Address and project pages | Approved finding appears with its explanation; appeal shows "Disputed — under appeal"; reversal removes it and the history says why; accepted correction adds a profile revision; accepted suggestion creates a profile listed in the directory | `journeys.spec.ts` (four journeys), `member-api.test.ts`, `public-effects.test.ts` | Done (mock) |
| Project risk ranking (scoreboard; ADR 0012 accepted band-only) | `/scoreboard` (linked from navigation and the directory) | Ranked by the highest official-address band; shared ranks within a band, A–Z; network filter in the URL; not-ranked list with reasons; no numbers | `scoreboard.test.ts`, `project.test.ts` (no score fields), `scoreboard.spec.ts` (ties, filter, a new finding moves a project, axe, 360 px) | Done (mock) |
| Transparency pages (§4.1, §6.7) | `/methodology`, `/privacy`, `/security`, `/terms` | Footer links on every page; methodology explains reviews and appeals; privacy, security and terms are **drafts pending legal review** | `journeys.spec.ts` (transparency) | Partial: legal review is a launch blocker |

## Members

| Requirement (PRD) | Pages | Interaction | Evidence | Status |
|---|---|---|---|---|
| Registration, activation, sign-in, reset, sessions (§5.1–§5.2) | `/register`, `/register/complete`, `/login`, `/forgot-password`, `/reset-password`, `/settings/security/*` | Email-first registration, token pages, re-authentication, session revocation | `auth.spec.ts`, `account.spec.ts`, Phase 2 unit tests | Done (mock) |
| Minimal profile: handle, display name (§5.3) | `/settings/profile` | Fixed handle shown; private display name can be set or cleared; markup refused | `suspension-responses.test.ts` (profile), `admin.spec.ts` | Done (mock); handle changes are not offered in V1 |
| Private scam report (§5.11) | `/reports/new` → `/reports/[id]` | Category, title, addresses per network, narrative, date, loss, transaction hashes per network, links as text, screenshots; client validation with field errors | `submissions.test.tsx`, `member-api.test.ts`, `journeys.spec.ts` | Done (mock) |
| Image-only evidence (§5.12) | All submission forms | PNG/JPEG/WebP, ≤ 10 MiB, ≤ 10 files, simulated progress, failure with retry and remove; metadata only, labelled as not uploaded or scanned | `submissions.test.tsx` (evidence upload) | Partial: real upload pipeline is Phase 7 (ADR 0004) |
| Track status and answer information requests (§5.11, §5.22) | `/reports/[id]` and the other status pages, `/dashboard`, `/notifications` | Member-visible history, staff request with reply form, withdrawal with confirmation, fixed-list reason, public outcome and link; stale actions reported with "Load the latest status" | `submissions.test.tsx`, `member-api.test.ts`, `journeys.spec.ts` (stale reply, reset) | Done (mock) |
| Project suggestion (ADR 0010 Part A) | `/projects/suggest` → `/projects/suggestions/[id]` | Private suggestion; states that it proves no ownership | `member-api.test.ts`, `staff-review.test.tsx`, `journeys.spec.ts` | Done (mock) |
| Profile correction (§5.18) | `/corrections/new?project=<slug>` → `/corrections/[id]` | Current profile shown; change description or domains; no standing needed | `journeys.spec.ts`, `member-api.test.ts` | Done (mock) |
| Appeal with per-case standing (§5.18; moderation §6, §9) | `/appeals/new?finding=<id>` → `/appeals/[id]` | Mechanisms offered by subject: control signature for wallets, authority signature for contracts and tokens (both **simulated and labelled**), documents reviewed by staff; the service refuses a mismatched mechanism; finding shows "under appeal" | `submissions.test.tsx`, `member-api.test.ts`, `suspension-responses.test.ts`, `journeys.spec.ts` | Partial: real signature, authority read and DNS verification are Phase 7 |
| Public subject response (§5.18; moderation §9) | "Respond as the subject" on address pages, "Respond as the project" on project pages → `/responses/new` → `/responses/[id]` | Plain-text response with standing (signature, authority signature, DNS on an official domain, or documents); staff moderate for safety; published with "a party that proved control … on <date>" | `suspension-responses.test.ts`, `admin.spec.ts` | Done (mock) |
| In-app notices (§5.22) | `/notifications`, dashboard | Own notices only, linked to the submission | `member-api.test.ts`, `journeys.spec.ts` (a11y) | Done (mock) |

## Staff

| Requirement (PRD) | Pages | Interaction | Evidence | Status |
|---|---|---|---|---|
| Review dashboard and queue (§5.23) | `/mod`, `/mod/appeals` | Counts, filters, pages, states; project suggestions included | `staff.spec.ts`, `staff-review.test.tsx` | Done (mock) |
| Case workspace and decisions (§5.13) | `/mod/cases/[id]` | Assignment, notes, decisions by type and status, confirmation and step-up, information requests and member replies, suggestion details with defanged links | `staff.spec.ts`, `staff-review.test.tsx`, `journeys.spec.ts` | Done (mock) |
| Independent approval of severe findings (§5.13) | `/mod/approvals` | Exact revision and hash; severe needs a non-author | `staff.spec.ts`, `moderation-api.test.ts` | Done (mock) |
| Standing decisions and independent appeal review (§5.18) | `/mod/cases/[id]` | Pending documentary standing granted or denied first; participants refused | `member-api.test.ts`, `journeys.spec.ts` | Done (mock) |
| Emergency suspension of a finding (§5.13; moderation §8.3) | `/mod/findings` → `/mod/cases/SUS-…` | Suspend with reason and step-up; public page shows only "Temporarily suspended pending review" and the finding stops counting; 72-hour review by a non-participant (reinstate or reverse; a severe finding cannot be reversed by its suspender); severe suspension alerts every admin | `suspension-responses.test.ts`, `admin.spec.ts` | Done (mock) |
| Admin: staff lifecycle, user suspension, labels, signal suppressions (§5.24; identity §10) | `/admin`, `/admin/staff`, `/admin/users`, `/admin/labels`, `/admin/signals` | Invitations (admin role needs a second admin; one-time code shown once), role changes (grants and removing another admin need a second admin; reductions immediate), staff suspension, offboarding, recovery (two verifiers, different approver, 24-hour objection window), member suspension (blocks submissions), public labels (never change the band), suppressions of analysis indicators only (shown publicly with reason) | `admin-api.test.ts`, `admin-public.test.ts`, `admin.spec.ts` | Done (mock); project management uses the correction and suggestion workflows |
| Audit viewer (§5.25) | `/admin/audit` | Administrators only, labelled mock | `staff.spec.ts` | Done (mock) |
| Staff WebAuthn enrollment, step-up, recovery (§4.1) | `/staff/*`, `/settings/security/staff` | Phase 2 flows | `account.spec.ts`, Phase 2 tests | Done (mock) |

## Cross-cutting

| Requirement | Evidence | Status |
|---|---|---|
| WCAG 2.2 AA (axe) on public, member, staff, admin and transparency pages | `a11y-security.spec.ts`, `staff.spec.ts`, `journeys.spec.ts`, `admin.spec.ts`, component axe tests | Partial: automated checks only; the full manual audit is Phase 6 |
| No horizontal scroll at 360 px | `projects.spec.ts`, `staff.spec.ts`, `journeys.spec.ts`, `admin.spec.ts` | Done (mock) |
| Light and dark themes | `theme.spec.ts` | Done |
| Private data never in public responses | `moderation-api.test.ts`, `public-effects.test.ts`, `journeys.spec.ts` (internal text absent from public pages) | Done (mock); enforced by the API in Phase 7 |
| Nothing sensitive in browser storage | Only mock cookies (`bl_mock_*`, fictional, no personal data) and the theme preference in `localStorage`; nothing from submissions is stored in the browser | Done |
| No executable previews, no raw HTML, links never fetched | Evidence shows names only; statements as text; links defanged | Done |
| Mock code absent from production builds | `check:mock-exclusion` (Phase 5 and admin markers added) | Done |
| Firefox and WebKit | Configured (`E2E_ALL_BROWSERS=1`) but not installed in this environment | Not run in Phase 5 |
