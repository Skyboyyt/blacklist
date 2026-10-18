# ADR 0021: Automatic analysis scoring on staging with a second Ethereum provider

| Field | Value |
|---|---|
| Status | **Accepted for staging (owner, 2026-10-18)** |
| Proposed by | Claude, 2026-10-18 |
| Reviewed by | Claude (author); Codex review still open |
| Decided by | Project owner, 2026-10-18: "switch it on and make the automatic scoring"; then, answering the two questions, "Approve for test site" (O-12 staging) and "Approve Infura" (second provider) |
| Affects | ADR 0018 (provider selection, amended here), ARCHITECTURE §15.2–§15.5, chain-data §5.5, data-model §7 (`risk_signals` with `source_type = 'chain_analysis'`), `packages/chains`, `packages/domain/src/risk`, `apps/api/src/presenters`, T-risk wording threats |

## Problem

The V1 ruleset has two automatic analysis factors, `token.symbol_impersonation` (30) and `eoa.delegated_to_flagged` (40), but nothing produces them (Phase 10 plan, decision 2). The owner asked for them to work. Chain-data §5.5 requires every chain fact behind a scoring `platform_analysis` signal to be confirmed by a **second, independent provider**. Staging has one provider per chain, both tagged `unknown-upstream` (ADR 0018), so cross-verification is always `unavailable` and no scoring signal may be created.

## Evidence

- `packages/chains/src/router.ts`: a secondary must be in a different independence group, never `unknown-upstream`. `packages/chains/src/verification.ts` refuses `unknown-upstream` receipts.
- ADR 0018 item 5: "Do not designate an independent secondary until its upstream basis is documented."
- `packages/domain/src/risk/service.ts`: `chain_analysis` signals are already supported by the schema (migration 0008) and by suppressions, but no code creates them.

## Proposed solution

1. **Second Ethereum provider (amends ADR 0018).**
   - Infura (MetaMask Developer) Free, `https://mainnet.infura.io/v3/<key>`, from the optional API-only secret `INFURA_ETHEREUM_API_KEY`.
   - It is used for account, token and contract reads only. It has no indexed history and no balances.
   - **Independence groups:** Alchemy becomes `alchemy` and Infura becomes `infura`. They are separate companies running their own node fleets. This is the documented basis ADR 0018 asked for; it is best-effort and is recorded here, not assumed.
   - Without the key, nothing changes: Alchemy stays the only source, its group stays `unknown-upstream`, and cross-verification stays `unavailable`.
   - Same budgets, timeouts, method allowlist and response caps as the existing providers; the Infura origin is added to the fixed origin list.
2. **Feeders (Ethereum only), run when an address is researched:**
   - **`eoa.delegated_to_flagged`:**
     - Applies when the wallet's EIP-7702 delegate address has a published **high or severe** finding on Blacklist.
     - The wallet's account read must be cross-verified (`agree`, final, two independence groups, same block hash) and still show that delegation.
     - The signal's source is the wallet and delegate pair; its evidence references are the delegate's published finding IDs.
     - The signal is retracted when a verified read shows the delegation removed or changed, or when the delegate no longer has a published high or severe finding. That happens on the next view, or immediately when that finding is suspended or reversed.
   - **`token.symbol_impersonation`:**
     - Applies when an ERC-20's on-chain symbol, after Unicode normalisation and a small lookalike-letter map, equals the symbol of a token on a fixed, reviewed list of well-known Ethereum tokens, while its address is not that token's canonical address.
     - The token read must be cross-verified (`agree`).
     - The list is code (`packages/domain/src/risk/canonical-tokens.ts`), changed only by reviewed PRs.
   - **Writes:**
     - Signals and the recompute happen in one transaction, append-only, through the existing `recomputeSubject`. A repeat view with the same facts changes nothing.
     - An active admin suppression for that address and factor makes a new or re-activated signal `suppressed`.
   - **Not done:**
     - Solana impersonation: classic SPL mints have no on-chain symbol, and Metaplex metadata is not read.
     - Signals are never created from a single-source, inconclusive or conflicting read.
     - Association remains off.
3. **Public bands on staging (O-12, staging only).** The owner approved the §15.3 proposal for staging, unchanged; production calibration stays open. The owner sets `RISK_PUBLIC_BANDS=true` on the Render API.

## Alternatives considered

- **Do nothing:** the factors stay inert; the owner explicitly asked for them.
- **Score from a single provider:** violates chain-data §5.5. One faulty or compromised provider could brand an innocent wallet. Rejected.
- **Alchemy for Solana as a Helius secondary:** Solana has no feeder yet (no on-chain symbol), so it adds cost for nothing. Deferred.
- **A public endpoint as the secondary:** ADR 0018 forbids using it to claim independence. Rejected.
- **A worker job instead of view-time feeding:** the Render Free worker sleeps (Phase 10 plan deviation). View-time feeding with idempotent, append-only writes is simpler. A periodic re-check can follow.

## Consequences

- A wallet delegated to flagged code can now show **Moderate** (40). The explanation states that its owner is often a victim. A fake well-known-token symbol shows **Moderate** (30).
- **Provider cost:** a delegated wallet whose delegate is flagged, or a token whose symbol matches the list, triggers one cross-verified read on Infura's budget. Other pages add no Infura calls.
- **Signals depend on someone viewing the address:** an address nobody views is not assessed automatically. This is documented in ARCHITECTURE §15.5.
- **Follow-ups:**
  - Codex review of the feeders;
  - golden cases for the two factors;
  - O-12 production calibration;
  - a Solana symbol reader (Metaplex) with a same-slot secondary.

## Recommendation (Claude)

Accept for staging. The change keeps every V1 invariant: two-provider confirmation, append-only signals, suppressible, no association, no weak signals, and no numeric public score.

## Decision (owner)

Accepted for staging, 2026-10-18 (see "Decided by"). Production stays subject to O-4 and O-12.
