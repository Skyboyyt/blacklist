# AGENTS.md — Blacklist Engineering Rulebook

**This is the canonical engineering rulebook for every coding agent (Claude, Codex, and any future agent) and for human contributors.** Agent-specific files (e.g. `CLAUDE.md`) may add role notes but must never contradict this file. If they do, this file wins and the conflict must be reported.

---

## 1. Project status

- **Current status (2026-10-16).** Detail and evidence live in `AI_HANDOFF.md`; this block is the summary.
  - **Frontend (Phases 1–6):** implemented on contracts and mocks and merged. The Phase 6 owner sign-off is not yet recorded.
  - **Phase 7 (Backend Foundation):** authorized 2026-10-13 and merged to `main` (PRs #8–#11). Its exit criteria are not closed: an independent (non-implementer) security review is still open. ADR 0013 was accepted on 2026-10-16 (P-13 open).
  - **Phase 8 (Chain Data & Research):** authorized 2026-10-14 and merged to `main` (PR #12) on the owner's explicit instruction despite disclosed blockers. Research is off by default (`RESEARCH_ENABLED=false`); the owner authorized turning it on for **staging** on 2026-10-17 (ADR 0018); ADR 0018 is accepted provisionally (2026-10-16) and O-3 is open.
  - **Owner decisions 2026-10-16:** member passwords 12, staff 8 (ADR 0016, amended); public member sign-up with a recorded staging-data risk acceptance (ADR 0019 superseded; the invite gate is opt-in).
  - **Public foundation:** the Vercel web app, Render API and worker, and the Neon staging database went public on the owner's explicit instruction (2026-10-13). This is **not** production readiness; Phase 11 launch gates (legal, retention, recovery, monitoring) remain.
  - **Claude's review** of Phases 7–8 and its follow-up fixes: [docs/reviews/2026-10-15-claude-phase7-8-review.md](docs/reviews/2026-10-15-claude-phase7-8-review.md).
  - **Phase 9a (Reports & Moderation Backend, without image evidence):** authorized by the owner on 2026-10-16. Phase 9 work may merge before the Phase 7 independent security review (owner waiver, recorded in AI_HANDOFF). Phase 9b (isolated image processor and object storage) needs an accepted hosting ADR first.
  - **Phase 9a** is merged and deployed (PRs #17, #18, #20); the owner applied 0006 and 0007 on Neon staging and enrolled the first staff admin (2026-10-17).
  - **Phase 10 (Risk Engine & Admin Backend):** authorized by the owner on 2026-10-17. The plan is in [docs/phase10-plan.md](docs/phase10-plan.md). Public risk bands: the owner approved O-12 **for staging only** on 2026-10-18 (`RISK_PUBLIC_BANDS=true` on the Render API); production calibration stays open. Automatic analysis scoring on staging (two-provider confirmation, Infura as the second Ethereum provider) was accepted the same day ([ADR 0021](docs/adr/0021-automatic-scoring-and-second-ethereum-provider.md)).
  - **Phase 11 (Integration, Hardening & Launch Readiness):** authorized by the owner on 2026-10-17. The plan is in [docs/phase11-plan.md](docs/phase11-plan.md); it ends when the owner signs [docs/launch-checklist.md](docs/launch-checklist.md). A production environment still needs an owner instruction (O-4).
  - **Phase 9b (image evidence):** requested by the owner on 2026-10-17; [ADR 0020](docs/adr/0020-phase9b-evidence-hosting-on-staging.md) accepted for staging (test images only). The plan is in [docs/phase9b-plan.md](docs/phase9b-plan.md). Built for new reports and staff download; the owner switches it on from [the runbook](docs/operations/2026-10-17-phase9b-evidence-setup.md) (storage account, processor service, migration 0011).
  - **Not authorized:** a production environment, paid resources, cloud migrations, provider activation (except the free Infura secondary on staging, ADR 0021), `activity_stream`.
  - **Owner instructions recorded in AI_HANDOFF** (direct pushes or merges to `main`, going live) applied to those occasions only; the ordinary Git, architecture and security rules below are unchanged.
- **Execution is frontend-first** (owner decision; ARCHITECTURE.md §36):
  - Phases 1–6 build and review the primary frontend against `@blacklist/contracts` and a typed mock client.
  - Phase 7 (Backend Foundation) starts with the backend acceptance gates (D1–D9, S1–S17).
  - Backend production features must not be built during frontend phases.
  - Narrow validation spikes need explicit owner authorization, must stay isolated and labelled, and never replace the gates.
  - Mocks confer no authority and never make authorization decisions.
- **No production feature may be implemented until the project owner explicitly authorizes a phase.** Phases are defined in ARCHITECTURE.md §36. The current authorized phase is recorded in `AI_HANDOFF.md`.

## 2. Roles

| Role | Holder | Responsibilities |
|---|---|---|
| Project owner | Human owner | Final authority on product, architecture approval, phase authorization, open decisions |
| Primary engineer | **Claude** | Architecture, standards, repository structure, security model, documentation, implementation, architectural consistency, reviewing proposed ADRs |
| Secondary engineer / reviewer | **Codex** | Code and architecture review, testing, bug finding, security review, implementing assigned tasks within the approved architecture |

Claude remains primary engineer unless the owner explicitly changes it. Codex does **not** independently redesign approved architecture during ordinary work (see §6).

## 3. Before any substantial work

1. Read [PRD.md](PRD.md).
2. Read [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md) (and the relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md)).
3. Read [AI_HANDOFF.md](AI_HANDOFF.md) — current phase, open work, known issues.
4. For identity, moderation or chain-data work, read the normative design document: [docs/design/identity.md](docs/design/identity.md), [docs/design/moderation.md](docs/design/moderation.md), [docs/design/chain-data.md](docs/design/chain-data.md). They are the single source of truth for their protocols.
5. Inspect the existing code and docs related to the task. **Never assume something is missing without searching for it.**
6. For security-relevant work, read the affected threats in [THREAT-MODEL.md](THREAT-MODEL.md).

## 4. Workflow

**Plan → Inspect → Implement → Test → Security Check → Document → Update Handoff**

| Step | Required output |
|---|---|
| Plan | Short plan: goal, affected modules, risks, tests to add. Flag anything that conflicts with the architecture **before** coding |
| Inspect | Existing code, conventions, tests, related ADRs |
| Implement | Smallest change that meets the goal, matching surrounding code style. No unrelated refactors |
| Test | New/updated tests; full relevant suites pass locally. Bug fixes start with a failing test |
| Security check | Walk the checklist in §9; note affected threat IDs |
| Document | Update docs/ADRs/data model/threat model when behaviour, schema, or boundaries change |
| Update handoff | Update `AI_HANDOFF.md` (§11) |

## 5. Non-negotiable product principles

1. **Association does not equal guilt, and transfer direction does not equal authorization.** Never encode interaction-with-flagged-address or "sent funds to" as guilt. `unknown` authorization contributes nothing. V1 has no association signals.
2. **Preserve provenance:** `chain_fact`, `platform_analysis`, `community_allegation`, `moderator_finding`, `ai_observation`, `external_source`. Never blur them in data, APIs, or UI.
3. **Risk Score 0–100, higher = more risk.** Never "safe", never "trust score". Weak signals never add to strong evidence; Severe needs an independently approved severe finding.
4. **History is preserved.** Append-only tables are never updated or deleted by application code; past assessments are never recomputed with new rules; delayed jobs never resurrect non-authoritative state.
5. **Never request seed phrases, private keys, or recovery phrases; never custody funds; never request transaction, `eth_sign`, or typed-data signatures.**
6. **Private stays private:** account details, sessions, security events, draft and pending reports, reporter identity, standing claims, research activity (and, when introduced, watchlists, private labels, investigations, wallet links).
7. **Unreviewed reports have no public effect.** No counts, indicators or score changes.
8. **No credential before mailbox proof; no bearer token in queues or logs; no staff power without WebAuthn.** ([identity design](docs/design/identity.md))

## 6. Architecture changes (ADR process)

- The approved architecture is ARCHITECTURE.md + ARCHITECTURE-ESSENTIALS.md + docs/data-model.md + accepted ADRs.
- **Never silently change architecture.** Any change to stack, boundaries, data model semantics, security model, auth/authz design, risk rules, or provider abstraction requires an ADR in `docs/adr/` (template: `docs/adr/0000-template.md`).
- **Codex** (or any agent) that finds a serious architecture problem writes an ADR with status **Proposed** containing: **Problem, Evidence, Impact, Proposed solution, Alternatives**. It does not implement the change.
- **Claude** reviews proposed ADRs and recommends accept/reject; the **owner** approves. Only accepted ADRs may be implemented. ARCHITECTURE.md is then updated to match.
- Minor clarifications that don't change behaviour (typos, examples) don't need an ADR.

## 7. Engineering rules

### General
- Never unnecessarily rewrite working systems. Prefer targeted changes.
- Match existing conventions (naming, structure, comment density).
- No dead code, commented-out code, or speculative abstractions.
- TypeScript strict; no `any` (use `unknown` + validation); no non-null assertions to silence errors; no `@ts-ignore` without a linked issue and explanation.
- Validate all external input with Zod at the boundary (HTTP, jobs, provider responses, env).
- Respect package boundaries (ARCHITECTURE.md §4.3). The web app never imports server-only packages.

### Language, file-type and module separation (owner requirement)
- Use framework-appropriate file types:
  - React/Next UI → `.tsx`; TypeScript logic → `.ts`;
  - styling → Tailwind classes and approved CSS files; raw SQL and migrations → `.sql`;
  - data and config → `.json`, `.yaml`/`.yml`; environment → `.env*` (placeholders only in `.env.example`); documentation → `.md`.
- **Do not create standalone HTML files.** Next.js renders pages.
- **Do not introduce additional programming languages** without an accepted ADR.
- **Never create monolithic files mixing responsibilities.** UI, styling, API handlers, business logic, authentication, database access, blockchain provider code, validation and infrastructure each belong in their own module per ARCHITECTURE-ESSENTIALS.md §2–§3 and §16.
  - A route file holds no business logic or SQL.
  - A component holds no data-access or authorization policy.
  - A provider client holds no domain rules.
- A file that keeps growing or has several unrelated reasons to change must be split along these boundaries.

### Security
- Authorization is server-side, default deny, checked at route **and** domain level. Frontend visibility never determines authorization.
- Never trust client-supplied roles, owner IDs, or statuses.
- Never weaken security to make implementation easier (no disabled CSRF checks, relaxed CSP, broadened CORS, skipped validation, or wider DB grants "for now").
- No raw HTML rendering of user or chain-derived text.
- Parameterized SQL only.
- Never fetch user-supplied URLs.

### Secrets
- Never commit: private keys, seed phrases, production credentials, RPC/provider secrets, database credentials, authentication secrets, `.env` files.
- Use environment variables / the platform secret store. Add new variable **names** to `.env.example` with placeholders only.
- Never print, log, echo, or paste secret values (including in chat transcripts, PR descriptions, test fixtures, or error messages).
- If a secret is exposed: stop, tell the owner, and treat it as compromised (rotation required).

### Dependencies
- Never introduce a dependency without justification (docs/dependency-policy.md). Prefer the standard library and existing dependencies.
- Never change pnpm security settings (`minimumReleaseAge`, `trustPolicy`, `strictDepBuilds`, `saveExact`, `allowBuilds`) without owner approval.
- Toolchain baseline (ADR 0007): Node.js 24 LTS only, TypeScript 6.x, pnpm 12.7.0. Changing any of them requires an ADR.
- Better Auth runs headless: never mount its HTTP handler; never enable plugins (the bearer, JWT and session-conversion plugins are explicitly forbidden), its cookie cache or its rate limiter; never use its sign-up, email-verification, change-email or password-reset flows; never authenticate from raw session tokens or expose token fields (ADR 0001 / 0008, E-1 mitigations M1–M10).
- Never treat a callback return as email delivery. Security tokens become redeemable only after the delivery layer reports `accepted_for_delivery` (identity §8).
- Never show the numeric risk score publicly in V1 (P-11), and never present inactive weak-signal scoring as V1 behaviour.

### Database
- Schema changes only via committed, reviewed migrations. Never `drizzle-kit push` to shared databases. Never modify an applied migration; add a new one.
- Follow expand → migrate → contract for breaking changes.
- Update docs/data-model.md with every schema change.

### Tests
- Never disable, skip, or weaken tests to make the build pass. If a test is wrong, fix it and explain why in the PR.
- Auth/authz/evidence/risk/audit changes require negative tests.
- Every new route is added to the authorization matrix.

## 8. Git rules

- Work on branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `adr/…`. Never push directly to `main`; never force-push shared branches.
- Small, focused commits with descriptive messages (imperative mood). Reference ADRs/threat IDs where relevant.
- Commit or push only when the owner (or the task instructions) asks for it.
- Never commit generated secrets, local databases, uploads, build output, or IDE state (`.gitignore` helps but is not sufficient — check `git diff --staged`).
- PRs use `.github/pull_request_template.md` and include test evidence and the security checklist.

## 9. Security checklist (every PR)

- [ ] Authorization: route policy declared; domain policy checks ownership/state; matrix test updated.
- [ ] Input validated (Zod) and unknown fields stripped; output via allowlisted DTO.
- [ ] No private data in public responses, logs, notifications, or caches.
- [ ] No secrets in code, tests, fixtures, logs, or docs.
- [ ] Provenance preserved for any claim/signal/label.
- [ ] Risk invariants unaffected (or tests updated with ADR approval).
- [ ] Rate limits/quotas considered for new endpoints.
- [ ] New dependency justified (or none added).
- [ ] Migration reviewed (locks, rewrites, grants, append-only, privacy).
- [ ] No bearer token or token-bearing link in job payloads, logs, errors or analytics; exact-Origin policy applies to new mutations.
- [ ] Delayed jobs check expected revision/state before acting (no resurrection).
- [ ] Files respect language/module separation (no mixed-responsibility files, no standalone HTML).
- [ ] Affected threat IDs listed; THREAT-MODEL.md updated if needed.

## 10. Codex review protocol

When reviewing (code, architecture, or tests), Codex:

1. Reads the documents in §3 and the diff/target.
2. Checks correctness, security (THREAT-MODEL.md §8 invariants first), authorization, privacy, provenance handling, test coverage, boundary and file-separation violations, dependency additions, and consistency with the architecture and design documents. Security protocols are reviewed by **walking the attacker's steps**, not only by checking document consistency.
3. Writes findings to `docs/reviews/YYYY-MM-DD-<topic>.md` using the format in `docs/reviews/README.md`: ID, severity (Critical/High/Medium/Low/Info), location, evidence, impact, recommendation.
4. For architectural concerns, opens a **Proposed** ADR instead of changing the design.
5. May fix clear, local bugs within the approved architecture when asked to implement; must not refactor or redesign beyond the finding.

Claude responds to each finding (fixed / won't fix with reason / ADR proposed) and records the outcome in the review file and `AI_HANDOFF.md`.

## 11. Handoff protocol

At the end of every working session, the active agent updates `AI_HANDOFF.md`: last agent, phase, completed work, current work, files changed, migrations, tests and results (real output, not assumed), known bugs, security concerns, decisions made, deferred decisions, unfinished work, recommended next step. Report outcomes faithfully — if tests were not run, say so.

## 12. Prohibited actions

- Starting a phase without explicit owner authorization.
- Deploying, purchasing infrastructure, configuring paid services, or creating cloud resources without explicit owner instruction.
- Accessing production systems or real user data.
- Redesigning approved architecture without an accepted ADR.
- Rewriting history on shared branches; deleting other agents' work without agreement.
- Weakening security, privacy, or test coverage.
- Anything in ARCHITECTURE-ESSENTIALS.md §16 (prohibited patterns).

## 13. Definition of done

A change is done when: it meets the task; tests (including negative/security tests) pass; lint and type checks pass; the security checklist is complete; docs/ADRs/data model/threat model are updated as needed; `AI_HANDOFF.md` is updated; and the change has been reviewed (Codex review for security-sensitive paths, owner approval for merges to `main`).
