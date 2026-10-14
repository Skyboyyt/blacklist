# Blacklist — Architecture Essentials (for coding agents)

The short, binding version of [ARCHITECTURE.md](ARCHITECTURE.md) (revision 3). Normative protocol detail lives in [docs/design/identity.md](docs/design/identity.md), [docs/design/moderation.md](docs/design/moderation.md) and [docs/design/chain-data.md](docs/design/chain-data.md). If any two documents disagree, **stop and raise it**; never pick one silently.

**Stage:** Phase7 foundation is merged; owner authorized Phase8 chain research implementation on a separate review branch. No Phase8 deployment or later phase is authorized. Provider activation requires unresolved O-3/Claude review and real-provider validation. Actual gates and limits are in [AI_HANDOFF.md](AI_HANDOFF.md) and the [Phase8 report](docs/reviews/2026-10-14-phase8-implementation.md).

**Execution order is frontend-first** (ARCHITECTURE §36):

1. Phases 1–6 build and review the primary frontend against typed contracts and mocks.
2. Phase 7 (Backend Foundation) runs the backend acceptance gates first.
3. Phases 8–11 cover the backend features and launch readiness.

Mocks confer no authority.

---

## 1. Approved stack

| Layer | Choice |
|---|---|
| Runtime / language | **Node.js 24 LTS only** (`>=24.20.0 <25`) · **TypeScript 6.x** strict (not 7; ADR 0007) |
| Package manager | **pnpm 12.7.0** with supply-chain settings (never weaken) |
| Web | Next.js App Router + React · Tailwind CSS · Radix primitives · TanStack Query (client) · React Hook Form |
| API | Fastify · REST/JSON `/api/v1` · Zod · RFC 9457 errors |
| Auth | **Better Auth, headless** (router not mounted, no plugins) for credentials and sessions + the Blacklist `identity` module for every policy (ADR 0001) · Argon2id (`@node-rs/argon2`) · staff WebAuthn (`@simplewebauthn/*`) |
| Data | PostgreSQL 17/18 · Drizzle (conditional on checks D1–D9) · committed SQL migrations |
| Jobs | pg-boss, transactional enqueue |
| Evidence | S3-compatible storage · **images only** · `sharp` **only** inside `apps/evidence-processor` |
| Chains | viem · @solana/kit behind `packages/chains` |
| Observability | pino · OpenTelemetry · Sentry-compatible (export off until O-5) |
| Tests | Vitest · Testcontainers · Playwright |

**Not approved without an ADR:** Redis, search engines, GraphQL/tRPC, microservices, other ORMs or queues, auth SaaS, Better Auth plugins or its mounted router, own node/indexer, Next.js server actions as an API, state libraries, ClamAV or other AV, PDF/document processing, TypeScript 7, Node ≠ 24.

## 2. Repository layout

```
apps/web                 UI only (.tsx/.ts). Imports core, contracts. One server-only env module (SSR token).
apps/api                 Fastify plugins + thin routes + operator CLI → domain services. Routes never touch db.
apps/worker              pg-boss handlers → domain services.
apps/evidence-processor  Isolated image sanitizer. Imports core only. No DB, no secrets, no other egress.
packages/core            Dependency-free primitives.
packages/contracts       Zod request/response schemas.
packages/domain          Business logic: src/<module>/{index,service,policies,repository,types}.ts
packages/db              Drizzle schema, migrations/*.sql, client, roles/grants.
packages/chains          Registry, family adapters, providers, router.
packages/config          Env validation for api and worker.
packages/testing         Harnesses, fixtures, fakes.
tests/e2e                Playwright.
```

Internal packages: `@blacklist/*` via `workspace:*` only.

## 3. Domain boundaries

V1 modules: `access`, `identity`, `audit`, `subjects`, `chaindata`, `projects`, `evidence`, `reports`, `moderation`, `risk`, `research`, `notifications`. Deferred: `watch`, `community`, `investigations`, `ai`.

- Import other modules only via `index.ts`. Only the owning module writes its tables.
- `risk` consumes signals; it never imports `moderation` or `reports`.
- Cross-module reactions are jobs enqueued **in the same transaction** (§11).

## 4. Authentication rules ([identity design](docs/design/identity.md))

