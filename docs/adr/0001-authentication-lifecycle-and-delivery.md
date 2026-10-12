# ADR 0001: Authentication lifecycle, library selection and secure delivery

| Field | Value |
|---|---|
| Status | **Accepted with amendments**, **amended by ADR 0008** (owner directions 2026-10-04; pending owner ratification). Implementation: Phase 7 (Backend Foundation), separately authorized |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Pending Claude recommendation |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §§8–10, 20, 26.3, 36; PRD AUTH-1…15/P-1; identity schema; T-01–07, T-17–18, T-21, T-24, T-44, T-46 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md), R-01–R-04, R-15 |

## Problem

Email verification can preserve an attacker-chosen credential; generic authentication is assigned to in-house code without a measured library fit analysis. Queued security mail needs usable tokens while storage rules require hashes. Staff enrollment/recovery and missing-Origin handling are incomplete.

## Evidence

ARCHITECTURE §8.3 creates credentials before mailbox verification. T-18 revokes sessions but does not invalidate that password. §20/22 email.send uses Postgres jobs with no protected token transport. §8.7 recovery is out-of-band without an independent approval protocol. §26.3 fallback contradicts THREAT-MODEL invariant 15. Better Auth has documented Fastify integration/hooks; compatibility is not established by those docs alone.

## Impact

Pre-account takeover, queue/backup credential disclosure, staff recovery bypass and conflicting CSRF behavior. Foundation identity tables and routes would encode these choices.

## Proposed solution

Choose library-first generic authentication after an exact-version fit/security matrix, with Better Auth the initial self-hosted candidate; do not implement a library until accepted. Keep access policy, wallet challenges, cooling and business audit under Blacklist control. Activate credentials only through an explicit mailbox-owner credential selection protocol; invalidate every prior authenticator/challenge/session atomically. Define protected encrypted delivery payloads with a key outside DB storage and minimal job/DLQ retention, or an equivalent reviewed protocol. Keep tokens single-use, purpose-bound and POST-only, hashes at rest, strict configured-Origin browser mutation checks and 15-character password-only minimum with breach/local blocklist and no composition/rotation. Establish staff-candidate enrollment, UV/RP/origin challenge policy, two factors where feasible, independent privileged recovery approval, session/challenge revocation and break-glass custody. Foundation must enforce staff assurance before any privilege can operate.

Data/API implications: revise activation states, auth adapter-owned tables and delivery metadata before first migrations; define public endpoint policies even behind vendor catch-all handlers. Demonstrate immediate revocation without cookie cache, staff lifetime/fresh factor policy, hashed library token storage and safe verification/reset behavior. Tests must cover attacker registration followed by victim verification, concurrent reset/login, stale purpose tokens, queue inspection, recovery escalation, staff without MFA and missing/null/foreign/sibling Origins. No table/migration/API is changed by this proposal.

## Alternatives considered

Keep in-house core only with demonstrated supported-library incompatibility, funded maintenance and dedicated review. Hosted IdP is viable with owner-approved cost/residency and specialized policies outside it. Do nothing leaves concrete lifecycle gaps. Putting raw reset URLs in job rows is rejected. Avoidance of queues by direct email needs explicit crash/issuance semantics, not an undocumented shortcut.

## Consequences

Additional lifecycle contracts and negative tests are required; this proposal reduces ambiguity rather than authorizing production work. If accepted, Claude updates ARCHITECTURE, ESSENTIALS, PRD, data model, threat model, testing/dependency policies and handoff wherever affected before the relevant implementation. No existing migration is changed; none exists. Preserve the owner's phase authorization requirement.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.** Codex's findings R-01–R-04 and R-15 are correct. My earlier in-house decision (D-008) was not backed by a library fit analysis. The evaluation below replaces it.

### Evidence gathered

- **Better Auth 1.7.6** (newest release older than the 7-day release-age window) was downloaded and its source inspected, together with `@better-auth/core` and `@better-auth/telemetry` 1.7.6. Findings, with file references:
  - Session token generated with `generateId(32)` and stored **in plain form** (`db/internal-adapter.mjs`). No hashing option.
  - Session cookie **HMAC-signed** with the server secret (`setSignedCookie` / `getSignedCookie` in `cookies/index.mjs`, `api/routes/session.mjs`).
  - Verification identifiers (reset tokens) can be stored **hashed**: `verification.storeIdentifier: "hashed"` → SHA-256 (`db/verification-token-storage.mjs`).
  - Email verification and change-email use a **stateless HS256 JWT** verified by a **GET** endpoint (`api/routes/email-verification.mjs`). Not single-use, and GET-consumed.
  - Password reset: POST request, GET callback that only redirects, POST redemption. Dummy lookup for unknown emails. `revokeSessionsOnPasswordReset` option (`api/routes/password.mjs`).
  - Sign-in hashes a dummy password for unknown users and returns one generic error (`api/routes/sign-in.mjs`).
  - Custom `password.hash/verify`. `min/maxPasswordLength` count UTF-16 units; no normalization (`context/create-context.mjs`, `utils/password.mjs`).
  - Cookie names get a `__Secure-` prefix automatically; custom names and attributes are possible (`cookies/index.mjs`). An exact `__Host-` cookie needs proof (spike S2).
  - Origin middleware includes a `Sec-Fetch-Site` fallback (`api/middlewares/origin-check.mjs`).
  - Server-side `auth.api.*` calls with `returnHeaders` (`api/dispatch.mjs`), so the HTTP router need not be mounted. Hooks, session `expiresIn`/`updateAge`/`cookieCache` controls, revocation APIs and `disableSignUp` are present.
  - Telemetry **off by default** (`telemetry/dist/index.mjs`: enabled only by option or `BETTER_AUTH_TELEMETRY`).
  - The passkey plugin is a separate package (`@better-auth/passkey`). The main package depends on all database adapters (Mongo, Prisma, …), which enlarges the supply-chain surface.
