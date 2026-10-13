# ADR 0016: Owner-directed password minimum and canonical foundation URL

| Field | Value |
|---|---|
| Status | Accepted by explicit owner instruction; Claude independent review pending |
| Proposed by | Codex, 2026-10-13 |
| Reviewed by | Claude recommendation pending; no independent review claimed |
| Decided by | Owner, 2026-10-13: registration/reset failing on blacklist-web-eta.vercel.app; “reduce the password requirement to8” |
| Affects | Identity §3, PRD AUTH-5/P-1, prior ADR0001 length rule, current frontend/backend validation; public foundation hosting only |

## Problem and evidence

The owner explicitly changes the password minimum from15to8characters and reports registration/reset failure on the default Vercel domain. Current default domain serves register200but API viewerHTML404; all four API integration settings are branch-preview only. The existing connected preview has viewer200, actual activation email delivered and synthetic invalid-token completion400. This is a routing discrepancy, not evidence that verification should be disabled. Old links expire30minutes after accepted delivery, and newer intents supersede older links by design.

## Accepted implementation

Change the normalized Unicode code-point minimum to8in contracts, backend password normalization and headless Better Auth configuration, including maintained acceptance fixtures. Keep maximum128code points/512UTF-8bytes, NFKC, control-character rejection, Argon2id parameters/work bounds, login throttling, breached-password checking/local fallback, verification, expiration, session revocation, reset generations/security versions/cooling and mandatory staff WebAuthn unchanged. Expand the bundled denylist for common passwords newly admitted by length (such as password/12345678/blacklist); test fallback negatives. Existing hashes and longer passwords continue to work. No credential migration, minimum composition rule or token bypass. Auth browser requests have a bounded90second deadline to tolerate observed Free Render startup latency; other requests retain20seconds. Errors/aborts never become fake success.

Connect the owner's existing public Vercel domain to the actual API using protected server-only API/internal/staging settings; the application remains DEPLOYMENT_ENV=staging on the existing restricted-role Neon staging DB. Use the exact canonical frontend origin for API Origin/CORS, worker email links and WebAuthn RP. No paid resource, production database or Phase8. Preserve previous deployment/configuration for rollback and document redirects/old-link limitations. Never give the web DB/signer/mail/operator keys or treat the shared API gate as user authority.

## Consequences and alternatives

Eight-character passwords have a smaller minimum search space than the previous single-factor15character policy. This explicit owner decision is a product security tradeoff, not a security-gate pass or a weakening of hashing/verification/authorization. Strong passphrases and password managers remain recommended. Keeping15would conflict with the latest specific instruction; making only UI accept8would leave a broken contract. Longer-lived/GET-consumed tokens, fake auth success and removing email proof are rejected.

Free Render API/worker still sleep independently. Manual worker wake-up before a test window remains the approved operating procedure; this record does not authorize schedulers/keepalives or combining services; request-triggered liveness is separately owner-accepted in ADR0017. Complete reliable unattended email requires a separate reviewed operating decision. Domain ownership for Resend remains required for other recipients.

## Recommendation (Claude)

Pending independent review of the explicit policy tradeoff and canonical-domain rollout. No recommendation is invented.

## Decision (owner)

The latest explicit8character requirement supersedes the former15character length choice for this implementation. The owner previously authorized merging/public foundation activation and now identified the existing default public URL whose registration/reset must work. That authorizes scoped repair there using existing staging infrastructure; no production data/billing/new phase or security-policy waiver is inferred.
