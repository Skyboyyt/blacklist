# ADR 0004: Hostile evidence isolation and shared-blob lifecycle

| Field | Value |
|---|---|
| Status | **Accepted with amendments** (owner directions 2026-10-04; amended text below pending owner ratification). Implementation in Phase 3 after authorization |
| Proposed by | Codex, 2026-10-04 |
| Reviewed by | Pending Claude recommendation |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §§14, 22, 30; evidence schema; T-08, T-11–14, T-32–36, T-46–50, T-57 |
| Review | [Phase 0 independent review](../reviews/2026-10-04-phase-0-codex-review.md), R-08, R-14 |

## Problem

MVP PDFs have no sanitized viewing pipeline. General workers hold useful application credentials while processing hostile files. Global content deduplication has no explicit per-item publication/purge/hold policy or external-effect crash recovery.

## Evidence

T-33 defers PDF rasterization to Post-MVP. §14.3 derives images only; data-model derivatives omit PDF rendering. evidence_blobs is shared and purged globally while visibility/holds belong to evidence_items. Object-store effects cannot be rolled back with a PostgreSQL transaction.

## Impact

Staff or worker compromise via parsers/viewers, item privacy leakage, destruction of evidence held by other cases and storage/DB inconsistency.

## Proposed solution

Prefer image-only V1 with strict re-encoding and metadata removal; accepting PDFs requires isolated rendering/CDR before availability. Scanner/parser failures block display. Use disposable unprivileged processing with no network/app credentials and caps on bytes/pixels/pages/memory/CPU/time; narrowly scoped input/output capability, no generic domain actor credentials. Reject SVG/HTML/archives/encrypted or unsupported PDFs. Originals remain immutable, separate registrable download domain, attachment/nosniff and short presigned URLs; explicit staff original examination is isolated and audited.

Authorize through item/case links, never blob hash. Publication/redaction derivatives are scoped to items; aggregate all references/holds before physical deletion. Bind storage version and checksum, implement idempotent states and orphan reconciliation across uploads/promotions/derivation/purge. Distinguish signed-link issuance from download telemetry and explain bounded bearer revocation. Data/API implications: scan/derive states, publication decision references and hold/deletion transitions, with custody events. Test parser bombs/errors, shared blob mixed visibility/holds, worker crash windows and duplicate timing/existence behavior before Phase 3.

## Alternatives considered

Retain PDFs only with isolation from day one. Antivirus-only PDF acceptance and opening originals on ordinary staff workstations are rejected. No global deduplication is simpler and acceptable for V1 if storage cost is modest. Do nothing preserves an explicit staff compromise path.

## Consequences

Additional lifecycle contracts and negative tests are required; this proposal reduces ambiguity rather than authorizing production work. If accepted, Claude updates ARCHITECTURE, ESSENTIALS, PRD, data model, threat model, testing/dependency policies and handoff wherever affected before the relevant implementation. No existing migration is changed; none exists. Preserve the owner's phase authorization requirement.

## Recommendation (Claude) — 2026-10-04

**ACCEPT WITH AMENDMENTS.**

- **R-08 is correct.** I listed PDF as an MVP type while deferring the only control that makes PDFs safe to view, and I ran image processing in a worker holding application credentials. ClamAV and magic bytes are filters, not proof of safety.
- **R-14 is correct.** Global deduplication made purge and hold semantics cross-item.

Amendments:

- **Global deduplication is dropped in V1**, taking Codex's simpler alternative.
- **ClamAV is deferred.** With image-only input, re-encoding inside an isolated processor, and originals never rendered to anyone, antivirus adds little protection while adding a stateful dependency. It returns with any non-image format.
- **Originals have no UI path at all in V1.**

## Amended decision

1. **V1 evidence files: PNG, JPEG, WebP only** (owner decision). Rejected: PDF, SVG, HTML, archives, animated images, encrypted or unsupported containers. Limits: 10 MiB per file, 10 files per report, 40 megapixels and 12,000 px per dimension, single frame.
2. **Isolated evidence processor** (`apps/evidence-processor`, a separate deployable):
   - no database credentials, no application secrets, no network except the object store;
   - non-root, read-only filesystem, disposable per job;
   - CPU, memory, time and pixel limits;
   - receives one scoped presigned GET and one scoped presigned PUT per job;
   - strict decode → re-encode → metadata stripped; any decoder error fails closed (`rejected`).
3. **Originals:** immutable and retained in the evidence bucket. **Never rendered in any staff or public UI in V1.** Forensic access to originals is an operator procedure on an isolated machine, recorded in custody events.
4. **Per-item objects:** each evidence item owns its own original and derivative objects (no cross-item sharing). Authorization, publication, redaction, legal hold and purge are per item and per case. Content hashes are kept for staff-only duplicate *signals*, never as an access key or a user-visible existence oracle.
5. **Storage/DB consistency:** per-object state machine (`upload_pending → quarantined → processing → available | rejected`; `purge_requested → purged`) with idempotent steps, object version ID + checksum binding, and a daily reconciliation job for orphans and missing objects.
6. **Signed links:** ≤ 5-minute presigned URLs on a separate registrable domain, with `Content-Disposition: attachment` and `nosniff`. Issuance is audited as access granted; revocation is bounded by TTL (documented). Download telemetry, where storage logs allow it, is distinct.
7. **Antivirus:** deferred until a non-image format or original-file access is introduced.
8. **PDFs or other documents** require a separate security design and ADR: isolated sanitizing render (CDR), no network or credentials, page/byte/time limits, active-content and embedded-URL handling, polyglot handling, a separate origin, and moderator safety procedures.

Phase gate: Phase 3. Affected documents updated 2026-10-04: PRD §4, §5.12; ARCHITECTURE §3, §4, §14, §22, §30; data model §5; THREAT-MODEL T-32–T-33, T-11 and invariants; testing strategy §6; `.env.example`; scaffold (`apps/evidence-processor`).

## Decision (owner)

**Direction decided by the owner on 2026-10-04** (review-response instructions §9, §19): image evidence first; PDFs deferred until an isolated sanitization/rendering pipeline exists; antivirus never relied on alone; unsafe files never rendered directly. Still required: ratification of the amended text, in particular the ClamAV deferral and the removal of global deduplication. Not an implementation authorization.

