# Phase 9b plan: image evidence

| Field | Value |
|---|---|
| Requested | Owner, 2026-10-17 ("let do the 9b"). Phase 11 paused at the owner's request |
| Gate | **ADR 0020 accepted** (hosting), plus the owner's staging risk acceptance. No code before that |
| Design | ADR 0004 (accepted with amendments), ARCHITECTURE §14.3–§14.6, data model `evidence_items` / `evidence_custody_events` (states already migrated in 9a) |
| Limits | Images only (PNG, JPEG, WebP), 10 MiB per file, 10 per report, 40 megapixels, 12,000 px per side, single frame. Originals never shown in any UI. Staging takes test images only |

## Slices

| # | Slice | Contents | Tests |
|---|---|---|---|
| 1 | **Processor** | `apps/evidence-processor`: one internal route; URL allowlist (our bucket host, bucket and prefixes only); magic bytes; limits; decode, re-encode, strip metadata; fail closed; output `{width, height, derivativeSha256, processorVersion}` | Corrupt files, decompression bombs, animated images, oversize, wrong type disguised by extension, metadata (EXIF GPS) removed, foreign URLs refused; an import-boundary test (never imports `db`, `domain`, `config`) |
| 2 | **Storage and upload** | S3 presigning in a small storage module; API upload route (streaming, 10 MiB hard limit, SHA-256 while streaming, quotas, exact Origin); quarantine object + evidence item in one transaction with the `evidence.process` job | Limit and quota negatives; authorization matrix; a crash between storage and database leaves a reconcilable orphan, never a visible item |
| 3 | **Worker orchestration** | `evidence.process`: hash check, 5-minute presigned URLs, processor call, derivative re-check, original copied to `evidence`, quarantine deleted, custody events; `rejected` with a reason on any failure; daily reconciliation | Stale and duplicate jobs (no resurrection), processor timeouts, a processor returning a wrong hash or size |
| 4 | **Access** | Staff derivative viewing via 5-minute presigned links (audited issuance, `attachment`, `nosniff`); public derivatives only when published with a finding; redaction creates a new derivative | Private items never public; links expire; members see only their own items |
| 5 | **Web** | Upload in reports, project suggestions and corrections; staff evidence panel with derivatives; live adapters | Component and E2E tests (local MinIO) |
| 6 | **Ops** | Runbook for the owner: storage account, buckets, scoped keys, the processor service on Render, settings copied without pasting secrets into chat; then a staging check with a test image | Hosted check by the owner |

## Owner decisions needed

1. **ADR 0020:** accept or amend the staging hosting, and sign the risk acceptance (test images only on staging).
2. Choose the storage provider at sign-up (Backblaze B2 or Cloudflare R2), using the conditions in ADR 0020.
3. Production processor hosting is decided later with O-4 (launch requirement).
