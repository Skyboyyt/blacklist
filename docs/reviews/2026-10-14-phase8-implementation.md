# Review: Phase8 chain research implementation and security

| Field | Value |
| --- | --- |
| Implementer / reviewer | Codex; independent Claude review pending |
| Date | 2026-10-14 (Europe/London) |
| Scope | `feat/phase8-chain-research`, based on main `5967afa6eee30c5359b9a9f26a1c6bd79f543772`; review publication only |
| Documents read | AGENTS, CLAUDE, AI_HANDOFF, PRD, architecture/essentials, THREAT-MODEL, normative chain-data/identity/moderation, accepted relevant ADRs, frontend/API/data model/dependency/testing contracts |

## Summary

Registry, Ethereum/Solana normalization and RPC capability adapters, bounded routing, immutable receipt/snapshot storage and typed non-mock research integration are implemented locally. Existing Phase7 identity, worker, database, frontend mock workflows and cloud settings are preserved. Phase8 is **not implementation-complete or approved for deployment**: both protected provider keys are missing, O-3/Claude review and actual Alchemy Free entitlement/terms/archival/independent-secondary evidence remain open, and required backend coverage/full dependency audit still fail. No real provider success, hosted identity completion, cloud migration, merge, deployment or production readiness is claimed.

## Requirement and evidence map

| Requirement | Actual status | Implementation / validation evidence |
| --- | --- | --- |
| Latest repository/Phase7 state | Tested | GitHub readback: main5967afa, PR7 Phase6 repairs and PR8–11 merged; no open issues/PRs before Phase8 publication. Existing dirty menu-audit files, branches and preservation stash retained. GitHub default remains `chore/initial-repository` |
| Approved stack / boundaries | Implemented, tested | Existing Node24.21/pnpm12.7/TS6/Fastify/Drizzle/pg/pg-boss retained; module separation and full lint/type checks. Server-only viem2.57.3/Solana kit8.4.0 pins, frozen install, supply-chain policies unchanged |
| Ethereum and Solana mainnet normalization | Implemented, tested | Registry/identity fixtures: explicit CAIP-2 network, strict EIP55, lowercase EVM storage/checksum display, case-preserved32byte Solana addresses/64byte signatures, integer strings |
| O-3 provider selection | Blocked | Owner approved Helius/Alchemy Free direction. ADR0018 Proposed; Helius official pricing/RPC200 and FreeUSD0/1Mcredits/10RPS evidence; Alchemy current pricing/docs403. Official Alchemy GitHub SDK protocol verified, not actual plan access. Both keys absent; independent sources/archival/same-slot/terms evidence pending |
| Real-provider client implementation | Implemented; live validation blocked | Fixed Alchemy Ethereum/Helius Solana HTTPS clients and mainnet handshakes behind disabled flags. Source tests use validated synthetic JSON-RPC. Official Solana genesis-only probe200 is evaluation evidence, not approved Helius/Alchemy adapter validation |
| Wallet and transaction research | Implemented, tested locally | Both source adapters/API/domain/PG transaction and wallet reads. Execution status, fees, block/slot/hash/finality, native balances, public facts and neutral transfer authorization. Real provider lookups untested |
| Wallet history / incoming-outgoing | Implemented with explicit limits, tested locally | Alchemy directional transfer index, receipt/canonical block checks,1–25pages and opaque page keys. Solana address signatures1–100; directional1–25decoded transfer filtering. No complete associated-token-account/internal-call/archival history claim; pruned/unsupported/failure remains distinct |
| Supported token/contract information and balances | Implemented, tested locally | Canonical ERC20-compatible metadata/code hash; classic SPL mint/authorities/balances. Ethereum token discovery (separate default-off verified-plan flag) followed by canonical same-block balanceOf/decimals for at most10assets; indexer amounts never displayed. Token2022 extension inventory, NFT decoding, explorer verification/proxies/deployment history remain unavailable |
| Safe RPC behavior / performance | Implemented, tested | Fixed origins/read methods, validated ID/envelope/output, fatal UTF8/lossless integer tokens,2/4MiB caps, cancellation/deadlines, at most2budget-aware retries/RetryAfter, per-key quotas/concurrency, circuits/failover,500entry/15second/60seconddegraded cache and16flights. Per-consumer cancellation, immutable clone cache, credential reflection refusal |
| Snapshot and receipts | Implemented, tested | Exact EVM canonical hash/height; Solana signature/slot or identical returned context slot. Digest/spec/decoder/chain/subject/method/provider/group/finality checks; same/unknown upstream never corroborates. Different snapshots remain inconclusive, conflict withheld, pending never eligible for pins |
| Schema / migration / immutability | Implemented, tested in disposable PG18 only | Seven new tables, two additive migrations, unchanged seven old SQL files; nine ledger entries/34 tables; empty/idempotent/restore tests. Runtime DDL/TEMP/TRUNCATE/mutation denied, immutable triggers, finalized independent pins and transfer-row guards. SQL batches and actual domain persistence failure roll back; retry idempotent |
| Mock-free frontend research | Implemented, tested locally | Server-only typed GET client, strict public contracts, source/freshness/finality/coverage/degraded views and history/token/contract/balance details. Invalid/unavailable data never becomes mock success or zero findings. Original UI/mock journeys retained; dashboard search/account fallback and honest not-available menu states |
| Authentication / private-resource regression | Tested locally; hosted success still open | Existing real-PG/SMTP/browser identity suites plus public/internal route matrix, private401/hidden404, forged peer/cookie/internal tokens, parameter/checksum/explicit-network/rate denials. No new private history, watchlist, staff authority or account-wallet association |
| Moderation / risk / provenance | Preserved | No scoring or association inputs, accusation, finding, moderation publication, appeal/reversal mutation or automatic permanent pin. Transfer movement/evidence/authority separate; invalid availability DTOs cannot carry verdicts/records |
| Secrets / dependency security | Tested locally with remaining audit risk | Protected API-only key whitelist; worker/web/build isolation, static bundle exclusion, pinned redacted scanner. Production audit0; full audit1high development braces advisory. Final scanner/publication evidence recorded below |
| Deployment / live compatibility | Pending approval; not deployed | Render/Vercel/Neon/Resend untouched, research off by default. Branch-specific Vercel deployment disabled before review push; Render auto-deploy alreadyoff. No Phase8 SQL on Neon; live source038ed7f retained |

