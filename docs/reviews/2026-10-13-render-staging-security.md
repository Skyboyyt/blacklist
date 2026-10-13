# Review: Render restricted staging preparation

| Field | Value |
|---|---|
| Reviewer | Codex, implementation self-review; independent Claude review pending |
| Date | 2026-10-13 |
| Scope | `chore/render-staging-deployment`, based on published Phase 7 `ece2e76`; Render/Neon/Vercel/Resend preparation, no provisioned services |
| Documents read | AGENTS, CLAUDE, PRD, ARCHITECTURE/ESSENTIALS, THREAT-MODEL, AI_HANDOFF, accepted ADR 0007/0008, normative identity and API integration contracts, existing Phase 7 gate/security/migration evidence |

## Summary

The owner chose restricted Frankfurt staging on free Render, Neon PostgreSQL and Resend HTTPS, retaining Vercel Authentication. The owner explicitly accepted authenticated public Neon TLS for staging; paid services and production remain unauthorized. Preparation preserves the same-origin identity protocol and DML-only runtime, adds a supplemental Render staging ingress gate, operator-only cloud role provisioning and a Resend adapter behind the existing mail interface. No service, database, paid account or production frontend setting has been created or changed. Official provider plan/security documentation was retrieved, including Neon official GitHub sources and Render Blueprint JSON schema. Actual account and cloud validation remains blocked on credentials and review; local passes are labelled accordingly.

## Findings

### R-01 Vercel protection alone does not restrict direct Render API access

- **Severity:** High
- **Category:** security / authorization
- **Location:** Render external ingress, `apps/api/src/plugins/staging-access.ts`, Next proxy and SSR adapter.
- **Evidence:** separate frontend and API origins leave the API directly reachable outside Vercel Authentication. The new staging-only gate requires an independent server-to-server token, with only safe status probes exempted. Controlled negatives deny missing/wrong/duplicate credentials; application integration keeps session, internal token and exact-Origin checks mandatory afterwards.
- **Impact:** without a separate ingress restriction, unauthenticated registration/reset traffic could reach a restricted staging API and consume resources, despite frontend access protection.
- **Recommendation:** verify Vercel Authentication and the API gate in the actual staging account; keep the token server-only and test response/bundle exclusion. Never treat it as a user session or replace resource authorization.
- **Implementation response:** supplemental restriction implemented and tested locally; provider enforcement remains untested.
- **Response (Claude):** pending.

### R-02 Neon privileges, sessions and recovery need real-provider proof

- **Severity:** High
- **Category:** security / correctness / recovery
- **Location:** cloud provisioning, database URL validation, unchanged PG18 migrations.
- **Evidence:** official Neon role documentation says console/API-created roles inherit privileged `neon_superuser`; SQL-created roles do not. Prepared scripts use separate SQL runtime/migrator roles and reject unsafe existing flags/memberships. Direct, non-pooler endpoints with exactly `sslmode=verify-full` preserve session timeout options and the migrator advisory lock. Local non-superuser provisioning, repeat migrations, 27 tables, DDL/TEMP/audit/verification-table denials and restart persistence pass. No real Neon account, PG18 endpoint, TLS, role privileges, cold start, connection limit or restore has been tested.
- **Impact:** privileged runtime credentials could bypass boundaries; transaction pooling could invalidate session guarantees; free quotas/history cannot substitute for a validated production recovery policy.
- **Recommendation:** verify the actual Free organization and fresh Frankfurt PG18 project before provisioning, then direct TLS, roles, migrations, queue behavior and restore-to-new-target. Never use default owner credentials at runtime, disable verification, edit applied SQL or clone real production data. Former private Render TLS conflict is superseded by the owner's explicit Neon staging choice.
- **Response (Claude):** pending real-provider and independent review.

### R-03 Vercel SSR and trusted ingress routing require provider proof

- **Severity:** High
- **Category:** security / architecture
- **Location:** `API_INTERNAL_URL`, `TRUSTED_PROXY_CIDRS`, internal viewer GET.
- **Evidence:** Vercel cannot use Render's private DNS; the frontend must reach the external HTTPS API while PostgreSQL uses the owner-approved authenticated Neon TLS endpoint. The existing internal route additionally requires a trusted socket peer and internal token. Real ingress peer ranges/header sanitization and the actual Vercel staging URL are unknown without account access.
- **Impact:** widening trust or cookies/CORS to hide a routing failure would violate the normative identity design; an unverified proxy chain can also corrupt throttle buckets.
- **Recommendation:** confirm provider routing and CIDRs, retain GET-only internal calls and same-origin browser rewrites, and test both forged headers and authorized SSR. If the topology cannot satisfy the design, record a specific Claude/owner decision rather than bypassing checks.
- **Response (Claude):** pending provider evidence.

