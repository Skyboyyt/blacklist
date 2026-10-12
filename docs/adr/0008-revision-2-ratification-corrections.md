# ADR 0008: Revision 2 protocol and execution corrections

| Field | Value |
|---|---|
| Status | **Accepted with amendments** (owner directions 2026-10-04; amended text below pending owner ratification). Documentation only; no phase authorized |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Claude, 2026-10-04: ACCEPT WITH AMENDMENTS |
| Decided by | Owner direction 2026-10-04 (final Phase 0 closure instructions) |
| Affects | ADRs 0001–0003 and 0007; identity §6/§8/§14; moderation §4; chain-data §5; implementation sequencing; T-05, T-24, T-40–41 |
| Review | [Revision 2 re-review](../reviews/2026-10-04-phase-0-codex-rereview.md) |

## Problem

The exact selected Better Auth version contradicts the reset-email error-propagation assumption. Reset completion also lacks a documented crash-safe boundary around password replacement, revocation and cooling. Two normative statements conflict with their own invariants. The phase sequence predates the owner's explicit frontend-first instruction.

## Evidence

- Better Auth 1.7.6 `dist/context/create-context.mjs`, `runInBackgroundOrAwait`, catches and logs rejected email promises even without a background handler. `requestPasswordReset` awaits that helper. A callback throwing does not cause the issuance API to reject.
- `dist/api/routes/password.mjs`, `resetPassword`, consumes the verification, updates the password, calls `onPasswordReset`, then deletes sessions in separate awaited operations. Identity §6 places Blacklist's cooling/audit after this call. There is no encompassing transaction in this endpoint body.
- Chain-data §5.4 permits equal Solana answers to become `agree` while retaining different context slots; §5.3, ADR 0003 and the scaffold prohibit this.
- Moderation §4 requires the approver not to be the publisher, then states that the approver atomically publishes. The §7 matrix confirms approve-and-publish.
- Architecture §36, Essentials §13, testing strategy §9 and ADR 0007 mandate backend acceptance spikes first. The owner's current instruction mandates frontend foundation and primary flows before full backend work.

## Impact

SMTP failure can falsely complete a job. A crash can change credentials without completing revocation or cooling. Different-state answers can acquire unsupported corroboration. Approval implementations can disagree about actor identity. The documented next phase can violate the owner's execution order.

## Proposed solution

1. Keep Better Auth headless; do not fork it. Specify a supported per-call delivery wrapper: no background handler, capture sanitized send outcome in invocation-local state, and require the worker to inspect that outcome after `requestPasswordReset` returns and throw its own sanitized retryable error on failure. No raw SMTP error, token or URL may enter library logs. Alternatively propose a narrow Blacklist reset-token component through review if supported composition is unworkable. S14 must test actual job failure/retry, not only a throwing callback.
2. Specify reset issuance serialization per account, including invalidation, new issuance and competing redemption. S13 must prove concurrent workers cannot leave multiple valid tokens. Hashing identifiers alone does not provide a per-account active-generation invariant.
3. Define reset completion as one proven supported transaction including token consumption, credential update, revocation, cooling and durable audit/notice enqueue; or specify a fail-closed pending-reset state established before credential mutation, enforced on all session/sensitive-action paths, with idempotent recovery. A callback after password update alone is insufficient. Add crash injection after every durable boundary and concurrent login/email-change tests. If the supported adapter cannot meet this contract, stop and propose the narrow alternative; no implementation is authorized here.
4. Clarify existing safety intent: equal Solana values at different context slots are still inconclusive. `minContextSlot` is a lower bound, not historical targeting. Ordinary sourced display remains available; no scoring/pinning agreement is invented.
5. Clarify existing actor intent: the independent non-author approver may atomically perform publication. Independence is from proposer/authors and conflicts, not from that approver's own publication operation. Preserve revision/hash binding and severe-replacement independence.
6. Reconcile the phase plan to frontend-first: approved tooling and minimal stubs/contracts/fakes, then frontend foundation and primary flows, then separately authorized production backend work with D1–D9 and revised S checks still required before migrations/security features merge. Mock interfaces confer no real authorization. Do not weaken staff/security gates or authorize Phase 1.

## Alternatives considered

- Leave acceptance tests to discover the already demonstrated mismatch: rejected; this knowingly ratifies an inaccurate protocol.
- Fork Better Auth: rejected.
- Replace Better Auth or Drizzle now: not justified; supported composition must be evaluated first.
- Compare only matching values regardless of snapshot: rejected by the existing safety invariant.
- Collapse approve-and-publish or relax reviewer independence: unnecessary and rejected.
- Backend-first execution: contradicts the owner's current instruction.

