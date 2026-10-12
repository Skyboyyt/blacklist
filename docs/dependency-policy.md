# Blacklist — Dependency Policy and Register

| Field | Value |
|---|---|
| Status | **Revision 4** (2026-10-05) — **Phase 1 frontend dependencies installed** (§2.1, exact versions, all ≥ 7 days old at install). Backend packages from Phase 7 |
| Related | [ARCHITECTURE.md §3, §26.7, §28](../ARCHITECTURE.md), [THREAT-MODEL.md T-43](../THREAT-MODEL.md) |

## 1. Policy

Before adding any important dependency, answer in the PR (and add/update the register below):

1. **Why is it necessary?** What would we otherwise write, and how risky is that code?
2. **Is it maintained?** Recent releases, responsive security process, number of maintainers, bus factor.
3. **What security risk does it introduce?** Install scripts, native code, network access, transitive dependency count, permissions it needs at runtime, past advisories.
4. **Is there a simpler solution?** Standard library, an existing dependency, or a few lines of our own code.

Rules:

- Prefer few, well-known libraries — especially in auth, crypto, evidence handling and risk scoring.
- No dependency for trivial functionality (left-pad rule).
- Exact versions are recorded in `package.json` (`saveExact: true`) and the lockfile; CI installs with `--frozen-lockfile`. Add packages as `pnpm add <pkg>` or `pnpm add <pkg>@<exact-version>`. An explicit range such as `<pkg>@24` is saved as a range even with `saveExact` (verified with pnpm 12.7.0).
- New versions are adopted only after the **7-day release-age window** (`minimumReleaseAge: 10080`), unless an urgent security fix is approved by the owner (add a time-boxed `minimumReleaseAgeExclude` entry with a comment).
- `trustPolicy: no-downgrade` stays on (blocks versions whose publish trust evidence is weaker than earlier versions).
- Dependency build/install scripts are blocked by default; `strictDepBuilds: true` fails installs that need unapproved builds. Any `allowBuilds` entry requires owner approval and a register note.
- Internal packages use the `@blacklist/*` scope with the `workspace:` protocol only (dependency-confusion defense). Consider registering the npm scope to block squatting (owner decision).
- GitHub Actions pinned to full commit SHAs; container base images pinned by digest.
- Automated update PRs (Renovate or Dependabot) must respect the release-age window and are reviewed like code.
- CI runs OSV-Scanner/`pnpm audit`, generates an SBOM, and fails on known critical vulnerabilities without an approved exception.
- Remove unused dependencies promptly.

## 2.1 Installed in Phase 1 (2026-10-05)

Installed with pnpm 12.7.0 under Node 24.21.0. Every version is exact (`saveExact`), was published at least 7 days before installation (`minimumReleaseAge`), passed `trustPolicy: no-downgrade`, and needed **no install scripts** (`strictDepBuilds` passed with an empty `allowBuilds`).

| Package | Version | Where | Why |
|---|---|---|---|
| `next` | 16.3.6 | web | App Router, SSR, proxy (CSP nonce). 16.3.8 was too new for the release-age policy |
| `react`, `react-dom` | 19.3.0 | web | UI |
| `zod` | 4.6.5 | contracts, web | Shared schemas and DTO types |
| `@radix-ui/react-dialog` | 1.1.23 | web | Mobile navigation sheet (focus trap, Escape, focus return) |
| `@radix-ui/react-tabs` | 1.1.21 | web | Research detail tabs (roving focus) |
| `@radix-ui/react-tooltip` | 1.2.16 | web | Supplementary hints only |
| `clsx`, `tailwind-merge` | 2.1.1, 3.7.0 | web | Class composition |
| `server-only` | 0.0.1 | web | Build error if a server module reaches the browser |
| `get-nonce` | 1.0.1 | web (Phase 2) | Gives Radix's runtime `<style>` injection the CSP nonce so production `style-src` no longer needs `'unsafe-inline'` for style elements. Already a transitive dependency of Radix; no dependencies, no install scripts |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | web (dev) | Styling, build time only |
| `typescript` | 6.0.3 | all (dev) | Type checking (ADR 0007) |
| `@types/node` | 24.19.0 | dev | Node 24 types |
| `@types/react`, `@types/react-dom` | 19.3.0 | web (dev) | Types |
| `eslint`, `@eslint/js` | 9.39.5 | dev | Lint. ESLint 10 is blocked because `eslint-plugin-jsx-a11y` 6.10.2 supports up to ESLint 9; npm marks 9.39.5 deprecated, so revisit when jsx-a11y supports 10 |
| `typescript-eslint` | 8.70.1 | dev | TypeScript lint rules |
| `@next/eslint-plugin-next` | 16.3.6 | dev | Next.js rules (used instead of `eslint-config-next` to avoid `eslint-plugin-import` and its resolvers) |
| `eslint-plugin-react-hooks` | 7.1.1 | dev | Hooks and React Compiler rules |
| `eslint-plugin-jsx-a11y` | 6.10.2 | dev | Accessibility lint (strict) |
| `globals` | 17.12.0 | dev | ESLint globals |
| `prettier` | 3.9.9 | dev | Formatting |
| `vitest`, `vite` | 5.0.2, 8.3.1 | dev | Unit and component tests |
| `jsdom` | 30.1.1 | web (dev) | DOM for component tests |
| `@testing-library/react`, `/dom`, `/user-event`, `/jest-dom` | 16.3.3, 10.4.2, 14.6.7, 7.0.1 | web (dev) | Component tests |
| `axe-core` | 4.13.0 | web (dev) | Accessibility checks in component tests |
| `@playwright/test`, `@axe-core/playwright` | 1.63.0, 4.13.0 | e2e (dev) | Browser tests and WCAG audits (Chromium downloaded by Playwright) |