- **Better Auth** provides credential storage, sign-in, sessions and revocation. **Blacklist** provides registration, **password reset (tokens, delivery, atomic completion)**, email change, the security-email delivery layer, session policy and the **per-account security version**, staff assurance and step-up, throttling, cooling periods, Origin enforcement, audit and wallet proofs. Better Auth reset, verification and change-email endpoints are never used.
- **Registration is email-first:** `register/start` always inserts an intent and enqueues a job, and **never checks account existence** (the worker decides token vs notice). The **mailbox-token holder sets the password** in `register/complete`, in one transaction. There are no unverified accounts.
- **Passwords:** NFKC; 8–128 code points and ≤ 512 bytes; never truncated; breach check with local fallback; no composition rules or expiry; paste and autofill allowed.
- **Sessions:** `__Host-bl_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`). Member idle 7 d / absolute 30 d; staff 30 min / 12 h. Cookie cache **off**. Every request requires a `session_policy_state` row whose `security_version` equals the account's. Security transitions (reset, password change, email change, suspension, recovery, role change) serialize on a per-account lock and bump the version.
- **E-1 accepted with mitigations** (identity §5.5). The session token is stored plainly; the cookie is HMAC-signed.
  - **Forbidden:** the bearer, JWT or any session-conversion plugin; mounted Better Auth routes; authenticating from client-supplied raw tokens; any wrapper turning stored tokens into browser authentication; token fields in DTOs.
  - The secret stays outside the DB and DB backups.
  - Expired, revoked, forged, unsigned, wrong-secret and raw-stored tokens must fail (tests).
  - Re-evaluate before any Better Auth upgrade.
- **Security-email tokens are generated by the worker at send time** (identity §8).
  - Jobs, DLQs, logs and backups never contain a token or link.
  - The delivery layer returns `accepted_for_delivery` | `retryable_failure` | `permanent_failure` (timeout = retryable).
  - A token is redeemable **only after `accepted_for_delivery`**; otherwise it is invalidated before any retry, and each retry issues a new generation.
  - At most one valid token per entity (per account for resets).
  - Fragment links (`#token=`), POST-only redemption.
  - TTLs: registration 30 min · reset 30 min · email change 1 h · staff invitation 72 h (bootstrap and break-glass 24 h).
- **Password reset completes in one transaction:** credential replaced, token consumed, all sessions revoked, 72-hour cooling started, security version bumped, audit, notice enqueued. All or nothing.
- Uniform request paths: register/start, forgot and email-change do identical work regardless of account existence (the worker decides) → 202; login → generic 401.
- Member re-auth: password within 10 min for sensitive account actions. 72-hour cooling period after reset (blocks email change).
- **Staff:** invitation-only dedicated accounts; enrollment needs the emailed token **plus an out-of-band enrollment code** (split secret); ≥ 2 WebAuthn authenticators (UV required; two registrations do not prove two independent devices, so independent failure domains are encouraged); permissions only on WebAuthn-assured sessions; **action-bound step-up** for dangerous actions; staff reset requires WebAuthn; two-person admin grants, elevation and recovery; bootstrap and break-glass by operator CLI only; no standing super-admin credential. The deployment flag and the CLI are technical controls, two-person only under the owner's procedural control (P-13).
- Wallets are never login credentials.

## 5. Authorization rules

