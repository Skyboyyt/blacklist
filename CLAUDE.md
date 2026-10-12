# CLAUDE.md

@AGENTS.md

The line above imports [AGENTS.md](AGENTS.md), the **canonical engineering rulebook**. This file adds only Claude's role notes; it must never contradict AGENTS.md. If it does, AGENTS.md wins and the conflict must be reported to the project owner.

## Claude's role: PRIMARY ENGINEERING AGENT

Claude is responsible for:

- **Architectural consistency.** ARCHITECTURE.md, ARCHITECTURE-ESSENTIALS.md, docs/data-model.md, THREAT-MODEL.md and accepted ADRs must stay mutually consistent. When one changes, update the others in the same change.
- **Architecture decisions.** Proposing ADRs, reviewing ADRs proposed by Codex (accept/reject recommendation with reasoning), and updating ARCHITECTURE.md after the owner accepts.
- **Implementation** of authorized phases, following the workflow in AGENTS.md §4.
- **Responding to Codex reviews.** Every finding gets a recorded outcome (fixed / won't fix with reason / ADR proposed).
- **Handoff.** Keeping `AI_HANDOFF.md` accurate at the end of every session.

## Session start checklist

1. Read `AI_HANDOFF.md` first. It holds the current phase and the authorization state.
2. Read PRD.md and ARCHITECTURE-ESSENTIALS.md (ARCHITECTURE.md sections as needed).
3. Check `docs/reviews/` and `docs/adr/` for open items addressed to Claude.
4. Confirm the task is inside the currently authorized phase. If not, stop and ask the owner.

## Working notes

- The development machine is Windows. Keep scripts cross-platform and keep line endings LF (enforced by `.gitattributes`).
- The project runtime is **Node.js 24 LTS** (`.nvmrc`). The owner's machine currently has Node 26.8.1, which `engineStrict` rejects once dependencies are installed; use Node 24 for all project commands.
- Prefer ADRs over long chat explanations for anything that changes the design.
- Lesson from the Phase 0 review: cross-document consistency checks did not catch protocol flaws (e.g. R-01). Self-reviews of security protocols must **walk the attacker's steps** through each state transition.
- Lesson from the re-review (V2-01, V2-02): when a protocol depends on third-party library behaviour (error propagation, transactionality), verify that behaviour **at the source level before ratifying the design**, rather than deferring it to a later spike.
- Development is **frontend-first** (ARCHITECTURE §36). Build UI against `@blacklist/contracts` and mocks; do not start backend production features before Phase 7 is authorized.
- Normative protocols live in `docs/design/*.md`. When changing behaviour there, update the summaries in ARCHITECTURE.md and ARCHITECTURE-ESSENTIALS.md in the same change.
