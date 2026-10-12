# @blacklist/worker

Background job runner using pg-boss. Jobs live in PostgreSQL and are enqueued in the same transaction as the state change that causes them. **Status:** not implemented; the first jobs (security emails, `identity.cleanup`) arrive in Phase 7.

## Rules (ARCHITECTURE.md §22)

- **Payloads carry identifiers (and expected revisions) only.** Never tokens, links, roles or trusted owner IDs.
- Handlers validate payloads with Zod, reload authoritative state under lock, and **no-op when the state is stale** (`skipped_stale`): a reversed or suspended finding, withdrawn or rejected report, granted appeal or superseded intent.
- Domain services run with an explicit **least-privilege system actor** per job type. Authority-dependent effects re-check current authority.
- **Security emails** ([identity §8](../../docs/design/identity.md#8-security-email-delivery-protocol-resolves-r-03-v2-01)): under the account lock the worker invalidates the previous token, generates a new one (`pending_delivery`), and sends through the delivery layer. The token becomes `active` only on `accepted_for_delivery`; `retryable_failure`/timeout invalidates it and fails the job (the retry issues a new generation); `permanent_failure` completes without retry. Maximum age 15 minutes, ≤ 5 attempts.
- Recompute jobs are state-based; pointers update by compare-and-set; dirty flags cause reruns.
- Never parses uploaded files. Image processing happens only in `apps/evidence-processor`, which the worker drives with scoped presigned URLs.
- Exponential backoff; dead-letter queue (payloads are identifiers only); metrics for lag, failures, DLQ size and `skipped_stale`.
- May import: `@blacklist/core`, `@blacklist/domain`, `@blacklist/config`.

## Job catalog

| Job | Phase |
|---|---|
| `identity.registration.issue`, `identity.email_change.issue`, `identity.password_reset.issue`, `identity.staff_invitation.issue`, `identity.existing_account_notice`, `identity.security_notice`, `identity.cleanup`, `audit.verify_chain` | 7 |
| `chain.pin_transaction`, `chain.verify_fact`, `providers.health_probe` | 8 |
| `evidence.process`, `evidence.reconcile`, `evidence.purge` | 9 |
| `risk.signal.upsert`, `risk.recompute`, `risk.expiry_sweep`, `notifications.fanout`, `retention.purge` | 10 |
| Deferred: `external.sanctions_sync`, `audit.checkpoint` (O-13), alerts, verification re-check, reputation | — |
