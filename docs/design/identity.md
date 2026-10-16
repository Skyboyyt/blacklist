# Identity, Authentication and Staff Security — Design

| Field | Value |
|---|---|
| Status | **Normative design, Phase 0 (revision 3, 2026-10-04).** Implementation belongs to Phase 7 (Backend Foundation) and requires separate authorization. Frontend phases use mocks of these contracts only |
| Owner | Claude (primary engineer) |
| Decision records | [ADR 0001](../adr/0001-authentication-lifecycle-and-delivery.md) (auth library, R-01–R-04, R-15, E-1), [ADR 0007](../adr/0007-toolchain-and-foundation-acceptance.md) (acceptance checks), [ADR 0008](../adr/0008-revision-2-ratification-corrections.md) (reset delivery and atomicity, frontend-first) |
| Summarized in | [ARCHITECTURE.md §8–§9](../../ARCHITECTURE.md#8-authentication-and-account-security), [ARCHITECTURE-ESSENTIALS.md §4–§5](../../ARCHITECTURE-ESSENTIALS.md) |
| Threats | T-01–T-07, T-17–T-18, T-21–T-22, T-24, T-44, T-46 |

This document is the **single normative source** for account, session, password, security-email, staff-lifecycle and request-origin rules. Other documents summarize it and link here instead of restating the rules differently.

Owner update2026-10-13: [ADR0016](../adr/0016-owner-password-minimum-and-canonical-foundation-url.md) supersedes the old15character minimum with8; the other credential/token/session/staff safeguards remain. [ADR0017](../adr/0017-request-triggered-free-mail-worker-wake.md) authorizes one bounded asynchronous health wake after accepted registration/reset requests, never mail/token issuance in the API. Claude independent review pending.

Owner decisions 2026-10-16: ADR0016 amended (staff minimum 8, member minimum 12; §3), [ADR0019](../adr/0019-invite-only-member-registration-in-staging.md) invite-only member registration (§4.3 rule 3a), [ADR0013](../adr/0013-small-team-recovery-and-objection-resolution.md) objection model accepted (§10.11). P-13 (the named operator) is still open, so the operator recovery branch stays unavailable.

**Revision 3** (Codex re-review V2-01, V2-02, owner E-1 decision):

- Password-reset tokens and their delivery are now **Blacklist-owned**. Better Auth 1.7.6 swallows reset-email callback errors, and its reset completion is not one transaction.
- Reset completion is **one database transaction**.
- A per-account **security version** closes session and race windows.
- E-1 is **accepted with mandatory mitigations**.
- Staff device and break-glass assurance wording is corrected.

---

## 1. Responsibility split

Blacklist uses **Better Auth** as a **headless library** for generic credential and session primitives. The exact version is pinned when backend implementation is authorized; 1.7.6 is the current candidate under the 7-day release-age rule. Blacklist's own `identity` and `access` domain modules own every security policy.

| Concern | Owner | Notes |
|---|---|---|
| Password credential storage | Better Auth `account` model (`auth_accounts`) | Hash/verify functions supplied by Blacklist (Argon2id). Blacklist's reset and change transactions write the same PHC format (§6, §9) |
| Email + password sign-in | Better Auth `auth.api.signInEmail` | Called server-side from Blacklist's route. Generic error and dummy-hash timing equalization confirmed in the 1.7.6 source |
| Session issuance, lookup, revocation | Better Auth (database sessions, cookie cache **disabled**) | Cookie value is HMAC-signed with `BETTER_AUTH_SECRET` (E-1, §5.5) |
| Session policy (lifetimes, account state, security version, staff assurance) | Blacklist API session plugin | Evaluated on **every** request after Better Auth's lookup |
| **Password-reset tokens: issuance, delivery, redemption** | **Blacklist** (§6, §8) | Better Auth's `requestPasswordReset`/`resetPassword` are **not used**. Its helper swallows callback send errors, and its completion is several separate writes |
| Registration (mailbox proof + credential creation) | **Blacklist** (§4) | Better Auth sign-up disabled (`disableSignUp: true`) |
| Email verification | **Blacklist**, part of registration | Better Auth `/verify-email` unused (GET-consumed stateless JWT) |
| Email change | **Blacklist** (§7) | Better Auth change-email unused (GET-consumed) |
| Security-email delivery and outcome tracking | **Blacklist** delivery layer (§8) | One mechanism for every bearer-token email |
| Staff WebAuthn (enrollment, assurance, step-up) | **Blacklist** with `@simplewebauthn/server` | Not Better Auth's passkey plugin |
| Throttling, human verification | **Blacklist** (durable, PostgreSQL) | Better Auth's rate limiter disabled (GHSA-p6v2-xcpg-h6xw) |
| Re-authentication, cooling periods, security version | **Blacklist** | |
| Origin/CSRF enforcement | **Blacklist** (§11) | Better Auth `trustedOrigins` only as defense in depth |
| Audit | **Blacklist** `audit` module | |
| Wallet ownership proofs | **Blacklist** ([moderation §6](moderation.md#6-standing)) | Better Auth SIWE plugin unused |
| Better Auth HTTP router | **Not mounted** | No catch-all surface (cf. GHSA-x732-6j76-qmhm) |
| Better Auth plugins | **None** | Explicitly forbidden: **bearer**, JWT, any session-conversion plugin, social, magic link, email OTP, admin, organization, API key, OIDC, SIWE, two-factor, passkey |

---

## 2. Accounts

- An account exists **only** after a mailbox owner completes registration (§4). There is no "unverified account" state.
- Kinds:
  - `member`: an ordinary account, created by registration;
  - `staff`: a dedicated account, created only by staff invitation (§10). A member account can never receive a staff role.
- Status: `active` → `suspended` ↔ `active` → `deactivated` (30-day restore window, then purge/anonymization per retention policy).
- **Security version:** `account_security_state.security_version`, an integer incremented by **every security transition**: password reset, password change, email change, suspension, restoration, staff recovery, role change. Outstanding tokens and sessions created under an older version are invalid (§5.4, §6, §7).
- **Per-account security lock:** every security transition locks the account's `account_security_state` row (`SELECT … FOR UPDATE`). Transitions on one account are therefore serialized; transitions on different accounts proceed independently.
- Staff-only flags: `staff_recovery_pending`, `staff_authenticator_deficit_since`.
- Account email is unique, normalized (trimmed, lowercased; no provider-specific dot or plus folding).

---

## 3. Password policy

| Rule | Value |
|---|---|
| Normalization | Unicode **NFKC** before length checks, breach checks, hashing and every verification |
| Minimum length | After normalization: **12 code points for members** and **8 for staff** (staff passwords are one factor beside two WebAuthn authenticators; ADR0016, amended 2026-10-16). Applied when a password is set (registration, member change, reset by account kind). Existing shorter member passwords keep working until their next change or reset |
| Maximum length | **128 code points and 512 UTF-8 bytes** after normalization. Longer input is **rejected with an explicit error, never truncated** |
| Allowed characters | All printable Unicode including spaces (passphrases); control characters rejected |
| Composition rules | None |
| Expiry | None. A change is forced only on evidence of compromise |
| Breach check | HIBP Pwned Passwords range API (k-anonymity) at registration, reset and change. If it is unavailable, a **bundled local blocklist** (common passwords plus context terms). Never unconditional acceptance |
| Paste, autofill, password managers | Supported (`autocomplete="new-password"` / `"current-password"`, paste never blocked, show/hide toggle) |
| Hashing | Argon2id (`@node-rs/argon2`), PHC string, OWASP baseline `m=19 MiB, t=2, p=1` raised while p95 ≤ ~250 ms; bounded hashing concurrency; rehash on login when parameters are outdated. No input truncation; the 512-byte cap bounds cost |

Better Auth is configured with `minPasswordLength: 8` (the lower bound; the identity domain enforces the per-kind minimum) and `maxPasswordLength: 512` (UTF-16 units). Blacklist's stricter code-point/byte validation always runs first.

---

## 4. Registration — email-first activation (resolves R-01)

### 4.1 Principle

**Proving mailbox ownership and choosing the password happen in the same request, by the holder of the mailbox token.** Nothing created before that request can authenticate.

### 4.2 State machine

```
POST /auth/register/start {email}
        ▼
  ┌───────────┐  worker: token generated, delivery     ┌──────────────────┐ provider accepted ┌────────┐
  │ requested │ ─────────────────────────────────────► │ pending_delivery │ ────────────────► │ issued │
  └─────┬─────┘                                        └────────┬─────────┘                   └───┬────┘
        │ newer start / existing account (worker)               │ delivery not confirmed           │ 30 min after issuance
        ▼                                                       ▼ (token invalidated; retry)       ▼
  ┌────────────┐                                         back to requested                   ┌─────────┐
  │ superseded │                                                                              │ expired │
  └────────────┘                                                                              └─────────┘
                POST /auth/register/complete {token, handle, password}   (state issued, unexpired, hash matches)
                        ▼
                  ┌───────────┐
                  │ completed │ ──► account active (email verified), session issued
                  └───────────┘
```

### 4.3 Rules

1. `POST /auth/register/start {email}` **never** creates a user, credential, session, MFA factor, wallet proof, or anything that can authenticate. It creates a `registration_intents` row (`requested`) and enqueues `identity.registration.issue {intentId}`.
2. **Identical request path.** The API **does not check whether an account exists**. It always does the same work (supersede older open intents, insert one intent, enqueue one job) and returns `202 {"status":"check_email"}` with the same headers.
3. **The worker decides.** If an account (any status) exists, the worker closes the intent (`superseded`, reason `existing_account`) and sends an **existing-account notice** (≤ 1 per address per 24 h; static links to sign in and reset; **no token**).
3a. **Invite-only gate (ADR0019).** While `REGISTRATION_MODE=invite` (the default when `NODE_ENV=production`), the worker issues an enrollment link only if the email's SHA-256 digest is in `REGISTRATION_INVITE_EMAILS_SHA256`. Otherwise it closes the intent (`superseded`, reason `not_invited`) and sends nothing. The HTTP answer is unchanged, and `register/complete` re-checks the list (removing an email also stops links already sent).
4. Only the newest intent per email can be completed (partial unique index on open states).
5. Limits: ≤ 5 intents per email per 24 h; per-IP-prefix limits; human-verification escalation (§12).
6. Token: 32 CSPRNG bytes, generated by the worker at send time and handled by the delivery protocol (§8). Stored only as SHA-256. Valid **30 minutes from issuance**. Single use. Redeemable only in state `issued` (delivery accepted).
7. Link: `https://<APP_ORIGIN>/register/complete#token=<token>` (fragment). A GET renders the form and consumes nothing. Page script reads the fragment, replaces history and submits by POST.
8. `POST /auth/register/complete {token, handle, password}`:
   1. Exact-Origin check (§11), throttling, validation, password policy and breach check **before** the transaction.
   2. **One database transaction:**
      - lock the intent by `token_hash` and require `issued` and unexpired;
      - require that no account exists for the email (unique constraint as final guard);
      - create the Better Auth user (`emailVerified = true`) and credential with the Argon2id hash of the password **submitted in this request**, plus the Blacklist profile and `account_security_state` (security version 1);
      - set the intent `completed` and other open intents `superseded`;
      - write audit `account.registered`.
   3. After commit: create a session and set the cookie.
   4. Any failure → rollback → generic `400 registration_link_invalid`.
9. **Atomicity gate:** Better Auth's user/account writes must run inside the same transaction (acceptance check S6). If that cannot be proven, the intent moves to `completing` under lock, the unique email constraint guards duplicates, and reconciliation finishes or reopens it. Identity migrations do not merge until S6 passes.

### 4.4 Race conditions and edge cases

| Situation | Behaviour |
|---|---|
| Same link submitted twice | Row lock + state check: one commits; the other gets the generic error |
| Attacker starts with the victim's email | The attacker never receives the token; nothing they did can authenticate |
| Attacker and victim both start | The newer intent supersedes the older; only the mailbox owner can complete |
| Worker processes a superseded or expired intent | Re-checks under lock and skips |
| Start while another intent is completing | Completion wins; the later intent's worker sees an existing account and sends a notice |
| Deactivated account | Treated as existing (notice offering support-assisted restore) |
| Typo'd email | The typo mailbox's owner may complete an account bound to their own mailbox; the originator has none |
| Re-registration after purge | Email is free after the restore window and purge |

### 4.5 Why R-01 is impossible

The only path that creates a credential is §4.3 step 8. It requires the raw token, which exists only in the mailbox owner's email and transiently in worker memory.

---

## 5. Sign-in and sessions

### 5.1 Sign-in

`POST /api/v1/auth/login {email, password}` → exact Origin → durable throttle (§12) → human verification if required → NFKC → `auth.api.signInEmail({ body, headers, returnHeaders: true })` → Blacklist post-checks inside one transaction:

- Lock `account_security_state` (shared lock is sufficient) and read `security_version`.
- Create `session_policy_state {session_id, account_kind, security_version}`.
- Account `suspended`/`deactivated` → delete the just-created session and return a generic account-state error.
- `staff` account → assurance `pending_webauthn`. The session can call only the staff WebAuthn assertion endpoints and logout, and is revoked if not completed within **5 minutes**.
- Rehash if Argon2id parameters are outdated (S7).

**The response DTO is allowlisted.** Better Auth's sign-in body includes the session `token`; Blacklist **never** forwards it. Only the `Set-Cookie` header carrying the signed cookie reaches the browser (E-1 mitigation M6).

### 5.2 Cookie

`__Host-bl_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`. The value is Better Auth's HMAC-signed session token. Better Auth adds a `__Secure-` prefix by default, so an exact `__Host-` cookie must be **proven in S2**. If it can't be, stop and decide by ADR; never silently accept `__Secure-`.

### 5.3 Lifetimes (enforced by Blacklist on every request)

| Account | Idle timeout | Absolute lifetime |
|---|---|---|
| Member | 7 days | 30 days |
| Staff | 30 minutes | 12 hours |
| Staff session awaiting WebAuthn | — | 5 minutes |

Better Auth: `expiresIn: 30d`, `updateAge: 1d`, `cookieCache.enabled: false`. Blacklist tracks creation and activity in `session_policy_state` and revokes sessions beyond their account kind's limits.

### 5.4 Session validity (every request)

A request is authenticated only if **all** hold:

1. Better Auth's `getSession` found a valid HMAC-signed cookie and an unexpired, unrevoked database session.
2. A `session_policy_state` row exists for it. **Sessions without one are rejected**, so a session created by any unexpected path cannot be used.
3. `session_policy_state.security_version == account_security_state.security_version`. A session created before a reset, password change, email change, suspension or recovery fails **even if its row survived** (closes the sign-in-during-reset race, §6.5).
4. Account `active`; idle and absolute limits respected; staff assurance where required.

**Revocation:** logout (`POST /auth/logout` → `auth.api.signOut` + cookie cleared; no GET logout), revoke one, others or all, suspension, role change, recovery, offboarding. Deleting the session rows plus the security-version check makes revocation **immediate**, with no cookie cache (avoids GHSA-xg6x-h9c9-2m83).

### 5.5 Session-token storage — exception E-1 (ACCEPTED WITH MITIGATION, owner 2026-10-04)

**Fact:** Better Auth 1.7.6 stores the session token in plain form (`internal-adapter.mjs`: `token: generateId(32)`) with no hashing option. Hashing the column would break its lookup and revocation model. **No fork.**

**Why it is acceptable:** Better Auth obtains the token only through `getSignedCookie`, which verifies HMAC-SHA-256 with `BETTER_AUTH_SECRET` before any database lookup (Codex re-review: source analysis plus a synthetic better-call 1.4.0 primitive test). A bare stored token, a fabricated signature, or a signature under another secret cannot authenticate on the specified surface.

**Mandatory mitigations (security invariants; THREAT-MODEL invariant 4):**

| # | Mitigation |
|---|---|
| M1 | The Better Auth **bearer plugin is forbidden**, as are JWT and any plugin or helper that converts raw tokens into sessions or cookies. The bearer plugin's default mode turns a raw `Authorization` token into a signed cookie, which would destroy the E-1 argument |
| M2 | Better Auth's generic HTTP routes are **never mounted**. Only Blacklist routes calling approved `auth.api.*` functions exist |
| M3 | Requests are **never** authenticated from a client-supplied raw session token (header, body, query or unsigned cookie). Authentication goes through Better Auth's signed-cookie `getSession` only |
| M4 | No Blacklist code may turn a stored or raw session token into browser authentication: no internal-adapter lookups keyed by client input, no cookie re-signing, no cookie-parsing helper used as authentication |
| M5 | `BETTER_AUTH_SECRET` lives only in the platform secret store, outside the application database **and outside database backups**, never in logs, error reports or `NEXT_PUBLIC_*`. Operators with database or backup access do not automatically receive it (separate secret-store permissions) |
| M6 | Token-bearing Better Auth response fields (e.g. `token`, raw session objects) are **never** placed in any DTO. Responses are allowlisted |
| M7 | Revocation is immediate (cookie cache off; database lookup on every request; security-version check) |
| M8 | Regression tests on every Better Auth upgrade (testing-strategy §4.3, acceptance check S17). Each of these **must fail authentication**: expired session, revoked session, forged signature, unsigned value, wrong-secret signature, raw stored token presented as a cookie, raw token as `Authorization: Bearer`, raw token in body or query. A legitimate signed cookie must succeed |
| M9 | **Emergency rotation:** rotating `BETTER_AUTH_SECRET` plus revoke-all is a documented, rehearsed procedure (tested with the selected configuration before launch) |
| M10 | **Re-evaluate before any Better Auth upgrade.** If the session, cookie or token model changes, E-1 must be re-reviewed before upgrading |

**Residual risk, stated plainly:** a compromise of **both** the database (or a backup) **and** `BETTER_AUTH_SECRET` is an **account-session compromise**: the attacker can forge cookies for every unexpired session. Response: rotate the secret, revoke all sessions, bump all security versions, and run incident response. Separately, a stolen valid browser cookie is replayable until revoked or expired; hashing would not change that.

### 5.6 Session fixation and theft

New session at sign-in; staff assurance bound to session ID; security-version bump on sensitive transitions; `__Host-` blocks subdomain-planted cookies; strict CSP limits XSS session riding.

---

## 6. Password reset (Blacklist-owned tokens; resolves V2-01, V2-02)

### 6.1 Request

`POST /api/v1/auth/password/forgot {email}` → exact Origin, throttle per email hash and IP prefix, human-verification escalation → insert `password_reset_requests {email, requested_at}` and enqueue `identity.password_reset.issue {requestId}` (identifiers only) → **always** `202`. No account lookup happens in the request path.

### 6.2 Issuance (worker)

Reset tokens are rows in `identity_tokens` with `purpose = 'password_reset'`. **At most one** row per account may be in `pending_delivery` or `active` (partial unique index). Issuance follows the generic delivery protocol (§8) with these reset-specific checks inside its locked transaction:

- Resolve the account from the request email. If none, not `active`, or the request is older than 15 minutes, finish silently.
- Limit: ≤ 3 issuances per account per hour.
- Record the account's current `security_version` on the token. Redemption requires it to still be current.
- Staff accounts are handled the same way; redemption additionally requires WebAuthn (§6.3).

### 6.3 Redemption: one atomic security transition

Link: `/reset-password#token=…` (fragment). GET renders the form only.

`POST /api/v1/auth/password/reset {token, newPassword, webauthn?}`:

**Before the transaction** (no locks held):

- exact Origin, throttle;
- password policy and breach check;
- compute the new Argon2id hash;
- staff accounts: verify the WebAuthn assertion. Its challenge, from `POST /auth/password/reset/challenge {token}`, is bound to the token's account and purpose `reset`.

**One database transaction** (all-or-nothing):

1. Lock the token: `identity_tokens WHERE token_hash = $h AND purpose = 'password_reset' FOR UPDATE`. Require `active`, unexpired, generation = the account's latest reset generation.
2. Lock the account: `account_security_state FOR UPDATE`. Require account `active` and `security_version == token.security_version`.
3. Staff: consume the WebAuthn challenge (single use; must be unconsumed and unexpired).
4. Replace the credential: update `auth_accounts.password` (credential provider row) with the new PHC hash.
5. Consume the token (`consumed`) and invalidate every other open token of the account (`password_reset`, `email_change`).
6. **Revoke all sessions:** delete the account's `auth_sessions`, `session_policy_state` and `staff_session_assurance` rows.
7. **Begin cooling:** `sensitive_actions_locked_until = now() + 72h`; `password_changed_at = now()`; **`security_version = security_version + 1`**.
8. Audit: append `account.password_reset` through the audit append function (same transaction).
9. Enqueue `identity.security_notice {accountId, kind: password_reset}` (pg-boss transactional enqueue, D6).

Commit, then return a generic success. The user signs in fresh.

| Failure | Result |
|---|---|
| Any step fails or the process crashes before commit | Full rollback. Credential, sessions, cooling, audit and notice are all unchanged. The token stays `active` until expiry and the user can retry |
| Crash after commit, before the response | Everything is committed. Re-submitting finds the token `consumed` → generic "link invalid"; the user signs in with the new password |
| Notice delivery fails later | The transition stands; the notice job retries per §8 (notices carry no token) |

There is **no state** in which the password changed but old sessions remain valid, or cooling is missing. Even if a session row survived, its stale `security_version` makes it unusable (§5.4).

**Acceptance gate S16:** Blacklist's reset transaction writes Better Auth tables (credential, sessions) inside a Blacklist transaction. After commit, Better Auth sign-in accepts the new password and rejects the old, and old cookies fail. Crash injection after every step leaves either the complete prior state or the complete new state. If Better Auth's schema or credential format makes this unworkable, stop and propose an ADR.

### 6.4 Password change (signed-in)

The same transaction shape: current password verified first; new hash computed first; then one transaction locking the account that replaces the credential, revokes **other** sessions (the current session gets a new `security_version` stamp in the same transaction), increments `security_version`, audits and enqueues a notice. No cooling period (the user proved the current password).

### 6.5 Concurrency (serialized per account)

| Race | Prevention |
|---|---|
| Two reset links redeemed concurrently | Only one token can be `active` per account; redemption locks the token and the account |
| Older reset overtaking a newer one | Issuing a new token invalidates the old one under the account lock; redemption checks the latest generation |
| Multiple workers issuing simultaneously | Issuance locks the account row; partial unique index on open tokens; generation check before activation (§8) |
| Reset vs email-change confirm | Both lock `account_security_state` and check and bump `security_version`; the loser fails its version check |
| Reset vs admin recovery or suspension | Same lock and version; recovery and suspension bump the version, invalidating outstanding tokens |
| Sign-in racing a reset | A session created with the old version is rejected by §5.4 rule 3 after the reset commits |

---

## 7. Email change (Blacklist-owned; uniform work)

1. Requirements: active session, re-authentication within 10 minutes (staff: action-bound WebAuthn), no active cooling period.
2. `POST /api/v1/me/email-change {newEmail}` → **always** inserts an `email_change_requests` row and enqueues `identity.email_change.issue {requestId}`, then returns `202`. **The API does not check whether `newEmail` belongs to an account.**
3. Worker (under the account lock): if `newEmail` belongs to any account, send that address a static notice (no token) and close the request. Otherwise issue an `identity_tokens` row (`email_change`, target email, account `security_version`) via §8. Link `/email-change/confirm#token=…`, TTL **1 hour**.
4. `POST /api/v1/me/email-change/confirm {token}` (exact Origin). **One transaction:**
   - lock the token, then the account;
   - require `active`, unexpired, version match, target email still free;
   - update the email (unique constraint guard);
   - consume the token and invalidate other open tokens;
   - revoke other sessions and bump `security_version` (current session restamped);
   - audit; enqueue notices to the **old** address (static, support instructions, no revert link) and the new one.
5. Enumeration resistance is a mandatory test (testing-strategy §4.3).

---

## 8. Security-email delivery protocol (resolves R-03, V2-01)

### 8.1 Principle

**Bearer tokens are generated by the worker immediately before sending, exist in plaintext only in worker memory and the sent email, and are redeemable only after the email provider has accepted the message.** Job payloads, job tables, dead-letter queues, logs and backups never contain a usable token or link.

This applies to every bearer-token email: registration, password reset, email change, staff invitation and re-enrollment. Notices without tokens use the same delivery layer without the token steps.

### 8.2 Delivery layer

`SecurityMailer.send(message, {timeoutMs: 20000}) → DeliveryOutcome` is a Blacklist-owned port with an SMTP or provider-API adapter. It returns **exactly one** of:

| Outcome | Meaning | Examples |
|---|---|---|
| `accepted_for_delivery` | The provider has **accepted responsibility** for the message (SMTP `250` after `DATA`, or API 2xx with a message ID). The provider message ID is recorded. This is acceptance, not proof of inbox delivery | — |
| `retryable_failure` | Not accepted; retry may succeed | Connection error, TLS failure, SMTP 4xx, API 429/5xx, **timeout** (acceptance unknown, treated as not accepted) |
| `permanent_failure` | Not accepted; retry won't help | SMTP 5xx for the recipient or message, API 4xx (invalid address, suppressed recipient) |

- The adapter **never throws** into library code and **never** includes message bodies, URLs or tokens in errors. Errors are mapped to a sanitized code (e.g. `smtp_4xx`, `timeout`) plus the provider status.
- "A callback returned" is never treated as delivery. Only `accepted_for_delivery` is.
- Better Auth callbacks are **not** used for security email.

### 8.3 Issuance algorithm (all token kinds)

```
Job {kind, entityId} (identifiers only); singleton key per (kind, account or entity)

TX-A  (lock entity row, then account_security_state row)
  1. Eligibility: entity open, not superseded/completed/expired; account state OK; job age ≤ 15 min.
  2. Invalidate any previous open token for this entity/account+purpose (state → invalidated).
  3. Generate 32 CSPRNG bytes; insert token row: hash, generation = previous + 1, state pending_delivery,
     security_version, expires_at = now + TTL.
COMMIT
4. Compose the static template with the plaintext link (memory only).
5. outcome = SecurityMailer.send(...)        -- no DB lock held
TX-B  (lock token row)
  6. If the token is no longer the latest generation in pending_delivery (superseded meanwhile):
     leave it invalidated; record outcome; stop.
  7. accepted_for_delivery → state active (redeemable); record provider message ID and timestamp.
     retryable_failure     → state invalidated (reason delivery_retryable); record outcome.
     permanent_failure     → state invalidated (reason delivery_permanent); record outcome; security event.
COMMIT
8. Drop the plaintext token from memory.
9. retryable_failure → throw a sanitized RetryableDeliveryError (pg-boss retry, backoff).
   permanent_failure → complete the job with outcome recorded (no retry).
```

**Redemption accepts only `active` tokens** whose generation is the latest for that entity and whose `security_version` is current.

### 8.4 Failure handling

| Event | Behaviour | Valid links afterwards |
|---|---|---|
| Crash before TX-A commits | Nothing persisted; job retried | None (until retry) |
| Crash after TX-A, before or during send | Token stays `pending_delivery`, never redeemable; job retried → TX-A invalidates it and issues a new generation | At most the new one |
| Provider accepted, crash before TX-B | Token stays `pending_delivery` (not redeemable); retry invalidates it and sends a new email. The user may receive a dead link first, then a working one | At most one |
| Timeout | `retryable_failure`: invalidated, retried | At most one |
| Duplicate jobs | Singleton key, account lock, generation check: only the latest generation can become `active` | At most one |
| Delayed job (> 15 min) | Dropped; the user requests again | Unchanged |
| Retries exhausted (5 attempts within 15 min) | Job to DLQ (identifiers only); any `pending_delivery` token invalidated by `identity.cleanup` | None |
| Provider retries or out-of-order delivery | Older emails arrive with dead links; the UI says "use the newest email or request a new link" | Latest only |

Delivery is **at-least-once**, never exactly-once. **At most one token per entity (per account for resets) is redeemable at any time.**

### 8.5 Other rules

- **Expiry** is measured from issuance.
- **Logging:** `{jobId, kind, entityId, generation, outcome}` only; SMTP debug off.
- **Backups** contain only hashes and metadata.
- **Fragments** avoid HTTP and `Referer` leakage but not mailbox-provider, extension or local-history exposure. Pages replace history immediately, keep the token in memory, load no third-party resources and apply `no-referrer`. The same link works on another device until used; only one redemption succeeds.
- **Provider criteria (O-7):** TLS, minimal retention, no link rewriting or click tracking on security emails, explicit acceptance responses.

---

## 9. Re-authentication and cooling periods

| Mechanism | Rule |
|---|---|
| Member re-authentication | Password re-entry via `POST /auth/reauth`, valid **10 minutes** for that session. Required for email change, password change, revoke-all sessions, account deactivation |
| Staff step-up | Action-bound WebAuthn (§10.7) |
| Cooling period | **72 hours**, set **inside** the reset transaction (§6.3). Blocks email change in V1; post-V1 also MFA removal, wallet links and API keys |

---

## 10. Staff account lifecycle (resolves R-04)

### 10.1 Principles

1. **Dedicated staff accounts**, created only through invitation.
2. Roles: `moderator`, `admin`, `appeal_reviewer` (appeal-only; may be an approved external person).
3. **WebAuthn with user verification is mandatory.** Staff permissions only in WebAuthn-assured sessions.
4. **At least two enrolled authenticators** per staff account before staff permissions activate.
   - **Two registrations do not prove two independent devices.** Synced passkeys (e.g. in one platform account) can share fate.
   - Staff are guided to use authenticators in **different failure domains**: one hardware security key plus one platform passkey, or passkeys in different ecosystems.
   - AAGUID and backup flags are recorded so reviewers can see synced credentials.
   - Recovery procedures assume both authenticators may be lost together unless independence was verified.
   - The owner may require a hardware-bound key for admins (AAGUID allowlist).
5. **Privilege increases need two people** where two people exist (§10.4, §10.8). Privilege reductions may be done by one admin.
6. **No standing super-admin or break-glass credential exists.**
7. Every lifecycle event is audited and notified to all active admins.
8. Staff security is fully enforced in the Backend Foundation phase (Phase 7), **before any real staff power exists**. Frontend phases only render staff UI against mocks, which confer no authority.

### 10.2 Authenticator policy

| Setting | Value |
|---|---|
| Protocol | WebAuthn via `@simplewebauthn/server` / `@simplewebauthn/browser` |
| User verification | `required` |
| Resident key | `preferred` |
| Attestation | `none` in V1; AAGUID and backup-eligible/backup-state flags recorded |
| RP ID / origin | Configured app host / exact `APP_ORIGIN` |
| Challenges | 32 random bytes, single use, **5-minute** TTL, bound to `{session or validated enrollment flow, purpose, actionHash}` |
| Sign-count regression | Credential flagged; staff permissions suspended pending review |

### 10.3 Bootstrap: the first administrator

1. Precondition: `system_state.staff_bootstrap_completed_at IS NULL` and no staff account exists.
2. Operator runs `staff:bootstrap --email <address> --operator "<name>"` (CLI only; application DB role; CLI permission set).
3. It creates a `staff_invitations` row (`admin`, inviter `cli:<operator>`, basis `bootstrap`, **24 h**) and enqueues the invitation (§8). The CLI **never prints the invitation token**; it prints only the one-time enrollment code (§10.4).
4. On activation `staff_bootstrap_completed_at` is set; bootstrap refuses to run again.
5. Audit `staff.bootstrap.*`. Next documented step: invite a second admin.

### 10.4 Invitations

| Invited role | Who may invite | Approval |
|---|---|---|
| `moderator`, `appeal_reviewer` | Any admin, with action-bound step-up | None beyond the inviting admin |
| `admin` | Any admin, with step-up | A **second, different admin** approves with step-up. If fewer than two active admins exist, the operator approves via audited CLI (`staff:approve-invitation`) |

- No account exists until acceptance. The invited email must not belong to any account. TTL **72 h**; revocable; worker-issued token (§8); link `/staff/enroll#token=…`.
- **Split secret:** every enrollment (new, re-enrollment, bootstrap, break-glass) requires the emailed token **and** a one-time **enrollment code**: 10 characters, CSPRNG, stored hashed, ≤ 5 attempts, expiring with the invitation. The code is shown once to the inviter or operator and delivered through a separate, previously verified channel.
- **Binding:** after token + code validation, the enrollment ceremony state (challenges, draft) is bound to that validated browser flow (a short-lived server-side enrollment session), not to the invitation globally.

### 10.5 Enrollment ceremony

1. Validate the invitation and enrollment code; start a bound enrollment flow.
2. Choose a password.
3. Register authenticator 1 (UV required).
4. Register authenticator 2 (guidance: different failure domain, §10.1).
5. **Atomic activation:** staff account, credential, authenticators, role assignment (inviter, approver, basis), invitation consumed, audit, admins notified.

An abandoned ceremony leaves no account. A recorded objection (§10.11) or revocation prevents completion.

### 10.6 Staff sign-in

Password (Better Auth) → `pending_webauthn` (§5.1) → challenge → assertion → `staff_session_assurance` → staff permissions within staff lifetimes.

### 10.7 Action-bound step-up

A fresh WebAuthn assertion whose challenge is bound to `SHA-256(canonical {action, targetType, targetId, parameters})`, single use, 5 minutes, verified and executed in the same request. Dangerous actions:

- invitations; role grants, revocations and approvals;
- suspensions and restorations;
- finding approvals; finding suspensions and reversals;
- signal suppressions;
- evidence forensic export; purge requests;
- recovery approvals;
- configuration changes.

### 10.8 Role changes

- **Elevation:** proposed by one admin, approved by a different admin (each with step-up). With fewer than two active admins, the operator CLI approves.
- **Removal:** any admin can remove `moderator`/`appeal_reviewer`. Removing `admin` needs a second admin, except self-removal and emergency suspension.
- Every role change revokes all of the target's sessions and bumps `security_version`.

### 10.9 Offboarding

An admin (step-up) revokes roles, sessions and authenticators, revokes invitations the person issued, reassigns open cases, sets the account `deactivated` and bumps `security_version`. Audited.

### 10.10 One authenticator lost

Sign in with the remaining authenticator → remove the lost one → register a replacement. Flagged until replaced; after **7 days** below two, staff permissions are suspended. If the remaining authenticator was synced with the lost one (same failure domain), treat the event as a possible compromise and use §10.11.

### 10.11 All authenticators lost (staff recovery)

1. An admin opens a recovery case (step-up). The subject's staff permissions are suspended, sessions and authenticators revoked, `security_version` bumped.
2. **Identity verification by two staff members** (at least one admin), neither the subject, each recording method and rationale.
3. Approval by a second admin, distinct from the opener. If the subject is the only admin, the operator CLI provides it.
4. **24-hour objection window**, notifying all admins **and the subject's email**. The subject's notice carries a single-use, POST-only objection link (§10.11.1). An objection stops the case (state `objected`, kept as history); any re-enrollment invitation is revoked.
5. Re-enrollment invitation to the account email. **The enrollment code goes only through the identity-verification channel.** New password plus two new authenticators.

#### 10.11.1 Objections (ADR0013 C, accepted 2026-10-16)

- **Staff objection:** permission `staff:recovery:approve`, an action-bound step-up `staff.recovery.object` whose parameters include the reason (10–1000 characters), during the objection window or re-enrollment. The subject cannot object to their own case through this path.
- **Subject objection:** the link `https://<APP_ORIGIN>/recovery/object#token=<token>` (32 CSPRNG bytes, SHA-256 stored, redeemable only after `accepted_for_delivery`, expires with the window). `POST /auth/staff-recovery/objection {token, operation}` records one objection and then, once, its withdrawal. It creates no session, works while the subject is suspended, and is throttled like other token actions.
- **Withdrawal:** only the objector, within 24 hours of objecting (staff with step-up `staff.recovery.withdraw`; the subject with the same link), and only while no reopened case exists. When no other objection stands, a new 24-hour window starts and the subject receives a new link.
- **Resolution is a new case** (`staff.recovery.reopen`, step-up): opened by an admin who is neither the subject nor any objector along the chain, referencing the objected case (`reopens_case_id`, one reopening per case). Verification and the window restart. **No objector along the chain may verify or approve it.**
- **Abuse signal:** two or more objections by the same staff member within 30 days notify every admin (`staff_recovery_objection_pattern`).
- **Operator branch (ADR0013 B):** unavailable until the owner records P-13. `approve-recovery` from the operator CLI is refused; a sole-admin loss goes through break-glass (§10.13).

No recovery path disables WebAuthn or issues a session without it.

**Small-team note:** with fewer than three staff, steps 2–3 may involve the operator. Who the operator is, and whether they are a separate person, is a **procedural** control the owner must define (§10.13).

### 10.12 Suspected compromise

Any admin may emergency-suspend any staff account (step-up): sessions and permissions end immediately and the version is bumped. Restoration follows §10.11. Actions in the suspected window are re-reviewed.

### 10.13 Break-glass and the limits of technical controls

1. **Technical controls:**
   - the deployment flag `BREAK_GLASS_ENABLED=true`, recorded by the hosting platform's audit trail;
   - the operator CLI `staff:break-glass --email --incident --operator`, which requires production access.
2. Effects: revoke all staff sessions; 24-hour admin invitation (§8; code printed to the operator, delivered out of band); incident recorded; every staff email notified.
3. Unset the flag afterwards. A post-incident review is mandatory and recorded.
4. **Honest assurance statement:**
   - The flag and the CLI are **two technical controls, not two people.** If one operator holds both deployment-configuration and production-shell access, break-glass is a **single-person** action, mitigated only by audit trails, notifications and mandatory review.
   - Genuine two-person authorization requires a **human procedural control**: different people hold deployment-config and production-shell access, or a documented second-person approval before invocation.
   - The owner defines this before staff onboarding (open decision P-13).
   - Production infrastructure access remains a powerful trusted boundary.
5. A break-glass drill and a recovery drill are rehearsed before launch.

### 10.14 Audit events

`staff.bootstrap.*`, `staff.invitation.{created,approved,revoked,accepted}`, `staff.enrollment.{code_failed,started,completed}`, `staff.authenticator.{registered,removed,flagged}`, `staff.assurance.{succeeded,failed}`, `staff.stepup.{succeeded,failed}`, `staff.role.{requested,approved,granted,revoked}`, `staff.{suspended,restored,offboarded}`, `staff.recovery.{opened,verified,approved,objected,withdrawn,reopened,completed}`, `staff.breakglass.{invoked,reviewed}`, `account.{password_reset,password_changed,email_changed}`, `security_email.{accepted,retryable_failure,permanent_failure}`.

---

## 11. Request origin and CSRF policy (single policy; resolves R-15)

This is the **only** CSRF/origin policy. Other documents link here.

| Aspect | Rule |
|---|---|
| Topology | Same-origin: pages and `/api/*` share `APP_ORIGIN` |
| Cookies | `__Host-bl_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`. No auth state in `localStorage`, `sessionStorage` or JS-readable cookies |
| Safe methods | `GET`, `HEAD`, `OPTIONS` never change state (route-registration check) |
| Origin validation | Every other method to a browser-facing endpoint needs an `Origin` header **exactly equal** to `APP_ORIGIN`. **Missing, `null`, or anything else → `403 origin_rejected`.** No `Sec-Fetch-Site` or `Referer` fallback; same-site ≠ same-origin. Covers login, logout, registration, reset, uploads and every mutation |
| CSRF tokens | Not used (exact Origin + `SameSite=Lax` + JSON-only). Clients stripping `Origin` fail closed |
| Content types | `application/json` only, except uploads (`multipart/form-data`, same Origin rule) |
| CORS | None |
| SSR internal calls | GET only, with the internal token; non-GET on the internal path rejected |
| Better Auth | Router not mounted; `trustedOrigins: [APP_ORIGIN]` as defense in depth only |
| WebSockets (future) | Exact-Origin handshake plus session cookie |
| Machine clients (future) | Separate prefixes with API keys or HMAC; never session cookies |

---

## 12. Throttling and enumeration resistance

- Durable PostgreSQL counters keyed by email hash, account, IPv4 address and **IPv6 /64**, plus a global failure ratio.
- Login: 5 failures per key in 15 minutes → human verification + exponential delay (max 15 min). **No permanent lockout.**
- Global credential-stuffing detection → temporary human verification for all logins.
- **Uniform request paths:** `register/start`, `password/forgot` and `email-change` perform identical work regardless of account existence; existence is evaluated only by the worker. Login returns a generic 401; registration completion a generic 400.
- Shared asynchronous resources cannot guarantee zero measurable timing noise, so account-correlated timing is tested (testing-strategy §4.1, §4.3), and no synchronous result depends on worker outcomes.
- The mailbox holder (and their mail provider) can distinguish an enrollment link from an existing-account notice. This is an intentional, restricted channel, not an HTTP enumeration oracle.
- Notice emails: ≤ 1 per address per 24 h.
- Human verification via the `HumanVerifier` port (Turnstile candidate, O-6); fails closed with a documented retry path.

---

## 13. Accepted residual risks (identity)

| Risk | Status |
|---|---|
| A V1 member whose mailbox is compromised can be taken over via reset (no member MFA in V1); cooling limits account changes, but private data is readable | Accepted for V1; member MFA is the first Post-V1 identity item |
| Plain session-token storage | **E-1 accepted with mitigations M1–M10** (§5.5). Database + secret compromise = account-session compromise |
| Mail-provider handling, out-of-order or duplicate security emails | Provider criteria (O-7); latest-only links |
| Single operator holding all break-glass controls | Procedural control P-13 (owner) |

---

## 14. Better Auth configuration and backend acceptance checks

### 14.1 Required configuration (normative)

```
database: Drizzle adapter on Blacklist's pg pool; models mapped to auth_users, auth_sessions, auth_accounts, auth_verifications
emailAndPassword: enabled, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 512,
                  password: { hash/verify: Blacklist Argon2id }
                  (no sendResetPassword: Better Auth reset endpoints are never called)
emailVerification: not configured        user.changeEmail.enabled: false        user.deleteUser.enabled: false
session: expiresIn 30d, updateAge 1d, cookieCache.enabled: false
verification: storeIdentifier: "hashed"  (defense in depth; Blacklist does not use Better Auth verification flows)
advanced: cookies.session_token.name "__Host-bl_session" with explicit attributes (S2), crossSubDomainCookies off,
          client IP only from the trusted-proxy-resolved address
rateLimit.enabled: false      trustedOrigins: [APP_ORIGIN]      telemetry.enabled: false
plugins: []  (bearer, JWT and session-conversion plugins FORBIDDEN)      socialProviders: none      account linking: disabled
secret: BETTER_AUTH_SECRET (≥ 32 random bytes, platform secret store; never in DB or backups)
HTTP handler: not mounted — only approved auth.api.* calls from Blacklist routes
```

### 14.2 Acceptance checks (gate: Phase 7 Backend Foundation, before identity migrations or security features merge)

These are **narrow, isolated validation spikes**, not feature implementation. They run only when backend work is authorized, or earlier only with explicit owner authorization (ADR 0008). Each needs recorded real output in `AI_HANDOFF.md`.

| ID | Criterion |
|---|---|
| S1 | Only approved `auth.api.*` calls with `returnHeaders`; no `/api/auth/*` route reachable |
| S2 | Exact `__Host-bl_session` cookie with the required attributes (browser test) |
| S3 | Better Auth reset and verification endpoints are never invoked; `auth_verifications` stays empty in normal flows |
| S4 | A revoked session is rejected on the next request (cookie cache disabled) |
| S5 | Sessions with a stale `security_version` or without `session_policy_state` are rejected |
| S6 | Registration completion is atomic with Better Auth user/account creation, or the idempotent alternative is proven |
| S7 | Blacklist Argon2id hash/verify in use; rehash-on-login works |
| S8 | Normalization and length/byte validation precede Better Auth; boundary tests; no truncation |
| S9 | No outbound network calls from the library (egress-blocked test) |
| S10 | Better Auth tables are reviewed SQL migrations applied by the migrator role; runtime is DML-only |
| S11 | Session records expose creation and activity data for Blacklist lifetime enforcement |
| S12 | Unknown-email sign-in timing within tolerance of wrong-password timing |
| S13 | Concurrent issuance never leaves more than one `active` or `pending_delivery` reset token per account; tokens never become `active` without `accepted_for_delivery` |
| S14 | Delivery outcomes reach the worker: forced `retryable_failure`/timeout fails the job and retries with a new generation; `permanent_failure` completes without retry; captured mail shows only the latest link working; no token in logs, job tables or DLQ |
| S15 | Dependency footprint reviewed (`pnpm why`, transitive adapters, no unapproved install scripts) |
| S16 | Reset transaction (§6.3) writes Better Auth credential and session tables atomically; crash injection at every step yields all-or-nothing; concurrent reset/login/email-change/recovery races resolve per §6.5 |
| S17 | E-1 regression suite (M8) passes, including with forbidden-plugin detection (configuration test fails if any plugin is enabled) |

If a criterion fails and cannot be met through supported configuration: **stop**, write an ADR (upstream fix, narrow Blacklist component, or alternative library). **No fork.**

---

## 15. Test obligations

[testing-strategy.md §4](../testing-strategy.md#4-authentication-tests): R-01 adversarial suite, delivery-outcome and token-inspection suite, reset atomicity and concurrency suite, E-1 regression suite, staff lifecycle negatives, Origin matrix, enumeration timing for registration, reset and email change.
