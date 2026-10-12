# ADR 0005: Risk evidence privacy, replay and smaller V1

| Field | Value |
|---|---|
| Status | **Accepted with amendments**, **updated by ADR 0008** (P-11 decided; pending owner ratification). Backend implementation: Phase 10; research UI on mocks: Phase 3 |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Pending Claude recommendation |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §§15, 17, 20, 22, 36; PRD MVP/P-2/P-6; risk schema; T-25–31, T-40–42, T-50, T-52 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md), R-10, R-11, R-13; MVP recommendation |

## Problem

Public score factors can expose private report activity. Strongest-tier clamping can let weak correlated signals contribute to stronger bands. Mutable signal references and unordered jobs do not guarantee historical replay or timely reversal.

## Evidence

§15.4 adds five points per eligible reporter; §15.5 exposes factor source links/timestamps despite private reports. §15.3 uses strongest tier, sums everything, has decay with no explicit time input, and persists only on inputs hash changes. No immutable complete input or monotonic source revision/pointer protocol is specified.

## Impact

Privacy leakage, sybil-driven false precision, expired/reversed claims persisting or resurrecting, and unexplainable history. Current MVP breadth delays validation of the core loop.

## Proposed solution

Keep 0–100 direction, separate confidence/not_assessed and severe evidence gate. Recommend no pending public counts or numeric unmoderated-report effect, no numeric association or sanctions effect in initial V1; require owner approval to change current proposal. Public factor DTOs use published redacted sources only. If weak factors later enter scores, require an independently sufficient evidence tier for High rather than a small capability factor unlocking a large weak bucket. Calibrate neutral capability context and correlated evidence explicitly; scores are ordinal policy indicators, not probabilities.

Persist complete immutable effective inputs/coverage/source revision plus evaluation time, ruleset and engine snapshots; define canonical hash including applicable time-dependent state. Expiry jobs run without page views. Jobs reconcile current authoritative revision, use monotonic/CAS current pointers, cannot resurrect reversal and have durable dirty/rerun semantics under singleton deduplication. Public APIs expose recompute/stale status and no obsolete alerts. Tests include time progression, replay after source mutation, reversed/purged evidence, ordering/crash races and report inference.

Smallest V1 retains both chains with limited sourced lookup, verified accounts, private bounded reports, images/tx evidence, factual reviewed findings, independent severe approvals, correction/response/appeal, minimal staff controls and audit/methodology. Defer watch alerts, public bios, elaborate project/token analytics and numeric aggregation until calibrated. Tables/endpoints for deferred features are not created now; no phase is started by acceptance.

## Alternatives considered

Keep original scope only with explicit staffing/delivery evidence and all safeguards. Findings/bands first is an alternative to numeric launch scoring; if owner retains numeric scores, require calibration before public display. Public pending count alone still creates reputational pressure. Do nothing preserves hidden report effects and stale-job risks.

## Consequences

Additional lifecycle contracts and negative tests are required; this proposal reduces ambiguity rather than authorizing production work. If accepted, Claude updates ARCHITECTURE, ESSENTIALS, PRD, data model, threat model, testing/dependency policies and handoff wherever affected before the relevant implementation. No existing migration is changed; none exists. Preserve the owner's phase authorization requirement.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.**

- **R-10 is correct.** "+5 per eligible reporter" leaked report activity through score differences. And my strongest-tier ceiling let weak signals ride on a small analysis factor, a hole I had not seen.
- **R-11 is correct.** Mutable signal references, no evaluation time and unordered jobs make history unreplayable and allow stale resurrection.
- I also accept the smaller V1, which the owner has decided.

Amendments:

- An explicit **tier-combination formula**: strong evidence sums; weak signals take the maximum and never add.
- Capability facts become **non-scoring disclosures**.
- **Watchlists are deferred entirely**, not just their alerts.
- Public numeric display becomes a separate owner decision (P-11).

## Amended decision

