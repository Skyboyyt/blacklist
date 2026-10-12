# ADR 0002: Immutable approvals and effective redress

| Field | Value |
|---|---|
| Status | **Accepted with amendments**, **clarified by ADR 0008** (pending owner ratification). Backend implementation: Phase 9; staff UI on mocks: Phase 5 |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Pending Claude recommendation |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §§9, 10.5, 14, 17; moderation/wallet schema; T-11–12, T-29, T-38–39, T-46–47, T-56 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md), R-05, R-09 |

## Problem

Second approval has mutable-looking fields in an append-only decision. Appeal standing excludes non-signing subjects and lost-key victims; fresh control can be confused with exclusive account links or historical responsibility.

## Evidence

data-model moderation_decisions stores second_approved_by/at; severe publication occurs after proposal. NULL inequality does not ensure two valid actors or unchanged approved content. §17 requires subject signature or project representative, while EIP-1271/6492 is deferred and reports cover contracts/mints/domains. Appeal policy excludes decider but does not explicitly exclude severe co-approver.

## Impact

History guarantees may be weakened, approvals reused after content edits, and affected parties denied fair independent redress.

## Proposed solution

Model immutable proposals and separate approval events bound to exact revision/evidence hashes, or equivalent immutable finalization records. Atomically publish only with eligible, distinct, unconflicted actors and current evidence readiness. Content changes require fresh review. Enforce conflict checks at decision and approval. Appeals exclude all original decision participants, reporter/appellant conflicts and relevant linked claims. Keep universal factual correction requests and a reviewed staff-assisted standing path for non-signing subjects, domains and lost-control victims; fresh case standing is independent of permanent exclusive wallet linkage. Label signatures as time-specific control rather than personal identity or past authorship.

Data/API implications: normalized approval/revision references and standing review records, history preserved; no update to an existing append-only decision. Define emergency suspension and review deadlines. Severe publication requires two people; severe appeal requires an uninvolved reviewer or explicitly approved alternative. Tests cover concurrent approval/publication, changed revisions, null approval, revoked staff, co-approver appeals, old links and non-signing subjects. Resolve before Phase 3 implementation.

## Alternatives considered

Insert only a fully finalized decision after both approvals is viable if immutable proposal/evidence linkage and concurrency are explicit. Updating insert-only decisions is rejected. Signature-only appeals are simpler but unfair. Independent third-person review can use approved external staff if the team is small; reducing separation because staff are unavailable is rejected.

## Consequences

Additional lifecycle contracts and negative tests are required; this proposal reduces ambiguity rather than authorizing production work. If accepted, Claude updates ARCHITECTURE, ESSENTIALS, PRD, data model, threat model, testing/dependency policies and handoff wherever affected before the relevant implementation. No existing migration is changed; none exists. Preserve the owner's phase authorization requirement.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.** R-05 is correct: `second_approved_by/at` on an insert-only row is self-contradictory, and the `<>` CHECK passes when the approver is NULL. R-09 is correct: signature-only standing excludes contracts, mints, PDAs and domains, and also victims who lost keys, and nothing excluded the severe co-approver from appeals. The amendments choose the concrete model (approve-and-publish bound to a revision hash), add an external appeal-reviewer path, and make persistent wallet links non-exclusive and deferred.

## Amended decision

Normative design: [docs/design/moderation.md](../design/moderation.md).

1. **Immutable revisions:** `finding_revisions` with a `content_hash` over every asserted field, including evidence object and derivative hashes. Any change → new revision.
2. **Approval events** (`approve` / `reject` / `withdraw`) bind to `revision_id` plus `content_hash`, each authorized by an action-bound WebAuthn step-up. Older approvals stay visible but authorize nothing.
3. **Approve-and-publish:** for severe findings the approval transaction itself publishes after atomic checks (§4 of the design): latest revision, hash recomputation, evidence readiness, distinct and eligible approver, no conflicts, active staff. No window exists in which an approval drifts onto changed content.
4. **Severe rules (owner decision):** the submitter can never approve; no author of any revision may approve; conflicts are checked at every step; **replacing a published severe revision** (including a downgrade) also needs independent approval (added in the round-2 adversarial review). **If no independent approver exists, the severe finding is not published.** The emergency path is a separate, lesser *high* finding plus emergency suspension, never a relaxed severe.
5. **Standing:** five mechanisms (fresh signature, authority signature with a finalized chain read, DNS TXT for domains, staff-assisted documentary standing, correction requests for anyone). Standing is per case and time-scoped. Control ≠ identity, innocence or authorship.
6. **Persistent wallet links are deferred from V1.** When introduced they are evidence, not entitlement, and not exclusive.
7. **Independence:** appeal reviewers for severe findings must be non-participants (neither author nor approver). The new staff role `appeal_reviewer` allows an approved external reviewer. Pending appeals escalate to the owner after 14 days; independence is never relaxed.
8. **Reversal of severe findings:** two people, the approver being a non-participant, or an appeal decision. **Emergency suspension:** one staff member with step-up, reviewed by a non-participant within 72 h.

Phase gate: Phase 3. Affected documents updated 2026-10-04: ARCHITECTURE §9, §14, §17; data model §6; THREAT-MODEL T-29, T-38–T-39, T-47 and invariants; testing strategy §5.

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (review-response instructions §10, §16, §20): retain independent review for severe findings, never weaken it for staffing, bind approvals to exact revisions, and provide multiple evidence-backed standing mechanisms. Still required from the owner: ratification of the amended text, and a staffing plan that provides two independent publishers and a third reviewer for severe appeals (PRD §10). Not an implementation authorization.


## Addendum — 2026-10-04 (ADR 0008, re-review V2-04)

History above is preserved. Wording correction only; the safety model is unchanged:

- There are exactly two human roles in publication: the **author** and the **approver**. **Publication is a system transition** caused by the approval of the exact revision and content hash, in the same transaction (recorded in `finding_publication_events` with actor `system`). There is no human "publisher".
- Non-severe revisions may be self-approved by their author.
- Severe revisions, and any revision replacing a public severe revision (including a downgrade), require an **independent approver**: never an author of any revision, not conflicted, and, for replacements, not a participant of the current public revision.
- Audit event names: `finding_created`, `finding_revision_submitted`, `finding_approved`, `finding_rejected`, `finding_approval_withdrawn`, `finding_became_public` (system), `finding_superseded` (system), `finding_suspended`, `finding_suspension_reviewed`, `finding_reversal_proposed`, `finding_reversed` ([moderation §4.4](../design/moderation.md#44-event-model-audit-names)).
