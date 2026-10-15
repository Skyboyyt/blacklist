# AI_HANDOFF.md

Read this first at the start of every session. Update it at the end of every session (AGENTS.md §11). Report results faithfully: if something was not run, say so.

---

## Status

| Field | Value |
|---|---|
| Project | **Blacklist**: Web3 anti-scam, wallet intelligence, project verification and investigation platform |
| **Current Stage** | **PHASE8 CONTINUATION TESTED — PRIMARY RPC CHECKS PASS, REQUIRED SECURITY/INDEPENDENCE GATES OPEN; UNDEPLOYED** |
| Current phase | Phase8 review branch `feat/phase8-chain-research`, based on main5967afa. Phase7/PR7–11 merged; canonical source038ed7f unchanged across API/worker/web. Phase6 repairs, prior dirty menu audit and preservation stash retained. |
| Authorized phase | Owner explicitly authorized Phase8 chain data/research implementation on a separate main-based branch, commit and review PR; no automatic merge/live deployment, paid provider or infrastructure purchase, Phase9/10 or activity streams. |
| **Primary Engineer** | **Claude** |
| **Secondary/Review Engineer** | **Codex** |
| Last agent | Codex: meaningful identity/staff/email/research coverage added; all backend floors now pass; conflicting receipts retained in public research/operator reconciliation. Owner explicitly authorized merging PR12 despite provider/hosted/security blockers; actual merge receipt follows. Phase8 stays open |
| Last updated | 2026-10-14 (Europe/London) |


## Claude review of Phases 7–8 as merged — 2026-10-15

