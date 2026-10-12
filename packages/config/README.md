# @blacklist/config

Server-only configuration for **`apps/api` and `apps/worker`**. **Status:** empty; implemented in Phase 7.

## Responsibilities

- Parse `process.env` with Zod into typed, frozen config objects per process (`api`, `worker`).
- Fail fast at startup when required variables are missing or malformed. Errors name the variable, **never its value**.
- Enforce environment rules:
  - `__Host-` cookies outside development;
  - testnets disabled in production;
  - `APP_ORIGIN` HTTPS in production;
  - `BETTER_AUTH_SECRET` ≥ 32 bytes;
  - `BREAK_GLASS_ENABLED` false unless deliberately set.
- Single source of truth for variable names. [.env.example](../../.env.example) lists every variable with a placeholder.

## Not used by

- **`apps/web`:** its server runtime reads its two SSR variables (`API_INTERNAL_URL`, `INTERNAL_API_TOKEN`) in its own `server-only` module (`apps/web/src/server/env.ts`). Browser bundles contain no secrets.
- **`apps/evidence-processor`:** it holds no secrets; it reads only non-secret limits and its port.

## Rules

- Never import from browser code. Nothing secret uses the `NEXT_PUBLIC_` prefix.
- Never log or serialize the config object.
- Adding a variable: add it here, to `.env.example` (placeholder only), and to deployment secret configuration.
