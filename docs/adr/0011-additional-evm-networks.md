# ADR 0011: Additional EVM networks (Base, Arbitrum, BNB Chain, Polygon)

| Field | Value |
|---|---|
| Status | **Proposed** (must not be implemented) |
| Proposed by | Claude, 2026-10-12, at the owner's request during Phase 3 planning |
| Reviewed by | Claude recommendation below; Codex review pending |
| Decided by | Pending (project owner) |
| Affects | PRD §4.1, §4.2; ARCHITECTURE §11 (chain registry, finality), §36; chain-data design; `packages/contracts` `CHAIN_SLUGS`; `@blacklist/chains`; search classification; provider decision O-3 |

## Problem

The owner chose to add Post-V1 EVM networks to project discovery. V1 supports **Solana mainnet and Ethereum mainnet** only (PRD §4.1). Additional EVM chains are Post-V1 (§4.2). `CHAIN_SLUGS` notes that adding a chain is an ADR-level change.

## Evidence

- PRD §4.1, §4.2; `packages/contracts/src/common.ts` (`CHAIN_SLUGS`); contract tests reject unknown chains such as `polygon`.
- The chain-data design ties evidence and authorization to per-chain finality, which differs on rollups (Base, Arbitrum) and on BNB Chain and Polygon.

## Impact

- **Search:** an EVM address is valid on every EVM chain, so an address search **must** always ask for a network. It is never matched or merged across chains (this already applies between Ethereum and Solana).
- **Backend (Phase 8):** each chain needs registry entries (CAIP-2: `eip155:8453` Base, `eip155:42161` Arbitrum One, `eip155:56` BNB Smart Chain, `eip155:137` Polygon PoS), a finality policy (including L2 batch posting and L1 settlement), two independent providers for verification receipts, and fault-injection tests. Provider cost grows with each chain (O-3).
- **UI:** network selectors, badges, unsupported-network copy and methodology coverage statements.

## Proposed solution

1. Add `base`, `arbitrum`, `bnb`, `polygon` to the chain registry and `CHAIN_SLUGS`, with CAIP-2 identifiers and display names.
2. Frontend first (mocks): selectors, badges and fixtures. Every EVM address query requires an explicit network.
3. Each chain is publicly enabled only after its Phase 8 checks pass: finality policy, dual-provider verification and fault-injection suites. Until then the UI shows "not yet supported" for that chain.
4. Assessments, findings and evidence stay chain-scoped. Nothing propagates across chains, even for identical addresses.

## Alternatives considered

- **Keep V1 to Ethereum and Solana (do nothing):** smallest provider and finality surface; the current behaviour.
- **Add only one L2 first (e.g. Base):** lower cost, but still needs the full per-chain gate.
- **Treat all EVM chains as one:** rejected; it violates chain-scoped identity and the "never merge across chains" rule.

## Consequences

Contract and fixture changes, network-chooser UI for every EVM address, methodology updates, provider budget (O-3), Phase 8 test suites per chain, and threat-model notes on cross-chain address confusion.

## Recommendation (Claude)

**Accept in amended form:** the frontend may model these networks on mocks once accepted, but each network is publicly enabled only after its Phase 8 gate (item 3). If launch cost or scope is the priority, keep this Post-V1 as currently documented. Phase 3 ships Ethereum and Solana only: the directory's network list comes from `CHAIN_SLUGS`, so accepting this ADR is a contract change, not a UI rewrite.

## Decision (owner)

Pending.
