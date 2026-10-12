## Summary

<!-- What does this change do and why? Link the phase, issue, or ADR. -->

## Phase / scope

- Authorized phase: <!-- e.g. Phase 1 — Foundation (see AI_HANDOFF.md) -->
- [ ] This change stays inside the approved architecture, or links an **accepted** ADR.

## Changes

-

## Tests

<!-- Commands run and their real results. If something was not run, say so. -->

- [ ] New/updated tests (bug fixes start with a failing test)
- [ ] Negative/security tests for auth, authorization, evidence, risk, or audit changes
- [ ] New routes added to the authorization matrix

## Security checklist (AGENTS.md §9)

- [ ] Authorization: route policy declared; domain policy checks ownership/state
- [ ] Input validated (Zod), unknown fields stripped; output via allowlisted DTO
- [ ] No private data in public responses, logs, notifications, or caches
- [ ] No secrets in code, tests, fixtures, logs, or docs
- [ ] Provenance preserved for any claim/signal/label
- [ ] Risk invariants unaffected (or updated with an accepted ADR)
- [ ] Rate limits/quotas considered for new endpoints
- [ ] New dependencies justified in docs/dependency-policy.md (or none added)
- [ ] Migration reviewed (locks, rewrites, grants, append-only, privacy)
- [ ] No tokens or token links in job payloads, logs, errors or analytics; exact-Origin policy covers new mutations
- [ ] Delayed jobs check expected revision/state (no resurrection of reversed/withdrawn state)
- [ ] Language/module separation respected (no mixed-responsibility files, no standalone HTML, no new languages)
- Affected threat IDs: <!-- e.g. T-05, T-11 -->

## Documentation

- [ ] Docs / data model / threat model updated as needed
- [ ] `AI_HANDOFF.md` updated
