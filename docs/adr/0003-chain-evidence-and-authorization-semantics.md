# ADR 0003: Chain evidence identity and transfer authorization

| Field | Value |
|---|---|
| Status | **Accepted with amendments**, **corrected by ADR 0008** (pending owner ratification). Backend implementation: Phase 8 |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Pending Claude recommendation |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §§11–13, 15; packages/chains contracts; chain/external-list schema; T-31, T-35, T-40–42, T-55 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md), R-06, R-07, R-13 |

## Problem

Observed transfer endpoints are insufficient to establish subject-authorized association. Cross-verification lacks matching state identity and multiple receipts; external list chain interpretation is undefined.

## Evidence

AssetTransfer carries endpoints/ordinal; NormalizedTransaction has sender or fee payer but no per-transfer authority. ReadOptions/ProviderCallOptions target commitment only. DataProvenance stores one provider, height and a verification flag. Model admits pending pinned rows despite invariant 16. External entries require chain_id without a declared currency-to-chain mapping.

## Impact

Manufactured association, victim accusations, false provider conflicts or false corroboration, and misapplied sanctions.

## Proposed solution

Separate observed events, verified asset movement and subject authorization; unknown authorization contributes zero association. Record historical authority/account context and relevant execution evidence only where reliably available. EVM comparisons use common canonical block identity; transaction receipts agree on block/receipt fields and finality. Solana transaction comparison uses immutable signature/slot facts; account-state comparisons explicitly distinguish different finalized snapshots and unavailable historical targeting. Persist provider receipts, second provider, independent upstream basis, canonical identities, fields/digests and decoder version. Explorer verified source and off-chain metadata retain external provenance. Pending ingestion is staging, not pinned evidence. Final observation history retains later invalidation/retraction records.

Specify capability-specific failover/cursor identity and cache keys including finality/crossVerify. Define sanctions mapping per supported currency/network, exact matches, source version/checksum, last-good update and delisting; no cross-chain inference from address format. Treat sanctions as an attributed designation, not fraud. Contract/schema changes require owner approval before Phase 2. Test fake token logs, transferFrom, delegates, relayers/multisig, failed execution, Solana fee payer vs authority, historical owner changes, provider lag and same-snapshot conflicts.

## Alternatives considered

Disable numeric association in V1 (preferred minimum scope) while preserving observed facts. A boolean cross_verified without receipts is simpler but insufficient for reproducibility. Comparing independently current-finalized balances as identical state is rejected. Running own archive/indexer is unnecessary unless supported provider capabilities prove insufficient; would need a separate accepted ADR.

## Consequences

Additional lifecycle contracts and negative tests are required; this proposal reduces ambiguity rather than authorizing production work. If accepted, Claude updates ARCHITECTURE, ESSENTIALS, PRD, data model, threat model, testing/dependency policies and handoff wherever affected before the relevant implementation. No existing migration is changed; none exists. Preserve the owner's phase authorization requirement.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.**

- **R-06 is correct.** My contract carried only `from`/`to` plus a single initiator. That cannot separate a subject's own transfer from `transferFrom`, delegates, CPI, relayers or fake logs, and "subject-initiated" was undefined.
- **R-07 is correct.** A `commitment` string and a boolean `cross_verified` cannot show that two providers answered about the same state. Solana account reads cannot target an exact historical slot, so naive comparison would produce false conflicts or false agreement.
- **R-13 is correct.** OFAC currency codes do not map mechanically to CAIP-2 chains, and +90 turned a legal designation into a fraud-like score.

The amendments add concrete basis rules per chain, define an "inconclusive" result distinct from "conflict", list where verification is mandatory, and defer sanctions activation behind legal review.

## Amended decision

Normative design: [docs/design/chain-data.md](../design/chain-data.md).

1. **Three layers:** observed event → movement evidence level (`observed_log`, `asset_contract_log`, `balance_verified`, `native_consensus`) → authorization basis (`subject_signed_direct`, `delegated`, `protocol`, `unknown`), with a victim-indicator overlay. `unknown` contributes zero, always.
2. **V1:** no association scoring of any kind. Observed transfers are shown neutrally, with level and basis.
3. **Snapshot identity:** EVM `{blockNumber, blockHash}` with EIP-1898 block-hash reads; Solana `{signature, slot}` for transactions; Solana account state compared via `minContextSlot` with an explicit `inconclusive_snapshot_mismatch` result.
4. **Receipts and verification records:** provider, independence group, snapshot, query, field digest, decoder version, comparison spec version. `agree` only at the same snapshot from different independence groups.
5. **Mandatory cross-verification** only for evidence-pinned transactions and facts behind scoring signals. Ordinary views stay `single_source`.
6. **Pinned tables are finalized-only** (CHECK constraint). Non-final data is cache/staging only. Post-finality problems are recorded as append-only invalidations.
7. **Explorer and off-chain data** are `external_source`. Metadata URIs are never fetched.
8. **Sanctions (owner: legal review is a pre-launch blocker):** activation deferred. When activated: an attributed badge only, no numeric contribution, versioned and checksummed snapshots with atomic switch and last-good fallback, a legally reviewed chain-mapping table, exact matching, delisting history, no propagation.
9. **Contract scaffolding updated** in `packages/chains/src/types.ts` and `ports.ts` (Phase 0 scaffold correction).

Phase gate: Phase 2 (sanctions: pre-launch legal gate plus a separate ADR). Affected documents updated 2026-10-04: ARCHITECTURE §11, §13, §15; data model §4; THREAT-MODEL T-31, T-35, T-40–T-41 and invariants; testing strategy §8; chain contracts.

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (review-response instructions §17–§18, §26): transfer direction does not equal authorization; unknown authorization never creates negative association; verification must compare the same canonical snapshot; external sources keep their provenance boundaries. Still required: ratification of the amended text. Not an implementation authorization.


## Addendum — 2026-10-04 (ADR 0008, re-review V2-03)

History above is preserved. Correction to amended-decision item 3:

- Solana account reads **agree only at the identical context slot**. `minContextSlot` is a lower bound, not historical targeting. Different slots are `inconclusive_snapshot_mismatch` **even when the values are identical**.
- If no same-slot pair can be obtained, cross-provider verification of that fact is `unavailable`, and no scoring signal is created from it.
- Receipts record chain/cluster, provider, method, parameters (address or signature), commitment, snapshot, request and fetch timestamps, and digest.
- **EVM block-level balance deltas** are an aggregate fact and never upgrade an individual transfer's evidence level ([chain-data §2.2, §5](../design/chain-data.md#5-snapshot-identity-and-cross-verification)).
