# ADR 0006: Audit trust, retention and private research telemetry

| Field | Value |
|---|---|
| Status | **Accepted with amendments** (owner directions 2026-10-04; amended text below pending owner ratification). Foundation audit schema in Phase 1; retention/legal items are pre-launch gates |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Pending Claude recommendation |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §§21, 23–25; PRD P-7/P-8/P-10; audit/history schema; T-24, T-44, T-48–50, T-56–57 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md), R-12 |

## Problem

Append-only event payloads can retain personal data indefinitely despite account erasure promises. Identified request telemetry can reconstruct private research. Hash chaining in one DB trust domain cannot detect a full administrator rewrite reliably.

## Evidence

audit_log keeps user/session/IP references; project revisions store before/after JSON; internal decisions contain rationale. Search logs live 14 days and logs have actor/request IDs. External head anchoring is deferred to Post-MVP.

## Impact

Over-retention, incomplete rights handling and misleading audit assurance against infrastructure insiders.

## Proposed solution

Define the V1 audit threat boundary explicitly: app-role write restrictions and chain verification protect against application/partial tampering; privileged full-history rewriting remains possible absent independently controlled checkpoints. Owner chooses explicit residual acceptance or pre-launch anchoring with separate credentials/write-once retention. Hashing is not immutability. Privileged actions and evidence access are audited; high-volume telemetry is separate. Define canonical encoding, append-only function grants and bounded transaction lock times.

Separate erasable identity mappings from minimal immutable event facts, prohibit PII/secrets in arbitrary JSON/rationale where unnecessary, and create table/field/backup retention and legal-hold/erasure maps with qualified counsel. Pseudonymization is not automatically erasure. Public blockchain addresses can be personal data in context. Remove raw research terms/addresses from identified logs/traces/third-party error capture; use route templates and aggregate metrics. Tests include privacy DTO/telemetry capture, privileged append grants, partial tamper and full-rewrite threat demonstration, anonymization/hold/backup procedures. Foundation audit schema must preserve minimization; legal schedule and anchoring decision are launch gates.

## Alternatives considered

Keep hash chain with explicit limited V1 trust claim (reasonable). Add independent daily/head checkpoints before launch if insider tamper evidence is required. Plain append-only logs with independent exports can be simpler if threat coverage is equivalent. Do nothing risks overstating immutability and promises of deletion.

## Consequences

Additional lifecycle contracts and negative tests are required; this proposal reduces ambiguity rather than authorizing production work. If accepted, Claude updates ARCHITECTURE, ESSENTIALS, PRD, data model, threat model, testing/dependency policies and handoff wherever affected before the relevant implementation. No existing migration is changed; none exists. Preserve the owner's phase authorization requirement.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.**

- **R-12 is correct.** Calling the audit log "tamper-evident" without stating that a database administrator can rewrite the entire chain overstated it. Durable rows carrying identifiers, IPs and free-form JSON also conflict with erasure promises.

Amendments:

- Make the V1 audit trust boundary explicit.
- Defer the independent-checkpoint decision to the hosting decision rather than launching with an implicit claim.
- Introduce an erasable actor-identity map.
- State telemetry rules concretely.

## Amended decision

1. **Honest claim:**
   - The application role can only INSERT/SELECT the audit table, and a trigger blocks UPDATE/DELETE. This **prevents** tampering through the application.
   - The SHA-256 hash chain **detects** accidental or partial alteration.
   - **Neither** prevents or reliably detects a complete rewrite by someone with database-administrator or infrastructure access, unless an independently controlled checkpoint exists.
   - "Hash chaining" is never described as "immutable".
2. **V1 audit controls:** the above, plus restricted administrator access to the production database (named individuals, MFA, provider audit logs), encrypted backups with retention, a daily chain-verification job with alerting, and short transactions around the serialized append function (lock wait is monitored). Canonical hash encoding is specified in the data model.
3. **Independent checkpoint (open decision O-13, decided with hosting O-4):** a daily export of the head hash to write-once storage under a separate account and credentials unavailable to application and database operators. Recommended before public launch because it is cheap. If the owner declines, the residual risk is recorded as accepted. No blockchain anchoring.
4. **Minimization:** audit rows reference an opaque `actor_ref`. The mapping `actor_ref → user_id` lives in an erasable `actor_identity_map`. `details` use per-action allowlisted keys, with no free-form personal data or secrets. Internal rationale fields have length limits and a review rule against unnecessary personal data. Pseudonymization is **not** treated as legal erasure; counsel decides.
5. **Telemetry:**
   - Logs and traces use **route templates**, never raw paths containing addresses or hashes.
   - Search terms, addresses and transaction hashes are never logged together with an actor or session ID.
   - Research GET routes log no actor ID.
   - Error tracking scrubs URLs, query strings and bodies.
   - Aggregate metrics only.
6. **Retention map** (draft in ARCHITECTURE.md §25), with legal holds and backup aging. Counsel approval is a **pre-launch gate**.

Phase gate: Foundation for the audit schema and telemetry rules; pre-launch for counsel-approved retention and O-13. Affected documents updated 2026-10-04: ARCHITECTURE §23–§25; data model §9; THREAT-MODEL T-48–T-50 and invariants; testing strategy §6.

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (review-response instructions §22, §27): describe audit logs honestly; append-only semantics, hash chaining for tamper evidence, restricted permissions, backups, monitoring, and later external anchoring only if justified; no blockchain anchoring; private data stays private. Still required: ratification, and decision **O-13** at hosting time. Not an implementation authorization.

