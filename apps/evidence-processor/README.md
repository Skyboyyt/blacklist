# @blacklist/evidence-processor

**Isolated** image sanitizer for user-submitted evidence ([ADR 0004](../../docs/adr/0004-hostile-evidence-isolation-and-lifecycle.md), ARCHITECTURE.md §14.3). **Status:** not implemented; Phase 9 (the evidence UI in Phase 4 uses mocks).

## Why a separate deployable

Uploaded files are hostile. Decoding them runs native code (libvips via `sharp`). If a decoder is exploited, the attacker must land in a process that holds **nothing worth stealing and can reach nothing useful**. That is impossible inside the general worker, which holds database and application credentials.

## Contract

- Input per job, from the worker over the internal network: **one** scoped presigned GET URL (the quarantine object), **one** scoped presigned PUT URL (the derivative key), and the limits.
- Processing:
  1. magic-byte check (PNG | JPEG | WebP);
  2. reject animated images, > 40 megapixels, > 12,000 px per side, oversized input, and any decoder error (**fail closed**);
  3. decode → re-encode → strip all metadata;
  4. PUT the derivative.
- Output: `{ status, width, height, derivativeSha256, processorVersion }` or `{ status: "rejected", reason }`.

## Isolation requirements (deployment)

- **No** database credentials, application secrets, `BETTER_AUTH_SECRET`, provider keys or SMTP credentials. Its environment holds only non-secret limits and its port.
- Network egress **only** to the object-store endpoint. Inbound only from the worker.
- Non-root user, read-only root filesystem, temporary in-memory scratch space, CPU/memory/time limits, disposable instances.
- Imports only `@blacklist/core` (+ `sharp`, Zod). Must never import `domain`, `db`, `chains` or `config`.

## Planned layout

```
src/
  server.ts        minimal internal HTTP endpoint (one route)
  sanitize.ts      decode/re-encode with limits
  limits.ts        constants
```
