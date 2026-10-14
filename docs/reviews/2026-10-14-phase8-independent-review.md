# Review: Phase8 independent code/security review

| Field | Value |
| --- | --- |
| Reviewer | Separate Codex review agent; implementation agent did not supply the findings |
| Date | 2026-10-14 UTC |
| Scope | Phase8 branch against main5967afa, followed by local continuation fixes |
| Documents read | AGENTS, architecture/essentials, normative chain-data, affected threats and implementation diff |

## Summary

Four initial Medium integrity/performance findings were identified independently. A final no-resurrection review added a fifth reconciliation finding. Three initial findings were reproduced using in-memory malformed-provider probes; the SQL timestamp and concurrent-barrier findings were initially static. All have local repairs and regression coverage. The reviewer independently executed15focused cancellation/capability tests across two files, all passing. This is independent Codex review, not Claude architecture approval or a live/cloud security audit.

### P8-IR-01 — EVM transaction block height mismatch

- **Severity:** Medium; correctness/provenance.
- **Location:** `packages/chains/src/providers/evm-rpc.ts`, transaction block read.
- **Evidence:** a response for block16 returned height17 with the expected hash; the adapter accepted its timestamp.
- **Impact:** malformed provider data could attach inconsistent chain time to a transaction.
- **Recommendation:** require both block hash and height to match the receipt.
- **Implementation response (Codex):** fixed; negative test failed before repair and passes afterward.
- **Response (Claude):** pending.

### P8-IR-02 — Duplicate or wrong-owner Solana balance accounts

- **Severity:** Medium; correctness/provenance.
- **Location:** `packages/chains/src/providers/solana-rpc.ts`, classic SPL balance parsing.
- **Evidence:** the same account appeared twice with amount10 and a different parsed token owner; the adapter displayed20.
- **Impact:** duplicate or unrelated accounts could inflate a wallet's token balance.
- **Recommendation:** validate unique account pubkeys and the parsed token owner against the requested wallet.
- **Implementation response (Codex):** fixed; adversarial test failed before repair. Positive aggregation now uses two distinct validated accounts; contradictory-decimal rejection remains independently exercised.
- **Response (Claude):** pending.

### P8-IR-03 — Identity handshake ignores caller cancellation

- **Severity:** Medium; performance/abuse.
- **Location:** EVM/Solana provider mainnet handshakes.
- **Evidence:** a caller aborted at10ms but awaited a102ms identity check; the handshake received no signal.
- **Impact:** retries could continue consuming credits after the router deadline.
- **Recommendation:** bounded shared work, independently cancellable subscribers, abort underlying work when all leave.
- **Implementation response (Codex):** shared network-check helper added. Successful identity only is cached; failure retries, pre-cancelled input, one-subscriber cancellation and all-subscriber abort are tested. Provider calls receive a five-second deadline.
- **Response (Claude):** pending.

### P8-IR-04 — Pinned timestamp differs from immutable receipt

- **Severity:** Medium; integrity.
- **Location:** pinned transaction SQL guards.
- **Evidence:** original guards bound normalized content and execution fields but omitted denormalized `block_time`. Implementer subsequently reproduced acceptance of a null/different timestamp in disposable PostgreSQL.
- **Impact:** a pinned row could expose a timestamp inconsistent with its verified normalized transaction.
- **Recommendation:** bind the column to normalized receipt time and test mismatches.
- **Implementation response (Codex):** additive `0004_pinned_transaction_time.sql`; all earlier migration bytes preserved. Existing-row validation fails closed without deleting or changing facts; null/different timestamps are rejected locally.
- **Response (Claude):** pending.

## Reconciliation follow-up

### P8-IR-05 — Invalidation barrier survives later/concurrent matching reads