Normative detail: ARCHITECTURE.md §15 (risk engine) and §22 (background jobs).

1. **Kept:** 0–100 direction (higher = more risk); `not_assessed`; separate confidence; the severe evidence gate. Scores are ordinal policy indicators, not probabilities or verdicts.
2. **No public pending-report counts and no numeric effect of unreviewed reports** (owner decision). No numeric association (ADR 0003) and no numeric sanctions effect (deferred) in V1. No AI.
3. **Tier combination:** `strong = min(ceiling, Σ verified + Σ scoring-analysis)`, where the ceiling is 100 only with a severe finding or authoritative designation, otherwise 74. `weak = min(49, Σ weak)`. `score = max(strong, weak)`. Weak signals never add to strong evidence. V1 has no weak signals.
4. **Capability facts** (mint/freeze authority, permanent delegate, transfer hook, transfer fee, upgradeable proxy, unverified source) are **context disclosures with zero contribution** in V1. The scoring analysis factors in V1 (impersonation, EIP-7702 delegation to a flagged contract with victim-aware wording) require owner calibration sign-off (O-12).
5. **Public explanation DTO** references only published, redacted artifacts. A separate staff DTO carries internal detail.
6. **Replay:** `risk_assessment_inputs` stores immutable copies of every effective input: signal revision, source revision (finding revision, verification receipts, snapshot IDs), status, contribution inputs. Plus evaluation time, ruleset version and checksum, engine version, coverage, `effective_inputs_hash` and `next_review_at`. History is never recomputed with today's rules.
7. **Expiry:** a scheduled sweep recomputes subjects whose `next_review_at` has passed, independent of page views.
8. **Ordering:** recompute jobs carry no inputs and always read current authoritative state. Per-subject serialization, a monotonic sequence, a compare-and-set current pointer, and a durable dirty flag for rerun. Derived-effect jobs carry an expected source revision and no-op when it is stale. Notifications re-check that the assessment is current before sending. Reversal annotations are an overlay; old assessments are never rewritten.
9. **V1 scope (owner decision):** accounts and staff security; Solana and Ethereum lookup; basic sourced research; private reports with image and transaction evidence; moderation; revision-bound findings; explained assessments; responses, corrections, appeals; minimal admin; audit. **Deferred:** watchlists and all alerts, graphs, tracing, investigations, reputation, leaderboard, AI, public API, comments, voting, analytics, public profile pages, persistent wallet links, counterparty analytics, sanctions badge, PDFs, member MFA.
10. **Public numeric display** is decided by the owner (PRD P-11). Recommendation: band plus explanation at launch; the numeric value only after calibration sign-off.

Phase gate: Phase 4 (public scoring); scope applies from Phase 1 planning. Affected documents updated 2026-10-04: PRD §4, §5.14–§5.15, §10; ARCHITECTURE §15, §20, §22, §36; data model §7–§8; THREAT-MODEL T-25–T-31 and invariants; testing strategy §7.

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (review-response instructions §5–§6, §21, §24–§25): no public pending counts; unreviewed reports are private and have no public effect; the smaller V1; reproducible assessments; stale-job protection. Still required: ratification of the amended text and decision **P-11** (public numeric score display). Not an implementation authorization.


## Addendum — 2026-10-04 (owner decision P-11; re-review simplification)

History above is preserved.

- **P-11 decided:** V1 public display is the **risk band + explanation**: key factors and evidence (published artifacts only), confidence, coverage, freshness and dispute or appeal state. **The exact numeric score is never shown publicly in V1.** It may remain internal and is reconsidered only after real-world calibration (O-12) and a new owner decision.
- **V1 formula documented as strong-evidence-only:** `score = min(ceiling, Σ verified + Σ analysis)`. The weak-signal combination (`max(strong, min(49, weak))`) is retained only as an **inactive, deferred** policy that requires a future ADR and calibration (ARCHITECTURE §15.2).
