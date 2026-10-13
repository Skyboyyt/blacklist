# Public registration/reset repair security review

Codex, owner-authorized infrastructure/identity-policy follow-up. Claude independent review pending. Scope ADR0016/0017, T-02/T-03/T-04/T-05/T-07/T-10/T-18/T-24/T-42/T-45/T-48/T-50.

## RREG-01 — Info: default public domain lacks API integration

Confirmed owner-used `blacklist-web-eta.vercel.app` serves register200but API viewerHTML404. API/internal/staging vars only scope the old branch preview; default production branch still initial-repository. Repair deploys exact tested source with protected production-target gateway/internal settings and staging DB; API/worker exact canonical origin/RP, safe legacy document redirect. No CORS broadening, secret/signer/DB/mail key in browser, fake auth or provider/DB production change. Actual cloud readback remains separate from this local review.

## RREG-02 — Medium: explicit password-minimum tradeoff

Owner specifically requests8Unicode code points, overriding old15choice. Contracts/backend/Better Auth/fixtures/docs synchronized; maximum/bytes/NFKC/controls/Argon2/verification/staff WebAuthn unchanged. Minimum search space decreases. HIBP and an expanded short common-password fallback remain mandatory; positive/outage rejection tests pass. UI reports policy/breach rejection without success or account-state leakage. Old hashes/longer passwords remain accepted; no credential migration. This is an owner-directed policy change, not an independent architecture recommendation or gate waiver.

## RREG-03 — Low: bounded request-triggered worker liveness/quota dependency

Owner accepted ADR0017. A rejected/foreign-Origin/invalid/throttled route cannot wake a worker because hook requires actual202on two exact POST routes after queue commit. One fixed validated HTTPS Render health URL, no credentials/query/redirect, no cookie/token/body/header, one in-flight/90second abort and shutdown cancellation. No retries/timer/keepalive/direct mail or actor authority; failure never claims delivery/account activation. Runtime allowlist withholds field from worker/build/web. Unit negatives and real-PG staged-gateway/SMTP test pass. Free quotas/availability still constrain delivery; real cold-idle cycle not yet validated.

## RREG-04 — Info: canonical links and expiry remain security boundaries

Redirect target comes only from validated configured HTTPS origin; caller path/query assigned as URL fields cannot choose a host. API/mutations excluded; no-store/no-referrer, no fragment in Location. Browser fragment inheritance preserves existing valid links, never revives expired/replayed/superseded tokens. Owner must use a fresh30minute link and choose own password; no token/password retrieval. Auth client waits at most90seconds for observed Free startup, other calls20; no false success. Old host-only cookies/passkeys do not migrate across domains; real staff onboarding remains held on recovery/independent decisions.

## Validation / remaining findings

Root522units/format/lint/types/Next build,52realPG integration,72desktop/mobile auth/account/recovery browser tests, backend/mock builds and4client/mock exclusions PASS. New8character registration/reset test preserves7rejection, expiry/replay, old-cookie revocation and old/new password login; original assertion floors unchanged. Source scan0after one known fictional token fixture was replaced with CSPRNG values; no suppressed scanner rule or real credential discovered. Production audit0. Fresh coverage51assertions pass but commandfails61.19%/75% and six package floors; ingress91.48/wake81.25branches. Full audit1high development braces remains. No policy waiver/production readiness. Live Chromium external navigation fails CA trust; no verification bypass, local browser tests separate. Actual hosted canonical routing/mail/link redemption/login, logs, idle cycle, restore/retention/legal/monitoring and Claude review remain pending at this checkpoint. No migration/dependency/DB authority/public assessment/provenance/risk/moderation/appeal/reversal change.
