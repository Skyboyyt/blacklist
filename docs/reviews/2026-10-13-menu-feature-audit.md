# Review: live menu and dashboard failures

| Field | Value |
| --- | --- |
| Reviewer | Codex |
| Date | 2026-10-13 UTC |
| Scope | Owner-reported menu pages failing to load on blacklist-web-eta.vercel.app; main `5967afa6eee30c5359b9a9f26a1c6bd79f543772` |
| Documents read | AGENTS.md, PRD.md, ARCHITECTURE-ESSENTIALS.md, ARCHITECTURE.md §36, AI_HANDOFF.md, affected THREAT-MODEL.md and normative identity/moderation/chain-data sections |

## Summary

The deployed foundation is reachable, but most product-data menu features have no live implementation. Phase7 replaces identity/account/staff-foundation mocks; the approved architecture schedules research, reporting/moderation and risk/notifications in Phases8–10. The non-mock research adapter deliberately rejects these reads. Calling it from pages produces rendering errors; reconnecting the existing database or redeploying the same commit cannot supply the missing services. No later phase, fake data, private-data access or cloud change was introduced during this audit.

GitHub PR11 is closed/merged into main at `5967afa`; application/package/infrastructure/test/dependency files match deployed source `038ed7f` exactly. Existing stash and previous repair branch are preserved. Audit work is on `docs/menu-feature-audit`.

## Capability map

| Destination | Actual adapter/backend status | Remaining implementation |
| --- | --- | --- |
| Research `/search`, address and transaction results | Search form renders; server research methods reject `ApiNotConnectedError` | Phase8 registry/providers/research endpoints; provider decision O-3 |
| Projects and project profiles | `listProjects` and `getProject` reject | Later research/project integration, including reviewed publication dependencies |
| Risk ranking `/scoreboard` | `getScoreboard` rejects; live document HTTP500 | Research integration and Phase10 assessments; no invented scores |
| Dashboard `/dashboard` | Page calls rejecting `getDashboard` before rendering its sections | Real private dashboard aggregation across later features |
| Reports `/reports`, report creation/detail | Reports index also calls `getDashboard`; live member submission methods remain unavailable | Phase9 private reports/evidence/moderation backend |
| Appeals, responses, corrections, project suggestions | UI/instructions exist; targets and submission methods remain unavailable | Phase9 revision-bound redress/standing/publication and project integration |
| Notifications `/notifications` | `listNotices` returns `temporarily_unavailable` | Phase10 notifications |
| Profile and security settings | Real Phase7 profile/account/security endpoints and live adapters exist | Signed-in hosted interaction remains unverified in this audit |
| Staff lifecycle, assurance, recovery, audit | Some Phase7 foundation methods implemented; protected by server authorization/WebAuthn | No staff account was accessed or created |
| Staff cases, findings, approvals, labels, suppressions | Later-feature adapters remain unavailable | Phase9 moderation and Phase10 risk/admin work |
| Home, methodology, privacy, security, terms | Public documents render without observed server error markers | Static content does not prove backend product features work |

## Findings

### M-01 Product menu exposes unimplemented data features

- **Severity:** Medium
- **Category:** correctness
- **Location:** `apps/web/src/lib/api/server.ts`, `apps/web/src/lib/api/not-connected.ts`, `apps/web/src/lib/api/live/member.ts`, `apps/web/src/lib/nav/nav-items.ts`.
- **Evidence:** Non-mock research only overrides `getViewer`; search/project/dashboard/scoreboard methods remain rejecting. The live member adapter overrides only profile methods. Submission, standing and notification methods explicitly return unavailable. No corresponding implemented research/report/assessment domain services were found. ARCHITECTURE.md §36 reserves these implementations for Phases8–10.
- **Impact:** Normal navigation promises functionality which the deployed Phase7 foundation cannot provide. This is an implementation gap, not evidence that Neon has lost data or that all authentication endpoints are down.
- **Recommendation:** Complete each approved phase after explicit owner authorization and Claude architecture review. In the meantime, render an explicit feature-unavailable state for known absent adapters; preserve genuine unexpected-error handling. Never enable production mocks or substitute empty records/success.
- **Response (Claude):** Pending.

