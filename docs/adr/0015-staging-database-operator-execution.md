# ADR 0015: Render-only staging database operator execution

| Field | Value |
|---|---|
| Status | **Accepted by owner — implementation authorized; Claude independent review pending** |
| Proposed by | Codex, 2026-10-13 |
| Reviewed by | Claude recommendation pending |
| Decided by | Owner, 2026-10-13: “accept it do it fast please” |
| Affects | Staging operator execution/credential boundary; hosting ADR0014; T-45/T-48/T-49; no application schema, identity protocol or API/worker redesign |

## Problem

The owner wants database preparation without Windows terminal work. This Codex cloud machine cannot establish native PostgreSQL to the selected Neon staging endpoint. The existing Free Render API/worker remain suspended; Free Render does not provide an operator shell or one-off/pre-deploy execution. Their application processes must never receive provisioner/migrator credentials or run migrations on startup.

A new credential-carrying operator service is a separate security boundary. AGENTS.md §6 requires Claude review and owner acceptance before implementing that change. The owner subsequently accepted this operator plan and authorized its execution. This session instruction authorizes scoped implementation/activation; it does not represent a Claude recommendation or production launch approval.

## Evidence

- Selected target remains Neon project `curly-thunder-05276273`, branch `br-wispy-unit-b95vz858`, direct host `ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech`, database `blacklist_staging`, PG18/Frankfurt. The original US project is outside scope.
- Latest direct IPv4 TCP probes fail errno111. Existing proxy CONNECT closes a native PostgreSQL SSLRequest; a verified direct TLS probe does not negotiate PostgreSQL ALPN. No DB login/password/SQL was sent; none of these probes proves a PostgreSQL session or provider outage.
- Render API create/get/env access has worked for the two existing Free Frankfurt services in owner workspace `tea-db6vhoij9qps73amsn50`. They remain suspended; operator-to-Neon reachability from Render is **untested**.
- Existing `provision.mjs` and `migrate.mjs` preserve the approved SQL role split and seven migration files. Eleven local deployment/provisioning/migration/restore tests passed in the previous preparation session; no new remote execution occurred here.
- GitHub repository is **public**. Workflow/run inventory returns200/count0. Actions permission and repository-secret administration return403 with `Resource not accessible by integration`; environment inventory is readable. This does not establish workflow dispatch write permission. No workflow is registered on the current default branch `chore/initial-repository`.
- Official sources: [Render Free](https://render.com/docs/free), [Docker](https://render.com/docs/docker), [Docker secrets](https://render.com/docs/docker-secrets), [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions).

## Impact

Keeping the present topology requires an owner/operator PC with native connectivity. An isolated Render operator could run the same scripts through Render's network using the already connected provider, preserving GitHub as source-only and keeping the API/worker free of DDL. It introduces temporary privileged compute, protected secret storage, restart/partial-failure handling and additional free-quota consumption that need review.

## Accepted solution

Use **short-lived, separate Free Docker web-service executions on Render**, Frankfurt, from one explicitly reviewed feature-branch commit. This is an operator execution workaround, **not Render's paid one-off-job feature**, a permanent background worker or an application endpoint.

1. **Review/cost prerequisites:** accept this ADR, explicitly approve the operator activations, verify actual Free instance/build/egress quota and zero-spend behavior. Preserve the two existing services suspended, auto-deploy off. No paid service, disk, upgrade, monitoring add-on or autoscaling.
2. **Immutable build:** pin and verify the Node24.21.0 base-image digest; use pnpm12.7.0, the frozen lockfile and existing dependency policies. Preserve workspace symlinks/source layout. Install/build without credentials accessible to dependency scripts. Verify exact commit/image, Docker context/layers/history/provenance and secret absence before privileged execution. No new application dependency or package-manager-policy exception.
3. **Runtime-only secrets:** Render automatically translates ordinary service env values into Docker build arguments. Therefore do **not** put DB credentials/control tokens in ordinary operator service env/ARG. Use a protected runtime secret file; explicitly exclude its filename and all local secret files from Docker context, never declare credential ARG/ENV or mount/read a build secret. Render docs say secret files are otherwise copied into build context; non-reference alone is insufficient. Run non-root with the documented secret-file access group. Validate JSON/unknown fields and fixed target/roles; never print contents.
4. **Provisioning phase:** fresh privileged container receives only stage provisioner credentials plus independently generated role passwords and its own status-control token. Exact host/database/PG18/verified-TLS/empty-target preflight precedes writes. Execute the existing `infrastructure/render/provision.mjs` in a minimal environment. Verify role flags/membership and expected grants. Stop/suspend/remove that execution and its privileged secret file before the next phase. Never silently reset existing passwords, broaden unsafe roles or continue against unexpected populated state.
5. **Migration phase:** a separate fresh container receives only the stage `blacklist_migrator` connection and `blacklist_app` connection, no provisioner or cloud-operator API key. Run the existing `infrastructure/render/migrate.mjs` twice, verify all seven hashes, 27 application tables, TLS/role/grant/queue/audit boundaries with catalog checks and narrowly scoped rollback-safe negative tests. No user records or tokens in output; no test accounts. Preserve per-file transactions/checksums/advisory locks. Existing reviewed backfills/constraint replacement/retirement of legacy pending approvals remain unchanged; first execution targets the empty staging DB.
6. **Status/trigger boundary:** only the approved container entrypoint starts the bounded operation; no HTTP command/SQL/credential upload endpoint. GET/HEAD health reports container liveness only. Separate status requires an independent constant-time checked header secret and returns only an allowlisted run ID/commit/phase/booleans/counts/generic codes. A public health200 never means migration success. Limit execution time and prohibit automatic retries/redeployment, schedules and keepalives. Provider restarts must fail closed rather than rerun provisioning against existing state; partial recovery requires review using retained original credentials/journal.
7. **Credential continuity:** generate role credentials once. Retain the migrator/runtime URLs in protected operator-only Render storage that is **never linked to API, worker or build environments**, so an interrupted controller does not lose them. Review storage API support/access/retention before choosing its concrete representation. Delete the temporary provisioner copy after the provisioning phase. Keep the retained migrator credential outside runtime. No actual value in source, logs, images, artifacts, GitHub secrets or chat.
8. **Controller and runtime settings:** the existing trusted controller uses its Render HTTPS binding; neither job receives that API key. Only after authenticating successful protected phase results and matching exact source/target/hash/grant evidence, write the `blacklist_app` direct `sslmode=verify-full` URL into both existing services' protected DATABASE_URL fields. Preserve every other setting and their suspended state. This replaces the current API provisioner/pooler URL; do not label a syntactically correct but unverified URL safe.
9. **Cleanup:** suspend and remove temporary execution services and files; remove unused privileged copies while retaining the reviewed operator-only migrator storage for later authorized migrations. Verify no operator credentials on API/worker/web, both services still suspended, no paid resource and no unexpected deployment. Preserve database records, journal and SQL; never reset/drop a DB for cleanup.
10. **Availability remains separate:** no API/worker resume, PR merge, Vercel production change, public launch or Phase8. Cloud restart persistence/provider restore, hosted auth/email/ingress and existing coverage/audit/browser/Claude/identity-recovery gates remain open. Real Render-to-Neon connectivity and this executor are not yet tested.

Implementation must be modular: build/container definition, secret/target validation, phased process orchestration and read-only verification are separate modules. Reuse current script entrypoints; do not embed business logic/SQL in HTTP handlers. Tests must prove bad targets/TLS/roles/files, secret redaction, restart/partial failure, forged status, source mismatch, role/credential separation, repeat/checksum checks and cleanup. A Docker build alone is not database evidence.

## Cost and quotas

- New service **base price: $0 on Free**, only within verified included limits. Plan two serial bounded executions; at most one extra active instance. A 30-minute aggregate active window consumes about 0.5 of the workspace's shared 750 monthly Free instance-hours. This is a planning bound, not measured usage or a quote.
- Builds and outbound traffic consume separate included budgets. Official Render docs say supplementary bandwidth/build usage can be billed when a payment method is present; builds can be disabled at the spend limit. **Free plan does not guarantee a zero total bill.** Owner confirmed no payment method saved; official no-card allowance-exhaustion behavior establishes the scoped zero-charge basis. Actual remaining quotas are unverified and may stop execution. Do not add a card or change billing settings without explicit approval.
- No extra Neon project/database, Resend email, Vercel seat or external registry/monitoring subscription is required. Neon existing Free compute/storage/history limits still apply. Docker base pulls must use an approved public artifact; no paid registry.

## Alternatives considered

- **Owner PC/local Codex:** already documented, no new operator service; owner asked for another route.
- **GitHub Actions manual job:** standard hosted runners are free for public repositories, but this credential cannot administer Actions/secrets; no registered workflow exists. Secure staging-secret storage would need an explicit exception to source-only GitHub handling, environment/ref/commit controls, action SHA pinning, no secrets during dependency installation, and a safe default-branch registration decision (current default is also the Vercel production branch). Actual dispatch permissions/connectivity are untested. Do not change the default branch/production settings or merge PR8 as a workaround. This is a secondary separately reviewed option, not activated.
- **Neon browser SQL editor:** can perform individual SQL commands, but does not execute the existing Node migration runner's pg-boss provisioning/checksum protocol. Do not present a partial manual schema setup as complete integration.
- **Paid Render shell/one-off job:** potentially simpler operator execution, but contrary to the current free-only authorization; requires an itemized approved budget and credential-boundary review.
- **Run DDL on API/worker startup, reuse provisioner at runtime, substitute HTTP/serverless driver, weaken TLS or fake success:** violates current requirements.
- **Do nothing:** leaves staging unavailable.

## Consequences

Owner acceptance authorizes the scoped executor implementation and activation; hosting/threat/operations docs record the added boundary. No billing/default-branch/application activation changes are authorized. Validate protected secret-file/storage API behavior and Docker secret exclusion, failure/cleanup paths and actual network access before privileged execution. Existing baseline failures are not waived. Rollback concerns executor configuration only; keep any successfully applied migrations/data and original credentials for reviewed recovery.

## Recommendation (Claude)

Pending: review the additional privileged execution/storage boundary, Docker build-secret isolation, two-phase lifecycle/restart behavior, quota assurance and cleanup evidence. Accept/reject/amend explicitly.

## Decision (owner)

Accepted by owner on 2026-10-13, including scoped temporary Free operator activation. Owner subsequently confirmed no payment method is saved. Per official Free-plan documentation, allowance exhaustion stops services/builds without overage billing in that situation; this fact is owner-reported, not API-verified. No billing changes or paid fallback. Claude independent review remains pending. Existing API/worker resume and PR8 merge require separate explicit approval.
