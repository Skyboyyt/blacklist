# Blacklist

**Blacklist** is a Web3 anti-scam, wallet-intelligence, project-verification and blockchain-investigation platform. It helps people research crypto projects, wallets, transactions, tokens and contracts before making decisions. It gives victims, researchers and affected parties an evidence-based, accountable way to report, review and contest suspicious activity.

Core principles:

- **Association does not equal guilt, and transfer direction does not equal authorization.**
- Blacklist always distinguishes blockchain facts, Blacklist analysis, community allegations, moderator-verified findings, AI observations and external sources.

## Current status

> **Phase 5 implemented on mocks and reviewed; six findings repaired on `fix/frontend-review-findings`. Remaining Phase 6 quality checks and documented gaps are pending. No backend exists; backend foundation begins in Phase 7.**
>
> This repository contains the product requirements, architecture (revision 3), normative design documents, a threat model, engineering rules and ADRs. The frontend includes a design system, application shell, research previews, Phase 2 account and security screens, Phase 3 project directory and profile pages, Phase 4 staff review screens, and Phase 5 member submission flows connected to staff review on a shared demo store, responses, emergency suspension and an administrator console, running on typed contracts and a **mock adapter with fictional data** ([docs/design/frontend.md](docs/design/frontend.md)). **No real data, accounts or assessments exist.** Do not deploy this repository.
>
> **Development is frontend-first.** After Phase 0 closes:
> 1. Phases 1–6 build and review the primary frontend against typed contracts and mocks.
> 2. Phase 7 (Backend Foundation) begins backend work with security and database acceptance gates.
>
> See ARCHITECTURE.md §36.

## Repository structure

```
apps/
  web/                 Next.js UI on typed contracts and mocks
  api/                 Fastify HTTP API + operator CLI (planned)
  worker/              pg-boss background jobs (planned)
  evidence-processor/  Isolated image sanitizer: no DB, no secrets (planned)
packages/
  core/          Shared primitives (chain/address types, provenance, risk bands): contract types exist
  contracts/     Zod API schemas for the web and future API
  domain/        Server-only business logic modules (planned)
  db/            Drizzle schema and SQL migrations (planned)
  chains/        Blockchain abstraction (Solana + EVM): contract types exist
  config/        Server-only env validation for api/worker (planned)
  testing/       Test harnesses and provider fakes (planned)
tests/e2e/       Playwright end-to-end tests against mocks
infrastructure/  Local dev services and future deployment config (planned)
docs/            Design documents, data model, testing, dependencies, ADRs, reviews
```

## Documentation map

| Document | Purpose |
|---|---|
| [AI_HANDOFF.md](AI_HANDOFF.md) | Current phase, authorization state, decisions pending — **read first** |
| [PRD.md](PRD.md) | Product requirements, V1 / Post-V1 / Future scope, product decisions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture (rev 2), decision log, open decisions, phases, hard questions |
| [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md) | Short binding reference for coding agents |
| [docs/design/identity.md](docs/design/identity.md) | Normative: authentication, registration, sessions, security emails, staff lifecycle, Origin/CSRF policy |
| [docs/design/moderation.md](docs/design/moderation.md) | Normative: finding revisions, approvals, severe rules, standing, appeals, independence |
| [docs/design/chain-data.md](docs/design/chain-data.md) | Normative: transfer authorization semantics, snapshot-bound verification, sanctions design |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Assets, boundaries, 57 threats, 19 test-backed security invariants |
| [AGENTS.md](AGENTS.md) | **Canonical engineering rulebook** for all agents and contributors |
| [CLAUDE.md](CLAUDE.md) | Claude's role notes (imports AGENTS.md) |
| [docs/data-model.md](docs/data-model.md) | Entity catalog and data rules |
| [docs/testing-strategy.md](docs/testing-strategy.md) | Test layers, adversarial suites, Foundation acceptance spikes |
| [docs/dependency-policy.md](docs/dependency-policy.md) | Dependency rules and planned register |
| [docs/adr/](docs/adr/README.md) | Architecture Decision Records 0001–0011 (0009–0011 Proposed) |
| [docs/reviews/](docs/reviews/README.md) | Codex reviews and Claude's responses |

## Development prerequisites (from Phase 1, frontend first)

- **Node.js 24 LTS** (`.nvmrc`; `engines` enforces `>=24.20.0 <25`). Node 25/26 are not supported until an ADR adopts them.
- **pnpm 12.7.0** (pinned in `packageManager`). Node 25+ no longer ships Corepack; install pnpm with `npm install -g pnpm@12.7.0` or pnpm's standalone installer.
- **TypeScript 6.x** (installed as a dev dependency in Phase 1).
- Docker is needed from Phase 7 (backend) onward.
- Docker (local PostgreSQL, MinIO, Mailpit; Testcontainers), from Phase 7.
- Git.

## Future setup (not yet functional)

Once the relevant phases are authorized and implemented (frontend from Phase 1, backend services from Phase 7):

```bash
pnpm install --frozen-lockfile        # supply-chain policies enforced by pnpm-workspace.yaml
cp .env.example .env                  # local placeholders only — never real credentials
docker compose -f infrastructure/local/compose.yaml up -d
pnpm db:migrate                       # planned script
pnpm dev                              # planned script
```

These commands do not work yet.

## Security warning

- **Never commit secrets.** `.env` files, private keys, seed phrases, provider keys and credentials must never enter the repository. `.gitignore` is not sufficient: use gitleaks and GitHub secret scanning with push protection. A leaked secret must be **rotated**, not just deleted.
- **Blacklist never asks for seed phrases, private keys or recovery phrases, never takes custody of funds, and never asks anyone to sign a transaction or typed data.** Treat anything claiming otherwise as phishing.
- Report suspected vulnerabilities privately to the project owner. A formal disclosure policy will be added before launch.

## Engineering workflow (Claude + Codex)

- **Claude** is the primary engineer: architecture, standards, implementation, architectural consistency.
- **Codex** is the secondary engineer: review, testing, bug finding, security review. It raises architecture concerns through **Proposed ADRs**.
- The **project owner** approves architecture, decides open questions and **explicitly authorizes each phase**.
- Every agent follows [AGENTS.md](AGENTS.md): **Plan → Inspect → Implement → Test → Security Check → Document → Update Handoff**.
