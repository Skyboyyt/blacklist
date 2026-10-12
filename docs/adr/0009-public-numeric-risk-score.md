# ADR 0009: Public display of the numeric risk score (change to P-11)

| Field | Value |
|---|---|
| Status | **Proposed** (must not be implemented) |
| Proposed by | Claude, 2026-10-12, at the owner's request during Phase 3 planning |
| Reviewed by | Claude recommendation below; Codex review pending |
| Decided by | Pending (project owner) |
| Affects | PRD §4.1, §5.14, P-11; ARCHITECTURE §15.1, §15.6; ESSENTIALS §10, §17; ADR 0005 addendum; `packages/contracts` public DTOs; research and project UI; THREAT-MODEL (misleading-assessment and reputational-harm threats) |

## Problem

The owner's Phase 3 brief asks project cards and detail pages to show "a 0–100 score where the approved model supports it". The approved model does not: decision P-11 (owner, 2026-10-04) says V1 public display is the risk band plus explanation, and the exact number is never shown publicly until real-world calibration (O-12) and a new owner decision.

## Evidence

- PRD §5.14 and P-11; ADR 0005 addendum; ARCHITECTURE-ESSENTIALS §10 and §17 list a public numeric score as a prohibited pattern.
- Public contracts reject a `score` field structurally (`packages/contracts/src/research.ts`, `project.ts`), with negative tests.
- O-12 (V1 ruleset calibration) is still open, so the numbers are not calibrated against a golden set.

## Impact

- **If changed now:** an uncalibrated ordinal number reads as precise and comparable ("37 vs 41"), invites "safe below N" readings, and raises reputational and legal exposure for subjects. Projects have no combined rating in V1, so a project-level number would also need an aggregation rule that does not exist (PRD §4.2, "project aggregate assessments" is Post-V1).
- **If unchanged:** the UI shows band, explanation, factors, confidence, coverage, freshness and dispute state, as built in Phase 3.

## Proposed solution

Allow public display of an address's numeric score only when all of these hold:

1. O-12 calibration is signed off for the ruleset version shown.
2. The number is shown only beside its band and explanation, never alone, and never on directory cards or search results.
3. `not_assessed` and unavailable assessments show no number. A missing score is never 0.
4. Copy states that it is an ordinal policy indicator for the risk of interacting, not a probability or a safety guarantee.
5. No project-level number until a separate ADR defines project aggregation.
6. Contracts add an optional `score` only to the address assessment DTO, gated by a ruleset flag; the strict-object tests change with this ADR.

## Alternatives considered

- **Keep P-11 (do nothing):** safest; already implemented.
- **Show score ranges (e.g. "25–49") instead of a number:** adds little over the band name.
- **Numbers for signed-in users only:** does not reduce misreading and complicates caching and privacy.

## Consequences

Contract, UI, copy and methodology-page changes; new tests that no number appears for `not_assessed` or unavailable data; THREAT-MODEL update for misreading and comparison risks; ESSENTIALS §17 amended.

## Recommendation (Claude)

**Do not accept for V1 now.** Keep P-11 until O-12 calibration is signed off. If the owner wants to commit to numeric display later, accept this ADR **with conditions 1–6 as written**, so that nothing is built until calibration is complete. No numeric score was implemented in Phase 3.

## Decision (owner)

Pending.
