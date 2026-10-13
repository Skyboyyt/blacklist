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

## Workspace follow-up (2026-10-13)

Owner workspace ID was supplied. Two Free Frankfurt API/worker resources were created and immediately suspended, with correct owner/plan/branch/state verified. This resolves workspace targeting; neither application is live. Protected runtime env checks confirm operator/API keys absent and worker signer/internal/staging keys absent. Fresh API-tier keys were generated in memory and stored only in protected Render settings; internal/staging values are shared to encrypted exact-branch preview Vercel envs only. No DB/mail/signer secret is provided to frontend, and production settings are unchanged. Native-PG migrations remain unresolved; permitted default-sender transport and protected sending-only worker settings are now verified as below; TCP recheck refused before login. R-01/02/03/04/05 hosted/review gaps remain open, with no policy waiver or public production launch. See `docs/evidence/2026-10-13-render-workspace-setup.json`.

## Real Resend transport follow-up — 2026-10-13

R-05 now has real-provider transport evidence: the existing HTTPS adapter returned `accepted_for_delivery` with a validated UUID for one owner-authorized synthetic email; authenticated receipt lookup reports `delivered` with matching ID. A fresh key requested with `sending_access` was placed solely in protected worker settings; existing env variables were preserved/verified and the worker remains suspended. The first proxy-placeholder attempt failed configuration before sending; no validation weakened. No recipient/key/body/raw payload/token is in source/evidence. Default `onboarding@resend.dev` remains limited to the account mailbox because there are no verified domains. Provider delivery does not prove human receipt or DB-backed activation; full identity flow, tracking/rewriting/retention and additional-recipient domain setup remain open. No DB/operator secrets or mail/signer credentials were supplied to frontend. R-01/02/03/04 review/hosted gates are unchanged; no production readiness or Phase 8.

## Owner-added database configuration follow-up — 2026-10-13

R-02: API now contains the owner-added database URL, but it identifies the privileged provisioning role, a pooler and nonconforming TLS/query settings. Normalized host matches intended staging. The unchanged live-config guard rejects it with the generic expected code; no DB login/query or configuration change performed. Owner confirms provisioning/migrations were not run. Worker URL is absent. Services are suspended with initial attempts canceled, and both public health probes return provider HTML503 rather than application health. Latest direct native probe fails network-unreachable errno101. **Blocked:** execute existing role/migration scripts from a reachable separate operator machine, then verify SQL privileges/TLS and configure DML-only direct verify-full runtime URLs on both tiers. Editing only host/TLS would retain excessive authority. No current public runtime exposure or secret leak is established, so no credential rotation is claimed necessary by this check. Deployment/worker/Resend units11pass; earlier review/security/coverage/audit/browser gates remain unresolved. Evidence contains only booleans/statuses/known resource IDs, no credentials/private records.

## Windows operator procedure review — 2026-10-13

Prepared `docs/operations/neon-windows-setup.md` for the owner's explicit fallback request. Fixed staging host/database/roles, direct verify-full URLs, masked prompts and isolated operator/migrator/runtime processes preserve existing boundaries. The first-run read-only preflight stops on unexpected tables/roles, and review explicitly identifies PUBLIC privilege revocations, constraint replacement, backfills and cancellation of legacy pending staff role requests; no destructive reset/down SQL is introduced. Only private runtime URL copy to save-only settings on the two suspended services is instructed after verification. Real credentials stay out of source/arguments/output; clipboard history/sync must be disabled and clipboard replaced after use. No provider mutation, alternate driver, privileged runner, disabled TLS or resume/merge. Eleven local provisioning/migration/security/restore regressions pass and four Node snippets parse; Windows execution and real Neon SQL/TLS/grants/restore remain untested. Existing baseline/security/Claude review gaps remain; this procedure is not readiness proof.
