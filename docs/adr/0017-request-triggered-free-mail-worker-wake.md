# ADR 0017: Request-triggered wake-up of the existing free mail worker

| Field | Value |
|---|---|
| Status | Accepted by owner; implementation/activation authorized, Claude independent review pending |
| Proposed by | Codex, 2026-10-13 |
| Reviewed by | Claude independent recommendation pending |
| Decided by | Owner, 2026-10-13: “Approve on-demand wake (recommended)” |
| Affects | Hosting ADR0014 manual-wake limitation, API infrastructure hook only, T-03/T-10/T-42/T-48; no identity protocol, queue payload, SQL or worker endpoint change |

## Problem and evidence

The owner requires registration/reset to work on the public foundation while retaining Free Render API and separate Free worker. The worker sleeps independently after15idle minutes. An accepted registration/reset API request commits queued work but does not wake another service; pg-boss polling cannot run in a sleeping instance. The earlier actual activation-email test succeeded only after a manual worker health wake. Default-domain API404 is a separate confirmed routing defect being repaired independently. No automated keepalive or scheduler is approved by ADR0014.

## Proposed solution

After an actual202response on either POST `/api/v1/auth/register/start` or POST `/api/v1/auth/password/forgot`, the API may initiate **one bounded asynchronous GET** to the existing worker's public status-only HTTPS `/healthz`. This is a liveness notification, not mail delivery, account authorization, a job trigger or delivery acceptance. Return the usual generic202without awaiting the wake. The transaction/queue/worker reload/generation/delivery protocol remains authoritative. Rejected/malformed/foreign-Origin/throttled/other requests do not wake the worker.

Use an optional server-only `MAIL_WORKER_HEALTH_URL`, disabled by default, staging-only, validated fixed HTTPS Render hostname and exact health path, no credentials/query/fragment/redirect. Read from protected API configuration only; excluded from build children, frontend and worker settings. Verify the owned target in the deployment controller. Send no internal/staging token, cookie, body or account identifier. One in-flight request per API instance, maximum90seconds, no retries/timer/schedule/keepalive; graceful shutdown aborts it. Log only a generic outcome code, never URL/response/request/provider body. Existing durable auth request throttles precede the202response. Worker remains separate and exposes no new endpoint or actor action.

Tests must prove disabled behavior, target/TLS restrictions, eligible method/path/status, rejected-request exclusion, bounded single flight, asynchronous unchanged202, generic failures/shutdown abort, secret/runtime separation and unchanged real queued SMTP delivery and token rules. No new dependency, migration, paid resource or production data.

## Alternatives

Manual health wake before every developer/test session remains approved and free, but cannot deliver reliable unattended registration. An independent paid always-on worker requires a priced owner decision. A scheduler/keepalive or API-worker combination is rejected; changes approved operating limits/service boundaries and consumes quotas continuously. Sending directly in the API or returning fake delivery success violates the identity protocol.

## Consequences

Adds an explicit API-to-worker **liveness-only** dependency and can consume Free quotas on accepted user requests; it does not guarantee availability, replace provider monitoring or make Free hosting production ready. Queued mail remains durable if the wake fails. Token issuance starts in the actual worker, so sleeping time does not consume a pre-issued token lifetime. Existing late-job limit15minutes, replay/generation/security-version checks and30minute registration token TTL remain. No auto retry, user data, new cloud service, billing change or Phase8.

## Recommendation (Claude)

**Accept with amendments** (Claude, 2026-10-15; [review](../reviews/2026-10-15-claude-phase7-8-review.md) CR-04). The wake fires only after a real 202 from the two exact routes, one request in flight, no credentials or body, `redirect: 'error'`, staging only, and it is never treated as delivery. Amendments:
1. Pin the exact worker hostname (the config accepts any `*.onrender.com`).
2. State that the worker `/healthz` is publicly reachable and runs a database probe, so this ADR does not bound wake-ups or quota use; answer liveness without the database and raise the free-tier polling interval.
3. Note that while throttle keys are shared (CR-01), "existing durable throttles" are global, not per client.

## Decision (owner)

Owner explicitly accepted the on-demand wake plan on2026-10-13. Scoped implementation/activation is authorized; Claude recommendation remains pending and no independent approval is invented. No scheduler, keepalive, paid service or identity-policy bypass.
