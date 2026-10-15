# ADR 0018: Phase8 provider selection (O-3)

| Field | Value |
| --- | --- |
| Status | **Proposed — owner direction approved; Claude review and O-3 evidence pending** |
| Proposed by | Codex, 2026-10-14 (Europe/London) |
| Scope | O-3 capability, archival, independence, cost and terms evaluation; no live deployment |

## Problem

Phase8 is authorized, but O-3 has no accepted provider selection or RPC credentials. Research needs real Ethereum/Solana node reads; Ethereum wallet history additionally needs indexing. Two endpoint URLs are not proof of independent infrastructure. Free service availability is not an archival or same-slot guarantee.

## Evidence and capability matrix

Read-only evaluation on2026-10-14; no subscription or account created.

| Candidate | Capability evidence | Cost/quota evidence | History/finality/independence limits | State |
| --- | --- | --- | --- | --- |
| Helius | Official RPC documentation retrieved200; standard Solana RPC capability candidate | Official pricing retrieved200: Free USD0/month,1Mcredits/month,10RPS. Premium products/overages are excluded | `getSignaturesForAddress` is address activity, not a complete wallet-owned-token index. Historical reads, retention and per-method charges must be probed using the owner's actual Free key. Finalized transactions may be compared by signature/slot; account reads only by identical returned context slots. Vendor group `helius` is provisional; independence from any secondary requires evidence | Recommended Solana primary, pending approval/credential/capability tests |
| Alchemy | Approved architecture candidate for Ethereum RPC/indexed transfer history | Pricing and transfer-history documentation requests returned HTTP403 here; current Free limits, credit costs, archival entitlement and terms **unverified** | Ordinary RPC cannot provide indexed wallet history. Do not enable enhanced history or archival capabilities merely from a provider name. Group `alchemy` is provisional; secondary independence requires evidence | Recommended Ethereum candidate, selection cannot be closed until current plan/capability evidence is obtained |
| Solana Foundation public mainnet endpoint | Official cluster documentation200; actual `getGenesisHash`200 matches mainnet genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` | Public endpoint; variable IP/method/connection/data limits, no paid resource activated | Best-effort, may block production traffic; pruning and same-slot capability not guaranteed. Underlying upstream independence is unverified; never use it to claim independent corroboration | Read-only evaluation endpoint only; not a selected production provider |
| PublicNode Ethereum/Solana | Read-only RPC probes and official site returned HTTP403 from this environment | Quotas/current terms unverified | No reliability/archive/indexing/independence claim | Not selected; environment/provider access blocker |
| Other secondaries/explorer providers | No verified credentials or current capability/terms evidence | No paid services authorized | No invented secondary or explorer source verification | Deferred selection; cross-verification must return unavailable until independently documented providers exist |

Actual environment binding names were checked: no Alchemy/Helius/RPC credential is available. Existing Render/Neon/Vercel/Resend bindings are unrelated and remain separate. Do not paste provider keys into chat, source, fixtures or reports.

## Impact

Provider-independent registry, adapters, strict response handling and verification tests can proceed. Production provider activation and the real-provider completion gate remain blocked. Missing or pruned history must be explicit; no empty-history fabrication. Missing independent verification cannot authorize evidence pinning or scoring. Phase7 security/coverage/audit and hosted identity blockers remain open.

## Proposed solution

1. Obtain owner/Claude review of Helius Free for Solana and Alchemy Free as the Ethereum candidate. Before closing O-3, capture actual plan restrictions, method capabilities and applicable terms; verify history/archival access with protected credentials and read-only probes.
2. No subscriptions, payment methods, upgrades, account purchases or paid fallback. Base cost only after verified Free-plan selection; no assumption that quota exhaustion cannot bill. Use conservative static API/worker budgets and stop rather than upgrade.
3. Configure only approved fixed HTTPS origins/methods server-side. Credentials remain protected and never enter web bundles. No arbitrary RPC URL, redirects, provider-supplied URL fetching, websockets or monitoring loops.
4. Preserve5second lookup/10second history timeouts, at most2 idempotent budget-aware retries, bounded response sizes/concurrency/cache and provider-scoped cursors. Enable only proven capabilities.
5. Do not designate an independent secondary until its upstream basis is documented. Unknown upstreams share a conservative group. Cross-verification unavailable or inconclusive remains ineligible for verified evidence/scoring.

## Alternatives

- Public endpoints only: useful for read-only diagnostics, weaker availability/history; insufficient for the entire requested Phase8 completion gate.
- Paid RPC/indexer: no purchase authorization; not selected.
- Own node/indexer: changes approved architecture, not selected.
- Enable fake/mock data: forbidden.

## Decision

Owner approved the proposed Free-provider direction via explicit asynchronous reply on 2026-10-14. Actual Alchemy plan/history evidence, both RPC credentials, independent secondary selection and Claude review remain pending. O-3 is not closed and no live provider is activated. This ADR does not change chain evidence, privacy, moderation, risk, authentication, paid hosting or live deployment policies.

## Recommendation (Claude)

**Amend, then accept as provisional single-source display providers** (Claude, 2026-10-15; [review](../reviews/2026-10-15-claude-phase7-8-review.md) CR-03, CR-06–CR-08). Helius Free and Alchemy Free tagged `unknown-upstream`, all capability flags off by default, no change to chain-data semantics. Amendments:
1. State that without a documented independent secondary, cross-verification is always `unavailable`, which blocks pinning transaction evidence and creating scoring signals; name that as a dependency of those phases.
2. Define the budget: a window matching the provider plan (not a lifetime counter), a per-request cap on provider calls, and the API/worker split.
3. Make CR-03, CR-06, CR-07 and CR-08 conditions for setting `RESEARCH_ENABLED=true`.
4. Remove or justify the public `api.mainnet-beta.solana.com` endpoint in the allowlist.
5. Move the Render environment-group narrative into operations docs.

The provider code was merged while this ADR is Proposed (AGENTS §6); record that as an explicit owner waiver. O-3 stays open.

## Protocol inspection follow-up

### Credential and live evaluation continuation — 2026-10-14 UTC

The owner saved both protected keys in the existing Render environment group. Readback confirms four names (two provider keys plus runtime/migration URLs), **zero service links**, and no provider/migration variables on API or worker. Do not link this mixed operator group to a service; eventual approved rollout needs API-only provider settings while migrator storage remains isolated. No credential value is included in evidence or files.

Bounded read-only evaluation using saved keys confirms Alchemy chainId1 and Helius mainnet genesis; real canonical Ethereum account/balance/block/history pagination/transaction and Solana account/context/slot/block/history pagination/successful and failed v0 transactions parse successfully. One current Solana transaction returns-32015 (unsupported version); it remains explicitly unavailable, not fabricated or silently upgraded. These probes establish sampled method access, not complete archival history, actual Free billing/credits/terms or secondary independence. Keys are no longer missing, but O-3 remains Proposed pending Claude review and outstanding provider evidence. Runtime activation flags stay off and no provider subscription, migration or deployment occurred.

Read-only GitHub retrieval of Alchemy's official `alchemyplatform/alchemy-sdk-js` `src/types/types.ts`, `src/api/core-namespace.ts` and `src/internal/core-api.ts` confirmed the `alchemy_getAssetTransfers` request shape, hexadecimal `maxCount`, directional address filters and opaque `pageKey`. Source object IDs were respectively `20bc30b8c7d983a2f602ca78f732b5a7ecb489da`, `f0a062e4686a33453e2852a7917c14c6505fd39a` and `be014d315aef2b2029fe41f2cb69d93565530638`. This is protocol evidence, not actual account entitlement, archive coverage, reliability or terms verification. The implementation therefore keeps enhanced Ethereum history behind `ALCHEMY_INDEXED_HISTORY_VERIFIED=false` and provider activation behind `RESEARCH_ENABLED=false` / `RPC_PLAN_VERIFIED=false`.
