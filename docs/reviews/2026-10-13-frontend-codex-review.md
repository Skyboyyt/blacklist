# Review: merged frontend through Phase 5, including administrator console and scoreboard

| Field | Value |
| --- | --- |
| Reviewer | Codex |
| Date | 2026-10-13 |
| Repository | Skyboyyt/blacklist |
| Reviewed commit | `87fc8b927ca369055988a5a1912b8151470fb49f` (PR #4 merge) |
| Default branch | `chore/initial-repository` |
| Scope | Repository structure, frontend contracts and service boundaries, account UX, public research, member submissions, moderation, administration, public effects, scoreboard, validation and handoff |
| Documents consulted | AGENTS.md, AI_HANDOFF.md, PRD.md, ARCHITECTURE-ESSENTIALS.md, relevant ARCHITECTURE/THREAT-MODEL sections, identity and moderation protocols, ADR index and ADR 0012, frontend design, integration contracts, requirements checklist, review format |

## Summary

**Required fixes before frontend sign-off.** The merged frontend has substantial functional coverage and passes its existing checks, but six additional regression tests reproduce three High and three Medium workflow defects. These are defects in the fictional mock implementation, not demonstrated vulnerabilities in a deployed backend. They matter because the integration document explicitly describes several mock services as the reference for future backend behavior.

No real authentication, database, upload processing, chain providers, or production API exists in the reviewed commit. The approved roadmap is Phase 6 for frontend quality/review, Phase 7 for backend foundation, and Phases 8–11 for subsequent backend features and launch readiness. Do not treat frontend test results as evidence that backend security gates have passed.

## Validation

Independent checks used Node 24.21.0 and pnpm 12.7.0 without changing manifests, lockfile, or supply-chain settings.

| Check | Result |
| --- | --- |
| Frozen-lockfile installation | Passed, including supply-chain policy verification |
| `pnpm check` on reviewed commit | Passed: formatting, lint, type checks, tests, production build |
| Contract tests | 77 passed |
| Web unit/component tests | 354 passed |
| Additional review regression tests | 6 failed against expected correct behavior; each failure corresponds to a finding below |
| Mock build and exclusion scan | Passed on reviewed commit: production contains no mock markers; mock contains the positive-control marker; neither browser bundle contains scanned server-only names |
| Targeted tracked-file secret-pattern scan on prior head | 429 tracked files; no private-key, AWS access-key, or GitHub-token pattern matches; this is not a complete secret audit |
| Playwright browser suite | Not independently run: Chromium installation failed because the browser download was not a valid ZIP; Firefox/WebKit were unavailable |

Claude reports 322 Chromium E2E passes and two viewport-specific skips on the latest feature commit. Those are author-reported results, not independent results from this session. Existing E2E specifications were inspected, including the scoreboard and administrator journeys.

Reproduction source: `docs/reviews/reproductions/2026-10-13-frontend.test.ts.sample`. To run, copy it to `apps/web/src/lib/api/mock/review-regressions.test.ts`, run `pnpm --filter @blacklist/web exec vitest run src/lib/api/mock/review-regressions.test.ts`, then remove the temporary copy. The sample is intentionally outside the normal test suite: it preserves failing review evidence without changing baseline checks.

## Findings

### R-01 Step-up grants are transferable between staff identities and do not bind parameters

- **Severity:** High
- **Category:** authorization
- **Location:** `apps/web/src/lib/api/mock/admin-api.ts:96`, `admin-api.ts:128`; `apps/web/src/lib/api/mock/moderation-api.ts:430`, `moderation-api.ts:714`; `apps/web/src/lib/api/mock/store.ts` grants map
- **Evidence:** Every grant is keyed only by `${action}:${targetId}`. The reproduction verifies `user.suspend` as `admin`, switches to `admin_b`, and suspends the member without obtaining a new assertion. Expected `stepup_required`; actual result is `ok`. Finding approvals likewise bind only the finding ID, not the revision/hash or confirmed parameters.
- **Impact:** The demo does not demonstrate that the acting staff member authorized the exact consequential action. Switching identities or changing parameters can reuse another action's proof. Copying this reference into the backend would violate identity §10.7 and the session-bound assurance requirement.
- **Recommendation:** Bind grants to the actor and session/assurance generation plus canonical action, target and parameters (including revision/hash). Invalidate them on identity/security transitions. Preserve single-use expiry and add negative tests for identity switches and parameter changes.
- **Response:** Implemented by Codex in `fix/frontend-review-findings`; regression coverage in `apps/web/src/lib/api/mock/review-regressions.test.ts`.

### R-02 A low-severity replacement of a public Severe finding can be self-approved

- **Severity:** High
- **Category:** authorization
- **Location:** `apps/web/src/lib/api/mock/moderation-api.ts:884–894`
- **Evidence:** Independence checks run only when the candidate revision is `severe`. The reproduction seeds a valid published Severe revision and its latest proposed Low replacement, then approves the replacement as its author. Expected refusal; actual result is `ok`. Moderation §4.1/§8.1 and threat invariant 8 require independent approval for any replacement of a currently public Severe revision.
- **Impact:** The approval model permits one participant to downgrade a severe finding. Existing tests cover a new Severe revision but miss severe-to-non-severe replacements.
- **Recommendation:** Require independent approval when either the candidate or the current public revision is Severe. Reject any author of any revision and participants of the current public revision, with the required permission. Retain participant history rather than replacing it with only the latest author/approver pair.
- **Scope note:** The reproduction seeds revision states directly because editing existing findings is not a complete UI workflow yet. It verifies a real defect in the approval service, not an end-to-end attack through a revision editor.
- **Response:** Implemented by Codex in `fix/frontend-review-findings`; regression coverage in `apps/web/src/lib/api/mock/review-regressions.test.ts`.

### R-06 Ordinary approval bypasses an open emergency suspension review

- **Severity:** High
- **Category:** privacy / correctness
- **Location:** `apps/web/src/lib/api/mock/moderation-api.ts:861–936`; `apps/web/src/lib/api/mock/public-effects.ts:62–96`
- **Evidence:** The reproduction suspends published finding `demo-finding-301`, adds a proposed next revision, then calls ordinary `approveRevision`. Expected blocked publication; actual result is `ok`. `publishFinding` replaces the suspension placeholder with normal public text and sets dispute state to `none`, while the suspension review remains open.
- **Impact:** Public text and a risk contribution can return before the independent suspension review finishes. This contradicts moderation §4.2 check 5 and §8.3 and undermines emergency privacy corrections.
- **Recommendation:** Block normal publication while a finding/subject has an unresolved suspension or hold. Restore it only through the eligible review transition, bound to the relevant revision. Test that refused approval changes no public text, factor, assessment or audit publication state.
- **Scope note:** The next revision is seeded directly to exercise the approval path, as in R-02.
- **Response:** Implemented by Codex in `fix/frontend-review-findings`; regression coverage in `apps/web/src/lib/api/mock/review-regressions.test.ts`.

### R-03 Unrelated DNS control is accepted as standing for an address

- **Severity:** Medium
- **Category:** correctness / authorization
- **Location:** `apps/web/src/lib/api/mock/member-api.ts:175–191`, response and appeal standing callers
- **Evidence:** `standingFor` checks the hostname only when `domains !== null`. Address targets pass `null`, so a response about a wallet with `dns_txt` for `unrelated.example` returns `ok` and records standing as granted. The UI correctly omits DNS for wallets, but the service does not enforce that restriction. The same gap applies to address appeals.
- **Impact:** A mismatched proof is accepted by the mock reference. Hiding an option in the UI cannot substitute for the method eligibility checks that the implementation claims to demonstrate.
- **Recommendation:** Explicitly refuse DNS standing for address subjects. Allow it only for eligible project/domain targets with a non-empty, matching official-domain set. Test the complete subject-kind × standing-mechanism matrix through both submission methods.
- **Response:** Implemented by Codex in `fix/frontend-review-findings`; regression coverage in `apps/web/src/lib/api/mock/review-regressions.test.ts`.

### R-04 Concurrent project corrections overwrite an already-reviewed profile change

- **Severity:** Medium
- **Category:** correctness
- **Location:** `apps/web/src/lib/api/mock/member-api.ts` correction `currentRevision`; `apps/web/src/lib/api/mock/public-effects.ts:182–210`; correction decision guard
- **Evidence:** Two description corrections are submitted against one profile revision. Both reviews start; the first is accepted and advances the profile revision. Accepting the second returns `ok` and replaces the first change. Its stored `currentRevision` is never checked against the live profile. The case-version check protects only the individual case.
- **Impact:** A reviewer can accept an outdated current-versus-proposed diff and silently overwrite another approved correction.
- **Recommendation:** Compare the correction's base profile revision with the current revision before any case or public mutation. Return `conflict`, show the latest diff, and require a refreshed proposal/review. Add a regression covering two different cases targeting the same profile.
- **Response:** Implemented by Codex in `fix/frontend-review-findings`; regression coverage in `apps/web/src/lib/api/mock/review-regressions.test.ts`.

### R-05 Approved reports for new addresses never become public

- **Severity:** Medium
- **Category:** correctness
- **Location:** `apps/web/src/lib/api/mock/public-effects.ts:62–65`; report creation and approval paths
- **Evidence:** The report form accepts any correctly formatted network-specific address. A report for a previously unknown valid Ethereum address can be reviewed, accepted and approved. The revision becomes `published` and the audit records publication, but `publishFinding` returns silently because no address record exists. The reproduction expects a public finding and receives no address record. Existing public-effects tests use only fixture addresses.
- **Impact:** The main research → report → finding loop fails for new subjects while telling staff publication succeeded.
- **Recommendation:** Create a minimal subject/research read model for new reported addresses without inventing chain facts, or fail publication explicitly until the subject can be represented. Only record successful publication when the public effect succeeds. Add tests for new Ethereum and Solana addresses.
- **Response:** Implemented by Codex in `fix/frontend-review-findings`; regression coverage in `apps/web/src/lib/api/mock/review-regressions.test.ts`.

## Other requirements and boundaries

- The band-only scoreboard matches accepted ADR 0012: highest official-address band, shared ranks, explicit network filtering, and separate unranked reasons. Public contracts reject numeric scores.
- Capability disclosures remain separate from scored factors, and public DTOs exclude numeric scores and internal moderation fields. Existing negative tests verify several of these boundaries.
- Phase 2 corrections are present: enrollment submits the password to the bound mock flow, staff reset includes the passkey step, and login has a human-verification-required state. This is UX evidence, not real credential/session security.
- Mock exclusion is an explicit build boundary; preview cookies, simulated signatures and in-memory stores must never be treated as production authentication or durable storage.
- Existing-finding revision editing/amendment deserves an explicit requirement check before calling the frontend complete. The roadmap calls for a finding revision editor; current flows create first revisions and list/approve fixture revisions. An appeal marked `amended` currently records that an amendment will happen rather than creating the amended revision.
- Integration documentation already lists unresolved pagination, interim status, endpoint-catalog, staff-recovery-screen and calibration issues. Preserve them as open work rather than claiming all integration contracts are final.
- A manual WCAG audit, cross-browser checks, and actual tablet/mobile interaction review remain part of Phase 6. Automated axe/component tests alone do not close those requirements.
- Transparent policy pages remain drafts; legal review is a launch blocker, not a reason to block ordinary frontend repairs.

## Not reviewed

No backend runtime, live database, actual WebAuthn assertions, real emails, hostile-image processor, provider failover, immutable audit storage, production deployment, restore drills, penetration test or legal assessment was available to review. No existing or new GitHub review comment was posted, and no commit, push or merge was performed.

This is a repository-wide structural review with targeted source and behavioral inspection, not a guarantee that every line is defect-free. The findings above should be fixed and independently rechecked before frontend sign-off or copying the mock reference into backend implementations.

## Repair pass (Codex, 2026-10-13)

The owner asked Codex to implement the fixes. All six findings are repaired within the approved frontend/mock architecture. The normal suite now includes the six original regression scenarios plus seven additional tests for actor/session/parameter/expiry binding, prior-approver independence, DNS appeals and new Solana addresses. The original sample above remains historical evidence; the maintained test file passes the exact action parameters required by the corrected protocol.

The non-severe self-approval test now uses a fresh finding, because its old fixture shared an ID with an emergency-suspended finding; treating that old approval as successful would weaken the corrected suspension rule. No negative test was removed or skipped.

Validation: `pnpm check` passed (77 contract and 367 web tests, formatting, lint, type checks and production build). The final 13-case regression file also passed after strengthening its public-state assertions. Mock build and exclusion scan passed: production contains no mock markers; the mock positive-control marker is present; scanned server-only names are absent from both browser bundles. Browser E2E remains unverified in this environment for the download limitation described above.

The findings are resolved by implementation and automated checks; outstanding manual frontend quality and integration-documentation items remain. Backend readiness is not claimed.