- **Severity:** Medium; correctness/provenance/reversal barrier.
- **Location:** `packages/domain/src/chaindata/reconciliation.ts` and reconciliation repository.
- **Evidence:** implementer reproduced a later matching read returning `consistent` after invalidation; stored invalidation remained intact. Independent reviewer then identified the concurrent case: a matching read begins first, waits for RPC, and returns after another read has already invalidated. A gated isolated-PG regression failed before atomic correction.
- **Impact:** a future caller could misread a stale consistency result as clearance despite required invalidation/review. This service is not publicly exposed/deployed and no production authority was changed.
- **Recommendation:** preserve existing invalidation status and recheck after RPC under the same per-fact advisory lock used by invalidation writers; no database lock during network I/O.
- **Implementation response (Codex):** fixed and isolated-PG regression/types PASS. Early invalidation read short-circuits provider work; final consistency/invalidation decisions are serialized and return the existing invalidation/review requirement. Original pins remain immutable. Intermediate full reruns interrupted after review/type findings are not counted as completed; complete rerun recorded in latest evidence.
- **Independent source review:** reviewer confirmed the atomic lock/recheck and gated regression; did not independently execute DB tests.
- **Response (Claude):** pending.

Reviewer found no additional demonstrated live exploit in the new on-demand CLI reconciliation. Recommended explicit chain/hash/snapshot binding and negative/concurrent tests were added: user/system actors, pending/degraded/conflicting verification, snapshot/payload mismatch and concurrent retry. Independent finalized agreement is mandatory; unknown upstreams cannot invalidate pins. Transaction advisory locking avoids UPDATE privileges on immutable facts; failures roll back and propagate. Later-phase dependent signal retraction/finding review is explicitly required, not claimed executed. No scheduler, public mutation, wallet monitoring or cloud activation is added.

## Not reviewed

Actual managed cloud logs, hosted identity, real provider independence, account plan/terms, managed disaster recovery and full test/audit results were not independently executed by the reviewer. Implementation-agent evidence is separately identified in the continuation report. Latest continuation implements conflict receipt persistence; operator alert delivery remains incomplete. New execution/review scope is recorded below. Claude's O-3/architecture and Phase7 recovery review remain outstanding.

## Coverage and conflict-persistence follow-up

Fifteen additional modular test/helper files were independently reviewed at source level. Reviewer recommendations tightened exact mailbox/role outcomes, new-versus-old password checks, immediate revoked-session absence, enrollment-code privacy and token-bearing failure diagnostics. Those assertions were added, not substituted for existing assertions. Synthetic signed WebAuthn uses the production verifier but seeded keys/UV bits do not prove physical hardware/enrollment or hosted identity. Injected human-response/RPC data and loopback SMTP do not prove production verification, actual provider independence, TLS delivery or mailbox ownership. Reviewer did not execute these new tests or the full189-test coverage run.

### P8-IR-06 — Conflict receipts discarded on failure paths

- **Severity:** Medium; provenance/requirements.
- **Location:** chains router, research persistence and operator reconciliation.
- **Evidence:** router regression requiring both conflict receipts failed before preservation fix. Independent reviewer then identified operator reconciliation's early failure return still discarding the pair; isolated-PG regression expected one conflict but observed zero before correction.
- **Impact:** disputed facts were withheld safely but immutable evidence needed to explain comparison was missing. This does not establish unauthorized pinning or a live exploit.
- **Recommendation:** keep bounded finalized same-snapshot independent receipts in internal failure; revalidate exact subject/capability/chain/comparison, persist atomically, never cache/pin/invalidate on dispute. No receipt details in public errors.
- **Implementation response (Codex):** implemented for public research and operator reconciliation with existing immutable tables/grants, no migration/dependency/route. Focused5test combined isolated-PG run and final189test full coverage passed. Idempotent concurrent retry, forged/shared/mismatched receipts, write rollback, public error privacy and unchanged pin/cache/invalidation are asserted.
- **Independent review scope:** source-level confirmation of router/public research preservation, no demonstrated new privacy/partial-write issue. Operator follow-up independently identified; final operator correction execution by implementer, no independent DB/full-coverage/cloud reproduction.
- **Response (Claude):** pending.

Actual primary-provider evaluation passed; live independent secondaries, account terms, operator notification routing and Phase7 hosted/security recovery gates remain open. Local coverage floors now pass83.57%; this does not turn synthetic or source-only checks into live/independent results. Owner authorized PR12 merge despite the disclosed blockers; this is not Claude architecture approval or production readiness.