## Automated checks

Final command outcomes and counts are recorded in `docs/evidence/2026-10-14-phase8-validation.json` and the latest AI_HANDOFF entry. Commands actually executed include frozen install, root format/lint/types/unit suites, Next production/mock builds, backend builds, full backend integration, expanded required backend coverage, separately enforced chains75% coverage, contract/UI focused negatives, production/full audits, bundle exclusion and desktop/mobile Chromium. Pending runs are not passes; earlier failures are retained in the evidence and corrected reruns are identified. Firefox/WebKit/live-provider/live-hosted-browser/manual assistive-device and managed cloud recovery checks remain untested.

The initial full backend run failed10cases: hardcoded seven/27 migration expectations, operator grant expectations, cascading fixture initialization and one incorrectly expected500instead of established503. Counts now require exactly9/34 and updated immutable/read-only permissions without relaxing ledger hashes/denial assertions. The corrected full run passed55tests. Later transaction integration caught an actual finalized Ethereum receipt carrying `latest`; correction records finalized proof from the canonical finalized head and retains requested commitment in query parameters. That integration rerun passed. An overlapping coverage run was refused by the report-directory lock; reruns are sequential. Source helper/type/lint/format/fixture mistakes were fixed and rerun, never reported as passing zero-test runs.

Final root checkpoint: `pnpm check` PASS,588assertions (chains56/contracts81/backend46/web405), full lint/types/format and Next production build. Backend build and frozen install PASS. Subsequent backend-only receipt/pin binding to the full normalized transaction passed56chain assertions and5migration/storage/API assertions; positive/negative movement guard2assertions PASS. Chains branch floor PASS80.24%/75. Complete backend checkpoint55PASS, changed-path final reruns separately recorded. Complete Chromium desktop/mobile418PASS/0FAIL/82intentional skips,19.6minutes; production/mock builds and4bundle exclusions PASS. Drizzle drift check PASS. Source Gitleaks0; history37commits4previous fictional/prose matches/rawexit1/0new; protected values6/804files/0matches. Production audit0/full audit1high. All results are local, not hosted real-provider validation.

Required backend coverage clean sequential rerun:55assertions PASS, commandFAIL60.04%/75% plus package floors. The maintained toolchain also fails to parse/remap five unimported TypeScript entry/operator files (`packages/config/src/staging-operator.ts`, `packages/db/src/staging-operator.ts`, API/worker main and staff CLI), automatically omitting them from that report. No exclusions were added; this is a measurement limitation requiring repair, not proof those files are covered. Prior concurrent runs additionally produced one resource-contention storage timeout and a stale-loaded DTO assertion; the clean sequential run passed all assertions. Do not describe coverage as complete or passing.

## Security findings and remaining risks

### P8-01 — Live provider and independent-source gates open

- Severity: High (release blocker); category: architecture/provenance/availability.
- Location: ADR0018, research runtime configuration, provider capability sources.
- Evidence: both key bindings absent; Alchemy account quota/archive/terms unknown; runtime uses conservative `unknown-upstream`, no independently documented secondary. Synthetic fixtures can exercise receipt rules but do not establish real provider agreement or history access.
- Impact: cannot meet real-provider completion criteria, verify historical facts independently, guarantee plan limits/availability or safely activate scoring/pinning.
- Recommendation: securely bind both Free keys, complete actual O-3 matrix/Claude review, run read-only probes and fault/same-snapshot tests against independently documented sources; keep flags disabled until authorized.
- Response (Claude): pending.

### P8-02 — Required backend branch coverage fails

