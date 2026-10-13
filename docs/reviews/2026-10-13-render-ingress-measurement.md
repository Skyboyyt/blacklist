# Render ingress measurement review

Codex, owner-authorized SSR repair following public foundation deployment. Scope: T-04/T-07/T-12/T-45/T-48; no identity protocol, actor permission, migration or dependency-policy change.

## Problem and implementation

The hosted internal viewer returns404 because the configured trusted-peer list is empty. Keep the existing trusted-peer/internal-token guard. To configure actual ingress without guessing broad subnets, add expiring operator-only response metadata to existing GET/HEAD health/viewer routes. Normal response bodies and authorization matrices are unchanged; no new endpoint or automatic trust learning.

`STAGING_INGRESS_DIAGNOSTIC_KEY` is an independent temporary secret; `STAGING_INGRESS_DIAGNOSTIC_UNTIL` is a fixed UTC deadline at most30minutes ahead. Both must be configured together, only in staging. Key reuse with signer/internal/staging secrets fails startup. Worker receives neither field. The build subprocess allowlist still excludes all application secrets.

The `x-bl-ingress-receipt` header is emitted only when the independent diagnostic, internal and staging credentials all match, the deadline is unexpired, method/path is allowlisted and the socket address is private/loopback. It contains only that private socket address, three forwarding-probe booleans, up to8private peers observed on token-authenticated internal viewer requests and nonpersistent accepted/denied counters. Counters establish connection handling, never proof of a user login; observations never grant trust. Public client IPs, raw forwarding headers, cookies, secrets and records are excluded. Existing `no-store` headers prevent caching; structured logs never serialize request/response headers. Probes use no session cookie and perform no account mutation.

The private-address classifier is a **disclosure filter**, not a proxy allowlist. It does not add RFC1918/ULA ranges to authorization. The controller may configure only exact measured peer addresses (`/32` or `/128`) after checking the owned service/source/HTTPS target and spoofed forwarding probes. Reject a preserved single spoofed forwarding IP; malformed/multi-hop lists must not become canonical client IPs. Confirm internal viewer200 and missing/wrong credential denials afterward. Unknown future peers fail closed; provider stability is a remaining operational limitation, not an excuse for broad trust.

## Validation and rollout limits

Six diagnostic unit tests and seven real-PG deployment integration tests pass locally. They cover default/expired/partial/independence/maximum-TTL configuration, three credentials and duplicates, private versus public sockets, fixed paths/methods, metadata allowlist and worker withholding. Full-stack proof shows diagnostic credentials cannot bypass the internal trusted-peer guard or authenticate a user; explicitly configuring a measured exact fixture peer enables the internal viewer while private resources still require a session. Original peer/Origin/session/role negatives are retained unchanged.

Initial fixture passed an undefined header to the HTTP injection library and initial strict typing missed an optional route URL; both were repaired and the13test rerun passed. Broader checks and actual provider measurements are recorded in AI_HANDOFF/evidence after execution. No cloud measurement or successful signed-in flow is inferred from local fixtures.

After measurement, remove both protected diagnostic settings and redeploy; verify public and owner requests contain no receipt. The fixed deadline disables receipts across restarts even before cleanup. Never commit actual credentials or live private peer addresses. Resend still requires an owned verified sender domain for other recipients; that is independent of the SSR repair.

## Actual cloud result

Source `ca2590c` deployed on the existing Free Frankfurt API. One exact private peer measured, configured only as `/32` in protected settings. Real Vercel SSR changed from0accepted/2denied to2accepted/0denied; anonymous internal viewer200. Six direct/Vercel forwarding probes per phase rejected spoof authority. Both temporary diagnostic fields removed and cleanup deployment live; receipts absent. No peer/key/identity values copied into evidence, no worker/frontend/SQL changes. Hosted signed-in authentication remains untested and sender domain missing; baseline audit/coverage, independent review and recovery gaps remain. See sanitized repair evidence for deployment IDs and final negatives.