**Override:** `pnpm-workspace.yaml` maps `semver@^6` to `7.7.4`. Babel (dev only, via `eslint-plugin-react-hooks`) requests `semver@^6.3.1`, which `trustPolicy: no-downgrade` flags as a trust downgrade. semver 7 is API-compatible for Babel's use. The override changes resolution only; no policy setting was relaxed.

**Deferred from the plan:** `@tanstack/react-query`, `react-hook-form` and `@hookform/resolvers` (Phase 1 forms are small and validate with the contract schemas directly; reconsider in Phases 2–4), `@vitest/coverage-v8`, `fast-check`, `lucide-react` (an inline icon set is used), `next-themes` (a 10-line pre-paint script is used), web fonts (system font stacks; no third-party requests).

## 2. Register (planned — to be confirmed at installation time)

Status: **Planned** = approved in architecture, not installed. Versions are pinned at installation after the release-age check.

| Package | Used by | Purpose / why | Risk notes | Status |
|---|---|---|---|---|
| `typescript` | all | Type checking | **6.x** (6.0.3 latest; ADR 0007). TypeScript 7 deferred until Next.js, typescript-eslint and test tooling support it end to end. Contract files re-checked with 6.0.3 on 2026-10-04 | **Installed (Phase 1, §2.1)** |
| `@types/node` | server packages | Node.js global types (e.g. `AbortSignal` in `packages/chains`) | Dev only; **24.x** to match the runtime | **Installed (Phase 1, §2.1)** |
| `better-auth` | domain/identity (api, worker) | Headless credential storage, sign-in, DB sessions, revocation (ADR 0001/0008). **Not** used for reset, verification or email change | 22 advisories to date, mostly in plugins and OAuth surfaces we disable. Main package depends on all DB adapters (Mongo, Prisma, …), so review the footprint (spike S15). **Router never mounted, no plugins (bearer/JWT/session-conversion forbidden), cookie cache and rate limiter off, telemetry off.** Pin exact version (1.7.6 today) and track GHSA. Plain session-token storage = **E-1 accepted with mitigations M1–M10**; re-evaluate E-1 and the reset/delivery assumptions before any upgrade | Planned (conditional on spike S1–S15) |
| `next`, `react`, `react-dom` | web | UI framework, SSR/streaming | Large surface; track security releases closely; never rely on proxy/middleware for auth | **Installed (Phase 1, §2.1)** |
| `tailwindcss` | web | Styling | Build-time only | **Installed (Phase 1, §2.1)** |
| Radix UI primitives (per component) | web | Accessible dialogs, menus, popovers | Add per primitive, not the whole suite | **Installed (Phase 1, §2.1)** |
| `@tanstack/react-query` | web | Client data caching/mutations | Client only | Planned |
| `react-hook-form`, `@hookform/resolvers` | web | Complex forms with Zod | — | Planned |
| `zod` | contracts, api, worker, config | Validation + shared types | Core dependency; pin major | **Installed (Phase 1, §2.1)** |
| `fastify` + `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/multipart`, `@fastify/helmet` (or own header plugin) | api | HTTP server and security plugins | Official plugins only | Planned |
| `pino` | api, worker | Structured logging | Bundled with Fastify | Planned |
| `drizzle-orm`, `drizzle-kit` | db | Type-safe queries, SQL migrations | **Pre-1.0**: pin exact; review release notes (O-2) | Planned |
| `pg` (node-postgres) | db | PostgreSQL driver | Mature | Planned |
| `pg-boss` | domain, worker | Postgres job queue | Stable majors | Planned |
| `@node-rs/argon2` | domain/identity | Argon2id hashing (supplied to Better Auth's hash/verify hooks) | Native prebuilt binaries via optional platform packages (no install script expected — verify) | Planned |
| `@simplewebauthn/server`, `@simplewebauthn/browser` | identity, web | Staff WebAuthn enrollment, assurance, action-bound step-up | Focused, well-maintained (1 Low advisory) | Planned |
| `viem` | chains, web (wallet message signing) | EVM types, RPC, SIWE helpers, ABI decoding | Pin; tree-shake on web | Planned |
| `@solana/kit` | chains | Solana RPC/types | Pin; verify transitive deps | Planned |
| `@noble/curves` or `@noble/ed25519` | chains/identity | ed25519 verification (SIWS) if not covered by `@solana/kit` | Audited, zero deps | Planned (only if needed) |
| `@wallet-standard/app` (or equivalent) | web | Solana wallet discovery/sign | Client only | Planned |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | evidence | S3-compatible storage + presigned URLs | Large; import only needed clients | Planned |
| `file-type` | evidence | Magic-byte MIME detection | — | Planned |
| `sharp` | **evidence-processor only** | Strict decode and re-encode of images | Native (libvips). Confined to the isolated, credential-free processor (ADR 0004). Verify prebuilt binaries need no install script; otherwise an `allowBuilds` entry needs owner approval | Planned (Phase 3) |
| `nodemailer` | notifications | SMTP sending | Mature | Planned |
| `@opentelemetry/*` | api, worker, web | Tracing/metrics | Many packages — keep to SDK + needed instrumentations | Planned |
| Error-tracking SDK | api, worker, web | Error reporting | Depends on O-5 | Pending decision |
| `vitest`, `@vitest/coverage-v8` | dev | Tests | Dev only | `vitest` installed (Phase 1); coverage planned |
| `testcontainers`, `@testcontainers/postgresql` | dev | Real Postgres in tests | Requires Docker | Planned |
| `@playwright/test`, `@axe-core/playwright` | dev | E2E + accessibility | Browser downloads in CI | **Installed (Phase 1, §2.1)** |
| `fast-check` | dev | Property-based tests | Dev only | Planned |
| `eslint`, `typescript-eslint`, `prettier` | dev | Lint/format, boundary rules (including relative paths and subpath exports) | Use versions compatible with TypeScript 6.x | **Installed (Phase 1, §2.1)** |
| `gitleaks` (binary, not npm) | dev/CI | Secret scanning | Pin release; verify checksum | Planned |

### Considered and rejected (for now)

| Package | Reason |
|---|---|
| `next-auth`/Auth.js, hosted auth SDKs, Ory Kratos | See ADR 0001 comparison |
| Better Auth plugins (passkey, two-factor, magic-link, email-OTP, bearer, JWT, admin, organization, API key, OIDC, SIWE, …) | Not needed; enlarge the surface where most advisories occurred (ADR 0001) |
| ClamAV / antivirus clients | Deferred with image-only V1 (ADR 0004); return with any non-image format |
| `prisma` | Heavier engine; less SQL control (§3) |
| `ioredis`/`redis`, `bullmq` | No Redis in V1 (§3) |
| `@trpc/*`, GraphQL servers | REST chosen (§7.1) |
| `ethers` | `viem` chosen |
| `@solana/web3.js` v1 | Maintenance mode; `@solana/kit` chosen |
| `turbo`, `nx` | Not needed at this size |
| State libraries (Redux, Zustand, Jotai) | Not needed (§6.4) |
| `jsonwebtoken`/`jose` for sessions | Opaque DB sessions chosen (Better Auth uses `jose` internally only for flows Blacklist does not use) |
