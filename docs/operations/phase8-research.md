# Phase8 research operation and review

Status: local implementation under review; no Phase8 cloud deployment or provider activation. Keep Vercel frontend, Render API/worker, Neon PG18 and Resend unchanged. Claude owns architectural review; [ADR0018](../adr/0018-phase8-provider-selection.md) records the owner's approved Free-provider direction and unresolved O-3 prerequisites.

Latest [continuation report](../reviews/2026-10-14-phase8-continuation.md) supersedes earlier missing-key observations. Saved Render keys actually pass bounded primary mainnet evaluation; the mixed provider/runtime/migrator group has zero service links and must remain operator-isolated. No runtime activation or independent-secondary agreement is established. Use `node scripts/phase8-provider-evaluation.mjs [publicSolanaSignature]` only with protected keys in the isolated probe process for capability evaluation; it does not assert plan verification or change flags/settings. Never write actual values to files/argv. Default public v0 sample demonstrates failed execution; evidence also records a successful v0 with3transfers and a newer unsupported version.

New additive `0004_pinned_transaction_time.sql` brings the local ledger to10, still34tables. It validates pin timestamp equality without editing prior SQL; inconsistent existing rows fail closed and require reviewed recovery. On-demand CLI reconciliation is a domain service only, with independent finalized receipt/ref/snapshot/payload checks and idempotent append-only invalidation. No public operator endpoint, scheduler or actual cloud execution is introduced. Later-phase dependent retractions/review remain required.

Maintained backend coverage runs all tests at repository root with backend-only selection, unchanged75/90floors and complete-map guard. Final189tests/38files PASS/83.57%branches and all required floors PASS; five omissions repaired. Root599units/Nextbuild/lint/types PASS; see continuation evidence for final source reruns. Conflicting finalized receipts are retained atomically for public research and operator reconciliation, without cache/pin/invalidation authority; operator alert delivery still requires approved routing. Owner explicitly authorized PR12 merge despite disclosed blockers, not backend activation or readiness. Runtime health paths `/healthz`; hosted owner flows/live ledger remain unverified.

## Configuration and activation prerequisites

| Variable | Service | Default / meaning |
| --- | --- | --- |
| `RESEARCH_ENABLED` | API only | `false`; no provider clients while disabled |
| `RPC_PLAN_VERIFIED` | API only | `false`; must follow actual account/terms/capability review |
| `ALCHEMY_INDEXED_HISTORY_VERIFIED` | API only | `false`; enhanced Ethereum history separately gated |
| `ALCHEMY_TOKEN_BALANCES_VERIFIED` | API only | `false`; Ethereum token discovery separately gated |
| `ALCHEMY_ETHEREUM_API_KEY` | protected API runtime | Ethereum mainnet Free key; no value in source/browser/logs |
| `HELIUS_RPC_API_KEY` | protected API runtime | Solana mainnet Free key; no value in source/browser/logs |
| `RPC_API_REQUESTS_PER_MINUTE` | API only | 30 per key; requests/retries consume quota |
| `RPC_API_TOTAL_REQUEST_BUDGET` | API only | 100 per process lifetime, resets on restart; not monthly billing protection |

Existing API database/signer/internal/staging/Origin/RP settings stay mandatory. Worker retains its mail/DB settings and gets no RPC credentials. Vercel uses existing server-only `API_INTERNAL_URL`, `INTERNAL_API_TOKEN`, `DEPLOYMENT_ENV`, `STAGING_ACCESS_TOKEN`, `CANONICAL_APP_ORIGIN`; no new browser environment variables. Both provider keys are required before enabling research. Do not copy proxy placeholders into cloud services. Enter actual credentials through their protected settings only.

Before activation: obtain Claude review, verify Free plans and no paid fallback, method-specific credits/retention/archive history, Ethereum EIP1898 support, mainnet identity and fixed origin TLS, and read-only wallet/transaction/history probes with protected keys. Document independent secondary infrastructure separately; current runtime primaries use `unknown-upstream` and cannot authorize independently verified pins. Solana `minContextSlot` is a lower bound, not exact-slot agreement. Identical returned slots are required. Estimated selected provider base cost is USD0 only if actual accounts retain the reviewed Free plans; Alchemy current limits/terms are unverified. No subscription or hosting cost change has occurred.

## Local commands and migration review

From `/workspace/blacklist`, activate the pinned Node24.21/pnpm12.7 shell and use frozen installation. Maintained `pnpm test:backend` creates disposable PG18 fixtures, migrates from empty, reruns the ledger, checks grants and performs logical restore. Never point these fixtures at cloud data.

New migrations are additive; review generated `packages/db/migrations/generated/0005_violet_stardust.sql` and hand `packages/db/migrations/0003_chain_research_foundation.sql` together. They create seven tables and guards, seed two network rows, and do not rewrite/reset/drop existing identity data. Existing grant code is narrowed for new append-only tables. `canonical_json(jsonb)` grants runtime EXECUTE solely for digest validation; it is a pure invoker function, not a privileged data reader. No automated concurrent index or destructive contraction is introduced.

For an explicitly authorized local database only, use existing `pnpm local:init`, `pnpm local:up`, `pnpm local:provision`, `pnpm db:migrate`. Shared/cloud migration requires separate approval, a verified direct non-pooled **migrator** URL with `sslmode=verify-full`, database/branch confirmation and preserved credentials. API/worker remain on `blacklist_app`; neither may migrate or hold operator credentials. No Phase8 SQL has been run against Neon.

