# ADR 0020: Hosting for image evidence (Phase 9b) on staging

| Field | Value |
|---|---|
| Status | **Proposed** |
| Proposed by | Claude, 2026-10-17, on the owner's request to start Phase 9b |
| Reviewed by | Pending (Codex review recommended: it changes an isolation boundary) |
| Decided by | Pending project owner |
| Affects | ARCHITECTURE §14.3, §14.4, §30; ADR 0004 (isolation requirements); `.env.example` (S3 and processor names already listed); THREAT-MODEL T-32, T-33, T-11; O-4 |

## Problem

Phase 9b adds image evidence:

- an upload path in the API;
- three object-storage buckets (`quarantine`, `evidence`, `derivatives`);
- an isolated evidence processor (`apps/evidence-processor`) that decodes hostile images.

ADR 0004 and ARCHITECTURE §30 require the processor to have:

1. no database credentials or application secrets;
2. outbound network access **only** to the object store;
3. inbound traffic **only** from the worker;
4. a non-root user, a read-only filesystem, CPU, memory and time limits, and disposable instances.

The project has no object storage, and its only host (Render, free plan) cannot meet requirements 2 and 3. Phase 9b may not start until hosting is decided (AI_HANDOFF).

## Evidence

- **Render (official docs):** free web services can send private-network traffic but **cannot receive it**, so a free processor cannot be private. Render offers no per-service outbound restriction; dedicated outbound IPs are a workspace feature and not a firewall. A paid private service could receive private traffic but still has unrestricted outbound access.
- **Object storage:** Backblaze B2 and Cloudflare R2 both advertise a permanent 10 GB free allowance and an S3-compatible API with presigned URLs. Third-party sources disagree on whether either needs a payment card. Whether each supports versioning or object lock on the free allowance was **not confirmed** from official sources while preparing this ADR, so it must be confirmed at sign-up (see "Conditions").
- Existing code and config: `.env.example` already lists `S3_*`, `EVIDENCE_DOWNLOAD_ORIGIN` and `EVIDENCE_PROCESSOR_URL`. The 9a migration already holds the image evidence states, unused. `apps/evidence-processor` is a README-only scaffold.

## Impact

- Without a decision, 9b cannot start. Reports and project suggestions refuse images, and moderators cannot see screenshots, which are often the main evidence in scam reports.
- Running the processor inside the existing worker (the easy path) would put hostile-image decoding next to the database credentials and auth secret. ADR 0004 rejected exactly that.

## Proposed solution

### For staging (free)

1. **Object storage:** one Backblaze B2 account (or Cloudflare R2, whichever passes the conditions below), created by the owner.
   - Three **private** buckets. The `evidence` bucket uses object lock or versioning, if available.
   - Two narrowly scoped keys:
     - an **API/worker key** on the API and worker only. It can write to `quarantine`, read and write `derivatives`, and write to `evidence` but not delete from it;
     - **no key at all** on the processor.
   - Downloads use the provider's own domain, which is a separate registrable domain from the site (ARCHITECTURE §14.4).
2. **Processor:** a third Render **free web service**, `blacklist-staging-evidence`, built from `apps/evidence-processor`.
   - **No secrets of any kind** in its settings: only non-secret limits and the object store's hostname.
   - It accepts a job only if both presigned URLs point at **our** bucket hostname and the expected bucket and key prefixes. Without our storage keys, nobody can create such URLs, so a stranger cannot make it fetch or process their own file. The API's upload path, with its quotas, stays the only way in.
   - Image limits, magic-byte check, fail-closed decoding and metadata stripping are exactly as ADR 0004 requires. Strict per-job time and memory limits run inside the process.
   - The service runs as non-root in Render's container. Render free does not offer a read-only filesystem or a fresh instance per job; this gap is recorded below.
3. **Worker:** orchestrates only, as in ARCHITECTURE §14.3:
   - it verifies hashes;
   - it issues presigned URLs that last at most 5 minutes;
   - it calls the processor's public HTTPS address;
   - it never parses the image.
4. **Accepted staging gaps** (owner risk acceptance required):
   - the processor's address is public (inbound only from the worker is not enforced by the network);
   - outbound traffic is not restricted (only object store is not enforced);
   - instances are not disposable per job, and the filesystem is not read-only.

   Because the processor holds no secrets, a compromised processor can reach nothing private. The remaining risk is that it **falsifies or poisons later derivatives** it processes until it restarts. Mitigations:
   - the worker re-checks each derivative's dimensions, format and hash;
   - staff can reprocess an item;
   - **staging accepts test images only** (no real victims' screenshots) until production hosting meets ADR 0004 in full.

### For production (decided with O-4, not now)

The processor must run where outbound traffic can be limited to the object store, inbound traffic to the worker, and each job gets a fresh, read-only, limited container. Examples: a container platform with network policies, or per-job sandboxed machines. This will probably cost money and is part of the launch checklist.

### Code (once accepted)

The full slice plan is in [docs/phase9b-plan.md](../phase9b-plan.md). New dependencies need entries in `docs/dependency-policy.md`:

- `sharp` (libvips) in the processor only;
- a small S3 request signer for presigned URLs in the API and worker;
- MinIO in Docker for local tests only.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Decode images inside the existing worker | Rejected by ADR 0004: an exploit lands next to the database credentials and auth secret |
| Paid Render private service for the processor (about the price of the cheapest paid instance per month) | Fixes inbound only; outbound is still unrestricted. Worth it later only if combined with other production needs |
| Decode images in WebAssembly inside the API | The sandbox is better than native code, but it still runs in a process holding every API secret |
| Wait for production hosting (O-4) before any 9b work | Safest, but blocks evidence entirely; staging with test images only gives most of the value at low risk |
| Do nothing | Reports stay text-only |

## Consequences

- **Owner work:**
  - create the storage account, buckets and keys;
  - create the third Render service;
  - copy the settings (the steps will be in a runbook; never paste keys into chat);
  - sign the staging risk acceptance.
- The THREAT-MODEL gains a staging note on T-32 and T-33 (processor isolation not enforced by the network on staging).
- When accepted, ARCHITECTURE §14.3 and §30 and ARCHITECTURE-ESSENTIALS are updated in the same change, along with the AGENTS.md status, AI_HANDOFF and the launch checklist. The checklist gains "evidence processor meets ADR 0004 isolation in production".

## Conditions to confirm at sign-up (before any key is created)

1. The storage provider's free allowance needs no payment, or the owner accepts adding a card with a zero spending limit.
2. Private buckets, S3 presigned GET and PUT, and an expiry of 5 minutes or less work.
3. Object lock or versioning is available for the `evidence` bucket. If not, record it, and originals rely on the API key lacking delete permission.
4. Keys can be limited to specific buckets and permissions.

## Recommendation (Claude)

**Accept for staging only, with test images only.** Production keeps ADR 0004's full isolation as a launch requirement.

## Decision (owner)

Pending.
