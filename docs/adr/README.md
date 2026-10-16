# Architecture Decision Records (ADRs)

ADRs record **changes** to the approved architecture (ARCHITECTURE.md, ARCHITECTURE-ESSENTIALS.md, docs/data-model.md, THREAT-MODEL.md mitigations) and decisions that resolve open items (ARCHITECTURE.md §35, PRD §10).

The baseline decisions D-001 … D-030 are recorded in ARCHITECTURE.md §34 and are not duplicated here. ADRs start at `0001`.

## Process

1. Copy [0000-template.md](0000-template.md) to `NNNN-short-title.md` (next free number).
2. Status **Proposed**. Any agent may propose; Codex uses this for architecture problems found during review.
3. Claude reviews and adds a recommendation (accept / reject / amend) with reasoning.
4. The project owner decides: **Accepted** or **Rejected** (with date).
5. If accepted, the implementer updates ARCHITECTURE.md and related docs in the same change as (or before) the implementation, and links the ADR.
6. Superseded ADRs keep their file and get status **Superseded by NNNN**.

Never implement a Proposed ADR. Never edit an Accepted ADR's decision. Write a new ADR that supersedes it.

### Statuses

| Status | Meaning |
|---|---|
| Proposed | Under review; must not be implemented |
| Accepted | Decided by the owner |
| **Accepted with amendments** | The owner decided the direction. Claude's recorded amendments refine the original proposal, whose text is preserved above them. The owner ratifies the amended text at the next review. Until ratified, the amendments are the working architecture for documentation but **not** an implementation authorization |
| Rejected | Decided against; file kept with rationale |
| Superseded by NNNN | Replaced by a later ADR; file kept |

Phase numbers inside ADRs 0001–0007 refer to the earlier backend-first plan; ADR 0008 maps them (old 1→7, 2→8, 3→9, 4→10, 5→11).

No ADR status authorizes starting a phase. Phase authorization is always a separate, explicit owner instruction recorded in `AI_HANDOFF.md`.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-authentication-lifecycle-and-delivery.md) | Authentication lifecycle, library selection and secure delivery | Accepted with amendments; amended by 0008; **E-1 accepted with mitigations** |
| [0002](0002-immutable-approvals-and-effective-redress.md) | Immutable approvals and effective redress | Accepted with amendments; clarified by 0008 |
| [0003](0003-chain-evidence-and-authorization-semantics.md) | Chain evidence identity and transfer authorization | Accepted with amendments; corrected by 0008 |
| [0004](0004-hostile-evidence-isolation-and-lifecycle.md) | Hostile evidence isolation and shared-blob lifecycle | Accepted with amendments (2026-10-04) |
| [0005](0005-risk-evidence-privacy-and-v1-scope.md) | Risk evidence privacy, replay and smaller V1 | Accepted with amendments; **P-11 decided (band + explanation)** |
| [0006](0006-audit-trust-retention-and-private-telemetry.md) | Audit trust, retention and private research telemetry | Accepted with amendments (2026-10-04); O-13 at hosting decision |
| [0007](0007-toolchain-and-foundation-acceptance.md) | Toolchain baseline and Foundation acceptance checks | Accepted; sequencing amended by 0008 (gates in Phase 7) |
| [0008](0008-revision-2-ratification-corrections.md) | Revision 2 protocol and execution corrections | Accepted with amendments (2026-10-04) |
| [0009](0009-public-numeric-risk-score.md) | Public display of the numeric risk score (change to P-11) | **Proposed** |
| [0010](0010-project-submission-and-verification-status.md) | Project submissions, update proposals and verification status | **Part A Accepted** (2026-10-12); Part B Proposed |
| [0011](0011-additional-evm-networks.md) | Additional EVM networks (Base, Arbitrum, BNB Chain, Polygon) | **Proposed** |
| [0012](0012-public-project-scoreboard.md) | Public project scoreboard | **Accepted (band-only variant)** |
| [0013](0013-small-team-recovery-and-objection-resolution.md) | Small-team staff recovery and objection resolution | **Accepted with Claude's amendment** (owner, 2026-10-16); P-13 open |
| [0014](0014-render-private-tls-and-free-staging.md) | Render and Neon free staging, TLS | Owner hosting selection recorded; Claude: amend, then accept (2026-10-15) |
| [0015](0015-staging-database-operator-execution.md) | Render-only staging database operator execution | **Accepted by owner**; Claude: accept with amendments (2026-10-15) |
| [0016](0016-owner-password-minimum-and-canonical-foundation-url.md) | Password minimum and canonical foundation URL | **Accepted, amended** (owner, 2026-10-16): staff 8, members 12 |
| [0017](0017-request-triggered-free-mail-worker-wake.md) | Request-triggered free mail-worker wake | **Accepted by owner**; Claude: accept with amendments (2026-10-15) |
| [0018](0018-phase8-provider-selection.md) | Phase 8 blockchain provider selection (O-3) | **Accepted provisionally** (owner, 2026-10-16); research off until provider verification is met |
| [0019](0019-invite-only-member-registration-in-staging.md) | Invite-only member registration while staging holds real users | **Accepted** (owner, 2026-10-16) |