- **Advisory history (OSV, queried 2026-10-04):**

  | Package | Advisories | Notes |
  |---|---|---|
  | better-auth | 22 (Dec 2024 – Jul 2026): 2 Critical, 13 High | Most are in OAuth/OIDC/MCP/organization/API-key/device plugins Blacklist will not enable. Relevant to our configuration: the cookie-cache 2FA bypass (GHSA-xg6x-h9c9-2m83 → cookie cache disabled), `disabledPaths` normalization bypass (GHSA-x732-6j76-qmhm → router not mounted), `trustedOrigins` bypass (GHSA-vp58-j275-797x → Blacklist exact-Origin check), IPv6 rate-limit bypass (GHSA-p6v2-xcpg-h6xw → library limiter disabled), pre-account hijacking on magic link/OTP (GHSA-qq9h-g4jm-xgf3 → those flows unused; registration is Blacklist-owned), verify-email open redirect (flow unused) |
  | @simplewebauthn/server | 1 Low | |
  | @node-rs/argon2 | 0 | |
  | next-auth | 14 (3 Critical) | |
  | @auth/core | 3 (1 Critical) | |
  | ory/kratos | 4 (1 High) | |

  Advisory counts measure disclosed issues, not quality. Better Auth's frequent, public advisories show an active security process and a large surface. The conclusion is to enable as little of it as possible.

### Comparison

| Criterion | Better Auth (headless, no plugins) | Custom from vetted primitives | Ory Kratos (self-hosted service) | Hosted IdP (Auth0/Clerk class) | Auth.js |
|---|---|---|---|---|---|
| Maintenance | Very active TS project; we track releases | We maintain everything | Active (Ory), Go service | Vendor | Active, OAuth-centric |
| Security history | 22 advisories, mostly in surfaces we disable | None, but no external scrutiny either | 4 | Vendor-managed | 14 + 3 |
| DB sessions + immediate revocation | Yes (cookie cache off) | Yes | Yes (own store) | Yes | DB or JWT |
| Session token at rest | Plain token + HMAC-signed cookie → exception E-1 | Hashed | Not evaluated at this depth | Vendor | Plain/JWT |
| Fastify integration | Server `auth.api` calls; router optional | Native | HTTP to a separate service | SDK/HTTP | Not first-class |
| Password hashing (Argon2id) | Custom hash/verify hooks | Yes | Configurable | Vendor | You implement |
| Reset tokens | Hashed storage, POST redemption, revoke-on-reset | Design | Built-in flows | Built-in | You implement |
| Email verification | GET JWT, unsuitable → Blacklist-owned | Design | Built-in flows (R-01 semantics would need evaluation) | Built-in | Limited |
| Staff MFA / passkeys | Plugins exist; staff assurance semantics not provided → Blacklist WebAuthn | SimpleWebAuthn | Strong (WebAuthn, AAL2) | Strong | Weak |
| CSRF / Origin | Has a fallback we reject → Blacklist check first | Design | Own CSRF tokens | N/A | Own CSRF |
| Extensibility / audit | Hooks, additional fields, readable source | Full | Webhooks | Vendor logs | Callbacks |
| Lock-in | Moderate (tables migrated as our SQL) | None | Moderate–high | High | Moderate |
| Wallet proofs kept separate | Yes | Yes | Yes | Yes | Yes |
| Extra operations | None (a library) | None | Extra service, config and DB | Paid, external data residency | None |

### Conclusion

Better Auth fits as a **headless credential and session engine**, provided:

1. its router and all plugins are disabled;
2. sign-up, email verification and email change are replaced by Blacklist flows (they conflict with R-01 and the POST-only rule);
3. Blacklist enforces Origin, throttling, session policy, staff assurance, cooling periods and audit around it;
4. the owner accepts exception **E-1** (plain session token at rest, compensated by HMAC-signed cookies and a secret held outside the database).

