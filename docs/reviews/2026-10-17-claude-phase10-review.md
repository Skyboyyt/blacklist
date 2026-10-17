# Phase 10 code review (Claude self-review)

| Field | Value |
|---|---|
| Reviewer | Claude (implementer; **not** the independent review the rules require) |
| Date | 2026-10-17 |
| Scope | `79f0cc8..b654bb4`: Phase 10 slices 1–5 and the research fixes (PRs #21–#25) |
| Method | Automated multi-pass code review, then manual triage; each fix has a test |

| ID | Severity | Location | Finding | Outcome |
|---|---|---|---|---|
| P10-01 | Medium | `apps/api/src/presenters/research.ts`, `packages/domain/src/projects/profiles.ts` | A suspended finding never set the assessment's dispute state to `suspended_pending_review`, so the scoreboard's `suspended_finding` rule (ADR 0012) could not fire and address pages showed no suspension dispute | **Fixed.** `publicFindings` reports `suspended`; both views use it (suspension outranks "under appeal"). Test: `moderation-findings.integration.test.ts` |
| P10-02 | Medium | `packages/domain/src/risk/engine.ts` | `nextReviewAt` counted active inputs that do not apply; their expiry leaves the inputs hash unchanged, so the stored review time stays in the past and the 15-minute sweep reselects the subject forever (and can crowd out due subjects) | **Fixed.** Only applied inputs schedule a review. Latent today (no input has an expiry). Test: `risk-engine.test.ts` |
| P10-03 | Medium | `packages/domain/src/notifications/service.ts` | Escalation set `escalated_at` before checking the appeal's case; a missing case would mark the appeal escalated with no alert, never to be retried | **Fixed.** The case is found first. Covered by the existing escalation test |
| P10-04 | Medium | `packages/domain/src/projects/submissions.ts` | Accepting a correction that retires a domain did not require the domain to be active, so it could rewrite a retired row's history or accept a no-op | **Fixed.** Only an active domain can be retired; otherwise `invalid_transition` and the whole decision rolls back. Test: `projects.integration.test.ts` |
| P10-05 | Low | `apps/worker/src/worker.ts` | The risk sweep and escalation swallowed errors silently and could overlap | **Fixed.** Failures log a fixed name; a tick never overlaps the previous one |
| P10-06 | Low (scale) | `profiles.ts` `listProjects`, `scoreboard.ts` | Public directory and ranking build every profile sequentially (unbounded for the directory) | **Deferred.** Staging has very few projects. Before production: a read model or batched queries |
| P10-07 | Low (scale) | `cases.ts` `caseQueue` | One subject lookup per queued case | **Deferred.** Batch the lookups before queues grow |
| P10-08 | Info | `research.ts` presenter | Suppressions are read twice per address request | **Deferred** with P10-06 |
| P10-09 | Info | `notifications/service.ts` | Notices from before the notifications table are not migrated | **Won't fix.** Documented in the Phase 10 plan; staging data only |
| P10-10 | Info | `risk/views.ts` | Staff ceiling hard-coded as 74 or 100 | **Won't fix now.** It matches the V1 ruleset and the staff contract allows only those values; revisit with any new ruleset |

The independent (non-implementer) security review of Phases 7–10 remains open.