## Consequences

Claude updates affected normative documents and acceptance criteria after review/owner disposition. No schema, feature, dependency, infrastructure or deployment is introduced. Integration proof remains a later implementation gate after explicit authorization and frontend completion. This addendum does not supersede the sound remainder of ADRs 0001–0007.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.** Codex's evidence is correct. I re-confirmed it against the Better Auth 1.7.6 source I had inspected: `runInBackgroundOrAwait` catches callback rejections, and `resetPassword` performs separate writes. My revision-2 reset design relied on assumptions I had not verified at the source level. Every item is accepted. The amendments choose the simpler of Codex's two options where it offered a choice.

## Amended decision

1. **Reset delivery (item 1).** Rather than capturing Better Auth's callback output in invocation-local state, **password-reset tokens become Blacklist-owned** (`identity_tokens`, purpose `password_reset`), exactly like registration, email-change and invitation tokens.
   - Better Auth's `requestPasswordReset`/`resetPassword` are never called. Better Auth keeps credential storage, sign-in, sessions and revocation.
   - This removes the fragile callback coupling and unifies all bearer-token email under one protocol.
   - A Blacklist **delivery layer** returns `accepted_for_delivery` | `retryable_failure` | `permanent_failure` (timeout = retryable). A token becomes redeemable only after acceptance and is invalidated before any retry. Jobs carry identifiers only ([identity §8](../design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01)).
2. **Serialization (item 2).** A per-account security lock (`account_security_state FOR UPDATE`), a partial unique index permitting one open reset token per account, generation numbers, and a **per-account `security_version`**. Every request checks the version, so sessions created under an older version are rejected ([identity §2, §5.4, §6.5](../design/identity.md#65-concurrency-serialized-per-account)).
3. **Atomic completion (item 3).** One Blacklist database transaction: credential replacement in `auth_accounts`, token consumption, deletion of all sessions, cooling start, `security_version` increment, audit append, notice enqueue. All or nothing; no fail-closed pending state is needed because nothing external participates ([identity §6.3](../design/identity.md#63-redemption-one-atomic-security-transition)). Password change and email change use the same transaction shape. Gate S16.
4. **Solana (item 4).** Accepted as written: identical context slot required; different slots are inconclusive even with equal values; no same-slot pair → `unavailable` and no scoring signal. Receipt fields extended (chain/cluster, method, params, commitment, timestamps). EVM block-level balance deltas no longer upgrade individual transfers.
5. **Approval terminology (item 5).** Accepted. Human roles are **author** and **approver**. Publication is a **system transition** caused by the approval (`finding_publication_events`, actor `system`). Non-severe revisions may be self-approved; severe and severe-replacement revisions need an independent approver ([moderation §4](../design/moderation.md#4-approval-and-system-publication)).
6. **Frontend-first (item 6).** Accepted with a concrete plan. Phases:
   - 1 Frontend Foundation;
   - 2 Auth UI;
   - 3 Research UI;
   - 4 Reporting UI;
   - 5 Staff UI;
   - 6 Frontend quality and review;
   - 7 Backend Foundation, where D1–D9 and S1–S17 run first;
   - 8–11 backend features and launch.

   UI is built against `@blacklist/contracts` with a typed mock client that confers no authority. Narrow validation spikes need explicit owner authorization and never replace the gates (ARCHITECTURE §36).
   **Phase-number mapping for ADRs 0001–0007:** old 1 → 7, old 2 → 8, old 3 → 9, old 4 → 10, old 5 → 11.
7. **Additional owner decisions recorded here:**
   - **E-1 accepted with mitigations M1–M10** ([identity §5.5](../design/identity.md#55-session-token-storage--exception-e-1-accepted-with-mitigation-owner-2026-10-04));
   - **P-11:** V1 public risk display is band + explanation, never the numeric score;
   - V1 scoring documented as strong-evidence-only, with the weak-signal policy deferred;
   - staff device-independence and break-glass assurance wording corrected (P-13 opened).
8. **Non-blocking items addressed:**
   - uniform-work email change plus a mandatory enumeration test;
   - stale testing-scaffold references removed;
   - receipt contract comments aligned;
   - aggregate versus transaction balance evidence clarified.

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (final Phase 0 closure instructions): fix V2-01–V2-05 as above, accept E-1 with mitigations, adopt band + explanation for V1 public risk display, and proceed frontend-first. Still required: ratification of the amended text after the final Codex closure check. **Phase 1 remains unauthorized.**

