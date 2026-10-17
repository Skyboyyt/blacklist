# Phase 10 plan: Risk Engine & Admin Backend

| Field | Value |
|---|---|
| Authorized | Owner, 2026-10-17 ("do the phase 10"). The plan below awaits the owner's go-ahead before slice 1 starts |
| Scope (ARCHITECTURE §36) | V1 strong-evidence ruleset, assessments with input snapshots, expiry, the stale-job protocol, methodology data, admin backend, notifications. Also the Phase 10 items deferred from 9a: project profiles, project suggestions and corrections (ADR 0010 Part A), labels, suppressions, and the band-only project scoreboard (ADR 0012) |
| Exit criteria | Golden, replay, invariant and stale-job suites green; O-12 calibration (owner sign-off before public bands) |
| Not in scope | Phase 9b image evidence; ADR 0009 (public numeric score, proposed only) and ADR 0010 Part B (verification, post-V1); weak signals and association (inactive in V1); paid resources; provider activation |
| Normative designs | ARCHITECTURE §15 (risk engine), §22 (jobs); [data-model.md](data-model.md) §4, §7, §8; ADR 0005, 0010 Part A, 0012; [moderation.md](design/moderation.md) for suppressions |
| Prepared by | Claude, 2026-10-17 |

## Starting state

- No risk, project, label, suppression or notification tables exist. Public research shows `assessment: not_assessed` and the scoreboard and project pages answer "not available".
- Published findings already exist with immutable revisions, status history and system publication (Phase 9a). They are the only active V1 risk inputs.
- The analysis factors (`token.symbol_impersonation`, `eoa.delegated_to_flagged`) need verified chain facts. Chain research is off (`RESEARCH_ENABLED=false`, O-3), so their **feeders are deferred**; the rules themselves are implemented and tested.

## Progress

- Slice 1: risk engine core, done (`packages/domain/src/risk/`: `ruleset.ts`, `engine.ts`, `explanations.ts`; tests in `tests/backend-acceptance/src/risk-engine.test.ts`). Interpretations recorded for review:
  - **Not assessed vs Low.** With no applied factor and no verified chain facts, the result is `not_assessed` (null score), never 0. With verified chain facts and nothing applying, it is Low (0).
  - **Confidence.** High needs both published findings and verified chain facts; findings without chain facts give Medium; otherwise Low.
  - **A severe finding without the independent-approval flag** still contributes, but the ceiling stays 74 (High at most).
  - **Relative weight words.** The largest applied contribution is "primary"; at least half of it is "contributing"; anything smaller is "minor".

- Slice 2: assessments and signals, done on the branch. Risk tables (migration 0008, runbook `docs/operations/2026-10-17-apply-0008-risk.md`, rehearsed); signals follow published findings; assessments with input snapshots, factors and replay; forward-only current pointer; annotations on suspension and reversal; staff score in the case view; public band only with `RISK_PUBLIC_BANDS=true`; 15-minute expiry sweep in the worker. Deviations:
  - **Recompute inside the moderation transaction**, not in a queued job. The public result never lags a publication, suspension or reversal; a recompute always reads current signals, so a repeated or delayed one changes nothing (stale-job suite). Render Free's sleeping worker is the reason not to depend on a queue.
  - **The notifications table moves to slice 4** with the rest of the notification work.
  - **Viewing a stale assessment does not enqueue a recompute** yet; V1 inputs do not expire.

## Slices

Each slice is a pull request with tests, updates the data model and `AI_HANDOFF.md`, and (where it migrates) ships an owner-applied, rehearsed Neon runbook.

| # | Slice | Contents | Required suites |
|---|---|---|---|
| 1 | **Risk engine core** (no database) | `assess(subject, inputs, ruleset, evaluationTime)` as a pure, deterministic function in `packages/domain/src/risk/`; the V1 ruleset of §15.3 as versioned data with a checksum; bands, `not_assessed`, ceiling (74 without a published severe finding); confidence and coverage; `effective_inputs_hash`; `next_review_at`; explanation keys (no numbers in public wording) | Golden set (one case per factor and band edge); invariants (§15.3: incoming transfers, `unknown` authorization, no weak signals, Severe only with a severe finding, verification never lowers); determinism and replay |
| 2 | **Assessments and jobs** | One migration: `risk_rulesets`, `risk_signals`, `risk_signal_revisions`, `risk_signal_suppressions`, `risk_assessments`, `risk_assessment_inputs`, `risk_assessment_factors`, `risk_subject_state`, `current_risk_assessments`, `assessment_annotations`, `notifications`. Finding publication, suspension, reinstatement, reversal and supersession write signal revisions in the same transaction and enqueue `risk.recompute`. The worker recomputes with the stale-job protocol (expected revision, `dirty` flag, compare-and-set on `current_risk_assessments`); `risk.expiry_sweep` every 15 minutes. Public research shows the band, explanation, confidence, coverage, freshness, ruleset version and dispute state **only when public bands are enabled** (O-12); staff see the numeric score. `/methodology` data from the active ruleset | Stale-job (a delayed job never overwrites a newer result; no resurrection after reversal); replay of stored assessments; Severe needs a severe input with a valid approval event; append-only rejection; public DTO never carries a number |
| 3 | **Projects** | `projects`, `project_revisions` [append-only], `project_addresses`, `project_domains`, `project_suggestions`, `correction_requests`. Member suggestions and corrections with the 9a case workflow (`accept_suggestion`, `accept_correction` with `project:manage`, step-up); profile revisions with base-revision conflict checks; public project pages; project subjects for responses and DNS-free documentary standing | Authorization matrix; base-revision conflict; unreviewed suggestions change nothing public; profile history append-only |
| 4 | **Admin and notifications** | Labels (`address_labels`, provenance `external_source` or `platform_analysis`), signal suppressions (decision-linked, public reason, shown in explanations, recompute on change), members list and suspend/restore, the audit viewer search, the notifications table replacing derived notices (received, information requested, decision, standing, appeal outcome), 14-day appeal escalation to admins | Suppression audit and explanation; suspended member cannot submit; notifications carry IDs and template keys only; escalation fires once |
| 5 | **Scoreboard and web** | ADR 0012 band-only scoreboard (no numeric ordering); live adapters for projects, scoreboard, methodology, admin labels, suppressions, members, audit and notifications; the mock build is unchanged | Live adapter tests; no numeric score in any public DTO or page |

## Owner decisions this phase needs

1. **O-12 calibration (public bands).** The §15.3 weights are a proposal. Recommendation: build everything, show bands and numbers **to staff only** at first, and add a switch `RISK_PUBLIC_BANDS` (off by default). The owner turns it on after reviewing real assessments on staging and signing O-12. Until then the public page says "not assessed".
2. **Analysis factors.** Implement and test the rules now; feed them only after chain research is enabled (O-3). Until then V1 scores come from published findings only.
3. **Project management.** ARCHITECTURE §9.2 gives `project:manage` to administrators. Accepting a suggestion or a profile correction therefore needs an admin, with step-up.
4. **Correction and response statuses.** Adopt the interim sets as normative (already used since Phase 4).

## Risks

- **Small staff.** With one admin, severe findings cannot be published (independence) and therefore no subject can reach Severe. This is intended; invite a second admin.
- **Neon migrations.** Slices 2 and 3 each add a migration and an owner runbook; the deploy order is migrate, then deploy.
- **Public wording.** A high band can describe a victim's address (delegation sweeps, drained wallets). Explanations must say so, and the public page never shows a number (P-11).
