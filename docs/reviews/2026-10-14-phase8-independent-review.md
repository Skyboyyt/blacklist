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

Actual managed cloud logs, hosted identity, real provider independence, account plan/terms, managed disaster recovery and full test/audit results were not independently executed by the reviewer. Implementation-agent evidence is separately identified in the continuation report. Conflicting reads are withheld by the router but their receipt persistence/operator alerting remains incomplete. Claude's O-3/architecture and Phase7 recovery review remain outstanding.
