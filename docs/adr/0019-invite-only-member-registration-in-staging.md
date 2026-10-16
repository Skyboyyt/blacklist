# ADR 0019: Invite-only member registration while staging holds real users

| Field | Value |
|---|---|
| Status | **Superseded by owner decision (2026-10-16, later the same day): member registration is public.** The invite gate remains as an opt-in setting only |
| Proposed by | Claude, 2026-10-15 (review CR-10) |
| Reviewed by | Claude |
| Decided by | Owner, 2026-10-16: "Invite-only sign-up" |
| Affects | identity §4 and §12, ADR 0014, PRD §6 privacy, THREAT-MODEL T-03/T-10, API and worker config |

## Problem

The public staging deployment accepts real people's registrations into a free database that has no approved retention policy, privacy notice, managed recovery or monitoring (ADR 0014; review CR-10). Phase 11 launch gates are still open.

## Decision

Until the owner lifts it, **member registration is invite-only**:
1. **`REGISTRATION_MODE`** (`open` | `invite`) on the API and worker. It defaults to `invite` when `NODE_ENV=production` (the hosted staging services) and to `open` otherwise (local development and tests).
2. **`REGISTRATION_INVITE_EMAILS_SHA256`**: comma-separated SHA-256 hex digests of invited email addresses (trimmed, lower-cased), on both services. No plaintext email addresses are stored in configuration. `node scripts/registration-invite-hash.mjs` computes a digest locally.
3. **Uniform request path (identity §12).** `POST /auth/register/start` answers exactly as before, so whether an email is invited cannot be learned over HTTP. The worker issues an enrollment link only for an invited email. For anyone else it closes the intent (`close_reason='not_invited'`) and sends nothing. Existing-account notices are unchanged.
4. **Completion re-checks.** `register/complete` refuses (`token_invalid`) a token whose email is no longer invited, so removing an email from the list also stops links already sent.
5. **Unchanged:** existing accounts, sign-in, password reset, and staff invitations (identity §10.4).

## Consequences

- People who are not invited receive no email. The register page says sign-up is invite-only during testing.
- The owner manages the list through the hosting configuration on both services, then redeploys or restarts them.
- Lifting the gate (`REGISTRATION_MODE=open`) requires the Phase 11 privacy, retention and recovery work, or a recorded risk acceptance.

## Alternatives considered

- Keep public sign-up and record risk acceptance: rejected by the owner.
- Restore Vercel visitor protection: hides the whole site, including public research.
- An invitation table managed by admins: needs a migration and an admin UI. It is the right long-term shape, deferred to the member-invitation work.

## Owner decision: public registration (2026-10-16)

The owner instructed: "allow everyone to register without any needing approval, make it public registration".
- `REGISTRATION_MODE` now defaults to `open` everywhere (including `NODE_ENV=production`); the Render blueprint sets `open` on the API and worker. The invite gate runs only when `REGISTRATION_MODE=invite` is set explicitly.
- The sign-up page no longer mentions invitations.
- **Risk acceptance (review CR-10):** the owner accepts real people registering into the free staging database before the Phase 11 privacy, retention, recovery and monitoring gates are done. Those gates still block production readiness.
- Unchanged safeguards: email-first registration (no credential before mailbox proof), the uniform response, per-email and per-IP-prefix limits, the 12-character member minimum and breach checks. A human verifier (O-6) is still not configured.