That is still meaningful value: credential storage, sign-in with timing equalization, session lifecycle and revocation, and reset-token handling, from a library under public scrutiny. Kratos is the strongest alternative if the owner prefers a separate identity service. Custom is now the **fallback**, used only if the Phase 1 spike proves a required property cannot be met.

## Amended decision

1. **Library-first:** Better Auth (exact version pinned at Phase 1 after the release-age check; 1.7.6 today) as a headless library, configured per [docs/design/identity.md §14](../design/identity.md#14-better-auth-configuration-and-backend-acceptance-checks). This supersedes D-008's "in-house" wording.
2. **Blacklist-owned:** registration (email-first activation), email change, staff WebAuthn assurance and step-up, throttling, cooling periods, session policy, exact-Origin enforcement, audit, wallet proofs ([identity §1](../design/identity.md#1-responsibility-split)).
3. **R-01:** email-first activation. No credential exists until the mailbox-token holder chooses the password in the same request; the request path never checks account existence (uniform timing) ([identity §4](../design/identity.md#4-registration--email-first-activation-resolves-r-01)).
4. **R-03 (amended from Codex's encrypted-payload option):** tokens are generated by the worker at send time; jobs carry identifiers only; each retry re-issues; at most one valid token per entity ([identity §8](../design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01)). No encryption keys or decryptable token stores are needed.
5. **R-04:** dedicated invitation-created staff accounts; enrollment needs the emailed token **plus** an out-of-band enrollment code (split secret, added in Claude's round-2 adversarial review, so a compromised mailbox cannot enroll attacker authenticators); ≥ 2 WebAuthn authenticators with UV; action-bound step-up; two-person privilege increases; two-person recovery with a 24-hour objection window; CLI bootstrap that never prints invitation tokens; break-glass behind two independent controls; no standing super-admin credential ([identity §10](../design/identity.md#10-staff-account-lifecycle-resolves-r-04)).
6. **R-15:** one exact-Origin policy; missing, `null` or foreign Origin rejected; no fallbacks ([identity §11](../design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15)).
7. **Passwords (owner decision):** minimum 15 code points, maximum 128 code points / 512 bytes, NFKC, never truncated, breach check with local fallback, no composition rules or expiry ([identity §3](../design/identity.md#3-password-policy)).
8. **Gate:** identity migrations do not merge until spike criteria S1–S15 pass with recorded evidence. A failed criterion → ADR, no fork.
9. **Exception E-1** requires explicit owner acceptance before Phase 1 identity work. If rejected → ADR for a Blacklist-owned session layer.

Phase gate: Phase 1 (Foundation). Affected documents updated 2026-10-04: ARCHITECTURE §8–§9, §26; ESSENTIALS §4–§5; PRD §5.1–§5.2; THREAT-MODEL T-01–T-07, T-17–T-18, T-24, T-46 and invariants; data model §3; testing strategy §4; dependency policy.

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (review-response instructions §3–§4, §12–§15): library-first authentication with Better Auth as the leading candidate, Blacklist-owned security policy, a 15-character minimum for password-only accounts, and a safe activation protocol for R-01. Still required from the owner: ratification of the amended text above and acceptance or rejection of **exception E-1**. Phase 1 is not authorized by this record.


## Addendum — 2026-10-04 (ADR 0008 and owner E-1 decision)

History above is preserved. These points supersede the corresponding parts of the amended decision:

- **Exception E-1: ACCEPTED WITH MITIGATION** (owner, 2026-10-04). Better Auth's unhashed session-token storage may be used **only** under the headless configuration, with mandatory mitigations **M1–M10** ([identity §5.5](../design/identity.md#55-session-token-storage--exception-e-1-accepted-with-mitigation-owner-2026-10-04)):
  - the bearer, JWT and session-conversion plugins are forbidden;
  - no mounted generic routes;
  - no authentication from client-supplied raw tokens, and no wrappers converting stored tokens into browser authentication;
  - the secret stays outside the database **and database backups**, with explicit secret-management boundaries;
  - no token-bearing fields in DTOs;
  - immediate revocation;
  - mandatory regression tests: expired, forged, unsigned, wrong-secret, revoked and raw-stored tokens all fail;
  - rehearsed rotation.

  A combined database + signing-secret compromise is documented as **account-session compromise**. **No fork.** E-1 must be re-evaluated before any Better Auth upgrade.
- **Password reset is no longer delegated to Better Auth** (supersedes amended-decision items 2 and 4 where they referred to Better Auth reset issuance and `sendResetPassword`). The 1.7.6 helper swallows callback send errors, and reset completion is several separate writes. Reset tokens, delivery outcomes and the atomic reset transaction are Blacklist-owned (identity §6, §8).
- **Acceptance checks** are now S1–S17 (S3, S5, S13 and S14 redefined; S16 reset atomicity and S17 E-1 regression added) and run in **Phase 7** (frontend-first plan).
