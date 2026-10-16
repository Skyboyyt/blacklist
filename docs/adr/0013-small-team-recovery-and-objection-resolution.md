# ADR 0013: Clarify small-team staff recovery and objection resolution

| Field | Value |
|---|---|
| Status | **Accepted with Claude's amendment (owner, 2026-10-16)** |
| Proposed by | Codex, 2026-10-13 |
| Reviewed by | Claude, 2026-10-15 (recommendation below) |
| Decided by | Owner, 2026-10-16: "Accept the design" |
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

**Claude's recommendation (2026-10-15): adopt the transition model below as an amendment, then accept. Until the owner accepts it, today's fail-closed behaviour stays: sole-admin recovery and objected cases remain unavailable.** No requirement is removed. Every path still needs WebAuthn re-enrollment, two independently recorded verifications, a separate approver, the 24-hour objection window, and mailbox plus out-of-band code proof.

### A. Ordinary recovery (unchanged)
Identity §10.11 as implemented:
- an admin other than the subject opens the case;
- two different staff verify, at least one an admin, with method and rationale recorded separately;
- an admin other than the opener approves;
- a 24-hour objection window, notifying all admins and the subject's email;
- re-enrollment with the emailed token plus an out-of-band code, a new password and two new authenticators.

### B. Sole active administrator is the subject
1. **Opening.** Only the operator CLI may open the case (`staff:recovery:open --operator <named person> --incident <ref>`). It is recorded under the named operator, not a generic "cli" label. All staff and the subject's email are notified at once.
2. **Verification.** Two verifications are still required:
   - **The named operator.** They count as the admin-equivalent verifier **only in this case**, and only when the P-13 record names a human operator who is not the subject.
   - **One other active staff member** (any role, not the subject), through the normal staff screen.
3. **No second staff member.** If no other active staff member exists, recovery through the application is **not available**. The path is a fresh bootstrap of a new administrator account under identity §10.13 break-glass, plus offboarding of the old account. A label never stands in for a second person.
4. **Approval** by the operator CLI (identity §10.11 step 3 already allows this when the subject is the only admin), recorded with the operator's name. The operator who opened may approve only when P-13 names a single operator. That fact is recorded in the case and in the post-recovery review.
5. **Objection window, notifications and re-enrollment** as in A. A mandatory post-recovery review is recorded, as for break-glass.

### C. Objections
1. **Staff objection** requires an action-bound step-up (`staff.recovery.object`) and a reason. Today `objectRecovery` takes none, which lets one compromised admin block every recovery.
2. **Subject objection.** The objection notice includes a single-use, POST-only, fragment-token link that records an objection and grants nothing else. It works while the subject's sessions are suspended.
3. **Effect.** The case moves to `objected`, which stays terminal, so history is preserved. Nothing is re-enrolled.
4. **Resolution means a new case.** It must be opened by an admin other than the objector (or by the operator under B), with step-up, and must reference the objected case. Verification and the 24-hour window restart. The objector cannot verify or approve the new case and is notified.
5. **Withdrawal.** The objector may withdraw within the window with step-up (staff) or the same single-use link (subject). The window then restarts for 24 hours.
6. **Abuse signal.** Two or more objections by the same staff member within 30 days alert all admins and the owner.

### D. Implementation and tests required before enabling
- Fix `approveTx`: it requires an admin verifier, so the operator branch at `recovery.ts:121-142` can never run. The operator verification should count only under B.
- Add step-up to objections, the subject's objection link, case reopening with a reference, and withdrawal.
- Audit events: `staff.recovery.{opened,verified,approved,objected,withdrawn,reopened,completed}`.
- Negative tests:
  - the operator cannot verify outside B;
  - no recovery path exists with no second human;
  - the objector cannot verify or approve the reopened case;
  - a staff objection without step-up is refused;
  - the subject's link is single use and grants nothing;
  - verification and the window restart after reopening.

**Owner decisions required:** accept this amendment; record P-13 (who the operator is, and whether a second person must approve operator actions).

## Decision (owner)

**Accepted on 2026-10-16** with the transition model in sections A–D above. Sole-admin recovery and objection resolution may now be implemented exactly as specified there, with the negative tests in D. **P-13 is still open:** the owner must still record who the named operator is and whether a second person must approve operator actions. Until P-13 is recorded, the operator branch (B) stays unavailable in code; the objection, withdrawal and reopening changes (C) do not depend on P-13.

