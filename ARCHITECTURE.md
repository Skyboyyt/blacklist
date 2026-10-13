# Blacklist — Technical Architecture

| Field | Value |
|---|---|
| Status | **Revision 3 — final Phase 0 closure corrections (Codex re-review V2-01–V2-05, owner decisions E-1 and P-11, frontend-first).** Awaiting a final Codex closure check. Phase 1 is **not** authorized |
| Stage | Pre-development / Architecture |
| Author | Claude (primary engineer) |
| Reviewer | Codex: [review](docs/reviews/2026-10-04-phase-0-codex-review.md) and [re-review](docs/reviews/2026-10-04-phase-0-codex-rereview.md) (APPROVED AFTER ADDITIONAL REQUIRED FIXES); this revision responds to both |
| Last updated | 2026-10-04 |
| Companion docs | [PRD.md](PRD.md) · [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md) · [THREAT-MODEL.md](THREAT-MODEL.md) · [docs/data-model.md](docs/data-model.md) · [docs/testing-strategy.md](docs/testing-strategy.md) · [docs/dependency-policy.md](docs/dependency-policy.md) |
| Normative design docs | [docs/design/identity.md](docs/design/identity.md) · [docs/design/moderation.md](docs/design/moderation.md) · [docs/design/chain-data.md](docs/design/chain-data.md) |
| Decisions | §34 (D-001…D-052) · [docs/adr/](docs/adr/README.md) (ADR 0001–0008) |

> Nothing in this document is implemented. Where a section says "Normative detail: docs/design/…", that design document is the single source of truth and this section only summarizes it.

### Revision history

| Rev | Date | Change |
|---|---|---|
| 1 | 2026-10-04 | Initial architecture |
| 2 | 2026-10-04 | Codex review response:<br>• library-first authentication (Better Auth, headless) and email-first registration (R-01, R-02);<br>• worker-generated security tokens (R-03);<br>• staff lifecycle (R-04);<br>• revision-bound approvals and multi-path standing (R-05, R-09);<br>• transfer authorization semantics with association disabled in V1 (R-06);<br>• snapshot-bound verification (R-07);<br>• image-only evidence in an isolated processor (R-08);<br>• private pending reports, tier combination, replayable assessments, stale-job protocol (R-10, R-11);<br>• honest audit claims and telemetry privacy (R-12);<br>• sanctions deferred (R-13);<br>• per-item evidence objects (R-14);<br>• a single exact-Origin policy (R-15);<br>• Foundation acceptance checks (R-16);<br>• Node 24 / TypeScript 6 baseline (R-17);<br>• SSR secret and separation rules (R-18);<br>• smaller V1 |
| 3 | 2026-10-04 | Closure corrections (ADR 0008):<br>• Blacklist-owned reset tokens with explicit delivery outcomes and an atomic reset transaction (V2-01, V2-02);<br>• per-account security version;<br>• E-1 accepted with mandatory mitigations;<br>• Solana same-slot-only agreement (V2-03);<br>• author / independent approver / system-publication terminology (V2-04);<br>• **frontend-first** phase plan (V2-05);<br>• V1 public risk = band + explanation (P-11);<br>• V1 scoring documented as strong-evidence-only;<br>• staff device and break-glass assurance wording |

## Contents

