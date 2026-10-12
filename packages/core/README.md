# @blacklist/core

Pure, dependency-free primitives safe for **both browser and server**. **Status:** vocabulary types and constants only.

## Contents

- [src/chain.ts](src/chain.ts) — branded `ChainId`, `ChainSlug`, `Address`, `TxHash`, `ChainAddress`, `Finality`.
- [src/provenance.ts](src/provenance.ts) — the six provenance categories (PRD §1.1).
- [src/risk.ts](src/risk.ts) — Risk Score range (0–100, **higher = more risk**), bands, confidence.

## Rules

- No runtime dependencies, no I/O, no secrets, no Node-only APIs.
- Imports nothing from other workspace packages.
- Changing provenance categories, score direction, or band ranges is an architecture change (ADR required).
