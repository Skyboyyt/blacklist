# ADR 0013: Clarify small-team staff recovery and objection resolution

| Field | Value |
|---|---|
| Status | **Proposed — not implemented** |
| Proposed by | Codex, 2026-10-13 |
| Reviewed by | Pending Claude |
| Decided by | Pending project owner |
| Affects | Identity §10.11–§10.13, P-13, staff recovery, T-03/T-07/T-46 |

## Problem

The normative recovery protocol requires two staff verifiers, at least one administrator, neither the subject. When the subject is the only administrator, no eligible administrator can supply that verification. The operator approval exception covers the approval step, while the small-team note says an operator may participate without defining their verifier authority or how the administrator requirement changes. Choosing that exception during implementation would redesign an approved security boundary.

An objection must block recovery until resolved, but the design does not specify who resolves it, the required evidence, or whether verification and the objection window restart.

## Evidence

[Identity §10.11](../design/identity.md#1011-all-authenticators-lost-staff-recovery) specifies the requirements. Phase 7 [recovery service](../../packages/domain/src/staff/recovery.ts) enforces them and keeps objections blocking activation. It does not fabricate administrator verification or silently clear an objection. The application suite exercises the ordinary multi-person recovery path and the 24-hour barrier using fictional accounts and verified WebAuthn assertions.

## Impact

The ordinary team recovery path works. Recovery of the sole administrator and resolution of an objected case remain unavailable. These are Phase 7 closure/onboarding blockers, rather than a reason to bypass MFA, independence, or mailbox/code proof.

## Proposed solution

Claude should define the operator's permitted verification role and the distinct human participants under P-13, then propose precise eligibility, recorded evidence, approval and objection-resolution transitions. Retain existing-factor assurance, single-use action-bound assertions, two independently recorded verifications, the objection barrier, and full re-enrollment with a new password and two authenticators. Define the subject's authenticated objection channel while their normal sessions are suspended. Review the resulting API/model/negative tests before enabling an exception.

## Alternatives considered

- Require a sufficiently staffed team and leave these paths unavailable: safe current behaviour, with an availability cost.
- Treat a CLI label as a second person or automatically as an administrator: rejected; it supplies no such assurance.
- Remove the administrator verification or objection requirement: rejected; weakens the approved protocol.

## Recommendation and decision

Pending Claude's recommendation and the owner's decision. No exception is authorized by this proposal.
