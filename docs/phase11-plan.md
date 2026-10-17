# Phase 11 plan: Integration, Hardening & Launch Readiness

| Field | Value |
|---|---|
| Authorized | Owner, 2026-10-17 ("launch readiness") |
| Scope (ARCHITECTURE §36) | End-to-end integration with the real backend, an independent security review, staff security re-verification, performance, restore drill, break-glass and recovery drills, **legal review (blocker)**, retention approval, O-13 |
| Exit criterion | The launch checklist ([launch-checklist.md](launch-checklist.md)) signed by the owner |
| Limits | No paid services and no new cloud resources (including a production environment) without the owner's explicit instruction. Phase 9b stays unauthorized. |

## Starting state

- Staging is public and runs Phases 7–10: the Vercel web app, the Render API and worker (free tier) and Neon PostgreSQL 18 (`staging` branch).
- There is **no production environment**. Hosting for production is open decision O-4.
- Open owner decisions that affect launch:
  - O-12, public risk bands (brief: [o-12-decision-brief.md](o-12-decision-brief.md));
  - O-13, an independent audit checkpoint;
  - P-13, the operator recovery branch;
  - legal review and the retention map.
- Known operational gaps:
  - email reaches only the owner's address until a Resend domain is verified;
  - there is one administrator, so two-person actions are impossible;
  - the free-tier API sleeps when idle.

## Workstreams

| # | Workstream | Who | Output |
|---|---|---|---|
| 1 | **Performance and robustness** | Claude | The deferred scale items from the Phase 10 review (P10-06 to P10-08): batched reads for the project directory, ranking and moderation queue |
| 2 | **End-to-end journeys on staging** | Owner clicks, Claude fixes | A scripted walkthrough: register; report; moderate; publish (with a second admin); appeal; respond; project suggestion and correction; research. Every failure becomes a fix |
| 3 | **Monitoring and alerts** | Claude writes; owner sets up a free uptime monitor | [Runbook](operations/monitoring.md): health checks for the API, worker and website; an alert email; what to do when an alert fires |
| 4 | **Restore drill** | Claude writes; owner performs | [Runbook](operations/restore-drill.md): restore Neon to a point in time on a new branch, point a test API at it, check, time it, record the result |
| 5 | **Recovery and break-glass drills** | Claude writes; owner (and a second admin) perform | [Runbook](operations/staff-recovery-and-break-glass-drills.md) for "an admin lost their security keys" and "every admin is locked out", rehearsed on staging and recorded |
| 6 | **Staff security re-verification** | Owner, with Claude's checklist | Each staff account: correct roles, at least two security keys, no stale invitations |
| 7 | **Independent security review** | Codex, or a hired tester (owner decides) | A review brief prepared by Claude; findings answered by Claude. O-13 decides whether an external audit is also required |
| 8 | **Legal and retention** | **Owner, with a qualified lawyer** (paid) | Claude prepares a counsel pack: what the product publishes, the wording rules, the appeal process, Terms and Privacy drafts, and the retention map. Counsel's approval is a hard launch blocker |
| 9 | **Production environment** | Owner decision (O-4), then Claude | A production setup separate from staging (no shared credentials), with backups and point-in-time recovery. Needs the owner's instruction and probably paid plans |

## Order

1. Now, needing nothing from the owner: workstream 1, then the runbooks for 3, 4 and 5, the review brief (7) and the counsel pack (8).
2. With the owner: the end-to-end walkthrough (2), staff checks (6), then the drills (4, 5).
3. Owner decisions: O-4 (production hosting), O-13, the lawyer, O-12 for production.
4. Production setup (9), a final walkthrough on production, then the launch checklist is signed.

## Findings during Phase 11

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| P11-01 | Medium | `BREAK_GLASS_ENABLED` is read by the operator CLI from the operator's local settings, not from the hosting platform, so the platform's change history does not record break-glass (identity §10.13 assumes it does). Audit row, staff-wide email and session revocation still apply | **Open.** Procedural mitigation in [the drills runbook](operations/staff-recovery-and-break-glass-drills.md); a technical fix needs an ADR, decided with P-13 |

## Risks

- **Legal review is the critical path.** Engineering can finish well before counsel does.
- **Free-tier limits** (a sleeping API, provider request caps) are acceptable for staging but not for a public launch. That choice belongs with O-4.
- **One administrator** blocks every two-person action and the recovery drill; a second admin is needed early.