### R-04 Baseline validation and recovery decisions remain open

- **Severity:** High
- **Category:** test coverage / security
- **Location:** prepublication coverage/audit/browser evidence and Proposed ADR 0013.
- **Evidence:** Phase 7 was published after the owner expressly requested it with disclosed failures. Publication did not close coverage floors, the development-only braces advisory, full browser timeouts or independent recovery/architecture review. This task retains those policies and repeats relevant checks honestly.
- **Impact:** preparation and passing isolated gates do not prove a production-ready application or all possible staff recovery states.
- **Recommendation:** satisfy coverage, remediate or explicitly disposition the upstream risk without policy suppression, establish a clean full-browser run and obtain Claude review before production. Preserve fail-closed recovery/human-verification paths.
- **Response (Claude):** pending.

### R-05 A provider callback or unvalidated HTTP response must not activate security tokens

- **Severity:** High
- **Category:** security / protocol correctness
- **Location:** `apps/worker/src/mail/resend.ts` and existing delivery transactions.
- **Evidence:** the existing mail interface reports `accepted_for_delivery`, not mailbox delivery. Official Resend SDK source confirms fixed `POST /emails` and an accepted email ID response; the adapter issues the actual request, rejects redirects/non-200/201, bounds bytes/time, validates a UUID receipt and returns only allowlisted status. Controlled malformed/oversized/error/outage responses never report acceptance. The application issuance/finalization state machine is unchanged.
- **Impact:** fake or pre-send success would make a token redeemable without provider acceptance; raw errors could leak token-bearing mail or keys.
- **Recommendation:** retain negative tests and real-provider staging proof with a verified sender and owner-controlled mailbox; verify tracking/retention. Unit responses are not real-provider evidence. Use a sending-only key.
- **Implementation response:** compatible HTTP adapter implemented without new dependencies; real account/sender/delivery remains blocked.
- **Response (Claude):** pending.

## Checks and limits

Actual command outcomes and sanitized runner evidence are recorded in `docs/evidence/2026-10-13-render-staging.json` and AI_HANDOFF.md after validation. Test failures were repaired without disabling assertions, security checks or dependency policies. The initial integration probe used an incorrect account-security URL; it was corrected to the existing `/api/v1/me/security`, preserving the intended 401 assertion. Strict type failures in new fixture settings/environment signatures were fixed, not bypassed.

Threats: T-04/T-05/T-07/T-09/T-12/T-18/T-24/T-42/T-44/T-45/T-48/T-49/T-50/T-57. No real user data, provider mailbox content, secret value or token-bearing link belongs in this review. Vercel Authentication, actual Render ingress and service restart, Neon TLS/roles/history/restore, real Resend sender/delivery/tracking/retention, account quotas/costs, physical authenticator independence, legal/retention approval and independent Claude review have not been verified by this implementer. Public pricing is documented, not an account quote. The separate optional worker health listener preserves service/credential boundaries; free idle sleep and manual test-window wake-up do not guarantee continuous background jobs. Shared compute/egress quotas can stop staging; no automated keepalive is implemented. No production readiness or Phase 8 authorization is claimed.

## Provider follow-up (2026-10-13)

Corrected four credential bindings now pass supported API access checks. Free Neon staging PG18/Frankfurt project was created after verifying plan, and signed-out Vercel preview/branch-alias access redirects to Vercel Authentication. This resolves missing credentials, exact frontend origin and signed-out preview-restriction evidence. The original US project and Vercel production settings are untouched. No sensitive value belongs in this review.

R-01 is locally implemented with a verified frontend restriction; no Render API exists yet, so actual gateway/cookie/ingress proof remains open. R-02 has actual PG18/region/Free metadata but no authenticated SQL/roles/migrations/restore: direct PostgreSQL probes fail DNS/connection refusal from this workspace. R-03 remains untested for logged-in SSR/trusted peer handling. R-04 coverage/audit/browser/recovery-review gaps remain; R-05 real Resend acceptance is blocked by zero configured domains and unknown permitted test mailbox. Render owner discovery is blocked by Cloudflare despite working service API/negative auth control; owner workspace ID is required. No paid/public production deployment, alternate database driver, TLS waiver, fake delivery or Phase 8. Full sanitized proof is in `docs/evidence/2026-10-13-staging-provider-progress.json`.