- Severity: High (existing security-gate blocker); category: test coverage.
- Location: maintained backend coverage config and identity/access/audit/staff/DB/API/worker modules.
- Evidence: required floors remain enforced and failing; new chain package exceeds its75% branch floor. The expanded maintained command includes new research/storage security tests without deleting previous files or exclusions.
- Impact: passing assertions/builds cannot establish all documented backend acceptance/security gates.
- Recommendation: retain failure, add meaningful missing security-path tests in separately scoped follow-up; no coverage waiver or production readiness claim.
- Response (Claude): pending.

### P8-03 — Existing development dependency advisory

- Severity: High; category: supply chain.
- Location: `braces@3.0.3` via existing lint tooling, GHSA-vfj7-8cjw-p6xm.
- Evidence: full audit1high; production audit0. No published patched version was available at prior verification; advisory remains unsuppressed.
- Impact: development-tooling attack surface persists; production clean audit does not make the complete dependency policy pass.
- Recommendation: review a policy-compatible upstream repair/replacement with Claude; no scanner suppression or insecure override.
- Response (Claude): pending.

### P8-04 — Incomplete indexing and cold-start/ingress limits

- Severity: Medium; category: performance/correctness/privacy.
- Location: history/balance capability clients and research rate-limit/SSR integration.
- Evidence: directional Ethereum transfer history omits unindexed internal/failed-call activity; Solana address history omits wallet-owned token-account discovery; token inventories bounded. SSR currently shares gateway prefix. Free Render sleeps and live signed-in/idle-cycle/provider logs remain unverified.
- Impact: history is incomplete and expensive queries may fail safely under quotas; multiple visitors can share a throttle; private/public result interpretations require explicit coverage.
- Recommendation: retain incomplete/unavailable states and bounded query budgets; verify end-user prefix propagation without broader trust, actual Free plans/credits/cold starts and next approved indexed capabilities before rollout.
- Response (Claude): pending.

## Migration review / recovery and security walk

Reviewed generated SQL is additive CREATE/new-table indexes/FKs; custom guards seed only two networks and add invoker triggers. Existing seven migration bytes unchanged. SHA256 ledger/time/snapshot/digest/chain/subject/spec/decoder/finality/independence checks were exercised with malformed/shared/unknown/pending/mismatched/wrong-reference cases. Runtime cannot rewrite history, elevate schema roles or TRUNCATE cascades. The entire normalized pinned transaction, including transfers, must equal the compared finalized receipt fields; execution-only equality cannot admit a fabricated movement. Transfer insert must match that verified parent movement; both legitimate inserts and altered/invented ones were tested. Operator verification now requires the exact Phase8 catalog and denies new immutable-table privilege escalation. No password/role regeneration, account seed or cloud operation occurred.

Recovery uses preserved append-only rows and ledger plus forward fixes, not a destructive down migration. Disable research before app rollback and retain new migration/grant tooling; an old migrator's broad DML grants must not be rerun over new tables. Before any future authorized cloud cutover, test restoration into an isolated branch and independently verify managed recovery. Local logical restore is not Neon managed disaster recovery.

Reviewed attack paths: arbitrary RPC/redirect/metadata URL SSRF; wrong JSON-RPC network/ID/envelope/data and credential reflection; unsafe integer/oversized/malformed text; retry/query-budget exhaustion; reorg/canonical identity; fake EVM logs and Solana delegated/CPI fee-payer confusion; same-source/same-value-different-slot agreement; cursor tamper/replay/failover; shared-flight cancellation; private identity/claims in DTO/cache; unconfigured mock success; DB partial writes/pin/transfer divergence; unsafe runtime/cloud grants and branch push deployment. Controls preserve authentication, mailbox proof, delivery acceptance, sessions, staff WebAuthn, severe independent approvals, appeal revisions and reversal barriers. No Phase9/10 backend is added.

## Not reviewed / not tested

Actual Alchemy/Helius request results, paid/free account terms/credits/archive completeness, independent secondaries, provider same-slot guarantees, real-provider failover and production query latency remain blocked. Post-finality invalidation storage is append-only; automatic discovery/reconciliation of pinned facts and its live-provider integration remain unimplemented, with no automatic pin/risk consumption enabled. Hosted valid-token activation/reset/login/logout/session/RP/15minute idle-cycle and external log contents/managed recovery remain Phase7 open gates; invalid-token checks and provider-reported mail delivery do not close them. No real private research, production database, staff onboarding, external file storage or live wallet monitoring was introduced or tested.

## Publication and next step

Implementation `e5cfaec8ee7fc01bd1e96ab95526fe805032af84` is pushed; [draftPR12](https://github.com/Skyboyyt/blacklist/pull/12) is OPEN targeting main with the correct feature head. No GitHub CI/status checks are present. Post-push provider readback found0matching recent Vercel review-branch deployments; canonical/source/settings are unchanged. No merge, cloud SQL, activation or deployment. The publication evidence follow-up is documentation only on the same feature branch.

Commit/push this feature branch and create a draft review PR targeting main; do not merge/deploy. The PR must disclose provider/O-3/coverage/audit/hosted identity blockers. Complete secure key binding and independent Claude/provider review next, then run live read-only capability/snapshot probes and update evidence before any deployment request. Phase9/10 and production readiness are not authorized or established.
