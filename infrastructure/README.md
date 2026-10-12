# infrastructure/

**Status:** intentionally empty. No infrastructure has been created, deployed or purchased.

## Planned contents

| Path | Phase | Contents |
|---|---|---|
| `local/compose.yaml` | 7 | Local development services only: PostgreSQL (same major as production), MinIO (S3-compatible), Mailpit (SMTP + web UI). Images pinned by digest. Local data directories are git-ignored. No antivirus service (deferred, ADR 0004) |
| `local/evidence-processor` | 9 | Local run profile for `apps/evidence-processor` with network restricted to MinIO, non-root, read-only filesystem (mirrors production isolation) |
| `local/init/` | 7 | Database role creation for `blacklist_migrator` / `blacklist_app` (local placeholder passwords only), bucket creation |
| `deploy/` | After hosting decision (O-4) | Container definitions and infrastructure-as-code for staging/production |

## Rules

- No real credentials anywhere in this directory. Local services use throwaway placeholder passwords that are never reused elsewhere.
- Production infrastructure is created only after the owner approves the hosting decision and explicitly authorizes it.
- Deployment topology: ARCHITECTURE.md §30.
