# AI_HANDOFF.md

Read this first at the start of every session, and update it at the end (AGENTS.md §11). Report results faithfully: if something was not run, say so.

This file holds the **current state only**. Each session adds one short entry under "Session log" and links to its evidence. The full history up to 2026-10-15 (Phases 0–8, every Claude and Codex session) is preserved unchanged in [docs/handoff-archive/AI_HANDOFF-to-2026-10-15.md](docs/handoff-archive/AI_HANDOFF-to-2026-10-15.md).

---

## Status

| Field | Value |
|---|---|
| Project | **Blacklist**: Web3 anti-scam, wallet intelligence, project verification and investigation platform |
| Canonical branch | `main` (PRs #8–#14 target it). `chore/initial-repository` is an older ancestor. The GitHub default branch and Vercel production branch should be switched or recorded by the owner (review CR-12/G-8) |
| Frontend | Phases 1–6 implemented on contracts and mocks and merged. **Phase 6 owner sign-off not recorded** |
| Phase 7 (Backend Foundation) | Authorized 2026-10-13, merged (PRs #8–#11). Acceptance gates D1–D9 and S1–S17 recorded as passing by Codex. **Exit not closed:** independent security review; ADR 0013 |
| Phase 8 (Chain Data & Research) | Authorized 2026-10-14, merged (PR #12) on explicit owner instruction despite disclosed blockers. **Research is off** (`RESEARCH_ENABLED=false`). ADR 0018 Proposed; O-3 open |
| Deployment | Free staging services are public on explicit owner instruction (2026-10-13): Vercel web, Render API and worker, Neon PostgreSQL 18 staging database. **Not production-ready**; Phase 11 gates (legal, retention, recovery, monitoring) remain |
| Authorized now | Review follow-up fixes inside the approved design (owner: "do it", "continue", 2026-10-15). **Not authorized:** Phase 9 or later, paid resources, cloud migrations, provider activation |
| Primary / reviewer | Claude / Codex |
| Last agent | Claude: Phase 7–8 review and follow-up fixes (PR #14, open) |
| Last updated | 2026-10-15 |

## Open work, by owner

**Owner decisions**
1. ADRs 0013–0018: Claude's recommendations are recorded in each ADR (0016 is accepted only with conditions).
2. Record the Phase 6 sign-off, Phase 7 closure, and waivers for the Phase 8 merge and going live (review CR-11).
3. Real-user data in staging: restore a registration gate, or record risk acceptance (CR-10).
4. Set `CLIENT_IP_FORWARDING_TOKEN` (an independent secret) on the Vercel web project and the Render API, so the CR-01 fix takes effect.
5. ADR 0017 wake design: the public worker health check can burn free quotas (CR-04).
6. A human verifier (O-6): without one, five failures on one email lock that account for 15 minutes.
7. Pagination model; correction and response status sets; `staff:recovery:verify` in ARCHITECTURE §9.2; `research_cache` (data-model or ADR).
8. Canonical branch (above); CI workflow (none exists).

**Codex**
1. An independent security review of Phase 7 and of PR #14 (CR-11). R-04 is the priority.
2. CR-07 for Solana: raw instruction encoding for the instruction digest.
3. CR-14 D-3 to D-5: grants in migrations, enum CHECKs, migration-safety style.

**Claude**
1. CR-05: a real bundled common-password list, pending an owner-approved source.
2. Responses still pending in earlier review files (see review CR-11).

## Session log

### 2026-10-15: Claude, Phase 7–8 review and follow-up (PR #14)

- **Review:** [docs/reviews/2026-10-15-claude-phase7-8-review.md](docs/reviews/2026-10-15-claude-phase7-8-review.md), CR-01 to CR-15. ADR recommendations are recorded in ADRs 0013–0018.
- **Fixed:**
  - CR-01: verified per-visitor client IP behind the gateway (inactive until the secret is set).
  - CR-02: re-authentication throttle.
  - CR-03 (part): RPC budget window.
  - CR-06: reverts and item failures no longer trip the circuit; non-tokens are reported as such.
  - CR-08: `delegated` labelling.
  - CR-15: password-change rejections, error mapping per api-integration-contracts §7, HTTPS for the internal URL, and a separate recovery-verification rationale (identity §10.11; Chromium E2E for recovery and admin: 52 passed, 14 skipped by design).
  - CR-12: documentation consistency pass (AGENTS §1, ARCHITECTURE header and stack table, ESSENTIALS, THREAT-MODEL, data-model, chain-data deviation note, ADR index, ADR 0001 supersession note, README, phase7-acceptance, dependency policy).
  - CR-13: this handoff reset, with the history archived.
- **Database work (2026-10-15, Docker started in this environment):**
  - CR-03 receipts are written only for verification reads.
  - CR-07: the EVM digest uses only the spec fields.
  - CR-14 D-1: invalidation guard migration `0005_invalidation_guard.sql`.
  - CR-14 D-2: single `migrations/order.json`.
  - CR-15.2: token pre-check before password work.
- **Actual checks (last full run):**
  - `pnpm check` exit 0: 81 contract, 69 chain, 54 backend non-database and 411 web tests, plus format, lint, types and Next build.
  - Backend-acceptance typecheck passes.
  - Chain coverage: 81.72% branches against the 75% floor.
  - `build:mock` and `check:mock-exclusion` pass, 4/4.
  - `pnpm audit --prod` is clean. The full audit has one high, dev-only advisory (`braces`).
  - **Backend coverage run, including all database integration tests: 39 files and 194 tests passing; 83.61% branches; all floors pass.** The browser-dependent tests needed `/usr/bin/chromium`, which I symlinked to the pre-installed Chromium (an environment change, not a repo change).
  - Chain coverage: 81.93% branches.
  - **Not run:** anything against Render, Vercel, Neon or providers. The new migration has not been applied in the cloud.
- **Next:** owner decisions 1–4 above; Codex runs the integration suite on PR #14.
