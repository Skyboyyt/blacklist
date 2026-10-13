# Phase 7 implementation security check

| Field | Value |
|---|---|
| Agent | Codex, assigned implementer/security check |
| Architecture owner | Claude; independent review pending |
| Scope | Local Backend Foundation and integrated PR #7 repairs |
| Threats | T-01–T-07, T-17–T-18, T-21–T-22, T-24, T-44, T-46; audit/privacy and invariant 12 |

## Fixed during implementation

- **High: replacement-factor registration needed existing-factor proof.** An assured cookie must not let a holder register an attacker factor and obtain durable staff power. Replacement now requires a fresh assertion from an existing enrolled factor, bound to the new credential and registration challenge, consumed with activation. The application test rejects registration alone and exercises replacement after the seven-day business-permission deficit.
- **High: verification side effects needed caller binding first.** User/session/purpose/action/token binding is checked before signature verification and counter-regression effects. Counter handling rechecks security version and live challenge consumption under account lock. An unrelated or already consumed assertion cannot supply reset authority or a regression side effect.
- **Assurance continuity:** removing the old sign-in factor uses the freshly verified remaining factor on the surviving session. Factor transitions bump security version, revoke other sessions/invalidate tokens and expire outstanding challenges. Current session is restamped, without re-signing a stored token.
- **Domain identity:** account kind, audit actor reference, current roles, signed session ownership, active status, assurance and security version are checked against database state. A substituted audit actor reference fails the runtime negative test. Unknown permissions/auth levels and undeclared routes fail closed.
- **Lifecycle/retention:** an expired enrollment flow deletes its dependent challenges even when the last challenge has a later expiry. A maintained regression demonstrates cleanup does not fail its FK. Role requests capture target security version and reject stale/inactive elevation. Offboarding revokes targeted recovery invitations/cases.
- **Configuration/secrets:** malformed URL refinement cannot export invalid input in a raw URL exception. Runtime role checks reject migration-capable roles; worker environment withholds signer/migrator/provisioning secrets. Logs/DTOs/job bodies use explicit allowlists; provider failures are sanitized. Production API HTTPS/SMTP TLS requirements remain active.
- **Frontend state:** fresh enrollment is not reported as recovered. The separate-channel code is returned once; mocks remain excluded from non-mock builds. Later-phase functionality returns unavailable.

## Open findings / decisions

- **Availability/architecture:** ADR 0013 remains Proposed. Do not fabricate administrator verification for sole-admin recovery, clear an objection, or claim CLI labels prove different people. P-13 is procedural and requires owner definition.
- **Dependency security:** one high braces development-tooling advisory has no published fix. Full audit remains failing; no ignore/exception was introduced. Next, source-map and esbuild paths were corrected, including the old optional Next peer.
- **Release validation:** local assertions and virtual authenticators do not establish real-device independence, production provider/hosting assurance, accessibility conformance, external audit anchoring or production readiness. Coverage floors, planned CI security tooling and launch drills must be completed before release.

## Evidence

Exact D1–D9/S1–S17 map and runner evidence: [acceptance record](../phase7-acceptance.md). Application tests are in `tests/backend-acceptance/src/runtime.integration.test.ts` and `runtime-security.test.ts`; frontend adapter negatives are in `apps/web/src/lib/api/live/live-api.test.ts`. The ordinary recovery window is advanced only in the fixture, with early completion rejected before that change. The PR #7 repair commit is integrated, preserving appeal revision checks and both reversal-publication barriers.

This is the implementer's security check, not an independent Claude review or approval to merge/deploy.
