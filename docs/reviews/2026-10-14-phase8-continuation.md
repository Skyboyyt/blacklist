# Phase8 continuation: mainnet validation, security repairs and coverage

Date:2026-10-14 (Europe/London). Branch:`feat/phase8-chain-research`; [PR12](https://github.com/Skyboyyt/blacklist/pull/12) targets main. Owner explicitly authorized merging despite the disclosed blockers. Actual publication receipt is recorded below after execution. **Phase8 remains open; merge approval does not pass missing provider/hosted gates.**

Evidence: [machine-readable results](../evidence/2026-10-14-phase8-continuation.json), [independent review](2026-10-14-phase8-independent-review.md). Earlier failed checkpoints are preserved in structured evidence and historical handoff entries.

## Provider and feature results

| Item | Status | Actual evidence / limit |
| --- | --- | --- |
| Ethereum — Alchemy | Tested | Actual protected key; Mainnet chainId1, canonical finalized block, integer native wallet balance, two outgoing history pages, public historical successful transaction/receipt/time/fee.20attempts in final bounded evaluation. Not an archive/plan/credit guarantee |
| Solana — Helius | Tested | Actual key; Mainnet genesis, finalized slot/account/native balance, block metadata and two history pages. Successful and failed v0 transactions/fees/times; successful sample3transfers.9attempts in final evaluation |
| Newer Solana version | Tested: unavailable | Live-32015 maps to `not_supported`; no fabricated data or silent decoder expansion |
| Provider faults | Tested locally | Timeout/oversize/malformed/429/retries/cancellation/failover/circuit/pagination tests. Live quota exhaustion/timeouts/failover were not induced |
| Research API and UI contracts | Implemented, tested locally | Real router/adapters/domain/API/isolated-PG and typed non-mock client; wallet and transaction search, token/contract/balance/history DTOs and honest incomplete/error states. Synthetic RPC in local fixtures; Phase8 API not deployed |
| Independent-source verification | Blocked | Only one approved primary per chain. Different-chain primaries do not corroborate. Actual independent same-snapshot secondary evidence and O-3/Claude/account plan review remain pending |
| Pinned-fact reconciliation | Implemented, tested locally | CLI-only finalized independent ref/snapshot/payload/decoder checks, append-only idempotent invalidation, concurrent no-resurrection barrier. Live independent reconciliation remains blocked |
| Conflict receipts | Implemented, tested locally | Both finalized same-snapshot independent receipts survive router failure and persist atomically for public research and operator reconciliation. Idempotency, forged comparisons, SQL write rollback and safe public DTO tested. No cache/pin/invalidation authority |
| Operator conflict notifications | Blocked | Durable conflict records exist; delivery channel, recipients, routing and worker contract require Claude/owner decision. No unapproved email/service/public staff endpoint introduced |
| Scam report submission | Blocked by phase boundary | Production reporting/moderation backend is Phase9. Existing mocks grant no real submission authority; Phase9 not started |

Amounts remain integer strings; transactions, direction and association do not imply guilt, ownership or a risk score. Credentials stayed in memory during bounded public read-only evaluation; no provider-supplied URL fetching.

## Implementation and security review

Five earlier Medium findings repaired: EVM receipt height/hash, SPL duplicate/wrong-owner balances, bounded shared network identity cancellation, pinned timestamps and sequential/concurrent invalidation barriers. Original regressions failed before fixes. Newly repaired receipt-loss paths also have failing-before router and isolated-PG operator regressions. Receipt persistence revalidates exact chain/capability/subject, finalized same snapshot, different documented infrastructure and different normalized digests before immutable transactional insert. Disputed values never enter shared cache or pins. Public errors include only an approved reason, not receipts or credentials.

Added15test/helper files cover member login/password/profile/session states; delivered-token expiry/replay/revision/cooling/mailbox proof; accepted/permanent/retryable email delivery; account/IP/global/human-response abuse; real signed synthetic WebAuthn assurance/step-up/reset/role approval; staff private reads; bounded Argon2 capacity; actual loopback SMTP replies; operator configuration; real-domain research DTOs and conflict persistence. Existing assertions/floors/security rules/dependency pins are unchanged. Synthetic enrollment/UV bits are not physical authenticator or hardware attestation proof; injected human-response/RPC fixtures are not production human verification/provider independence. SMTP tests do not prove production TLS or real mailbox delivery.

Independent reviewer ran15earlier focused tests and reviewed the new tests and conflict fix at source level. It found operator reconciliation still discarding conflicts; that path was repaired and regression-tested by the implementation agent. New DB/full-coverage/cloud/live results were not independently reproduced. Claude architecture/recovery response remains pending.

## Database

Additive `packages/db/migrations/0004_pinned_transaction_time.sql`, SHA256`4543f992ecbbdb7ecd0e62530dd59499641d7ec10614f369f4089f1655819db2`; all9prior migrations byte-identical, local ledger10/tables34. Validated pin-time constraint fails closed on inconsistent existing pins without deleting/rewriting them. Migration order/hash/transaction/grants/append-only/restore tests pass on isolated pinned PG18. Receipt repair reuses existing tables/grants and introduces no new migration. No cloud SQL, production user mutation or role/password regeneration.

Direct Neon verified-TLS read-only catalog probe remains blocked; live ledger is unverified. Managed restore/backup/retention/logging/idle-cycle gates remain open. Existing Docker/Compose/user volumes were preserved. Disposable fixtures use bounded512MiB tmpfs and clean only their own containers; logical restore is not a managed disaster-recovery claim.

## Checks actually executed

| Check | Actual result |
| --- | --- |
| Frozen install | Passed, Node24.21/pnpm12.7, existing supply-chain rules |
| Root `pnpm check` | Passed599unit assertions (61chains/81contracts/52backend unit/405web), format/lint/workspace types/Next production build. Operator follow-up then verified with final source checks below |
| Final backend coverage | **Passed189tests/38files; 83.57%branches, all global/package floors**. Includes52unit tests already counted above; no overlapping totals |
| Complete coverage map guard | Passed; all five formerly omitted entry/operator TS files included, zero parse omissions |
| Chain coverage | Passed final61tests/80.67%branches, unchanged75%floor |
| Final backend build/types/lint | Passed final full workspace types, full lint and backend build after operator conflict correction |
| Mock build / bundle isolation | Mock build passed;4browser/server-only exclusion checks passed; fresh final4check bundle rerun passed |
| Chromium154 desktop/mobile |418passed/0failed/82existing device-specific skips; mocks only, frontend unchanged in this follow-up |
| Schema drift / migration / restore / least privilege | Passed locally; no schema drift, full isolated-PG suite includes migration/grant/immutability/security negatives |
| Production dependency audit | Passed,0vulnerabilities |
| Full dependency audit | Failed:1high development`braces@3.0.3`, GHSA-vfj7-8cjw-p6xm; official advisory has no patched version. No waiver/scanner/policy suppression |
| Actual protected-value scan | Passed fresh readback:8distinct protected values/3252source/browser files,0matches; earlier9values/3812files also0. Scope counts differ; no values persisted or printed |
| Secret scanners | Final staged29files passed0findings, pinned network-disabled scanner/100%redaction. Earlier history raw failure4exact known fictional/prose matches,0new; final postcommit history receipt follows, never called a raw pass |
| Render API/worker health | Both configured`/healthz`200/statusok; not a Phase8 or hosted identity check |
| Hosted activation/login/logout/reset | Untested; owner elected to test personally, results not received |

| Required branch floor | Actual | Required | Status |
| --- | --- | --- | --- |
| Global | 83.57% |75% |Passed |
| identity | 93.69% | 90% | Passed |
| access | 95.45% | 90% | Passed |
| audit | 90.00% | 90% | Passed |
| staff | 78.35% | 75% | Passed |
| shared | 78.26% | 75% | Passed |
| config | 96.25% | 75% | Passed |
| db | 75.00% | 75% | Passed |
| api | 76.45% | 75% | Passed |
| worker | 85.48% | 75% | Passed |

Full185-test checkpoint first passed83.50%; this final189-test rerun includes the subsequent conflict source changes. Reports were written to separate `/tmp` filesystem then copied for the unchanged complete-map guard. Source includes, test selection and threshold configuration are unchanged. Full-run S12 transient ratio1.655 failure, disk/lock/interrupted runs and fixture/type/lint corrections are preserved as failures in evidence. No generic volume prune; only generated Next cache was archived and removed after file/size verification to relieve workspace pressure. Existing browser skips remain device-specific, no new skips/removed assertions.

## Cloud boundaries and remaining work

Read-only metadata confirms existing Render API/worker main/source038ed7f, FreeFrankfurt, auto-deployoff; `blacklist_app`, direct Neon and`sslmode=verify-full`. No API/worker direct provider/migrator variables. Mixed environment group has zero links and must remain operator-isolated; eventual approved rollout requires API-only provider settings. Vercel canonical source038ed7f and0Phase8branch deployments among20recent before publication; no forbidden frontend variables. No cloud setting, secret, real-user record, paid resource, database migration or backend deployment changed.

Remaining blockers: Claude O-3/recovery review; actual account Free-plan/terms/credits/archive limits; truly independent secondary snapshots and live reconciliation; operator notification delivery decision; unpatched dev advisory; hosted identity owner results; managed recovery/logs/cold-idle/session/retention/monitoring/legal gates. Dependent signal/finding retraction and production reports remain later-phase services. Local coverage is now passed; it does not close hosted or architecture gates.

Owner's latest explicit authorization permits PR12 merge despite these blockers and possible Vercel deployment. It does not authorize activating backend providers, applying cloud migrations, starting Phase9, purchasing resources or declaring readiness. Actual GitHub/deployment status follows after verified publication.
