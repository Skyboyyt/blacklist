# Blacklist — Data Model (proposed)

| Field | Value |
|---|---|
| Status | **Revision 3** (2026-10-04). Phase 7 and Phase 8 migrations are merged on `main` (2026-10-15) |
| Owner | Claude (primary engineer). Changes after approval require an ADR |
| Related | [ARCHITECTURE.md §12](../ARCHITECTURE.md#12-data-architecture), design docs ([identity](design/identity.md), [moderation](design/moderation.md), [chain-data](design/chain-data.md)), ADRs 0001–0007 |

This is the logical model that backend migrations (Phase 7 onward) implement incrementally; frontend phases use the matching `@blacklist/contracts` DTOs and mocks. Column lists are indicative; types, constraints and indexes are finalized and reviewed in migrations. **Deferred** tables are listed in §10 only to show the V1 schema doesn't block them. They are **not created** in V1.

## Phase 7 acceptance fixtures (2026-10-13)

The isolated [backend acceptance package](../tests/backend-acceptance/README.md) contains reduced, disposable schema fixtures proving D1–D9 and S1–S17. They are **not application migrations or a replacement for the normative model below**. Representative subject/subtype and assessment relationships exist only to exercise D4. Phase7 production identity/audit/staff migrations are implemented; isolated gate proof does not close hosted security gates. The current undeployed Phase8 additions are described below; no Phase9/10 backend is implemented. See [gate evidence](phase7-acceptance.md) and the current AI_HANDOFF.

## 1. Conventions

### Phase 8 additive implementation (2026-10-14; merged to `main`, not migrated in the cloud)

Claude's 2026-10-15 review follow-up adds `0005_invalidation_guard.sql` (an invalidation must cite independent finalized evidence of a changed pinned transaction; one per fact) and `migrations/order.json`, the single apply order for every database (review CR-14). That makes 11 ledger entries; the table count is still 34. The 2026-10-16 owner-decision work adds `generated/0006_easy_impossible_man.sql` (ADR 0013 C: the two recovery objection tables, `reopens_case_id`, and `one_open_recovery` excluding objected cases): **12 ledger entries and 36 tables**. Applied to Neon by the owner on 2026-10-16 (owner-reported 12 × `ok`); see [the runbook](operations/2026-10-16-apply-0006-recovery-objections.md). Continuation adds `0004_pinned_transaction_time.sql`: the pinned `block_time` must equal its immutable normalized receipt time. This is an additive validated constraint, not an edit to any previously committed migration. The local ledger now has10entries and the same34application tables; Neon remains unchanged. If validation finds an inconsistent existing pin, migration aborts without repairing/deleting it; seek a reviewed recovery decision.

On-demand CLI-only reconciliation independently re-reads a finalized pinned transaction, preserves the original fact, and appends one idempotent invalidation when independently agreed same-decoder normalized facts change. Unavailable/conflicting/pending/unknown-independent data cannot invalidate history. Supporting new receipts are retained. Existing invalidation stays authoritative when later facts match the original pin; consistency and invalidation decisions recheck the barrier under the same per-fact advisory lock after RPC, without holding the lock during provider I/O. Dependent signals/findings do not exist in the current backend; their later-phase retraction/review remains required. No background schedule, public pin/invalidation endpoint or user research history is introduced.

Phase 8 adds seven chain-data tables: `chains`, `verification_receipts`, `chain_fact_verifications`, `chain_transactions`, `asset_transfers`, `chain_fact_invalidations`, and `research_cache`. **`research_cache` is not part of the normative model or chain-data.md.** It is a disposable public-chain cache (no user association, 15-second expiry, ≤ 1 MiB payload) and needs an owner/ADR decision (review CR-12). Generated migration `0005_violet_stardust.sql` creates these tables, indexes and foreign keys; hand migration `0003_chain_research_foundation.sql` seeds only the two approved mainnets and adds guards. All seven previously applied migrations are byte-identical to main. Including the timestamp constraint, ten migration-ledger entries and 34 application tables are expected locally. The last prior cloud observation was seven entries/27 tables; the live ledger was not reverified because the direct verified-TLS probe is blocked. No Phase8 cloud migration was run.

Receipts store provider identity/independence, query method/allowlisted parameters, exact snapshot, commitment/finality, requested/fetched times, decoder/comparison versions, normalized comparison fields and their SHA256 digest. Receipt keys make retries idempotent; independent same-snapshot finalized agreement is required for an `agree` verification. Pending/mismatched/shared/unknown-upstream receipts cannot authorize pinned facts. Pinned transaction execution/hash/height/fee/status/decoder fields must match the verified receipt. Immutable tables deny UPDATE/DELETE/TRUNCATE to the runtime and reject owner UPDATE/DELETE through triggers. Runtime cannot mutate the chain registry or run DDL/TEMP operations. Cryptographic provider authenticity and privileged-operator tamper resistance are not claimed.

The bounded shared research cache contains public chain facts only, without user/session/email/handle/search-to-account associations. Its key includes network, capability, canonical subject, history page/direction/limit, finality, verification and decoder version; expiry is indexed. It is a persistence record, not yet a cross-process read-through cache. Domain writes receipts/verification/cache in one transaction; persistence failure cannot return successful research data. No automatic permanent pin, finding, score, moderation decision or private research history is created by a lookup. See [Phase8 operations](operations/phase8-research.md) for migration review/recovery and [Phase8 report](reviews/2026-10-14-phase8-implementation.md) for actual evidence and limits.

| Topic | Rule |
|---|---|
| Naming | `snake_case`, plural tables, `<table>_id` FKs. Better Auth models are mapped to `auth_*` names |
| Primary keys | UUIDv7 unless noted. `audit_log` uses a `bigint` sequence for chain order |
| Time | `timestamptz` (UTC). Chain time (`block_time`) is separate from fetch time (`fetched_at`) |
| Chain IDs | `chain_id text` (CAIP-2) → `chains` |
| Addresses | Canonical per chain (EVM lowercase hex; Solana base58, case preserved, validated to decode to 32 bytes at the application boundary) |
| Amounts | `numeric(78,0)` raw units; never floats |
| Enums | `text` + `CHECK` |
| User text | Raw, length-limited by `CHECK`, escaped at render; never HTML/Markdown in V1 |
| **[append-only]** | `blacklist_app` has INSERT/SELECT only; a trigger rejects UPDATE/DELETE |
| **[private]** | Non-null owner column; access only via owner-scoped repositories. Child tables carry the owner and use **composite FKs** `(parent_id, owner) → parent(id, owner)` |
| Subject subtypes | `subjects(id, kind)` is unique. Each subtype table has a `kind` column fixed by `CHECK` and a composite FK `(subject_id, kind) → subjects(id, kind)`, so a subject can't have two subtypes |
| Hashes | SHA-256, stored as `bytea` (or lowercase hex where an external format requires it) |
| Canonical JSON for hashing | UTF-8, keys sorted lexicographically, no insignificant whitespace, numbers as strings for on-chain integers, timestamps as RFC 3339 UTC with milliseconds |
| Soft delete | Avoided; explicit status columns plus append-only history |

## 2. Entity map (V1)

```
identity:   auth_users ─1:1─ user_profiles ─1:1─ account_security_state
            auth_users ─1:n─ auth_accounts (credential), auth_sessions ─1:1─ session_policy_state
            auth_verifications (Better Auth model; unused by Blacklist flows)
            registration_intents · identity_tokens (password reset, email change) · password_reset_requests · email_change_requests
            security_email_deliveries · auth_throttle
            staff: staff_invitations, staff_authenticators, staff_webauthn_challenges,
                   staff_session_assurance, staff_role_requests, staff_recovery_cases, user_role_assignments
            system_state (bootstrap flag)
subjects:   subjects ─1:1─ addresses | projects | domains
            addresses ─1:n─ address_kind_observations, contract_snapshots, token_observations ; addresses ─1:1─ tokens
            address_labels ; projects ─1:n─ project_addresses, project_domains, project_revisions
chain data: chains ─1:n─ chain_transactions ─1:n─ asset_transfers
            verification_receipts ─n:1─ chain_fact_verifications ; chain_fact_invalidations
reports:    reports ─1:n─ report_subjects, report_status_history
evidence:   evidence_items ─1:n─ evidence_objects, evidence_derivatives, evidence_custody_events ; evidence_links
moderation: moderation_cases ; findings ─1:n─ finding_revisions ─1:n─ finding_approval_events
            moderation_decisions ─1:n─ decision_evidence ; finding_status_history
            standing_challenges, standing_claims, subject_responses, appeals, correction_requests
risk:       risk_rulesets ; risk_signals ─1:n─ risk_signal_revisions ; risk_signal_suppressions
            risk_assessments ─1:n─ risk_assessment_inputs, risk_assessment_factors
            risk_subject_state (seq, dirty) ; current_risk_assessments ; assessment_annotations
notify:     notifications [private]
audit:      audit_log [append-only, hash-chained] ; actor_identity_map ; security_events ; idempotency_keys
```

## 3. Identity and access ([identity design](design/identity.md))

### Better Auth core models (generated by its CLI, migrated as reviewed SQL)
- `auth_users`: `id`, `email` (normalized, unique), `email_verified` (always true at creation), `name`, `created_at`, `updated_at`, plus Blacklist additional fields: `account_kind` (`member` | `staff`), `status` (`active` | `suspended` | `deactivated`).
- `auth_accounts`: credential rows (`provider_id = credential`, `password` = Argon2id PHC string). Accessed only by identity authentication functions.
- `auth_sessions`: `id`, `token` (**stored plainly by Better Auth; exception E-1**), `user_id`, `expires_at`, `ip_address` (truncated by Blacklist hook), `user_agent`, `created_at`, `updated_at`.
- `auth_verifications`: Better Auth's model. **Unused by Blacklist flows** (Better Auth reset, verification and change-email endpoints are never called; acceptance check S3 expects it to stay empty). Configured with `storeIdentifier: "hashed"` as defense in depth.

Exact columns are produced by acceptance check S10 (Phase 7) and reviewed. Blacklist's reset and password/email-change transactions write `auth_accounts.password` and delete `auth_sessions` rows directly inside Blacklist transactions (S16). No Better Auth plugin tables exist.

### `user_profiles`
`user_id` (PK), `handle` (unique, case-insensitive; reserved list + confusable normalization), `display_name`, `created_at`, `updated_at`. Not publicly exposed in V1.

### `account_security_state`
`user_id` (PK), **`security_version`** (int, starts at 1; incremented by every security transition), `last_reset_generation` (int), `sensitive_actions_locked_until`, `password_changed_at`, `deactivated_at`, `staff_recovery_pending` (bool), `staff_authenticator_deficit_since`.
This row is the **per-account security lock** (`SELECT … FOR UPDATE`) for reset issuance and redemption, password change, email change, suspension, recovery and role changes.

### `session_policy_state` [private]
`session_id` (PK, FK `auth_sessions`), `user_id`, `account_kind`, **`security_version`** (copied at sign-in; must equal the account's on every request), `created_at`, `last_activity_at` (written ≤ once per 60 s), `reauthenticated_at`, `ip_prefix`, `user_agent_summary`. Enforces idle and absolute limits per account kind.

### `registration_intents`
`id`, `email` (normalized), `state` (`requested` | `pending_delivery` | `issued` | `completed` | `superseded` | `expired`), `generation`, `delivery_outcome`, `close_reason` (`newer_intent` | `existing_account` | `expired`), `token_hash` (null until issued), `issued_at`, `expires_at` (issued_at + 30 min), `completed_at`, `superseded_at`, `requested_ip_prefix`, `created_at`. The API always inserts an intent; the worker decides between issuing a token and sending an existing-account notice.
Constraints: partial unique `(email) WHERE state IN ('requested','pending_delivery','issued')` (only the newest can be open); unique `token_hash`. Redeemable only in `issued` (= delivery accepted). Purged 24 h after a terminal state.

### `identity_tokens`
`id`, `purpose` (`password_reset` | `email_change`), `user_id`, `target_email` (email change), `request_id`, `generation`, `security_version` (account version at issuance), `state` (`pending_delivery` | `active` | `consumed` | `invalidated` | `expired`), `invalidation_reason` (`superseded` | `delivery_retryable` | `delivery_permanent` | `security_transition` | `cleanup`), `token_hash`, `issued_at`, `expires_at`, `activated_at`, `consumed_at`.
Constraints: partial unique `(user_id, purpose) WHERE state IN ('pending_delivery','active')`, so **at most one open token per account and purpose**; unique `token_hash`. Redeemable only when `active`, latest generation, unexpired, and `security_version` current. Purged 24 h after a terminal state.

### `password_reset_requests`, `email_change_requests`
Request records written by the API with uniform work (no existence check): `id`, `email` / (`user_id`, `new_email`), `requested_at`, `requested_ip_prefix`, `processed_at`, `outcome` (`issued` | `notice` | `ignored` | `dropped_stale`). Purged after 7 days.

### `security_email_deliveries` [append-only]
`id`, `kind`, `entity_type`, `entity_id`, `generation`, `outcome` (`accepted_for_delivery` | `retryable_failure` | `permanent_failure`), `provider_message_id`, `sanitized_error_code`, `provider_status`, `attempted_at`. No token, URL or message body.

### `auth_throttle`
`key` (PK: `email:<hash>`, `acct:<id>`, `ip4:<addr>`, `ip6:<prefix/64>`, `global:login`), `failures`, `window_started_at`, `next_allowed_at`, `challenge_required`, `updated_at`.

### Staff tables
- `staff_invitations`: `id`, `email`, `role` (`moderator` | `admin` | `appeal_reviewer`), `basis` (`admin` | `bootstrap` | `break_glass` | `recovery`), `invited_by_actor`, `requires_second_approval`, `approved_by_actor`, `approved_at`, `state` (`pending_approval` | `issued` | `accepted` | `revoked` | `expired`), `token_hash`, `enrollment_code_hash` (out-of-band split secret), `enrollment_code_attempts` (≤ 5), `issued_at`, `expires_at`, `target_user_id` (re-enrollment), `created_at`.
- `staff_authenticators` [private]: `id`, `user_id`, `credential_id` (unique), `public_key`, `sign_count`, `transports`, `aaguid`, `backup_eligible`, `backup_state`, `label`, `created_at`, `last_used_at`, `revoked_at`, `revoke_reason`, `flagged_at`.
- `staff_webauthn_challenges`: `id`, `user_id` or `invitation_id`, `session_id`, `purpose` (`enroll` | `login` | `stepup` | `reset`), `action_hash` (step-up), `challenge_hash`, `expires_at` (5 min), `consumed_at`.
- `staff_session_assurance` [private]: `session_id` (PK), `user_id`, `authenticator_id`, `verified_at`.
- `staff_role_requests`: `id`, `target_user_id`, `role`, `action` (`grant` | `revoke`), `proposed_by`, `approved_by` (≠ `proposed_by`, `CHECK`), `approval_basis` (`second_admin` | `operator_cli`), `state`, timestamps.
- `staff_recovery_cases`: `id`, `subject_user_id`, `opened_by`, `verifications` (two rows in `staff_recovery_verifications`: verifier, method, rationale), `approved_by`, `objection_window_ends_at`, `state`, `invitation_id`, `reopens_case_id` (ADR 0013 C4; self-reference, at most one reopening per case, never itself). `one_open_recovery` excludes `completed`, `cancelled` and `objected`: an objected case is kept as history and no longer blocks the new case that resolves it.
- `staff_recovery_objections` (ADR 0013 C): `id`, `case_id`, `objector` (actor reference), `objector_kind` (`staff` | `subject` | `operator`), `reason` (required, 10–1000 characters, except for the subject), `created_at`, `withdrawn_at`. Rows are never deleted (the runtime role has no DELETE); withdrawal only sets `withdrawn_at`.
- `staff_recovery_objection_links` (ADR 0013 C2): `id`, `case_id`, `token_hash` (SHA-256, unique), `state` (`pending_delivery` | `active` | `objected` | `withdrawn` | `invalidated`; the hash is null exactly in `invalidated` and `withdrawn`), `expires_at` (the window end), `created_at`, `used_at`.
- `user_role_assignments`: `id`, `user_id` (must be `account_kind = 'staff'`, enforced by service + test), `role`, `granted_via` (`invitation` | `role_request`), `source_id`, `granted_at`, `revoked_at`, `revoke_reason`. Partial unique `(user_id, role) WHERE revoked_at IS NULL`.
- `system_state`: single row; `staff_bootstrap_completed_at`.

## 4. Subjects, chain data, labels, projects ([chain-data design](design/chain-data.md))

### `chains`
`chain_id` (PK, CAIP-2), `slug` (unique), `family`, `name`, `is_testnet`, `enabled`, `native_symbol`, `native_decimals`, `finality_policy` (jsonb). Seeded by migration: `eip155:1` (`ethereum`), `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (`solana`).

### `subjects`
`id`, `kind` (`address` | `project` | `domain`), `created_at`. Unique `(id, kind)` for composite subtype FKs.

### `addresses`
`subject_id`, `kind` (`CHECK = 'address'`), `chain_id`, `address`. Unique `(chain_id, address)`.

### `address_kind_observations` [append-only]
`id`, `address_subject_id`, `kind` (`eoa` | `eoa_delegated` | `contract` | `program` | `token_mint` | `token_account` | `pda` | `unknown`), `delegate_address`, `owner_address`, `observed_at`, `snapshot` (jsonb: EVM block number + hash / Solana slot), `provider_id`.

### `contract_snapshots` [append-only], `token_observations` [append-only], `tokens`
As revision 1, plus a `snapshot` column on observations. Explorer verified-source fields carry `source_provenance = 'external_source'` and the explorer name.

### `domains`
`subject_id`, `kind` (`CHECK = 'domain'`), `hostname` (punycode, unique), `registrable_domain`.

### `chain_transactions` (pinned, finalized only)
PK `(chain_id, tx_hash)`; `block_number` / `slot`, `block_hash` (EVM), `block_time`, `status`, `fee_raw`, `finality` (**`CHECK finality = 'final'`**), `normalized` (jsonb), `decoder_version`, `fetched_at`, `pinned_reason`, `verification_id` (FK `chain_fact_verifications`).

### `asset_transfers`
`id`, `chain_id`, `tx_hash`, `ordinal`, `from_address`, `to_address`, `asset_address`, `amount_raw`, `transfer_kind`, **`evidence_level`** (`observed_log` | `asset_contract_log` | `balance_verified` | `native_consensus`), **`emitter`**, **`authorization_basis`** (`subject_signed_direct` | `delegated` | `protocol` | `unknown`), `authority_address`, `top_level` (bool). Unique `(chain_id, tx_hash, ordinal)`; FK to `chain_transactions`.

### `verification_receipts` [append-only]
`id`, `chain_id`, `capability`, `query` (jsonb: method + canonical params), `snapshot` (jsonb), `finality`, `provider_id`, `independence_group`, `fetched_at`, `fields_digest`, `normalized_fields` (jsonb, bounded), `decoder_version`.

### `chain_fact_verifications` [append-only]
`id`, `fact_type`, `fact_ref` (jsonb), `receipt_a_id`, `receipt_b_id`, `comparison_spec_version`, `result` (`agree` | `conflict` | `inconclusive_snapshot_mismatch` | `unavailable` | `single_source`), `created_at`. `CHECK`: `agree` requires both receipts.

### `chain_fact_invalidations` [append-only]
`id`, `fact_type`, `fact_ref`, `reason`, `discovered_at`, `recorded_by`.

### `project_suggestions` (ADR 0010 Part A; not yet migrated)
`id`, `submitter_user_id`, `name`, `category`, `chain_id`, `identifier`, `links_text` (defanged text, never fetched), `description`, `status` (`submitted` | `needs_information` | `accepted_into_profile` | `not_accepted`), `submitter_reason` (fixed list, visible to the submitter only), `resulting_project_id`, `revision`, `submitted_at`, `decided_at`. Private to the submitter and staff; a suggestion has no public effect until staff publish a project revision. Evidence links via `evidence_links.project_suggestion_id` (to be added with the migration).

### `address_labels`, `projects`, `project_revisions` [append-only], `project_addresses`, `project_domains`
As revision 1. `project_addresses.basis` is an attribution basis with time and evidence; it is **not** an ownership verdict. External labels have `provenance = 'external_source'`.

## Phase 9a implementation (2026-10-16; slices 1–4, not yet applied to Neon)

`generated/0007_smiling_quentin_quire.sql` and `0007_moderation_guards.sql` create the 24 tables below (schema `packages/db/src/schema/moderation.ts`): **14 ledger entries, 60 tables**. Differences from the planned columns:
- Staff actors are stored as **actor references** (`*_ref`, from `actor_identity_map`), e.g. `author_ref`, `approver_ref`, `assigned_to_ref`, `decided_by_ref`, so independence checks compare stable pseudonyms. Members are `*_user_id`.
- `moderation_cases.case_type` uses the frontend contract set (`report_review`, `appeal_review`, `correction_request`, `project_suggestion`, `subject_response`, `suspension_review`); cases carry `version` (optimistic concurrency) and `report_id`, `finding_id`, `appeal_id` and `response_id` sources (a CHECK ties each source to its case type). Correction sources arrive with project profiles (Phase 10). Internal notes are `moderation_case_notes` [append-only]; member-visible messages (a request for information and the member's reply) are `moderation_case_messages` [append-only]. `reports.submitter_reason` holds the fixed-list rejection reason shown to the reporter.
- `evidence_items` stores the non-image kinds only in 9a (`submitted_by_ref`; image states are unused until 9b). `evidence_links` owns a report or a finding revision for now.
- `findings.legal_hold_at`; `finding_revisions.source_case_id`; `finding_approval_events.publication_blocked` (`legal_hold`); `finding_status_history.publication_event_id`.
- Append-only (trigger plus no UPDATE/DELETE for the runtime role): `report_status_history`, `moderation_case_notes`, `moderation_case_messages`, `finding_revisions`, `finding_approval_events`, `finding_publication_events`, `moderation_decisions`, `decision_evidence`, `finding_status_history`, `evidence_custody_events`.
- `publication_guard`: a publication event must cite an unblocked `approve` event for the same revision with the revision's exact content hash; one publication per approval; actor always `system`.
- Standing and redress (slice 4): `standing_challenges` (server-built text, `nonce` unique, `session_id`, `purpose` `appeal` | `response`, `subject_id`, `finding_id`, `chain_id`, `address`, `expires_at`, `consumed_at`); `standing_claims` (`mechanism`, `proof_refs` jsonb, `outcome` `granted` | `denied` | `pending`, `scope_statement`, `decided_by_ref`, `decided_at`; a reply after denied standing returns it to `pending`); `appeals` (`appealed_revision_id`, `standing_claim_id`, `statement`, status set as in moderation §9, one open appeal per member and finding); `subject_responses` (interim status set, `submitter_reason` for a rejection, `published_at` set exactly when published, one open response per member and subject). Correction requests wait for project profiles.
- 0007 also corrects the 0006 `recovery_staff_objection_reason` CHECK, which let a NULL reason pass.

## 5. Reports and evidence

### `reports` [private to reporter + staff]
`id`, `reporter_user_id`, `category`, `title`, `narrative` (≤ 10k), `incident_at`, `loss_amount_raw`, `loss_asset`, `status` (`draft` | `submitted` | `screening` | `queued` | `in_review` | `needs_info` | `accepted` | `rejected` | `rejected_abusive` | `withdrawn`), `revision` (int, increments on each status change; used by jobs), `screening_flags` (jsonb, staff-only), `submitted_at`, `decided_at`, `last_activity_at`, `created_at`.
No `public` columns. Reports never appear in public DTOs.

### `report_status_history` [append-only]
`id`, `report_id`, `from_status`, `to_status`, `revision`, `actor_ref`, `at`, `note` (staff-only, length-limited).

### `report_subjects`
`report_id`, `subject_id`, `role`. PK `(report_id, subject_id)`.

### `evidence_items`
`id`, `kind` (`image` | `transaction_ref` | `address_ref` | `url` | `statement`), `submitted_by`, `submitted_at`, `description`, kind-specific columns (`chain_id` + `tx_hash`; `chain_id` + `address`; `url_text`; `statement_text`), `state` (`upload_pending` | `quarantined` | `processing` | `available` | `rejected` | `unpublished` | `purge_requested` | `purged`), `visibility` (`staff_only` | `published`), `legal_hold` (bool), `case_id`.
`CHECK` that kind-specific columns match `kind`.

### `evidence_objects` (per item; **no cross-item sharing**)
`id`, `evidence_item_id`, `role` (`original` | `quarantine`), `bucket`, `storage_key` (random), `object_version_id`, `sha256`, `size_bytes`, `detected_mime`, `width`, `height`, `state`, `created_at`, `purged_at`, `purge_reason`, `purge_approved_by`.
Unique `(evidence_item_id, role)`. `sha256` is **not** unique (staff-only duplicate signal; never an access key).

### `evidence_derivatives`
`id`, `evidence_item_id`, `kind` (`sanitized_image` | `redacted`), `bucket`, `storage_key`, `object_version_id`, `sha256`, `processor_version`, `reason`, `created_by`, `created_at`.

### `evidence_links`
`id`, `evidence_item_id`, exactly one of `report_id` | `finding_revision_id` | `appeal_id` | `response_id` | `standing_claim_id` | `correction_request_id` (`CHECK num_nonnulls = 1`), `linked_by`, `linked_at`, `unlinked_at`.

### `evidence_custody_events` [append-only]
`id`, `evidence_item_id`, `event` (`submitted` | `processed` | `rejected` | `derivative_link_issued` | `published` | `unpublished` | `redacted` | `legal_hold_set` | `legal_hold_released` | `forensic_export` | `purged`), `actor_ref`, `at`, `details` (allowlisted keys).

## 6. Moderation, findings, standing, redress ([moderation design](design/moderation.md))

### `moderation_cases`
`id`, `case_type` (`report_review` | `appeal_review` | `response_review` | `standing_review` | `correction_request` | `evidence_removal` | `label_review` | `emergency_suspension_review`), `subject_id`, source FKs, `status`, `priority`, `assigned_to`, `sla_due_at`, `created_at`, `closed_at`.

### `findings`
`id`, `subject_id`, `status` (`proposed` | `pending_second_approval` | `published` | `suspended` | `reversed` | `superseded` | `expired`), `current_revision_id`, `published_revision_id`, `status_revision` (int, increments on every status change; used by jobs), `created_at`.

### `finding_revisions` [append-only]
`id`, `finding_id`, `revision_number` (unique per finding), `author_id`, `subject_id`, `finding_type`, `severity`, `public_summary`, `internal_rationale`, `evidence_set` (jsonb: item ID, original sha256, derivative sha256), `linked_factor_codes`, `policy_version`, `content_hash` (canonical JSON, §1), `created_at`.

### `finding_approval_events` [append-only]
`id`, `finding_id`, `revision_id`, `revision_content_hash`, `approver_id`, `event` (`approve` | `reject` | `withdraw`), `rationale`, `stepup_challenge_id`, `at`.
`CHECK`: `approver_id IS NOT NULL`. Service and test: approver ∉ authors of any revision of the finding.

### `moderation_decisions` [append-only]
`id`, `case_id`, `decision_type` (`report_outcome` | `finding_reverse` | `finding_suspend` | `finding_reinstate` | `appeal_outcome` | `standing_outcome` | `response_outcome` | `correction_outcome` | `evidence_action` | `label_action` | `suppression`), `finding_id`, `revision_id`, `approval_event_id` (required for severe reinstatement and reversal approvals), `outcome`, `rationale_internal`, `public_summary`, `policy_version`, `decided_by`, `stepup_challenge_id`, `decided_at`, `supersedes_decision_id`.
**No columns are ever updated.** The brief's later-filled `second_approved_*` fields are removed (R-05). Publication is **not** a human decision type (see `finding_publication_events`).

### `finding_publication_events` [append-only]
`id`, `finding_id`, `revision_id`, `actor_type` (**always `system`**), `cause_approval_event_id` (FK, NOT NULL), `superseded_revision_id`, `at`. Written in the same transaction as the causing approval (moderation design §4.2).

### `decision_evidence`
`decision_id`, `evidence_item_id`. PK pair; real FKs (replaces revision 1's `evidence_reviewed uuid[]`).

### `finding_status_history` [append-only]
`id`, `finding_id`, `from_status`, `to_status`, `status_revision`, `decision_id`, `at`, `public_note`.

### `standing_challenges`
`id`, `user_id`, `session_id`, `case_ref`, `mechanism` (`signature` | `authority_signature` | `dns_txt`), `chain_id`, `address` / `domain`, `nonce`, `message` (signature types), `dns_token_hash`, `expires_at`, `consumed_at`.

### `standing_claims`
`id`, `case_ref` (appeal or response), `claimant_user_id`, `mechanism` (`signature` | `authority_signature` | `dns_txt` | `documentary`), `proof_refs` (challenge, signature, verification receipt, DNS check record, evidence item IDs), `decided_by` (null for automatic), `outcome` (`granted` | `denied`), `scope_statement`, `decided_at`.

### `subject_responses`, `appeals`, `correction_requests`
- `subject_responses`: `id`, `subject_id`, `author_user_id`, `standing_claim_id`, `body` (≤ 5k), `status`, `published_at`. `status` values are not yet specified; the frontend contracts use the interim set `submitted`, `in_review`, `published`, `rejected`, `withdrawn` (documentation gap, like correction statuses).
- `appeals`: `id`, `finding_id`, `appealed_revision_id`, `appellant_user_id`, `standing_claim_id`, `statement`, `status` (`submitted` | `in_review` | `upheld` | `amended` | `reversed` | `withdrawn`), `reviewer_id`, `escalated_at`, `decision_id`, `submitted_at`, `decided_at`.
- `correction_requests`: `id`, `requester_user_id`, `subject_id`, `finding_id`, `statement`, `status`, `decision_id`. **Open:** `status` values are not yet specified; the Phase 4 frontend uses an interim `submitted | in_review | accepted | rejected` pending a decision.

### `staff_conflicts`
`id`, `staff_user_id`, `scope` (subject or finding), `reason` (`self_declared` | `admin_recorded` | `derived`), `created_at`, `revoked_at`.

## 7. Risk (ARCHITECTURE §15, §22)

- `risk_rulesets`: `version` (PK), `engine_version`, `definition` (jsonb snapshot), `checksum`, `activated_at`, `retired_at`.
- `risk_signals`: `id`, `subject_id`, `factor_code`, `tier` (`verified` | `analysis` | `disclosure` | `weak`), `provenance`, `source_type`, `source_ref`, `current_revision`, `status` (`active` | `expired` | `retracted` | `suppressed` | `suspended` | `superseded`), `created_at`.
- `risk_signal_revisions` [append-only]: `signal_id`, `revision`, `status`, `strength`, `source_revision` (e.g. finding revision ID + status revision; verification IDs), `valid_until`, `reason`, `at`. PK `(signal_id, revision)`.
- `risk_signal_suppressions`: as revision 1 (decision-linked, public reason).
- `risk_assessments` [append-only]: `id`, `subject_id`, `seq` (per subject, monotonic), `score` (`CHECK 0..100`, nullable for `not_assessed`), `band`, `confidence`, `ceiling_applied`, `ceiling_reason`, `ruleset_version`, `ruleset_checksum`, `engine_version`, `evaluation_time`, `effective_inputs_hash`, `coverage` (jsonb), `next_review_at`, `trigger`, `computed_at`. Unique `(subject_id, seq)`, unique `(subject_id, id)`.
- `risk_assessment_inputs` [append-only]: `assessment_id`, `signal_id`, `signal_revision`, `factor_code`, `tier`, `provenance`, `status_at_evaluation`, `strength`, `source_revision`, `evidence_refs` (published artifact IDs only for public rendering), `contribution_inputs` (jsonb).
- `risk_assessment_factors` [append-only]: `assessment_id`, `signal_id`, `contribution`, `applied`, `explanation_key`, `explanation_params`.
- `risk_subject_state`: `subject_id` (PK), `last_seq`, `dirty` (bool), `locked_by_job`, `updated_at`.
- `current_risk_assessments`: `subject_id` (PK), `assessment_id`, `seq`. Composite FK `(subject_id, assessment_id) → risk_assessments(subject_id, id)`. Updated only by compare-and-set `WHERE seq < $new`.
- `assessment_annotations` [append-only]: `id`, `subject_id`, `assessment_id`, `kind` (`superseded_by_reversal` | `finding_suspended` | `stale`), `note`, `decision_id`, `at`.

Invariant tests: a `severe` band requires a severe published finding input with a valid approval event; replay reproduces stored results.

## 8. Notifications

- `notifications` [private]: `id`, `recipient_user_id`, `type`, `payload` (IDs and static template params only), `source_ref`, `source_revision`, `dedupe_key` (unique per recipient), `created_at`, `read_at`.
- Notification preferences, watchlists, alert rules and alert events are **deferred** (§10).

## 9. Audit and security telemetry (ADR 0006)

- `audit_log` [append-only, hash-chained]: `seq` (bigint PK), `id`, `occurred_at`, `actor_type` (`user` | `system` | `cli`), `actor_ref` (opaque), `actor_session_ref`, `actor_label` (CLI operator), `action`, `target_type`, `target_id`, `request_id`, `ip_prefix`, `details` (per-action **allowlisted keys**; no free-form PII or secrets), `prev_hash`, `row_hash`.
  Append path: one `SECURITY DEFINER` function, the only grant for the app role. It takes an advisory lock, reads the previous `row_hash`, and sets `row_hash = SHA-256(prev_hash ‖ canonical_json(row))`. It is called at the end of short transactions; lock wait is monitored.
- `actor_identity_map`: `actor_ref` (PK), `user_id`, `created_at`, `erased_at`. Deleting the `user_id` on erasure keeps audit facts while unlinking identity. **Pseudonymization is not assumed to be legal erasure.**
- `security_events`: `id`, `occurred_at`, `user_id` (nullable), `event_type`, `ip_prefix`, `user_agent_summary`, `details`. Retained 180 days.
- `idempotency_keys`: `user_id`, `key`, `request_hash`, `response_status`, `response_ref`, `created_at`, `expires_at`.

## 10. Deferred tables (designed, not created in V1)

| Table(s) | Feature |
|---|---|
| `wallet_links` (private, **non-exclusive**, evidence not entitlement) | Persistent account–wallet proofs |
| `watchlists`, `watchlist_items`, `user_private_labels`, `alert_rules`, `alert_events`, `notification_preferences` | Watchlists and alerts |
| `external_list_snapshots`, `external_list_entries`, `external_chain_mappings` | Sanctions badge (after legal review) |
| `inferred_relationships` | Inferred edges |
| `project_claims`, `verification_checks`, `verified_claims` | Project verification |
| `corroborations`, `contributions`, `reputation_events`, `reputation_balances` | Community intelligence |
| `investigations`, `investigation_members`, `investigation_items`, `investigation_notes`, `investigation_events` | Workspaces |
| `member_mfa_factors`, `recovery_codes` | Member MFA |
| `ai_observations`, `api_keys`, `audit_checkpoints` (O-13) | AI, public API, audit anchoring |

## 11. Brief entity list: disposition

| Brief entity | Disposition |
|---|---|
| User, UserProfile | `auth_users` (Better Auth) + `user_profiles` + `account_security_state` |
| Role, Permission | Code-defined catalog + `user_role_assignments` (staff accounts only) |
| Session | `auth_sessions` + `session_policy_state` (+ `staff_session_assurance`) |
| EmailVerification, PasswordReset | Registration intents (verification is part of registration), `identity_tokens` (password reset and email change; Blacklist-owned), `security_email_deliveries` |
| Project, ProjectClaim, ProjectVerification | `projects`; claims and verification deferred |
| Chain | Kept (CAIP-2) |
| Wallet, Contract | `addresses` + observations + `contract_snapshots` + `tokens` |
| WalletLabel | `address_labels` (public); private labels deferred |
| WalletWatchlist, WalletWatch | Deferred |
| Transaction, TransactionEntity | `chain_transactions` (finalized) + `asset_transfers` (with evidence level and authorization basis) |
| Token | Kept |
| Report, ReportSubject | Kept (private) |
| Evidence, EvidenceFile | `evidence_items` + per-item `evidence_objects` + derivatives + custody events |
| ModerationCase, ModerationDecision | Kept; decisions immutable; revisions and approval events added |
| Appeal | Kept, plus standing claims, responses, correction requests |
| RiskAssessment, RiskFactor, RiskSnapshot | Assessments + immutable inputs + factors + signal revisions + rulesets |
| Investigation* | Deferred |
| EntityRelationship | Split: observed (transfers), inferred (deferred), verified (attributions) |
| Notification | Kept (own items) |
| ResearchContribution, ReputationEvent | Deferred |
| AuditLog | Kept (hash-chained, honest claim) + actor identity map + security events |

## Phase 7 application migration candidates (2026-10-13)

`packages/db/migrations` implements 27 identity/staff/audit tables in the `blacklist` schema; the separate `gate` schema remains disposable acceptance evidence. PostgreSQL 18 is the tested local candidate, using its native UUIDv7 default. The production hosting choice (O-4) is not decided.

Reviewed generated SQL 0000–0004 and hand SQL 0001–0002 are forward-only. The later generated migrations add private email-change snapshots/terminal timestamps, credential drafts, suspension reasons and captured role-request security versions; initial/new-column backfills and retirement of unversioned requests are explicit. Runtime has DML only, no CREATE/TEMP, no access to unused auth_verifications, and audit append via a fixed-search-path SECURITY DEFINER function. Owner-executed append-only triggers and immutable account-kind guards prevent ordinary mutation.

Implementation support fields refine the indicative logical model: `staff_enrollment_flows` holds an opaque flow hash, invitation generation, Argon2 password draft and two verified public-key drafts, expiring after 15 minutes; challenges expire after five minutes. `staff_credential_change_intents` binds a five-minute immutable Argon2 hash draft to the account, signed session and security version. Action-bound password changes reference that draft ID, never a fast password digest. `email_change_requests.old_email` supports notices to both confirmed addresses, and `identity_tokens.terminal_at` anchors terminal retention. Role requests capture the target security version and reject stale/inactive elevation.

No chain, report, evidence, finding, risk or deployment tables/features are introduced by these application migrations. Their Phase 8+ models and normative provenance/revision/independence/reversal invariants remain required.
