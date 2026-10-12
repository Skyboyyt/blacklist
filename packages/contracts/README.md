# @blacklist/contracts

API contracts shared by `apps/web` and `apps/api`. **Status:** Phase 1 schemas implemented (auth requests and outcomes, search, public research DTOs, viewer and dashboard) in `src/`. Public research DTOs (`research.ts`) are strict objects that admit only publicly approved data: no numeric score (P-11), risk factors only from the closed V1 factor set, capability facts as separate zero-contribution disclosures, published moderator findings only, and no report-receipt, allegation or AI payloads. Member-private data (the member's own reports and receipt times) lives in `member.ts`; staff DTOs are added with the staff UI. Further schemas are added in the frontend phases: the frontend phases define the DTOs the UI consumes, and the backend phases implement them unchanged (contract changes are reviewed).

## Responsibilities

- Zod schemas for request params/query/body and response DTOs of `/api/v1`, grouped by area (`auth`, `account`, `research`, `reports`, `moderation`, `admin`, …).
- Problem-details (RFC 9457) error shape and stable error `code` values.
- Later: OpenAPI generation for the public API.

## Rules

- Browser-safe: no server-only imports, no secrets.
- **Response DTOs are allowlists.** Public DTOs must never include private fields (email, IPs, sessions, reporter identity, private evidence, non-public wallet links). Contract tests enforce this.
- Request schemas strip unknown keys (mass-assignment defense).
- On-chain integers are decimal strings; IDs are UUID strings; timestamps are ISO-8601 UTC.
- May import: `@blacklist/core`, `zod`.
