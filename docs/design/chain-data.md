# Chain Data Semantics, Verification and External Sources — Design

| Field | Value |
|---|---|
| Status | **Normative design, Phase 0 (revision 3, 2026-10-04).** Backend implementation in Phase 8 after authorization; research UI phases mock these contracts |
| Owner | Claude (primary engineer) |
| Decision record | [ADR 0003](../adr/0003-chain-evidence-and-authorization-semantics.md) (R-06, R-07, R-13), [ADR 0008](../adr/0008-revision-2-ratification-corrections.md) (Solana same-slot rule, V2-03) |
| Contracts | [packages/chains/src/types.ts](../../packages/chains/src/types.ts), [packages/chains/src/ports.ts](../../packages/chains/src/ports.ts) |
| Summarized in | [ARCHITECTURE.md §11, §13, §15](../../ARCHITECTURE.md#11-blockchain-integration) |
| Threats | T-31, T-35, T-40–T-42, T-55 |

---

## 1. Principle: a transfer record is not an accusation

"Address A sent funds to address B" can mean that A's owner chose to pay B. It can equally mean:

- an approved spender pulled tokens (`transferFrom`, permits, Permit2);
- a drainer swept a compromised wallet;
- a token program or contract moved balances on its own (permanent delegate, rebases, fee-on-transfer, forced transfers);
- an airdrop, spam or dust;
- a relayer, bundler or multisig executed on someone's behalf;
- a malicious token contract emitted a **fake** `Transfer` log naming A without moving anything.

Blacklist therefore records three separate layers and never collapses them.

## 2. The three layers

### 2.1 Observed event (`chain_fact`)

What the chain data literally contains, e.g. a `Transfer(from, to, value)` log emitted by contract X, or a Solana instruction naming accounts. Recorded with its **emitter** (EVM log address / Solana program ID).

### 2.2 Movement evidence level

| Level | EVM | Solana |
|---|---|---|
| `observed_log` | Any transfer-shaped log, from any emitter | Any transfer-shaped instruction not confirmed by balances |
| `asset_contract_log` | Log emitted **by the asset's own token contract**, in a successful transaction. Still only the token's own claim: a malicious token can lie. **This is the strongest per-transfer level for EVM tokens** | — |
| `balance_verified` | **Not assigned per transfer on EVM.** Block-hash state reads (parent vs containing block) prove only the **net balance change across the whole block**, which can include several transactions and movements. They are recorded as a separate aggregate fact (`block_balance_delta`, scoped to account, asset and block) and labelled as such. They never upgrade an individual transfer | SPL Token / Token-2022 transfer confirmed by the **transaction's own** `preTokenBalances`/`postTokenBalances` (transaction-scoped, consensus-produced deltas). Valid per transfer only when the transaction moved that account and mint once; otherwise the delta is shown as a transaction-level aggregate |
| `native_consensus` | Top-level transaction `value` (or client trace data where available) | System-program SOL transfer confirmed by the transaction's pre/post lamport balances |

### 2.3 Authorization basis (per movement, relative to the `from` side)

| Basis | Meaning | When assigned |
|---|---|---|
| `subject_signed_direct` | The subject signed a transaction that **directly** performed this movement | **EVM:** `tx.from == subject` and either (a) the movement is the transaction's native `value`, or (b) the transaction's top-level call is the token contract's `transfer(to, amount)` with matching parties, and the level is ≥ `asset_contract_log`. **Solana:** the subject is a transaction signer **and** the transfer instruction is **top-level** (not CPI) **and** its authority account equals the subject **and** the subject was the source token account's owner **at that slot** (from `preTokenBalances[].owner`, never today's owner). The fee payer is irrelevant |
| `delegated` | Moved by an approved spender or delegate | EVM `transferFrom` by a third party; Solana delegate or permanent-delegate authority |
| `protocol` | Moved by a program or contract without a direct subject instruction | CPI-invoked transfers, token-program side effects, mints and burns |
| `unknown` | Anything else, or not determinable | Smart-contract wallets and account abstraction (the subject is never `tx.from`), relayed and multisig execution, routers, failed transactions, `observed_log` events |

Even `subject_signed_direct` proves **a signature, not informed intent**: victims sign drainer-crafted transfers. A **victim indicator** overlay (a published finding noting compromise, or a movement that follows an approval to a flagged spender) is shown alongside and suppresses any negative inference.

## 3. Use in V1

- **Association scoring is disabled in V1.** No observed movement of any basis creates a risk signal. This applies to incoming movements (permanently), outgoing movements, and counterparties with findings.
- Transaction and address views show transfers with their evidence level and authorization basis in plain language, e.g. *"Token contract reports a transfer from this address. Who authorized it is unknown."*
- Counterparties with published findings show their own finding badge. Blacklist does **not** summarize this as "this address interacted with flagged addresses".
- **Post-V1 re-introduction** of any association factor requires an ADR, owner calibration sign-off, and at minimum: `subject_signed_direct` at ≥ `asset_contract_log` level, no victim indicator, outgoing only, one hop, hub/service exclusion, finalized and cross-verified facts, and a counterparty with a published **high or severe** finding. `unknown` authorization contributes **zero**, always.

---

## 4. Finality, staging and pinned facts

| Chain | Display | Pin / score |
|---|---|---|
| Ethereum | `latest`, marked "pending finality" | `finalized` block tag only |
| Solana | `confirmed` commitment | `finalized` commitment only |
| Future L2s | Per chain-registry policy | Per policy, including L1 batch finality |

- **Staging vs pinned:** non-final data lives only in caches. The pinned tables (`chain_transactions`, `asset_transfers`) accept **only finalized** rows, enforced by a `CHECK` constraint.
- **Post-finality invalidation** (an exceptional finality failure, or a provider compromise discovered later): an append-only `chain_fact_invalidations` record references the fact, reason and discovery time. Dependent signals are retracted; findings citing the fact are flagged for review. Facts are never deleted.

---

## 5. Snapshot identity and cross-verification

### 5.1 Canonical snapshot identity

| Chain | Snapshot identity | Notes |
|---|---|---|
| EVM | `{chainId, blockNumber, blockHash}` | State reads (balance, code, storage, `eth_call`) are made **at a block hash** (EIP-1898, `requireCanonical: true`) so two providers answer about the *same* state. The provider's finalized head at read time is recorded too |
| Solana (transactions) | `{chainId, signature, slot}` at `finalized` | Transaction facts are immutable once finalized, so different providers can be compared directly |
| Solana (account state) | `{chainId, contextSlot}` from the RPC response context | **Historical slot targeting is not available** for account reads. `minContextSlot` is only a **lower bound**, not a selector of an exact historical snapshot. Agreement requires the **same** context slot (§5.4) |

### 5.2 Verification receipts

Every provider answer used for verification produces an immutable `verification_receipts` row with enough detail to explain later what was compared:

| Field | Content |
|---|---|
| `chain_id` | CAIP-2 ID, which also identifies the **cluster/network** (e.g. Solana mainnet-beta genesis prefix) |
| `provider_id`, `independence_group` | Which provider answered and its infrastructure group |
| `capability`, `method` | Query type (e.g. `account_info` / `getAccountInfo`, `transaction` / `getTransaction`, `eth_getTransactionReceipt`) |
| `params` | Canonical parameters: **address** or **transaction signature/hash**, block hash or `minContextSlot`, encoding |
| `commitment` | Requested commitment/finality (`finalized`, block tag) and the finality reported |
| `snapshot` | EVM `{blockNumber, blockHash}`; Solana transaction `{signature, slot}`; Solana account `{contextSlot}` |
| `requested_at`, `fetched_at` | Request and response timestamps |
| `fields_digest` | SHA-256 over the canonical normalized fields defined by the comparison spec |
| `normalized_fields` | The compared fields (bounded JSON) |
| `decoder_version`, `comparison_spec_version` | For reproduction |

Receipts reproduce **what was compared**. Without raw-response archival they do not allow independent re-decoding of the original provider response; Blacklist does not claim otherwise.

### 5.3 Verification records

`chain_fact_verifications`: `fact_ref`, `receipt_a`, `receipt_b`, `comparison_spec_version`, `result`:

| Result | Meaning |
|---|---|
| `agree` | Two receipts from **different independence groups** at the **identical snapshot identity** (same EVM block hash; same Solana transaction signature and slot; same Solana account **context slot**) with equal `fields_digest` |
| `conflict` | **Same** snapshot identity, different digests. The fact is excluded from scoring and pinning; operators are alerted; shown as "Data under verification". Only used where both providers were expected to describe the same canonical state |
| `inconclusive_snapshot_mismatch` | The receipts describe **different snapshots**, whether their values match or differ. **Never** reported as agreement, and never as conflict |
| `unavailable` | No independent provider could answer for that snapshot (capability or history missing, or same-slot retrieval impossible) |
| `single_source` | No second read attempted (ordinary display) |

> **Implementation note (2026-10-15):** conflicts are persisted and shown as "Data under verification", but operator **alert delivery is not implemented** (it needs an approved channel). This is a known deviation tracked in [Claude's Phase 7–8 review](../reviews/2026-10-15-claude-phase7-8-review.md).

Blacklist **never** reports `agree` for different snapshots, even with byte-identical values, or for providers in the same independence group.

### 5.4 Comparison rules

- **EVM transactions:** compare the receipt's `blockHash`, `blockNumber`, `transactionIndex`, `status` and logs digest. Both providers must report the block as ≤ their finalized head.
- **EVM state:** both reads at the same `blockHash` (EIP-1898); compare the requested fields.
- **Solana transactions:** compare signature, slot, `err`, fee, pre/post balances, pre/post token balances, and the instruction/inner-instruction digest at `finalized`. Transactions are immutable once finalized, so this is a genuine same-snapshot comparison.
- **Solana account state:**
  - Both providers are queried at `finalized` with `minContextSlot = S`, where S is a recorded reference slot.
  - If both responses report the **same** `context.slot` and equal digests → `agree`.
  - If the context slots **differ**, the result is `inconclusive_snapshot_mismatch`, **even if the values are identical**.
  - Blacklist may re-query (bounded, e.g. ≤ 3 attempts) hoping both land on the same slot; it never invents same-slot certainty.
  - When a same-slot pair cannot be obtained, **cross-provider verification of Solana account state is unavailable** for that fact.

### 5.4.1 Consequences for V1 signals

- Solana facts read from account state (e.g. token metadata name/symbol for `token.symbol_impersonation`, mint/freeze authorities, Token-2022 extensions) can support a **scoring** signal only with a same-slot `agree`.
- Otherwise they are shown as **single-source disclosures** with provider and slot. They contribute **nothing**, and the scoring signal is not created (it may be retried later).
- Capability disclosures contribute zero in V1 anyway.
- If a dependable same-slot capability is needed, it must be selected through the provider process (O-3), not assumed.

### 5.5 Where second-provider verification is required

| Use | Required? |
|---|---|
| Transactions pinned as evidence for a finding (moderator tx references) | **Yes** |
| Chain facts behind a scoring `platform_analysis` signal, at signal creation/update time | **Yes** |
| Authority reads for standing mechanism 2 (moderation design §6) | Recommended; staff review may accept `single_source` with the receipt shown |
| Profile display, history lists, balances, ordinary views | **No** (`single_source`, with provider and "as of" shown) |

If the second provider is `unavailable`, the fact may still be shown but cannot be the **sole** basis of a scoring signal or a severe finding.

### 5.6 Independence

Providers are grouped by shared upstream infrastructure in the provider registry (best-effort; documented per provider). Two providers in the same group never corroborate each other. A plain RPC endpoint cannot substitute for capabilities it lacks (indexed history, explorer source verification).

---

## 6. Routing details

- **Cursors are provider-scoped:** `{providerId, cursor, snapshot}`. On failover, pagination restarts from the snapshot boundary; another provider's cursor is never reinterpreted.
- **Cache and single-flight keys:** `{chainId, capability, canonical params, finality, crossVerify, decoderVersion}`.
- **Rate budgets:** per provider key, split statically between the API and the worker while each runs as a single instance. A shared store (Redis) is introduced only when either scales out. Retries are budget-aware and honour `Retry-After`.
- **Outcomes** are distinguished, never conflated: transaction absent, unsupported version, pruned history, provider failure, conflict.
- **Provider responses are untrusted:** Zod-validated, size-capped, and provider-supplied URLs are never followed.

---

## 7. Off-chain and explorer data

- Explorer "verified source code" and ABIs are `external_source` (attributed to the explorer), **not** `chain_fact`.
- Token `metadata_uri` and other off-chain URLs are **never fetched** in V1. Only on-chain name/symbol are shown, marked as untrusted creator-supplied text.
- Provider labels are `external_source` attributed to the provider.

---

## 8. External sources — sanctions (activation deferred)

Sanctions data is **not active in V1**. It activates only after qualified legal review (PRD §10, P-6/P-8) and an accepted ADR. The design below governs that activation.

1. **Meaning:** an attributed designation (`external_source`, publisher named) shown as a **badge**, e.g. "Listed on OFAC SDN (snapshot 2026-09-30)". It is **never** a scam, fraud or moderator finding, and has **no numeric score contribution** unless a later ADR with legal sign-off adds one.
2. **Snapshots:** each download is stored as an `external_list_snapshots` row: source, publisher dataset identifier, publication date, retrieved-at, SHA-256 checksum, parser version, validation result. Activation is an **atomic switch** to the new snapshot. The last-good snapshot is kept. If validation fails, the previous snapshot stays active and operators are alerted. A freshness alarm fires when the active snapshot is older than 48 hours past the publisher's update cadence.
3. **Matching:** exact address match only, after chain-specific normalization. **Chain mapping** uses an explicit, legally reviewed table `external_chain_mappings` (publisher currency code → CAIP-2 chain(s)). Ambiguous multi-chain codes are not mapped without counsel approval. **No inference** from address syntax, and no propagation to the same address on other chains.
4. **Entries:** `external_list_entries` (snapshot ID, publisher entry ID, currency code, mapped chain ID, address, match method `exact`, `first_seen_snapshot`, `removed_in_snapshot`). Full update and removal history is kept.
5. **Delisting:** removal in a newer snapshot removes the badge at activation and records history. Emergency manual delisting (e.g. a publisher correction announcement) requires two staff and an audit record.
6. **No propagation:** a listed address does not change the status of related projects, people, or counterparties.

---

## 9. Test obligations

[testing-strategy.md §8](../testing-strategy.md#8-blockchain-adapter-and-provider-tests): fake `Transfer` logs from non-asset emitters, `transferFrom` by a spender, Solana delegate and permanent-delegate transfers, CPI-invoked transfers, relayed/multisig/AA transactions, failed transactions, fee payer ≠ authority, token-account owner changed after the transfer, same-snapshot agree/conflict, different-snapshot inconclusive, same-independence-group refusal, cursor failover, post-finality invalidation.
