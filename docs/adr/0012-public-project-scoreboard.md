# ADR 0012: Public project scoreboard

| Field | Value |
|---|---|
| Status | **Proposed** (must not be implemented) |
| Proposed by | Claude, 2026-10-12, at the owner's request during Phase 5 planning |
| Reviewed by | Claude recommendation below; Codex review pending |
| Decided by | Pending (project owner) |
| Affects | PRD §4.2 (project aggregate assessments, Post-V1), §5.14 (P-11); ADR 0005, 0009; ARCHITECTURE §15; research module; THREAT-MODEL (reputational harm, gaming, misreading rankings) |

## Problem

The owner's Phase 5 brief asks for a public scoreboard of projects ranked by score, "using the approved scoring and eligibility rules". No such rules exist:

- the public numeric score is not shown in V1 (P-11; ADR 0009 is Proposed);
- projects have no combined rating in V1 ("project aggregate assessments" are Post-V1, PRD §4.2), so there is nothing per project to rank;
- the §15.3 contribution table is a calibration proposal awaiting sign-off (O-12).

Building a ranking now would require inventing aggregation, eligibility and tie rules.

## Evidence

PRD §4.2, §5.14, P-11; ARCHITECTURE-ESSENTIALS §10, §17; contracts reject numeric scores and combined ratings in public DTOs (tests in `packages/contracts/src/project.test.ts`).

## Impact

A ranking reads as an endorsement list ("safest projects") or a blacklist ("worst projects"), invites gaming, and amplifies calibration errors. Ranking absent or partial data alongside real results misleads unless missing values are handled explicitly.

## Proposed solution

Only after ADR 0009 (public numbers) and a project-aggregation ADR are accepted, and O-12 is signed off:

1. **What is ranked:** project aggregate assessments computed by a published aggregation rule (separate ADR), never single addresses.
2. **Eligibility:** a current staff-reviewed profile (not stale), at least one official address with a final, non-`not_assessed` assessment, coverage at least "medium", and no emergency suspension in effect.
3. **Ordering:** band first (Severe → Low), then score within a band, then most recent assessment time, then slug alphabetically. Equal values share a rank ("2=").
4. **Missing data:** ineligible projects are listed separately as "Not ranked" with the reason (not assessed, stale, unavailable). They are never placed at 0 or at the bottom of the ranking.
5. **Wording:** "Risk ranking of reviewed projects"; no "safest" or "best" lists; the methodology link and freshness are shown on the page; disputed items show their dispute state.
6. **Abuse controls:** no rank for projects with an open appeal unless the finding stays visible; ranking snapshots are versioned with the ruleset.

## Alternatives considered

- **Do nothing (current):** directory sorted by name, review date or number of published findings; no score ranking.
- **Rank by number of published findings:** already available as a directory sort; it is a count, not a risk score, and is labelled as such.
- **Band-only grouping without scores:** possible after a project-aggregation ADR; still needs eligibility rules.

## Consequences

Depends on ADR 0009, a new aggregation ADR and O-12. Adds a public route, contracts, methodology content and tests for ties, eligibility and missing data.

## Recommendation (Claude)

**Do not build in V1.** Keep the directory's existing sorts. Revisit after calibration (O-12) and the numeric-display decision (ADR 0009). Phase 5 did not build a scoreboard.

## Decision (owner)

Pending.