- Default deny; startup fails if a route lacks a policy; the route guard and the domain policy share one code-defined catalog.
- Ignore client-supplied roles, owner IDs and statuses (Zod strips unknown keys; DTOs are allowlists).
- Inaccessible private resource → **404**.
- Roles: `member`, `moderator`, `appeal_reviewer`, `admin`, plus operator-CLI-only capabilities.
- Jobs: least-privilege system actors; reload authority; no universal bypass.
- Independence ([moderation §7](docs/design/moderation.md#7-independence-rules)):
  - human roles are **author** and **approver**. **Publication is a system transition** caused by an approval of the exact revision; there is no human publisher;
  - non-severe revisions may be self-approved. Severe revisions, and any revision replacing a public severe one (including a downgrade), need an **independent approver** who never authored any revision;
  - a severe appeal reviewer is a non-participant;
  - conflicted staff are blocked at every step.

## 6. Database rules ([data model](docs/data-model.md))

- UUIDv7; `timestamptz` UTC; CAIP-2 `chain_id`; `numeric(78,0)` amounts; never floats.
- Append-only tables: INSERT/SELECT grants only + a blocking trigger. Revisions, approvals, decisions, status histories, signal revisions, assessments and inputs, receipts, custody events, audit.
- Composite FKs: subtype `(id, kind)`, parent-owner consistency, assessment pointer ↔ subject.
- Private tables carry non-null owners and are accessed via owner-scoped repositories.
- Pinned chain tables hold **finalized rows only** (CHECK).
- Evidence objects are per item; no cross-item deduplication.
- Migrations: committed SQL; never `push`; applied by the migrator role in a deploy step (including the pg-boss schema); runtime is DML-only; expand/contract; forward-only.
- Parameterized SQL only.

## 7. Blockchain abstraction ([chain-data design](docs/design/chain-data.md))

- Domain code uses `ChainDataService` only. The registry constructs `ChainId`/`ChainSlug` brands; family adapters construct `Address`/`TxHash`.
- EVM: lowercase storage, EIP-55 display. **Solana base58 is case-sensitive; never lowercase.** No default chain; never merge chains.
- Every result carries provenance including **snapshot identity**. Only finalized data is pinned or scored.
- **Transfers:** evidence level + authorization basis. **`unknown` contributes zero. V1 computes no association.**
- **Cross-verification:** identical snapshot + different independence groups → `agree`.
  - Solana account reads at different context slots → `inconclusive` **even if values match** (`minContextSlot` is a lower bound).
  - With no same-slot pair, verification is `unavailable` and no scoring signal is created.
  - Mandatory only for pinned evidence and scoring facts.
  - EVM block-level balance deltas never upgrade an individual transfer.
- Explorer and off-chain data are `external_source`; metadata URIs are never fetched.

## 8. Security invariants

All 21 are listed in [THREAT-MODEL.md §8](THREAT-MODEL.md#8-security-invariants-must-be-covered-by-automated-tests) and each must be test-backed. The core ones:

1. No route without a policy.
2. Private data never reaches non-owners or public DTOs.
3. Bearer tokens (registration, reset, email change, invitation) are stored only as hashes, never appear in queues, logs or error reports, and are redeemable only after provider acceptance. Session cookies follow E-1 mitigations.
4. No credential exists before mailbox-token completion.
5. Staff permissions require WebAuthn assurance.
6. No Severe band without a severe, revision-bound, independently approved finding (or an activated authoritative designation).
7. No weak signals are active in V1 (any future enablement: never added to strong evidence, ≤ 49 alone).
8. Unknown authorization and incoming transfers never create risk.
9. Unreviewed reports never affect public output.
10. Delayed jobs never resurrect non-authoritative state.
11. The audit log is append-only for the app role, and its hash chain verifies (tamper **evidence**, not immutability).
12. Evidence originals are immutable and never rendered; only image types are accepted.
13. Exact Origin on every non-safe request.
14. No `eth_sign`, typed-data or transaction signing.
15. Password reset is all-or-nothing; sessions with a stale security version are rejected.

## 9. Evidence rules (ADR 0004)

- PNG/JPEG/WebP only; ≤ 10 MiB, ≤ 10 per report, ≤ 40 MP, ≤ 12,000 px per side, single frame. Everything else is rejected.
- API streams to quarantine with SHA-256 → worker orchestrates → **isolated processor** decodes and re-encodes (fail closed) → derivative → original moved to immutable storage.
- Staff and public see **derivatives only**. Originals: operator forensic export only.
- Signed links ≤ 5 min on a separate registrable domain, `attachment`, `nosniff`.
- URLs are stored as text and **never fetched**.
- PDFs require a new security design + ADR.

## 10. Risk-engine rules (ADR 0005)

- **0–100, higher = more risk**; ordinal, not a probability or verdict. Bands Low 0–24 · Moderate 25–49 · High 50–74 · Severe 75–100; plus `not_assessed`.
- **V1 uses supported strong evidence only:** `score = min(ceiling, Σ verified + Σ analysis)`; the ceiling is 100 only with a published severe finding, else 74. Weak signals are **inactive**. The deferred policy (`max(strong, min(49, weak))`) applies only if a future ADR enables them.
- Capability facts are **disclosures** (contribution 0).
- `assess()` is pure, with an explicit evaluation time. Immutable input snapshots; replay must reproduce. **History is never recomputed with new rules.**
- Expiry sweep is independent of page views. Compare-and-set current pointers; dirty-flag reruns.
- **Public display (P-11, decided):** band + explanation + key factors + confidence + coverage + freshness + dispute state. **Never the numeric score**, which stays internal. Public explanations reference only published, redacted artifacts.
- No manual score setting; suppressions are audited and visible.

## 11. Jobs and stale-state protection (ARCHITECTURE §22.2)

- Payloads carry identifiers only.
- Handlers reload state under lock and check the expected revision/state, else **no-op** (`skipped_stale`).
- Recompute is state-based.
- External effects are at-least-once, with idempotency keys and a currency check before sending.
- Singleton keys deduplicate scheduling; they are not exactly-once.

## 12. API conventions

`/api/v1`, cursor pagination (max 100), JSON-only mutations (multipart for uploads), UUIDv7 IDs, ISO-8601 UTC, decimal-string amounts, problem+json with a stable `code`, `Idempotency-Key` on report/evidence/appeal/response/correction creation, `Cache-Control: no-store` on authenticated responses.

**Origin/CSRF:** the single policy in [identity §11](docs/design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15):

- exact `Origin` required; missing, `null` or foreign → 403;
- no `Sec-Fetch-Site` or `Referer` fallback; same-site ≠ same-origin;
- no CORS; no CSRF tokens.

## 13. Testing requirements ([testing strategy](docs/testing-strategy.md))

- Every change ships with tests; bug fixes start with a failing test.
- Identity, access, audit, evidence, moderation and risk need the highest coverage and mandatory negative tests.
- New routes join the authorization and Origin matrices. Integration tests use real Postgres.
- **Frontend phases (1–6):** component, state and accessibility tests plus Playwright E2E against the typed mock client; fixtures validated against `@blacklist/contracts`.
- **Phase 7 begins with the backend acceptance gates D1–D9 and S1–S17**; their real output is recorded in `AI_HANDOFF.md`. Earlier spikes run only with explicit owner authorization and never replace these gates.
- Never skip, disable or weaken tests.

## 14. Logging and telemetry rules

- Route templates only, never raw paths containing addresses or hashes. No actor ID on research GET routes.
- Never log: passwords, tokens or token-bearing links, cookies, keys, seed phrases, secrets, evidence content, search terms or addresses together with an actor or session.
- Error tracking scrubs URLs, queries, bodies and headers.

## 15. Secrets and dependencies

- Secrets come only from the platform secret store; `.env` is local; `.env.example` holds placeholders.
- `BETTER_AUTH_SECRET` never goes to the database, backups, logs or client. Nothing secret uses `NEXT_PUBLIC_`. A leaked secret is **rotated**.
- Justify every dependency ([dependency policy](docs/dependency-policy.md)). pnpm settings stay on (`minimumReleaseAge` 7 days, `trustPolicy`, `strictDepBuilds`, `saveExact`). New `allowBuilds` entries need owner approval.

## 16. Language, file-type and module separation

Owner requirement, binding:

| Content | Where |
|---|---|
| React/Next UI | `.tsx` (components, pages, layouts) |
| Application logic, services, policies, validation, adapters | `.ts` in the owning package/module |
| Styling | Tailwind utility classes and approved CSS files (`globals.css`, CSS variables). No CSS-in-JS runtime |
| SQL migrations, triggers, grants | `.sql` under `packages/db/migrations` |
| Data and config | `.json`, `.yaml`/`.yml`, `.env*` (placeholders in `.env.example` only) |
| Documentation | `.md` |

- **No standalone HTML files.** Next.js renders pages.
- **No additional programming languages** without an ADR.
- **No monolithic files mixing responsibilities.** UI, styling, API handlers, business logic, authentication, database access, blockchain provider code, validation and infrastructure each live in their own module per the layout (§2) and module structure (§3). A route file never contains business logic or SQL. A component never contains data-access or auth policy. A provider client never contains domain rules.
- Size is a review signal, not a rule: a file that keeps growing or has several unrelated reasons to change must be split along these boundaries.

## 17. Prohibited patterns

- Implementing production features before the owner authorizes the phase.
- Authorization in the frontend or in Next.js `proxy.ts`/middleware.
- Mounting Better Auth's HTTP handler; enabling any plugin (especially bearer, JWT or session conversion), its cookie cache or rate limiter; using its sign-up, email-verification, change-email or password-reset flows; authenticating from raw session tokens; exposing token fields in DTOs.
- Treating a callback return as email delivery; making a token redeemable before `accepted_for_delivery`; non-atomic password resets.
- Showing the numeric risk score publicly in V1; presenting weak-signal scoring as active V1 behaviour.
- Calling different Solana slots (or any different snapshots) "agreement"; describing a separate human "publisher".
- Building production backend features before the frontend phases are complete and Phase 7 is authorized; letting mocks make authorization decisions.
- Creating any credential, session or authenticator before mailbox-token completion.
- Putting tokens or token links in job payloads, logs, errors or analytics.
- `dangerouslySetInnerHTML`; rendering user or chain text as HTML or Markdown.
- String-built SQL; `drizzle-kit push` to shared databases; app-boot migrations; DDL from the runtime role.
- JWT or `localStorage` sessions.
- Lowercasing addresses generically; omitting `chain_id`; merging chains; comparing different snapshots as agreement.
- Treating transfer direction as authorization; any association scoring in V1.
- Fetching user-supplied or metadata URLs.
- Floats for amounts.
- Requesting seed phrases or private keys; `eth_sign`; typed-data or transaction signing.
- Labelling anything "safe"; automated "scam" labels; "trust score" naming; publishing pending-report counts.
- Updating or deleting append-only rows; editing evidence originals; rendering originals; accepting non-image evidence.
- Publishing a severe finding without a valid, revision-bound independent approval; relaxing independence for staffing.
- Disabling tests, lint rules or security checks to pass CI.
- Introducing dependencies or architecture changes without justification or an ADR.
- Monolithic mixed-responsibility files; standalone HTML; new languages without an ADR.
