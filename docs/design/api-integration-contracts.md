# Blacklist — Frontend ↔ Backend Integration Contracts

| Field | Value |
|---|---|
| Status | **Phase 5 deliverable** (2026-10-12). Describes what the frontend already calls through typed interfaces and what the Phase 7 API must provide. Indicative: endpoint paths follow ARCHITECTURE §7.1 and are finalized with the backend gates |
| Code | Interfaces: [`apps/web/src/lib/api/types.ts`](../../apps/web/src/lib/api/types.ts). DTOs and request schemas: [`packages/contracts/src`](../../packages/contracts/src). Reference behaviour: the mock services in [`apps/web/src/lib/api/mock`](../../apps/web/src/lib/api/mock) |
| Related | [frontend.md](frontend.md), [moderation.md](moderation.md), [identity.md](identity.md), [chain-data.md](chain-data.md), ARCHITECTURE §7, §14, §22–§23, THREAT-MODEL §8, ADR 0004, ADR 0010 Part A |

The frontend talks to six interfaces. Replacing the mock adapter with an HTTP adapter must not change any component. **The mock services are reference behaviour, not authorization**: every rule below must be enforced by the API, server-side, at route and domain level (AGENTS §7).

## 1. Conventions the adapter maps

| Topic | API (ARCHITECTURE §7.1, §7.3) | Frontend result type |
|---|---|---|
| Transport | REST + JSON under `/api/v1`, cookie session, exact-Origin check on every mutation, `no-store` on private responses | Adapter-internal |
| Validation | Zod schemas from `@blacklist/contracts` at the API boundary; unknown fields stripped or rejected (strict objects) | The same schemas validate forms (UX only) |
| Errors | RFC 9457 problem details with a stable `code` | Discriminated results: `MemberResult`, `ModerationResult`, `ResearchResult`, `AccountActionResult`. Mapping in §6 |
| Hidden existence | Inaccessible private resources return 404 | `not_found` (never "forbidden" for someone else's submission) |
| Concurrency | Every mutation of a case or submission carries `expectedVersion`; mismatch → 409 | `conflict` with a reason; the UI offers "Load the latest version/status" and never retries silently |
| Idempotency | Creation endpoints accept an `Idempotency-Key` header | The HTTP adapter (Phase 7) must send one per form submission so a retry cannot create two submissions; today the forms only block double submits |
| Dates and IDs | ISO-8601 UTC; UUIDv7 IDs; on-chain integers as decimal strings | Displayed IDs (`RPT-…`) are mock conveniences; the UI treats IDs as opaque strings |

**Pagination — open integration decision.** ARCHITECTURE §7.1 specifies cursor pagination (max 100). The Phase 3–4 contracts use page numbers (`page`, `totalPages`; directory 6 per page, queue 8 per page) because the directory and queue show "Page N of M" and keep the page in the URL. Before Phase 7 either (a) the API offers offset pages for these two bounded, staff-curated lists, or (b) the contracts and UI move to cursors with previous/next only. Recommendation: (a) for the directory and queue (small, bounded), cursors elsewhere. Either choice is recorded in ARCHITECTURE §7.1.

## 2. `MemberApi` — the member's own submissions (Phase 5)

Contracts: `submissions.ts`. Audience: the signed-in member only. Every method returns `sign_in_required` without a session.

| Method | Endpoint (indicative) | Request | Success | Errors |
|---|---|---|---|---|
| `listSubmissions()` | `GET /me/submissions` | — | `MemberSubmissionSummary[]`, newest activity first | — |
| `getSubmission(id)` | `GET /me/submissions/:id` | — | `MemberSubmissionDetail` | `not_found` (missing **or not the caller's**) |
| `submitReport(r)` | `POST /reports` → `POST /reports/:id/evidence` (per file) → `POST /reports/:id/submit` | `reportRequestSchema` | `{ id }` | `invalid { fieldErrors }`, `temporarily_unavailable` |
| `submitSuggestion(s)` | `POST /project-suggestions` (+ evidence) | `suggestionRequestSchema` | `{ id }` | as above |
| `submitCorrection(c)` | `POST /corrections` (+ evidence) | `correctionRequestSchema` | `{ id }` | `invalid`, `not_found` (unknown project) |
| `submitAppeal(a)` | `POST /standing/claims` (signature/DNS/documentary) + `POST /findings/:id/appeals` | `appealRequestSchema` | `{ id }` | `invalid`, `not_found`, `conflict` (caller already has an open appeal on the finding) |
| `respond(id, v, r)` | `POST /me/submissions/:id/responses` | `infoResponseSchema` + `expectedVersion` | updated detail | `conflict`, `invalid_transition` (nothing was requested), `not_found` |
| `withdraw(id, v)` | `POST /reports/:id/withdraw`, `POST /appeals/:id/withdraw` | `expectedVersion` | updated detail | `conflict`, `invalid_transition` (a decision exists) |
| `listNotices()` | `GET /me/notifications` | — | `MemberNotice[]` | — |
| `getAppealTarget(findingId)` | `GET /findings/:id` + caller's open appeals | — | `AppealTarget` | `not_found` |
| `getStandingChallenge(findingId)` | `POST /standing/challenges` | — | `{ message, nonce }` | `not_found`, rate limited |

**Transitions the member can cause** (moderation §9–§10, ADR 0010 Part A):

| Kind | Member action | From → to |
|---|---|---|
| Report | submit | `draft → submitted` (screening and queueing are worker steps) |
| Report | reply | `needs_info → in_review` |
| Report | withdraw | any status before a decision → `withdrawn` |
| Project suggestion | reply | `needs_information → submitted` |
| Appeal | reply after denied standing | standing `denied → pending` (status unchanged) |
| Appeal | withdraw | `submitted`, `in_review` → `withdrawn`; "under appeal" ends only when no other appeal on the finding is open |
| Correction | — | No member transitions after submission (status set is a documentation gap: §8) |

**What the member view must never contain:** internal notes, internal rationales, staff identities or handles, other submitters, duplicate signals, screening flags, evidence state beyond "received". `memberSubmissionDetailSchema` is strict, so the API cannot add them by accident.

## 3. `ModerationApi` — staff review (Phases 4–5)

Contracts: `moderation.ts`. Audience: staff with WebAuthn assurance. Members and anonymous callers get `forbidden` on every method.

| Method | Endpoint (indicative) | Notes |
|---|---|---|
| `getQueue(q)` | `GET /mod/queue` | Filters: search, type, status (per type), chain, assignment, sort; page (see §1). Counts derived from records in the caller's scope |
| `getCase(id)` | `GET /mod/cases/:id` | Appeal reviewers see appeal cases only; other cases are `not_found` |
| `assign(id, v, target)` | `POST /mod/cases/:id/assignment` | `{ to: 'me' \| 'nobody', takeOver? }`; taking over needs `takeOver: true` |
| `addNote(id, v, text)` | `POST /mod/cases/:id/notes` | Internal only; append-only |
| `verifyStepUp(action, target)` | `POST /auth/staff/stepup/challenge` + WebAuthn assertion | Grant is single-use, bound to `action` and `target`, 5 minutes (identity §10.7) |
| `decide(id, v, decision)` | `POST /mod/cases/:id/decisions` (and the specific §7.1 routes) | `caseDecisionSchema`; check order below |
| `listRevisions()` / `approveRevision(f, n, hash)` / `rejectRevision(f, n, why)` | `POST /mod/findings/:id/approvals` | Approval binds to revision number **and** content hash; publication is a system effect in the same transaction |
| `getAuditLog()` | `GET /admin/audit` | `audit:read` (administrators) |
| `getProfileState(slug)` | `GET /projects/:slug` (staff fields) | Current revision and domains for correction review |

**Server check order for `decide`** (the mock implements exactly this): staff + assurance → scope → permission (ARCHITECTURE §9.2; `project:manage` for accepting corrections and suggestions; `standing:decide` for standing) → `expectedVersion` → allowed transition for type and status → assignment (only the assigned reviewer decides; `start_review` assigns) → independence (appeal participants refused for standing and appeal decisions; severe approvals need a non-author) → step-up grant for consequential decisions.

**Transitions** (moderation §9–§10, ADR 0010 Part A):

| Type | Transitions | Step-up |
|---|---|---|
| Report | `queued → in_review`; `in_review → needs_info / accepted / rejected / rejected_abusive` | accept, reject, reject as abusive |
| Appeal | `submitted → in_review`; while `in_review`: pending standing → granted / denied; with standing granted → `upheld / amended / reversed` | uphold, amend, reverse |
| Correction | `submitted → in_review → accepted / rejected` | accept, reject |
| Project suggestion | `submitted → needs_information / accepted_into_profile / not_accepted` | accept, do not accept |

**Effects the API performs in the same transaction** (the mock's `public-effects.ts` is the reference): `accept_report` creates a finding revision (never a publication); an approval publishes that exact revision and recomputes the assessment with the active ruleset; an appeal filing sets the derived "under appeal" state (never replacing "suspended"); `reverse` removes the finding and its risk factor from the current assessment (history is preserved, append-only); `accept_correction` creates a new project profile revision; `accept_suggestion` creates a staff project profile and links it; every decision appends audit rows and enqueues the submitter notification (§5).

## 4. `ResearchApi`, `AuthApi`, `AccountApi`, `StaffSecurityApi`

Unchanged since Phases 1–3 and specified in [frontend.md](frontend.md) §1, §7–§7b, [identity.md](identity.md) and [chain-data.md](chain-data.md). Phase 5 adds one field to the member dashboard: report status `needs_information` ("Information requested").

## 5. Backend capabilities the frontend depends on

| Need | Required behaviour | Source |
|---|---|---|
| **Durable storage** | Reports, report subjects and status history; project suggestions (`project_suggestions`, docs/data-model.md); corrections; standing claims; appeals; cases, assignments, notes; finding revisions, approval events; project profile revisions. Status histories and audit are append-only | data-model §4–§6 |
| **Uploads** | Per-file multipart upload with exact Origin, quota and 10 MiB streaming limit; quarantine → isolated processor → re-encoded derivative; states `upload_pending → quarantined → processing → available / rejected`. The frontend currently sends **metadata only** and must switch to uploading each file and attaching the returned evidence IDs to the submission. Upload progress and failures map to the existing `EvidenceUpload` states | ARCHITECTURE §14.3, ADR 0004 |
| **Audit** | Every assignment, note, decision, standing decision, approval, rejection, profile revision and withdrawal is audited (actor ref, action, target, request ID, allowlisted details) | ARCHITECTURE §23, ADR 0006 |
| **Notifications and email** | In-app notices for the submitter (received, information requested, decision recorded, standing decided, appeal decided). Email is optional and goes through the outbox; message text never contains private evidence or reasons beyond the fixed-list label; no bearer token in any link | identity §8, ARCHITECTURE §22 |
| **Sessions** | Cookie session from the identity design; member endpoints need a verified account; staff endpoints need WebAuthn assurance; consequential staff decisions need an action-bound step-up | identity §9–§10 |
| **Standing** | Real signature verification (EIP-4361-style text, nonce, expiry; never a transaction or typed-data signature), DNS TXT lookup with a case token, documentary review by staff; each grant has a scope statement | moderation §6 |
| **Server enforcement** | Ownership on every member read and write; role permissions; transitions; versions; independence; quotas (reports per day, evidence count and bytes, standing challenges per hour, appeals per finding); rate limits per route class | ARCHITECTURE §7.4, §9.2 |
| **Privacy** | Public responses use allowlisted DTOs (strict contracts); unreviewed reports and suggestions have no public effect; reporter and appellant identities never appear publicly | PRD §6.1, THREAT-MODEL §8 |

## 6. Error mapping

| HTTP / problem `code` | `MemberResult` | `ModerationResult` |
|---|---|---|
| 401 `unauthenticated` | `sign_in_required` | `forbidden` (session expired → `session_expired` on step-up) |
| 401 `staff_assurance_required` / step-up missing | — | `stepup_required` |
| 403 | — | `forbidden` with a reason |
| 404 | `not_found` | `not_found` |
| 409 `version_conflict` | `conflict` | `conflict` |
| 409 / 422 `invalid_transition`, `not_eligible` | `invalid_transition` | `invalid_transition`, `not_eligible` |
| 422 validation | `invalid { fieldErrors }` keyed by field path (`subjects.0.address`) | `invalid_transition` ("incomplete") |
| 429, 503 | `temporarily_unavailable` | thrown → page error state with retry |

## 7. Mock boundaries (what is simulated today)

- All data is fictional and lives in an in-memory store per demo session on the Next server (mock builds only). It is lost on restart; "Reset demo data" restores the fixtures.
- Roles, the passkey result and the session are mock cookies anyone can change: **the permission demonstrations are not production authorization.**
- Evidence: metadata only; nothing uploaded, scanned or previewed. Signature and DNS standing: simulated and labelled `SIMULATED`. Chain data: fixtures; no provider calls. Email: none.
- `POST /api/mock/rpc` exists only in mock builds (404 otherwise) and is replaced by the HTTP adapter in Phase 7; it must never be deployed as an API.

## 8. Open items before integration

1. Pagination model for the directory and queue (§1).
2. Correction statuses: the UI uses the interim set `submitted, in_review, accepted, rejected`; the moderation design does not yet define them (documentation gap since Phase 4).
3. Endpoint additions to ARCHITECTURE §7.1 for ADR 0010 Part A and the member submission views (`/project-suggestions`, `/me/submissions*`, `/mod/cases/:id/{assignment,notes,decisions}`).
4. Scoring sign-off (O-12) before staff scores leave "calibration proposal"; ADRs 0009, 0011 and 0012 remain Proposed.
