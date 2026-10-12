# ADR 0010: Project submissions, profile update proposals and a verification status model

| Field | Value |
|---|---|
| Status | **Proposed** (must not be implemented) |
| Proposed by | Claude, 2026-10-12, at the owner's request during Phase 3 planning |
| Reviewed by | Claude recommendation below; Codex review pending |
| Decided by | Pending (project owner) |
| Affects | PRD §4.1, §4.2, §4.4, §5.10, §5.12, §5.16, §5.18; ARCHITECTURE §12, §14, §36; data model (`projects`, deferred `project_claims`, `verification_checks`, `verified_claims`); moderation design §6 (standing); THREAT-MODEL (impersonation, false legitimacy, evidence abuse) |

## Problem

The owner's Phase 3 brief asks for:

- a public "submit a project for review" flow with evidence uploads;
- representative-proposed profile updates;
- verification statuses ("reviewed", "pending", "rejected", "not reviewed", "insufficient evidence") with visible rejection reasons.

The approved V1 scope excludes these. Projects are staff-created (PRD §4.1). "User-created projects and self-service verification" are explicitly not V1 (PRD §4.4). Project claims and verification are Post-V1 (§4.2, §5.16), and the data model defers `project_claims`, `verification_checks` and `verified_claims`.

## Evidence

- PRD §4.1, §4.2, §4.4, §5.10, §5.16; data-model §6 deferred tables; ARCHITECTURE §36 (Phase 3 is the Research UI; uploads and redress are Phase 4).
- No approved status model for projects exists. The V1 public vocabulary is assessment bands, `not_assessed`, confidence, coverage and dispute state.

## Impact

- **Public submissions** create an abuse channel: impersonators can submit lookalike projects, and "pending" or "submitted" labels lend false legitimacy. This conflicts with the rule that unreviewed input has no public effect (PRD §5.11, product principle 7).
- **Public rejection reasons** risk defamation and leak private submission data.
- **"Verified" labels** are read as "safe" even with disclaimers (PRD §5.16).

## Proposed solution

Two separately decidable parts.

**Part A: private project suggestions and update proposals (V1-compatible).**
- Signed-in users submit a **private** suggestion: network, contract or mint identifier, official links as defanged text, a description, and image evidence only (PNG, JPEG, WebP; at most 10 MiB each and 10 per submission, ADR 0004).
- It enters the moderation queue. Staff may create or revise a profile through the existing append-only revision flow.
- Submission status is visible **only to the submitter**: `submitted`, `needs_information`, `accepted_into_profile`, `not_accepted`. A reason is shown to the submitter only, from a fixed list of staff-selected reasons, never free text about third parties.
- **Representatives:** a "propose an update" path for a profile requires per-case standing (moderation §6: wallet signature, authority signature, DNS TXT or documentary). Standing proves control at a time, not identity or innocence. Connecting a wallet or typing an address never proves ownership.
- Nothing about a suggestion is public until staff publish a profile revision.

**Part B: public project claim verification (Post-V1 per PRD §5.16).** Claims such as "controls domain X" or "deploys contract Y" are verified by DNS TXT, authority signature or documents. Claims expire and are re-checked. Public status applies **per claim**: `verified (as of date)`, `expired`, `revoked`. There is no overall "verified project", no badge, and wording never implies safety.

## Alternatives considered

- **Do nothing:** keep staff-created profiles only. Simplest and safest for V1.
- **Public submission queue:** rejected for the abuse and legitimacy reasons above.
- **One project-level "verified" status:** rejected; it reads as endorsement.

## Consequences

Part A adds contracts (`projectSuggestion`, submitter-private status DTOs), new private routes (`/projects/suggest`, `/projects/suggestions/[id]`), queue items, a migration, authorization-matrix entries, quotas and threat-model updates. It depends on the Phase 4 evidence-upload UI and the Phase 9 evidence pipeline. Part B needs its own data-model and threat-model work and remains Post-V1 unless the owner pulls it forward.

## Recommendation (Claude)

**Accept Part A, amended:** build it in Phase 4 alongside the approved report and evidence UI, which reuses its image-only upload rules, instead of in Phase 3. **Keep Part B Post-V1.** Phase 3 built no submission, verification or rejection state; contracts reject such fields with negative tests.

## Decision (owner)

Pending.
