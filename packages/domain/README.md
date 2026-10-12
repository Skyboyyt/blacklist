# @blacklist/domain

Server-only business logic. Used by `apps/api` and `apps/worker`. **Status:** empty; modules are created phase by phase.

## Modules (`src/<module>/`)

| Module | Owns | Phase |
|---|---|---|
| `access` | Roles (`member`, `moderator`, `appeal_reviewer`, `admin`), code-defined permission catalog, `Actor`, policy helpers | 1 |
| `identity` | Better Auth integration (headless), registration intents, email change, session policy, staff accounts/invitations/authenticators/assurance/step-up/recovery/break-glass, throttling, cooling periods, security-email issuance ([design](../../docs/design/identity.md)) | 1 |
| `audit` | Append function, hash chain, actor identity map, security events | 1 |
| `subjects` | Subject registry (addresses, projects, domains), public labels | 2 |
| `chaindata` | Pinned finalized facts, verification receipts and records, invalidations | 2 |
| `research` | Address/tx/token/project read models, search | 2 |
| `projects` | Staff-managed projects/entities, official addresses and domains, revisions | 2–3 |
| `evidence` | Evidence items, per-item objects, derivatives, custody events, processor orchestration | 3 |
| `reports` | Private reports, subjects, status history, staff-only duplicate signals | 3 |
| `moderation` | Cases, finding revisions, approval events, decisions, standing, responses, appeals, corrections ([design](../../docs/design/moderation.md)) | 3 |
| `risk` | Rulesets, signals and revisions, suppressions, assessments and input snapshots, pure `assess()` | 4 |
| `notifications` | Own-item in-app notifications; security email composition | 1 (security emails), 4 |

Deferred: `watch`, `community`, `investigations`, `ai`.

## Module structure

```
src/<module>/
  index.ts        public API: the ONLY file other modules may import
  service.ts      use cases; explicit Actor; policies; transactions
  policies.ts     authorization/ownership/independence rules
  repository.ts   DB access (private tables: owner ID is a required parameter)
  types.ts
  *.test.ts
```

Split further when a file gains unrelated responsibilities (AGENTS.md §7, file separation rule).

## Rules

- Every service function takes an explicit `Actor` and enforces authorization itself.
- Cross-module reactions are pg-boss jobs enqueued **in the same transaction**. Jobs carry identifiers and expected revisions; handlers reload and no-op on stale state (ARCHITECTURE §22.2).
- `risk` never imports `moderation` or `reports`; it consumes signals.
- Only the owning module writes its tables. Append-only tables are insert-only.
- May import: `@blacklist/core`, `@blacklist/db`, `@blacklist/chains`, `@blacklist/config`. Must not import: apps, `@blacklist/contracts`.
