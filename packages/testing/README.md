# @blacklist/testing

Development-only test utilities. **Status:** empty. Frontend fixtures and mock-client helpers arrive in Phase 1; backend harnesses from Phase 7.

## Planned contents

- PostgreSQL Testcontainers harness: start once per suite, apply all migrations from empty, isolate tests with transactions or per-test schemas, provide app-role and elevated-role clients (to test grants and append-only triggers).
- **Frontend (Phase 1+):** contract-validated fixtures and the typed mock API client used by `apps/web` tests (excluded from production builds; confers no authority).
- Actor factories for the authorization matrix (anonymous, member owner, member non-owner, suspended member, staff without WebAuthn assurance, moderator, appeal_reviewer, admin).
- Provider fakes implementing `@blacklist/chains` capability ports with fault injection: timeouts, 429 + `Retry-After`, 5xx, malformed payloads, truncated history, stale blocks, provider disagreement, reorgs, duplicate events.
- Sanitized recorded fixtures for EVM and Solana (no API keys, no personal data).
- Fakes for storage, the isolated evidence processor, the security-email delivery layer (scriptable `accepted_for_delivery` / `retryable_failure` / `permanent_failure` / timeout), human verification, clock and randomness.

Never imported by production code.