### M-02 Expected adapter unavailability becomes a generic server failure

- **Severity:** Medium
- **Category:** correctness
- **Location:** Dashboard/reports/public research route files; `apps/web/src/components/states/route-error.tsx`.
- **Evidence:** Pages await known rejecting methods without a feature-unavailable outcome. Anonymous live GETs observed `/scoreboard`500; `/projects` and populated `/search`200 with serialized server-error digests. Dashboard/reports200 include both sign-in-required UI and a child server-error digest. Streaming HTTP200 is not a successful functional check. The common error boundary says “Something went wrong” and offers retry.
- **Impact:** Expected missing functionality looks like an intermittent failure; retries cannot fix it. Anonymous child error serialization does not establish access to private records.
- **Recommendation:** Handle known not-connected outcomes at the page/data-result boundary, using explicit unavailable copy and no fabricated records. Test both non-mock unavailability and existing mock UI journeys. Do not expose raw error messages or stack traces.
- **Response (Claude):** Pending; no source repair or deployment in this audit.

### M-03 Session lookup has a potential Free Render cold-start mismatch

- **Severity:** Medium
- **Category:** performance
- **Location:** `apps/web/src/lib/api/live/server-viewer.ts`, signed-in layout and `shell-layout.tsx`; browser transport.
- **Evidence:** SSR viewer deadline is5seconds and all transport/parse errors become anonymous. Browser auth requests allow90seconds for Free Render startup. Both signed-in layout and shell request a viewer. API was already awake during this audit; sampled document requests completed under1second.
- **Impact:** A sleeping backend could make a valid session appear signed out. This is a source-level concern, not a reproduced hosted session failure, and cannot explain rejecting research adapters while the backend is awake.
- **Recommendation:** Reproduce with a synthetic session and a real idle cycle; test bounded startup waiting and safe error presentation/request deduplication. Preserve fresh authoritative validation, fail-closed authorization, no-store and cookie handling. Do not resolve by caching stale authorization, adding a keepalive or broadening trust.
- **Response (Claude):** Pending.

## Checks actually executed

-19 unauthenticated canonical document requests:18HTTP200 and1HTTP500. Five responses contained server-error digest markers; signed-in pages otherwise showed the sign-in boundary. No browser cookie, password or user records were supplied. Responses were inspected in memory, not saved.
- Existing live negative smoke:11/11PASS, including private/staff denial, anonymous viewer DTO, foreign Origin rejection, invalid input rejection, absent headless handler, frontend proxy behavior, forged gateway header overwrite and internal viewer access. These checks do not prove successful login or private account interaction.
- API and worker normal health endpoints:200 `{ "status": "ok" }`.
- Focused navigation/live-adapter unit suites:10/10PASS. Includes role-sensitive navigation, constrained login redirects, no invented success, error mapping, password feedback and bounded browser auth deadlines.
- Full web unit suite:398/398PASS across42files. The focused10 are included in398, not additional unique assertions. Much of the product UI coverage intentionally uses mocks; it does not prove a connected product backend.
- Main fetch and PR11 GitHub readback PASS; deployed-source versus main application tree comparison PASS.

## Not reviewed

No real-user session was accessed; signed-in hosted navigation, password change, session revocation, valid-token redemption, real idle-cycle behavior and live JavaScript/mobile menu clicks were not tested here. Existing external Chromium certificate-trust blocker remains; TLS verification was not disabled. Backend integration/build, coverage and dependency audits were not rerun for this documentation-only audit; previously reported coverage/full-development-audit failures remain unresolved. No database migration, cloud configuration, deployment, merge, new service, dependency or security policy changed.

## Next step

Fix honest unavailable-page presentation and separately investigate signed-in cold-start behavior. Request explicit Phase8 authorization before implementing the approved research backend; do not infer Phase9/10 authorization from a menu complaint. Phase7 hosting is not a complete product launch.
