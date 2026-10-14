# Phase8 continuation: live providers, integrity repairs and validation

Date:2026-10-14 (Europe/London). Branch:`feat/phase8-chain-research`; main remains5967afa. [Draft PR12](https://github.com/Skyboyyt/blacklist/pull/12) targets main. This report supersedes the earlier missing-key/partial-coverage observations while preserving that historical evidence. **Phase8 remains open, unmerged and undeployed.**

Machine-readable evidence: [continuation validation](../evidence/2026-10-14-phase8-continuation.json). Separate [independent review](2026-10-14-phase8-independent-review.md) identifies its execution limits.

## Provider and feature results

| Item | Actual result | Evidence / limitation |
| --- | --- | --- |
| Ethereum — Alchemy | Tested: passed | Actual saved key, chainId1, finalized canonical block reads, public wallet integer balance, two outgoing history pages, historical successful transaction/receipt/time/fee.20attempts in the last bounded evaluation. Enhanced method access is sampled, not a Free-account, credit-cost, full-history or archival guarantee |
| Solana — Helius | Tested: passed | Actual key, mainnet genesis, finalized slot/account, block metadata and two address-history pages. Supported public v0 transactions with both successful and failed execution decoded with fees/timestamps; successful example has3transfers. A public signer account/balance also read.9attempts in last evaluation |
| Unsupported Solana transaction | Tested: unavailable | Live-32015 returned for a newer transaction version; decoder correctly reports `not_supported`. No fabricated transaction or silent version upgrade |
| Provider errors, rate limits, retries, timeouts | Tested locally | Maintained adversarial transport/router/policy/cancellation suites pass. Live quota exhaustion/429, provider timeout or independent failover was not induced. Avoiding quota abuse does not prove live failover |
| Research API/frontend contracts | Implemented, tested locally | Real-domain/isolated-PG API contracts and non-mock typed-client tests retained; all web/chain/contract tests pass. Browser suite uses mocks. Phase8 endpoints are not deployed to the public site, so live user research remains untested/unavailable |
| Independent-source evidence | Blocked | Only one approved candidate per chain; different-chain primaries cannot corroborate. Unknown infrastructure groups never agree. Actual independently documented secondaries, same-snapshot reads and O-3/Claude approval remain missing |
| Pinned-fact reconciliation | Implemented, tested locally; live blocked | On-demand CLI-only service verifies finalized independent same-decoder receipts, explicit chain/hash/snapshot/payload bindings, and appends an idempotent invalidation without rewriting pins. Unknown/pending/degraded/conflicting/mismatched evidence is refused. DB-write rollback and concurrent retry tested; no scheduler/public mutation. Later-phase signal retraction/finding review still required |
| Scam report submission linked to wallets/transactions | Blocked by phase boundary | Production reporting/moderation backend belongs to Phase9 and is absent. Existing mocks do not authorize real submissions. No fake successful report or Phase9 implementation added |

Public historical examples are in the evidence JSON; no owner account, private research record, credential or email token is included. Source attribution remains single-source and factual; movement/direction never becomes guilt or a risk score. Provider-supplied URLs are not fetched.

## Repairs and database review

Independent reviewer reproduced EVM height mismatch, duplicate/wrong-owner Solana balance inflation and cancellation gaps, and identified inconsistent pinned timestamps. Final review added the reconciliation invalidation barrier, including a concurrent stale-response case. All five are repaired locally. Original EVM/Solana, isolated SQL, sequential barrier and gated concurrent regressions failed before their fixes. Existing passing assertions remain intact. See the independent review for locations, impacts and Claude response status.

- Shared network identity checks cache success only, bound underlying work to5seconds, cancel individual subscribers promptly, and abort work when all leave. Failed identity can retry; callers cannot cancel another subscriber.
- EVM transaction blocks match both receipt height and hash. SPL accounts have validated unique pubkeys and token owner equal to the requested wallet; integer aggregation and contradictory-decimal tests remain.
- Additive `packages/db/migrations/0004_pinned_transaction_time.sql` validates `block_time` against immutable normalized receipt time. SHA256:`4543f992ecbbdb7ecd0e62530dd59499641d7ec10614f369f4089f1655819db2`. All9previous SQL files retain their exact bytes. Local ledger10/tables34; exact count/hash/restore/permission assertions updated, not removed.
- Constraint addition/validation uses the existing transactional migrator and lock/statement limits. Inconsistent existing pins abort validation; never delete or silently repair them. Recovery remains a reviewed forward repair or isolated restore. No cloud SQL, role/password regeneration or user-data modification occurred.
- Existing invalidation remains authoritative when later facts match the original pin. Final consistency/invalidation decisions recheck that barrier under the same per-fact advisory lock; RPC stays outside the lock. A delayed matching read released after another read invalidates must return the existing invalidation/review requirement, never clear it.

Independent reviewer separately ran15focused tests, all passing, and reviewed the revised reconciliation source, including the final atomic barrier. Its live-provider/DB/coverage/cloud claims rely on implementation-agent execution, not independent reproduction. Explicit wrong-chain/hash and sequential/concurrent no-resurrection cases pass the isolated reconciliation rerun/types. Complete backend coverage was rerun after that source correction; interrupted/locked intermediate runs are not completion evidence.

## Checks actually executed

| Check | Result |
| --- | --- |
| Frozen install/toolchain | PASS; Node24.21/pnpm12.7 and existing supply-chain settings retained |
| `pnpm check` | PASS: format, lint, workspace types,596unit tests (61chains/81contracts/49backend unit/405web), Next production build |
| `pnpm build:backend` | PASS |
| Mock production build | PASS |
| Browser/static mock and server-variable exclusion | PASS;4checks |
| Full maintained backend coverage suite |106tests/25files PASS; **coverage command FAIL64.90%branches/75%**. Includes49backend unit tests already counted above; do not add overlapping counts |
| Chain coverage |61tests PASS;80.61%branches/75% PASS |
| Desktop/mobile Chromium154 |418PASS/0FAIL/82existing skips,17.8minutes; mock browser flows |
| Drizzle drift / migration / restore / least-privilege | PASS locally; no schema drift, isolated PG18 TLS/migration/restore/security tests included in complete backend suite |
| Final wrong-chain/hash reconciliation negatives |1isolated test PASS; types PASS. This adds cases inside an existing test, not extra complete-suite count |
| Final source lint/types/backend build |PASS after atomic reconciliation and disposable fixture corrections |
| Production dependency audit |PASS,0vulnerabilities |
| Full dependency audit |FAIL,1high dev`braces@3.0.3`, GHSA-vfj7-8cjw-p6xm; official GitHub advisory still reports no patched version. No suppression/security policy change |
| Actual credential-value scan |PASS:9distinct saved runtime/provider values checked against3812source/browser files,0matches; no values emitted/persisted |
| Git history scanner |Raw FAIL:39commits,4exactly matching previous fictional/prose findings,0new. No actual exposed credential found; this is not a raw scanner pass |
| Staged publication scanner |PASS35files/0findings, network-disabled pinned scanner, full redaction |
| Render API and worker `/healthz` |200/`status:ok` each. Early probes used incorrect health paths and one timed out; corrected configured-path checks are the health evidence |
| Direct Neon verified-TLS catalog probe |BLOCKED,exit2; no private rows read. No TLS/driver workaround; live migration ledger unverified |
| Hosted activation/login/logout/reset |UNTESTED; owner elected to perform these flows personally, results pending |

Coverage omissions are fixed by repository-root transformation with backend-only test selection and unchanged server source includes/floors. A complete-map guard rejects empty coverage and missing formerly omitted entry/operator files. An initial attempt with old absolute globs yielded an empty map and is **not** a pass. Corrected55-test measurement57.25%included all files; broader runs improved tested paths. A nine-to-ten fixture count caused6cascading failures and a new test initially expected an invalid null profile update to succeed; causes corrected and complete105-test rerun passed. Generic spy/record typing errors were repaired. No failures are erased from structured evidence.

Final test-environment repair: repeated fixture container deletion retained anonymous PostgreSQL volumes. Inspection found528local volumes/24.66GB and a97%-full workspace; a subsequent full rerun had database-readiness failures and hook-skipped tests, not a pass. New fixtures use bounded512MiB temporary PostgreSQL storage and remove only their own containers/anonymous volumes. Existing volumes, Compose state and user data were preserved; no generic prune. Actual filesystem type/size, runtime DDL denial and teardown are verified by a new isolated integration test. Research/reconciliation also pass on this storage. The same pinned PG18 image, schemas, roles, timeout limits and restore assertions remain; this does not claim managed/disk disaster recovery. Final complete coverage after repair:106tests/25files PASS,64.90%branches FAIL. The failed readiness checkpoint was85PASS/2FAIL/18hook-skipped; these were infrastructure hook skips, not new deliberate test skips. Temporary typing/metadata assertions were corrected and are retained in evidence.

| Required branch floor | Actual | Status |
| --- | --- | --- |
| Global75% |64.90% |Failed |
| Identity90% |64.07% |Failed |
| Access90% |95.45% |Passed |
| Audit90% |90.00% |Passed |
| Staff75% |55.74% |Failed |
| Shared75% |78.26% |Passed |
| Configuration75% |96.25% |Passed |
| Database75% |72.72% |Failed |
| API75% |66.75% |Failed |
| Worker75% |64.51% |Failed |

The former60.04%measurement omitted files and is not a directly comparable complete baseline. Coverage still prevents closure. Existing skips are conditional desktop/mobile keyboard/navigation cases and desktop-only tests which set their own viewports; no new skips, deleted assertions, widened trust, lowered floors or scanner exclusions.

## Cloud and remaining blockers

Read-only Render metadata confirms both services still main/Free Frankfurt/source038ed7f/auto-deployoff, restricted `blacklist_app` and direct verified-TLS URLs. The known environment group holds both keys plus runtime/migration URLs but has **zero service links**. Workspace listing reports this group only. No API/worker direct provider/migrator variables and no forbidden Vercel variables were found. Keep mixed operator storage isolated; future approved rollout needs API-only provider settings. No service settings were changed. Cloud health does not verify Phase8 migrations or hosted identity.

Required next work:

1. Add meaningful missing identity/staff/DB/API/worker branch coverage; retain all enforced floors. Access/audit improvements close those coverage deficiencies only, not all hosted security gates.
2. Claude reviews O-3 and recovery ADRs; owner/Claude resolve actual Free plan/terms/archival limits and independently documented secondary providers. Primary success does not make snapshots independently verified.
3. Complete conflict-receipt persistence/operator alerting. Reconciliation's immutable invalidation is locally implemented; live independent reconciliation and dependent signal/finding review remain unverified/unavailable.
4. Resolve unpatched development advisory through policy-compatible upstream repair or reviewed tooling decision, not an audit waiver.
5. Obtain owner's hosted flow results, then validate cold/idle/session boundaries, actual logs, managed restore/retention/monitoring/legal and remaining Phase7 recovery gates. No real user passwords/records may be changed for testing.
6. Review the exact commit/migration/provider settings before any authorized staging rollout. Do not link privileged migration storage to runtime. Reports remain a later-phase dependency.

No Phase8 closure approval requested: required gates still fail. No Phase9, merge, cloud migration, infrastructure purchase or deployment is authorized by this continuation. Publication is review-branch/draft-PR only; actual commit/push readback is recorded in the latest handoff.