1. [Architectural drivers](#1-architectural-drivers)
2. [System context](#2-system-context)
3. [Technology decisions](#3-technology-decisions)
4. [Repository architecture](#4-repository-architecture)
5. [Runtime architecture and request flows](#5-runtime-architecture-and-request-flows)
6. [Frontend architecture](#6-frontend-architecture)
7. [Backend architecture](#7-backend-architecture)
8. [Authentication and account security](#8-authentication-and-account-security)
9. [Authorization model](#9-authorization-model)
10. [Wallet connection and ownership proofs](#10-wallet-connection-and-ownership-proofs)
11. [Blockchain integration](#11-blockchain-integration)
12. [Data architecture](#12-data-architecture)
13. [Research features](#13-research-features)
14. [Reports, evidence and moderation](#14-reports-evidence-and-moderation)
15. [Risk engine](#15-risk-engine)
16. [Verification](#16-verification-post-v1)
17. [Responses and appeals](#17-responses-and-appeals)
18. [Community intelligence](#18-community-intelligence-post-v1)
19. [Investigation workspace](#19-investigation-workspace-post-v1)
20. [Notifications and alerts](#20-notifications-and-alerts)
21. [Search](#21-search)
22. [Background jobs](#22-background-jobs)
23. [Audit logging](#23-audit-logging)
24. [Observability](#24-observability)
25. [Privacy and retention](#25-privacy-and-retention)
26. [Security architecture](#26-security-architecture)
27. [Database migrations](#27-database-migrations)
28. [Dependency policy](#28-dependency-policy)
29. [CI/CD](#29-cicd)
30. [Deployment topology](#30-deployment-topology)
31. [Testing strategy](#31-testing-strategy)
32. [Scalability and performance](#32-scalability-and-performance)
33. [Hard questions](#33-hard-questions)
34. [Decision log](#34-decision-log)
35. [Open and deferred decisions](#35-open-and-deferred-decisions)
36. [Implementation phases](#36-implementation-phases)
37. [Self-review record](#37-self-review-record)

---

## 1. Architectural drivers

### 1.1 Quality attributes (in priority order)

1. **Correctness of claims.** Provenance is preserved end to end. Association and transfer direction never become guilt. History is never destroyed or silently recomputed.
2. **Security.** Account takeover, staff compromise, hostile uploads and authorization bugs are the highest-impact failures.
3. **Privacy.** Account data, research activity, reports under review and reporter identity never leak.
4. **Explainability and auditability.** Every score, finding and staff action can be reconstructed as it was at the time.
5. **Provider independence and resilience.** No single blockchain data vendor can take the product down or lock it in.
6. **Simplicity.** A small team (two AI agents + owner) must be able to build, review and operate it. Every component earns its place, and V1 is deliberately small.
7. **Performance and scalability.** Adequate for launch, with known upgrade paths.

### 1.2 Constraints

- TypeScript across the stack; Node.js 24 LTS; TypeScript 6.x (ADR 0007).
- No paid services configured, no infrastructure purchased, during the architecture stage.
- No own blockchain node/indexer at launch.
- Solana + EVM (Ethereum mainnet as reference) from V1.
- Wallet connection is never an authentication method.
- Qualified legal review is a **pre-launch blocker** (PRD §10), not a blocker to engineering.
- **Frontend-first execution** (owner decision): the primary frontend is built and reviewed against typed contracts and mocks before production backend features (§36, ADR 0008).

### 1.3 Architectural style

**Modular monolith** sharing one codebase and one PostgreSQL database, with **four** deployable processes:

| Process | Responsibility |
|---|---|
| `apps/web` | Next.js user interface. Renders pages and calls the API. **No database access, no domain logic.** Its server runtime holds exactly one secret (the internal API token, §5.3) |
| `apps/api` | Fastify HTTP API: authentication (Better Auth headless + Blacklist identity policy), authorization guards, validation, calls into domain modules |
| `apps/worker` | pg-boss job runner executing the same domain modules asynchronously (security emails, recomputation, evidence orchestration, verification) |
| `apps/evidence-processor` | **Isolated** image sanitizer: no database credentials, no application secrets, no network except scoped object-store URLs (§14.3) |

Microservices remain rejected. The evidence processor is separate **only** to isolate hostile-file parsing from credentials (ADR 0004).

---

## 2. System context

```
                         ┌──────────────────────────────────────────────┐
  Browser (desktop/      │                 Edge / CDN                    │
  tablet/mobile) ─HTTPS─►│ TLS · WAF · DDoS · bot mgmt · coarse limits   │
                         └───────────────┬───────────────┬──────────────┘
                                         │ /api/*        │ everything else
                                         ▼               ▼
                              ┌────────────────┐   ┌────────────────┐
                              │   apps/api     │◄──│   apps/web     │ SSR: GET-only internal
                              │   (Fastify)    │   │   (Next.js)    │ calls, forwards cookie
                              └──┬───┬───┬──┬──┘   └────────────────┘
                                 │   │   │  │
              ┌──────────────────┘   │   │  └───────────────────────┐
              ▼                      ▼   ▼                          ▼
     ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────────────┐
     │  PostgreSQL     │   │ Object storage   │   │ Blockchain data providers     │
     │  system of      │   │ (S3-compatible)  │   │ Solana RPC/DAS · EVM RPC ·    │
     │  record + jobs  │   │ quarantine /     │   │ indexed history · explorer    │
     │  (pg-boss)      │   │ evidence /       │   │ (via packages/chains)         │
     └────────▲────────┘   │ derivatives      │   └──────────────▲───────────────┘
              │            └──▲──────────▲────┘                  │
              │               │ scoped   │                       │
     ┌────────┴───────────────┴──┐  presigned URLs only          │
     │   apps/worker (pg-boss)   │───────────┐                   │
     │ security emails · verify ·│           ▼                   │
     │ recompute · finality ·    │  ┌────────────────────────┐   │
     │ evidence orchestration ·  │  │ apps/evidence-processor│   │
     │ cleanup · health probes   │──┼──(no DB, no secrets,   │   │
     └──────┬────────────────────┘  │  no other egress)      │   │
            ▼                       └────────────────────────┘   │
     ┌───────────────┐   External (public, free): HIBP range API,│
     │ SMTP provider │   human-verification provider (TBD), ─────┘
     └───────────────┘   controlled DNS resolver (standing checks)
```

**Trust boundaries:** see THREAT-MODEL.md §3. The evidence processor is its own boundary: it treats input as hostile and holds nothing worth stealing.

---

## 3. Technology decisions

Every major dependency has a reason. Versions are pinned when each package is first installed (frontend packages in Phase 1, backend packages in Phase 7) under the dependency policy (≥ 7-day release age). Current majors observed on 2026-10-04 are listed for orientation.

| Concern | Decision | Why | Rejected alternatives |
|---|---|---|---|
| Language | **TypeScript** (strict) | One language for web, API, worker and shared schemas | Go/Rust API (splits codebase and validation) |
| Runtime | **Node.js 24 LTS only** (`>=24.20.0 <25`; latest 24.21.0) | Stable LTS. Node 26 is Current, not LTS (ADR 0007) | Node 26 now; Bun/Deno |
| Type checker | **TypeScript 6.x** (6.0.3) | Ecosystem-compatible (Next.js, typescript-eslint). TypeScript 7 lacks a programmatic API for tooling (ADR 0007) | TypeScript 7 now |
| Web | **Next.js App Router, React** (16 / 19) | SSR/streaming for public research pages; server components keep logic off the client | SPA; Remix |
| API | **Fastify** (5) | Hook lifecycle for auth/authz/rate-limit plugins; pino logging | Next.js route handlers/server actions as the API; NestJS; Express |
| Authentication | **Better Auth, headless** (router not mounted, no plugins) for credential and session primitives, plus a Blacklist identity domain for every policy | Library-first (owner decision). Source-inspected fit; gaps closed by Blacklist-owned flows (ADR 0001, [identity design](docs/design/identity.md)) | Custom core (fallback only); Ory Kratos (extra service); hosted IdP; Auth.js |
| Password hashing | **Argon2id** (`@node-rs/argon2`) via Better Auth hash/verify hooks | OWASP-recommended; no install scripts | bcrypt (72-byte truncation) |
| Staff WebAuthn | `@simplewebauthn/server` / `browser` | Focused, maintained; staff assurance is Blacklist policy | Better Auth passkey plugin (semantics don't match staff assurance) |
| Validation | **Zod** (4) | Shared runtime validation and types | — |
| Database | **PostgreSQL 17 or 18** (chosen with hosting) | Constraints, composite FKs, partial indexes, CTEs, FTS + trigram | MongoDB; graph DB |
| Data access | **Drizzle + drizzle-kit**, committed SQL migrations, **conditional on acceptance checks D1–D9** (ADR 0007) | Typed SQL-shaped queries; reviewable SQL | Kysely (fallback if checks fail); Prisma |
| Jobs | **pg-boss** with transactional enqueue (proven by check D6) | No extra infrastructure; jobs commit or roll back with state | Redis + BullMQ |
| Cache / shared limits | **None in V1** | Single instance per process at launch | Redis on day one |
| Object storage | **S3-compatible** (MinIO locally) | Portable; versioning and object lock | DB blobs |
| Image sanitizing | **sharp (libvips)**, only inside `apps/evidence-processor` | Strict decode/re-encode; native code confined to an isolated, credential-free process | Processing in the general worker (credential exposure) |
| Malware scanning | **Deferred** (ADR 0004) | Image-only input, re-encoded, originals never rendered | ClamAV in V1 (little value for re-encoded images) |
| Email | SMTP provider (O-7); **Mailpit** locally | Provider-agnostic | Provider SDK lock-in |
| EVM / Solana | **viem** / **@solana/kit** | Typed, maintained | ethers; web3.js v1 |
| UI | **Tailwind CSS** + **Radix** primitives | Accessible primitives; no runtime CSS-in-JS | Heavy component frameworks |
| Client data / forms | **TanStack Query** (client components) · **React Hook Form** + Zod | Interactive views (search, report forms, staff queues) | Global stores |
| Logging / telemetry | **pino** · **OpenTelemetry** · Sentry-compatible errors (O-5) | Structured, vendor-neutral | — |
| Testing | **Vitest**, **Testcontainers**, **Playwright** | Real Postgres; real browsers | DB mocks; Jest |
| Package manager | **pnpm 12.7.0** workspaces, supply-chain settings | Strict isolation, blocked install scripts, release-age and trust policies | npm, Yarn |
| Orchestration | None | Small workspace | Turborepo/Nx |
| Search | PostgreSQL FTS + `pg_trgm` + exact indexes | Sufficient | Search engines |

---

## 4. Repository architecture

### 4.1 Monorepo (pnpm workspaces)

Web, API, worker and processor share contracts, domain types and chain normalization. One repository gives agents one rulebook.

### 4.2 Layout

```
blacklist/
├── apps/
│   ├── web/                 Next.js UI. UI only; one server-only env module for the internal API token.
│   ├── api/                 Fastify: plugins (session policy, origin, rate limit, guard, errors) + thin routes + operator CLI.
│   ├── worker/              pg-boss handlers → domain services.
│   └── evidence-processor/  Isolated image sanitizer (no DB, no secrets).
├── packages/
│   ├── core/                Dependency-free primitives (chain/address brands, provenance, risk bands).
│   ├── contracts/           Zod request/response schemas (web + api).
│   ├── domain/              Server-only business logic, src/<module>/.
│   ├── db/                  Drizzle schema, SQL migrations, client, roles/grants.
│   ├── chains/              Chain registry, family adapters, provider clients, router.
│   ├── config/              Server-only env validation for api and worker.
│   └── testing/             Harnesses, fixtures, provider fakes.
├── tests/e2e/               Playwright.
├── infrastructure/          Local dev services (Phase 7); deployment IaC after hosting decision.
├── docs/                    Data model, design docs, testing, dependencies, ADRs, reviews.
└── .github/                 PR template; CI workflows from Phase 1 (frontend checks first).
```

### 4.3 Boundary rules (enforced by package dependencies and lint rules from Phase 1, including relative paths and subpath exports)

Frontend phases install only frontend-side packages (`apps/web`, `core`, `contracts`, a mock API client). Server packages stay empty until Phase 7.

| Package | May import | Must never import |
|---|---|---|
| `apps/web` | `core`, `contracts` | `domain`, `db`, `chains`, `config`. Server-only modules (`import 'server-only'`) read the two SSR variables (`API_INTERNAL_URL`, `INTERNAL_API_TOKEN`) themselves; browser bundles hold no secrets |
| `apps/api` | `core`, `contracts`, `domain`, `config` | `db` from route handlers |
| `apps/worker` | `core`, `domain`, `config` | `apps/*` |
| `apps/evidence-processor` | `core` | `domain`, `db`, `chains`, `config`, any secret |
| `packages/domain` | `core`, `db`, `chains`, `config` | `apps/*`, `contracts` |
| `packages/chains` | `core` | `db`, `domain` |
| `packages/db` | `core` | `domain`, `chains` |
| `packages/contracts` | `core`, `zod` | server-only code |
| `packages/core` | nothing | everything |

Internal packages use the `@blacklist/*` scope with `workspace:` references only (dependency-confusion defense).

### 4.4 Language, file-type and module separation

Binding rule in [AGENTS.md §7](AGENTS.md#7-engineering-rules) and [ESSENTIALS §16](ARCHITECTURE-ESSENTIALS.md#16-language-file-type-and-module-separation):

- `.tsx` for React UI; `.ts` for logic; Tailwind/CSS for styling; `.sql` for migrations; `.json`, `.yaml`, `.md` and `.env*` as usual.
- No standalone HTML.
- No new languages without an ADR.
- No monolithic files mixing UI, styling, handlers, business logic, authentication, database access, provider code, validation or infrastructure.

---

## 5. Runtime architecture and request flows

### 5.1 Same-origin deployment

Browser pages and `/api/*` share one origin. The edge routes `/api/*` to `apps/api`. Cookies are `__Host-` prefixed. There is no CORS. The single origin/CSRF policy is [identity design §11](docs/design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15). Locally, Next.js rewrites `/api/*` to the API. Unprefixed cookie names are allowed only when `NODE_ENV=development`.

### 5.2 Browser → API

All mutations originate in the browser and go directly to the API, so exact-Origin checks apply to the real client.

### 5.3 Server-side rendering → API

- Next.js server components call `API_INTERNAL_URL` over the private network, **GET only**. They forward the incoming `cookie` header plus `x-bl-client-ip` and `x-bl-internal-token`.
- The API honours the client-IP header **only** with a valid internal token, and rejects non-GET methods on the internal path.
- The token lives in `apps/web/src/server/env.ts` (`server-only`). A build-time bundle scan proves it never reaches the browser.
- Personalized responses use `cache: 'no-store'` and are never cached by Next.js or the CDN.

### 5.4 Request lifecycle in `apps/api`

```
request
 → request-id + redacting logger (route templates, no raw paths)
 → security headers
 → trusted-proxy client-IP resolution
 → rate limit by route class
 → exact-Origin check for non-GET/HEAD/OPTIONS (identity §11)
 → session: Better Auth lookup (DB, cookie cache off) → Blacklist session policy
     (account status, idle/absolute limits by account kind, staff WebAuthn assurance) → Actor
 → route guard: declared auth level + permission (default deny; startup fails if a route lacks a policy)
 → Zod validation (unknown keys stripped)
 → domain service (policy + ownership + state checks, one transaction, jobs enqueued in it)
 → allowlisted DTO mapping
 → response or RFC 9457 problem+json
```

### 5.5 Worker lifecycle

`job → Zod-validated payload (identifiers only, never tokens or trusted authority) → reload authoritative state → expected-revision/state check (§22) → domain service with a least-privilege system actor → idempotent effect → completion`. Retries use exponential backoff; dead-letter after the budget.

---

## 6. Frontend architecture

### 6.1 Routing (App Router route groups)

`[chain]` is a registry slug (`ethereum`, `solana`) mapped to CAIP-2 server-side.

| Group | Routes (V1) | Access |
|---|---|---|
| `(public)` | `/`, `/search`, `/address/[chain]/[address]`, `/tx/[chain]/[hash]`, `/projects`, `/project/[slug]`, `/scoreboard` (band ranking, ADR 0012), `/finding/[id]`, `/methodology`, `/terms`, `/privacy`, `/security` | Anyone |
| `(auth)` | `/login`, `/register`, `/register/complete`, `/forgot-password`, `/reset-password`, `/email-change/confirm`, `/staff/enroll`, `/staff/verify` | Token/flow pages per [identity design](docs/design/identity.md); tokens travel in URL fragments |
| `(app)` | `/dashboard`, `/reports`, `/reports/new`, `/reports/[id]`, `/appeals/new`, `/appeals/[id]`, `/responses/new`, `/responses/[id]`, `/corrections/new`, `/corrections/[id]`, `/projects/suggest`, `/projects/suggestions/[id]` (ADR 0010 Part A), `/notifications`, `/settings/profile`, `/settings/security` (password, email, sessions) | Signed-in member or staff |
| `(staff)` | `/mod`, `/mod/cases/[id]`, `/mod/approvals`, `/mod/appeals`, `/mod/findings` (emergency suspension), `/mod/standing`, `/admin`, `/admin/staff`, `/admin/users`, `/admin/projects`, `/admin/labels`, `/admin/signals`, `/admin/audit` | Staff session with WebAuthn assurance. In the frontend phases standing is decided in the case workspace (`/mod/cases/[id]`) and project profiles are managed through correction and suggestion cases, so `/mod/standing` and `/admin/projects` have no separate page yet |
| Deferred | `/u/[handle]`, `/watchlists/*`, `/investigations/*`, `/trace/*`, `/graph/*`, `/leaderboard`, `/claims/*` | — |

### 6.2 Authentication integration

- The root layout fetches `GET /api/v1/auth/session` server-side and exposes a minimal **viewer** to client components: `id`, `handle`, `accountKind`, display-only `roles`, `staffAssurance`.
- Protected layouts redirect to `/login?next=<validated relative path>`. This is UX only; the API enforces every rule.
- `proxy.ts` (Next 16; formerly `middleware.ts`) handles CSP nonces and coarse redirects only, **never** authorization.
- Token pages read the token from the URL **fragment**, remove it with `history.replaceState`, and submit it by POST. They load no third-party resources.

### 6.3 Server/client boundaries

Server-only modules import `server-only`. Only `NEXT_PUBLIC_*` values reach the browser, and none are secret (CI bundle scan). Data display defaults to server components; client components handle interactivity.

### 6.4 Data fetching and state

Public research sections are server components wrapped in `<Suspense>` and streamed, so slow provider calls don't block the page. Interactive authenticated data uses TanStack Query against the same origin. Filters and pagination live in URL params. Local UI state is React state; there is no global store.

### 6.5 Forms

React Hook Form + Zod schemas from `@blacklist/contracts`. Problem+json field errors map back onto fields. Submissions are disabled while pending. `Idempotency-Key` is sent on report, evidence, appeal, response and correction creation.

### 6.6 Errors and loading

`error.tsx` shows a friendly message plus the request ID. `not-found.tsx` is used for missing **and** inaccessible resources. Section skeletons. Degraded-provider banners show "showing data as of <time>".

### 6.7 Responsive design and accessibility

Mobile-first. Tables collapse to cards. Long addresses are middle-truncated with exact-value copy. Touch targets ≥ 44 px. WCAG 2.2 AA. Light/dark themes. Reduced motion respected.

### 6.8 Frontend security boundaries

- No `dangerouslySetInnerHTML`; user and chain text render as plain text.
- `SafeExternalLink` with an interstitial; reported URLs shown **defanged** and not clickable.
- Token names/symbols marked "as reported on-chain (untrusted)".
- Lookalike-address highlighting.
- Wallet connection (EIP-6963; Solana Wallet Standard) is used **only** for standing-proof message signatures (§10). It never requests `eth_sign`, typed data or transaction signatures.

---

## 7. Backend architecture

### 7.1 API structure

- REST + JSON under `/api/v1`; cursor pagination (max 100); ISO-8601 UTC; UUIDv7 IDs; on-chain integers as decimal strings.
- Errors: RFC 9457 with a stable `code`; no stack traces, SQL or provider bodies.
- REST over GraphQL/tRPC: simpler authorization, and suits a future public API.

Indicative V1 endpoint groups:

| Group | Examples |
|---|---|
| Auth | `POST /auth/register/start`, `POST /auth/register/complete`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/password/forgot`, `POST /auth/password/reset/challenge`, `POST /auth/password/reset`, `POST /auth/reauth`, `GET /auth/session` |
| Staff auth | `POST /auth/staff/webauthn/challenge`, `POST /auth/staff/webauthn/verify`, `POST /auth/staff/stepup/challenge`, `POST /staff/enroll/*` |
| Account | `GET/PATCH /me`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others`, `POST /me/password`, `POST /me/email-change`, `POST /me/email-change/confirm` |
| Research | `GET /search`, `GET /addresses/:chain/:address`, `…/transactions`, `…/assessment`, `…/assessment/history`, `GET /transactions/:chain/:hash`, `GET /projects` (directory: query, chain-scoped address match, category, findings status, sort, page), `GET /projects/:slug`, `GET /projects/scoreboard` (band-only, ADR 0012), `GET /findings/:id` |
| Reports | `POST /reports`, `PATCH /reports/:id`, `POST /reports/:id/evidence`, `POST /reports/:id/submit`, `POST /reports/:id/withdraw`, `GET /me/reports` |
| Member submissions | `GET /me/submissions`, `GET /me/submissions/:id`, `POST /me/submissions/:id/{reply,withdraw}`, `POST /project-suggestions` (ADR 0010 Part A) |
| Redress | `POST /standing/challenges`, `POST /standing/claims`, `POST /subjects/:id/responses`, `POST /findings/:id/appeals`, `POST /corrections` |
| Notifications | `GET /me/notifications`, `POST /me/notifications/read` |
| Moderation | `GET /mod/queue`, `GET /mod/cases/:id`, `POST /mod/cases/:id/{assignment,notes,decisions}`, `GET /mod/findings`, `GET/POST /mod/findings/:id/revisions`, `POST /mod/findings/:id/approvals`, `POST /mod/findings/:id/publish`, `POST /mod/findings/:id/suspend`, `POST /mod/standing/:id/decision`, `POST /mod/appeals/:id/decision`, `GET /mod/recovery`, `POST /mod/recovery/:id/verifications` (identity §10.11 step 2) |
| Admin | `GET /admin/overview`, `/admin/staff/*` (invitations, role requests, suspensions, recovery, offboarding), `/admin/users/*`, `/admin/projects/*`, `/admin/labels/*`, `/admin/signals/suppressions`, `/admin/audit` |
| Ops (internal only) | `GET /healthz`, `GET /readyz` |

The frontend's typed service interfaces, the member submission views (ADR 0010 Part A) and the endpoint additions they need are specified in [docs/design/api-integration-contracts.md](docs/design/api-integration-contracts.md) (Phase 5); that document's open items are resolved here before Phase 7.

### 7.2 Domain modules (`packages/domain/src/<module>`)

Each module exposes `index.ts` only.

| Module | Owns | V1 |
|---|---|---|
| `access` | Code-defined roles and permissions, `Actor`, policy helpers | Yes |
| `identity` | Better Auth integration (headless), registration intents, email change, session policy, staff accounts/invitations/authenticators/assurance/step-up/recovery, throttling, cooling periods | Yes |
| `audit` | Audit log (append function, hash chain, actor identity map), security events | Yes |
| `subjects` | Subject registry (addresses, projects, domains), public labels | Yes |
| `chaindata` | Pinned finalized facts, verification receipts and records, invalidations | Yes |
| `projects` | Staff-managed projects/entities, official addresses and domains, revisions | Yes |
| `evidence` | Evidence items, per-item objects, derivatives, custody events, processor orchestration | Yes |
| `reports` | Private reports, subjects, status history, duplicate signals for staff | Yes |
| `moderation` | Cases, finding revisions, approval events, decisions, standing claims, responses, appeals, corrections | Yes |
| `risk` | Rulesets, signals and revisions, suppressions, assessments and input snapshots, `assess()` | Yes |
| `research` | Read models (address/tx/token/project) and search | Yes |
| `notifications` | In-app notifications; security email composition | Yes (minimal) |
| `watch`, `community`, `investigations`, `ai` | — | Deferred |

Dependency direction (call only modules to the right, through `index.ts`):

```
research → risk, moderation(read), projects, subjects, chaindata
moderation → reports, evidence, subjects, chaindata, audit
reports → evidence, subjects, audit
risk → subjects, chaindata                 (consumes signals; never imports moderation/reports)
identity → access, audit
all → audit (write), access (policy)
```

Cross-module reactions are jobs enqueued in the same transaction (§22).

### 7.3 Services, validation, errors

Services take an explicit `Actor`. There are three validation layers: Zod, domain invariants, and database constraints. Typed errors map to HTTP: 404 (including hidden existence), 403, 409, 422, 429 with `Retry-After`, 401 with `code` (`reauth_required`, `staff_assurance_required`), 503 or a partial response with degraded flags.

### 7.4 Rate limiting and quotas

| Layer | Mechanism |
|---|---|
| Edge | Per-IP flood protection, bot management, WAF |
| API route classes | `@fastify/rate-limit` (in-memory while single-instance): `auth`, `research` (provider-cost weighted), `mutation`, `upload`, `staff` |
| Auth throttling | Durable PostgreSQL counters keyed by email hash, account, IPv4 address, **IPv6 /64** ([identity §12](docs/design/identity.md#12-throttling-and-enumeration-resistance)) |
| Domain quotas | Reports per day, evidence count and bytes per day, standing challenges per hour, appeals per finding, registration intents per email |
| Provider budgets | Per provider key, statically split between API and worker ([chain-data §6](docs/design/chain-data.md#6-routing-details)) |

---

## 8. Authentication and account security

Normative detail: **[docs/design/identity.md](docs/design/identity.md)**. Decision: ADR 0001.

### 8.1 Approach (answers hard question 21)

**Library-first, policy-owned.** Better Auth (exact version pinned when backend work is authorized, Phase 7) runs **headless**: its HTTP router is not mounted and no plugins are enabled. It provides password credential storage (with Blacklist's Argon2id), email/password sign-in with timing equalization, and database sessions with immediate revocation (cookie cache disabled). **Password-reset tokens are Blacklist-owned** (revision 3): Better Auth 1.7.6 swallows reset-email callback errors and completes resets in separate writes (ADR 0008).

Blacklist's `identity` module owns:

- email-first registration;
- password reset (tokens, delivery, atomic completion) and email change;
- the security-email delivery layer with explicit outcomes;
- the per-account security version;
- session policy;
- staff WebAuthn assurance and action-bound step-up;
- throttling and cooling periods;
- the exact-Origin policy;
- audit;
- wallet proofs.

**Why not alternatives:** custom primitives (the fallback, used only if a backend acceptance check fails); Ory Kratos (a strong option but an extra service); hosted IdP (cost, residency, lock-in); Auth.js (OAuth-centric). Evidence and the comparison are in ADR 0001.

### 8.2 Key rules (summary)

| Topic | Rule |
|---|---|
| Accounts | Exist only after mailbox-proven registration; kinds `member` / `staff`; staff accounts are created only by invitation |
| Registration | Email-first: `start` always inserts an intent without checking account existence (the worker decides token vs notice); the mailbox-token holder sets the password in `complete` (R-01) |
| Passwords | ≥ 8 code points, ≤ 128 code points / 512 bytes, NFKC, never truncated, breach check with local fallback, no composition rules or expiry |
| Sessions | Cookie `__Host-bl_session` (HMAC-signed by Better Auth); member idle 7 d / absolute 30 d; staff 30 min / 12 h; revocation immediate; every request also requires a `session_policy_state` row whose `security_version` equals the account's |
| Session token at rest | Exception **E-1 accepted with mitigations M1–M10** (owner 2026-10-04): no bearer/JWT/session-conversion plugin, no mounted routes, no raw-token authentication or conversion wrappers, secret outside DB and backups, allowlisted DTOs, immediate revocation, regression tests, rehearsed rotation, re-evaluation before upgrades. DB + secret compromise = account-session compromise |
| Security emails | Tokens generated by the worker at send time; jobs carry identifiers only; the Blacklist delivery layer returns `accepted_for_delivery` / `retryable_failure` / `permanent_failure`; a token becomes redeemable only after acceptance; non-acceptance invalidates it before retry; at most one valid token (R-03, V2-01) |
| Reset | Blacklist-owned 30-minute token, one active per account; staff reset requires WebAuthn; completion is **one transaction**: credential replaced, token consumed, all sessions revoked, cooling started, security version bumped, audit and notice enqueued (V2-02) |
| Email change | Re-auth; uniform request path (the worker checks the new address); token to the new address (1 h); one-transaction confirm; old address notified; no revert link |
| Staff | Invitation-only dedicated accounts; enrollment needs the emailed token + an out-of-band enrollment code; ≥ 2 WebAuthn authenticators (UV required; two registrations ≠ two independent devices, independent failure domains encouraged); action-bound step-up; two-person privilege increases and recovery; CLI bootstrap; break-glass (R-04) |
| Origin/CSRF | Single exact-Origin policy (R-15) |

### 8.3 Compromise scenarios (answers hard question 23)

**Attacker controls a member's mailbox (no wallet involvement in V1):**

- The attacker can reset the password (members have no second factor in V1). The cooling period blocks email change for 72 hours.
- The legitimate user receives a security notice at the same mailbox, which the attacker also controls, so detection depends on the user noticing they are logged out. Support-assisted recovery is available.
- Private data (draft and submitted reports) is exposed. This is the accepted V1 residual risk; member MFA is the first Post-V1 identity item.
- A wallet signature never grants account access. Standing for appeals is proven per case, so the attacker gains no standing over the user's addresses.

**Attacker controls a staff member's mailbox:** a reset requires WebAuthn, so it is blocked.

---

## 9. Authorization model

### 9.1 Principles

- **Default deny.** Startup fails if any route lacks a policy, and a test enumerates all routes and methods.
- **Checked twice:** route guard plus domain policy (ownership, state, conflicts). Both use one shared permission catalog.
- Client-supplied roles, owner IDs and statuses are ignored.
- Inaccessible private resources return 404.
- Jobs get no universal bypass: each job type has a least-privilege system actor and reloads authority (§22).

### 9.2 Roles and permissions

Defined in code (`domain/access`). Only assignments are stored in the database.

| Role | Representative permissions |
|---|---|
| `member` | `research:read`, `report:create`, `report:read:own`, `evidence:upload`, `standing:prove`, `response:create`, `appeal:create`, `correction:create`, `notification:read:own`, `profile:update:own`, `session:manage:own` |
| `moderator` | `moderation:queue:read`, `moderation:case:read`, `moderation:case:assign`, `finding:propose`, `finding:publish`, `finding:approve_severe`, `finding:suspend`, `standing:decide`, `appeal:decide`, `response:moderate`, `correction:decide`, `evidence:read_derivative`, `evidence:redact`, `report:read:any`, `staff:recovery:verify` (identity verification in a recovery case, identity §10.11) |
| `appeal_reviewer` | `moderation:case:read` (appeal cases only), `appeal:decide`, `evidence:read_derivative` (appeal scope) |
| `admin` | moderator permissions + `staff:invite`, `staff:role:request`, `staff:role:approve`, `staff:suspend`, `staff:recovery:*`, `staff:offboard`, `user:suspend`, `project:manage`, `label:manage`, `signal:suppress`, `audit:read`, `config:manage`, `evidence:unpublish`, `evidence:purge:request` |
| Operator CLI (never web) | `staff:bootstrap`, `staff:approve-invitation` (< 2 admins), `staff:break-glass`, `evidence:purge:execute`, `evidence:forensic_export` |

Effective permissions = role permissions ∩ account state ∩ session constraints:

- staff permissions require WebAuthn assurance on the current session;
- dangerous staff actions require an action-bound step-up;
- members need no extra verification step (all accounts are mailbox-verified).

### 9.3 Ownership and conflict policies (examples)

- `report.read`: the reporter, or `report:read:any`. Reports are never public.
- `finding.approveSevere`: `finding:approve_severe` **and** not an author of any revision **and** not conflicted ([moderation §5, §7](docs/design/moderation.md#7-independence-rules)).
- `appeal.decide` (severe): not a participant of the finding (neither author nor approver) and not conflicted.
- `standing.decide`: not a participant and not conflicted.

### 9.4 Administrator protections (answers hard question 24)

1. Dedicated, invitation-only staff accounts.
2. WebAuthn with user verification and ≥ 2 authenticators. Synced passkeys may share fate, so independent failure domains are encouraged and recovery does not assume independence.
3. Short sessions plus action-bound step-up.
4. Two-person rule for admin grants, role elevation, staff recovery and severe publication.
5. Bootstrap and break-glass by operator CLI only; no standing super-admin credential. The deployment flag and the CLI are **technical** controls; they are two-person only if a **procedural** control puts them with different people (P-13).
6. No impersonation feature.
7. Audit and decisions cannot be edited (only superseded); evidence originals cannot be edited.
8. Alerts on staff logins from new devices, role changes, suppressions and evidence-access volume.
9. Emergency suspension by any single admin.

Full lifecycle: [identity §10](docs/design/identity.md#10-staff-account-lifecycle-resolves-r-04).

---

## 10. Wallet connection and ownership proofs

### 10.1 Concepts

- **Account authentication** (who the user is) is email + password, plus WebAuthn for staff.
- **Wallet connection** is a browser-side request for a **message signature** proving control of an address **for a specific case**. Nothing is stored except the standing record.

### 10.2 Should wallets be linked to accounts? (answers hard question 22)

**Not in V1.** Standing is proven **per case** ([moderation §6](docs/design/moderation.md#6-standing)). Five mechanisms exist so that people who cannot sign today can still obtain redress:

1. fresh signature;
2. authority signature;
3. DNS TXT;
4. staff-assisted documentary standing;
5. correction requests.

Persistent account–wallet links are deferred. When introduced (via ADR) they will be private by default, **non-exclusive**, and treated as evidence rather than entitlement. Control proves authority at a point in time, not identity, innocence or past conduct. Wallet-as-login remains rejected.

### 10.3 Challenge protocol

The server builds a SIWE (`personal_sign`) or SIWS message containing domain, URI, chain ID, address, purpose `standing`, case ID, nonce (≥ 96 bits) and a 10-minute expiry. It is single use and bound to user, session and case. The statement says it authorizes no transaction and costs nothing. **Never requested:** `eth_sign`, typed data, transaction signatures. Details: [moderation §6.4](docs/design/moderation.md#64-signature-challenges).

### 10.4 Edge cases

- Smart-contract wallets (EIP-1271/6492) and hardware wallets that cannot sign messages use staff-assisted standing in V1.
- EVM signatures are chain-scoped by the message.
- Contract, mint and program subjects use authority signatures checked against a finalized chain read.

---

## 11. Blockchain integration

Normative detail: **[docs/design/chain-data.md](docs/design/chain-data.md)**. Decision: ADR 0003. Contracts: [packages/chains/src/ports.ts](packages/chains/src/ports.ts), [types.ts](packages/chains/src/types.ts).

### 11.1 Layers

```
domain modules ──► ChainDataService (router: capability routing, failover, budgets, cache, verification)
                        ├─ chain registry (CAIP-2, slugs, finality policy) — constructs ChainId/ChainSlug brands
                        ├─ family adapters (EVM, Solana) — no I/O: parse/normalize addresses & hashes, decode,
                        │                                   classify transfers (evidence level + authorization basis)
                        └─ provider clients — capability ports (network I/O, untrusted responses)
```

### 11.2 Capabilities

`account_info`, `transaction`, `address_history` (EVM needs an indexed provider), `balances`, `token_metadata`, `contract_source` (explorer data is `external_source`), `activity_stream` (deferred).

### 11.3 Provider candidates (O-3, Phase 8 gate)

A capability/archival/independence/terms matrix will be built before selection. Candidates: Helius plus a secondary for Solana; Alchemy plus a second RPC and an explorer API for Ethereum. No commitment yet.

### 11.4 Normalization

| Item | EVM | Solana |
|---|---|---|
| Chain ID | `eip155:<id>` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (mainnet) |
| Address storage | Lowercase hex; mixed case must pass EIP-55 | Base58, **case-sensitive, never lowercased**, decodes to 32 bytes |
| Display | EIP-55 | As-is |
| Transaction ID | `0x` + 64 hex, lowercase | Base58 64-byte signature |
| Amounts | `numeric(78,0)` raw units; decimal strings in TS; never floats | Same |
| Event identity | `(chain, tx_hash, log_index)` | `(chain, signature, instruction path)` |

Also: Solana address lookup tables are resolved; token-account owners are taken **at the slot** (from transaction metadata), never today's owner; EIP-7702 delegation designators are recognized; address kinds are time-stamped observations.

### 11.5 Transfers are not accusations (R-06)

Three layers: **observed event → movement evidence level → authorization basis** (`subject_signed_direct` / `delegated` / `protocol` / `unknown`), plus a victim-indicator overlay. **V1 computes no association signal at all.** `unknown` always contributes zero. Details: [chain-data §1–§3](docs/design/chain-data.md#1-principle-a-transfer-record-is-not-an-accusation).

### 11.6 Router behaviour

- Per-call timeouts (5 s; history 10 s).
- ≤ 2 retries, idempotent reads only, honouring `Retry-After`.
- Circuit breakers per provider × capability.
- Budgets; single-flight.
- Provider-scoped cursors.
- Cache keys include finality, cross-verification and decoder version.
- Responses are Zod-validated and size-capped.

### 11.7 Finality and pinned facts

- Display: Ethereum `latest`, Solana `confirmed`, both marked pending.
- Pin/score: `finalized` only. The pinned tables accept **only finalized rows** (CHECK).
- Post-finality problems are recorded as append-only invalidations that retract dependent signals.

### 11.8 Provider disagreement (answers hard question 8)

- Verification compares the **same canonical snapshot**: EVM block hash via EIP-1898; Solana signature + slot for transactions.
- Solana account state across different context slots yields `inconclusive_snapshot_mismatch` **even when the values are identical** (`minContextSlot` is a lower bound, not historical targeting). If no same-slot pair can be obtained, cross-provider verification of that account fact is **unavailable**, and no scoring signal is created from it.
- Receipts record chain/cluster, provider, independence group, query type and parameters (address or signature), commitment, snapshot (block hash / slot / context slot), request and fetch times, field digest, decoder and comparison-spec versions.
- `agree` only at the same snapshot from different independence groups. `conflict` → excluded from scoring and pinning, operators alerted, shown "under verification".
- Mandatory only for evidence-pinned transactions and facts behind scoring signals ([chain-data §5](docs/design/chain-data.md#5-snapshot-identity-and-cross-verification)).

### 11.9 Provider failure (answers hard question 9)

Failover → cached data with "as of" → section-level degradation. Assessments are never recomputed from partial data. Verification-dependent moderation actions are blocked, not guessed.

### 11.10 Chain ambiguity (answers hard question 10)

- Every record carries a CAIP-2 chain ID; there is no default chain.
- URLs include the chain slug.
- Search never merges chains.
- Testnets are disabled in production.
- Sanctions entries map to chains only through a legally reviewed table (when activated).

### 11.11 No own indexer (yet)

Revisit via ADR if provider costs or capabilities block core features.

---

## 12. Data architecture

Full catalog: [docs/data-model.md](docs/data-model.md). Key decisions:

1. **Subject supertype** (`address` | `project` | `domain`) with composite `(id, kind)` foreign keys, so each subtype row matches its kind.
2. **Chain-scoped addresses** with time-stamped kind observations (including block identity), contract snapshots and token detail.
3. **Chain data does not create subjects.** Pinned finalized transfers reference `(chain_id, address)` text.
4. **Projects and known entities are unified**, with attribution basis and time; an attribution is not an ownership verdict.
5. **History is append-only:** finding revisions, approval events, decisions, status histories, signal revisions, assessments and their input snapshots, verification receipts, custody events, project revisions, audit. Current state is a pointer or status with recorded transitions.
6. **Identity tables:**
   - Better Auth's `auth_users` / `auth_sessions` / `auth_accounts` / `auth_verifications`, as reviewed SQL migrations.
   - Blacklist's registration intents, identity tokens, session policy state, staff tables and throttle counters.
7. **Private data is owner-scoped** with non-null owner columns and composite parent-owner FKs (RLS-ready; O-8). V1 private tables: sessions, reports and drafts, notifications, standing claims, security events.
8. **Evidence objects are per item** (no cross-item deduplication in V1).
9. **Risk replay:** `risk_assessment_inputs` stores immutable copies of the effective inputs; current pointers use a per-subject sequence and compare-and-set.
10. **Audit minimization:** an opaque `actor_ref` plus an erasable `actor_identity_map`; allowlisted details.
11. **Roles and permissions** are in code; assignments are in the database.
12. **IDs and time:** UUIDv7; `timestamptz` UTC; block time separate from fetched time.
13. **Database roles:**
    - `blacklist_migrator`: DDL, including the pg-boss schema.
    - `blacklist_app`: DML; INSERT/SELECT only on append-only tables; no DDL.
    - optional `blacklist_readonly`.

---

## 13. Research features

### 13.1 Address profile (V1)

Every section shows its provenance and "as of" time. Unavailable data is shown as unavailable.

| Section | Source | Provenance |
|---|---|---|
| Chain, address, kind | registry + `account_info` | `chain_fact` |
| Native + fungible balances | `balances` | `chain_fact` (as of block) |
| Recent transactions (bounded, paged) with movement level and authorization basis | `address_history` + normalization | `chain_fact` |
| Token / contract details | `token_metadata`; explorer source | `chain_fact`; explorer = `external_source` |
| Capability disclosures (mint/freeze authority, permanent delegate, transfer hook/fee, upgradeable proxy) | analysis | `platform_analysis` (context, no score) |
| Public labels, project attributions | staff-managed | per label |
| Published findings, responses, appeal status | moderation | `moderator_finding` / response |
| Assessment (band, explanation; numeric display per P-11) | risk engine | per factor |

**Not in V1:** counterparty analytics, pending report counts or indicators, association summaries, NFTs, holder/liquidity analytics.

### 13.2 Transaction view (V1)

Status, finality, fee, transfers with **evidence level and authorization basis in plain language**, involved addresses with labels and finding badges, lookalike warnings.

### 13.3 Token and contract analysis (V1)

- **Solana:** mint/freeze authority, supply, decimals, Token-2022 extensions, on-chain name/symbol (untrusted).
- **EVM:** standard detection, proxy type and implementation (EIP-1967 reads), explorer verified-source status (`external_source`), name/symbol (untrusted).
- Impersonation check against a curated major-token list.
- Metadata URIs are never fetched.

### 13.4 Deferred research features

Watchlists and alerts (§20), tracing, relationship graph (design preserved: bounded subgraphs, observed / inferred / verified edge tiers, hubs collapsed, edges never assert ownership unless verified), counterparty analytics.

---

## 14. Reports, evidence and moderation

Normative detail for findings, approvals, standing and appeals: **[docs/design/moderation.md](docs/design/moderation.md)** (ADR 0002). Evidence: ADR 0004.

### 14.1 Reports

- **Private** to the reporter and staff. No public count, indicator or score effect while unreviewed (owner decision).
- Lifecycle: `draft → submitted → screening → queued → in_review → (needs_info) → accepted | rejected | rejected_abusive`, with `withdrawn` before a decision. Status history is append-only.
- Screening (worker) only prioritizes and flags. It never publishes.

### 14.2 Findings

- Immutable revisions with a `content_hash` covering all asserted content, including evidence object and derivative hashes.
- Approval events bind to a revision and its hash.
- Two human roles: **author** and **approver**. **Publication is a system transition** caused by an approval of the exact revision (approve-and-publish in one transaction); there is no human "publisher". Non-severe revisions may be self-approved by their author.
- **Severe:** an **independent approver**: non-conflicted, and never an author of any revision. **Not published at all** if no independent approver exists. Replacing a published severe revision (including a downgrade or a text change) also needs independent approval, so no single person can weaken a severe finding.
- Statuses: `proposed`, `pending_second_approval`, `published`, `suspended`, `reversed`, `superseded`, `expired`. "Under appeal" is a derived display state.
- Factual language only: types such as `phishing`, `wallet_drainer`, `rug_pull`, `impersonation`, `fraudulent_project`, `stolen_funds_recipient`, `malicious_contract`, `fake_token`, `other`.

### 14.3 Evidence pipeline (V1: images only)

```
client ──multipart (exact Origin)──► api: auth + quota; stream with 10 MiB hard limit; SHA-256 while streaming;
                                     write QUARANTINE object under a random key; evidence_item + object(state=quarantined);
                                     enqueue evidence.process (same transaction)
worker: evidence.process  (orchestration only — never parses the file)
   verify object hash/size → issue one scoped presigned GET (quarantine object) + one presigned PUT (derivative key)
   → call apps/evidence-processor (internal network) with the two URLs and limits
evidence-processor (no DB, no secrets, egress only to object store, non-root, read-only FS, CPU/mem/time caps)
   magic-byte check: PNG | JPEG | WebP only; reject animated, > 40 MP, > 12,000 px per side, decoder errors (fail closed)
   decode → re-encode → strip all metadata → PUT derivative → return {width, height, derivative sha256}
worker: verify derivative hash → copy original to EVIDENCE bucket (versioned/immutable) → delete quarantine copy
        → state=available; custody events
   any failure → state=rejected (reason); quarantine object purged after 30 days (hash retained)
```

- Rejected types: PDF, SVG, HTML, archives, animated images, anything else. PDFs need a separate security design and ADR (ADR 0004 §8).
- Transaction-reference evidence: verified against finalized, cross-verified chain data and pinned.
- URLs: stored as text, shown defanged, **never fetched**.
- No antivirus in V1 (rationale in ADR 0004). It returns with any non-image format.

### 14.4 Evidence access

- **Staff and public see sanitized derivatives only.** Originals have **no UI path** in V1. Forensic export of an original is an operator CLI procedure onto an isolated machine, recorded in custody events.
- Derivative downloads use ≤ 5-minute presigned URLs on a **separate registrable domain**, with `attachment` and `nosniff`. Issuance is audited; revocation is bounded by the URL's lifetime.
- The public sees only derivatives published with a finding, redacted by staff where needed (visible personal data, QR codes, phishing text).

### 14.5 Evidence preservation (answers hard question 12)

- Each evidence item owns its own objects.
- Originals are immutable (versioned bucket/object lock; object version ID + SHA-256 recorded).
- Redaction creates a new derivative.
- `evidence_custody_events` are append-only.
- A daily reconciliation job detects orphaned or missing objects.
- On-chain evidence is pinned with verification receipts.

### 14.6 Legitimate evidence removal (answers hard question 13)

| Case | Action |
|---|---|
| Reporter withdraws before a decision | Item unlinked and kept private for the retention period, then purged |
| Third-party personal data in a published derivative | Unpublish → new redacted derivative → republish (revision-bound if a finding cites it) |
| Illegal content | Immediate block and purge of bytes; legally required reporting; hash kept on a block list; no staff re-viewing |
| Court order / valid legal request | Admin request + operator CLI execution, with reference (two different people where staffing allows; if one person holds both roles it is recorded as single-person with mandatory review, P-13) |
| Data-protection request | Counsel-guided; pseudonymize submitter; purge where no overriding basis (pseudonymization ≠ erasure) |
| Copyright claim | Unpublish pending review |

Purge is per item and respects legal holds. A tombstone is kept (hash, reason, approvers, time). Findings citing purged evidence are re-reviewed through new revisions.

### 14.7 Moderation operations

- The queue is ordered by evidence verifiability, age and severity hints.
- Conflict and independence rules are enforced at every step.
- Decision-pattern metrics (reversal rates, suppression and evidence-access volume) feed insider detection.

---

## 15. Risk engine

Decision: ADR 0005 (and ADR 0003 for association).

### 15.1 Definition

- **Risk Score:** integer **0–100, higher = more risk.** An ordinal policy indicator, **not** a probability and **not** a verdict on the owner. It estimates the risk of *interacting with* the subject; victim wallets can score high, and explanations say so.
- **Bands:** Low 0–24 · Moderate 25–49 · High 50–74 · Severe 75–100. Plus `not_assessed`, which is distinct from 0 and never reassuring.
- **Confidence:** Low / Medium / High, from coverage, freshness and verification status. Independent of the score.
- **Public display (owner decision P-11, 2026-10-04):** V1 shows the **risk band and its explanation**, never the exact number. The public view includes:
  - key factors and evidence (published artifacts only);
  - confidence;
  - coverage;
  - freshness ("as of");
  - dispute or appeal state.

  The numeric score stays internal for ordering, band derivation and engineering. Public numeric display may be reconsidered only after real-world calibration (O-12) and a new owner decision.

### 15.2 Evidence tiers and V1 computation

| Tier | Members | V1 status |
|---|---|---|
| **Verified** | Published moderator findings (by severity); authoritative external designations (only after legal sign-off) | Active: findings only |
| **Analysis** | Deterministic `platform_analysis` factors marked *scoring*, backed by verified facts | Active: `token.symbol_impersonation`, `eoa.delegated_to_flagged` (owner calibration O-12) |
| **Disclosure** | Capability facts shown as context | Active, **zero** contribution |
| **Weak** | Community allegations, association, AI observations | **Inactive (deferred)** |

**V1 assessment uses supported strong (verified + deterministic) evidence only:**

```
score   = min(ceiling, Σ verified contributions + Σ analysis contributions)
          ceiling = 100 if a published severe finding is present, else 74
band    = band(score)        -- Severe (≥ 75) only with a published, independently approved severe finding
```

**Deferred weak-signal policy (inactive; future calibration and ADR required).** If weak signals are ever enabled, they must satisfy:

- `weak = min(49, Σ weak)`;
- `score = max(strong, weak)`, so weak signals never add to strong evidence and alone never exceed Moderate.

This is retained as an architectural constraint, not V1 behaviour.

### 15.3 V1 ruleset (calibration proposal; owner sign-off O-12)

| Factor | Tier | Contribution |
|---|---|---|
| `finding.severe` | verified | 80 |
| `finding.high` | verified | 55 |
| `finding.medium` | verified | 30 |
| `finding.low` | verified | 10 |
| `token.symbol_impersonation` | analysis | 30 |
| `eoa.delegated_to_flagged` (EIP-7702 delegate with a published high/severe finding) | analysis | 40. Wording must state the owner is often a **victim** and funds sent there may be swept |
| Capability disclosures | disclosure | 0 |

Invariants (not calibration):

- incoming transfers never contribute;
- `unknown` authorization never contributes;
- no association signals in V1;
- no weak signals are active in V1; if ever enabled they follow the deferred policy (§15.2);
- Severe requires a severe finding or authoritative designation;
- verification never lowers scores;
- no manual score setting; suppressions are audited decisions shown in explanations;
- unreviewed reports never affect any public output.

### 15.4 Computation and replay

- `assess(subject, effectiveInputs, ruleset, evaluationTime)` is pure and deterministic.
- Each assessment stores an immutable input snapshot in `risk_assessment_inputs`: signal revision, source revision (finding revision, verification receipts, external snapshot), status at evaluation, contribution inputs.
- Each assessment also stores evaluation time, ruleset version and checksum, engine version, coverage, `effective_inputs_hash` (covering all time-dependent state) and `next_review_at` (the earliest expiry/decay change among inputs).
- A new assessment is persisted when `effective_inputs_hash` differs from the current one.
- **History is never recomputed with today's rules.** A replay test re-runs stored inputs with the stored ruleset snapshot and must reproduce the stored output.

### 15.5 Expiry and recomputation

- `risk.expiry_sweep` (every 15 minutes) recomputes subjects whose `next_review_at` has passed, **independent of page views**.
- Signal changes enqueue `risk.recompute`.
- Ruleset changes trigger a rate-limited batch.
- Viewing a stale assessment (> 24 h) also enqueues a recompute; meanwhile the stored result is shown "as of".

### 15.6 Explanations

- **Public DTO:** **band (no numeric score)**, explanation, confidence, coverage, freshness, ruleset version, dispute/appeal state, and per factor: explanation, provenance, observed time and relative weight wording (no numbers). It references **only published, redacted artifacts**.
- **Staff DTO:** additionally carries numeric score, contributions and internal references.
- `/methodology` renders the active factor catalog.
- Anti-abuse thresholds are never published.

### 15.7 History (answers hard question 11)

- All assessments are kept.
- The public timeline shows when and why a result changed.
- Reversal and suspension annotations are a **current overlay** (`assessment_annotations`); old assessments are never edited.

---

## 16. Verification (Post-V1)

Unchanged design, deferred:

- `project_claims` → `verification_checks` (DNS TXT via a controlled resolver; authority signatures with finalized chain reads; documents through the evidence pipeline) → `verified_claims` with expiry and re-check.
- Claims bound to bytecode hashes.
- No embeddable badges.
- "Verified" never means "safe" and never lowers risk.

---

## 17. Responses and appeals

Normative detail: **[docs/design/moderation.md §6–§9](docs/design/moderation.md#6-standing)**.

- **Standing per case**, via five mechanisms (§10.2). People without current keys use staff-assisted documentary standing. Anyone can file a correction request.
- **Responses:** plain text, safety-moderated, worded as time-bound control ("a party that proved control of this address on <date>").
- **Appeals:** filing never hides a finding; it shows "Disputed — under appeal". Emergency **suspension** (any staff, step-up) removes a finding from scoring pending non-participant review within 72 h.
- **Reviewers:** a severe appeal is decided by a **non-participant** (neither author nor approver), which may be an external `appeal_reviewer`. If none is available, the appeal waits and escalates to the owner after 14 days. **Independence is never relaxed.**
- **Outcomes (answers hard question 14):**
  - `upheld`: noted.
  - `amended`: new revision; fresh approval if severe.
  - `reversed`: signal retracted; new assessment; correction notice for 90 days; history kept.
  One appeal level in V1.

---

## 18. Community intelligence (Post-V1)

Design unchanged and deferred:

- an outcome-based reputation ledger (append-only, decision-linked);
- a leaderboard of verified, novel contributions;
- anti-sybil and anti-collusion controls;
- a researcher tier that never bypasses moderation.

Weak-tier rules (§15.2) apply to any community signal.

---

## 19. Investigation workspace (Post-V1)

Design unchanged and deferred:

- private, membership-scoped cases;
- explicit, revocable shares;
- "submit as report" copies only the selected items.

---

## 20. Notifications and alerts

- **V1:** in-app notifications for the user's own report status, standing outcomes, response and appeal outcomes, and account security events. Security emails per [identity §8](docs/design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01).
- Templates are static, with **no user-generated text or user-supplied links**.
- Before sending, a job re-checks that the triggering state is still current (no obsolete notices after reversal).
- **Deferred:** watchlists, Blacklist-event alerts on watched subjects, on-chain movement alerts, email notification preferences.

---

## 21. Search

1. Input classifier (family adapters): EVM address, EVM transaction hash, Solana address, Solana signature, domain, free text.
2. Exact lookups route to profiles (with chain choice once more than one EVM chain is enabled).
3. Text search over projects and public labels (FTS + `pg_trgm`); domains by punycode hostname.
4. **Privacy:** search terms and looked-up addresses are never stored or logged together with an account or session identifier ([§24](#24-observability)). Aggregate metrics only.

---

## 22. Background jobs

### 22.1 Catalog (answers hard question 17)

| Job | Trigger | Notes |
|---|---|---|
| `identity.registration.issue`, `identity.email_change.issue`, `identity.password_reset.issue`, `identity.staff_invitation.issue`, `identity.existing_account_notice` | Identity flows | Delivery protocol ([identity §8](docs/design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01)): account lock, invalidate previous token, generate, `pending_delivery`, send via the delivery layer, `active` only on `accepted_for_delivery`; otherwise invalidate and retry with a new generation; max age 15 min; ≤ 5 attempts |
| `identity.security_notice` | Security events | Static templates |
| `identity.cleanup` | Hourly cron | Expired intents, tokens, challenges, sessions, throttle rows |
| `evidence.process` | Upload | Orchestrates the isolated processor |
| `evidence.reconcile` | Daily cron | Orphaned or missing objects |
| `evidence.purge` | Approved purge | Per item; holds respected |
| `chain.pin_transaction` | Transaction evidence | Finalized + cross-verified |
| `chain.verify_fact` | Scoring-signal facts | Receipts + verification records |
| `risk.signal.upsert` | Finding publication/suspension/reversal, analysis facts | Carries source revision |
| `risk.recompute` | Signal change, stale view, ruleset change | Reads current state; per-subject serialization |
| `risk.expiry_sweep` | Every 15 minutes | `next_review_at` |
| `notifications.fanout` | Domain events | Re-checks currency before sending |
| `audit.verify_chain` | Daily cron | Recomputes the hash chain; alerts on mismatch |
| `providers.health_probe` | Cron | Latency, errors, freshness, disagreement |
| `retention.purge` | Daily cron | Per retention map (§25) |
| Deferred | `external.sanctions_sync`, `audit.checkpoint` (O-13), alerts, verification re-check, reputation | — |

### 22.2 Stale-job protection (R-11, owner requirement)

1. **Payloads carry identifiers, never authority or derived content.** Handlers reload authoritative state with row locks.
2. **Expected-state checks:**
   - Jobs that publish or derive from a source carry `expectedSourceRevision`.
   - If the source's current revision differs, or its state is no longer eligible (finding reversed, suspended or superseded; signal expired or retracted; report withdrawn or rejected; appeal granted; intent superseded), the handler **no-ops** and records `skipped_stale`.
   - A delayed job therefore cannot resurrect anything.
3. **Recompute is state-based:** `risk.recompute` carries no inputs and always evaluates current state. A delayed recompute produces a *current* result.
4. **Ordering:**
   - Per-subject serialization (row lock on `risk_subject_state`).
   - A monotonic `assessment_seq`.
   - The current pointer updates by compare-and-set (`… WHERE seq < $newSeq`), so an older computation never overwrites a newer one.
5. **Durable rerun:**
   - A trigger arriving while a recompute runs sets `risk_subject_state.dirty = true`.
   - The running job loops until the flag is clear.
   - pg-boss singleton keys deduplicate scheduling; they do not provide exactly-once delivery.
6. **External effects** (email, notifications) are at-least-once, with idempotency keys and a final currency check before sending.
7. **Authority-dependent effects** re-check current authority or membership at execution. Effects already authorized at commit time (audit, security notices) proceed.

---

## 23. Audit logging

Decision: ADR 0006.

- **Scope (answers hard question 15):** every consequential account, security, staff, role, moderation, finding revision/approval/publication, standing, evidence, suppression, configuration and operator-CLI action. High-volume login telemetry goes to `security_events` (180-day retention).
- **Fields:** sequence, time, `actor_ref` (opaque; mapped in the erasable `actor_identity_map`), actor type, action, target, request ID, IP prefix, allowlisted `details`, `prev_hash`, `row_hash`. The canonical encoding is defined in the data model.
- **What the controls achieve (honest claim):**
  - The application role can only append (INSERT via an approved function), and a trigger blocks UPDATE/DELETE. This **prevents** tampering through the application.
  - The hash chain plus a daily verification job **detect** accidental or partial alteration.
  - **They do not prevent or reliably detect a complete rewrite** by someone with database-administrator or infrastructure access.
  - Hash chaining is **not** immutability.
- **V1 additional controls:** named and MFA-protected database administrator access with provider audit logs, encrypted backups with retention, and alerting. Serialized appends use short transactions with lock-wait monitoring.
- **Independent checkpoint (O-13):** a daily head-hash export to write-once storage under separate credentials, decided with hosting and recommended before launch. Otherwise the residual risk is explicitly accepted. No blockchain anchoring.

---

## 24. Observability

| Signal | Approach |
|---|---|
| Logs | pino JSON with request ID, **route template** (never raw paths with addresses or hashes), latency, outcome. The actor ID is logged only on authenticated mutation/staff routes, **never** on research GET routes. Redaction of `authorization`, `cookie`, `set-cookie`, `password*`, `token*`, `secret*`, `signature`. Auth bodies are never logged |
| Never logged | Passwords, any bearer token or link containing one, cookies, private keys, seed phrases (a detector rejects BIP-39-like sequences in free text), secrets, search terms or looked-up addresses together with an actor/session, evidence content, unnecessary personal data |
| Traces | OpenTelemetry with templated span names; no address or search attributes |
| Metrics | Route classes, auth failures, throttles, job lag/failures/DLQ, `skipped_stale` counts, provider latency/errors/429s/circuits/disagreements, processor rejections, moderation queue SLA, audit-chain verification |
| Errors | Sentry-compatible with URL, query, body and header scrubbing. External export is disabled until O-5 is decided |
| Health | `/healthz`, `/readyz`; worker and processor heartbeats; internal network only |

---

## 25. Privacy and retention

### 25.1 Private by default (reconfirmed)

- **Never public:** email and account details; credentials and sessions; security events; IPs; **draft and pending reports**; reporter identity; unpublished evidence and all originals; standing claims; (later) wallet links, watchlists, private labels and investigations; moderator internal notes and individual identities; anti-abuse thresholds; **research activity**.
- **Public blockchain data does not make a user's research public.**

### 25.2 Enforcement

- Owner-scoped tables and repositories.
- Allowlisted public DTOs (contract tests).
- `no-store` on personalized responses.
- No third-party analytics on authenticated or auth pages.
- Telemetry rules in §24.

### 25.3 Retention map (draft; counsel approval is a pre-launch gate)

| Data | Retention | Notes |
|---|---|---|
| Registration intents, identity tokens, WebAuthn challenges | Purged 24 h after expiry/consumption | Hashes only |
| Sessions | Purged 30 days after expiry/revocation | |
| Security events | 180 days | |
| Operational logs and traces | 14 days | No research terms with identity |
| Draft reports | Deleted after 30 days of inactivity (user warned) | |
| Reports and evidence (not supporting a published finding) | Counsel-defined (proposal: 12 months after closure) | Legal holds override |
| Evidence supporting published findings | While the finding is published + counsel-defined period | Pseudonymized submitter |
| Quarantine / rejected uploads | 30 days | Hash retained |
| Audit log | Long-term (counsel-defined) | Erasure handled via the actor identity map |
| Backups | Rolling (e.g. 35 days) | Erasure completes when backups age out (documented to users) |

### 25.4 Deletion

Account deletion → 30-day deactivation window → personal data deleted, `actor_identity_map` entry removed, published content pseudonymized. **Pseudonymization is not assumed to be legal erasure.** Applicability of GDPR/UK GDPR and other rights is decided with counsel (P-10). Public blockchain addresses can be personal data in context.

---

## 26. Security architecture

### 26.1 HTTP security headers

`Strict-Transport-Security` (preload) · nonce-based CSP (`default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`; `img-src 'self'` plus the evidence download origin, for sanitized derivatives only; `connect-src` self plus the required human-verification and wallet origins) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on token pages) · minimal `Permissions-Policy` · `COOP: same-origin` · `Cache-Control: no-store` on authenticated responses.

### 26.2 Cookies, origin and CSRF

One policy: [identity design §11](docs/design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15). Exact `Origin` on every non-safe request; missing, `null` or foreign → 403; no fallbacks; no CORS; JSON-only mutations.

### 26.3 Injection and XSS

Parameterized SQL only (lint forbids string-built SQL). React escaping, no raw HTML, strict CSP. Plain-text user content.

### 26.4 SSRF and outbound traffic

No user-supplied URL is ever fetched. Outbound hosts come from configuration: providers, SMTP, storage, the HIBP range API, the human-verification provider, and a controlled DNS resolver for TXT standing checks. Production egress is allowlisted where the platform allows. The evidence processor's egress is limited to the object store.

### 26.5 Secrets management

- Platform secret store only. `.env` is local and git-ignored. `.env.example` holds placeholders.
- `packages/config` (api/worker) validates at startup without printing values. The web server reads only its two SSR variables in a server-only module.
- `BETTER_AUTH_SECRET` signs session cookies (E-1, accepted with mitigations M1–M10, identity §5.5). It lives only in the secret store; never in the database, **database backups**, logs or client bundles; secret-store access is separate from database or backup access. Emergency rotation plus revoke-all is rehearsed before launch.
- Distinct secrets per environment; gitleaks plus GitHub secret scanning with push protection. A leaked secret is rotated.

### 26.6 Supply chain

[docs/dependency-policy.md](docs/dependency-policy.md):

- pnpm `minimumReleaseAge` (7 days), `trustPolicy: no-downgrade`, `strictDepBuilds`, `saveExact`;
- frozen lockfile;
- OSV scanning;
- pinned Actions and base images;
- SBOM;
- minimal Better Auth surface (no plugins).

---

## 27. Database migrations

- drizzle-kit-generated **SQL** plus hand-written SQL (triggers, grants, append functions, composite FKs), committed and reviewed. Never `push` to shared databases.
- Applied by a dedicated deploy step with the migrator role **before** rollout. That step also provisions the pg-boss schema. Applications never migrate on boot, and the runtime role needs no DDL.
- Expand → migrate → contract; `lock_timeout` / `statement_timeout`; `CONCURRENTLY` index builds outside transactions; batched backfills; forward-only in production; restore rehearsed.
- CI applies migrations from an empty database and fails on drift.
- **Backend acceptance checks D1–D9 (ADR 0007) and S1–S17 (identity §14.2)** must pass in **Phase 7 (Backend Foundation)** before the first production migration or security feature merges.

---

## 28. Dependency policy

See [docs/dependency-policy.md](docs/dependency-policy.md). Every important dependency answers: why, maintained?, risk, simpler option? New `allowBuilds` entries need owner approval.

---

## 29. CI/CD

```
install (pnpm 12.7.0, Node 24.x, frozen lockfile, release-age + trust policy, no unapproved builds)
 → lint (boundaries incl. relative/subpath imports, no raw HTML, no string SQL, banned wallet methods) + format
 → type check (TypeScript 6.x)
 → unit → integration (Testcontainers Postgres; migrations from empty; drift; grants/triggers)
 → API (authorization matrix, Origin matrix) → worker (stale-job, token-leak inspection)
 → build (web, api, worker, evidence-processor images) + client-bundle secret scan
 → security: OSV, gitleaks, SAST (Semgrep CE or CodeQL), container scan, SBOM
 → E2E smoke (Playwright) → staging (protected) → owner-approved production gate → migrations → rollout → smoke
```

Repository protections: protected `main`; required checks; owner review, plus Codex review for security-sensitive paths; SHA-pinned Actions; least-privilege tokens; CODEOWNERS once handles are known. Nothing is created during Phase 0.

---

## 30. Deployment topology

Hosting is open decision O-4.

- Four container images (web, api, worker, evidence-processor) in one region.
- **The evidence processor** runs with no database or application secrets, egress only to object storage, non-root, read-only filesystem, and CPU, memory and time limits.
- Managed PostgreSQL with point-in-time recovery and encrypted backups; separate staging and production.
- S3-compatible buckets: `quarantine`, `evidence` (versioned/immutable), `derivatives`. Downloads come from a **separate registrable domain**.
- Edge provider for TLS, WAF, DDoS, bots and `/api` routing.
- Environments: local (Compose), staging, production, with no shared credentials.

---

## 31. Testing strategy

See [docs/testing-strategy.md](docs/testing-strategy.md). Highest-priority suites:

- R-01 adversarial registration;
- token-leak inspection of queues, logs and DLQs;
- staff lifecycle negatives;
- the Origin matrix;
- the authorization matrix;
- approval revision races;
- transfer-authorization fixtures;
- same-snapshot verification;
- processor isolation;
- stale-job ordering and assessment replay;
- the Foundation acceptance spikes.

---

## 32. Scalability and performance

### 32.1 What will most likely break at scale (answers hard question 1)

1. **Moderator capacity and independent reviewers.** Severe publication needs two independent people; severe appeals need a third.
2. **Provider cost and rate limits** under bot traffic. Mitigated by caching, budgets, lower anonymous limits and edge bot management.
3. **High-activity addresses.** Mitigated by bounded windows and disclosure.
4. **Recompute volume.** Mitigated by per-subject serialization, dirty flags, rate-limited batches. Removing association signals removes the hub-cascade risk entirely in V1.
5. **Session and policy lookups** on every request. Postgres is fine initially; add caching when scaled out (it must not weaken revocation).
6. **Audit append serialization.** Kept to short transactions; partition chains if needed.
7. **Table growth** of receipts and assessment inputs. Partition by time when needed.

### 32.2 Performance tactics

Streaming SSR, indexes designed with the model, cursor pagination, caching of final chain data, batched repositories.

---

## 33. Hard questions

1. **What will most likely break at scale?** §32.1.
2. **What is over-engineered?** Re-examined after review:
   - **Kept:** a separate API process; the hash chain (with honest claims); cross-verification, only where mandatory; the isolated processor (security, not scale).
   - **Removed or deferred:** ClamAV, global evidence deduplication, persistent wallet links, watchlists, association scoring, numeric community signals, sanctions in V1.
   - **Rejected:** Redis, search engines, microservices, Turborepo, RLS in V1.
3. **What edge cases are missing?**
   - Earlier list: EIP-7702, CREATE2, Solana lookup tables / token-account owners / Token-2022, cross-chain addresses, lookalikes, IDN, link prefetch, pre-account takeover, dusting, hubs, stablecoin capabilities, domain expiry, proxy upgrades, message-signing-incapable wallets, reorgs, partial history, pasted seed phrases, malicious token names, testnets.
   - Added after review: attacker-chosen credentials at activation; tokens in queues and backups; staff factor loss and bootstrap; approval of a changed revision; fake or delegated transfers; different-snapshot provider answers; parser exploits; shared-blob hold/purge; telemetry correlation; whole-chain audit rewrite; stale jobs; report-count inference.
4. **Which MVP features should be postponed?** PRD §4.2–§4.4. V1 is now: accounts, staff security, Solana and Ethereum lookup, private reports with image and transaction evidence, moderation, revision-bound findings, explained assessments, redress, minimal admin, audit.
5. **Where could false-positive classifications occur?**
   - Weak or unverified inputs: association, which V1 disables; transfer direction (`unknown` basis contributes zero); capability facts (zero contribution); bridged tokens resembling majors.
   - Human and data error: brigaded reports (no effect until reviewed); forged screenshots; provider errors (snapshot verification); misattributed labels; the same address on other chains.
   - Victims: delegated victim wallets (wording).
6. **How could attackers manipulate reports?** Sybils, bursts, forged evidence, harassment. In V1 unreviewed reports have no public effect, so manipulation can only waste moderator time. Mitigations: quotas, screening flags, verifiable on-chain evidence, penalties (THREAT-MODEL T-25–T-30).
7. **How could attackers manipulate risk scores?**
   - Upward: fake logs, dusting, mass reports (all inert in V1); fake evidence (moderation).
   - Downward: fresh addresses (low confidence, `not_assessed` is never reassuring); appeal flooding (filing never hides); bribed suppressions (audited and visible).
   - Ordering attacks: stale jobs (revision checks).
   See THREAT-MODEL T-31.
8. **Provider disagreement?** §11.8.
9. **Provider failure?** §11.9.
10. **Chain ambiguity?** §11.10.
11. **Historical assessments?** §15.4, §15.7.
12. **Evidence preservation?** §14.5.
13. **Legitimate evidence removal?** §14.6.
14. **Appeals and public classifications?** §17.
15. **Strongly auditable operations?** §23.
16. **Never public?** §25.1.
17. **Background tasks?** §22.
18. **Not in V1?** PRD §4.4.
19. **Unnecessarily complex?** A general factor DSL (rejected); generic polymorphic relations (split by tier); DB-stored permissions (code); global evidence deduplication (removed); queue-token encryption (replaced by generation at send time).
20. **What should be simplified?**
    - Registration (no unverified accounts) and standing (per case, no persistent links).
    - Evidence (images only; no antivirus).
    - Risk (no weak signals; capability facts are disclosures).
    - Notifications (own items only); staff-created projects; one appeal level; no comments or votes.
21. **Authentication approach?** §8.1.
22. **Wallet linking?** §10.2.
23. **Email compromise without wallet?** §8.3.
24. **Administrator protections?** §9.4.

Additional questions:

25. **Defamation exposure:** factual language, revision-bound findings, right of reply, appeals, no automated "scam" labels, private reports. Legal review before launch.
26. **Reporter protection:** identity never public; narratives never published verbatim.
27. **Impersonation of Blacklist:** official domains; "never ask for seed phrases"; SIWE domain binding; no badges.
28. **Pasted seed phrases:** detector blocks submission.
29. **Wrong provider labels:** `external_source`, attributed, never auto-verified.
30. **Provider spending:** budgets, caching, alerts.
31. **Time:** UTC; block time vs fetched time; "as of" everywhere.
32. **New scam techniques:** versioned rulesets via code review; findings cover the rest.
33. **Can registration still bind attacker-created credentials?** No: [identity §4.5](docs/design/identity.md#45-why-r-01-is-impossible).
34. **Can reset or verification tokens be read from the queue or backups, or can several be valid at once?** No: tokens are generated at send time; queues hold identifiers only; one open token per entity (per account for resets); redeemable only after `accepted_for_delivery`; non-acceptance invalidates before retry ([identity §8](docs/design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01)).
35. **Can an approval authorize a different revision?** No: approvals bind to a revision and content hash, and system publication happens in the same transaction as the approval.
36. **Can two providers "agree" about different states?** No: `agree` requires the identical snapshot (same EVM block hash, same Solana signature + slot, or same Solana context slot) and different independence groups. Identical values at different slots are inconclusive.
37. **Can a delayed job revive an overturned decision?** No: expected-revision checks and compare-and-set pointers (§22.2).
38. **Can a password reset complete partially?** No: credential replacement, token consumption, session revocation, cooling, security-version bump, audit and notice enqueue are one transaction; sessions with stale security versions are rejected anyway ([identity §6.3](docs/design/identity.md#63-redemption-one-atomic-security-transition)).
39. **Does building the frontend first risk fake architecture?** It is contained: the UI is built against `@blacklist/contracts` schemas and a typed mock API client; mocks confer no authority and are excluded from production builds (§36).

---

## 34. Decision log

Rev-2 changes are marked; superseded wording is retained for history.

| ID | Decision | Section / record |
|---|---|---|
| D-001 | Modular monolith. **Rev 2:** four deployables (adds the isolated evidence processor) | §1.3, ADR 0004 |
| D-002 | TypeScript strict; Node LTS. **Rev 2:** Node 24 only, TypeScript 6.x | §3, ADR 0007 |
| D-003 | Next.js UI only, no DB access. **Rev 2:** one SSR secret in a server-only module | §5.3 |
| D-004 | Fastify; REST/JSON; RFC 9457 | §7 |
| D-005 | PostgreSQL (17/18) | §3 |
| D-006 | Drizzle + SQL migrations. **Rev 2:** conditional on D1–D9 | §27, ADR 0007 |
| D-007 | pg-boss transactional enqueue; no Redis in V1 | §22 |
| D-008 | ~~In-house auth from primitives~~ **Superseded (rev 2):** Better Auth headless + Blacklist identity policy | §8, ADR 0001 |
| D-009 | Staff WebAuthn mandatory. **Rev 2:** ≥ 2 authenticators, invitation-only staff accounts | §9.4, ADR 0001 |
| D-010 | Wallets are proofs, not login. **Rev 2:** per-case standing; persistent links deferred, non-exclusive | §10, ADR 0002 |
| D-011 | Risk 0–100, higher = more risk; bands. **Rev 2:** strong/weak tier combination; disclosures; no weak signals in V1 | §15, ADR 0005 |
| D-012 | Sixth provenance category `external_source` | PRD §1.1 |
| D-013 | Subject supertype; CAIP-2 chain-scoped addresses. **Rev 2:** composite subtype FKs | §12 |
| D-014 | Projects and known entities unified | §12 |
| D-015 | Roles/permissions in code; assignments in DB. **Rev 2:** adds `appeal_reviewer` | §9.2 |
| D-016 | Append-only history; current pointers. **Rev 2:** compare-and-set pointers | §12, §22 |
| D-017 | Chain abstraction: adapters + capability providers + router | §11 |
| D-018 | No own indexer at launch | §11.11 |
| D-019 | ~~Upload → quarantine → AV scan → immutable~~ **Superseded (rev 2):** images only via the isolated processor; originals never rendered; no AV in V1 | §14.3, ADR 0004 |
| D-020 | User-supplied URLs never fetched | §26.4 |
| D-021 | Same-origin; `__Host-` cookies. **Rev 2:** single exact-Origin policy, no fallbacks | §26.2, identity §11 |
| D-022 | pnpm 12 with supply-chain settings; no Turborepo | §3 |
| D-023 | Postgres search | §21 |
| D-024 | ~~In-app + security email, watch alerts~~ **Superseded (rev 2):** own-item notifications + security email | §20 |
| D-025 | Owner-scoped private tables; RLS deferred | §12 |
| D-026 | Severe findings need second approval. **Rev 2:** revision-bound; never relaxed | §14.2, ADR 0002 |
| D-027 | S3-compatible storage | §3 |
| D-028 | OpenTelemetry + pino. **Rev 2:** route templates, no research terms with identity | §24, ADR 0006 |
| D-029 | V1 chains: Solana mainnet + Ethereum mainnet | PRD §4 |
| D-030 | ~~Saved research = watchlists~~ **Superseded (rev 2):** saved research and watchlists deferred | PRD §4 |
| D-031 | Email-first registration; no unverified accounts | identity §4 |
| D-032 | Security tokens generated by the worker at send time | identity §8 |
| D-033 | Staff lifecycle: invitation, bootstrap, two-person elevation and recovery, break-glass | identity §10 |
| D-034 | Finding revisions + approval events + approve-and-publish | moderation §2–§5 |
| D-035 | Multi-path per-case standing; independence matrix; external appeal reviewer | moderation §6–§9 |
| D-036 | Transfer evidence levels + authorization basis; no association in V1 | chain-data §2–§3 |
| D-037 | Snapshot-bound verification receipts | chain-data §5 |
| D-038 | Immutable assessment input snapshots; expiry sweep | §15.4–§15.5 |
| D-039 | Stale-job protection protocol | §22.2 |
| D-040 | Honest audit claims; actor identity map; checkpoint decided at hosting (O-13) | §23 |
| D-041 | Per-item evidence objects; no global deduplication in V1 | §14.5 |
| D-042 | Pending reports private with no public effect | §14.1 |
| D-043 | Sanctions as an attributed badge; activation deferred to legal review | chain-data §8 |
| D-044 | Language, file-type and module separation rule | §4.4 |
| D-045 | Smaller V1 scope | PRD §4, ADR 0005 |
| D-046 | Blacklist-owned password-reset tokens; Better Auth reset endpoints unused | identity §6, ADR 0008 |
| D-047 | Security-email delivery layer with explicit outcomes; tokens redeemable only after provider acceptance | identity §8, ADR 0008 |
| D-048 | Atomic reset (and password/email change) transitions; per-account security lock and security version | identity §2, §5.4, §6, ADR 0008 |
| D-049 | E-1 accepted with mandatory mitigations M1–M10 | identity §5.5, ADR 0001 |
| D-050 | Solana account-state agreement only at the identical context slot | chain-data §5, ADR 0003/0008 |
| D-051 | Author + independent approver; publication is a system transition | moderation §1, §4, ADR 0002/0008 |
| D-052 | Frontend-first execution; backend acceptance gates in Phase 7; V1 public risk = band + explanation | §36, §15, ADR 0005/0008 |

---

## 35. Open and deferred decisions

| ID | Decision | Status / recommendation | Needed by |
|---|---|---|---|
| O-1 | Authentication implementation | **Resolved:** ADR 0001/0008 (Better Auth headless for credentials and sessions; Blacklist-owned reset and delivery), conditional on acceptance checks S1–S17 in Phase 7 | — |
| E-1 | Plain session-token storage compensated by HMAC-signed cookies | **Resolved (owner 2026-10-04): accepted with mitigations M1–M10**; re-evaluate before any Better Auth upgrade | — |
| O-2 | Drizzle vs Kysely | **Resolved conditionally:** Drizzle subject to D1–D9 (ADR 0007) | Before first migration |
| O-3 | Blockchain providers (incl. same-slot Solana capability, archival EVM state) | Open: capability/archival/independence/terms matrix | Phase 8 |
| O-4 | Hosting, edge, CI | Owner selected Free Render API/worker + Neon PG18 Frankfurt + Resend; verified endpoint TLS accepted. Owner subsequently explicitly authorized PR8 merge, public foundation activation and removal of Vercel visitor protection (2026-10-13); API/user security controls unchanged. Both services healthy; follow-up exact-peer repair verifies anonymous SSR ingress without weakening identity controls, while signed-in identity/sender validation and coverage/audit/independent review/CI/recovery remain open. Actual source and limits in AI_HANDOFF; no production readiness or Phase8 claim | Foundation public; launch readiness unresolved |
| O-5 | Error tracking | Open; external export off until decided | Before enabling export |
| O-6 | Human-verification provider | Open (Turnstile candidate); UI phases use a fake | Phase 7 |
| O-7 | Email provider (TLS, retention, no link rewriting on security mail) | Owner selected Resend, preferring compatible HTTPS (2026-10-13); real account/sender/acceptance, tracking and retention verification pending; Mailpit remains local | Before staging |
| O-8 | PostgreSQL RLS | Deferred; owner-scoped checks from Phase 7 | When private sharing arrives |
| O-9 | Message-signing-incapable wallets | **Resolved:** staff-assisted standing | — |
| O-10 | TypeScript 7 vs 6 | **Resolved:** TypeScript 6.x (ADR 0007) | — |
| O-11 | Node baseline | **Resolved:** Node 24 LTS (ADR 0007) | — |
| O-12 | V1 ruleset calibration (§15.3), including band transitions | Open: owner sign-off after golden-set calibration | Phase 10 / before public bands |
| O-13 | Independent audit checkpoint | Open, decided with O-4; recommended before launch | Before launch |
| PRD P-1 … P-13 | Product decisions | See PRD §10 (P-1, P-2, P-4, P-5, P-11 decided) | Various |

---

## 36. Implementation phases

**Execution is frontend-first** (owner decision, ADR 0008). Each phase requires **explicit owner authorization**, ends with a Codex review, and updates `AI_HANDOFF.md`. No phase is authorized by this document.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Architecture** (current, closing) | Documentation, threat model, rules, scaffold; reviews and corrections (revisions 1–3) | Final Codex closure check; owner ratification of ADRs 0001–0008 |
| **1 — Frontend Foundation / Design System / App Shell** | Toolchain for frontend only (Node 24, pnpm 12.7.0, TypeScript 6, ESLint, Vitest, Playwright); `apps/web` Next.js foundation; routing for all V1 route groups with placeholder states; layout and app shell; design system (Tailwind tokens, typography, colour, spacing, Radix primitives); responsive structure; accessibility baseline; light/dark themes; `@blacklist/contracts` initial Zod DTOs; **typed mock API client** with deterministic fixtures; frontend CI checks | Shell and design system reviewed; a11y baseline (axe) green; mock layer validated against contracts; Codex review |
| **2 — Authentication & Account UI** | Login, register (email-first), register/complete, forgot/reset password, email-change confirm, verification and link-state pages (expired, invalid, check-email), account security settings (password, email, sessions), staff enroll and verify screens. All against mocks | All states rendered per PRD §5.2; fragment-token page behaviour; keyboard/mobile/dark E2E on mocks |
| **3 — Research UI** | Dashboard, universal search and results, address/wallet, transaction, token/contract and project pages; disclosures; transfer evidence level and authorization wording; risk band + explanation + confidence/coverage/freshness/dispute state; degraded/unavailable/not-assessed states | Research states complete; no numeric public score; provenance labels everywhere |
| **4 — Staff UI** (reordered, owner 2026-10-12) | Moderator workspace (queue, case view), finding revision editor, author/approver flows with system-publication display, evidence review (derivatives only), standing and appeal review, emergency suspension, admin (staff lifecycle, users, projects, labels, suppressions, audit viewer) | Independence rules visible in UI; mocks confer no authority |
| **5 — Reporting & Redress UI** (reordered, owner 2026-10-12) | Report flow (private), image evidence UI (upload, processing, rejected states), transaction-hash evidence, report status, responses, corrections, appeals, standing-proof UI (signature, authority, DNS, documentary), notifications | Flows complete with all states; no public pending-report surface |
| **6 — Frontend Quality Pass & Review** | Mobile/tablet/desktop, WCAG 2.2 AA audit, loading/error/empty/stale states, security-sensitive UX (seed-phrase warnings, defanged URLs, lookalike highlighting, token pages), responsive E2E on mocks; owner + Codex review of the complete frontend | Owner sign-off on the primary frontend |
| **7 — Backend Foundation** | **Acceptance gates first: D1–D9 (ADR 0007), S1–S17 (identity §14.2).** Then local Compose, `config`, `db`, `api` and `worker` skeletons, identity (registration, login, reset, email change, sessions, security version, throttling, Origin), delivery layer, complete staff lifecycle, audit; contract-for-contract replacement of auth mocks | All gates recorded; identity, authz, staff, Origin, E-1, delivery and reset-atomicity suites green; Codex security review |
| **8 — Chain Data & Research Backend** | Registry, adapters, providers (after O-3), router, verification receipts, research endpoints replacing research mocks | Fault-injection, authorization-basis and snapshot suites green |
| **9 — Reports, Evidence & Moderation Backend** | Private reports, isolated image processor, revisions/approval/system publication, standing, responses, appeals, corrections | Evidence isolation, approval-race, standing and independence suites green |
| **10 — Risk Engine & Admin Backend** | V1 strong-evidence ruleset, assessments with input snapshots, expiry, stale-job protocol, methodology data, admin, notifications | Golden, replay, invariant, stale-job suites green; O-12 calibration |
| **11 — Integration, Hardening & Launch Readiness** | End-to-end integration with real backend, pentest/security review, staff security re-verification, performance, restore drill, break-glass and recovery drills, **legal review (blocker)**, retention approval, O-13 | Launch checklist signed by owner |

**Phase order change (owner decision, 2026-10-12):** the Staff UI is built as Phase 4 and the Reporting & Redress UI as Phase 5, swapping the original order. Staff screens run on mock cases that stand in for member submissions until Phase 5 builds the member side. The phase contents and exit criteria are unchanged.

**Phase 5 brief (owner, 2026-10-12):** run as "Frontend Completion and Integration Validation": the Reporting & Redress scope above, plus connected member↔staff journeys on a shared mock store, a requirements checklist ([docs/frontend-requirements-checklist.md](docs/frontend-requirements-checklist.md)) and backend integration contracts ([docs/design/api-integration-contracts.md](docs/design/api-integration-contracts.md)). The WCAG 2.2 AA audit stays in Phase 6. A follow-up in the same phase (owner, 2026-10-12) built the remaining items: emergency suspension, the admin console (staff lifecycle, members, labels, suppressions), public subject responses, authority-signature standing and minimal profile settings. Real upload processing states remain Phase 7 (ADR 0004).

**Frontend-first rules:**

1. **No fake architecture.** UI code consumes `@blacklist/contracts` schemas through a typed API-client interface. The mock implementation of that interface uses deterministic fixtures that are validated against the same Zod schemas in tests. Screens never invent fields the contracts lack. A missing field means a contract change, reviewed like any architecture change.
2. **Mocks confer no authority.** Mock "sessions", roles and staff assurance exist only for rendering states. The mock client is excluded from production builds (build check), and nothing in the UI is treated as an authorization decision.
3. **Security UX is designed now, enforced later.** Exact-Origin, token-fragment handling, generic errors and no numeric public score are reflected in the UI. Server enforcement and every security gate remain mandatory in Phase 7+ and are never considered satisfied by the frontend.
4. **Narrow validation spikes** (e.g. Better Auth compatibility, Drizzle transactions, pg-boss enqueue, critical package compatibility) may run **earlier only with explicit owner authorization** when the frontend would otherwise depend on an unproven assumption. They must be minimal, isolated (a `spikes/` scratch area or branch, not merged into production packages), labelled as validation, and never grow into backend implementation. Their results are recorded in `AI_HANDOFF.md`; the gates are still re-confirmed in Phase 7.
5. File separation (AGENTS.md §7) applies to all frontend work.

> Phase numbers in ADRs 0001–0007 refer to the earlier backend-first plan. Mapping (ADR 0008): old 1 → 7, old 2 → 8, old 3 → 9, old 4 → 10, old 5 → 11.

---

## 37. Self-review record

### 37.1 Round 1 (2026-10-04, before the Codex review)

Corrections made while designing and in the first post-draft pass are recorded in revision 1 (ceiling keyed on strongest signal, removal of duplicate concepts, private-label separation, POST-only tokens, SSR rate limits, dusting, Solana case sensitivity, `disputed`/`suspended` split, "interaction risk" definition, `saveExact`, `@types/node`).

The independent Codex review then found issues round 1 missed, most importantly **R-01** (attacker-chosen password survives verification), **R-03** (tokens in queues), the weak-signal ceiling hole (R-10), and transfer-authorization semantics (R-06). Round 1 checked consistency between documents but did not adversarially walk each protocol step. That lesson is applied below.

### 37.2 Round 2 (2026-10-04, after the review response)

Each owner-required check was performed by tracing the protocol step by step, not by keyword matching:

| Check | Result |
|---|---|
| Is R-01 impossible? Can registration bind attacker credentials? | Traced every state: `start` creates no authenticator; the only credential-creating step needs the mailbox token; the token exists only in worker memory and the email. **Impossible by construction** (identity §4.5). The walkthrough also found a timing-oracle variant (A1 below), now fixed |
| Are reset/verification tokens exposed to the queue? | Payloads carry identifiers (plus a normalized email for resets); generation happens at send; Better Auth stores reset identifiers hashed; logs and DLQs carry IDs only. **No** |
| Can staff recover insecurely? | Every path ends in re-enrollment with two new authenticators after two-person verification and a 24-hour objection window. No path disables WebAuthn or creates a session without it. Break-glass needs two independent technical controls (round 3: these are two-person only under the owner's procedural control P-13). The first pass found the mailbox-takeover gap (A2), fixed with a split secret. **No** |
| Can approval apply to the wrong revision? | Approval binds to revision ID + content hash; publication re-verifies under a row lock; approve-and-publish is atomic; replacing a severe publication needs fresh independent approval (A3). **No** |
| Can transaction direction imply guilt? | V1 computes no association; `unknown` basis contributes zero; incoming never counts. **No** |
| Can providers cross-check different snapshots? | `agree` requires the same snapshot identity and different independence groups; Solana slot mismatch → inconclusive. **No** |
| Can malicious evidence harm moderators? | Images only; decoded in a credential-free isolated process; staff see re-encoded derivatives only; originals have no UI path. Residual: a libvips exploit inside the sandbox (contained). **Mitigated** |
| Can people without current wallet keys appeal? | Staff-assisted documentary standing, authority signatures, DNS TXT, correction requests. **Yes** |
| Can pending reports leak reputation signals? | No count, indicator, score effect or public DTO field. Score differences cannot reveal reports because reports contribute nothing. **No** |
| Can stale jobs revive overturned decisions? | Expected-revision checks, state-based recompute, compare-and-set pointers, currency check before notifications. **No** |
| Are audit logs described honestly? | ADR 0006 claim used in §23, ESSENTIALS and THREAT-MODEL; "immutable" not used for the hash chain. **Yes** |
| Are CSRF policies consistent? | One policy (identity §11); other documents link to it; no `Sec-Fetch-Site` fallback anywhere. **Yes** (verified by search) |
| Are separation rules clear? | AGENTS §7, ESSENTIALS §16, §4.4. **Yes** |
| Are Node/TypeScript baselines coherent? | `package.json`, `.nvmrc`, ADR 0007, §3, the dependency policy and README agree. **Yes** |
| Is V1 realistically small? | Watchlists, links, sanctions, association, community signals, AV, PDFs, public profiles and counterparty analytics are removed. The remaining large items are identity and staff security (unavoidable) and two chain families (owner requirement). **Smaller; still the full core loop** |

**Design flaws found by the round-2 adversarial walkthrough (fixed, not in Codex's list):**

| # | Flaw | Fix |
|---|---|---|
| A1 | `register/start` did one insert + one enqueue for new emails but only an enqueue for existing ones: a potential timing oracle for enumeration | The API never checks existence; it always inserts an intent and enqueues; the worker decides token vs notice (identity §4.3) |
| A2 | Staff recovery and invitations ended in an emailed invitation, so an attacker who controls the staff member's mailbox (the very scenario recovery handles) could enroll their own authenticators | Split secret: enrollment needs the emailed token **plus** an out-of-band one-time enrollment code; the recovery code is never emailed; the subject is notified (identity §10.4, §10.11) |
| A3 | Reversing a severe finding needed two people, but publishing a *downgraded* revision needed one, so a single (possibly bribed) moderator could weaken a severe finding | Replacing a published severe revision requires independent approval; suspending one alerts all admins (moderation §4 item 8, §8.3) |
| A4 | The CSP had no `img-src` for the evidence domain, so the staff UI could not display derivatives (which would invite unsafe workarounds) | `img-src` allows the evidence download origin for derivatives only (§26.1) |

**Documentation errors found and fixed during round 2:**

- the old §26.3 fallback wording;
- "tamper-evident" phrasing without limits;
- watchlist references in the V1 scope;
- `pending_verification` remnants;
- `email_verified` gating of member permissions (all accounts are now verified);
- two broken anchors;
- ClamAV left in the e2e environment.

Search-based verification of these is recorded in `AI_HANDOFF.md`.

### 37.3 Round 3 (2026-10-04, after the Codex re-review)

The Codex re-review demonstrated two errors that both of my earlier rounds missed, because they lie in **library behaviour**, not in our own documents:

- Better Auth 1.7.6 swallows reset-email callback errors.
- Its reset completion is several separate writes.

Lesson: when a protocol depends on library behaviour, the behaviour is verified at the source level **before** it is ratified, not deferred to a later spike.

| Item | Resolution |
|---|---|
| V2-01 reset email errors swallowed | Blacklist-owned reset tokens and delivery layer; explicit `accepted_for_delivery` / `retryable_failure` / `permanent_failure`; redeemable only after acceptance; invalidate before retry |
| V2-02 non-atomic reset | One transaction: credential, token consumption, session revocation, cooling, security version, audit, notice enqueue; per-account lock; security-version check on every request |
| V2-03 Solana different-slot agreement | Identical context slot required; otherwise inconclusive or unavailable; no scoring signal from unverifiable Solana account state |
| V2-04 approver vs publisher | Author + approver are the only human roles; publication is a system transition caused by approval |
| V2-05 backend-first sequencing | Frontend-first phases 1–6; backend gates moved to Phase 7 |
| Owner decisions | E-1 accepted with M1–M10; P-11 band + explanation |
| Non-blocking | Uniform-work email change; EVM block-level balance deltas no longer upgrade individual transfers; receipt fields; V1 formula simplified; staff device and break-glass wording; stale testing README |

Final adversarial checks performed for this round are listed in `AI_HANDOFF.md` (session 4).

### 37.4 Remaining uncertainties

- Backend acceptance outcomes D1–D9 and S1–S17 (Phase 7; any failure needs an ADR).
- O-12 calibration (including band transitions).
- Legal review outcomes.
- Staffing for independence (P-12).
- The break-glass procedural control (P-13).

All are recorded as decisions or gates, not guesses.
