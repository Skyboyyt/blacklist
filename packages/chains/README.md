# @blacklist/chains

Server-only blockchain abstraction. **Status:** Phase8 registry, family normalization/decoders, RPC clients, bounded router, cursor and receipt implementation exists locally on the review branch. O-3 and live provider validation remain blocked; runtime disabled by default. See [Phase8 report](../../docs/reviews/2026-10-14-phase8-implementation.md) and [operations](../../docs/operations/phase8-research.md). Types and ports preserve normative revision3 semantics.

Normative semantics: [docs/design/chain-data.md](../../docs/design/chain-data.md) (ADR 0003).

## Responsibilities

- **Chain registry:** CAIP-2 IDs, slugs, family, finality policy, enabled capabilities. **Constructs the `ChainId`/`ChainSlug` brands.** V1: `eip155:1` (`ethereum`), `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (`solana`).
- **Family adapters** (`evm`, `solana`), with **no network I/O**:
  - parse/normalize/format addresses and hashes (**construct `Address`/`TxHash` brands**);
  - classify input;
  - decode provider payloads, including each transfer's **movement evidence level** and **authorization basis**.
- **Provider clients:** capability ports. Each declares its `independenceGroup`.
- **Router** (`ChainDataService`):
  - capability routing, failover, timeouts, ≤ 2 retries on idempotent reads, circuit breakers, budgets, single-flight, caching;
  - **snapshot-bound cross-verification** producing receipts;
  - provenance on every result.

## Rules

- Domain code uses `ChainDataService` only.
- Never lowercase Solana addresses. EVM: lowercase storage, EIP-55 display, reject bad checksums.
- Only finalized data may be pinned or scored.
- `agree` only for the identical snapshot from different independence groups. Solana account reads at different context slots → `inconclusive_snapshot_mismatch` even with identical values; no same-slot pair → `unavailable`, no scoring signal.
- `unknown` authorization contributes zero to anything downstream. Direction is not authorization.
- Explorer verification and provider labels are `external_source`. Metadata URIs are never fetched.
- Provider responses are untrusted: Zod-validated and size-capped. Keys come from `@blacklist/config` and are never logged.
- Cursors are provider-scoped; cache keys include finality, `crossVerify` and decoder version.
- May import: `@blacklist/core`. Must not import: `db`, `domain`, apps.

## Implemented layout (Phase 8 review branch)

```
src/
  ports.ts, types.ts          normative contracts
  registry.ts                 chain definitions → ChainId/ChainSlug brands
  adapters/                   family normalization and transaction decoding
  providers/                  bounded RPC transport, policy and capability sources
  router.ts                   ChainDataService, cache, failover and circuits
  verification.ts, cursor.ts  receipts/comparison and encrypted provider cursors
```
