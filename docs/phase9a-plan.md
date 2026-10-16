# Phase 9a plan: Reports and Moderation Backend (without image evidence)

| Field | Value |
|---|---|
| Authorized | Owner, 2026-10-16 (slice 9a). Phase 9 work may merge before the Phase 7 independent security review (owner waiver) |
| Not in scope | Phase 9b: image upload, isolated evidence processor, object storage (needs an accepted hosting ADR). Phase 10: risk engine, notifications table, project profiles and labels backend |
| Normative designs | [moderation.md](design/moderation.md), [identity.md](design/identity.md) (step-up, sessions), [data-model.md](data-model.md) §4–§6, [testing-strategy.md](testing-strategy.md) §5–§7 |
| Prepared by | Claude, 2026-10-16 |

## Starting state (survey, 2026-10-16)

- None of the report, case, finding, standing, response, appeal or correction tables exist. There is no `subjects` table either.
- The web app runs every `MemberApi` and `ModerationApi` method on its mock store, except profile and recovery. The contracts in `packages/contracts/src/moderation.ts` and `submissions.ts` describe the target shapes.
- The server permission catalog holds only Phase 7 permissions. `appeal_reviewer` has none.
- `viem` (EVM message signatures) and `@solana/kit` are already dependencies of `@blacklist/chains`. Node 24 WebCrypto verifies Ed25519. **No new dependency is planned.** There is no DNS resolver module yet.

## Progress

- Slice 1: data model and permission catalog, done (PR #17).
- Slice 2: reports and cases on the server, done (same PR).
- Slice 3: findings, approve-and-publish, rejection, revisions, emergency suspension and its review, public findings on address research; done (same PR). Risk signals from findings are Phase 10. Public findings appear only where research is enabled (`RESEARCH_ENABLED`).
- Slice 4: standing (server-built challenges, EVM and Solana signature verification, documentary standing decided by a non-participant standing reviewer), appeals (uphold, amend through a new revision that still needs approval, reverse) and right-of-reply responses, the "under appeal" public state and published responses on address research; done (same PR). Deferred, with reasons:
  - **Authority signatures** return `temporarily_unavailable`: they need a finalized chain read of the contract's authority, and chain research is off by default (O-3). Documentary standing covers the gap.
  - **DNS TXT standing** applies to project domains only, so it arrives with project profiles (Phase 10). No resolver module exists yet.
  - **Correction requests** against findings: the contract (`correctionRequestSchema`) models project-profile corrections only; finding corrections need a contract change, so they move to Phase 10 with projects. A member who disputes a finding uses an appeal.
  - **14-day appeal escalation** to the owner: needs the notifications table (Phase 10). `escalated_at` exists; nothing sets it yet.
  - **Member notices** still derive from report history only; appeal and response outcomes show on the submission page.

## Slices

Each slice is its own pull request with tests. It updates the data model and `AI_HANDOFF.md` as it goes.

| # | Slice | Contents | Required suites |
|---|---|---|---|
| 1 | **Data model** | One migration: `subjects`, `addresses`, `domains`, `reports`, `report_status_history`, `report_subjects`, `evidence_items` (non-image kinds; the image states stay unused until 9b), `evidence_links`, `evidence_custody_events`, `moderation_cases`, `case_assignments` and notes, `findings`, `finding_revisions`, `finding_approval_events`, `finding_publication_events`, `finding_status_history`, `moderation_decisions`, `decision_evidence`, `staff_conflicts`. Database guards make the append-only tables reject UPDATE and DELETE for the runtime role. The server permission catalog gains the Phase 9 permissions (ARCHITECTURE §9.2), including `appeal_reviewer` | Migration rehearsal; append-only rejection; permission matrix |
| 2 | **Reports and cases** | Members: draft, submit, withdraw, status, answer a request for information. Evidence kinds: transaction hash, address, URL text (never fetched, defanged), statement. Staff: queue, case detail, assignment and take-over with optimistic versions, notes, report decisions (accept, reject, abusive, request information) with step-up | Authorization matrix (owner, non-owner 404, staff roles); mass-assignment; "unreviewed reports change nothing public"; delayed-job re-check |
| 3 | **Findings** | Immutable revisions with canonical content hashes; approve-and-publish in one locked transaction with the §4.1 independence rules; reject; legal hold; emergency suspension with the 72-hour review; reversal; supersession; public read of published findings in research responses | Approvals §7.1 (latest-only, hash binding, concurrency, system publication attribution, self-approval limits, severe independence, replacement rules); suspension alerts |
| 4 | **Standing and redress** | Server-built SIWE/SIWS-format challenges (purpose, case, nonce, 10-minute expiry, single use, bound to session, chain and address); EVM and Solana signature verification; authority signature against a finalized chain read; DNS TXT through a configured resolver (no HTTP fetch of user URLs); documentary standing decided by a non-participant. Then responses, appeals (escalation after 14 days) and correction requests | Standing §7.2 (replay across nonce, purpose, case, session, chain, domain; client message ignored; wrong address; authority changed); appeal reviewer independence; lost-key journey |
| 5 | **Web integration** | Replace mock-only `MemberApi` and `ModerationApi` methods with live adapters, contract for contract; the mock stays for the mock build | Live adapter tests; Chromium E2E on the mock build unchanged |

## Interim decisions this phase needs (owner may override)

1. **Response and correction statuses.** The design leaves these unspecified. 9a adopts the contract's interim sets as normative: responses `submitted | in_review | published | rejected | withdrawn`; corrections `submitted | in_review | accepted | rejected`.
2. **Standing proof contract.** `standingProofSchema` carries `simulated: true` and no signature. Slice 4 replaces it with real proofs (challenge ID plus signature, or a DNS check), contract for contract, and updates the mock to match. The public standing name mismatch (`wallet_signature` in `research.ts` vs `signature` in `moderation.ts`) is fixed at the same time.
3. **Projects.** Project suggestions and project-profile corrections need the `projects` tables, which belong with Phase 10 admin work. In 9a they keep their mock implementations. Corrections against findings and subjects are in scope.
4. **Member notices.** The `notifications` table is Phase 10. In 9a, `listNotices` is derived read-only from the member's own case status history, carrying no staff identity.
5. **Error codes.** The domain error union gains `invalid_transition`, `not_eligible`, `stepup_required` and `evidence_unavailable`, mapped to HTTP 409, 403, 403 and 409 respectively, matching `moderationErrorSchema`.

6. **Standing reviewers and assignment.** Appeal reviewers cannot reassign cases (ARCHITECTURE §9.2), so a standing reviewer (`standing:decide`) decides standing without taking the case from its assigned reviewer. Every other decision still needs the assignee.
7. **Who counts as a participant.** Authors, approvers, and suspension and reversal actors of a finding are participants (moderation §1). Upholding an appeal is review, not authorship, so the reviewer can decide a later appeal on the same finding. An amending reviewer authors a revision and becomes a participant.

## Risks

- **Real allegations in staging.** Registration is public, so real people can file reports once slice 2 ships. Reports stay private and have no public effect. The owner's risk acceptance (ADR 0019) covers staging data; legal and retention review remain Phase 11 launch blockers.
- **Staffing for severe findings.** Publishing a severe finding needs an author and an independent approver; deciding an appeal against it needs a third person. With a very small team, severe findings stay unpublished (never relaxed).
- **Neon migrations.** Each schema slice needs an owner-applied runbook before deploying, as for 0005 and 0006.
