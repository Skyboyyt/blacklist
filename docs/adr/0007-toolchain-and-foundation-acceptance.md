# ADR 0007: Toolchain baseline and Foundation acceptance checks

| Field | Value |
|---|---|
| Status | **Accepted**, **sequencing amended by ADR 0008** (frontend-first). Acceptance checks run in Phase 7 (Backend Foundation) |
| Proposed by | Claude, 2026-10-04, from owner directions and Codex review R-16/R-17 |
| Reviewed by | Codex review pending (next review round) |
| Decided by | Project owner direction, 2026-10-04 (review-response instructions §7–§8) |
| Affects | ARCHITECTURE §3, §27, §35–§36; ESSENTIALS §1; `package.json`, `.nvmrc`; dependency policy; testing strategy §9; O-2, O-10, O-11 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md) R-16, R-17; stack recommendations |

## Problem

- The scaffold allowed any Node ≥ 24, including Current releases (this machine runs 26.8.1), and named TypeScript 7 as a candidate on the strength of a two-file check.
- The database tooling choice (Drizzle) was provisionally approved without the acceptance checks that would show it supports Blacklist's requirements: reviewed SQL, transactions, composite constraints, transactional job enqueue, and privilege separation.

## Evidence

- `package.json` had `engines.node: ">=24"`.
- Node 26 is still "Current" (nodejs.org release index on 2026-10-04: v26.10.0, `lts: false`; latest 24.x is v24.21.0, LTS "Krypton").
- The TypeScript 7 release notes and Codex's review identify missing programmatic-API and tooling compatibility. TypeScript 6.0.3 is the latest 6.x (published 2026-04-16).
- Drizzle is pre-1.0. pg-boss transactional enqueue requires its transaction-aware database adapter. Better Auth's Drizzle adapter must share that transaction (identity design, spike S6).

## Decision

1. **Node.js 24 LTS** is the only supported runtime: `engines.node: ">=24.20.0 <25.0.0"`, `.nvmrc` `24`, with CI and container images pinned to a 24.x patch. Node 26 is evaluated via a new ADR after it reaches LTS **and** native dependencies are verified. A Current release is never adopted merely because it is newer.
2. **TypeScript 6.x** (6.0.3 today) for type checking, linting and Next.js. TypeScript 7 is re-evaluated via ADR once Next.js, typescript-eslint and the test tooling Blacklist uses support it end to end.
3. **pnpm 12.7.0**, pinned, with all supply-chain settings unchanged.
4. **PostgreSQL 17 or 18**, chosen with the hosting decision (O-4) based on managed support, extensions and restore tooling.
5. **Drizzle ORM + drizzle-kit remain provisionally approved**, subject to the acceptance checks below. They run in Phase 1 **before the first production migration is merged**, with real output recorded in `AI_HANDOFF.md`:

   | ID | Check |
   |---|---|
   | D1 | `drizzle-kit generate` produces reviewable SQL for representative tables (identity, audit) that matches the design (types, CHECKs, partial uniques, composite FKs) |
   | D2 | Hand-written SQL migrations work for triggers (append-only enforcement), grants, roles and the audit append function |
   | D3 | Migration transaction behaviour is understood and documented; a `CREATE INDEX CONCURRENTLY` path exists outside a transaction |
   | D4 | Composite foreign keys (subject/subtype kind, owner consistency, assessment↔subject pointer) and constraint violations surface as typed errors |
   | D5 | Forward-only production policy plus a rehearsed restore (point-in-time recovery or backup) for recovery; no down-migrations in production |
   | D6 | **pg-boss transactional enqueue:** a job enqueued inside a Drizzle transaction that rolls back does **not** exist; a committed one does. Same `pg` client and driver as production |
   | D7 | pg-boss schema is created/migrated by the **migrator role** in the deploy step; the runtime starts with the DML-only application role and never needs DDL |
   | D8 | Better Auth's Drizzle adapter participates in the same transaction (identity spike S6) |
   | D9 | Application role cannot UPDATE/DELETE append-only tables; trigger and grant tests pass |

   If any check fails and cannot be fixed within Drizzle's supported features, an ADR proposes Kysely (with explicit SQL migrations) or another justified alternative. Drizzle is not replaced merely because it is pre-1.0.
6. **Worker authority (R-16):** job payloads never carry roles, permissions or trusted owner IDs; handlers reload state. Jobs whose effect depends on a user's *current* authority or membership re-check it at execution. Effects already authorized at commit time (audit writes, security notices for events that occurred) execute regardless. Singleton keys deduplicate scheduling; they do not make external effects exactly-once.

## Alternatives considered

- **Node 26 now:** rejected (Current, not LTS).
- **TypeScript 7 now:** rejected (ecosystem compatibility unproven; no speed need).
- **Kysely now:** rejected without failing evidence. It remains the documented fallback.

## Consequences

- Developers must install Node 24. This machine currently runs 26.8.1, which `engineStrict` will reject once dependencies are installed.
- Phase 1 begins with acceptance spikes (D1–D9 here, S1–S15 in the identity design) before feature code.

## Recommendation (Claude)

Accept as written.

## Decision (owner)

Toolchain direction decided by the owner on 2026-10-04: Node 24 LTS, a stable TypeScript 6.x toolchain, and Drizzle provisionally approved with the listed validations. Not an implementation authorization.

## Addendum — 2026-10-04 (ADR 0008, frontend-first)

History above is preserved.

- The toolchain baseline (Node 24, TypeScript 6.x, pnpm 12.7.0) applies from **Phase 1 (Frontend Foundation)**, installing only frontend-side packages.
- Acceptance checks **D1–D9** (and identity S1–S17) move to **Phase 7 (Backend Foundation)** and must pass there before any production migration or security feature merges. They are **not** deleted or weakened.
- Narrow, isolated validation spikes may run earlier **only with explicit owner authorization**. They are labelled, kept out of production packages, and never replace the Phase 7 gates.
- The "Consequences" note about Phase 1 starting with spikes is superseded by this sequencing.
