# ADR 0012: Public project scoreboard

| Field | Value |
|---|---|
| Status | **Accepted, band-only variant** (owner, 2026-10-12). Numeric ordering remains rejected: P-11 and ADR 0009 are unchanged |
| Proposed by | Claude, 2026-10-12, at the owner's request during Phase 5 planning |
| Reviewed by | Claude recommendation below; Codex review pending |
| Decided by | Project owner, 2026-10-12 (chose the band-only ranking over numeric ranking, a findings-count board, or not building it) |
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

**Accepted, band-only variant** (2026-10-12). After the recommendation above, the owner asked for the scoreboard and chose a band ranking with no numbers. This replaces the "Proposed solution" where they differ: there is no score, so the ranking does not depend on ADR 0009 or O-12, and the aggregation rule is defined here.

1. **Route and name:** public page `/scoreboard`, titled "Project risk ranking", linked from navigation and the project directory. API: `GET /projects/scoreboard?chain=` (`scoreboardRequestSchema`, `scoreboardResponseSchema` in `project.ts`).
2. **Aggregation rule (published):** a project's ranking band is the **highest band among its official addresses' own public assessments**, considering only official addresses on the selected network when one is chosen. The page names the address that sets the band and how many of the considered addresses are assessed. This is a ranking key only: project profiles and directory cards still show each official address's own assessment and **no combined project rating**.
3. **Not ranked**, listed separately with the first reason that applies: the profile is stale; an official address's assessment could not be loaded; a finding is suspended pending review; no considered address is assessed; every address that would set the band has low confidence; no official addresses are listed. Missing or unreliable data is never ranked as low risk and never placed at 0. With a network selected, projects with no official address on that network are left out of that view.
4. **Order and ties:** Severe → High → Moderate → Low. All projects in a band share one rank (1 + the number of ranked projects in higher bands), shown as "2="; within a band projects are listed A–Z by name, then slug. There is no tie-break by score, recency or popularity.
5. **Wording:** "A higher place means more risk was found"; "There is no score"; a low band "never means safe, endorsed or verified"; methodology link; "as of" time; disputed findings keep their dispute state. No "safest", "best" or "worst" lists.
6. **No numeric score anywhere** in the page, the contract (strict schemas reject score fields; tests) or the API.

Implemented on mocks in the Phase 5 follow-up (`apps/web/src/lib/api/mock/scoreboard.ts` is the reference rule for the research read model). Threat note added to THREAT-MODEL T-31.
