# Review: Restricted staging finalization

| Field | Value |
| --- | --- |
| Reviewer | Codex; owner reported their review in chat; independent Claude review remains pending |
| Date | 2026-10-13 |
| Scope | PR #8, existing Neon integration, held Render services, Vercel protection and validation blockers |
| Documents read | AGENTS, CLAUDE, PRD, ARCHITECTURE/ESSENTIALS, THREAT-MODEL, AI_HANDOFF, identity design, ADRs 0007/0013/0014/0015, deployment and prior security reviews |

## Summary

The owner requested completion after reporting their review. That instruction authorizes continuation of the restricted staging task; it does not turn failed tests into passes or authorize architectural/security-policy exceptions. No additional approval for the already accepted database operator is needed. Its completed SQL results remain valid: seven unchanged migration hashes, 27 tables, 16 queues, native verified endpoint TLS and actual app-role permission denials. Latest checks and publication state are recorded in the companion [evidence](../evidence/2026-10-13-staging-finalization.json).

The existing API and worker settings have the verified app connection, retain Free Frankfurt plans, and contain no operator credentials. Both remain suspended. Signed-out Vercel access redirects to Authentication. No hosted application success, recovery, production readiness or Phase 8 authorization is inferred from database completion or the owner's review.

## Findings

### F-01 Required coverage remains a failing gate

- **Severity:** High
- **Category:** test coverage
- **Location:** `tests/backend-acceptance/vitest.config.ts` and application foundation tests.
- **Evidence:** rerunning the maintained coverage command passes its assertions but fails the unchanged global/security-module floors. The evidence distinguishes the rerun after the new ingress regression from the earlier 59.16% report.
- **Impact:** broad workflow/gate passes do not establish coverage of the required adversarial branches. Merge/availability cannot be represented as passing all checks.
- **Recommendation:** complete meaningful transition and denial coverage for identity, access, audit and staff, and the remaining DB/API/worker paths. Keep floors, exclusions and assertions unchanged. This infrastructure follow-up adds an ingress adversary test, not a coverage waiver.
- **Response (Claude):** pending.

### F-02 An upstream development dependency has no published security fix

- **Severity:** High
- **Category:** security / dependencies
- **Location:** `@next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`.
- **Evidence:** fresh full pnpm audit reports GHSA-vfj7-8cjw-p6xm; GitHub's advisory API reports `first_patched_version=null`, and the package registry still reports latest 3.0.3. The production-only audit reports zero vulnerabilities.
- **Impact:** the development/build toolchain remains affected by stack exhaustion from deeply nested brace patterns. The clean production audit is not a clean full dependency audit.
- **Recommendation:** adopt a compatible, reviewed upstream fix when available, or have the primary engineer propose a supported removal/replacement that preserves lint functionality. Do not suppress the advisory, remove lint checks, fabricate a patched version or relax the dependency policies.
- **Response (Claude):** pending upstream resolution or reviewed remediation.

### F-03 Actual Render trusted ingress is not established

- **Severity:** High
- **Category:** security / architecture
- **Location:** API protected `TRUSTED_PROXY_CIDRS`, `apps/api/src/plugins/security.ts`, internal viewer and Vercel SSR.
- **Evidence:** the actual API setting is empty. Internal viewer requires both the configured trusted socket peer and the independent internal token. The new maintained integration test rejects an untrusted peer even with valid internal/staging tokens and a forged loopback forwarding header; it confines SSR client-IP authority to the internal route and rejects multi-hop/malformed forwarding candidates. Reviewed Render web-services, private-network and environment-variable documentation does not establish the peer CIDRs/header guarantees needed by this implementation.
- **Impact:** leaving trust empty fails SSR closed; guessing a broad range or removing the socket-peer check would change a security boundary. Unit/local integration evidence does not identify Render's real ingress peer or prove header sanitization.
- **Recommendation:** obtain authoritative Render ingress CIDRs and forwarding guarantees, then configure and verify authorized SSR and forged-header negatives in staging. If this topology cannot satisfy the approved protocol, Claude must propose the precise ingress change through an ADR for owner decision; do not silently broaden trust.
- **Response (Claude):** pending provider evidence or a proposed architectural resolution.

### F-04 Email and recovery validation remain limited

- **Severity:** Medium
- **Category:** operations / security
- **Location:** Resend default sender, held application, Neon Free recovery and ADR0013.
- **Evidence:** fresh provider inspection still finds zero verified Resend domains. Earlier authorized transport acceptance/provider-reported delivery is preserved; no additional mail was sent. The default sender is restricted to the account mailbox. Hosted activation/reset/restart and provider restore are untested; six-hour history is not a production recovery policy. Sole-admin recovery and objection resolution remain fail-closed pending ADR0013.
- **Impact:** broader tester mail and hosted recovery cannot be claimed working. Business capabilities outside Phase 7 remain unavailable rather than fabricated.
- **Recommendation:** use only the already authorized mailbox for initial synthetic identity testing after the preceding blockers are resolved; verify tracking/retention and add an owned verified sender domain before other recipients. Rehearse provider restoration into a separate disposable staging target without resetting the current database. Resolve staff recovery architecture before real staff onboarding.
- **Response (Claude):** pending.

## Secret scanning and limits

Pinned, network-disabled Gitleaks scanned all Git refs, including preserved history/stash, with 100% redaction. Its four matches were manually classified as existing fictional configuration placeholders and security-boundary prose; the scanner exit remains a findings exit, not a zero-finding claim. No rule was disabled and no real credential was identified. The changed-file scan is recorded separately. Production/frontend credentials, private mail content and real user data were not exported or tested.

The initial browser attempt used the repository default browser path, which has no installed matching Playwright browser. It was interrupted and is not a passing run. The subsequent full run uses the existing ignored cloud configuration and installed system Chromium with the same tests/assertions/timeouts and two workers; actual counts and limitations are in the evidence. Mock-browser results do not prove hosted backend flows. No merge, service resume, production change, billing change or Phase 8 work occurred during this finalization.