- **Scope:** `origin/main` `c11dcca` (PRs #7–#12) against `chore/initial-repository`. The review is read-only on code. The only changes are the review file and Claude's recommendations in ADRs 0013–0018. Branch `claude/amazing-goodall-drtbc9`, restarted from `main`. Full report: [docs/reviews/2026-10-15-claude-phase7-8-review.md](docs/reviews/2026-10-15-claude-phase7-8-review.md).
- **Actual checks (Claude):**
  - `pnpm install --frozen-lockfile` and `pnpm check` exit 0: 81 contract, 61 chain, 52 backend non-database and 405 web tests, plus lint, types and build.
  - `pnpm audit --prod` is clean. The full audit has one high, dev-only advisory (`braces`).
  - **Not run:** the database integration suites (no Docker here), coverage, E2E, and any cloud or provider read.
- **Findings:**
  - **High:**
    - CR-01: one throttle identity for every user, so anyone can lock everyone out of login, registration, reset and research. There is no human verifier and the web tier sends no client IP.
    - CR-11: process. Provider code came from a Proposed ADR, ADRs went live without Claude's review, and Phase 6 and Phase 7 exits are unrecorded.
  - **Medium:**
    - CR-02: re-auth is unthrottled.
    - CR-03: research writes permanent receipts and its budget never resets.
    - CR-04: the public worker `/healthz` can burn free quotas.
    - CR-06: item-specific failures trip a provider-wide circuit breaker.
    - CR-09: ADR 0013 gaps are visible in code.
    - CR-10: real-user data sits in staging without retention.
    - CR-12, CR-13: stale documents and handoff.
    - CR-14: database D-1 and D-2.
  - Smaller items are under CR-15.
- **ADR recommendations recorded:**
  - 0013: amend, keeping fail-closed behaviour.
  - 0014: amend, then accept.
  - 0015: accept with amendments.
  - 0016: amend; accept only with conditions (CR-01, CR-02, CR-05 fixed first).
  - 0017: accept with amendments.
  - 0018: amend, then accept as provisional single-source providers. The provider merge needs a recorded owner waiver.
  - **The owner decides; nothing is accepted by this change.**
- **Next:**
  1. Fix CR-01 and CR-02, or restore a registration gate until they are fixed.
  2. Owner waivers or phase closure.
  3. Research-enable conditions.
  4. Database D-1 and D-2.
  5. Documentation consistency pass and handoff reset.
  6. Pending finding responses, R-04 first.

## Phase8 final continuation — coverage and conflict evidence — 2026-10-14

**Authorization/status:** owner explicitly replied “Merge PR #12 into main despite the disclosed blockers” after being told main may trigger Vercel deployment. This supersedes review-only/no-merge instructions for PR12 specifically. Complete local checks/secret scan, commit/push, then merge exact reviewed head. No backend activation/cloud migration/paid resource/Phase9 or readiness claim. Actual publication/merge receipt follows, never assume it happened. Owner's hosted activation/login/logout/reset results are still pending.

**Implemented/files:** retained all existing branch work, frontend/auth/worker/deployment contracts, Phase6 repairs and Phase7 stash. Added15modular test/helper files under `tests/backend-acceptance/src` covering login/password/session/mailbox/token/notification/throttle/staff assurance/reset/roles/private reads/operator/SMTP/Argon2/research states. New signed synthetic WebAuthn tests use the real verifier; seeded keys/synthetic UV are not physical hardware/enrollment proof. Actual loopback nodemailer SMTP tests verify replies, not production TLS or real mail. Injected RPC/human-response ports are synthetic only. Existing tests, floors, dependency/security policies and assertions remain.

**Conflict repair:** `packages/chains/src/ports.ts/router.ts/router.test.ts` preserve the internal bounded finalized independent conflict pair. `packages/domain/src/chaindata/{repository,index,reconciliation}.ts` and research/service.ts revalidate exact reference/capability/chain and comparison then write immutable receipts/verification atomically, no disputed cache/pin/invalidation. New research-conflict integration file and existing reconciliation tests verify idempotent concurrent retry, forged/shared/mismatched inputs, rollback, privacy and original pin/barrier preservation. Router and operator regressions failed before fixes. No schema/dependency/new route or notification provider introduced. Operator conflict delivery still needs an approved channel/routing/worker contract; durable records alone are not alert delivery.

**Actual checks:** complete backend189tests/38files PASS, **83.57%branches/all global/package floors PASS**, complete-map guard PASS/zero omissions. Earlier185/37/83.50%full suite passed before this subsequent source fix, not substituted for it. Root`pnpm check`599units/format/lint/all types/Next build PASS before operator follow-up; final full workspace types/lint/backend build/bundle4 reruns PASS after operator follow-up. Chains final61/80.67% PASS; browser418PASS/82existing device-specific skips, mocks only and frontend unchanged. Production audit0PASS/full audit1unpatched high devbracesFAIL; no suppression. Fresh protected-value scan8values/3252source/browser files0matches; earlier9/3812also0. Independent reviewer source-reviewed test additions/conflict patch, found repaired operator gap; no independent DB/cloud/full-coverage reproduction or Claude approval. See [report](docs/reviews/2026-10-14-phase8-continuation.md), [evidence](docs/evidence/2026-10-14-phase8-continuation.json), [independent review](docs/reviews/2026-10-14-phase8-independent-review.md).

**Provider/database/cloud:** actual saved Alchemy/Helius keys pass bounded real mainnet/public block/wallet/history/v0 transaction/fee/time reads (Ethereumchain1, Solanamaingenesis; supported success/failure, unsupported newer version honest unavailable). Single-source only; keep plan/index/provider activation flags false. Mixed provider/runtime/migrator group readback0links, keep isolated. Existing API/worker FreeFrankfurt/main/source038ed7f/autodeployoff, restricted blacklist_app/directverify-full and no direct provider/migrator values; Vercel unchanged before publication/no forbidden variables. Additive0004pin timestamp SHA4543f992ecbbdb7ecd0e62530dd59499641d7ec10614f369f4089f1655819db2, all9prior SQLbytes unchanged, local ledger10/tables34. No cloud SQL/private record read/mutation. Direct verified-TLS Neon catalog remains blocked/live ledger unverified. Actual postmerge Vercel source must be read back separately; merging is not backend rollout.

**Failures/resource evidence:** prior106/64.90% and159/75%,184/82.59%missing package floors are historical failures now repaired through additional assertions. S12 transient ratio1.655/full184PASS1FAIL corrected by isolated resources and whole unchanged-suite rerun, not weakened samples/floor. Earlier raw TS omissions, locks/interrupted/ENOSPC/PG readiness and new test fixture/type/lint errors remain documented. Coverage reports now on separate /tmp volume, copied for unchanged guard. Only own generated Next cache archived/file-size verified then removed; existing528Docker volumes/Compose/stash/ignored credentials preserved. Fixtures512MiBtmpfs/own-container teardown, logical restore not managed recovery.

**Open blockers/next:** Claude O-3/recovery ADRreview, actual Free-plan/terms/archive credits, independent same-snapshot secondary evidence/live reconciliation, operator notification decision, unpatched dev advisory, hosted owner identity results/cold-idle/session/log/managed recovery/retention/legal/monitoring gates. Production report/signal/finding retraction services are later phases; do not fabricate them. Merge only under the latest explicit owner instruction, preserve flags, then verify GitHub/cloud/source status and record it. Phase8 completion remains false; no Phase9.

## Phase8 validation and review handoff — 2026-10-14 (historical checkpoint)

**Actual GitHub publication:** implementation commit `e5cfaec8ee7fc01bd1e96ab95526fe805032af84` committed/pushed to `feat/phase8-chain-research`; [draftPR12](https://github.com/Skyboyyt/blacklist/pull/12) OPEN, base main, correct head verified. No GitHub status checks/workflow runs are present; local results are not a CI-pass claim. No merge or main push. Post-push Vercel readback found0matching recent review-branch deployments; successful Phase8 deployment false, prior canonical deployment retained. Render auto-deploy off and original sources/settings unchanged. Publication handoff/evidence follow-up is documentation only, scoped to this same branch. No provider activation, cloud migration or paid operation.

**Scope/state:** implemented on `feat/phase8-chain-research` from current main5967afa, confirmed unchanged through final Git readback. Owner approved Helius/Alchemy Free direction; ADR0018 remains Proposed, Claude review/actual Alchemy Free-plan/archive/history/terms/independent-secondary evidence and both protected key bindings missing. Phase8 is not implementation-complete under the owner's real-provider completion requirements, not deployed or production-ready. No merge, cloud migration, settings/role/password change, service activation, paid resource, Phase9/10 or activity stream. Current live source038ed7f and canonical Vercel alias/read-only metadata remain unchanged; both Free Frankfurt Render services main/auto-deployoff/not suspended, restricted direct verify-full app DB settings preserved.

**Implementation/files:** `packages/chains` registry, EIP55/Base58 family adapters, EVM/Solana transaction/authority decoding, fixed/mainnet-validated RPC clients, canonical metadata/contract/token/native reads, gated Ethereum index history and token discovery, Solana signature/directional history/SPL balances, budgets/retries/timeouts/size caps/circuits/cache/single-flight/cursor encryption and exact-snapshot receipt comparison. `packages/domain` public research orchestration and parameterized atomic receipt/verification/cache repository; expired public cache cleanup is bounded, immutable receipts/user data never purged. `apps/api` thin validated public/internal read routes, weighted abuse controls, safe presenters and allowlisted provenance (no provider IDs/URLs/keys). `packages/contracts` strict read DTOs and unavailable-section/network-snapshot checks. Web server typed non-mock adapter, neutral source/snapshot/freshness/coverage views, history/token/contract/balance details and honest dashboard/menu fallbacks. Existing appearance/navigation/auth/mock flows retained. Runtime/config API-only default-off flags and protected key names in `.env.example`; no provider key on web/worker/build. Root/project `vercel.json` disables only this review branch's automatic deployment. Dependency/data-model/threat/API/operations/ADR/report docs updated; original menu audit/evidence carried forward intact. See [report](docs/reviews/2026-10-14-phase8-implementation.md) and [evidence](docs/evidence/2026-10-14-phase8-validation.json) for file groups and exact outcomes.

**Migrations:** new generated0005 plus hand0003 add7tables; nine entries/34tables locally. All seven original SQL files byte-identical to main; no Neon SQL. New receipt digest/reference/finality/snapshot/independence guards and append-only grants/triggers; pins bind the full normalized transaction, including transfers, to independently compared finalized fields. Transfer rows must match a pinned movement. Positive valid pins/movements and negative invented/changed/pending/shared/unknown/mismatched/wrong-reference rows tested. Operator verification now requires9/34 and read-only/immutable grants; restore and idempotent migration tests retain exact hashes/denials. Recovery is preserve/disable research/forward fix, not destructive down migration or old broad-grant migrator replay.

**Actual checks:** frozen install PASS; root `pnpm check` PASS at the frontend/provenance checkpoint: formatting/lint/all types, **588unit assertions** (chains56/contracts81/backend46/web405) and Next production build. Final backend-only full-normalized receipt/pin tightening subsequently passed56chain assertions,5migration/storage/API integration assertions,2positive/negative storage assertions, focused types/lint and backend build. Complete maintained backend integration checkpoint **55PASS**, then final focused changed-path reruns above. Dedicated chains75% branch-floor command **56assertions PASS /80.24%branches PASS**. Required backend coverage clean sequential run **55assertions PASS, commandFAIL60.04%/75%** and identity/access/audit/staff/DB/API/worker floors; runner also reports five unimported TypeScript entry/operator parse/remap omissions, so its measurement is incomplete and not a passing gate. No thresholds/exclusions/assertions/scanners weakened. Earlier counts7/27/operator permission assumptions, fixture500vs503, finalized EVM receipt commitment and branded fixture typing were repaired and rerun. An overlapping coverage process was rejected by its directory lock; resource-contention storage timeout/stale loaded DTO assertion corrected in a clean sequential rerun. Coverage TS parsing diagnostic remains unresolved and disclosed.

**Frontend/security evidence:** Next production/mock builds and4bundle exclusions PASS; scanner expanded to new RPC names. Complete systemChromium154 desktop/mobile mock suite **418PASS/0FAIL/82existing intentional skips** (19.6minutes), no assertion/timeout change. Focused non-mock client/UI **6PASS**; contracts81PASS. Drizzle generation reports no schema drift. Current changed source112files pinned network-disabled redacted Gitleaks0; full all-ref/history scan37commits rawFAIL4matches, exactly the four previously reviewed fictional/prose findings,0new historical findings, no suppression. Protected runtime-value check6distinct values/804source+browser files0matches; no credentials/privateIPs/records emitted. Production auditPASS0; full auditFAIL1high existing devbraces GHSA-vfj7-8cjw-p6xm. Final documentation/publication delta scanner recorded separately. No exposed actual credential identified. Actual external logs remain unavailable/untested, not inspected by proxy metadata checks.

**Blockers/limits:** protected Alchemy/Helius keys absent; read-only provider smoke script exit2blocked, no live Helius/Alchemy lookups. Current Alchemy plan/entitlements/history/archive/terms, independent secondary/same-slot evidence and Claude review pending. Directional/history/token inventories explicitly bounded/incomplete; Token2022 extension inventory, NFT decoding, explorer verification/trace/deployer/proxy/history completeness unavailable. Post-finality invalidation storage exists; automatic pinned-fact reconciliation remains unimplemented, with no automatic pin or risk consumption enabled. Public findings/labels/assessment/evidence remain unavailable; no zero-findings/guilt/association scoring. SSR currently shares gateway throttling until trusted end-user prefix propagation is verified. Static per-process key budgets reset on restart, not monthly billing caps. All existing Phase7 hosted valid-token/session/idle-cycle/log/managed restore/retention/legal/monitoring/ADR0013/O6/P13/independent review gates remain open. Firefox/WebKit/live-provider/live-browser/assistive-device and real managed recovery untested. Earlier Phase7 acceptance status is not silently promoted.

**Next/publication:** commit/push and draft PR targeting main are expressly authorized in the Phase8 brief; final actual URL/head readback is appended after execution. Do not merge/deploy or approve Phase9/10 automatically. Securely enter both missing provider bindings in environment settings, then obtain Claude/O-3 review and execute read-only real-provider capability/snapshot probes; complete missing reconciliation/security/coverage/hosted identity work before rollout. Reusable full onboarding startup instructions and missing secret requirements are saved as a draft; not applied/published, no key values requested in chat.

## Phase8 authorized implementation checkpoint — 2026-10-14

Owner explicitly authorized the Phase8 brief: Ethereum/Solana mainnet, approved registry/adapters/providers, snapshots/receipts/research, reviewed additive migrations, security/fault tests, dedicated branch and review PR, no merge/deploy. Branch `feat/phase8-chain-research` starts from freshly fetched main `5967afa`; prior uncommitted menu audit files/handoff carried forward intact and older Phase7 preservation stash retained. Claude remains architecture owner. Phase7 required coverage/full development audit, hosted signed-in identity/idle-cycle/recovery/restore/independent review and other recorded launch blockers remain open; none waived.

O-3: proposed ADR0018 records evidence/limits, not a closed decision. Owner approved Helius Free for Solana and Alchemy Free as Ethereum candidate, conditional on actual plan/history verification and no paid fallback. Claude review pending; no RPC bindings currently available. Helius official pricing200 confirms1Mcredits/month/10RPS/USD0 Free; Solana official read-only genesis probe200 confirms mainnet, not selected as production provider. Alchemy docs/Pricing and PublicNode site/probes HTTP403 here; archive/indexing/terms/independent-secondary capabilities unverified. Existing four infrastructure secret bindings preserved; environment draft adds only named protected `ALCHEMY_ETHEREUM_API_KEY` and `HELIUS_RPC_API_KEY` requirements at their exact provider HTTPS destinations. No keys entered/printed, no accounts/purchases/live settings/deployment. Draft persistence is not publication or successful binding.

**Local implementation in progress:** pinned approved viem2.57.3 (2026-10-04) and @solana/kit8.4.0 (2026-09-28), both older than7days; Zod/existing toolchain. Strict release/trust/build policies unchanged, no build-script approval needed; latest versions were too new and not selected. Pure mainnet registry, EIP55/base58 identity, Ethereum/Solana transaction decoding (integer strings, evidence/authorization separated), strict bounded fixed-origin RPC transport/cancellation, conservative primary source clients, verification receipts/digests and same-snapshot/independence comparisons, bounded caching/single-flight/circuit/budgets/retries and scoped cursors are being implemented and tested. Runtime research defaults disabled; requires verified plan flag plus both protected keys. No independent-provider certainty or complete history/Token2022 metadata/unknown transfer claim fabricated. Thin research API/domain/presenter wiring and explicit unavailable sections are in progress; public product array placeholders will be suppressed by availability presentation rather than read as zero findings.

**Additive migrations under local review:** generated `0005_violet_stardust.sql` plus new hand `0003_chain_research_foundation.sql`, metadata snapshot/journal appended (previous seven SQL files untouched). Seven tables: chains, receipts, verification records, pinned finalized transactions/transfers, invalidations and shared public chain cache. Schema/grants/triggers preserve Phase7 tables, protect append-only and finalized independent pinning. No cloud SQL or migration applied. Local disposable migration/restore two tests PASS on the earlier checkpoint; additional negative SQL tests and final reruns still pending. Initial old exact table-count assertion failed27→34, updated to require all27existing plus7new tables; checksum/restore assertions retained. Initial missing-module test runs (0tests,2failed suites) and intermediate strict typing errors were recorded and corrected as implementation progressed; current overall pass/build/security status is **not yet final**.

**Next work:** complete mocks-free API/UI and provider-independent DB/negative/fault coverage; fix implementation failures and run full suites/build/coverage/audit/scanners. Secure RPC keys/current plan evidence are required for real Helius/Alchemy completion tests; independent secondaries remain unavailable. Produce detailed implementation/security evidence, update this checkpoint, commit and open review PR without merge/deploy. No Phase8 completion or production-readiness claim.

## Menu/dashboard failure audit — 2026-10-13 UTC

Owner reports all menu features failing to load and confirms the failure after sign-in. **Confirmed cause:** Phase7 implements identity/account/staff foundation, while non-mock research methods still reject `ApiNotConnectedError` and member submission/notification methods return unavailable. Dashboard and reports index call rejecting `getDashboard`; projects/search/rankings likewise lack their live data implementation. Menus have valid Next links, but the approved later-phase backend services behind them are absent. Real profile/security endpoints exist; no successful private hosted interaction is claimed. Site hosting is live, not a complete product launch.

Fetched current main and independently read back merged PR11 at `5967afa6eee30c5359b9a9f26a1c6bd79f543772`; application/dependency trees exactly match deployed `038ed7f`. Clean prior repair branch and existing stash preserved. Audit branch `docs/menu-feature-audit` contains documentation/evidence only; no source repair, migration, DB/role change, real-user session/password access, mail send, cloud setting, paid service, commit/push/merge or deployment occurred in this audit. New files: `docs/reviews/2026-10-13-menu-feature-audit.md`, `docs/evidence/2026-10-13-menu-feature-audit.json`; this handoff updated.

**Current executed checks:**19 anonymous canonical document requests:18HTTP200/1HTTP500 (`/scoreboard`); five responses carry server-error digest markers (populated search, projects, scoreboard, dashboard, reports). Dashboard/reports also show anonymous sign-in UI; an HTTP200 streamed error is not a successful product-flow check. Public static documents have no observed server error; other private destinations show sign-in. API and worker real health200. Existing live negative smoke11/11PASS (private/staff denial, anonymous allowlisted viewer, Origin/input protection, headless absence, proxy/forged-header controls, internal viewer). Focused navigation/live-adapter10testsPASS; full web398tests/42filesPASS. The focused10 are included in398, not additional unique tests. Unit/mock success does not validate a missing live backend. Sanitized route observations saved without HTML/user records. Prettier evidence JSON check and `git diff --check`PASS; Markdown files use the repository's existing formatter-ignore policy.

**Findings:** absent product-data features; known missing adapter becomes generic server error/retry; potential5second SSR viewer cold-start mismatch with Free Render and repeated layout/shell reads. Last concern is source-level and not reproduced here because API was awake; live signed-in clicks and valid-cookie behavior remain untested. External Chromium CA trust blocker persists, no verification bypass. No auth/privacy/provenance/risk/moderation/revision/appeal/reversal invariants changed. Prior required coverage/full-development dependency audit and architecture/production readiness blockers remain unresolved; integration/build/audits not rerun for documentation-only audit.

**Next step:** repair honest unavailable-page presentation and separately reproduce synthetic signed-in cold-start behavior. Explicit owner Phase8 authorization plus Claude architecture ownership are required before research backend implementation (AGENTS.md §1 and ARCHITECTURE.md §36); do not start Phases8–10 or activate mocks merely to satisfy the menu complaint. Reports/redress and risk/notifications require their own later phases. No full product or production readiness claim.

## Canonical registration/reset repair deployed — 2026-10-13

Owner confirms `blacklist-web-eta.vercel.app`, registration/reset failure and expired link; explicitly requests8character minimum and accepts on-demand worker wake. `fix/public-registration-and-reset` preserves Phase6 repairs, prior local owner-mail/routing evidence and stash. Source `038ed7fcd6010d44244d6eb05e920da8ebbd0fe8` pushed on [PR11](https://github.com/Skyboyyt/blacklist/pull/11), deployed exactly to both existing Free Frankfurt Render services and Vercel production deployment target on the canonical public domain. Application remains DEPLOYMENT_ENV=staging, existing restricted-role direct verified-TLS Neon staging DB; no production data/service/billing/new Phase8. Explicit instruction recorded in ADR0016, wake approved ADR0017; Claude independent recommendation remains pending.

**Implemented:**8normalized-code-point policy across contracts/runtime/headless/fixtures/current docs; same maximum/bytes/NFKC/control/hash/breach/staff invariants and expanded short common-password fallback. Forms show policy/breach errors without fake success. Auth requests have bounded90second startup wait; other calls20. Optional safe canonical document redirect/no-store/no-referrer, excludes API/mutations; configured-only fixed origin/path fields prevent open redirects and Location has no token fragment. API-only accepted202registration/forgot health wake: HTTPS Render health only,90seconds/single-flight/shutdown abort, no headers/body/actor/token/scheduler/retry/keepalive. Queue/worker remain authoritative. No migration/dependency/DB role/moderation/provenance/risk/revision/appeal/reversal changes; all staff WebAuthn and mailbox proof/expiry/session/cooling barriers retained.

**Actual cloud:** API `dep-db7bdb2j9qps73bprjn0`, worker `dep-db7bdb8473hc73co3rig`, Vercel `dpl_BY3Y72aGYUP7At1niBLCoa9fag4R` are live/READY on exact source.5encrypted Vercel production-target fields (API URL/internal token/staging token/DEPLOYMENT_ENV/canonical origin) added; no DB/signer/mail/operator/wake secrets on web, no worker API secrets. API/worker APP_ORIGIN/RP and worker links match short canonical domain; optional wake targets owned worker. Internal viewer200with exact private peer and normal anonymous DTO; diagnostics absent.11public smoke +11security/health checks(overlap) PASS,4hosted7/8boundary negatives PASS,3legacy auth redirects PASS. The owned legacy branch alias now points to this deployment and GET token pages307to canonical/no-store/no-referrer, preserving valid browser fragments but never reviving expired links. Old host cookies/passkeys do not migrate. Vercel Git production branch remains initial-repository; exact manual deployment source is verified, no automatic-main deployment claim.

**Tests:** root522unit/format/lint/types/Next build PASS; real-PG52integration PASS including8signup/reset,7reject, expiry/replay/session invalidation/old-new login and accepted-only wake+actual queued SMTP; backend/mock builds and4bundle exclusions PASS;72desktop/mobile auth/account/recovery browser PASS. Follow-up8unit/type/lint passes after fictional static token fixtures replaced with CSPRNG.48staged-file pinned network-isolated redacted Gitleaks0; initial known fictional match corrected, no suppression/actual credential discovery. Coverage51assertions PASS but commandFAIL61.19%/75% and identity/access/audit/staff/DB/worker floors; ingress91.48/wake81.25branches. Added new security tests to coverage, no threshold/exclusion waiver. Production audit0; full audit1high unpatched development braces remains. Initial boundary expectations/old too-short fixtures/reset-outcome typing/nonexistent focused config fixed and passing reruns recorded. External Chromium CA trust blocks live UI automation, no TLS bypass; local72tests separate.

**Honest rollout corrections:** temporary controller loop variable shadowed receipt path after healthy canonical GET checks; fixed and read-only continuation verified deployed state without repeating protected setting mutations/deployments. Initial immediate legacy alias GET raced edge propagation; subsequent owned deployment readback and3redirects pass. No application failure inferred from those receipt/propagation checks.

**Mail / limits:** fresh canonical registration start202and actual account notice provider-reported delivered, so no new activation token claimed; normal canonical forgot/reset request accepted202and real worker reset email provider-reported **delivered**; no token/mail-body/password fetched or account completed by agent. Owner should use newest **reset** email within30minutes, choose their own8-or-more-character password and then sign in privately. Existing account preserved; no password/session changed by agent. Unknown-account reset remains generic202and sends no token until an account exists. Other recipients need an owned verified Resend domain; verified domains0. Valid hosted token redemption/login/reset/cookies, actual Free idle cycle/quotas, hosted logs API403, provider restore/retention/legal/monitoring/ADR0013/O6/P13/Claude and production launch gates remain untested/open. No production readiness or Phase8.

**Publication:** source deployed on repair branch, auto-deploy off. Final evidence/mail result commit, authorized merge and Render branch-to-main readback are recorded in PR11 after execution; this checkpoint does not infer them. Current evidence `docs/evidence/2026-10-13-public-registration-repair.json` contains sanitized source/deployment/count/results only; no recipient/key/private peer/raw token. Saved onboarding startup draft will be updated to canonical source/state, not environment publication.

## Registration failure investigation — 2026-10-13

Owner reports registration still failing. Asked failure stage/exact message (no password/token) and website URL asynchronously; answers pending. **Confirmed:** `blacklist-web-eta.vercel.app/register`200but `/api/v1/viewer`HTML404; this Vercel default domain has no real API connection. Actual longer staging URL's viewer200normal anonymous DTO. Vercel production branch remains `chore/initial-repository`; all4encrypted runtime integration bindings are preview-only/exact `chore/render-staging-deployment`, no production bindings. No setting changed or production deployment promoted. Owner's exact failure is not inferred until their reply.

Actual hosted completion with a synthetic invalid token and independent random test password correctly returns400`token_invalid`; no account/credential/session created. This exercises the real password preparation and intent rejection, not successful valid-token registration. Fresh hosted smoke11PASS; earlier owner activation email provider-reported delivered remains true. Chromium through the explicit egress proxy failed CA verification; no TLS bypass, actual-browser success not claimed. Native Chromium route also failed `ERR_CERT_AUTHORITY_INVALID` before page load; no TLS bypass or successful live-browser claim. Local browser suite results remain separate. No new registration intent/email send, cloud SQL/migration/config/dependency/production change during diagnosis. Existing dirty local owner-mail evidence/handoff preserved, repair PR10 remains merged. New sanitized routing evidence is local; next step is use the actual backend-connected URL if applicable, or trace owner-reported completion error without obtaining their token/password. Any production-domain/config integration needs a concrete reviewed plan within owner authorization; never broaden Origin/CORS, bypass verification or present mocks as success.

## Owner-mailbox activation delivery verified — 2026-10-13

Owner accepted testing with their Resend account mailbox and supplied the address identifier; reused the complete address previously supplied privately, without recording it in source/evidence. Existing API/worker are Free/not-suspended/main/auto-deploy off, normal DB-backed health200. Worker still uses protected sending-only Resend key/default sender and exact Vercel activation origin. One real same-origin registration-start request returned202with the normal accepted DTO; existing worker sent the activation email and Resend metadata reports **delivered**. Provider metadata only; no mail body/link/token fetched, no password chosen, no session/account created by the agent, no production DB/admin/operator/config/code/dependency/migration/billing change. Registration start only creates a staging intent/queued work; user must prove mailbox ownership and choose their password to create the member account.

**Evidence/status:** `docs/evidence/2026-10-13-owner-mailbox-activation-test.json` records booleans/provider event only, no recipient/key/token/record identifiers. Delivered is provider-reported; inbox receipt, token redemption, session/cookies and login remain **untested/pending the owner**. Link valid30minutes from issuance. No second registration request or delivery attempt introduced; no verification bypass. Other recipients still require an owned verified sender domain. Existing coverage/full audit/Claude/recovery gaps retained; no production readiness/Phase8 claim. This documentation checkpoint remains local for the next authorized publication; PR10 and deployed source remain unchanged. Next step: owner opens newest activation email, completes handle/password form privately, then tests sign-in and dashboard; never request their password or activation link/token in chat.

## SSR ingress repaired; sender domain still required — 2026-10-13

Owner requested fixing the remaining issues. Dedicated `fix/render-ssr-and-email` starts at current main/PR9 and preserves Phase6 repairs, working functionality and stash. Repair source `ca2590c285c73e6e6ca0fad6f443a0f9b85040af` deployed on the existing Free Frankfurt API, with auto-deploy off. Worker/frontend/database unchanged. All existing trusted-peer/internal-token/session/Origin/role checks remain. Temporary staging-only maximum30minute, triple-credential diagnostic metadata on existing health/viewer routes measured **one exact private ingress peer**, configured only `/32` in protected settings. No private IP/key is recorded in source. No automatic trust learning, broad subnet, new endpoint, cookie exception or business authority.

**Actual hosted proof:** first real Vercel dashboard requests produced0internal accepted/2denied; after exact-peer configuration,2accepted/0denied. All six direct/Vercel forwarding probes in each phase rejected spoof authority; no single spoofed IP became canonical client identity. Internal viewer returned200with the normal anonymous DTO. Both temporary diagnostic settings were removed, and cleanup deployment `dep-db781oks728c73ffrd10` is live on the exact repair source; health/viewer receipts absent afterward. Final hosted checks passed11public smoke and11final checks across overlapping suites: missing/wrong internal or staging key404, non-GET internal404, no actor authority from internal key/private401, public/private/admin/Origin/input/proxy denials and both DB-backed health200. Diagnostic settings/receipts absent; worker/frontend protected values separated. First requests timed out, later warmed rerun passed; helper receipt-writer NameError corrected and complete verification rerun passed. Initial failures remain in evidence. This proves SSR connection handling, **not a successful login or private dashboard session**. Unknown changed provider peers still fail closed; remeasurement requires the same bounded controls, never guessed ranges. No cloud SQL, migration rerun, account seed, email send, production database or billing change.

**Checks:** root `pnpm check` PASS506unit/format/lint/types/Next build; full real-PG backend50PASS; backend build PASS;13focused tests PASS(overlap); production audit0;4mock/client-bundle checks PASS; pinned network-isolated changed-source Gitleaks0. Initial undefined-injection-header/optional-route-URL mistakes repaired before passing reruns. Prior418browser PASS/82intentional skips retained, not rerun for backend-only change. Required coverage59.38%/75% and package floors still fail; full audit1high unpatched development braces remains. No thresholds, assertions, dependency policy or actor authorization weakened. Actual hosted logs remain unavailable through provider API403; no claim of log inspection.

**Email / next step:** Resend inventory still0domains; Vercel project only has its provider-owned `.vercel.app` domain. Owner was asked which owned domain/DNS to use; no answer yet. Default Resend sender remains restricted to the approved account mailbox. No invented/purchased domain or new account. Full hosted activation/login/logout/reset/cookies, account persistence/restart and managed restore remain untested. Claude independent review, ADR0013/O6/P13/recovery/retention/legal/monitoring and launch/security gates remain open; no production readiness or Phase8.

**Files/evidence:** new ingress plugin/unit tests/review/evidence; config/API-only runtime whitelist/server hookup, real-PG deployment negatives, safe env example, mock bundle scanner, operations/threat/handoff/current-state docs. No frontend application, authentication protocol, migration or dependency change. `docs/evidence/2026-10-13-render-ingress-repair.json` contains sanitized source/deployment/count/negative evidence only. Owner's merge/public rollout authorization is retained. Repair [PR10](https://github.com/Skyboyyt/blacklist/pull/10) targets main; source deployed and evidence published on the repair branch. Actual authorized merge and API branch-to-main readback are recorded in that PR after execution; this source checkpoint does not infer them. Seven documentation/evidence files passed pinned redacted Gitleaks0; formatting/whitespace pass. Reusable onboarding startup draft saved with actual ingress state; it is not environment publication.

## Owner-authorized public foundation activation — 2026-10-13

**Authorization/result:** owner explicitly said “remove restriction and merged everything to go live no long talk”, superseding prior hold/no-merge/visitor restriction instructions for the current deployment. PR8 marked ready and merged at `ef3844755ca95e58ba65880b7521165910c36143`. Existing Free Frankfurt API/worker branch changed to main, auto-deploy remains off; both resumed and explicit builds deploy that exact merge. Deployments `dep-db7771bbc2fs73e1satg` / `dep-db7771ss728c73fc6s7g` are live, `/healthz`200 with real DB checks. No paid resource or billing change, no SQL/migration/account seed, no production database change. No tests, dependency policies, actor permissions or identity controls disabled; known validation failures remain failures.

**Public frontend:** project-level Vercel `ssoProtection=null` set/read back, removing visitor Authentication. Existing actual URL `https://blacklist-web-git-chore-render-staging-deployment-skyboy.vercel.app` homepage/login200 without Vercel login. Alias is READY deployment `dpl_AvkcZVJY5yGAgz9ESRbW6ZGusmaW`, source34447fe; Git tree `da13ee40f77cfca7981b719ab25a06608ee3917c` matches backend merge exactly. No production branch/env/domain change; project-wide visitor-protection removal affects matching deployments. API ingress key remains server-only in Vercel; public visitors use the existing same-origin proxy, not a shared user credential.

**Actual hosted checks:** homepage/login/API health/worker health200. Ten API/proxy/denial checks pass: direct private404; gate-authorized anonymous private/admin401; allowlisted anonymous viewer200; foreign-Origin403; invalid input400; forbidden headless auth path404; frontend real viewer200/private401; forged browser gateway header overwritten. No protected values in checked responses. Initial admin probe corrected to actual `/api/v1/admin/overview`. **FAILED:** internal SSR viewer404 rather than200 with correct server tokens; `TRUSTED_PROXY_CIDRS` remains unset, so signed-in dashboard fails closed. Do not bypass trusted peers/internal token or guess broad ranges; Claude must resolve actual provider ingress within the approved design/ADR process. Render log inspection403 still prevents actual hosted log verification.

**Open limits:** full hosted registration/activation/login/logout/reset/cookies/restart/restore remain untested; no new email sent. Resend default sender only supports the approved account mailbox; zero verified domains. Required coverage59.38%/75% and security package floors fail; full dev audit1high/unpatched braces, production audit0. Prior500unit/48integration/focused6/418browser82skips/build/lint/type/secret results retained, not rerun for documentation-only rollout. Free sleep/cold starts/quota limits apply; worker is not always-on. Independent Claude review, ADR0013/O6/P13/retention/monitoring/legal/recovery remain open. No production readiness, complete platform functionality or Phase8 claim.

**Files/evidence:** this handoff, current-state AGENTS/ARCHITECTURE/THREAT-MODEL, hosting ADR/runbook, and sanitized `docs/evidence/2026-10-13-public-foundation-activation.json`; no application/migration/dependency source change. Local branch `chore/live-foundation-activation` holds documentation follow-up for owner-authorized commit/PR/merge. Preserve infrastructure branch, all history and stash. Next step is trusted-ingress/SSR resolution and proper hosted identity/sender validation; do not characterize health/public site as working dashboard or completed production security review. Older suspended/restricted/no-merge checkpoints below are historical.

## Finalization after owner review — 2026-10-13

**Current result:** database integration complete; application activation remains blocked by actual security gates. Owner said “complete everything i have review it”; continuation is authorized and their reported review is recorded. It is not a coverage/audit waiver or a formal GitHub/independent Claude review. No repeated database operator approval or credential entry is needed. This checkpoint supersedes the older “browser not rerun” and database-not-provisioned notes below.

**Verified cloud boundaries:** both existing Render services remain Free/Frankfurt/suspended/auto-deploy off with direct `blacklist_app` / exactly verify-full, no operator credentials. The retained runtime/migrator group is unlinked; protected authorities remain separated from worker/frontend. Signed-out Vercel login remains302toAuthentication; Render application health probes return provider HTML503, not successful application health. Resend still has zero verified domains; no additional mail sent. All seven current migration files exactly match the executed cloud hashes; no new cloud SQL, password regeneration, reset/drop, service resume or production changes.

**Tests/checks actually run:** `pnpm check` PASS (format/lint/types, **500unit**, Next production build); `pnpm build:backend` PASS; `pnpm test:backend` **48PASS**. The full integration run began before the new ingress test; the changed deployment file subsequently passed **6tests**, with5overlapping and1new. Expanded test-package typecheck and changed-file lint PASS. New ingress regression denies spoofed trusted peers even with valid server tokens, rejects wrong/missing internal tokens, confines SSR client-IP authority to internal GET and falls back safely on malformed/multi-hop forwarding. No route/security code changed.

**Coverage/audit:** final maintained coverage run **33assertions PASS**, commandFAIL: **59.38%branches/75%**; identity58.82%/90%, access77.27%/90%, audit80%/90%, staff48.65%/75%, DB62.5%/75%, API73.58%/75%, worker68.96%/75%. No floor, exclusion or assertion weakened. Production auditPASS0; full auditFAIL1high development `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm. Fresh registry and GitHub advisory checks confirm no published patched version; no suppression or policy waiver.

**Frontend preservation:** fresh mock build and4mock-exclusion/server-only bundle checks PASS. Complete Chromium desktop/mobile rerun **418PASS/0FAIL/82existing intentional skips**, no flaky cases, same assertions/timeouts with2workers and existing ignored cloud config/systemChromium154. This closes the earlier complete-run timeout blocker for this browser configuration. Initial default-config attempt failed missing matching Playwright browser and was interrupted; its results are preserved separately and never counted as a pass. Firefox/WebKit/real-device/assistive-tech and hosted backend flows remain untested.

**Secrets/local workflow:** pinned network-disabled, fully redacted Gitleaks scanned all refs/history/stash:4matches manually classified as existing fictional placeholders/security prose,0actual credentials identified; raw scanner exit1 remains recorded. Exact checks of8protected credential values against795current source/browser-static files found0matches, without outputting values. Changed-file scan is recorded in finalization evidence. Existing stopped local Compose services restarted with original volumes; local API started through its existing wrapper: health200, anonymous private401, foreign-Origin403. Initial local probes failed because API was not running; no readiness claimed from those failures. No real-user import or external mail. Reusable onboarding startup instructions are refreshed separately as a draft, not environment publication.

**Changed files:** `tests/backend-acceptance/src/render-deployment.integration.test.ts`; current-state corrections in AGENTS and operations runbook; this handoff; `docs/reviews/2026-10-13-staging-finalization.md`; `docs/evidence/2026-10-13-staging-finalization.json`. No application/frontend/domain/migration/dependency-policy code changed. Feature-branch commit/push/PR evidence updates authorized; main, Phase6 repairs and preservation stash unchanged. PR8 remains draft/unmerged because the required checks remain failing, not because another approval of the completed database task is needed.

**Publication verified:** finalization commit `9d418f0dab6b182518ae070175abfc3d0fc83891` pushed to the existing infrastructure branch; PR8 body/title updated and GET confirms exact head, main base, draft/open/unmerged. Source tree clean and preservation stash retained after push. Attempt to publish a failing `blacklist/staging-security` commit status returned GitHub403 `Resource not accessible by integration`; it was not created and no broader token requested. This is a GitHub integration permission limitation, not automatic approval-review rejection. PR title/body and evidence explicitly record failures. Existing Vercel/GitHub green or mergeable metadata does not prove backend security gates passed; no branch-protection/CI enforcement claim.

**Blockers / next step:** complete required coverage; resolve upstream development dependency without removing lint/security checks; establish authoritative Render peer CIDRs/header guarantees (setting currentlyempty), or have Claude propose a precise ingress ADR for owner decision. Keep trusted-peer/internal-token checks and current fail-closed SSR; do not guess broad ranges. Independent Claude review, hosted auth/activation/reset/logout/cookies/restart/provider restore, sender tracking/retention and domain for other recipients, ADR0013/O6/P13/monitoring/legal/recovery remain open. Once gates are satisfied, deploy the exact reviewed source into restricted staging and test synthetic workflows; do not represent stored configuration/database success as application deployment. No production readiness, paid fallback, main push/merge or Phase8.

## Completed Neon / Render integration — 2026-10-13

**Implemented and tested:** owner-accepted ADR0015 executed on reviewed feature source `ede392909b1c9d8ae91e862b0b5ca5edb4356b37`. Render connected natively to the exact Frankfurt Neon PG18 staging database with certificate/hostname-verified TLS. Read-only inventory verified zero app roles/objects/tables before writes. Existing provision script created ordinary SQL roles `blacklist_app` / `blacklist_migrator`, with safe flags/membership/grants; its executor and temporary admin copy were removed before the separate migrator container. Existing migration runner executed twice: **7matching hashes,27migrator-owned application tables,16queues**. Actual app-role authentication and permissions passed; rollback-safe DDL/TEMP/raw verification/audit/delivery-deletion negatives returned42501. No test accounts, shared DB reset/drop, production DB change or new SQL migration.

**Configured, held:** protected DATABASE_URL on `blacklist-staging-api` / `blacklist-staging-worker` now uses the tested SQL-created `blacklist_app`, direct endpoint and exactly `sslmode=verify-full`. All unrelated settings preserved; no migrator/provisioner/provider API keys on runtime, no signer/internal/staging token on worker, no database/signer/mail credentials on Vercel. Both applications remain **Free/Frankfurt/suspended/auto-deploy off**. Vercel signed-out login still302toAuthentication; production settings untouched. This is database integration success, **not a live/tested backend application**. Hosted API health/auth/email/restart/restore remain untested and activation needs separate approval.

**Cleanup/recovery:** both temporary Free Docker executors suspended, secret files removed, services deleted and404readbacks verified. Temporary provisioner/control copies deleted. Unlinked protected group `evg-db759a7f3r2c73d8gm80` (`blacklist-staging-operator-20261013`) retains only `DATABASE_MIGRATION_URL` and `DATABASE_RUNTIME_URL` for reviewed future migration/recovery. **Never link this group to services/builds/web**; verify zero serviceLinks on every use. No real value in source, logs, evidence, images or chat. The original Neon provisioner role still exists as owner/operator, never runtime. Failed attempts and read-only diagnosis are preserved in evidence; no blind write retry/password regeneration.

**Corrections:** initial preflight confused compute `pg_stat_ssl=false` with external TLS. Actual authorized TLSSocket and SQL identity/version passed; endpoint certificate/hostname verification remains mandatory, compute flag informational. Real signed TLS-proxy regression rejects bad CA/hostname and plaintext client transport. Image reuse/restart did not expose updated authenticated state; same-source full rebuild applied protected file/flags, with file excluded by `.dockerignore`, no build-secret mount or ordinary credential ARG. Source/digest/frozen policies retained. Inspection counters in execution receipts are defaults, not current-role counts; role success independently requires exactly two safe roles.

**Validation actually run:** root formatting/lint/types/500unit/Next build PASS; backend build and expanded operator types PASS; complete DB integration **48PASS**; focused new config/operator/catalog/real-TLS-proxy **11PASS** (overlap broader counts); wrong CA/hostname and forbidden app operations denied. Production auditPASS0; full auditFAIL1high development braces advisory; required coverageFAIL59.16%/75% plus security package thresholds. Local Docker builds and source/image matching, all-layer secret sentinel/history exclusion, UID1000 health200/public status404, failed-target redaction and pinned Gitleaks checks pass. Browser suite not rerun: prior416pass2timeouts82skips remain. Source evidence: `docs/evidence/2026-10-13-neon-render-integration-complete.json`; security review: `docs/reviews/2026-10-13-staging-operator-security.md`.

**Files:** modular operator config/target/phases/status/entrypoint and digest-pinned Dockerfile; server config/DB verification; operator/catalog/real TLS-proxy negative tests and expanded TS scope; `.dockerignore`/`.gitignore`/safe `.env.example`; ADR/index/architecture/threat/operations/review/evidence/handoff. Seven migration bytes and application/frontend/domain/dependency policies unchanged.

**Remaining blockers / next step:** Claude independent review (owner accepted scoped operator; no Claude recommendation claimed), required coverage/full dev audit, approved trusted ingress/proxy CIDRs (unset), hosted auth/email/restart/provider restore, verified Resend sender for recipients beyond account mailbox, O6/P13/ADR0013/recovery/legal/retention/monitoring controls. No production readiness or Phase8 authorization. Keep PR8 draft/unmerged and app services suspended; review/fix remaining gates and obtain explicit restricted-application activation approval before starting synthetic hosted flow validation. Owner reports no Render payment method; new Free resource base0USD, actual quota remainder unavailable, no paid fallback or billing change.

## Neon proxy transport finding — 2026-10-13

Protected read-only diagnostic at `4167964` reports `operator_server_tls_not_verified`. Reaching that check proves the preceding authorized native TLSSocket and exact SQL role/database/PG18 checks passed: Render-to-Neon transport **works with certificate/hostname verification**. Neon compute's `pg_stat_ssl.ssl` reports false behind its verified endpoint. The executor incorrectly used this internal-compute flag as the external transport gate. Corrected within ADR0014's accepted endpoint-TLS model: require encrypted/authorized client socket, exact direct URL/role/database/version, retain compute flag separately as `serverReportsTls` (informational). No SSL/certificate/hostname guard disabled, no alternate driver or provider added.

Regression uses real signed synthetic TLS proxy + local PG18 plaintext compute: verified endpoint works while compute flag is false; wrong CA and wrong hostname are rejected before callback/SQL. Eleven focused config/operator/catalog/proxy tests pass; expanded types/lint pass. Current executor suspended, protected file removed; temporary admin copy retained only in unlinked operator group for diagnosis. No write retry or migration yet. Rebuild/review source, repeat read-only inventory, then continue original provisioning only if genuinely fresh; unchanged scripts/passwords/journal preserved. Baseline coverage rerun **FAIL59.16%/75%**, security-package thresholds still fail; full auditFAIL1high development advisory, production auditPASS0.

## Operator execution failed closed; diagnosis in progress — 2026-10-13

Temporary provision service `srv-db759agn74is739oqrn0` built/deployed exact `964f469e5d4b2d386c9ecb9e1a00a29c8fd464f8`. Dormant health200 and status404 verified before protected file activation; activation reused the existing build. Authenticated receipt then reported **failed/operator_failed**, no verified TLS/roles/migrations. This does not prove there were no partial writes. Render log-read API403 prevents driver diagnosis; no raw provider logs/credentials copied into evidence.

Executor is now suspended; secret file removed, original role credentials plus temporary provisioner URL retained in unlinked operator-only protected group `evg-db759a7f3r2c73d8gm80` (zero serviceLinks). Unsafe API DATABASE_URL removed, all other settings preserved; worker still has no DB URL, both applications held. **No write retry, migration, runtime success or readiness claimed.** Added allowlisted failure categories and an explicit read-only inspection mode to diagnose before any recovery decision; unknown provider payloads stay redacted, inspection never means provisioning success. Whole-container lifetime now starts before operation. Existing script/migration bytes unchanged.

## Owner-accepted operator implementation — 2026-10-13

Owner explicitly accepted the isolated operator plan ("accept it do it fast please") and confirmed **no payment method saved**. This authorizes scoped temporary Free execution and secure held-runtime configuration; no paid fallback, billing change, API/worker resume, PR8 merge, production or Phase8. ADR0015 is owner-accepted; **Claude independent review remains pending**, not claimed completed. New modular config/target, DB verification, phased execution/status and digest-pinned Docker modules reuse existing scripts/migrations/toolchain/dependency policies. Credentials are runtime-only protected files excluded from Docker context; continuity uses an unlinked operator-only group. App contract/business logic and seven migration bytes remain unchanged.

Local checks completed: eight new operator negative/catalog tests passed; root formatting/lint/typechecks/498unit tests/Next production build passed; full disposable PG18 integration47passed; production dependency audit0 vulnerabilities. Digest-pinned Docker built with verified public proxy CA, all image layers/history exclude the secret-file sentinel, UID1000 runtime health200 and public status404. A follow-up adds the entrypoint/phases/config to the TypeScript checking scope; this exposed seven required index-signature accesses and nullable PG counts, now repaired without changing DB behavior. Expanded strict typecheck and eight operator tests pass. The dormant Free provision executor is built on the first commit, with no DB secret or SQL execution; deploy the corrected reviewed commit before activation. Actual Render SQL execution is next. Evidence: `docs/evidence/2026-10-13-staging-operator-local.json`; Codex security review: `docs/reviews/2026-10-13-staging-operator-security.md`. No hosted SQL/TLS/grant/migration or readiness success claimed at this checkpoint. API/worker remain suspended. Final evidence/status will supersede this progress entry.

## Alternative operator execution proposal — 2026-10-13

Owner requested a route that avoids PC commands/local Codex. **Prepared for review, not implemented:** [ADR0015](docs/adr/0015-staging-database-operator-execution.md) proposes short-lived Free Render Docker operator phases using existing provision/migrate scripts, direct verified Neon TLS, separate admin then migrator/runtime containers, protected runtime secret files excluded from Docker context/ARG/image and private operator-only credential retention. Controller can use existing Render access; API/worker stay suspended, no privileged credential on them, no new GitHub secret storage. Source-only GitHub, existing schema/toolchain/identity boundaries remain intended requirements. New privileged compute/storage is a boundary change: AGENTS§6/ADR process requires Claude review and owner acceptance **before code or activation**. No runner code, Dockerfile, workflow, resource, secret or billing/default-branch mutation was made.

**Actual research/checks:** GitHub repo public; workflow/run inventory200/count0; Actions permission and repository-secret admin403/integration access denied; environment inventory200/count2. Admin metadata on the repo does not prove those capabilities or workflow-dispatch write permission. No workflow registered on current default branch, which matches Vercel's production branch; do not merge/change defaults/production to enable dispatch without approval. Official public GitHub runner pricing is free for standard runners; larger runners are charged. Official Render Free/Docker/secret docs read200: Free 750 instance-hours shared, build/bandwidth supplementary charges possible with payment method, actual remaining budgets unverified. Docker service env values become build arguments, and secret files enter context unless explicitly excluded. Proposal therefore requires runtime-only files, no credential ARG/build mounts, image/context/history/provenance checks and zero-charge assurance. Render-to-Neon native connectivity/operator lifecycle is **untested**. The prior cloud transport refusal and current runtime misconfiguration remain blockers; no migration/TLS/grant success or readiness claimed.

**Next step:** Claude reviews the concrete ADR and owner decides/approves scoped operator activations if accepted. Then implement/test isolation/preflight/lifecycle/verification against disposable local PG before provisioning anything, verify Free usage/billing controls and execute only the empty staging target. Baseline coverage/audit/browser/recovery/ingress checks and no-resume/merge/Phase8 restrictions persist. Formatting/whitespace checks pass; pinned network-isolated four-file Gitleaks reports zero leaks/exit0. Source app/SQL/dependencies unchanged; prior 11 tests retained, not rerun for this proposal.

---

## Owner requested agent execution — 2026-10-13

Owner asked Codex to perform the Windows setup. Actual capability checks: this task has only the cloud terminal, no PC/remote-desktop/SSH connection tool. Fresh native IPv4 TCP probes to the intended staging endpoint are refused (errno111). Existing environment HTTPS proxy CONNECT establishes a tunnel but the native PostgreSQL SSLRequest is closed; a verified direct TLS probe does not negotiate PostgreSQL ALPN. No DB password, login or SQL was sent in these transport probes, and no transport/TLS policy was bypassed. These observations do not prove a PostgreSQL session or provider outage. Render GET metadata confirms both existing services remain Free/suspended; no provider mutation, migration, resume or merge.

**Prepared supported alternative:** Windows guide now includes an official native Codex desktop/IDE local-project path and a safe task prompt. A local terminal on a PC with native reachability can run the already-reviewed scripts, avoiding an unreviewed privileged cloud runner, alternate driver or paid service. Its credential access is separate: do not extract proxy-held bindings or place values in prompts. Owner must open the local checkout/task; this cloud chat cannot silently control their PC. Existing guide/preflight/role/hash/TLS/grant/save-only requirements and no-resume/merge/production boundaries apply. Cloud SQL/runtime configuration remains blocked/pending, not complete. Formatting/whitespace checks pass; pinned network-isolated two-file Gitleaks reports zero leaks/exit0. No application/tests/SQL/dependency changes; prior source test results are retained, not rerun.

---

## Windows operator procedure prepared — 2026-10-13

Owner explicitly requested exact Windows instructions using existing Phase 7 scripts and approved architecture; no credential exposure, production DB change, service resume or PR merge. **Implemented:** [copy-paste Windows guide](docs/operations/neon-windows-setup.md), linked from the existing runbook, safe evidence and this handoff. No application/SQL/dependency/security-policy change, new cloud resource, privileged runner or provider setting mutation.

**Script review:** existing `provision.mjs` validates direct verify-full URL and calls transactional PG18 SQL role provisioning; creates `blacklist_app`/`blacklist_migrator` with safe flags, preserves passwords, rejects unsafe role membership/schema ownership, revokes PUBLIC/runtime CREATE/TEMP and grants only migrator database CREATE. Existing `migrate.mjs` requires `blacklist_migrator`, applies five generated then two hand SQL files with hashes/advisory serialization/transactions, provisions queues and approved DML/function/sequence grants plus sensitive-table exceptions. Reviewed real changes: generated `0001` replaces a constraint/backfills old email; generated `0004` retires legacy pending staff requests/backfills security versions. PUBLIC privilege revocations affect other DB users. Guide therefore requires the exact dedicated empty staging target and an explicit read-only preflight; unexpected existing roles/tables stop this first-run procedure. No DROP TABLE/reset/TRUNCATE/application-record DELETE in these seven files; no account seeding. Per-file transactions do not make the whole runner one atomic transaction.

**Windows guide:** official installer checksum/signature checks, Node24.21.0/pnpm12.7.0/PowerShell7, feature-branch checkout preserving existing files and existing LF attributes, repository-local autocrlf=false plus seven-file reviewed SHA-256 preflight to prevent editor/line-ending drift, native TCP test, masked prompts, two independent manager-stored role passwords, fixed direct staging URL built with Node encoding and exact verify-full policy. Separate fresh admin, migrator and runtime shells; clear operator variables and clipboard, no plaintext credential files or command-history values. Read-only checks cover target/TLS/version/empty roles/tables, seven SQL hashes and 27 application tables, runtime role flags/membership/ownership, schema/table/function/sequence permissions. Runtime URL is privately obtained from the saved SQL-created role password, not a privileged console role. Both Render settings are prepared as explicit save-only steps after verification; API/worker remain suspended. SQL roles may be absent from Neon's selector; do not create replacement provider roles.

**Actually run:** 11/11 local deployment/managed-like migration/application migration checks, including negative DDL/TEMP/raw verification/audit checks, unsafe-role rejection, migration repeatability/hash drift, populated-row backfill/legacy cancellation and logical restoration. Four guide Node here-string programs pass native Node syntax checks. Seven manifest/working-tree/Git-blob byte comparisons pass; an in-memory CRLF-converted copy changes its hash and is rejected by the manifest check. Existing `.gitattributes` already enforces LF and was not changed. PowerShell/Windows commands and actual cloud SQL/TLS/grants/hash/runtime/persistence/restore checks **not executed** here. Render metadata/config inspected again in memory: API still provisioner/pooler/nonconforming TLS/query URL, worker no URL, both Free Frankfurt/suspended with only canceled initial deploys. Latest TCP-only native probe fails errno101/network unreachable before DB authentication. Current source evidence: `docs/evidence/2026-10-13-neon-windows-preparation.json`. No actual URL/password or private record in source/evidence. Formatting/whitespace pass; pinned network-isolated Gitleaks checks all five changed files with zero leaks and exact in-memory checks find none of five protected URL/password/API-tier values. Onboarding startup draft now links the Windows fallback; draft saving is not publication. Full root/coverage/audit/browser suites were not rerun for documentation-only changes; known failures and Claude/ADR0013/O-6/ingress review gaps persist.

**Next step:** owner follows the Windows guide on a PC with TCP/5432 reachability and returns only generic stage/verification results. SQL role creation, cloud migrations and both correct runtime URLs remain **pending owner PC execution**, not claimed configured. Do not resume services or merge PR8 without owner approval; complete required review/hosted validation before availability. No production/paid services/Phase8.

---

## Owner-added Neon connection recheck — 2026-10-13

**Current result: Blocked, still suspended.** Owner confirms only adding the Neon connection string to Render, without running the separate repository provisioning/migration commands. API now has `DATABASE_URL`; worker does not. The API URL points to the intended Frankfurt staging endpoint after normalizing its pooler marker, but identifies a privileged operator role, uses a pooler and `sslmode=require` plus an unsupported driver query option. The exact existing `verifiedDatabaseUrl(..., 'blacklist_app')` guard rejects it with `runtime_database_configuration_invalid`; no connection string/password was printed, saved to source or used for database authentication. Runtime SQL role flags have not been queried. Both service GET responses still show **suspended** and the only deployment is the initial **canceled** attempt at `11d7cdd`.

**Checks actually executed:** configured-URL guard rejection **pass**, deployment/worker/Resend units **11 pass / 0 fail/pending**, two external `/healthz` requests **503 HTML from held Render services**, which is **not application health proof**. Direct TCP-only probe to the matching intended direct Neon endpoint fails **OSError / errno 101 (network unreachable)** before authentication/query. Previous refusal/DNS observations remain historical; this is the latest observation. No database schema/grants/TLS/session/restore or hosted auth test ran. No provider setting was modified: preserve owner-added configuration, keep services suspended and retain fail-closed guards. No application code, dependency or SQL change; prior full coverage/audit/browser/review blockers remain open. Formatting and whitespace checks pass. Pinned network-isolated Gitleaks on four changed files reports zero leaks, and exact in-memory URL/password checks find zero matches in changed source. Saved startup draft records the updated configuration/blocker; saving is not publication. Sanitized evidence: `docs/evidence/2026-10-13-neon-render-connection-recheck.json`.

**Required operator step:** from an approved machine with native Neon TCP/5432 connectivity and pinned Node/pnpm, run the existing `infrastructure/render/provision.mjs` with `DATABASE_ADMIN_URL`, `BLACKLIST_RUNTIME_PASSWORD` and `BLACKLIST_MIGRATOR_PASSWORD` supplied only through a private operator environment. The admin URL must be the staging direct host and exactly `sslmode=verify-full`. Provisioning is additive and preserves existing credentials. End that privileged session; then run `infrastructure/render/migrate.mjs` in a separate private session with only `DATABASE_MIGRATION_URL` for `blacklist_migrator`, repeat once for idempotency, and validate TLS/grants/audit/queues/persistence/recovery. Do not run operator commands on API/worker startup or introduce an alternate HTTP/serverless driver, Data API, privileged runtime or an unreviewed runner. No reset/drop/test-account seed.

Only after provisioning/migration validation, replace the API URL and configure the worker URL using the **SQL-created `blacklist_app` role**, its independent runtime password, the **direct non-pooler** staging host, database `blacklist_staging` and **only `sslmode=verify-full`**. Do not merely edit the privileged URL's host/TLS and call it safe. Retain protected provider settings and no plaintext URL in GitHub/chat. Review proxy/ingress/free-worker/identity/security blockers before resuming a reviewed commit and testing protected Vercel login/registration/email. No main push, merge, paid/public production launch or Phase 8.

---

## Render workspace services and preview settings — 2026-10-13

**Workspace ID supplied and applied:** owner provided `tea-db6vhoij9qps73amsn50`. Render owner lookup still returns Cloudflare 403, but workspace-scoped inventory works and service create/get responses verify the exact owner. Do not ask for the workspace ID or four provider API keys again.

**Free Render resources created and immediately suspended:**

| Resource | ID / reserved URL | Actual state |
|---|---|---|
| API | `srv-db72r4d9fdbs73erf1s0` / `https://blacklist-staging-api.onrender.com` | **Free / Frankfurt / suspended**, not a running API |
| Separate worker | `srv-db72r5ou01pc73c32l5g` / `https://blacklist-staging-worker.onrender.com` | **Free / Frankfurt / suspended**, no email processing |

Both target `chore/render-staging-deployment`, repository root, pinned Node 24.21.0, existing build/start wrappers and `/healthz`; `autoDeployTrigger=off`. New base Render service charge **$0 within Free limits**; no paid plan/storage/add-on/autoscaling/billing change. Render creates an initial deployment even with later auto-deploy disabled; it was immediately held with suspension, verified by GET metadata. Latest deployment inventory confirms both initial attempts at `11d7cdd` are **canceled**, not successful deployments. Neither service has DATABASE_URL, operator/migrator credentials or cloud-operator API keys. API has fresh independent CSPRNG signer/internal/staging values in protected Render settings; worker has none of those values. Missing DB configuration makes existing startup fail closed. No application health/availability or hosted SQL/auth success claimed.

**Preview-only Vercel configuration prepared and verified:** encrypted `STAGING_ACCESS_TOKEN`, `INTERNAL_API_TOKEN`, `API_INTERNAL_URL=https://blacklist-staging-api.onrender.com` and `DEPLOYMENT_ENV=staging`, with **target `[preview]` and gitBranch `chore/render-staging-deployment`** only. Verified all four types/scopes through the API. Private gateway/internal values transferred in memory from the owned Render protected settings; no values printed or persisted in local files/source. Frontend receives no signer, DB/operator URL or Resend key. Production variables/branch/settings were not changed. A future preview build picks up the build-time rewrite; this is configuration preparation, not working logged-in SSR/cookie/authentication.

**Remaining blockers verified:** fresh Frankfurt Neon project `curly-thunder-05276273` still has no application roles/migrations. Recheck after workspace restart again gives IPv4 **connection refusal, errno 111**, before any DB login/query. Need an approved native-PG operator environment for existing `provision.mjs`/`migrate.mjs`, then grants/TLS/schema/audit/queue/persistence/restore checks; no alternate driver, privileged runtime URL or TLS relaxation. Resend latest domain read succeeds/empty; an intermediate default-user-agent request got 403, and the established client header succeeded. Owner supplied the permitted Resend account mailbox privately. The existing HTTPS adapter accepted one synthetic transport email from `onboarding@resend.dev`; authenticated Resend receipt lookup reports **delivered**. This does not prove human receipt or account activation. A fresh key requested with `sending_access` is stored solely in worker protected settings with `EMAIL_FROM`; worker remains suspended. No recipient, key value, token/link or mail body is stored in source/evidence. Zero verified domains means the default sender is limited to the account mailbox; a verified owned domain is still required for other testers. Tracking/retention policy remains unverified. The first attempt failed configuration before sending because the proxy placeholder is unsuitable for runtime key validation; no validation was weakened. Foundation coverage/audit/browser, independent Claude review, ADR0013/O-6 and trusted ingress/cookie/SSR/free-worker gates remain open; no waiver.

**Checks actually run:** provider create/suspend and GET ownership/Free/region/state/branch settings; protected env-boundary negatives (no operator/API keys on runtime; no signer/internal/staging on worker); Vercel encrypted exact-branch/preview-only verification; TCP probe; Resend sending-key creation/protected worker-setting verification; existing-adapter real transport acceptance and provider delivery receipt. The first proxy-key configuration attempt failed without a send; retry used the fresh valid sending key. No application logic/dependency/SQL changed, so prior application results are retained, not rerun/relabelled. New source changes are sanitized evidence, workspace/runbook/security-review/handoff/configuration metadata only. Exact results: `docs/evidence/2026-10-13-render-workspace-setup.json`.

**Follow-up validation:** deployment/worker/Resend units **11 passed, 0 failed/pending**. Formatting initially flagged the new JSON; formatting it and rerunning `pnpm run format:check` passed, as did `git diff --check`. Pinned network-isolated Gitleaks on all five changed files reports **0 leaks / exit 0**. In-memory exact checks found none of the four fresh protected secrets or approved recipient address in changed source; runtime operator absence and worker authority separation reverified. Full application/coverage/audit/browser suites were not rerun, and prior failures remain open. Saved onboarding startup instructions now reflect held resources, real mail proof and remaining native-PG blocker; draft saving is not publication.

**Next step:** arrange approved reachable PostgreSQL operator access; apply unchanged roles/migrations and validate. After required review/security checks, supply DML-only DB URLs and verified proxy configuration; verify mail tracking/retention and use the default sender only for the authorized account mailbox; resume API/worker manually at the intended reviewed commit, rebuild only the protected preview and run hosted synthetic workflows. Keep source feature branch/PR; no automatic merge, real-user import, production launch or Phase 8.

---

## Corrected access and Free Neon staging — 2026-10-13

Historical checkpoint: subsequent workspace, preview-setting and email results are recorded above; earlier missing-input/no-service statements here describe that checkpoint.

**Current result: partially provisioned, not a complete live staging app.** Owner reported correcting/rotating the four credentials. All four exact-name bindings are saved and present; no misnamed entries remain. Supported read-only requests succeed for Render, Neon, Vercel and Resend. Do not ask for the four API keys again or print arbitrary secret metadata. The previous credential incident/rejected-request entry below is historical, superseded for configuration/access; rotation is accepted as owner-reported, not independently proven by API metadata.

**Completed cloud work:** created a separate **Free Neon** project **`curly-thunder-05276273` / `blacklist-staging`**, **PostgreSQL 18**, **Frankfurt `aws-eu-central-1`**, branch `staging` / `br-wispy-unit-b95vz858`, fixed 0.25 CU, six-hour history. Verified organization/account Free plan before creation, base new resource cost **$0 within Free quotas**. Existing `blacklist` project in US East/Ohio is untouched. Explicit `suspend_timeout_seconds` caused 412; omitted the override and creation returned 201, with region/version/org checked. Provider endpoint timeout metadata is 0; actual idle suspension requires testing. No keepalive, paid resource or billing change. **Application roles/schema/migrations have not been applied there.** No database password/connection URL was printed, stored in repository/temporary receipts or sent to frontend.

**Actual Vercel staging identification/protection:** connected `blacklist-web` / root `apps/web` / Node 24.x. Stable feature-branch alias is **`https://blacklist-web-git-chore-render-staging-deployment-skyboy.vercel.app`**; inspected immutable preview `https://blacklist-f0wh8qdpv-skyboy.vercel.app` is at `fab817eb99542adab1293905116d48b6c94e5442`. Both signed-out `/login` requests return **302 to Vercel Authentication**, with no credentials supplied. Project protection is `all_except_custom_domains`; env inventory empty, no declared mock mode. Selected Blueprint uses the real stable origin/RP hostname. Production branch/settings remain unchanged. This proves signed-out restriction, **not logged-in access, cookie/SSR integration or working backend authentication**. Feature-branch pushes may produce newer immutable previews; stable alias remains the configured origin and must be rechecked before rollout.

**Concrete remaining blockers:** Render services/env-group API returns 200/empty; unauthenticated services control returns 401, so key works. Owner/workspace discovery returns Cloudflare HTML 403; need existing workspace ID to target service creation. No Render API/worker exists. Resend domain list returns 200/empty; need an owned verified sender domain or the Resend account mailbox for a restricted initial default-sender test. No external email sent. Normal workspace DB probe fails DNS; an additional permitted IPv4 probe to fresh Neon fails **connection refusal (errno 111)** before any login/query. Cannot run native-pg roles/migrations, TLS query, restart/restore proof from here. Need an approved operator machine with TCP/5432 reachability, using existing `infrastructure/render/provision.mjs` then `migrate.mjs` in separate protected sessions; alternatively Claude/owner reviews a separate release-runner topology. Do not enable Neon Data API, replace the pg driver, relax certificate verification, give runtime an owner role or claim migration success. Asked owner for workspace ID and sender/domain/mailbox asynchronously; unanswered, no defaults invented.

**Actual current checks:** restored Compose PostgreSQL/Mailpit with original volumes, idempotent local role provisioning and seven migrations **exit 0**. API/worker restarted through credential whitelists. Local health **200**, anonymous private route **401**, foreign-Origin mutation **403**, synthetic register **202** and real queued local SMTP observed in Mailpit; no mail body/token logged. Existing deployment/worker/Resend units **11/11 pass**, no failed/pending. All three official-schema Blueprints validate after actual-origin update. Prior 494 root/67 backend passes remain previous evidence; full suites/coverage/audit/browser were not rerun for documentation/configuration-only edits. Earlier coverage (59.16% vs 75%), high development braces advisory, full browser timeouts and Claude/ADR0013/O-6 review remain open; no policy waiver.

**Changed files:** selected `infrastructure/render/blueprint.staging-neon-free.yaml` origins/RP; operations runbook/provider progress, security review/current status, this handoff and sanitized `docs/evidence/2026-10-13-staging-provider-progress.json`. No dependency, runtime business/authentication code or application SQL migration changed. Onboarding draft retains installed pins/startup workflow and now records valid credentials, real staging IDs/alias, direct-PG blocker and necessary exact-host network additions; draft saving is not execution/publication. No API deployed commit exists; no production/Phase 8 readiness claimed.

**Next step:** owner supplies the Render workspace ID and email-sender/test-mailbox choice; arrange approved native-PG operator access. Apply unchanged roles/migrations to the fresh empty Frankfurt target, validate DML/audit/queues/TLS/grants/restore, review security/free-worker/ingress constraints with Claude, then deploy the exact reviewed API/worker commit with protected secrets and verify full Vercel/Resend synthetic flows before availability. Feature branch/PR only, no automatic merge or production changes.

---

## Credential recheck — 2026-10-13

**Blocked; rotation and configuration correction required.** Owner reported entering all four credentials. Metadata confirms four saved bindings, but the saved names/targets are API-key-like strings instead of the literal `RENDER_API_KEY`, `NEON_API_KEY`, `VERCEL_TOKEN` and `RESEND_API_KEY`. All four intended variables remain absent; alternate bindings are present. Do not publish or print the actual saved names: they contain secret-like material. Codex surfaced those names in a metadata tool result, notified the owner and requires rotation under AGENTS.md §7. No actual name/value belongs in this handoff, evidence or GitHub.

Read-only account/resource requests using the available scoped bindings returned **Render 403 / Neon 401 / Vercel 403 / Resend 400**. These are unsuccessful access checks, not proof that every failure is an invalid credential rather than scope/proxy/account policy. No provider account details, service, database, sender, staging URL or real delivery was verified; no resource or billing mutation occurred. Further deployment is paused pending rotated, correctly configured credentials. Do not retry unchanged failures or weaken TLS/authorization.

Correctly named scoped requirements were saved in the environment configuration draft while preserving existing scripts/network/settings; the complete startup instructions now include this blocker and safe metadata handling. Saving does not move existing secret values, rotate credentials, inject variables or publish. Owner must rotate/revoke the four old provider keys, remove entries whose names are keys, enter new keys in the **secret value** fields under the four exact variable names, and save/publish the environment configuration. Keys must never be pasted in chat.

Git verification: main remains `ece2e769fafc9a381ed1b540ae8b7e05fccdbab5`; preparation PR #8 is open/draft/unmerged with infrastructure/receipt head `2d7817d6390fe63aef448f19ab185efe4017756a`. This session changes only sanitized credential-check evidence and handoff; the prior application tests are not rerun or relabelled. Existing coverage/audit/browser/Claude-review gaps remain. Next action after corrected bindings: verify read-only account access and actual Free capabilities before any staging provisioning. No merge, paid resources, public/production activation or Phase 8.

---

## Restricted staging infrastructure handoff — 2026-10-13

**Actual status:** **Implemented / Tested locally; Blocked for cloud deployment.** No Render service, Neon project/database, Resend key/domain, Vercel configuration, billing change or public launch was created. No staging URL or deployed commit exists. No production readiness or Phase 8 start is claimed. Current evidence: [deployment runbook](docs/operations/render-staging.md), [sanitized test/security evidence](docs/evidence/2026-10-13-render-staging.json), [security self-review](docs/reviews/2026-10-13-render-staging-security.md), [hosting constraints](docs/adr/0014-render-private-tls-and-free-staging.md). Independent Claude review remains pending.

**Owner decisions and scope:** final choice is **free Render backend/API**, **Neon PostgreSQL**, **Resend HTTPS activation/reset mail**, and existing **Vercel frontend protected by Vercel Authentication**. Render Frankfurt and Neon `aws-eu-central-1`; owner explicitly confirmed authenticated public Neon TLS is acceptable for restricted staging. Earlier Render-managed DB/private-network planning is superseded. Use only `blueprint.staging-neon-free.yaml`; historical free Render DB and paid templates are comparisons, not authorized deployments. Do not purchase resources, auto-merge, change Vercel production, launch publicly or start Phase 8. The optional separate free web-hosted worker needs review of idle-sleep/manual test-window limits before availability; no always-on guarantee or automated keepalive.

**Repository verification:** remote main is `ece2e769fafc9a381ed1b540ae8b7e05fccdbab5`, containing Phase 7 `baafe57220b5b42c4e457d92bbae43cf468ff5fd` and the owner's direct-publication receipt. This was a direct push, not a PR merge. GitHub default remains `chore/initial-repository`; use explicit branch/commit. Phase 6 repairs/PR #7 are integrated and the `phase7-preservation-before-pr7` stash is retained. GitHub REST and Git reads now work; the older Forbidden/API-blocked notes below are historical. No open issues were returned at inspection. Work remains on `chore/render-staging-deployment`, with no force push or main push under this task.

**Implemented / changed files:**

- API `server.ts` / `plugins/staging-access.ts`, config and DB client: independent constant-time staging ingress check, safe DB-backed GET/HEAD health, strict configuration and unchanged authentication/Origin/session/domain permissions.
- Web `proxy.ts`, server viewer adapter, `security/staging-gateway.ts` and tests, mock-exclusion script: server-only staging header injected into existing same-origin proxy/SSR, caller-supplied values overwritten, no browser token/public DB URL or cross-origin cookie/CORS change.
- Worker `mail/resend.ts`, SMTP selector, `main.ts`, `health.ts`: fixed HTTPS adapter with redirect rejection, bounded timeout/receipt, validated accepted-message UUID and sanitized failures; existing SMTP retained. Optional health-only listener starts after DB/queue startup and closes on shutdown; separate service/credentials, no user API or signer/internal/staging/operator keys.
- DB `provision.ts`, `infrastructure/render/` build/run/runtime/URL/provision/migrate scripts and review Blueprints, `infrastructure/neon/project.staging.json`: pinned Node 24.21.0/pnpm 12.7.0, full frozen install, explicit child environment allowlists, direct `verify-full` endpoints, separate SQL-created safe roles/operator migrations, Render port/shutdown, manual reviewed-commit deployment. Neon default console/API roles are privileged and must never be runtime credentials. No new dependency, lockfile, build-script approval or relaxed security policy.
- Local launch whitelist retains SMTP workflows; acceptance package adds deployment, managed-like migration, Resend and worker-health regressions, includes them in maintained coverage. `.env.example`, architecture hosting log, threat model, acceptance record, operating runbook/security review/ADR/evidence and this handoff updated. No frontend research/moderation contracts/mocks or later-phase business implementation replaced.

**Migrations:** **zero new or changed application SQL migrations**. Seven existing SQL files and 27 identity/staff/audit tables retained. Local PG18 checks actually passed: fresh/repeat migrations, populated upgrades, applied-checksum rejection, logical dump/restore with ownership/ACL/audit hashes, non-superuser operator rehearsal, password preservation, unsafe-existing-role rejection, runtime DDL/TEMP/verification/audit denials, and state persistence after runtime restart. Drizzle regeneration reports no drift. Real Neon migrations/TLS/privileges/recovery have not run. Provisioning revokes PUBLIC CREATE/TEMP privileges, so use a dedicated empty staging database; never run against an unrelated/shared or production database.

**Checks actually run (latest code):**

| Check | Actual outcome |
|---|---|
| `pnpm check` | **Passed**, exit 0: format, lint, all types, 79 contract + 391 web + 24 backend units = **494**, production Next build |
| Actual Render worker build command | **Passed**, exit 0: unchanged frozen install across 14 workspaces and five backend package builds; API profile previously passed too |
| Complete backend `vitest run` | **Passed 67/67**, 15 files, 0 failed/pending; exact D1–D9/S1–S17 still pass unchanged |
| Maintained application coverage command | **Failed**, exit 1, despite **32/32 assertions passing**. Global branches **59.16% (804/1359)** vs 75%; identity 58.82/access 77.27/audit 80 vs 90%; staff 48.65/db 62.5/API 71.69/worker 68.96 vs 75%. Floors preserved |
| Full dependency audit | **Failed**, exit 1: one high development-only braces advisory **GHSA-vfj7-8cjw-p6xm**, no patched version reported; no suppression. Production audit **passed**, zero vulnerabilities |
| Drizzle / mock exclusion | **Passed**, zero drift; **4/4** exclusion checks |
| Official Render Blueprint schema | **Passed**, all three templates; syntax only, not account/provisioning proof |
| Native Next → actual local API preflight | **Passed 6/6**: health/login 200, direct ingress 404, private no-session 401, invalid input 400, foreign Origin 403; zero response/build credential leaks, mock markers or browser server-secret names |
| Native optional worker process smoke | **Passed 4/4**, actual local PostgreSQL/SMTP worker: DB-backed health and HEAD 200, mutations/user route 404, SIGTERM exit 0, zero secret bytes in its log |
| Credential review | Pinned network-disabled/redacted Gitleaks raw exits 1: **3 tree / 4 history / 3 exact-staged flags**, all reviewed prose or explicit fictional placeholder; no rules disabled and **zero real credentials found**. Exact byte scan: **8 ephemeral/local values, 4,342 source/build files, zero matches**, ignored local env mode 600 |
| Full frontend browser / actual staging | **Not rerun / not run**. Prior Phase 7 full browser result remains 416 passed / 2 timeouts / 82 existing skips; focused reruns passed but do not turn that full run green. No Render/Vercel/Neon/Resend cloud success claimed |

**Security review / remaining risks:** current baseline coverage, full audit and complete-browser reliability remain unresolved. Claude reviews infrastructure and identity recovery ADR 0013/P-13; O-6 human verification remains unavailable/fail closed. Actual Render ingress peer/CIDR/header handling and Vercel SSR/secure cookies must be verified without widening trust/Origin/CORS. Public health probes expose only status but need provider abuse/connection-budget monitoring; a healthy listener does not prove mail delivery. Free services sleep after 15 minutes; worker polling/health can consume Neon CU-hours and exhaust quotas. Neon Free history/snapshot limits are not production backup assurance. Real sender, tracking/retention, mailbox acceptance, TLS, pooling/limits, restart persistence and provider restoration require testing. Private records, revision/severe independence/appeal/reversal/provenance/risk invariants remain unchanged; future chain/submission/evidence/scoring/appeal endpoints stay unavailable.

**Costs / credentials / environment:** documented base free staging charge is **$0 within verified Free quotas**, not an account quote; existing Vercel account/seats/usage and all provider plans are uninspected. No billed resource/upgrade is authorized. `RENDER_API_KEY`, `NEON_API_KEY`, `VERCEL_TOKEN`, `RESEND_API_KEY` remain absent in the process and unbound in environment metadata. A dashboard login does not provide task access. Missing scoped HTTPS requirements and updated complete startup instructions are saved in the onboarding draft; saving does not inject values, execute, publish or prove fresh-task restoration. Enter values securely in environment settings, never chat. The complete application variable inventory and operator-secret separation are in the runbook.

**Next step:** review the feature PR and obtain Claude's operating/security review; resolve baseline checks. Owner supplies the four protected bindings, then inspect existing Render workspace, Neon **Free** organization/PG18/Frankfurt limits, exact protected Vercel staging URL and Resend verified sender. Verify a concrete free plan without billing changes; only then provision a fresh synthetic staging DB, run operator roles/unchanged migrations separately, deploy the intended reviewed API/worker commit and test real authentication/authorization/email/restoration before availability. Stop at infrastructure; production activation and Phase 8 need separate authorization.

**GitHub publication receipt:** implementation commit **`acd4ea62e958c070eeca039cb27aff5823669790`** was normally pushed to `origin/chore/render-staging-deployment`. Draft **[PR #8](https://github.com/Skyboyyt/blacklist/pull/8)** targets **`main`**; it is open and unmerged. Main remains `ece2e769fafc9a381ed1b540ae8b7e05fccdbab5`. This receipt/evidence is a documentation-only follow-up; no cloud resource or deployed commit exists. No force push, main push or merge occurred in this task.

---


> **Development order: FRONTEND-FIRST** (ARCHITECTURE §36). Phases 1–6 are frontend on contracts and mocks; Phase 7 is Backend Foundation (gates D1–D9, S1–S17 first).
>
> **Local Backend Foundation exists on this branch.** Non-mock auth/account/staff flows use HTTP adapters and the approved headless identity service; unsupported later-phase capabilities stay unavailable. Fictional mock builds remain separate. PostgreSQL/Mailpit are local only. No production deployment or paid service is configured. The public GitHub repository is [Skyboyyt/blacklist](https://github.com/Skyboyyt/blacklist); the default branch is `chore/initial-repository`; the Phase 5 follow-up and ranking merged in PR #4 at `87fc8b9`.

---

## Session log

### Codex Phase 7 publication authorization (2026-10-13)

**Latest owner instruction:** “commit and push now to the main”. This supersedes the earlier conditional new-branch/PR publication request and, for this publication only, the repository's ordinary prohibition on direct pushes to main. The owner had already authorized creating main from the current default. The reviewed implementation remains based on `chore/initial-repository@4b16cdb`, with Phase 6 PR #7 preserved. Commit and normal push to `refs/heads/main` are now authorized; no force push, PR merge, deployment or Phase 8 work is authorized or performed by this instruction.

**Validation remains unchanged:** 51 backend tests and isolated D1–D9/S1–S17 pass; `pnpm check` passes 480 unit/component assertions, format/lint/types and production web build; backend builds and seven application migrations pass. Coverage still fails (56.22% global branches; security module floors remain 90%), the full dependency audit still reports one unpatched high development-only braces advisory (production audit zero), and the full browser run remains 416 passed / 2 timeouts / 82 existing skips, with both timed-out tests passing an unchanged focused rerun. Secret review found no actual credentials. Full evidence and the security review below are retained as historical prepublication records, not rewritten to imply green checks.

**Actual publication:** implementation commit [`baafe57220b5b42c4e457d92bbae43cf468ff5fd`](https://github.com/Skyboyyt/blacklist/commit/baafe57220b5b42c4e457d92bbae43cf468ff5fd) was created on `feat/phase7-backend-foundation-review` and pushed successfully with `git push origin HEAD:refs/heads/main` (exit 0; new remote branch). `git ls-remote` independently confirmed that exact SHA on main. Local main now tracks origin/main; the review branch and original preservation stash are retained. The existing default branch remains `chore/initial-repository`. No force push, PR creation, PR merge, deployment or Phase 8 work occurred. This publication receipt is a separate documentation follow-up to the implementation commit; it does not rewrite the historical prepublication evidence.

**Final staged-file checks:** all 611 index files were exported from their exact staged blobs; the 184 changed files contained no prohibited local/build artifacts. Exact comparison against seven actual local secret values found zero matches; the local env remains ignored and mode 0600. Gitleaks reported the same three manually reviewed prose/fictional-placeholder false positives, with no rules disabled. `pnpm run format:check` and staged whitespace checks passed. The application suites were not rerun for these authorization/receipt-only documentation edits; the full results above remain unchanged.

**Remaining work:** meaningful coverage expansion, upstream dependency remediation when available, a clean complete browser rerun, independent Claude review, and owner decisions on Proposed ADR 0013 / production providers remain outstanding. Publication does not establish production readiness or satisfy these failed checks.

### Codex Phase 7 prepublication review (2026-10-13)

**Authorization and Git:** the owner reported Phase 7 complete and requested all relevant tests, security/credential review and PostgreSQL migration verification, then commit/push to a new branch and a PR targeting main **if everything passes**, without merging. GitHub has four remote heads and no main; the owner explicitly approved creating main from the current default `chore/initial-repository` (`4b16cdb`). A new **local** branch `feat/phase7-backend-foundation-review` preserves the entire working tree, integrated Phase 6 repairs and original preservation stash. No branch commit, push, remote main creation or PR was made: coverage and full audit fail the publication condition. GitHub REST metadata/PR access also returns Forbidden (ordinary and escalated read); remote Git reads work. No automatic approval rejection occurred.

**Security findings and repairs:** [review](docs/reviews/2026-10-13-phase7-prepublication-review.md) records a **Critical stale-mailbox reset race**: a worker could wait behind an email transition and issue reset authority to the old mailbox at the new security version. A controlled PostgreSQL interleaving reproduced the old send; request/current mailbox are now reloaded and matched under the account lock. Also reproduced and fixed account/token lock inversion in delivery finalization and reset/email confirmation (including the isolated gate implementation); account is locked before request/token rows, and preliminary lookups grant no authority. A real signed-member-session regression reproduced bulk revocation without fresh reauthentication; the domain now enforces the approved frontend contract. Each new regression failed before its fix and passed afterwards. No architecture, proof requirement, independent approval, privacy, moderation revision or reversal barrier was weakened.

**Changed review files:** domain `identity/account.ts`, `token-delivery.ts`, `reset.ts`; acceptance fixture `delivery.ts`/`reset.ts` and strengthened `runtime.integration.test.ts`; new `application-migrations.integration.test.ts` and `delivery-locking.integration.test.ts`; Vitest coverage configuration/script, exact planned `@vitest/coverage-v8@5.0.2` dev dependency and lockfile; E2E enrollment-heading assertion (checks current heading plus fictional-code warning); generated `.tmp` lint exclusion; dependency/testing evidence, acceptance record and this handoff. All previously uncommitted foundation files remain preserved, as described by the implementation entry below.

**Migrations:** no applied SQL was edited and no new migration was added. The seven existing application migrations are verified by maintained fresh/repeat/checksum tests, populated pre-change rows (email snapshot backfill and retirement of unversioned pending approvals), logical dump/restore preserving ownership/ACLs and audit hashes, runtime DDL/TEMP/audit/verification-table denials and applied-checksum-tamper rejection. Database ACL restoration is explicitly a provisioning step. Drizzle regeneration reports no drift. This is a PostgreSQL 18 local rehearsal, not managed PITR or production hosting evidence.

**Actual results:** final results are in `docs/evidence/2026-10-13-phase7-prepublication.json`. The complete uninstrumented backend run passed **51/51**, including exact D1–D9/S1–S17, application security and migration/race regressions; the coverage run passed all **16 application assertions** but exited 1 for below-floor coverage. Latest branch percentages: identity 58.61%, access 77.27%, audit 80% (required 90%); staff 48.65%, db 62.5%, API 63.44%, worker 26.31% (required 75%). Config 85.18% and shared 78.26% meet 75%. Full backend coverage is 56.22%. Empty early coverage output was a configuration failure, never a pass. The first instrumented concurrent gate run exposed the lock inversion and also failed S12 timing; subsequent complete uninstrumented run passed with the original <=20ms/<=1.5 limits. Coverage now measures all foundation source and enforces individual floors. It never counts the duplicate gate implementation as production coverage.

`pnpm check` passed format/lint/types, **79 contract + 388 web + 13 backend units = 480**, and production web build; backend build passed all five packages. Strict complete frozen installation passed after adding the planned, aged coverage pin; dependency security/build policies remain unchanged. Mock exclusion passed 4/4; full production audit has zero vulnerabilities; critical-level audit passes; **full audit exits 1 with one unpatched high braces development advisory**, with no suppression or exception. The final full desktop/mobile Chromium run recorded **416 passed / 2 timed out / 82 existing skips**; both long desktop journeys passed an unchanged isolated rerun (same 30-second timeout), so the full run remains recorded failing. An earlier full run found the old enrollment-heading selector; the corrected two-project test passed without changing independence assertions. Initial filtered installation disrupted workspace links; complete frozen installation repaired them before final validation.

**Credential/data review:** digest-pinned, network-disabled Gitleaks 8.30.0 scanned candidate source and all-ref Git history, with full redaction. Three source/two history findings were specific prose and a fictional config placeholder, manually classified; no real credential was found and no scanner rule was disabled. The final exact-value scan of seven actual local secret values found no matches in 4,245 candidate/build files. Generated local env remains ignored and 0600; mail bodies, credentials, raw failures and traces are excluded from durable evidence. No real-user data or production account was used. OSV and formal SBOM CI are unimplemented; a local license/dependency inventory is not claimed as an SBOM.

**Environment and next step:** API/worker were restarted through the minimal launch wrappers after fixes; health 200, foreign Origin 403, registration 202 and real queued local SMTP observation passed. Local Compose data and the preexisting mock server/build remain preserved. ADR 0013/P-13 and provider/hosting decisions remain unresolved; those paths fail closed. Claude reviews the critical repair and migration evidence, fills meaningful test gaps to meet the documented coverage floors and resolves the recovery protocol with the owner. Diagnose the full-browser timing reliability and remediate/disposition the visible advisory; restore GitHub PR API access. Only after the publication condition is met should main/new branch/PR be published. No Phase 8, merge, deployment, purchase or production-readiness claim.

### Codex Phase 7 implementation and PR #7 integration (2026-10-13)

**Authorization/scope:** the owner authorized Backend Foundation and instructed continuation. Claude remains primary engineer/architecture owner. Exact D1–D9/S1–S17 spikes passed before feature work; no redesign, paid service, production deployment or Phase 8 work. Proposed ADR 0013 is not implemented.

**Git/Phase 6 repairs:** initial HEAD 93356a1 was clean. Dedicated branch feat/phase7-backend-foundation was created. The unpushed repair branch was initially absent; later GitHub verification found fix/phase6-review-findings at **20eaa494933f3598b7ce4dd75fff4ceb0f03ca75**, merged in **PR #7 / 4b16cdb6324e1f5d3b979bd8d5e82ef36ca168ba**. Preserved tracked changes in /tmp/blacklist-phase7-tracked-before-pr7.patch and a named include-untracked stash; fast-forwarded this branch and reapplied all Phase 7 work. Resolved only the handoff conflict by retaining both histories. The repair's revision-bound appeal checks, reversal tombstones, six regressions and full cross-browser selection are intact. The preservation stash remains, not dropped. No Phase 7 commit/push/PR exists; changes are local/uncommitted.

**Implemented:** validated/frozen config; separately provisioned DDL/DML roles; forward-only reviewed Drizzle and hand SQL; runtime role rejection, no startup migrations, supported DML pg-boss supervision; modular identity/access/staff/audit services; thin Fastify routes with default-deny policy inventory, exact Origin/JSON, trusted GET-only SSR, sanitized errors/logs; real queue worker/Nodemailer SMTP/Mailpit; local Compose and operator CLI. Identity is headless Better Auth with the proven exact host cookie, Argon2id/NFKC/breach fallback, durable throttles/human-verifier port, mailbox-first registration, delivery generations/hashes, atomic reset/password/email transitions, session versions/lifetimes/revocation/ownership/cooling and security telemetry. Audit uses canonical chained append, fixed search path, minimal details, triggers/grants and daily verification.

Staff covers split-secret bounded enrollment, two verified UV credentials, session assurance, single-use action-bound execution, independent invitation/role/recovery approvals, factor removal/replacement/deficit, suspension/offboarding, ordinary recovery window/re-enrollment and technical bootstrap/break-glass. A replacement factor must also have an existing-factor assertion; a stolen assured cookie/new factor alone is rejected. Caller binding precedes verification/counter effects. Factor changes bump versions/revoke others/invalidate tokens/expire challenges; surviving assurance comes from the verified remaining factor. Password action hashes bind immutable Argon2 drafts, not fast password digests. Own data and staff/admin/profile/recovery HTTP adapters are wired; later-phase capabilities stay unavailable. Fresh enrollment is not called completed recovery, and separate-channel codes are displayed once.

**Changed files:** packages/config/src and configs/manifests; packages/db/src/schema/client/migrate/queues, migrations and operator scripts; packages/domain/src identity/access/staff/audit/shared modules; apps/api/src plugins/routes/server/main/cli and configs; apps/worker/src worker/SMTP/main and configs; apps/web live adapters/server/browser selection/Next rewrite and staff recovery-code presentation; transport/recovery contract schemas and corresponding mock regression expectation; infrastructure/local scripts/Compose/README; test acceptance/runtime sources; workspace lockfile/dependency resolution; AGENTS/status, data model/dependency policy, acceptance evidence, implementation security review and proposed ADR 0013. Existing repair sources are integrated, not replaced.

**Application migrations (not fixture SQL):** packages/db/migrations/generated/0000_fixed_alex_wilder.sql (initial 26 tables), 0001_rich_tomorrow_man.sql (email snapshots/terminal time/challenge binding), 0002_material_thunderbird.sql (private credential drafts, table 27), 0003_absurd_miek.sql (private suspension reason), 0004_harsh_molten_man.sql (captured target security version; retires unversioned pending requests); hand 0001_security_boundaries.sql (canonical audit/grants/triggers) and 0002_identity_guards.sql (immutable account kind). Later mandatory columns have explicit reviewed backfill/retirement. SQL applies only by migrator; no down migration or drizzle push. PostgreSQL 18 is the tested local candidate, not a hosting decision. Drizzle regeneration reports no schema changes.

**Exact acceptance status:** **D1–D9 PASS; S1–S17 PASS** for the required isolated criteria, mapped verbatim in docs/phase7-acceptance.md. The integrated final runner records **47 passed, 0 failed, 0 pending/skipped**, 9 files (35 original gate proofs, 6 application integration tests and 6 runtime security units). Evidence: docs/evidence/2026-10-13-phase7-runtime.json. The 69 route/method policy entries and anonymous denials are in docs/evidence/2026-10-13-phase7-route-matrix.json. Real fixtures use fresh PostgreSQL 18/Mailpit and Chromium 154 with virtual UV authenticators. The recovery window is advanced only in fixture data; no physical-device independence or 24-hour wall-clock wait is claimed.

**Checks actually run on integrated HEAD:** pnpm check exit 0 (format/lint/types, **79 contracts + 388 web + 13 backend units = 480**, production web build); pnpm build:backend exit 0 for all five packages; complete Vitest backend run 47/47; strict frozen install exit 0 for 14 workspaces; Drizzle no drift; mock-exclusion 4/4; local provisioning/migration repeated successfully; actual launch-wrapper API/worker smoke: health 200, foreign Origin 403, registration 202, queued SMTP message observed in local Mailpit; E2E discovery only after PR #7, not a new frontend browser pass. git diff --check passes. Early failures (joins timing, DTO/link/config/refinement/handle/assurance/cleanup integration) were corrected and rerun; no tests/assertions/security policies were disabled. The historical 35-proof record is retained separately.

**Dependency/security status:** exact approved aged pins; owner-approved esbuild build versions 0.18.20/0.25.12/0.28.2 only; release-age, trust, strict builds and exact versions unchanged. Next/optional peer 16.3.8, source-map-js 1.2.2 and older esbuild resolution patched. Full audit still **fails with 1 high braces advisory, no published fix**; critical/moderate/low counts zero. Critical-level audit exits 0. No ignore/exception or clean-audit claim. Detailed JSON metadata: docs/evidence/2026-10-13-phase7-dependency-audit.json. New Nodemailer/browser dependency necessity and release dates are in dependency-policy.md. Implementer's security check: docs/reviews/2026-10-13-phase7-implementation-security.md; independent Claude review remains pending.

**Remaining blockers/untested:** ADR 0013 / P-13: sole-admin/small-team verifier authority, objection resolution and suspended-subject objection channel are not defined; current paths fail closed. O-6 human-verification provider is unavailable by default; O-7 production mail provider and O-4 hosting remain decisions. The unpatched advisory remains visible. Coverage floors/planned CI/OSV/SBOM/secret scanning, full frontend browser execution after these changes, Firefox/WebKit, real devices/assistive technology, deployment/PITR/provider assurance and external audit checkpoints are unverified. Member erasure/restoration and release/operational workflows beyond the explicit Phase 7 identity/staff scope are not claimed. Phase 7 is not signed off or production ready.

**Environment/handoff:** local Compose volume/ignored generated credentials preserved. API and worker launch wrappers exclude migrator/provisioning credentials, worker has no signer secret; API/worker processes are running locally (restart after source edits). Disposable integration containers clean themselves up. Updated the onboarding start_skill draft with tested Phase 7 startup; it is saved for environment-settings review/publish, not applied/publication or fresh-task restoration. The initial mock server was preserved; do not rebuild .next-mock while it runs.

**Next:** Claude reviews the concrete implementation/migrations/security evidence and ADR 0013, owner settles the recovery/provider/procedural decisions and publication scope, and required release checks are completed before Phase 7 closure. Do not start Phase 8 or deploy.


### Codex Phase 6 repairs (2026-10-13)

- Owner requested “fix it”. Fixed P6-01–P6-03 within the frontend mock adapter and E2E configuration; no backend or architecture change.
- Appeals capture the published revision number. Decisions reject a superseded or reversed target before case, public projection, audit, or step-up consumption changes. Revision content remains immutable; legacy suspended fixtures retain their revision-1 snapshot.
- Both reversal paths mark the finding reversed and supersede its revisions while retaining their content/history. Pending proposals cannot regain publication authority even with fresh step-up.
- Firefox/WebKit/WebKit-mobile now select all E2E specs: 250 each, including 88 Phase 6 cases each; 1,250 total listed. This is test discovery, not browser execution.
- Added six regression cases covering stale uphold/amend/reverse with unchanged state, a new appeal against revision 2, and publication attempts after appeal/suspension reversal.
- Validation: `pnpm check` passed (79 contract + 384 web tests, formatting, lint, typecheck, production build). Mock build passed; mock-exclusion scan passed 4/4 checks.
- Security: exact revision/state authority checked before effects; public/private and scoring invariants preserved. No dependencies, migrations, routes or permission changes. Existing mock boundaries remain; browser binaries unavailable.
- Owner authorized push and merge of `fix/phase6-review-findings`. This change is being published through a PR; verify GitHub merge status before continuing. Real browser coverage remains open. Owner subsequently authorized Phase 7 for Codex; backend implementation has not started in this checkout.


### Codex Phase 6 review (2026-10-13)

- **Scope:** merged PR #6, commit `93356a16ee8f2031813dfd60d01778f8f0707486`, compared with PR #5 merge `0e9bf58`. No application repairs or backend implementation.
- **Verdict:** required fixes before Phase 6 closure: two High (appeal decisions not bound to the actual public revision; a pending revision can resurrect a reversed finding) and one Medium (Firefox/WebKit test selection excludes the new Phase 6 workflows). See [review](docs/reviews/2026-10-13-phase-6-codex-review.md).
- **Independent checks:** `pnpm check` exit 0: format/lint/typecheck, 79 contract + 378 web tests, production build. Mock build exit 0; exclusion scan 4/4 PASS. Previous six fixes/regression source unchanged and passing.
- **Additional evidence:** three lifecycle regression expectations failed on the reviewed source. Reproduction sample: `docs/reviews/reproductions/2026-10-13-phase-6.test.ts.sample` (outside the baseline suite). All-browser test listing has 602 cases, but Firefox/WebKit/WebKit-mobile each have zero cases from revisions/recovery/quality-audit specs.
- **Limits:** no independent browser execution/screenshots; compatible browsers unavailable in this environment. Claude's reported 418 passes/82 skips remain author-reported. Manual/assistive-technology and actual cross-browser checks are open.
- **Changes:** this handoff, the Phase 6 review, and reproduction sample only. No dependency, migration, architecture change, application fix, commit, push, merge or posted GitHub comment.
- **Next:** Claude fixes P6-01–P6-03 and records outcomes; Codex rechecks; owner resolves existing pagination/status/permission questions before sign-off. No Phase 7 authorization is implied.


### Historical Codex Phase 7 acceptance session (before runtime implementation) (2026-10-13)

**Owner authorization:** implement Backend Foundation within the approved architecture; Claude remains primary engineer/architecture owner. Read the canonical rulebook, PRD, essentials, relevant architecture/migration/identity/job/audit sections, threat model and normative identity/moderation/chain designs. Begin with exact D1–D9 and S1–S17 criteria, not inferred meanings.

**Preflight and concrete blocker:** GitHub head and all fetched branches were verified. The initially clean checkout is `93356a16ee8f2031813dfd60d01778f8f0707486` (PR #6 merge). Created `feat/phase7-backend-foundation` without a worktree, reset or history rewrite. GitHub has `chore/initial-repository`, `claude/amazing-goodall-drtbc9`, and the earlier merged `fix/frontend-review-findings`. The requested **`fix/phase6-review-findings` is absent** from remote/local branches, reflogs, stashes, unreachable objects and other workspace checkouts/patches/bundles. It is not the earlier Phase 5 repair branch. Asked the owner where the unpushed repair checkout/commit bundle/patch is preserved; no answer has arrived. No repair was invented, discarded or substituted. The explicit repair-preservation/integration prerequisite prevents advancing to production backend features until that source is supplied.

**Independent work completed:** [isolated acceptance package](tests/backend-acceptance/README.md), disposable PostgreSQL 18/Docker harness with random local credentials, separate migrator/runtime logins, Drizzle-generated fixture SQL and snapshots, handwritten append-only grants/triggers/canonical hash-chain append, nontransactional concurrent-index proof, restore rehearsal, same-client Drizzle/pg-boss transaction proof, headless Better Auth configuration and adapter transaction proof, Argon2id normalization/rehash, browser host-cookie/origin probes, real job delivery/retry/DLQ/leak inspection, member reset crash/race tests, E-1 negatives/rotation and a real SimpleWebAuthn/Chromium UV staff-reset challenge/rollback/replay proof. All are narrow gate spikes, not production features or mock replacement authorization.

**Gate map:** [docs/phase7-acceptance.md](docs/phase7-acceptance.md) copies all 26 criteria verbatim and maps each to implementation, validation and evidence. D1–D9 and S1–S17 passed their isolated proofs. The full 35-test spike run passed; an additional strengthened D2/D4/D9 rerun passed 7/7. The first combined run had one S12 failure (median timing ratio 1.52 vs limit 1.50). Diagnosed known-email-only fallback credential queries; added Drizzle relations and supported `advanced.database.joins:true`. The original <=20 ms and <=1.50 thresholds were retained. TypeScript incompatibilities were corrected without weakening strict/erasable/verbatim policies. No assertion, test or gate was disabled.

**Dependencies/security policies:** selected exact, aged candidates in the acceptance package only. The owner explicitly approved version-scoped esbuild build scripts **0.18.20, 0.25.12, 0.28.2** after strictDepBuilds blocked them; source reviewed, precise `allowBuilds` entries added, frozen installation succeeded. All other supply-chain controls stay unchanged. [Dependency review](docs/dependency-policy.md#22-installed-for-isolated-phase-7-acceptance-2026-10-13) records versions, footprint, maintenance and risks. `pnpm why` confirmed all five transitive Better Auth adapters; only Drizzle is configured. Full audit is **not clean**: 9 advisories (3 high / 5 moderate / 1 low), 0 critical. Critical-level audit exits 0, full JSON audit exits 1. Known Next/braces/source-map-js paths and the new drizzle-kit esbuild loader need follow-up with the Phase 6 repairs. No production security exception or readiness claim.

**Files changed:** `tests/backend-acceptance/` (package/configs, source, tests, fixture SQL/snapshots, README); `pnpm-lock.yaml`; version-specific build entries in `pnpm-workspace.yaml`; `docs/phase7-acceptance.md`; dependency/data-model documentation; AGENTS status and this handoff. Frontend components, mocks, contracts and existing tests are unchanged. No production migration is present in `packages/db`; fixture migrations are disposable and never applied to a shared database. No new network/proxy credentials or secret values were saved.

**Actual final checks:** `pnpm install --frozen-lockfile` exit 0 (14 workspace projects); `pnpm check` exit 0 (format, lint, all applicable type checks, 79 contract + 378 web + 7 acceptance unit tests, production web build). Final complete gate run: **35 passed, 0 failed, 0 skipped/pending**, 7 files, 47.99 seconds, on fresh PostgreSQL 18 containers with Chromium 154. [Durable runner evidence](docs/evidence/2026-10-13-phase7-gates.json) preserves names/status/durations and actual run timestamp. Mock-exclusion scan **4/4 PASS**; `schema:generate` re-exercised for no drift. Earlier setup's selected frontend Chromium run (178 passed / 2 intentional skips) was not rerun in this coding session; frontend browser behavior is not newly claimed beyond the current gate probes, builds and existing unit suites. `git diff --check` passed. Complete audit retains 9 advisories, as above.

**Untested/unimplemented:** production API/worker build, SMTP integration, complete staff lifecycle/CLI, durable auth throttling, real provider/breach-check integration and frontend HTTP adapter. Hosting/PITR, PostgreSQL 17, real-device/assistive-technology checks remain unverified. Test containers/credential files were removed by the harness. No deployment, purchase, production access, Phase 8 work, commit or push occurred. The Phase 7 branch and changes are local and uncommitted; no matching remote branch exists. Phase 7 is not complete.

**Next step:** bring the actual unpushed `fix/phase6-review-findings` branch into this workspace (checkout path or commit bundle/patch); inspect and integrate it while preserving work and its moderation/appeal/reversal/privacy fixes. Then continue the authorized production Phase 7 foundation and rerun these proofs against the production components before any migration/security feature merges. Claude reviews architecture/security-sensitive implementation; the owner controls merge/publication. Phase 7 is not complete.

### Session 19: Claude Phase 6 — Frontend Quality Pass and Final Review (2026-10-13)

- **Branch:** `claude/amazing-goodall-drtbc9`, restarted from `chore/initial-repository` at `0e9bf58`, which includes PR #5 (Codex's six repairs). All six fixes and their 13 regression tests are preserved unchanged (`review-regressions.test.ts` passes). Read AGENTS, CLAUDE, PRD, ESSENTIALS, ARCHITECTURE §36, THREAT-MODEL, this file, the checklist, the integration contracts and the 2026-10-13 Codex review.
- **Baseline before changes:** `pnpm check` exit 0 (77 contract + 367 web tests, build); full Chromium E2E 322 passed, 2 skipped (desktop-only/mobile-only cases).

**Completed**

1. **Finding revision editor** (`/mod/findings/[id]`; moderation §2, §8.1). `ModerationApi.getFindingHistory` and `proposeRevision(findingId, base, draft)`. The base is the exact latest revision number and hash, else `conflict`; unchanged content is refused; revisions are never edited (a test compares the earlier revision field by field). A revision still awaiting approval is superseded, and the public revision stays public until the new one is approved. Status is `pending_second_approval` when the new **or** the currently public revision is severe. Proposals during a suspension are allowed; approval stays blocked by PR #5's barrier. The approval path is PR #5's `approveRevision` (latest + hash + suspension barrier + severe-replacement independence + bound step-up); it is not modified. Fixture findings 301 and 401 now have a seeded published revision 1 (hashed by the shared `revision-hash.ts`) so the editor has an exact base. No step-up for a proposal: it publishes nothing and is not in identity §10.7's list.
2. **Appeal amendment** (moderation §8.1, §9). The `amend` decision now carries `severity` and an amended public summary (contract split from uphold/reverse). It creates a new revision authored by the reviewer, with `sourceCaseId` set to the appeal. The public page and timeline do not show the amended text until that exact revision is approved. A severe amendment needs a non-participant approver. A published later revision keeps an open "under appeal" notice.
3. **Staff recovery verification** (`/mod/recovery`; identity §10.11 step 2). Shared rule in `mock/recovery.ts`, used by both `ModerationApi.verifyRecoveryIdentity` and `AdminApi.verifyRecovery`: two different verifiers, at least one an admin, never the subject. New permission `staff:recovery:verify` for moderators and admins; appeal reviewers are excluded because they may be external (moderation §9). The page warns never to verify by email and never to ask for passwords, recovery codes or seed phrases.
4. **Quality audit and fixes.** New `quality-audit.spec.ts` (80 checks, desktop project). It found and I fixed:
   - (a) at 320 px the signed-out header squeezed the menu button to 22.75 px wide; it now stays fixed-size, and the brand name is visually hidden below 360 px;
   - (b) **danger buttons were white on #ff8a7a (~2:1) in system dark mode**, because the `dark:` variant only applies to an explicit theme choice; new `--danger-fg` token;
   - (c) tab panels are focusable but suppressed their focus outline (WCAG 2.4.7); outline restored;
   - (d) badges overflowed at 320 px under WCAG 1.4.12 text spacing; they now wrap.
5. **Integration docs reconciled** (`api-integration-contracts.md` §3, §4, §9; ARCHITECTURE §7.1 endpoint list; §9.2 moderator permission). Mock-exclusion markers added for Phase 6 mock text.
6. **Docs:** checklist (new rows, WCAG and cross-browser status stated honestly), frontend.md §7f, AGENTS §1 status, this file.

**Actual validation (final run, after all changes)**

| Gate | Result |
|---|---|
| `pnpm check` (format, lint, typecheck, unit/component, production build) | exit 0: 79 contract + 378 web tests passed |
| `build:mock` | exit 0 |
| `check:mock-exclusion` | exit 0 (4/4 PASS) |
| Playwright Chromium (pre-installed `/opt/pw-browsers/chromium`, via a temporary local config that only sets `executablePath`; deleted before commit) desktop + Pixel 7 | **418 passed, 82 skipped**: 80 skips are the audit spec on the mobile project, by design (it sets its own viewports); 2 are the existing desktop/mobile-only shell cases. No assertion weakened |
| New E2E | `revisions.spec.ts` (6 tests × 2 projects), `recovery.spec.ts` (2 × 2), `quality-audit.spec.ts` (80, desktop) |
| Journeys covered by E2E | report → review → approval → public finding, correction, suggestion, appeal reversal (`journeys.spec.ts`); responses and suspension (`admin.spec.ts`); revision edit and appeal amendment (`revisions.spec.ts`); staff recovery (`recovery.spec.ts`, `admin-api.test.ts`); admin console; scoreboard |
| **Firefox / WebKit** | **Not run (open).** `playwright install firefox` fails with HTTP 403 from the browser download host (`cdn.playwright.dev`), which the environment's network policy blocks. No substitute browser used. To run: allow that host in the environment's network settings, then `E2E_ALL_BROWSERS=1 pnpm test:e2e` |

**Accessibility: what was actually checked (agent-performed, no assistive technology)**

- Automated: axe WCAG 2.2 AA tags in light (existing specs) and dark (39 routes) themes; target size ≥ 24 px for buttons, inputs, selects and tabs at 7 viewports; reflow with no sideways scroll at 320–1440 px and 740×360 landscape; WCAG 1.4.12 text spacing at 320 px.
- Scripted keyboard: 40 Tab presses on five pages (home, address, report form, case workspace, admin staff), each focused element checked for a visible outline/ring; dialog focus trap (12 Tabs stay inside), Escape closes, focus returns to the trigger; existing skip-link and mobile-menu focus tests.
- Visual: I inspected screenshots at 320 px and 1440 px dark for home, severe address, scoreboard, case workspace, revision editor, admin staff, report form and recovery: no clipping, overlap or unreadable identifiers found. Full-page captures show the fixed tab bar mid-page; that is a screenshot artifact, not a layout bug.
- **Not done:** screen reader testing (NVDA/JAWS/VoiceOver), real touch devices, browser zoom on real hardware, a human colour/contrast review. **No WCAG 2.2 AA conformance is claimed.**

**Security UX recheck** (all with existing or new test evidence):
- fragment tokens removed and not stored (`auth.spec.ts`, `token-forms.test.tsx`);
- safe redirects (`safe-redirect.test.ts`) and generic errors (`login-form.test.tsx`);
- seed-phrase warnings (`auth.spec.ts`, footer; the recovery page too);
- defanged links as plain text (`staff-review.test.tsx`, `projects.test.tsx`);
- public/private separation: new tests check that internal rationale and unapproved revision text never reach public pages;
- mock exclusion (gate above);
- exact confirmed parameters to step-up: unchanged PR #5 binding, and the amend decision is bound like every other decision;
- missing data never shown as zero/low (`risk-components.test.tsx`, `search-results.test.tsx`);
- bands never numeric (`research.spec.ts`, contract strictness).

The six Codex fixes are untouched. No test, security setting, CSP or dependency policy was weakened: the audit applies text spacing through the CSSOM because the CSP correctly refused an injected style tag.

**Decisions made (within the approved design)**
- Revision proposals need no step-up.
- Appeal reviewers are not recovery verifiers.
- ARCHITECTURE §9.2 now lists `staff:recovery:verify` for moderators, to match normative identity §10.11. **Codex/owner: please confirm** this summary-table change. If you prefer a formal record, I will write an ADR.

**Open decisions and gaps (not invented)**
1. Pagination: approved §7.1 says cursors, but the directory and queue use page numbers. Owner chooses between moving to cursors (about a day of frontend work) or an ADR for bounded page lists.
2. Correction and response status sets are undefined in docs/data-model.md.
3. Evidence changes on an existing finding wait for the upload pipeline (Phase 7).
4. O-12 scoring sign-off; ADRs 0009 and 0011 remain Proposed.
5. Legal review of the transparency pages (launch blocker).
6. Firefox/WebKit runs (environment).
7. Assistive-technology accessibility audit.

**Files:**
- contracts `moderation.ts` (+ new `moderation.test.ts`);
- mock `moderation-api.ts`, `admin-api.ts`, `store.ts`, `public-effects.ts`, `rpc-methods.ts`, new `revision-hash.ts`, `recovery.ts`, `finding-revisions.test.ts`, `admin-api.test.ts`;
- `types.ts`, `not-connected.ts`, `permissions.ts`, `nav-items.ts` (+ test), `copy.ts`;
- UI: new `finding-revision-editor.tsx`, `recovery-verification-view.tsx`, pages `/mod/findings/[id]` and `/mod/recovery`; `decision-panel.tsx`, `findings-view.tsx`, `approvals-view.tsx`, `staff-admin.tsx`, `app-shell.tsx`, `brand.tsx`, `mobile-nav.tsx`, `badge.tsx`, `tabs.tsx`, `button-styles.ts`, `globals.css`;
- E2E: `revisions.spec.ts`, `recovery.spec.ts`, `quality-audit.spec.ts`;
- `check-mock-exclusion.mjs`;
- docs listed above.

No dependency, migration, CI, infrastructure or backend change.

**Verdict: ready for Codex review and frontend sign-off, with the open items above stated** (none blocks a frontend sign-off; Firefox/WebKit and an assistive-technology audit remain open checks rather than passes). **Next step:** Codex reviews Phase 6; the owner decides pagination and the §9.2 confirmation, then signs off. Stop here: Phase 7 is not authorized.


### Codex frontend repair pass (2026-10-13)

- **Owner request:** fix the six findings; work is on `fix/frontend-review-findings` from PR #4's merge (`87fc8b9`). Default branch is unchanged.
- **Completed:** actor/session/exact-parameter single-use grants; invalidation on staff security transitions; independent approval for severe replacements; retained participant history; suspension publication barrier; DNS standing eligibility; profile base-revision conflicts; minimal public records for newly reported Ethereum/Solana addresses without invented chain facts. UI callers bind the same confirmed arguments as the service consumes.
- **Tests:** six original review regressions plus seven additional negative/positive scenarios in the normal suite. Existing tests now pass exact verified arguments. The self-approval test uses a fresh non-suspended finding rather than its old suspended fixture. No tests skipped or weakened.
- **Actual validation:** `pnpm check` exit 0, including format/lint/typecheck, 77 contract + 367 web tests and production build. Focused final regression file: 13 passed. Mock build and exclusion scan exit 0: production contains no mock markers and neither browser bundle contains scanned server-only names. No browser E2E rerun: Playwright browser download remains unavailable.
- **Files:** mock services/store and new `step-up.ts` / `finding-participants.ts`; affected staff/admin confirmation UI and service interfaces; regression and affected existing tests; frontend/integration docs; review report and this handoff. No dependency or migration changes.
- **Next:** Claude review of the fix branch, then remaining Phase 6 manual accessibility/responsive/cross-browser and revision-editor/integration-documentation work. Phase 7/backend gates are unchanged.


### Codex independent merged-frontend review (2026-10-13)

- **Owner request:** review everything Claude has pushed so far; owner confirmed backend begins in Phase 7. This session implements no backend or feature work.
- **Scope:** merged commit `87fc8b927ca369055988a5a1912b8151470fb49f` on `chore/initial-repository`, including PR #4 administrator follow-up and accepted band-only scoreboard. Earlier pause was respected; review resumed after the owner confirmed the merge and requested it.
- **Verdict:** required fixes before frontend sign-off: three High and three Medium findings in [review](docs/reviews/2026-10-13-frontend-codex-review.md). Step-up actor/parameter binding; independent approval of severe replacements; suspension publication barrier; mismatched DNS standing; stale profile corrections; publication for previously unknown addresses.
- **Actual validation:** frozen installation under Node 24.21.0 / pnpm 12.7.0; `pnpm check` exit 0 (format, lint, type checks, 77 contract + 354 web tests, production build); mock build and mock-exclusion scan exit 0. Six additional regression expectations fail on the reviewed commit, reproducing the six findings. Their source is preserved outside the baseline suite under `docs/reviews/reproductions/2026-10-13-frontend.test.ts.sample`.
- **Browser limitation:** no independent E2E run. Playwright Chromium download was invalid/truncated and failed installation; Firefox/WebKit unavailable. Claude's reported 322 passes remain author-reported evidence.
- **Changes:** this handoff, review report, reproduction sample only. No application fix, new dependency, migration, architecture change, commit, push, merge, deployment or posted GitHub comment.
- **Recommended next step:** Claude responds to and fixes each finding within the approved design, adds the regressions to the normal suite, then Codex rechecks. Complete outstanding Phase 6 quality/manual accessibility/cross-browser and revision-editor requirements before frontend sign-off. Phase 7 must still begin with D1–D9 and S1–S17 acceptance gates.

| # | Agent | Session | Outcome |
|---|---|---|---|
| 1 | Claude | Phase 0 foundation | PRD, architecture, threat model, rules, scaffold |
| 2 | Codex | Independent review | APPROVED AFTER REQUIRED FIXES: 1 Critical, 8 High, 7 Medium, 2 Low; six Proposed ADRs (details preserved below) |
| 3 | Claude | **Review response + foundation fixes** | All 18 findings accepted (13 as written, 5 with amendments); ADRs 0001–0006 Accepted with amendments; ADR 0007 added; architecture revision 2; four additional flaws found and fixed by adversarial self-review |
| 4 | Codex | Revision 2 final re-review | APPROVED AFTER ADDITIONAL REQUIRED FIXES; 14 PASS / 4 PARTIAL; A1-A4 PASS; E-1 acceptable with mitigation; Proposed ADR 0008 |
| 5 | Claude | **Final Phase 0 closure corrections** | V2-01–V2-05 accepted and resolved; ADR 0008 Accepted with amendments; addenda to ADRs 0001/0002/0003/0005/0007; E-1 and P-11 owner decisions recorded; frontend-first plan; revision 3 |
| 6 | Claude | **Phase 1: Frontend Foundation** | Next.js 16 app, design system, shell, mock-backed auth/search/research UIs, contracts; 122 unit + 110 e2e tests passing; mock exclusion verified |
| 7 | Codex | **Independent Phase 1 review** | APPROVED AFTER REQUIRED FIXES: 2 High, 5 Medium, 3 Low; reproduced tests/builds; no backend creep; Phase 2 remains unauthorized |
| 8 | Claude | **Phase 1 correction pass** | P1-01/P1-02 fixed with negative contract tests; P1-03, P1-04, P1-06–P1-10 fixed; P1-05 partial (rest is Phase 3); all gates pass |
| 10 | Claude | **Phase 2: Account & security frontend** | Login/logout/session-ended, registration and reset states, security settings, password/email change, sessions, staff enrollment/verification/step-up/recovery; member and staff DTOs; 242 unit + 168 Chromium e2e passing; Firefox/WebKit 95/96 (one load timeout, passes in isolation) |
| 9 | Codex | **Final Phase 1 closure check** | APPROVED FOR PHASE 2 AUTHORIZATION; required fixes verified; root check exit 0, 149 unit/component passes, focused E2E 25 passes/1 skip; Phase 2 NOT authorized |
| 11 | Codex | **Phase 2 initial review** | Three open findings: staff enrollment password discarded (High), staff reset lacks WebAuthn (High), login lacks human-verification challenge (Medium). Static review only; see review file. |
| 18 | Claude | **Project risk ranking (scoreboard)** | Owner asked to build the scoreboard and chose the band-only ranking. ADR 0012 accepted (band-only); `/scoreboard` on mocks; contracts 77 + web 354 unit tests, Chromium E2E 322 passed / 2 skipped |
| 17 | Claude | **Phase 5 follow-up: remaining gaps and administrator console** | Owner chose "gaps + admin console" when the Phase 5 brief was re-sent after the merge. Public subject responses, authority-signature standing, emergency suspension with 72-hour review, minimal profile, and the admin console (staff lifecycle with two-person rules, members, labels, suppressions); contracts 75 + web 348 unit tests, Chromium E2E 314 passed / 2 skipped |
| 16 | Claude | **Phase 5: Frontend completion and integration validation** | Owner-authorized with four decisions (scope, ADR 0010 Part A accepted, scoreboard → ADR 0012 Proposed, shared server mock). Member report, suggestion, correction and appeal flows with status, replies and withdrawal; connected member↔staff journeys on a per-session demo store; transparency pages (drafts); requirements checklist; integration contracts; contracts 70 + web 321 unit tests, Chromium E2E 280 passed / 2 skipped |
| 15 | Claude | **Phase 4: Staff review UI** | Owner-authorized, with the roadmap swap recorded (Staff UI = Phase 4, Reporting & Redress = Phase 5). Review dashboard, case workspace, approvals and admin audit on a mock moderation service that enforces roles, scope, transitions, assignment, conflicts, independence and step-up; contracts 70 + web 287 unit tests, Chromium E2E 238 passed / 2 skipped |
| 14 | Claude | **Phase 3: Research UI (projects)** | Owner-authorized. Project directory and profiles on mocks; P1-05 source labels; P1-03 transfer scenarios; Proposed ADRs 0009–0011 for the owner's out-of-scope requests (not implemented); contracts 70 + web 243 unit tests, Chromium E2E 212 passed / 2 skipped |
| 13 | Claude | **Phase 2 review corrections** | P2-01, P2-02 and P2-03 fixed within the approved design, with negative tests; contracts 60 + web 209 unit tests, Chromium E2E 172 passed / 2 skipped; Codex closure check requested |
| 12 | Codex | **GitHub repository setup** | Owner requested a public `blacklist` repository and push. Created `Skyboyyt/blacklist`, pushed `chore/initial-repository`, verified remote commit and enabled secret scanning/push protection. |

---

## Session 18: Claude project risk ranking — ADR 0012 accepted, band-only (2026-10-12)

### Decision

- The owner asked to "build the score board". Claude reported the conflict with P-11 (no public number) and "no combined project rating".
- The owner chose the **band-only ranking** over three alternatives: a numeric ranking (which would reverse P-11 with an unsigned calibration), a findings-count board, or not building it.
- ADR 0012 is now **Accepted (band-only variant)**, with the decision recorded in full. P-11 and ADR 0009 are unchanged.

### The rule (ADR 0012 Decision)

- **Band:** the highest band among the project's official addresses' own assessments, on the chosen network when one is selected.
- **Not ranked**, with a reason: stale profile, unavailable assessment, suspended finding, nothing assessed, low confidence on every address that sets the band, or no official addresses. Missing data is never ranked as low risk.
- **Ranks** are shared within a band and listed A–Z. There is no score and no tie-break by score.
- Project pages and directory cards still have **no combined rating**.

### Completed work

- **Contracts:** `scoreboardRequestSchema`, `scoreboardEntrySchema`, `scoreboardResponseSchema` in `project.ts`. Strict schemas, so score fields are rejected (tested).
- **Service:** `ResearchApi.getScoreboard`. Mock rule in `lib/api/mock/scoreboard.ts` (reference for the research read model). Not-connected adapter fails like other research reads.
- **UI:**
  - public `/scoreboard` "Project risk ranking";
  - network filter as a plain GET form (works without JavaScript; unsupported networks get the standard message);
  - ranked list showing the deciding address and how many addresses are assessed, a "Not ranked" list, a reading guide and the "as of" time;
  - "Risk ranking" in the main navigation and on the projects directory.
- **Docs:** ADR 0012 and the ADR index; PRD §4.2 note; ARCHITECTURE public route and research endpoint; THREAT-MODEL T-31 note; frontend.md §7b row; requirements checklist (the scoreboard row is now Done (mock)); integration contracts.

### Validation (real output, 2026-10-12)

| Check | Result |
|---|---|
| format, lint, typecheck | Pass |
| `pnpm test` | contracts **77 passed**; web **354 passed** |
| `build`, `build:mock`, `check:mock-exclusion` | Pass |
| E2E (Chromium desktop + Pixel 7) | **322 passed, 2 skipped**, 0 failed |
| Firefox / WebKit | Not run (not installed) |

New tests:

- `scoreboard.test.ts` (6): order and ties, not-ranked reasons, no score in the output, network scoping, low confidence, following published decisions.
- Contract tests (2).
- `scoreboard.spec.ts`: ties and the not-ranked list, the network filter and an unsupported network, an approved finding moving a project from Low to High (rank "2="), axe and 360 px.

### Next step

Codex review of PR Skyboyyt/blacklist#4, which now also contains the ranking. Owner confirmation of the published aggregation rule wording in ADR 0012.

---

## Session 17: Claude Phase 5 follow-up — remaining gaps and administrator console (2026-10-12)

### Authorization and scope

- The owner re-sent the Phase 5 brief after PR Skyboyyt/blacklist#3 had merged. Asked how to proceed, the owner chose **"Gaps + admin console"**: build the approved items Phase 5 had left as gaps, plus the administrator console from documented Phase 4. It runs as a follow-up inside Phase 5 on a fresh branch from the merge (`79a6ef9`).
- No backend, Phase 6 or deployment work was done.
- **Roadmap note:** ARCHITECTURE §36 now records that the follow-up built these items. Real upload processing stays Phase 7.

### Completed work

**Contracts**

- `research.ts`:
  - public `labels` (identification only, provenance `moderator_finding` | `external_source`, no score or weight);
  - `responses` (`subjectResponseSchema` with `standingProvenAt`);
  - `assessment.suppressions` (factor code and public reason only);
  - `SUPPRESSIBLE_FACTOR_CODES` (analysis indicators only);
  - timeline kinds `finding_reinstated`, `finding_reversed`, `response_published`, `signal_suppressed`, `suppression_lifted`.
- `project.ts`: responses reuse the subject response schema.
- `moderation.ts`:
  - case types `subject_response` (interim statuses; documentation gap) and `suspension_review` (`open → reinstated / reversed`);
  - decisions `publish_response`, `reject_response`, `reinstate_finding`, `reverse_finding`;
  - `staffFindingSchema`; counts; audit actions for staff, admin and finding events; `StandingRecord`.
- `submissions.ts`: authority-signature standing (`AUTHORITY_ROLES`), `responseRequestSchema`, `responseTargetSchema`, `subjectKind` on the appeal target, error `account_suspended`.
- `account.ts`: `profileSchema` and `profileUpdateSchema` (display name only; markup refused).
- `admin.ts` (new): staff members, invitations (with a one-time code), role requests, recovery cases, member accounts, labels, suppressions, overview with alerts.

**Mock services (shared demo store)**

- `moderation-api.ts`:
  - staff identity requires an active account that holds the role, so suspension, offboarding and role removal take effect at once;
  - response moderation (standing first);
  - `listFindings` and `suspendFinding` (step-up `finding.suspend`, 72-hour review case, alert to every admin for a severe finding);
  - suspension review independence: non-participant; a severe finding cannot be reversed by its suspender.
- `member-api.ts`:
  - `standingFor` checks the mechanism against the subject: signature for wallets, authority for contracts and tokens, DNS only on official project domains, documents for anyone;
  - responses (one open response per subject per member), profile, and the account-suspended check on every submission.
- `admin-api.ts` (new):
  - active-admin check; step-up grants;
  - invitations: the admin role needs a second, different admin; emails of existing accounts are refused;
  - role changes: grants and removing another admin need a second admin; reductions apply at once; the last admin is kept;
  - staff suspension; offboarding (not yourself; issued invitations revoked; cases released);
  - recovery: two different verifiers, approver ≠ opener, 24-hour window, then a re-enrollment invitation;
  - member suspension; labels; suppressions.
- `public-effects.ts`:
  - suspend (public text replaced by "Temporarily suspended pending review", factor withheld, band recomputed), reinstate, reverse;
  - publish a response; sync a label;
  - apply or lift a suppression.

**UI**

- Address pages:
  - "Public labels" card;
  - "Responses" tab with time-bound wording;
  - "Suppressed indicators" in the assessment;
  - "Respond as the subject" replaces the generic "Appeal or respond" link.
- Project pages: shared `ResponsesList`; "Respond as the project".
- Member pages:
  - `/responses/new` and `/responses/[id]`;
  - shared `StandingFields` used by appeals and responses (the appeal form now offers only the mechanisms that fit the subject);
  - `/settings/profile` form;
  - the appeals page no longer shows "not available yet".
- Staff pages:
  - `/mod/findings` (suspend);
  - case workspace cards for responses and suspension reviews;
  - queue counts and filters for all case types.
- Administrator console: `/admin`, `/admin/staff`, `/admin/users`, `/admin/labels`, `/admin/signals` (route names follow ARCHITECTURE §6.1), plus the existing `/admin/audit`, with a shared sub-navigation.
- `ProtectedAction` and `useProtectedAction`: confirmation, optional internal reason, action-bound step-up, then the action.
- Navigation: "Published findings" for moderators and admins; "Administration" for admins only.
- Preview viewer `admin_b` added as the second administrator.

**Docs**

- Requirements checklist: all items now Done (mock), Partial (stated limit) or the scoreboard Gap by decision.
- Integration contracts: new `AdminApi` section; new member and moderation methods; transitions; effects; mock boundaries; open items.
- frontend.md: §7c and §7d updates and a new §7e for the admin console.
- ARCHITECTURE: route groups (with notes that `/mod/standing` and `/admin/projects` have no separate page yet) and the §36 note.
- data-model: response statuses gap.
- Mock-exclusion markers for the admin fixtures.

### Bugs found and fixed during the follow-up

1. **Confirmation closing the step-up:** the confirmation dialog's close handler read stale state, so moving on to the security key closed the whole action. Fixed with a synchronous ref.
2. **Lost action:** a new action started while the previous one was still reloading was wiped by the old action's close. `useProtectedAction().close` now clears only the request that finished; a regression test covers it.
3. **Invitation email check:** the duplicate-account check compared masked emails, which are not unique, and refused valid invitations. It now compares the full fictional account emails; a test covers it.
4. **Decision panel fields:** which fields each decision needs is now derived from what the builder sends, so the two lists cannot drift again (the cause of the Phase 5 suggestion bug).

### Validation (real output, 2026-10-12, Node 24.21.0)

| Check | Result |
|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | Pass (0 problems) |
| `pnpm test` | contracts **75 passed** (5 files); web **348 passed** (35 files) |
| `build`, `build:mock`, `check:mock-exclusion` | Pass, rebuilt from clean caches |
| E2E (Chromium desktop + Pixel 7) | **314 passed, 2 skipped** (the same two skips as before), 0 failed |
| Firefox / WebKit | **Not run**: the browsers are not installed in this environment |

New tests:

- `admin-api.test.ts` (14): access, step-up, two-person rules, suspension, offboarding, recovery, member suspension effect, labels, suppressions, refusal to suppress findings.
- `suspension-responses.test.ts` (12): suspension permissions and effects, the severe alert, review independence, reinstate and reverse, response standing by subject, DNS on official domains, publish, reject, profile.
- `admin-public.test.ts` (5): public schemas cannot carry scores, internal text or responder identity; suppressions accept analysis codes only.
- `protected-action.test.tsx` (1).
- `admin.spec.ts`: a response with authority standing, then publication; suspension, then reinstatement; console access denied to moderators; the admin-invitation two-person rule; a suspended member blocked; a label and a suppression visible publicly; the profile; axe and 360 px checks on 9 pages.
- Existing tests updated for intentional changes: nav links, response wording on project pages, queue counts.

During development a route-rename `sed` touched build-cache files in `.next`. The caches were deleted (they are git-ignored), both builds were rebuilt from scratch, and the full suite was re-run.

### Security check (AGENTS §9)

- **Authorization:** every new mock method checks role, account state, ownership, transition, independence and step-up. The UI hides nothing as a substitute. The integration contract lists the server rules. **Mock permission demos are not production authorization.**
- **Privacy:**
  - public DTOs gained only labels (no internal basis), responses (no responder identity) and suppressions (public reason only); all are strict and tested;
  - internal reasons and rationales stay staff-only (checked on public pages in E2E);
  - staff emails are masked;
  - the one-time code is fictional and shown once.
- **Rendering and data:** responses and labels render as plain text; links are never fetched; no new dependencies, secrets or browser storage.
- **Wallet requests:** standing challenges authorize no transaction; signature, authority and DNS checks are simulated and labelled.
- **Threat IDs:**
  - T-11 and T-12 (role and ownership enforcement);
  - T-17 (staff step-up on every consequential admin action);
  - T-29 (responses moderated for doxxing and abuse);
  - T-31 (suppressions limited to analysis indicators, audited and public; findings cannot be suppressed);
  - T-38 and T-39 (simulated, nonce-bound, transaction-free standing).
  - THREAT-MODEL is unchanged; no production surface was added.

### Decisions made (please confirm in review)

- Suspension reviews are a case type (`suspension_review`) reviewed by any non-participant with `finding:publish`. Per moderation §8.2, a severe finding cannot be reversed by the person who suspended it.
- Signal suppression is limited to `platform_analysis` indicators. Findings are suspended or reversed through moderation, never suppressed.
- Profile: only the display name can change in V1; the handle is fixed. Handle rules (reserved list, confusables) are not yet designed.
- Recovery verifiers are administrators in the demo; identity §10.11 allows any two staff with at least one admin (open item in the integration contracts).
- Address-subject appeals no longer offer DNS standing. DNS applies to domain or project subjects (moderation §6.2).

### Known issues and remaining items

- **Open ADRs:** 0009, 0011 and 0012 Proposed; O-12 open.
- **Documentation gaps:** correction and response statuses use interim sets.
- **Pagination:** page numbers vs cursors still to decide.
- **ARCHITECTURE §7.1:** endpoint additions still to make.
- **Legal:** legal review of the transparency pages is a launch blocker.
- **Browsers:** Firefox and WebKit not run.
- **Not done:** no deployment.

### Recommended next step

Codex review of Phase 5 including this follow-up: the admin two-person rules, suspension independence, response standing, the public DTO additions and the integration contracts. Then owner decisions on:

- the items above;
- the Phase 6 scope: WCAG audit, cross-browser runs and polish.

---

## Session 16: Claude Phase 5 — Frontend Completion and Integration Validation (2026-10-12)

### Authorization, scope and discrepancies

- **Owner instruction (2026-10-12):** "Phase 5: Frontend Completion and Integration Validation". Stop after Phase 5 for Codex review; no backend and no Phase 6. None was started.
- **Phase 4 check:** merged as PR Skyboyyt/blacklist#2 (merge commit `2ae2926`). The branch was restarted from it. The full suite passed at the end of this session (below), and existing E2E specs needed only the two intended wording changes listed under "Test changes".
- **Owner decisions (asked before building):**

| Question | Decision | Result |
|---|---|---|
| Scope | Phase 5 + fixes | Documented Phase 5 member flows, connected journeys, contracts, plus accessibility/layout fixes found on the way. The full WCAG 2.2 AA audit stays in Phase 6 |
| ADR 0010 (project submissions) | Accept Part A | Private project suggestions (`submitted / needs_information / accepted_into_profile / not_accepted`), image-only evidence; Part B (claims, self-service verification) stays Proposed / Post-V1 |
| Scoreboard | Don't build; propose an ADR | ADR 0012 Proposed (no approved ranking rules; conflicts with P-11 and "no combined project rating") |
| Mock store | Shared server mock | In-memory per demo session on the Next server, mock builds only; reset action |

- **Roadmap differences (reported, not silently changed):**
  - The brief's name and scope differ from ARCHITECTURE §36 Phase 5 ("Reporting & Redress UI"). §36 now carries a factual note: the brief adds connected journeys, the checklist and the integration contracts.
  - **Not built** (listed in the checklist):
    - emergency suspension and the admin console beyond the audit viewer (§36 Phase 4);
    - public subject responses and the authority-signature standing mechanism (§36 Phase 5);
    - real upload processing states (Phase 7, ADR 0004);
    - profile settings (still a placeholder; no profile contract exists).

### Completed work

- **Contracts:**
  - `submissions.ts` (new, member-private): request schemas for report, project suggestion, correction, appeal with standing proof, and information reply, with per-network address and transaction checks and image-only evidence metadata; the member's own summary and detail views (no notes, rationales or staff identities); notices; typed member errors; the appeal target.
  - `moderation.ts` extended: case type `project_suggestion`, standing outcome `pending`, decisions `accept_suggestion`, `reject_suggestion`, `grant_standing`, `deny_standing`, information request and submitter messages on every case, `openSuggestions` count.
  - `member.ts`: report status `needs_information`.
- **Shared demo store** (`lib/api/mock/store.ts`) behind every mock service:
  - `proxy.ts` issues an httpOnly `bl_mock_session` cookie in mock mode.
  - Client components reach the store through `POST /api/mock/rpc`: mock builds only, same-origin, exact shape, method allowlist shared with the client (`rpc-methods.ts`). It returns 404 otherwise, and the handler is a stub in non-mock builds.
  - "Reset demo data" sits in the demo banner.
  - Public effects (`public-effects.ts`):
    - publication of an approved finding and band recomputation from the §15.3 proposal;
    - appeal "under appeal" (never downgrading a suspension), and uphold, amend or reverse;
    - correction → profile revision;
    - suggestion → staff profile.
- **Member service** (`member-api.ts`) enforces sign-in, ownership (`not_found` for others' items), validation, versions, transitions, one open appeal per finding per member, and simulated standing labelled `SIMULATED`.
- **Member UI:**
  - forms: report, project suggestion, correction and appeal (signature, DNS or documentary standing);
  - private status pages for each kind: history, staff request and reply, withdraw with confirmation, reason, public outcome and link, conflict → "Load the latest status";
  - "Your submissions" on the dashboard, and `/notifications`.
  - Evidence upload is simulated and image-only, with progress, failure, retry and remove; it sends metadata only.
- **Entry points:**
  - "Appeal this finding" on every published finding;
  - "Propose a correction" on project pages;
  - "Suggest a project" in the directory and dashboard.
- **Staff UI:**
  - project suggestions appear in the queue, counts and filters;
  - the workspace shows suggestion details (defanged links) and the submitter's replies;
  - standing is decided before an appeal decision (offered only once the review has started).
- **Transparency:** `/privacy`, `/security` and `/terms` are drafts labelled "pending legal review". Methodology gained "How reviews work". Footer links appear on every page.
- **Docs:**
  - [docs/frontend-requirements-checklist.md](docs/frontend-requirements-checklist.md) (new);
  - [docs/design/api-integration-contracts.md](docs/design/api-integration-contracts.md) (new);
  - frontend.md §7d (new) plus updates to §1, the contract table, §7b and §7c;
  - ARCHITECTURE: routes, the §7.1 pointer and the §36 note;
  - PRD §4.4;
  - ADR 0010 (Part A Accepted), ADR 0012 (new, Proposed) and the ADR index;
  - data-model `project_suggestions` (documented, not migrated);
  - README and AGENTS status.

### Bugs found and fixed during the phase

1. "Accept and publish profile" never showed its public-explanation field, so the decision could not be completed. Fixed; a regression test fails without the fix.
2. Filing an appeal downgraded a suspended finding to "under appeal". Withdrawing one appeal cleared the dispute even while another person's appeal was still open. Both fixed and tested.
3. The browser RPC client was a `Proxy`: awaiting it called `.then`, so every member page hung. Replaced by plain objects built from the shared method list.
4. Finding `demo-finding-501` had no participant record, so its appeal link ended in "not found". Added.
5. The dashboard overflowed by 84 px at 360 px once the "Information requested" badge appeared. Fixed with a `minmax(0,1fr)` grid.
6. Standing decisions were offered while an appeal was still `submitted` (unassigned), which raced with "Start review". Now offered, and accepted by the service, only in `in_review`.

### Validation (real output, 2026-10-12, Node 24.21.0)

| Check | Result |
|---|---|
| `pnpm format:check` | All files use Prettier style |
| `pnpm lint` | 0 problems |
| `pnpm typecheck` | Pass (contracts, web app and tests) |
| `pnpm test` | contracts **70 passed** (4 files); web **321 passed** (32 files) |
| `build` / `build:mock` | Both compile; all routes listed, including `/api/mock/rpc` |
| `check:mock-exclusion` | PASS (Phase 5 markers added: none in the production build, present in the mock build) |
| E2E (Chromium desktop + Pixel 7) | **280 passed, 2 skipped** (the same two skips as Phase 4), 0 failed |
| Firefox / WebKit | **Not run**: the browsers are not installed in this environment |

New E2E (`journeys.spec.ts`):

- report → information request → reply → accept → independent approval → public finding (internal text and the staff message absent from the public page);
- project suggestion → moderator cannot accept → administrator accepts with a security key → public profile and directory;
- correction → profile change;
- documentary appeal → participant refused → standing granted → reversal → finding removed, history explains;
- stale reply conflict;
- demo reset;
- signed-out boundaries;
- cross-member privacy;
- RPC refusals;
- axe and 360 px checks on 7 member pages;
- transparency pages via the footer.

New unit tests:

- `member-api.test.ts` (15), `public-effects.test.ts` (1), `rpc-server.test.ts` (5), `route.test.ts` (2);
- `submissions.test.tsx` (11: upload validation and retry, report form, status page, appeal form);
- `staff-review.test.tsx` (+1, suggestion acceptance).

E2E was run with a temporary local config pointing Playwright at `/opt/pw-browsers/chromium`. The config was deleted before committing.

### Test changes (intentional)

- `projects.test.tsx` and `projects.spec.ts`: the signed-in project action is now "Propose a correction" (→ `/corrections/new?project=…`) instead of the generic "Respond, correct or appeal" (→ `/appeals/new`). Appeals start from a specific finding.
- `moderation-api.test.ts` and `project-api.test.ts`: adapted to the store-based factories (same assertions).

### Security check (AGENTS §9)

- **Authorization:** every new mock method checks sign-in, ownership, permission, version and transition. The pages are UX only. The integration contract lists the server checks required in Phase 7. **The frontend permission demos are not production authorization** (frontend.md §7d).
- **Privacy:**
  - member views are strict and exclude notes, rationales and staff identities (tested);
  - unreviewed reports and suggestions have no public effect;
  - public pages were checked for internal text after a full journey.
- **Storage:** nothing from submissions is stored in the browser. The mock cookies are fictional, and `bl_mock_session` is a random UUID. The store is in-memory on the mock server and capped at 500 sessions.
- **Rendering:** evidence is names only, links are defanged text and never fetched, and nothing is rendered as HTML.
- **Wallet requests:** the signing challenge text says it authorizes no transaction. No seed phrase, key or transaction signature is ever requested.
- **New mutation surface:** `POST /api/mock/rpc` is mock builds only (404 otherwise, tested), same-origin and allowlisted. It must never be deployed as an API.
- **Other checklist items:** no new dependencies and no secrets.
- **Threats:** affected threat IDs are T-07 (exact Origin on the mock route), T-08 (no markup rendering), T-11 / T-12 (ownership, roles, server enforcement required in Phase 7), T-26 / T-27 (reports inert until reviewed), T-32 / T-36 (image-only metadata, links never fetched) and T-38 / T-39 (simulated standing; the real challenge must be nonce-bound and transaction-free). E-1 is unaffected. THREAT-MODEL is unchanged because no production surface was added.

### Known issues, gaps and deferred decisions

- **Open ADRs:** 0009 (numeric score), 0011 (more EVM networks) and 0012 (scoreboard) are Proposed. O-12 scoring sign-off is open.
- **Correction statuses** remain an interim set (documentation gap since Phase 4).
- **Pagination:** the directory and queue use pages while ARCHITECTURE §7.1 says cursors; decision needed (integration contracts §1).
- **Endpoint additions** for ADR 0010 Part A and the member submission views are to be added to ARCHITECTURE §7.1 in Phase 7 (integration contracts §8).
- **Not built:** emergency suspension, the admin console (staff lifecycle, users, labels, suppressions), public subject responses, authority-signature standing, profile settings.
- **Legal:** privacy, security and terms are drafts; legal review is a launch blocker.
- **Browsers:** Firefox and WebKit were not run.
- **Not done:** no deployment (owner asked earlier; requires an explicit hosting decision and credentials).

### Recommended next step

Codex review of Phase 5: the member flows, the shared mock store and RPC route, the public effects, and the integration contracts. Then owner decisions on:

- pagination;
- correction statuses;
- Phase 6 scope: WCAG audit, the remaining UI gaps above, Firefox and WebKit runs.

---

## Session 15: Claude Phase 4 — Staff Review UI (2026-10-12)

### Authorization, scope and discrepancies

- **Owner instruction (2026-10-12):** continue with "Phase 4: Review Dashboard and Administration Frontend". Phase 3 had been merged (PR Skyboyyt/blacklist#1). **Phase 5 and backend work are not authorized**; none was done.
- **Phase 3 check:** the merged tree is identical to the validated branch; the full suite was re-run at the end of this session (results below). No blocking regression was found.
- **Discrepancies, reported to the owner before building:**

| Brief | Documented rule | Owner decision | Result |
|---|---|---|---|
| Phase 4 = staff review dashboard | Documented Phase 4 = member Reporting & Redress UI; Staff UI = Phase 5 | Build the Staff UI now | ARCHITECTURE §36 records the swap (Staff UI = 4, Reporting & Redress = 5); ADR 0010 phase references updated |
| Queues for project submissions and profile updates | No approved workflow (ADR 0010 Proposed) | Approved workflows only | Queues for reports, appeals and correction requests. A profile update is a correction request on a project profile; accepting it creates a new staff profile revision. No submission queue |
| Public rejection reasons on project pages | Rejected reports stay private (moderation §10) | Follow policy (as the brief also asks) | Reasons come from a fixed list and are shown to the submitter only; never public |
| Reuse the 0–100 model | Staff may see numbers (§15.6); the §15.3 table is a calibration proposal (O-12 open) | Show the proposal, clearly labelled | Staff-only score labelled "calibration proposal, not signed off (O-12)", plus unscored cases; public pages unchanged (band only) |
| "Preserve submission and appeal flows" | Neither member flow exists yet (documented Phase 4 → now Phase 5) | n/a | Nothing to preserve; existing entry points unchanged |

### Completed work

- **Contracts:**
  - `packages/contracts/src/moderation.ts` (new, staff-only):
    - staff roles and refs; case types and statuses (report and appeal statuses from the data model; correction statuses interim, see gaps);
    - case summary and detail (report / appeal / correction), staff evidence by kind and state, staff assessment (scored | unscored);
    - internal notes, audit entries, finding revisions, appealed decision, standing record, profile change;
    - decisions, moderation errors, queue request, response and counts.
  - `session.ts`: `appeal_reviewer` viewer role. The member-facing `reportStatusSchema` is unchanged; the staff one is `reportCaseStatusSchema`.
- **Permissions:** `lib/staff/permissions.ts` mirrors ARCHITECTURE §9.2 (moderator, appeal_reviewer, admin), plus `staffRoleOf`. `lib/staff/workflow.ts` holds the UI decision hints; `lib/staff/copy.ts` and `errors.ts` hold the wording.
- **Mock service** (`lib/api/mock/moderation-api.ts`): an in-memory store that checks, by itself:
  1. staff only;
  2. scope (appeal reviewers see appeals; anything else is `not_found`);
  3. role permission;
  4. optimistic version (`conflict`);
  5. allowed transition;
  6. assigned reviewer only (take-over needs `takeOver`);
  7. independence (appeal participants, severe-revision authors);
  8. single-use, action-bound step-up grants (5-minute TTL).

  It also handles:
  - **approvals:** latest revision and content hash only; evidence must be available; publication recorded as a `system` audit entry;
  - **corrections:** accepting one needs `project:manage` and creates a profile revision; rejecting leaves the profile unchanged;
  - **audit:** every action is appended to the mock audit log;
  - **conflict demo:** case `RPT-1007` simulates another reviewer's edit before the first action.

  Supporting modules:
  - `staff-scoring.ts`: the §15.3 proposal, `min(ceiling, Σ)`, ceiling 100 only with a severe finding; `not_assessed` is unscored.
  - `profile-corrections.ts`: applies a correction as a new profile revision.
  - `fixtures/moderation.ts`: 13 cases (8 reports, 2 appeals, 3 corrections) and 4 revisions, all fictional.
- **UI** (`components/staff/*`):
  - **Routes:** `/mod` (dashboard), `/mod/appeals`, `/mod/cases/[id]`, `/mod/approvals` and `/admin/audit` (admin).
  - **Dashboard:** counts, filters, queue, pagination, loading / empty / error / access-denied states.
  - **Workspace:** subject, report / appeal / correction context, evidence (nothing rendered as markup), staff assessment, decision panel (form → confirmation → step-up), internal notes, case history.
  - **Supporting:** assignment controls with take-over confirmation, conflict banner with "Load the latest version".
  - **Shared changes:** nav shows staff links by role. `StepUpDialog` gained an optional `verify` prop so staff decisions use the moderation service's grant.
- **Mock viewers:** `moderator`, `moderator_b` (a second moderator for independence demos), `appeal_reviewer`, `admin`, added to the demo banner. Account mocks treat all four as staff.

### Tests changed for intended behaviour

`tests/e2e/specs/shell.spec.ts` and `account.spec.ts` asserted the Phase 1 `/mod` placeholder ("Moderation queue", "This page holds no case data"). Phase 4 replaces that placeholder by design, so the assertions now check the "Review dashboard" heading and that staff data loads from the (mock) staff service. No test was skipped or weakened.

### Files changed

- **New:** `packages/contracts/src/moderation.ts`;
  - `apps/web/src/lib/staff/{permissions,workflow,copy,errors,staff-page}.ts`;
  - `apps/web/src/lib/api/mock/{moderation-api,moderation-api.test,staff-scoring,profile-corrections}.ts`, `fixtures/moderation.ts`;
  - `apps/web/src/components/staff/*` (13 components plus `staff-review.test.tsx`);
  - `apps/web/src/app/(staff)/mod/cases/[id]/page.tsx`, `(staff)/admin/audit/page.tsx`;
  - `tests/e2e/specs/staff.spec.ts`.
- **Changed:**
  - contracts: `index.ts`, `session.ts`;
  - web: `lib/api/{types,browser,not-connected,mock-disabled}.ts`; mock `index.ts`, `scenario.ts`, `account-api.ts`, `research-api.ts`, `fixtures/dashboard.ts`;
  - `lib/nav/nav-items.ts` and test; `components/layout/nav-list.tsx`; `components/security/step-up-dialog.tsx`;
  - `(staff)/mod/{page,appeals/page,approvals/page}.tsx`;
  - `scripts/check-mock-exclusion.mjs`;
  - e2e `shell.spec.ts`, `account.spec.ts`;
  - docs: ARCHITECTURE §36, `docs/design/frontend.md` §7c, `docs/data-model.md` (correction status gap), ADR 0010 phase references, AGENTS §1, README.
- **Migrations:** none. **Dependencies:** none.

### Validation (real exit codes, Node 24.21.0, pnpm 12.7.0)

| Check | Result |
|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0: contracts **70**, web **287** (24 moderation-service, 19 staff UI, nav role test) |
| `pnpm build` (production) | exit 0, 29 routes |
| `build:mock`, `check:mock-exclusion` (now includes moderation fixtures) | exit 0, 4/4 PASS |
| Chromium E2E desktop + mobile, all specs (Phase 1–3 regressions + staff spec: role denials, filters, decision with confirmation and step-up, conflict, correction applied, independent severe approval, axe on 4 staff pages, 360 px overflow) | **238 passed, 2 skipped** |
| Firefox / WebKit E2E | **Not run** (browsers not installed in this environment) |

E2E ran on the image's Chromium through a temporary, uncommitted config override, as in Sessions 13–14. The staff pages were also checked visually from screenshots.

### Mock boundaries and backend integration points

- The UI depends only on `ModerationApi` (`lib/api/types.ts`) and the `moderation.ts` contracts. A live adapter replaces `createMockModerationApi` contract-for-contract.
- The server must enforce, inside one transaction where the design says so:
  - route plus domain authorization (default deny);
  - WebAuthn-assured staff sessions and action-bound step-ups (identity §10.7);
  - approve-and-publish (moderation §4.2);
  - independence and conflict checks (§7);
  - optimistic concurrency, assignment and the append-only audit (ADR 0006).
- Client-side state is in-memory per tab; the public research pages are not changed by staff actions in the demo. A real correction or finding publication changes public data through the backend (Phases 7–10).
- Staff scores use the §15.3 proposal only until O-12 sign-off; the real computation is server-side (Phase 10).

### Known gaps and unfinished work

- **Documented Staff UI scope not built this phase:** finding revision editor beyond drafting from an accepted report; emergency suspension and its 72-hour review; standing-review decisions (standing is displayed, not decided); admin screens for staff lifecycle, users, projects, labels and suppressions; reversal-proposal flow. These remain open within the Staff UI phase or for a follow-up.
- **Documentation gaps:** `correction_requests.status` values (interim set used); `moderation_cases.priority` values (not used); report "needs_info → in_review" transition is driven by the reporter (Phase 5), so staff cannot move it back in the demo.
- **Demo limitation:** decisions do not change the server-rendered public pages (mock state is per browser tab). Profile changes are visible in the staff workspace ("Current public profile: revision N").
- Overdue labels use the viewer's real clock against September 2026 fixture deadlines, so most open demo cases show as overdue.
- Firefox/WebKit not run here.

### Security check

- Staff DTOs are separate from public DTOs.
- Internal notes, rationales, narratives and reporter references are absent from public data (tested).
- Evidence is never rendered as active content (tested: no iframe, object, embed, img or script; markup shown as text).
- URLs are defanged and never fetched.
- No browser storage added.
- Mocks grant nothing and are excluded from production builds (checked).

Threats considered: staff abuse and single-person severe changes (independence and step-up), stale-state overwrite (versions), evidence-borne active content, privacy of reporters.

### Recommended next step

1. Codex Phase 4 review, especially:
   - service-level enforcement versus UI hints;
   - independence rules;
   - conflict handling;
   - privacy separation;
   - the labelled staff score.
2. Owner decisions on:
   - the correction-request status set;
   - whether the remaining documented Staff UI items (emergency suspension, standing review, admin screens) complete this phase or a follow-up;
   - ADRs 0009–0011.
3. Phase 5 (Reporting & Redress UI) needs separate owner authorization.

---

## Session 14: Claude Phase 3 — Research UI: project discovery and profiles (2026-10-12)

### Authorization and scope

- **Owner instruction (2026-10-12):** "Continue … with Phase 3. Phase 2 has passed review and testing." This authorizes Phase 3. **Phase 4 and backend work are not authorized**; none was done.
- **Conflicts between the brief and the approved architecture**, explained to the owner before coding. Owner decisions:

| Brief asked for | Approved rule | Owner decision | Result |
|---|---|---|---|
| Public 0–100 score on cards and detail | P-11: band + explanation only (PRD §5.14, ADR 0005, ESSENTIALS §17) | Change P-11 via ADR | **Proposed ADR 0009**; no number built. UI shows band, explanation, factors, confidence, as-of, dispute state |
| Project submission, verification statuses, rejection reasons, representative updates | V1 projects are staff-created; self-service verification is not V1 (PRD §4.1, §4.4, §5.16) | Documented scope + ADR | **Proposed ADR 0010** (private suggestions/updates in Phase 4; claim verification Post-V1). Directory and profiles built within the V1 model; contracts reject verification/submission fields |
| Solana + "supported EVM networks" | V1 = Solana + Ethereum (PRD §4.1) | Add Post-V1 EVM chains | **Proposed ADR 0011** (Base, Arbitrum, BNB, Polygon; per-chain Phase 8 gate). Ships Ethereum + Solana; selector reads `CHAIN_SLUGS` |
| Evidence uploads and appeals | Phase 4 (ARCHITECTURE §36); images only (ADR 0004) | Entry points only | Profile links to `/appeals/new` and `/reports/new` (sign-in first when signed out) |

- **Status distinctions in the V1 model:** "not assessed" (insufficient data; never 0, never reassuring), "assessment unavailable right now" (`null`; shown as neither not assessed nor low), "no published findings" (not "safe"). V1 has no public "rejected" state: rejected reports stay private (PRD §5.11). Appeal outcomes appear in history.

### Completed work

- **Contracts (`packages/contracts/src/project.ts`, new):** project slug, category (interim descriptive list), attribution basis, official address (with its own `assessment | null` and separate `disclosures`), official domain (hostname text only), response with standing, history events, freshness, detail, summary (no band or score), directory request (query, chain, category, findings status, sort, page) and response (`results`, `no_results`, `empty_directory`, `choose_network`, `invalid_query`, `provider_unavailable`). `common.ts`: `DisputeState` type and `publicSourceSchema`. `research.ts`: required `source` on chain facts and disclosures (P1-05).
- **API boundary:** `ResearchApi.listProjects` / `getProject`; the not-connected adapter rejects both (non-mock builds show no data).
- **Mock service:** `lib/api/mock/project-api.ts` holds pure, deterministic catalog logic: network-scoped address matching, name/domain text match, filters, sort, page size 6, and the card identifier on the selected network. `fixtures/projects.ts` has 14 fictional profiles covering findings, under appeal, suspended, no findings, no official addresses, not assessed, unavailable assessment, stale, partial, multi-network and a project response. Project-only address records are merged into address research so links resolve.
- **UI:** `/projects` (GET-form filters, cards, pagination, every state) and `/project/[slug]` (identity, limits notice, review and update dates, data status, official addresses with assessments and separate disclosures, domains, findings, responses, history, entry points). "Projects" nav item. Universal search offers a project-directory link for non-identifier queries. `components/projects/*`, `lib/projects/{copy,directory-params}.ts`.
- **Research refinements:**
  - **P1-05:** facts and disclosures render their source label.
  - **P1-03:** delegated-outgoing (victim) and spoofed-incoming-log fixtures, with tests.
- **ADRs:** 0009, 0010 and 0011, all **Proposed**, each with a Claude recommendation; ADR index updated.
- **Docs:**
  - frontend.md: new §7b, plus P1-05/P1-03 notes in §5.
  - ARCHITECTURE: `/projects` route and the `GET /projects` endpoint.
  - AGENTS §1 and README status lines.
  - Mock-exclusion markers for project fixtures.

### Files changed

New: `packages/contracts/src/project{,.test}.ts`; `apps/web/src/app/(public)/projects/page.tsx`, `apps/web/src/app/(public)/project/[slug]/{page,loading}.tsx`; `apps/web/src/components/projects/{project-filters,project-card,pagination,project-directory-results,project-detail-view,official-address-list,address-assessment-summary,project-actions}.tsx` and `projects.test.tsx`; `apps/web/src/lib/projects/{copy,directory-params,directory-params.test}.ts`; `apps/web/src/lib/api/mock/{project-api,project-api.test}.ts`, `fixtures/projects.ts`; `tests/e2e/specs/projects.spec.ts`; `docs/adr/0009–0011`.
Changed: contracts `common.ts`, `research.ts`, `index.ts`, `research.test.ts`; web `lib/api/{types,not-connected}.ts`, mock `research-api.ts`, `fixtures/{addresses,transactions,ids}.ts`; `components/research/{facts-list,disclosures-list}.tsx` and tests; `components/app/status-timeline.tsx` (accepts any entry with id/label/at/actor); `components/search/search-results.tsx`; `components/layout/nav-list.tsx`; `lib/nav/nav-items.ts`; `scripts/check-mock-exclusion.mjs`; `tests/e2e/specs/a11y-security.spec.ts`; docs listed above. **Migrations:** none. **Dependencies:** none.

### Validation (real exit codes, Node 24.21.0, pnpm 12.7.0)

| Check | Result |
|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0: contracts **70**, web **243** |
| `pnpm build` (production) | exit 0, 28 routes |
| `build:mock` | exit 0 |
| `check:mock-exclusion` (now includes project fixtures) | exit 0, 4/4 PASS |
| Chromium E2E, desktop + mobile (all specs, including Phase 1 and Phase 2 auth/account flows, new projects spec, axe light/dark on 5 new pages, 360 px overflow check) | **212 passed, 2 skipped** |
| Firefox / WebKit E2E | **Not run.** Those browsers are not installed in this cloud environment |

E2E ran on the image's preinstalled Chromium 1194 through a temporary config override, deleted before commit, because Playwright 1.63 expects build 1243. Layout was also checked visually from screenshots (desktop light, mobile dark).

### Mock-service boundaries and backend integration points (Phase 8)

- The UI depends only on `ResearchApi.listProjects(query)` and `getProject(slug)` and the contract schemas. A live adapter replaces `createProjectCatalog` contract-for-contract; `GET /projects` and `GET /projects/:slug` (ARCHITECTURE research endpoints) must return exactly these DTOs.
- The server must enforce what the mock only simulates:
  - network-scoped address matching, with `choose_network` and never a cross-chain match;
  - published-only findings and responses;
  - staff-only profile creation;
  - freshness computation;
  - per-address assessments from the risk module.
- The source label (P1-05) must come from sanitized registry data, never raw provider names, URLs or receipts.
- Mocks grant nothing. Entry-point links are not authorization.

### Known issues and unfinished work

- Proposed ADRs 0009–0011 await owner decisions. Nothing they describe is implemented.
- Project categories are an interim descriptive list for owner review.
- The project directory is not in the mobile bottom tab bar (it is in the menu); revisit in the Phase 6 quality pass.
- Firefox/WebKit not run here; cross-browser timing notes from Session 10 still apply.
- Phase 6 items unchanged (style-src-attr allowance, broader quality pass).

### Security check

- No public number (contract tests).
- Disclosures separate from factors (contract and component tests).
- Attributions are labelled as not proof of ownership.
- Domains are text only, never links.
- Untrusted text is rendered as text.
- No browser storage was added.
- Unknown networks are reported, not dropped.
- No private data in project DTOs: no report receipts, submitter identity or rejected items.

Threats considered: impersonation via names (identifiers first, name warning), false legitimacy (no verified/pending labels), cross-chain confusion (network-scoped matching).

### Recommended next step

1. Codex Phase 3 review, especially:
   - network scoping;
   - status distinctions;
   - the no-score and no-combined-rating rules;
   - P1-05/P1-03 closure.
2. Owner decisions on ADRs 0009–0011.
3. Phase 4 needs separate owner authorization.

---

## Session 13: Claude Phase 2 review corrections (2026-10-12)

- **Safety check:** the task is inside authorized Phase 2: findings on Phase 2 frontend code. No backend, no Phase 3 work, no new dependency, no architecture change (identity §6.3, §10.5 and §12 already require these behaviours). No ADR needed.
- **Completed (commit `596112b`, branch `claude/amazing-goodall-drtbc9`):** full responses are in [the Phase 2 review](docs/reviews/2026-10-12-phase-2-codex-review.md).
  - **P2-01:** `enrollmentPasswordRequestSchema` and `StaffSecurityApi.setEnrollmentPassword` send the chosen password to the bound enrollment flow. A new `enrollment_incomplete` account error blocks activation without a password and two authenticators. The mock tracks the flow state (whether a password was sent, never the value).
  - **P2-02:** `resetPasswordOutcomeSchema` (`passkey_required`, `passkey_not_verified`) and `AuthApi.resetPassword(token, form, { withPasskey })`. `ResetPasswordForm` adds a token-bound passkey step. Mock reset tokens starting `staff` need a passkey.
  - **P2-03:** `human_verification_required` login outcome and an optional opaque `humanVerification` on the login request. A provider-neutral `HumanVerifierClient` port and the `HumanVerification` component; the not-connected adapter fails closed. Mock email `challenge@example.test`.
- **Files changed:** contracts `auth.ts`, `account.ts`, `staff.ts` and tests; web `lib/api/{types,browser,not-connected,mock-disabled}.ts`, mock `auth-api.ts`, `account-api.ts`, `fixtures/ids.ts`, `index.ts` and tests; `components/auth/{login-form,reset-password-form,human-verification}.tsx` and tests; `components/security/staff-enrollment-flow.tsx` and tests; `lib/auth/account-error-copy.ts`; `tests/e2e/specs/auth.spec.ts`; `docs/design/frontend.md` (§7, §7a); the review file; this handoff. **Migrations:** none. **Dependencies:** none.
- **Tests and results (real exit codes, Node 24.21.0, pnpm 12.7.0):**
  - Baseline before changes: all checks exit 0; contracts 55 and web 187 tests.
  - After changes: `format:check`, `lint`, `typecheck`, `test` (contracts **60**, web **209**), `build` (27 routes), `build:mock` and `check:mock-exclusion` all exit 0.
  - Chromium E2E: **172 passed, 2 skipped**. It ran on the cloud image's preinstalled Chromium 1194 through a temporary config override, deleted before commit, because Playwright 1.63 expects build 1243.
  - Firefox and WebKit were **not** run.
- **Security check:** T-01, T-02, T-03, T-05, T-17 and T-18.
  - Passwords, reset tokens and verification responses never touch browser storage (tested). The reset password is held in component memory only between the two submissions.
  - Each new outcome keeps responses generic. The staff passkey step tells the holder of a valid reset link that the account is staff; that holder already controls the mailbox, and the §6.3 challenge endpoint exposes the same fact.
  - Mocks still grant nothing. The mock-exclusion check passes.
- **Decisions:** none architectural. Contract additions are recorded in the review file and frontend.md.
- **Deferred:**
  - Human-verification provider (O-6, owner). When chosen: the CSP `script-src`/`frame-src` allowance for its widget, and a live `HumanVerifierClient`.
  - Server enforcement of all three behaviours (Phase 7: S-gates, identity suites).
- **Known issues:** the cloud image's Playwright browsers do not match the pinned Playwright version, so E2E needs the override described above. This is not a repository issue.
- **Recommended next step:** a focused Codex closure check of P2-01 to P2-03, ideally including the Firefox/WebKit E2E run (`E2E_ALL_BROWSERS=1`). Phase 3 still needs separate owner authorization.

---

## Session 12: Codex GitHub repository setup (2026-10-12)

- **Owner instruction:** create a new public GitHub repository named `blacklist` and push the project. This authorizes a commit and push for this setup task. Phase 3 remains unauthorized.
- **Completed:** initialized local Git on `chore/initial-repository` and committed the initial 304-file snapshot as `9704983` (`Initialize Blacklist repository`). Updated README to describe Phase 2 accurately and replaced one historical local user path with a generic temporary-directory reference.
- **GitHub result:** browser authorization through Git Credential Manager completed. Created the public [Skyboyyt/blacklist](https://github.com/Skyboyyt/blacklist) repository and pushed `chore/initial-repository`. The remote ref matched local commit `1194358b1812f7cb53cbea2d1c0bb6fcf525ee01` after the handoff commit. GitHub reported the default branch as `chore/initial-repository`; no `main` branch was pushed. The connected GitHub app can read the repository, and GitHub REST reported `secret_scanning=enabled` and `secret_scanning_push_protection=enabled`.
- **Files changed:** README.md, docs/reviews/2026-10-05-phase-1-codex-review.md and this handoff; local `.git` created. **Migrations/dependencies/production code:** none.
- **Tests and results:** 304 staged paths inspected; ignored `.env`, `node_modules`, `.next` and TypeScript build info confirmed; high-confidence secret-pattern and long assignment-value searches over staged content returned no matches; `.env.example` contains placeholders. `git diff --cached --check` identified only three existing blank lines at EOF in ADR files. No product tests, lint, typecheck or build run (Node 24/pnpm unavailable).
- **Security concerns:** repository is public; no real credentials were identified in the staged snapshot. GitHub secret scanning and push protection were verified enabled. No token value was printed or stored in project files.
- **Decisions:** public visibility per owner; initial branch is `chore/initial-repository`, honoring the no-direct-push-to-`main` rule. Local Git author uses the connected account's GitHub noreply identity. No architecture decision changed.
- **Unfinished/recommended next step:** Phase 2 review findings P2-01 through P2-03 remain open; Claude should respond to and correct them, then request a Codex closure check. Phase 3 still needs separate owner authorization. The repository has no `main` branch; any future default-branch change or merge should follow the owner's Git rules.

---

## Session 11: Codex Phase 2 initial review (2026-10-12)

- **Completed:** inspected the approved phase/design/security documents, Phase 2 auth and account components, contracts, mock adapters and relevant tests. Recorded P2-01 through P2-03 in [the Phase 2 review](docs/reviews/2026-10-12-phase-2-codex-review.md). Phase 2 review remains open; Phase 3 remains unauthorized.
- **Current work:** primary engineer response and corrections to the three findings, then a focused Codex closure check.
- **Files changed:** this handoff and the Phase 2 review file. **Migrations/dependencies/production code:** none.
- **Tests and results:** no tests, lint, typecheck or build run. The available Node is 26.8.1 and `pnpm` is unavailable; the approved baseline is Node 24 and pnpm 12.7.0. Static inspection only. Git status/diff could not run because the folder has no `.git` directory.
- **Security concerns:** P2-01 affects staff credential creation (T-17/T-18); P2-02 affects staff reset (T-01/T-05/T-17); P2-03 affects login abuse handling (T-02/T-03). No deployed bypass is claimed because no backend exists. No secret values were read or printed.
- **Decisions:** none; existing architecture remains in force. **Deferred decisions:** human-verification provider choice remains with the owner; a provider-neutral UI contract can be corrected within Phase 2.
- **Recommended next step:** Claude fixes or responds to P2-01 through P2-03, obtains Node 24/pnpm 12.7.0 verification results, and requests a focused Codex re-review before Phase 2 closure. The owner must separately authorize Phase 3.

---

## Session 10: Claude Phase 2 — Frontend Account, Authentication & Security (2026-10-05/06)

### Safety check

Codex closed Phase 1 (Session 9) with no remaining blocker, and the owner explicitly authorized Phase 2. Backend work remains unauthorized; none was done.

### Routes (new or changed)

| Route | Purpose |
|---|---|
| `/login` (changed) | Temporarily unavailable state; calm banner for `reason=session_expired` and `reason=staff_verification_expired`; generic credential error unchanged |
| `/register`, `/register/complete`, `/forgot-password`, `/reset-password`, `/email-change/confirm` (changed) | Superseded-link and temporarily-unavailable states. Reset success explains that all sessions end and email change pauses for 72 hours. Live length count and Caps Lock hint on new passwords |
| `/settings/security` (rebuilt) | Overview: password, email, sessions, recovery, recent activity, staff link, sign out |
| `/settings/security/password` (new) | Password change |
| `/settings/security/email` (new) | Email change initiation (cooling block, re-authentication, generic pending state) |
| `/settings/security/sessions` (new) | Session list, revoke one, revoke all others |
| `/settings/security/staff` (new) | Staff authenticators, deficit banner, step-up removal (staff viewers only; presentation) |
| `/staff/enroll` (new) | Invitation link + out-of-band code → password → two authenticators → activation |
| `/staff/verify` (rebuilt) | Passkey verification with every outcome state |
| `/staff/recovery` (new) | Recovery process explanation and own case progress |
| `(app)` layout (changed) | Shows the session-ended panel when the viewer reports an ended session |

### Components and logic

- **`components/security/`** (`.tsx`):
  - SecurityOverview, PasswordChangeForm, EmailChangeFlow / EmailChangePanel, SessionManager / SessionList;
  - SecurityActivity, SecurityBanner, CoolingPeriodNotice, SessionExpiredPanel, AccountSecurityLoader;
  - ReauthDialog, StepUpDialog, PasskeyPrompt;
  - StaffVerify, StaffEnrollmentFlow / EnrollmentSteps, StaffSecurityPanel, RecoveryProgress, StaffRecoveryInfo, LogoutButton.
- **Other components:** `components/app/confirm-dialog.tsx`, `components/layout/settings-section.tsx`, `mock-preview-controls.tsx` and `style-nonce.tsx`.
- **Updated components:** PasswordInput (Caps Lock hint, requirement count), DataCard (always a named region), Dialog (focus returns to the opener).
- **Logic (`.ts`):**
  - `lib/auth/account-error-copy.ts` and `password-copy.ts`;
  - `lib/security/use-passkey-ceremony.ts`, `use-account-security.ts` and `security-event-copy.ts`;
  - `lib/security/csp.ts`: no-store scope and loopback handling.

### Contracts

- **`account.ts` (member-private):**
  - typed account errors;
  - sessions: opaque handle, coarse device summary and times; no tokens, IPs or locations;
  - security events, cooling period, account security overview;
  - re-authentication, password change and email change requests.
- **`staff.ts` (staff-only, narrow):**
  - authenticators: no credential IDs or keys;
  - staff security overview, passkey results, enrollment start and results;
  - own recovery status: no reviewer identities;
  - no moderation or case data.
- **`auth.ts`:** `superseded` link state, `temporarily_unavailable` outcomes and a shared `emailOnlyRequestSchema`. **`session.ts`:** an anonymous viewer may carry `reason` (session or staff verification expired).
- **`zod.ts`:** a single Zod entry that sets **jitless** mode, so no eval is needed under the CSP. `sideEffects` now declares it.
- **Unchanged:** public research contracts; P1-01 and P1-02 tests still pass.

### Mock services

- **Adapters:** `AccountApi` and `StaffSecurityApi` interfaces (`lib/api/types.ts`), each with a not-connected adapter and a mock adapter.
- **Mock store:** all mock behaviour is centralised in `lib/api/mock/account-api.ts`, an injectable store covering:
  - the 10-minute re-authentication window and 72-hour cooling period;
  - a uniform email-change answer and current-session protection;
  - the enrollment code and passkey results.
- **Preview controls:** the demo banner sets the viewer, the scenario (normal, cooling_period, session_expired, staff_recovery) and the passkey result.
- **Fixtures:** fictional (`fixtures/account.ts`) and covered by the exclusion check.

### Dependencies

- **Added:** `get-nonce@1.0.1`, a direct pin of an existing Radix transitive dependency, used to give runtime `<style>` elements the CSP nonce. It has no dependencies and no install scripts, and passed the release-age and trust policies.
- **Also installed:** Playwright's Firefox and WebKit browsers.
- **Not installed:** none of the other deferred libraries.

### Security decisions

1. **Narrower production CSP for styles:** `style-src 'self' 'nonce-…'`, with `style-src-attr 'unsafe-inline'` (attributes only). Development is unchanged. Removing the attribute allowance remains Phase 6.
2. **No eval:** Zod is jitless, and `apps/web` may import Zod types only (lint rule).
3. **`upgrade-insecure-requests` omitted for loopback hosts:** WebKit applied it to `http://localhost` and broke local runs. Real hosts keep it, and HSTS applies.
4. **`Cache-Control: no-store`** on all account, auth, staff and private prefixes, including prefetches.
5. **No terms checkbox at registration:** terms are a pending legal decision.
6. **Member MFA** (post-V1) is not presented as available.
7. **No break-glass control** exists anywhere in the UI.

### Verification (real exit codes, Node 24.21.0, final run)

| Check | Result |
|---|---|
| `pnpm format:check` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0: contracts **55**, web **187** |
| `next build` (production) | exit 0, 27 routes |
| `build:mock` | exit 0 |
| `check:mock-exclusion` (now also scans account fixtures) | exit 0, 4/4 PASS |
| Playwright Chromium desktop + mobile | **exit 0: 168 passed, 2 skipped** (viewport-specific) |
| Playwright Firefox + WebKit + WebKit mobile (auth + account specs, `E2E_ALL_BROWSERS=1`, 2 workers) | **exit 1: 95 passed, 1 failed.** The failure was the Firefox token-page test hitting a 90 s page-load timeout. Re-run alone it passed **3/3** (12–15 s each). Classified as load-induced on this machine, not a product defect |

**Failures found and fixed during this session (not hidden):**

- **Real bugs:**
  - Focus did not return to the opener after a programmatically opened dialog; fixed in `DialogContent`.
  - Titled DataCards were not named regions; fixed.
  - WebKit loaded no assets because of `upgrade-insecure-requests` on localhost; fixed.
  - Firefox reported a CSP eval violation from Zod's JIT probe; fixed with jitless mode in a shared entry module.
  - WebKit-mobile dark contrast was intermittently measured against white, because `<html>` had no background; fixed. This also fixes iOS overscroll.
- **Test-side issues:**
  - ambiguous selectors;
  - jsdom Caps Lock event construction;
  - copy assertions updated to the new reset wording;
  - keyboard-based focus test, because WebKit does not focus buttons on click;
  - a `settle()` helper so axe audits a fully rendered page.

**Not run:** gitleaks, manual screen-reader testing, real-device iOS/Android, coverage.

### Known issues

- **Cross-browser timing:** Firefox and WebKit are slow on this machine under parallel workers. Their projects use 90 s test and 15 s assertion timeouts; run them with one worker in CI.
- **Mock state:** account state lives in memory for the page session, so a full reload resets it.
- **Staff enrollment password:** validated and discarded in the preview. The future API receives it in the bound enrollment flow.

### Deferred

- **Phase 3:** P1-05 per-fact sources; P1-03 wider transfer scenarios.
- **Phase 6:** remove the `style-src-attr` allowance; broader quality and accessibility pass.
- **Pre-launch:** manual screen reader, real devices, gitleaks.
- **Phase 7:** all real enforcement: sessions, re-authentication, cooling, WebAuthn, rate limits, Origin checks.

### Recommended Phase 3 (frontend only; not authorized)

**Research UI:**
- per-fact public source and as-of references (P1-05);
- evidence-level-aware transfer wording for delegated, malicious-log and victim cases (P1-03);
- project and finding pages (`/project/[slug]`, `/finding/[id]`);
- research pagination and empty or partial data states;
- token detail and disclosures depth.

**Phase 3 requires explicit owner authorization.**

---

## Session 9: Codex final Phase 1 closure check (2026-10-05)

**APPROVED FOR PHASE 2 AUTHORIZATION.** Detailed closure evidence and finding dispositions are appended to [the Phase 1 review](docs/reviews/2026-10-05-phase-1-codex-review.md). Claude remains primary engineer. **Phase 2 remains NOT authorized.**

### Verified outcome

- P1-01 and P1-02 closed: capabilities are neutral, zero-contribution disclosures, not eligible factors; public contracts structurally reject private/unreviewed/AI/numeric payloads; report receipt belongs to member-private `member.ts`.
- Corrected fixtures passed: capability-only contract Low with no factors; Solana Moderate solely on approved impersonation factor; unsupported drainer-pattern analysis removed.
- Provenance vocabulary remains distinct from publication permission.
- Transfer source wording, explicit network selection, registration privacy, multi-route appeal standing, ordinary/prefetch document security headers and mock exclusion passed.
- P1-03 current wording, P1-04, P1-06–P1-10 closed. P1-05 source attribution remains accepted non-blocking Phase 3 work; fact observation times now render.
- Root unit/component and separate E2E scripts now have truthful independently verified exit statuses. Session 8's correction of the original Session 6 root-test failure is acknowledged; no architecture issue remains.

### Actual verification

Used existing **Node 24.21.0**. No dependency installation or pnpm-policy change.

| Check | Result |
|---|---|
| Root `pnpm check` | **Exit 0**: format, lint, typecheck, unit/component tests, production build; no e2e invocation |
| Unit/component tests | **149 passed**: contracts 36 / 2 files / 2.68 s; web 113 / 16 files / 113.68 s |
| Production build | Pass, 21 routes, mock mode unset |
| Mock build | Exit 0, 21 routes |
| Mock exclusion + additional fixture-canary scan | Pass; production fixture markers absent, mock positive control present; no checked server-only names in browser bundles |
| Focused root E2E, isolated `--workers=1` | **Exit 0: 25 passed, 1 intentional viewport skip**, 1.6 min; desktop/mobile Chromium |
| Independent contract probes | All eight disclosures rejected as factors; private/AI/numeric/public-member boundaries passed |
| Token/header/browser probes | Twelve normal/prefetch combinations across three token pages passed; unsigned parser scripts blocked in both normal and prefetch HTML |
| Production HTTP smoke | No fictional findings/markers on home or research search; disconnected stub preserved |

**Failures are recorded:** Initial focused E2E with two workers ran concurrently with the root check and a browser probe; two tests timed out setting up `page`, before assertions. Interrupted with exit 1, then the unchanged selection passed after other work finished, with one worker and original timeouts. No failure was filtered from the closure report. A temporary Fetch-probe `status()` typo was corrected outside the repository and the helper rerun passed.

The full **118 pass / 2 skip** correction-suite count is Claude-reported; Codex reran the relevant subset. Not run: Firefox/WebKit, manual screen reader, gitleaks, coverage. Backend acceptance gates remain future work. Prettier passes its configured scope (Markdown excluded). Verification servers were stopped.

### Remaining work / files changed

- Blockers: **none for Phase 1 closure**.
- Phase 3: bounded per-fact source references; wider delegated/malicious-log/victim scenarios, before real research integration.
- Phase 6: inline-style CSP tightening.
- Pre-launch: Firefox/WebKit, manual screen reader and gitleaks; retain quality-phase coverage/human visual review.
- Changed only the Phase 1 review document and `AI_HANDOFF.md`; no migrations, runtime feature edits, deployments or services created.
- **Recommended next step: Owner explicitly authorizes Phase 2 — Frontend Account & Security Flows.** This review does not grant that authorization, and no Phase 2 work began.

---

## Session 8: Claude Phase 1 correction pass (2026-10-05)

Responds to [docs/reviews/2026-10-05-phase-1-codex-review.md](docs/reviews/2026-10-05-phase-1-codex-review.md) (responses recorded there). **Phase 2 remains unauthorized.** No backend work, no new dependency, no pnpm policy change.

### High findings

| Finding | Resolution |
|---|---|
| **P1-01** capability facts shown as risk factors | Separate public `disclosures` collection (closed code set: mint/freeze authority, permanent delegate, transfer hook/fee, upgradeable proxy, pause authority, unverified source; no weight or contribution field). `riskFactorSchema` admits only the closed V1 factor codes of ARCHITECTURE §15.3, each bound to its provenance. Fixtures: the pause/upgrade/unverified contract is now **Low** with disclosures and no factors; the Solana lookalike is Moderate on `token.symbol_impersonation` only, with mint authority a disclosure; the unapproved "drainer pattern" factor was removed. UI: a neutral Disclosures section ("No effect on the assessment"); methodology section added |
| **P1-02** public contracts admitted private/unreviewed/AI data | Public findings accept only `moderator_finding`; factors only the V1 codes (`moderator_finding`/`platform_analysis`); the public timeline has no report, queue or draft events and no `community` actor. Report receipt moved to member-private `packages/contracts/src/member.ts` (`submittedAt`), shown only on the member's Reports page. All six provenance labels kept for legends and private/future views |

### Medium and low findings

- **P1-03:** authorization wording is relative to the sending side; counterparties labelled Sender/Recipient; neutral, evidence-aware movement wording ("A log reports …" for unvalidated logs).
- **P1-04:** the proxy now runs for prefetch-marked requests too; CSP and token headers no longer depend on request metadata.
- **P1-05 (partial):** facts show their own observation time; copy no longer promises per-fact source or publisher attribution. Bounded source references remain Phase 3.
- **P1-06:** an explicit network is honoured (mismatch → "not a valid <network> …"; unknown `chain` → "Network not supported").
- **P1-07:** the handle is described as visible to the user and staff only; appeal copy lists all standing routes (moderation §6.2), including documentary standing for people who cannot sign today.
- **P1-08:** the AGENTS.md stage was updated.
- **P1-09:** Prettier was applied; `format:check` passes and is now part of `pnpm check`.
- **P1-10:** the mobile menu test asserts Tab and Shift+Tab containment.

### Tests added

- **Contracts (36, previously 20):**
  - no disclosure code is a factor code;
  - each capability is rejected as a factor and accepted as a zero-field disclosure;
  - factor provenance is bound to its code;
  - report-receipt, pending, draft and queue events are rejected;
  - allegation, AI, external and analysis findings are rejected;
  - AI and allegation factors are rejected;
  - pending counts, reporter metadata, moderation queues, AI assessments, allegations and member reports on the public object are rejected;
  - numeric score is rejected;
  - member-private reports are accepted.
- **Web (113, previously 102):**
  - DisclosuresList is neutral and accessible;
  - fixture semantics: zero-factor disclosures, Moderate only on an approved factor, no capability wording in explanations;
  - the assessment panel never shows disclosures;
  - fixtures contain only published findings and public events;
  - explicit network honoured;
  - incoming-transfer and log wording.
- **E2E (118 passed, previously 110):**
  - disclosures shown neutrally and the band stays Low;
  - explicit network;
  - no report-receipt activity;
  - prefetch-marked requests keep CSP, no-referrer and no-store;
  - focus containment.

### Verification (real results, Node 24.21.0)

| Check | Result |
|---|---|
| `pnpm format:check` | Pass |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` | Pass, **exit 0**: contracts 36, web 113 |
| `next build` (production) | Pass, 21 routes |
| `build:mock` | Pass |
| `check:mock-exclusion` | Pass (no fixture markers in production; marker present in mock; no server-only names in browser bundles) |
| Playwright (desktop + mobile Chromium, mock build) | **118 passed, 2 skipped** (viewport-specific), 0 failed |

**Correction to Session 6:** the root `pnpm test` then also ran the e2e package's `playwright test` script, which cannot run without its server. The command therefore exited non-zero, even though both unit-test suites passed. Session 6 reported the suite counts but not this exit code. Fixed by renaming the e2e package script to `e2e` (`pnpm test:e2e` still runs it).

**Not run:** gitleaks, Firefox/WebKit, manual screen-reader testing, coverage (unchanged from the review's not-run list).

### Remaining non-blocking items

- **P1-05 (Phase 3):** per-fact public source references.
- **P1-03 (Phase 3):** broader scenarios (delegated, malicious-log, victim).
- **Phase 6:** style-src tightening.
- **Pre-launch:** Firefox/WebKit, screen-reader and gitleaks.

### Recommended next step

A focused **Codex Phase 1 closure check** of P1-01 and P1-02, plus the network-selection, privacy-copy and header fixes. **Phase 2 is not authorized** and must not start without explicit owner authorization.

---

## Session 7: Codex Phase 1 review (2026-10-05)

### Outcome

**APPROVED AFTER REQUIRED FIXES.** Detailed findings and requested verdicts: [Phase 1 review](docs/reviews/2026-10-05-phase-1-codex-review.md). Claude remains primary engineer. No application code, contracts, fixtures, dependency declarations, architecture, migrations or infrastructure were modified. No Phase 2 work was started or authorized.

### Required corrections before Phase 2

1. **P1-01 (High):** Mock assessments wrongly present pause/upgrade authority, unverified source and mint authority as weighted risk factors. Restore zero-contribution disclosures and add semantic fixture tests.
2. **P1-02 (High):** Public research contracts permit report-receipt events and unreviewed/AI public findings or risk factors. Separate private report history and restrict V1 public eligible sources; add negative tests.

These restore accepted policy; no redesign or new ADR is proposed. No real user data exists or leaked. Claude's finding responses are pending.

### Non-blocking follow-up

- **Phase 2:** P1-04, preserve CSP/token-document headers on prefetch-marked full HTML; P1-07, fix registration's incorrect public-reporter-handle promise; P1-10, verify dialog Tab/Shift+Tab containment. Finish account/security UI with mock interfaces only.
- **Phase 3:** P1-03, identify transfer source authorization without claiming recipient signatures or treating arbitrary logs as confirmed movement; P1-05, source/as-of attribution; P1-06, honor explicit search chain.
- **Phase 4:** P1-07 appeal eligibility copy must include approved documentary/victim/representative paths, not require present wallet control.
- **Low:** P1-08 stale AGENTS current-stage note; P1-09 formatting in 93 files. Phase 6 retains broader browser/accessibility review and style-CSP cleanup.

### Verification (actual results)

Used the existing **Node 24.21.0** runtime; default Node 26 was not used for project checks. No production dependencies installed.

| Check | Result |
|---|---|
| ESLint | Exit 0, no problems |
| Type checks | core, contracts, contracts tests, web: no diagnostics |
| Contracts Vitest | 20 passed / 2 files / 5.22 s |
| Web Vitest | 102 passed / 15 files / 190.47 s, no retries; setup dominated time |
| Production build (mock mode unset) | Exit 0; 21 routes |
| Mock build reproduction | Exit 0; 21 routes |
| Mock exclusion | Exit 0; production markers absent, mock positive control present, checked server-only names absent in browser bundles |
| Playwright (existing mock build, desktop/mobile Chromium) | **110 passed, 2 viewport-specific skips**, 5.5 min, no retries |
| Independent browser probes | No sampled overflow at 390/768/1440 px; tokens stripped with no request/storage leakage; redirects stayed same-origin; malformed pathname 400/no stack |
| CSP probe | Normal document blocked parser-inserted unsigned script; prefetch-marked full HTML omitted CSP (P1-04). No existing injection exploit established |
| Production browser | No demo fixtures/banner; research correctly unavailable rather than fabricated |
| pnpm audit --prod | Exit 0; no reported advisories (154 production/optional dependency records) |
| Prettier --check . | Exit 1; 93 formatting warnings; no formatting applied |

Screenshots visually inspected by Codex; no human design sign-off. **Not run:** gitleaks (unavailable), Firefox/WebKit, manual screen-reader testing, coverage. Not a Git repository, so no commit/diff baseline. Temporary probes/screenshots are outside the workspace; local verification servers were stopped. Backend gates and real authentication/security enforcement were not tested or satisfied by mocks.

### Files changed / migrations / unfinished work

- Changed only `docs/reviews/2026-10-05-phase-1-codex-review.md` and `AI_HANDOFF.md`.
- Migrations: none. Production services/deployments: none.
- Unfinished: Claude corrects P1-01/P1-02 and records responses; Codex performs focused re-review.
- Recommended next step: resolve the two High findings within Phase 1, then seek **separate owner authorization** for Phase 2 account/security frontend. **Phase 2 is NOT authorized.**

---

## Session 6: Claude Phase 1 — Frontend Foundation (2026-10-05)

### Safety check

The only open High items (re-review findings V2-01 and V2-02) carry closure responses. No Critical/High Phase 0 blocker remained, and the owner explicitly authorized Phase 1.

### Delivered

| Area | Result | Where |
|---|---|---|
| Toolchain | Next.js 16.3.6 (Turbopack), React 19.3.0, TypeScript 6.0.3, Tailwind 4.3.3, Radix (dialog, tabs, tooltip), Zod 4.6.5, Vitest 5, Playwright 1.63. pnpm 12.7.0 on Node 24.21.0. All versions exact and at least 7 days old; no install scripts | package manifests, docs/dependency-policy.md §2.1 |
| Contracts | Auth requests and outcomes (15–128 code points, ≤ 512 bytes, NFKC), search, public research DTOs (strict: a numeric score is rejected), viewer, dashboard | packages/contracts/src |
| API boundary | ResearchApi / AuthApi interfaces → mock adapter or a "not connected" adapter. The mock is reachable only via the blacklist-mock-api alias (a stub in non-mock builds) plus a literal env guard | apps/web/src/lib/api, next.config.ts |
| Design system | Semantic tokens; light/dark/system without a flash (pre-paint script with the CSP nonce); monospace identifiers; reduced motion; primitives and app components | src/styles/globals.css, src/components, docs/design/frontend.md |
| Shell | Desktop sidebar + header; mobile menu sheet + bottom tab bar; skip link; staff section structural only | src/components/layout |
| Pages | Home (research-first), search (all states, including "Address detected — choose network"), address and transaction research, methodology, dashboard, reports, appeals, settings, staff shells, login, register (email-first), register/complete, forgot/reset password, email-change confirm, staff verify | src/app |
| Security | Nonce CSP + baseline headers. Token pages: fragment token stripped, sent only by POST, no-referrer + no-store. Safe next redirect; generic auth errors; dangerouslySetInnerHTML lint-banned; package-boundary and mock-import lint rules; 400 for malformed URLs | src/proxy.ts, src/lib/security, src/lib/auth, eslint.config.js |

### Verification (real results, Node 24.21.0)

| Check | Result |
|---|---|
| pnpm lint | Pass (0 problems) |
| pnpm typecheck | Pass (core, contracts including tests, web) |
| pnpm test | **122 passed** (contracts 20, web 102; includes axe-core checks on key components) |
| next build (production, no mock) | Pass, 21 routes |
| build:mock | Pass |
| check:mock-exclusion | Pass: no fixture markers in the production build; marker present in the mock build; no server-only names in browser bundles |
| Playwright (mock build, desktop + mobile Chromium) | **110 passed, 2 skipped** (viewport-specific). Includes axe WCAG 2.2 AA on 14 pages in light and dark, no-flash theme, no console/CSP errors, reduced motion, auth flows, staff boundary |

**Not run:** prettier --check (formatting not yet enforced), gitleaks (binary not installed), Firefox/WebKit, real screen-reader testing, coverage. Visual review was automated only (no human design review).

### Decisions and deviations (for review)

1. **.ts import specifiers** in packages/* with allowImportingTsExtensions. Turbopack could not resolve ./x.js to .ts inside workspace packages, and this also matches Node 24 type stripping.
2. **pnpm override semver@^6 → 7.7.4** (dev-only Babel path), because trustPolicy no-downgrade flagged semver 6.3.1. No policy setting was relaxed.
3. **ESLint 9.39.5** (npm marks it deprecated): eslint-plugin-jsx-a11y does not support ESLint 10 yet.
4. **style-src 'unsafe-inline'** in the CSP (Radix's scroll lock injects styles). Scripts remain nonce + strict-dynamic. Tighten in Phase 6.
5. **Deferred planned dependencies:** TanStack Query, React Hook Form (forms are small, and the contract schemas validate directly), web fonts, an icon library, next-themes.
6. **Interim handle rule** (3–30 characters, a-z, 0-9 and underscore). The identity design does not fix one; the API decides.
7. **"Choose network"** is triggered in V1 by 40 hex characters without 0x that are also valid base58 (Ethereum vs Solana). It generalizes when more EVM chains are added.
8. **Vitest testTimeout raised to 20 s:** jsdom + user-event typing timed out under parallel load on this machine. No assertion was weakened.
9. A mock-search bug (infinite recursion for ambiguous input with chain=solana) was found by e2e and fixed, with a regression test.

### Known limitations

- Staff pages, reports, appeals and settings are honest placeholders ("not available in this preview").
- The mock viewer switcher exists only in mock builds and grants nothing.
- EIP-55 checksums are not computed (display is lowercase); checksum validation belongs to the API and chains package.
- Error-boundary digests are opaque; there is no client error reporting yet (O-5 pending).

### Recommended next step

Codex review of Phase 1, then owner authorization of **Phase 2 (Auth UI)**. **Phase 2 is not authorized.**

---

## Session 5: Claude final Phase 0 closure corrections (2026-10-04/05)

### Completed

| Item | Resolution | Where |
|---|---|---|
| **V2-01** Reset email errors swallowed by Better Auth | Password-reset tokens are **Blacklist-owned**; Better Auth reset endpoints are unused. Delivery layer outcomes: `accepted_for_delivery` / `retryable_failure` / `permanent_failure` (timeout = retryable). A token is redeemable only after acceptance and is invalidated before retry; each retry issues a new generation; jobs carry identifiers only | identity §6.2, §8 |
| **Reset retries / serialization** | Per-account lock (`account_security_state FOR UPDATE`); at most one open reset token per account (partial unique); generation checks; behaviour defined for crash, duplicate, delayed, timeout and DLQ cases | identity §8.3–§8.4, §6.5 |
| **V2-02** Non-atomic reset | One transaction: credential replaced, token consumed, all sessions deleted, cooling started, `security_version` bumped, audit appended, notice enqueued. Every request rejects stale-version sessions. Password and email change use the same shape | identity §5.4, §6.3, §6.4, §7 |
| **V2-03** Solana different-slot agreement | Identical context slot required; different slots are inconclusive even with equal values; no same-slot pair → `unavailable`, no scoring signal. Receipts extended. EVM block-level balance deltas no longer upgrade transfers | chain-data §2.2, §5; `packages/chains/src/types.ts` |
| **V2-04** Approver vs publisher | Author and approver are the only human roles; publication is a **system transition** caused by approval (`finding_publication_events`, actor `system`); event model defined | moderation §1, §4, §5.1, §7.1; data model |
| **V2-05** Frontend-first | Phases 1–6 frontend (foundation, auth UI, research UI, reporting UI, staff UI, quality pass); Phase 7 Backend Foundation, starting with D1–D9 and S1–S17; 8–11 backend and launch. Typed mock client confers no authority; narrow spikes only with owner authorization | ARCHITECTURE §36; ESSENTIALS; testing §9, §13; ADR 0007 addendum; AGENTS; READMEs |
| **E-1** (owner: accepted with mitigation) | Mandatory mitigations M1–M10 (no bearer/JWT/conversion plugins, no mounted routes, no raw-token authentication or conversion wrappers, secret outside DB and backups, no token fields in DTOs, immediate revocation, regression tests, rehearsed rotation, re-evaluate before upgrades). DB + secret compromise documented as account-session compromise | identity §5.5; THREAT invariant 4; S17; ADR 0001 addendum |
| **P-11** (owner) | V1 public risk = band + explanation (+ factors, confidence, coverage, freshness, dispute state). No public numeric score | ARCHITECTURE §15.1, §15.6; PRD §5.14, §10; ADR 0005 addendum |
| V1 risk simplification | Active V1 formula is strong-evidence-only; the weak-signal policy is documented as inactive and deferred | ARCHITECTURE §15.2; ESSENTIALS §10; THREAT invariant 9 |
| Staff assurance wording | Two registered passkeys ≠ two independent devices; flag + CLI are technical controls, two-person only under a procedural control (new owner decision **P-13**) | identity §10.1, §10.13; ARCHITECTURE §9.4; PRD P-13 |
| Non-blocking items | Uniform-work email change + mandatory enumeration test; stale testing README fixed; receipt comments aligned; purge wording no longer overstates two-person control | identity §7; testing §4.3; packages/testing README |
| Reviews / ADRs | V2-01–V2-05 responses and a closure section added to the re-review (Codex text preserved). ADR 0008 Accepted with amendments; addenda to 0001, 0002, 0003, 0005 and 0007 (history preserved); index updated with a phase-number mapping | docs/reviews, docs/adr |

### Files changed

`docs/design/identity.md` (rewritten, rev 3), `docs/design/moderation.md`, `docs/design/chain-data.md`, `ARCHITECTURE.md` (rev 3; D-046–D-052; §36 phase plan; §37.3), `ARCHITECTURE-ESSENTIALS.md`, `THREAT-MODEL.md` (rev 3; 21 invariants), `PRD.md` (rev 3; P-11 decided, P-13 added), `docs/data-model.md` (rev 3), `docs/testing-strategy.md` (rev 3; §13 frontend testing), `docs/dependency-policy.md`, `docs/adr/0001`, `0002`, `0003`, `0005`, `0007`, `0008`, `docs/adr/README.md`, `docs/reviews/2026-10-04-phase-0-codex-rereview.md`, `docs/reviews/2026-10-04-phase-0-codex-review.md` (anchor links only), `AGENTS.md`, `CLAUDE.md`, `README.md`, `.env.example`, `apps/{web,api,worker,evidence-processor}/README.md`, `packages/{chains,config,contracts,db,testing}/README.md`, `packages/chains/src/types.ts` and `ports.ts` (comments and receipt fields), `infrastructure/README.md`, `tests/e2e/README.md`, this handoff.

### Migrations, dependencies, tests

None created or installed. No frontend, backend, migration, provider or email integration work. Not a git repository.

### Verification performed (real results)

| Check | Result |
|---|---|
| Stale-statement sweep (reset-email throwing, reset retries/atomicity, Solana different-slot agreement, human publisher, backend-first Phase 1, numeric public score, weak V1 scoring, staff device independence, bearer usage, S1–S15, old phase numbers) | All remaining hits are in "not used / forbidden / deferred / historical" contexts; the stale ones were fixed (.env.example phase label, O-1 row, threat-model reviewer line, T-31 formula, two overstated two-person claims) |
| Link + anchor checker | 241 relative links, 0 broken (5 renamed anchors updated) |
| TypeScript **6.0.3** check of `packages/core` and revised `packages/chains` under checksum-verified Node **24.21.0** (scratch copy with `@types/node` 24.x) | Both pass; repository files byte-identical to the checked copies |
| Secret-pattern scan | No matches |
| Workspace state | 70 files; no `node_modules`, no lockfile |

**Not run:** gitleaks, lint, runtime or integration tests, S1–S17, D1–D9 (Phase 7 gates).

### Final self-review answers

1. Reset email failure reaches retry logic: yes, through the delivery layer's own outcome, not a library callback.
2. Only one reset token can be valid: yes; partial unique index, lock, generation check, redeemable only when `active`.
3. Reset cannot partially complete: one transaction.
4. Sessions are revoked inside it, and stale-version sessions are rejected anyway.
5. Cooling begins inside the same transaction.
6. Solana different slots are never "agree".
7. and 8. Author, independent approver and system publication are defined, with an event model.
9. Frontend-first is reflected in ARCHITECTURE, ESSENTIALS, AGENTS, CLAUDE, README, testing, ADRs and READMEs.
10. Backend gates are retained in Phase 7.
11. E-1 mitigations are documented as invariants with tests.
12. Public risk shows band + explanation only.
13. Weak scoring is marked inactive.
14. No Phase 1 implementation was performed.

### Owner decisions still needed

- Ratify amended ADRs 0001–0008.
- **P-12** staffing for independence.
- **P-13** break-glass procedural control.
- P-3, P-7, P-9, P-10; legal counsel (pre-launch blocker); O-3–O-7, O-12, O-13.
- Repository creation, licence and CODEOWNERS.
- Install Node 24 on the development machine.

### Recommended next step

**One final, focused Codex closure check** of V2-01–V2-05 and the owner decisions as written. Then owner ratification of Phase 0 and a **separate, explicit** authorization of Phase 1 (Frontend Foundation). **Phase 1 is not authorized.**

---

## Session 4: Codex Revision 2 final re-review (2026-10-04)

- **Verdict:** APPROVED AFTER ADDITIONAL REQUIRED FIXES. [Full review](docs/reviews/2026-10-04-phase-0-codex-rereview.md); original review appended with cross-reference. Claude remains primary. Phase 1 remains **UNAUTHORIZED**.
- **Statuses:** fourteen R findings PASS; R-02/R-03/R-05/R-07 PARTIAL. A1-A4 PASS at the design level, not runtime certification. Original R-01 activation vulnerability is resolved.
- **E-1:** ACCEPTABLE WITH MITIGATION. Exact Better Auth 1.7.6 signed-cookie lookup rejects unsigned tokens; dump-only attacker cannot authenticate on the specified headless, plugin-free surface. Owner acceptance and negative wrapper/cookie/bearer tests required.
- **Current work / known concerns:** Better Auth catches reset-email send errors; reset completion needs atomic or fail-closed recovery for credentials/revocation/cooling; Solana different-slot agreement exception contradicts policy; moderation approver/publisher wording conflicts; phase plan must reflect owner frontend-first rule.
- **ADR:** [0008](docs/adr/0008-revision-2-ratification-corrections.md), **Proposed**, not implemented. No accepted architecture/ADR was overwritten.
- **Files changed:** this handoff; original Codex review appended; new Revision 2 review; new Proposed ADR 0008. No source/config/schema changes.
- **Verification:** 68 pre-review files, 13 manifests; JSON/workspace references PASS; zero external declared deps, no node_modules/lockfile. git status failed: not a Git repository. Better Auth source archive integrity PASS. Isolated actual better-call crypto primitive: signedValid=true, wrongSecretValid=false, unsignedHasSignature=false. Temporary source/probe files live outside workspace; no dependency installation. Probe runtime Node 26.8.1, not a Node 24 application check. Initial inline probe quoting failed, corrected file invocation passed.
- **Not run:** production integration, lint, application typecheck, browser tests, S1-S15/D1-D9. No migrations, feature work, services, deployments or commits.
- **Owner instruction:** after Phase 0, development is **frontend-first**. Contracts/types/mocks and minimal scaffolding may support frontend flows; full backend development waits for frontend foundation/primary-flow completion. This instruction controls over older backend-first phase text. No frontend work is authorized by this review.
- **Deferred decisions:** owner ratification, E-1, P-11, independence staffing; later hosting/providers/calibration/legal/retention/checkpoint gates remain unchanged.
- **Recommended next step:** Claude corrects the five protocol/documentation items and responds to review/ADR 0008; focused Codex closure check; owner ratifies Phase 0 and then separately authorizes Phase 1.

---

## Session 3: Claude review response (2026-10-04)

### Completed

- **Responded to every finding** in [docs/reviews/2026-10-04-phase-0-codex-review.md](docs/reviews/2026-10-04-phase-0-codex-review.md) (R-01 … R-18). Each response gives the disposition, the resolution and the phase gate; Claude's answers to Codex's ten questions are appended. None was rejected.
- **ADR dispositions** ([docs/adr/README.md](docs/adr/README.md)):
  - 0001–0006 are **Accepted with amendments**. The direction follows the owner's directions of 2026-10-04; the amended text awaits owner ratification. Codex's original proposals are preserved verbatim.
  - **ADR 0007** (toolchain + Foundation acceptance checks) added, Accepted.
- **New normative design documents:**
  - [docs/design/identity.md](docs/design/identity.md): Better Auth headless split, email-first registration (R-01), password policy, sessions, worker-generated security tokens (R-03), staff lifecycle with split-secret enrollment (R-04), the single exact-Origin policy (R-15), the Better Auth acceptance spike S1–S15.
  - [docs/design/moderation.md](docs/design/moderation.md): finding revisions, revision-bound approve-and-publish, severe rules (never relaxed; replacing a severe publication needs independent approval), five standing mechanisms, independence matrix, appeals.
  - [docs/design/chain-data.md](docs/design/chain-data.md): evidence levels + authorization basis (no association in V1), snapshot-bound verification receipts, finalized-only pinning, sanctions design (activation deferred).
- **Authentication evidence:**
  - Better Auth 1.7.6 source inspected, plus `@better-auth/core` and `@better-auth/telemetry`.
  - OSV advisory histories queried for Better Auth (22), SimpleWebAuthn (1), @node-rs/argon2 (0), next-auth (14), @auth/core (3) and Ory Kratos (4).
  - Comparison and file-level findings recorded in ADR 0001.
- **Reconciled documents** (revision 2): PRD, ARCHITECTURE (rev 2, decision log D-031–D-045, open decisions, phases, §37 self-review), ESSENTIALS (incl. §16 language/file/module separation), THREAT-MODEL (extended T-01/04/05/07/10–12/16–18/24–28/31–33/35/38–41/43–44/46–47/49–50/52; 19 invariants; residual risks), data model rev 2, testing strategy rev 2, dependency policy, AGENTS, CLAUDE, README, app/package READMEs, PR template.
- **Scaffold corrections:**
  - `engines.node` set to `>=24.20.0 <25.0.0`.
  - `packages/chains` contracts revised (snapshot identity, receipts, independence groups, evidence level, authorization basis, signers, explorer attribution, provider-scoped cursors).
  - `packages/core` brand-construction comment.
  - New `apps/evidence-processor` (README + manifest).
  - `.env.example` adds `BETTER_AUTH_SECRET`, `BREAK_GLASS_ENABLED`, `DNS_RESOLVER_URL` and processor variables; ClamAV removed.
  - Infrastructure and e2e READMEs updated.

### Adversarial self-review findings (not in Codex's list; fixed)

| # | Flaw | Fix |
|---|---|---|
| A1 | Registration timing oracle (different DB work for existing vs new email) | API never checks existence; worker decides |
| A2 | Mailbox takeover could hijack staff recovery/invitations | Split-secret enrollment code delivered out of band |
| A3 | A single moderator could downgrade a published severe finding | Replacing a severe publication needs independent approval; suspensions alert admins |
| A4 | CSP lacked `img-src` for the evidence domain | Added (derivatives only) |

### Files changed this session

```
New:      docs/design/identity.md  docs/design/moderation.md  docs/design/chain-data.md
          docs/adr/0007-toolchain-and-foundation-acceptance.md
          apps/evidence-processor/README.md  apps/evidence-processor/package.json
Rewritten: ARCHITECTURE.md  ARCHITECTURE-ESSENTIALS.md  PRD.md  docs/data-model.md  docs/testing-strategy.md
          README.md  .env.example  AI_HANDOFF.md
          apps/web/README.md  apps/api/README.md  apps/worker/README.md
          packages/chains/README.md  packages/config/README.md  packages/domain/README.md  packages/db/README.md
          packages/chains/src/types.ts  packages/chains/src/ports.ts
Edited:   THREAT-MODEL.md  AGENTS.md  CLAUDE.md  docs/dependency-policy.md  docs/adr/README.md
          docs/adr/0001…0006 (recommendation, amended decision, owner record; original text preserved)
          docs/reviews/2026-10-04-phase-0-codex-review.md (responses + answers appended; Codex text preserved)
          package.json  packages/core/src/chain.ts  infrastructure/README.md  tests/e2e/README.md
          .github/pull_request_template.md
```

### Database migrations

None. Schema designed in `docs/data-model.md` revision 2.

### Tests

No test code exists (by design). Test plans: `docs/testing-strategy.md` revision 2.

### Verification performed (real results, 2026-10-04)

| Check | Result |
|---|---|
| pnpm 12.7.0 install under **Node 26.8.1** with new engines | **Rejected** (`ERR_PNPM_UNSUPPORTED_ENGINE`, wanted `>=24.20.0 <25.0.0`), as intended |
| pnpm 12.7.0 install under **Node 24.21.0** (official zip; SHA-256 verified against nodejs.org SHASUMS256) | Pass: 13 workspace projects (incl. evidence-processor) |
| **TypeScript 6.0.3** type check of `packages/core` and revised `packages/chains` (under Node 24; `@types/node` 24.x added in the scratch copy only) | Both pass. The repo files are byte-identical to the checked copy |
| Markdown link + anchor checker (GitHub slug rules) over all `.md` | 212 relative links, 0 broken (2 anchors fixed) |
| Stale-term sweep across current docs | Remaining hits are only in deferred, prohibited or historical contexts (reviewed line by line). ClamAV in the e2e README and old MVP wording were fixed |
| Cross-document parameter check (passwords, TTLs, staff authenticators, evidence limits, lifetimes, ceilings) | Consistent |
| Secret-pattern scan | No matches |
| `.gitignore` on a throwaway git copy | Decoy secrets ignored; all 68 project files (including new ones and `.env.example`) committable |
| Better Auth evidence | Source inspection and OSV queries as listed above; claims in ADR 0001 cite the inspected files |

**Not performed:** gitleaks (not installed), linting (no tooling), any runtime test, any Better Auth integration (that is spike S1–S15 in Phase 1), Drizzle/pg-boss checks (D1–D9 in Phase 1). Codex has not yet reviewed revision 2.

### Known bugs

None (no code). Scaffold limitation: `packages/chains` will not type-check in the repo until Phase 1 installs `@types/node` 24.x (expected). The owner's machine runs Node 26.8.1, which the project now rejects; Node 24 must be installed before Phase 1.

### Security concerns to carry forward

1. **Exception E-1:** Better Auth stores session tokens unhashed (HMAC-signed cookies compensate). Needs owner acceptance or an ADR for a custom session layer.
2. **Member accounts have no MFA in V1.** Mailbox compromise → takeover via reset (accepted residual; member MFA is the first Post-V1 identity item).
3. **Full audit rewrite by a DB administrator** is undetectable until the O-13 checkpoint decision.
4. **Better Auth advisory cadence:** keep the headless/no-plugin configuration; track GHSA; the spike may surface gaps that need ADRs.
5. **Independence requires staff:** two independent people to publish severe findings, a third for severe appeals (P-12).
6. **Legal review is a pre-launch blocker** (P-8).
7. Enable GitHub secret scanning, push protection and gitleaks when the repository is created.

### Architecture decisions this session

ADR 0001 (Better Auth headless + Blacklist identity policy; email-first registration; worker-generated tokens; staff lifecycle; exact Origin; 15-character passwords); ADR 0002 (revision-bound approvals; standing; independence); ADR 0003 (transfer authorization semantics; snapshot verification; sanctions deferred); ADR 0004 (image-only; isolated processor; per-item objects; AV deferred); ADR 0005 (private reports; tier combination; replay; stale jobs; smaller V1); ADR 0006 (honest audit; identity map; telemetry; retention gate); ADR 0007 (Node 24, TypeScript 6, pnpm 12.7.0, Drizzle acceptance D1–D9). Decision log: ARCHITECTURE §34 (D-031–D-045; D-008, D-019, D-024 and D-030 superseded).

### Owner decisions still needed

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| **E-1** | Accept plain session-token storage compensated by HMAC-signed cookies | Accept | Phase 1 identity work |
| **Ratification** | Amended text of ADRs 0001–0006 (incl. ClamAV deferral, no global dedup, split-secret enrollment, severe-replacement rule) | Ratify | Phase 1 start |
| **P-11** | Public numeric score display | Band + explanation at launch; numeric after calibration | Phase 4 |
| **P-12** | Staffing for independence (2 for severe publication, 3rd/external for severe appeals) | Plan before Phase 3 | Phase 3 operations |
| **O-13** | Independent audit checkpoint | Yes, decided with hosting | Launch |
| P-8 | Engage qualified legal counsel (jurisdictions, defamation, privacy, retention, sanctions, publication) | Required | Public launch |
| P-3, P-7, P-9, P-10 | Indexing, retention, moderator identities, DSAR | See PRD §10 | Launch |
| O-6, O-7 | Human-verification and email providers | Turnstile; SMTP provider meeting identity §8 criteria | Finishing Phase 1 auth (local fakes OK before) |
| O-3, O-4, O-5 | Providers, hosting/edge/CI, error tracking | See ARCHITECTURE §35 | Phase 2 / staging |
| Repo | Create the GitHub repository (secret scanning + push protection), licence (currently `UNLICENSED`), CODEOWNERS handles | Owner action | Before first commit |
| Machine | Install Node 24 LTS on the development machine | Owner action | Phase 1 |

### Remaining blockers for Phase 1

1. Owner + Codex review of revision 2 (this response).
2. Owner ratification of the amended ADRs and a decision on **E-1**.
3. Explicit owner authorization of Phase 1.
4. Node 24 installed on the development machine; git repository created with protections.

Phase 1 must then **start with the acceptance spikes** (Better Auth S1–S15, Drizzle/pg-boss D1–D9) before identity migrations or features.

### Recommended next step

**Owner + Codex review of these corrections.** Codex should re-review revision 2, focusing on:

- the new design documents;
- whether R-01–R-18 are genuinely resolved;
- adversarial fixes A1–A4;
- ADR amendments, especially the ClamAV deferral and generating tokens at send time instead of encrypting them.

The owner should decide E-1 and ratify the ADRs. **Do not start Phase 1 without explicit owner authorization.**

---

## Codex independent review session (2026-10-04, preserved history)

- **Completed:** inspected all 55 existing files, including full product/architecture/threat/data/testing/dependency docs, all source contracts, manifests and configurations; checked primary-source authentication, password, technology and blockchain claims. Created [review](docs/reviews/2026-10-04-phase-0-codex-review.md) with every O-1…O-12/P-1…P-10 recommendation, requirements coverage, findings and phase gates. Filed six Proposed ADRs; no approved architecture was changed.
- **Verdict:** APPROVED AFTER REQUIRED FIXES. One Critical, eight High, seven Medium and two Low findings; accepted decisions documented separately. This is a conditional review conclusion, not owner approval or phase authorization.
- **Current work:** none executing; Claude response and owner decisions pending.
- **Files changed this session:** review above; `docs/adr/0001-authentication-lifecycle-and-delivery.md`, `0002-immutable-approvals-and-effective-redress.md`, `0003-chain-evidence-and-authorization-semantics.md`, `0004-hostile-evidence-isolation-and-lifecycle.md`, `0005-risk-evidence-privacy-and-v1-scope.md`, `0006-audit-trust-retention-and-private-telemetry.md`; ADR index; this handoff.
- **Migrations/dependencies/production code:** none created, changed or installed. No infrastructure, deployments, purchases or production/user-data access.
- **Actual checks:** all JSON parsed; 12 manifests including root / 11 child projects; 17 valid internal workspace dependency edges and no cycles; 55 initial local Markdown file links resolve (anchors not tested); seven TypeScript vocabulary/contract files and zero tests; no lockfile/node_modules. Limited private-key/AWS/GitHub-token/xprv pattern scan found zero matching files without printing values. Scratch Git ignore test outside workspace passed for 12 synthetic secret/build/data paths and preserved `.env.example`, documentation and source. Initial PowerShell stdin CR artifacts were corrected by LF-only Node stdin. Workspace `git status --short` fails because no Git repository exists.
- **Tool evidence:** installed Node reports `v26.8.1`; pnpm/tsc/gitleaks are unavailable on PATH. No independent install, typecheck, lint, runtime suite or performance test was run. Claude's earlier scratch results remain historical author-reported evidence, not independently reproduced results.
- **Known design issues:** activation preserves attacker credentials unless resolved (R-01); auth-library fit unproven; queued auth token handling and staff recovery undefined; append-only approval ambiguity; subject-authorized association and same-state provider receipts absent; unsafe MVP PDF viewing; limited appeal standing; public report inference and historical score/job ordering gaps. See review for evidence, not deployed bug claims.
- **Security concerns:** affected T-01…07, T-11…18, T-21, T-24…29, T-31…42, T-44, T-46…50, T-52, T-55…57 as detailed in review/ADRs. No secrets observed or introduced. AGENTS §9 checked for review-only scope; no runtime/migration security pass claimed.
- **Recommendations made, not decisions accepted:** library-first auth evaluation; 15-character password-only minimum; no public pending counts/numeric report effects; image-only smallest V1; preserve modular monolith, provenance and chain-scoped subjects; require explicit audit trust/retention policy and independent appeal capacity.
- **Deferred decisions:** all owner/Claude approvals remain pending; original architecture still governs until accepted ADRs reconcile it. No Phase 1 authorization.
- **Unfinished:** finding responses, ADR acceptance/rejection, document reconciliation, exact-version compatibility/security checks during authorized Foundation, relevant phase tests and qualified pre-launch legal review.
- **Recommended next step:** Claude reviews these findings and proposals, then the owner resolves blockers. Stop after review; implement nothing without separate authorization.

## Claude session 1 (2026-10-04, preserved summary)

Created the Phase 0 foundation: PRD, ARCHITECTURE (rev 1), ESSENTIALS, THREAT-MODEL, AGENTS, CLAUDE, README, data model, testing strategy, dependency policy, ADR/review templates, scaffold (pnpm workspace, `core`/`chains` contracts). Verified then: pnpm 12.7.0 settings recognized (with a negative control), release-age and `saveExact` behaviour, TypeScript 7.0.2 check of the contracts (TypeScript 6 is now the baseline, re-verified in session 3), `.gitignore` decoys, secret-pattern scan.