Before any later approved cloud application, capture the ledger and a verified restore point/backup, rehearse restoration into an isolated branch, confirm absence of test-account seeds, then run existing `packages/db/scripts/migrate.mjs` through the established operator procedure. Never replace applied migration bytes. These migrations run transactionally in established ordering under the existing advisory lock. On failure, inspect sanitized errors and the ledger; do not drop tables or replay blindly.

Recovery: disable research before application rollback, preserve new append-only tables/receipts and ledger, retain the updated migration/grant tooling. Do not run an older migrator that grants unrestricted DML on new immutable tables. Prefer a reviewed forward fix. Destructive down migrations are intentionally absent. Restore a validated backup into an isolated database, verify counts/constraints/ledger/digests/private boundaries, then seek approval before a shared restore/cutover. Local logical recovery evidence is not managed Neon disaster-recovery evidence.

## API and UI capabilities

GET/HEAD public `/api/v1` and trusted/token-gated `/api/internal/v1` read routes:

- `/search?chain=ethereum|solana&query=...` (network explicit).
- `/addresses/:chain/:identifier` and `/transactions/:chain/:identifier`.
- `/addresses/:chain/:identifier/transactions?limit=20&direction=...&cursor=...`.
- `/addresses/:chain/:identifier/token`, `/contract`, `/balances`.

Reads cannot access private research or create account-wallet associations. Existing owner/staff endpoints retain default-deny permissions. History cursors are encrypted/authenticated, provider/network/address/direction/page-size/snapshot bound, expire after five minutes and invalidate on process restart; restart pagination when invalid. Failover starts at the recorded snapshot without passing a provider's page key elsewhere and can repeat rows. API caps history at100; Ethereum enhanced history accepts1–25 and separate incoming/outgoing directions. Solana standard signatures accept1–100; incoming/outgoing pages accept1–25 and decode actual transaction movements, never infer direction from signers. Associated wallet-owned token accounts are not discovered. Internal movement, traces, failed Ethereum calls without indexed transfers and full archival coverage remain unsupported. Ethereum native balance is supported; its token-balance adapter is separately disabled until actual discovery capability/plan verification. The bounded first indexer page supplies at most10asset addresses, while raw balances/decimals are read at one canonical block hash using EIP1898; current indexer amounts are never displayed as snapshot values. Classic SPL balances are supported; Token2022 extensions/balances and explorer source verification remain unavailable. Transfer logs from unclassified EVM assets stay `observed_log` / `unknown`. Raw amounts are integer strings.

Read-only real-provider verification, after secure binding and actual plan review: `node scripts/phase8-provider-smoke.mjs <publicEthereumTransactionHash> <publicSolanaSignature>` from the repository root. It requires protected keys and `RPC_PLAN_VERIFIED=true` in that isolated process, does not access DB/actors/mail/cloud settings, and records only public snapshot/finality/count/status metadata. Missing keys/input produce blocked/untested exit2; this is not live adapter success or runtime activation. Additional history/balance/token/archive/independence probes remain required before their capability flags can be enabled.

The non-mock typed server client handles real research DTOs; pages preserve UI and distinguish unavailable findings/assessment/publication from empty results. Additional token/contract/balance/history sections show source, timestamp, finality, snapshot verification and explicit incomplete coverage. No new mock data authorizes anything. Project directory pagination requires its documented architecture decision; reports/appeals/moderation/risk backend belongs to later phases. Live dashboard provides a search/account fallback while private dashboard activity remains unavailable.

## Performance, privacy and monitoring

5second lookup/10second history source deadlines; response caps2/4MiB; at most two transient budget-aware retries; circuits after three capability failures; 30second cooldown; 16 single flights,500 cached reads,15second freshness/60second bounded degraded display. Provider failures/conflicts never become verified evidence. Shared flight cancellation is per consumer. Public research limit is30weighted units/minute (2 per request) and1000bounded prefix buckets. SSR presently shares its measured gateway prefix; correct end-user prefix propagation needs independently verified ingress evidence before wider activation. Do not trust arbitrary forwarded headers or broaden trusted CIDRs.

Static budget applies to the current single API process, worker allocation zero. Scaling/restarts need explicit quota review; no Redis or monthly billing-cap claim. Unknown provider content is validated or hashed, never returned as logs/URLs/raw errors. Normalized reads are private-telemetry-free shared chain records. Do not log identifiers with actors, credentials, request bodies or receipt contents. Review managed logs/retention and provider terms before live research. No websocket, schedule, keepalive, automatic wallet monitor, private watchlist, external telemetry or sanctions activation.

Keep branch-specific Vercel deployment disabled by committed `vercel.json` at repository and project root; this prevents the review push from deploying Phase8. Render auto-deploy remains off. Publishing a PR is not deployment authorization. Before later rollout obtain approval for the exact reviewed commit, staging migration and provider activation, then confirm canonical alias/source plus functional/security smoke checks. Do not change the existing public foundation while reviewing this branch.

Disposable backend fixtures use bounded512MiB tmpfs with the same pinned PG18/schema/roles and clean up only their own containers/volumes. Existing Compose/user volumes must never be pruned. Sequential and concurrent reconciliation invalidation barriers remain authoritative; delayed matching data cannot clear them.
