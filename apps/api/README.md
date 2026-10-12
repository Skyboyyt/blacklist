# @blacklist/api

The Blacklist HTTP API (Fastify, REST/JSON under `/api/v1`). **Status:** not implemented. Backend work begins in **Phase 7 (Backend Foundation)**, after the frontend phases, starting with acceptance gates D1–D9 and S1–S17.

## Boundaries

- Transport layer only: plugins plus thin route modules that validate input, call `@blacklist/domain` services and map results to `@blacklist/contracts` DTOs. Routes contain no business logic or SQL.
- **Better Auth is used headless through `@blacklist/domain/identity`.** Its HTTP handler is **never mounted** here.
- May import: `@blacklist/core`, `@blacklist/contracts`, `@blacklist/domain`, `@blacklist/config`.

## Plugin order (ARCHITECTURE.md §5.4)

1. Request ID + redacting pino logger (route templates only)
2. Security headers
3. Trusted-proxy client-IP resolution (internal token required for the SSR client-IP header; internal path GET-only)
4. Rate limiting by route class (`auth`, `research`, `mutation`, `upload`, `staff`)
5. **Exact-Origin check** on non-GET/HEAD/OPTIONS ([identity §11](../../docs/design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15))
6. Session: Better Auth lookup → Blacklist session policy (status, lifetimes, staff WebAuthn assurance) → `Actor`
7. Route guard: declared auth level + permission (**startup fails if any route or method lacks a policy**)
8. Zod validation (unknown keys stripped)
9. Error handler → RFC 9457 problem+json

## Operator CLI (`src/cli/`, no HTTP equivalent)

`staff:bootstrap`, `staff:approve-invitation` (fewer than two admins), `staff:break-glass` (requires `BREAK_GLASS_ENABLED=true`), `evidence:purge:execute`, `evidence:forensic-export`. Every command is audited and requires an `--operator` label. It **never prints invitation tokens**; invitation commands print only the one-time enrollment code (identity §10.4), which is useless without the emailed token.

## Planned layout (Phase 7+)

```
src/
  server.ts                 bootstrap (config, plugins, routes, graceful shutdown)
  plugins/                  request-id, headers, client-ip, rate-limit, origin, session-policy, guard, errors
  routes/v1/<area>/         auth, staff-auth, account, research, reports, redress, notifications, mod, admin
  routes/ops/               /healthz, /readyz (internal network only)
  cli/                      operator commands
```

Endpoint groups: ARCHITECTURE.md §7.1.
