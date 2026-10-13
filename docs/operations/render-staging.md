# Render + Neon + Resend foundation deployment

Status: **public foundation site, API and worker live; signed-in SSR/dashboard blocked**. Owner explicitly authorized PR8 merge, public activation and removal of the Vercel visitor gate after the disclosed blockers. Both existing Free Frankfurt Render services deploy merged source `ef3844755ca95e58ba65880b7521165910c36143` from main, auto-deploy off, healthy DB-backed status200. The existing Vercel branch preview is public and returns200; its source tree is identical to that merge. Only project-level visitor SSO protection was removed; no application permission, cookie, CSRF, TLS or API/internal credential check changed. This is a public foundation deployment using the existing staging database, not production readiness or later business functionality. Earlier suspended/protected checkpoints below are historical; the latest public activation evidence and AI_HANDOFF take precedence.

## Owner-authorized public activation — 2026-10-13

[Actual rollout evidence](../evidence/2026-10-13-public-foundation-activation.json): PR8 merged, both Render deployments live at the exact merge, homepage/login/API health/worker health200, ten hosted public/negative API checks passed. Internal SSR viewer still returns404 with correct server credentials because trusted peers are unset; signed-in dashboard remains unavailable. Never fix this by bypassing the peer/internal-token checks or guessing broad CIDRs. No email/account seed or migration rerun. Coverage/full development audit and other hosted/recovery/review gaps remain unresolved; the owner's instruction authorized the rollout, not passing-test claims. Vercel project-level SSO removal affects matching project deployments; production branch/env/domain settings were not changed. No production database or billing change. Free cold starts, worker idle sleep and restricted Resend default sender still apply.

## Finalization after owner review

See [finalization review](../reviews/2026-10-13-staging-finalization.md) and [actual check results](../evidence/2026-10-13-staging-finalization.json). Database preparation is complete; do not repeat provisioning, regenerate role passwords or rerun cloud jobs as onboarding. Local builds/tests and the ingress adversary regression pass, but required coverage and full audit fail. Actual trusted proxy CIDRs are unset, so internal viewer/SSR fails closed. Obtain authoritative ingress peers/header guarantees or a specific approved architectural resolution; never guess broad CIDRs or remove the peer check. Owner review is recorded separately from pending independent Claude review. Keep application activation and conditional merge blocked until required checks pass; no further credential entry or repeat approval of the completed database job is needed.

| Required report item | Actual status | Evidence / limit |
| --- | --- | --- |
| Repository / Phase 7 | Tested | Main `ece2e76`, Phase 6 repairs and preserved stash unchanged; PR #8 is unmerged |
| Backend architecture | Implemented | Existing Fastify API, separate pg-boss worker, headless Better Auth; Node24.21.0 / pnpm12.7.0 preserved |
| Database architecture | Tested | Existing Drizzle/pg, ordinary SQL roles, 27 application tables, 16 queues; no later-phase business schema fabricated |
| Render API configuration | Implemented | Free Frankfurt, repository-root build/start wrappers, protected runtime settings, auto-deploy off, suspended |
| PostgreSQL configuration | Tested | Free PG18 Frankfurt, direct endpoint, certificate/hostname-verified TLS, app role restricted; actual SQL proof in prior cloud receipt |
| Staging deployment | Blocked | Database executed in staging; API/worker application deployment remains held |
| Hosted health | Blocked | Both reserved URLs return provider HTML503, not application health |
| DB connectivity | Tested | Actual native Render-to-Neon TLS/SQL proof; this cloud development machine still lacks TCP5432 access |
| Security review | Blocked | Negative ingress/role tests pass; full audit/coverage/actual ingress remain unresolved |
| Automated checks | Blocked | Passed unit/integration/build/type/lint checks and individual browser results are in finalization evidence; coverage/audit failures remain mandatory |
| Environment inventory | Implemented | Safe `.env.example` and inventory below; server-only DB/signer/mail values excluded from frontend; no secret values in evidence |
| Hosting costs | Implemented | Selected new Free resources base0USD within allowances; no card owner-reported, quotas unverified; no paid fallback or always-on worker promise |
| Files / GitHub | Implemented | Ingress regression, finalization evidence/review, current runbook/rulebook/handoff on infrastructure branch / PR #8; publication readback recorded after push |
| Remaining blockers | Blocked | Coverage, upstream dev advisory, trusted ingress, hosted workflows/recovery and independent review; other mail recipients require a verified domain |
| Production readiness | Blocked | No production activation, managed recovery/launch/legal decisions or readiness claim |
| Phase 8 | Blocked | Not authorized or started; owner/Claude must resolve foundation gates and decisions before proceeding |

The selected review template is `infrastructure/render/blueprint.staging-neon-free.yaml`: a free API and a **separate** free web-hosted worker with only a status listener. `infrastructure/neon/project.staging.json` is a reviewed project specification, **not an API creation payload**. No project/service/credential value or public URL is fabricated. Earlier Render-database/free and paid templates are superseded alternatives, never selected or applied.

A free web worker is an optional hosting adapter for the existing separate worker; it has no user/business API, no signing/internal/staging token, no new permissions and no automated keepalive. It sleeps after 15 idle minutes, so testers must wake it before a synthetic test window. It is not an always-on background-worker guarantee. Actual provider deployment and acceptance of these operational limits remain review items.

## Verified source and boundaries

GitHub `main` contains Phase 7 implementation `baafe57220b5b42c4e457d92bbae43cf468ff5fd` and publication receipt `ece2e769fafc9a381ed1b540ae8b7e05fccdbab5`. It was pushed directly at owner instruction; no PR merge occurred. GitHub's default remains `chore/initial-repository`, so explicitly select the infrastructure review branch or reviewed commit. Preserve Phase 6 PR #7 (`4b16cdb`) and the preservation stash.

- `apps/api/src/main.ts`: Fastify 5.12.5, thin routes, Node 24.21.0, pnpm 12.7.0, TypeScript 6.0.3. Render maps `PORT` to `API_PORT` and binds `0.0.0.0` through the runtime wrapper.
- `apps/worker/src/main.ts`: pg-boss 12.37.0; the separate worker is required for registration/reset/invitation/security mail and cleanup. A healthy API without its worker does not complete authentication workflows.
- `packages/db`: pg 8.23.1, Drizzle ORM 0.45.3, reviewed SQL and checksum/advisory-lock migrator. Twenty-seven application tables cover identity, staff, audit and security-mail state. Project/submission/evidence/finding/score/appeal/chain backend tables and endpoints are **not implemented**; their approved designs and frontend contracts remain future phase dependencies.
- Better Auth remains headless for credentials/sessions only. No handler/plugins/cookie cache, cross-domain cookies, bearer login, identity protocol redesign, or mocked authorization is added. Exact-Origin checks, resource/session/version checks, staff assurance, independent approval, audit and recovery barriers remain mandatory.

The Vercel browser talks to **its own** `/api/v1/*`. Its Next server rewrites to the actual Render HTTPS API URL using server-only `API_INTERNAL_URL`. `APP_ORIGIN` is the exact protected Vercel staging origin, not Render's hostname. `WEBAUTHN_RP_ID` is that origin's hostname. Preserve `__Host-bl_session; Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain. **CORS remains disabled**, as identity §11 requires. Do not set a public Render API base URL or broaden origins for preview wildcards.

Vercel cannot resolve Render private-network hostnames. Its API URL must use Render's external HTTPS endpoint; Neon's database uses a direct, certificate/hostname-validated TLS endpoint; that transport exception is approved for staging only. Internal viewer GETs still require the independent internal token and a correctly configured trusted peer. Verify Render ingress peer CIDRs and forwarding-header sanitization and the Vercel SSR path before enabling staging. Do not trust `0.0.0.0/0`, invented ranges, or arbitrary forwarded headers. If the hosting ingress cannot meet these requirements, stop and seek Claude's architecture decision.

## Restricted access

Enable **Vercel Authentication** on the actual staging/preview deployment for the authorized team/testers, and verify access in a signed-out browser before exposing a usable staging app. Authentication itself is available on all plans; account-specific team/seat changes may cost extra; do not modify the existing production project or subscribe without owner approval. Never embed or publicly share a deployment-protection bypass token.

The API has a supplemental staging ingress gate: `DEPLOYMENT_ENV=staging` requires an independent `STAGING_ACCESS_TOKEN`. Only the Next server injects it for `/api/v1/*` or its private SSR viewer GET. Client-supplied staging headers are removed/replaced. Direct Render access without it returns generic 404. It grants **no user or administrator authority**: normal authentication, exact Origin/JSON, version, assurance, permission and domain checks still run. The shared token is server-only and must not equal the signing or internal token.

Generate that token with a CSPRNG: at least 32 random bytes encoded as **base64url**, installed directly in protected Render/Vercel settings without terminal/chat output. Render's `generateValue` uses standard base64, which may contain characters this token intentionally rejects; the Blueprint therefore requires a separately supplied `sync: false` value. Do not weaken validation to accept unsafe header values.

The sole unauthenticated ingress exception is GET/HEAD `/healthz`, returning only `status: ok` after a database `SELECT 1`; outages return sanitized 503. No account, queue, credential or database detail is exposed. Vercel Authentication alone would not protect a directly reachable Render API, so both restrictions must be verified.

## Compatibility and remaining blockers

Render/Vercel/Resend official documentation and Render’s current JSON schema were read successfully after the initial network restriction was updated. Neon’s official website initially returned HTTP 403; its **official `neondatabase/website` source** supplies current role, version, pooling, region, TLS and plan documentation (retrieved 2026-10-13). Source links are below. Corrected credentials now work; provider results and remaining operational blockers are recorded below.

- **Database:** require PostgreSQL 18 for `uuidv7()`; confirm `pg_version` and `SELECT current_setting('server_version_num')` on the actual Neon staging project. Use Frankfurt `aws-eu-central-1`, a fresh empty synthetic-only staging project, independent credentials and a direct endpoint. Do not clone production data, sessions, signer or roles into staging.
- **TLS:** preserve `verify-full` and hostname/CA validation. The owner expressly accepts the authenticated public Neon endpoint for staging; this supersedes the former Render-private-DB mismatch. It does not authorize unverified/plaintext TLS or a production transport decision. URLs allow exactly one `sslmode=verify-full` parameter and reject user/host/mode overrides. Safely construct role-specific URLs in memory/secret stores; never print them.
- **Roles:** Neon console/CLI/API-created roles inherit privileged `neon_superuser`. Only the owner/provisioner uses those credentials in an operator session. Create runtime/migrator roles **with SQL** using the prepared operator helper; runtime must have no CREATEROLE/CREATEDB/BYPASSRLS/schema-owner membership or DDL/TEMP. Startup and tests enforce this. Never use `neondb_owner` as runtime.
- **Connections:** use **direct, non-`-pooler` hosts** for both runtime and migrations. Keep the existing pg pools (max 10 each), session timeout options and migrator session advisory lock; Neon transaction pooling does not preserve session-level state. No serverless/HTTP driver, PgBouncer mode change, Neon Auth, Data API, Functions, Object Storage or AI service is introduced. Verify actual direct connection limits and cold-start behavior before declaring connectivity passed.
- **Worker:** a free Render background-worker plan does not exist. The prepared separate web-hosted worker starts its optional health listener only after DB/queue/consumer startup; each safe health probe checks DB connectivity and outages return generic 503. It has no user action routes. No actor authority comes from a health result. Free sleep/restart/750-instance-hour and outbound-traffic limits mean jobs may pause; wake the worker manually before tests and verify backlog/retry/latest-generation handling. Never combine it with the API, create a hidden keepalive, or report enqueue as delivery.
- **Operations:** Neon’s authenticated TLS endpoint permits a separate operator session without Render’s unavailable free SSH/pre-deploy/one-off features. No DDL on API/worker startup. Real TCP/TLS connectivity, pg-boss compatibility, role privileges, migrations, restart persistence and restore are still untested on Neon.
- **Accounts/front end:** all four bindings work for supported read-only requests. Neon organization plan is verified Free. Vercel project `blacklist-web` uses Node 24.x/root `apps/web`; the stable feature-branch preview origin is verified from its API and signed-out requests redirect to Vercel Authentication. Owner workspace ID is now supplied and two Free Frankfurt resources are created/suspended with ownership verified; owner-details discovery remains Cloudflare-blocked. Resend domain inventory is empty. The approved account-mailbox/default-sender transport test passed; an owned verified domain is required for other recipients. Actual Render ingress/header sanitization, logged-in Vercel SSR, database-backed activation, mail tracking/retention policy and Neon SQL/TLS/migrations/restore remain untested. Do not broaden trusted CIDRs, CORS or cookies.
- **Security:** current root/backend/proxy tests pass, but application coverage still fails its unchanged floors; the development-only braces advisory and previous complete-browser timeouts remain disclosed. Claude independent review and ADR 0013 remain pending. Free staging is not production readiness and cannot be called validated until provider/account/security checks pass.

## Free cost and limits

| Component | Selected plan | Base recurring resource charge | Limits / verification |
|---|---|---:|---|
| Render API | Free web service, Frankfurt | $0 | 512 MB class; sleeps after 15 idle minutes; may restart; free instance-hours and outbound quotas apply |
| Render worker | **Separate** Free web service, Frankfurt, status-only listener | $0 | Same sleep limits; manual test-window wake-up; no always-on claim |
| Neon PostgreSQL | Free organization/project, Frankfurt, PG18 | $0 | Official current plan: 100 CU-hours/project, 1 GB/project, 20 GB/account, 5 GB project egress, 5-minute scale-to-zero, 6-hour history up to 1 GB-month, one manual snapshot; inspect actual account/version/limits |
| Resend | Existing/free account, verified sender, sending-only key | $0 if inside verified free quota | Official page: 100 emails/day and 30-day data retention; account/monthly quota/domain/tracking verification pending |
| Vercel | Existing project, protected staging | No separate Authentication charge | Authentication is available on all plans; existing account/seats/functions/usage may already cost money and are uninspected |
| New base resource subtotal | Free plans above | **$0 within confirmed free limits** | No service created or plan changed; never assume a paid existing organization/project is free |

Do not attach billing, upgrade, create a paid worker/database, add domains/seats, enable autoscaling/monitoring add-ons or increase storage without separate itemized approval. Render’s unapproved paid comparison is $7 API + $7 worker + $6 DB + $3/10GB storage = $23/month before workspace/overages/taxes. That alternative is not the target and has no authorization.

Neon’s queues/health/polling can keep compute awake and consume CU-hours even with no human traffic. Existing worker polls every two seconds; do not silently alter job behavior or timing gates to meet a quota. Use temporary synthetic test windows, monitor actual usage and accept that reaching a free cap can suspend service rather than implying unlimited free availability.

Source: [Render pricing](https://render.com/pricing), [Render free limits](https://render.com/docs/free), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [Resend pricing](https://resend.com/pricing), official Neon [plans](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md), [roles](https://github.com/neondatabase/website/blob/main/content/docs/manage/roles.md), [pooling](https://github.com/neondatabase/website/blob/main/content/docs/connect/connection-pooling.md), [secure connections](https://github.com/neondatabase/website/blob/main/content/docs/connect/connect-securely.md), [versions](https://github.com/neondatabase/website/blob/main/content/docs/postgresql/postgres-version-support.md), [regions](https://github.com/neondatabase/website/blob/main/content/docs/introduction/regions.md). Current public pricing is evidence, not actual account inspection or an executed plan change.

## Actual provider progress — 2026-10-13 (historical checkpoint)

- **Credentials tested:** Render services 200 (unauthenticated control 401); Neon organization-scoped inventory 200; Vercel project/deployment metadata 200; Resend domain inventory 200. Neon requires `org_id` for the provided scoped key; a bare projects request returning 400 was a request-scope issue, not proof of a bad key. Render owners/projects paths return a Cloudflare HTML 403, not an established credential failure.
- **Neon staging provisioned:** project `curly-thunder-05276273` / `blacklist-staging`, Frankfurt `aws-eu-central-1`, PG18, six-hour history, fixed 0.25–0.25 CU, branch `br-wispy-unit-b95vz858` / `staging`, database name requested `blacklist_staging`, operator role requested `blacklist_provisioner`. The original `blacklist` project in `aws-us-east-2` is untouched. Only provider metadata was checked: no application schema/roles, TLS-authenticated SQL, restart persistence or restore has been tested.
- **Free compatibility:** explicitly supplying `suspend_timeout_seconds` on project creation returned 412. The request was corrected by omitting that override, retaining provider-managed Free behavior; creation returned 201 and selected region/PG18/Free organization were verified. Endpoint metadata reports timeout 0, so actual idle suspension must be measured; do not treat the documented five-minute Free policy as an executed test. Never introduce a keepalive or paid upgrade to conceal quota/cold-start failures.
- **PostgreSQL operator blocked here:** the ordinary workspace probe fails DNS resolution; an additional permitted IPv4 probe to the fresh endpoint fails with connection refusal. A metadata GET is not a PostgreSQL connection test. No TLS check is disabled, no HTTP/serverless DB driver substituted, and no migration success is claimed. Run the existing operator/provision/migrate commands below from an approved machine with direct PostgreSQL access, or obtain a reviewed separate release-runner design. Use Neon protected settings to retrieve operator credentials; never put them in API/worker, files, GitHub, frontend or chat.
- **Vercel preview identified:** `https://blacklist-web-git-chore-render-staging-deployment-skyboy.vercel.app` is the stable branch alias. The inspected immutable deployment was `https://blacklist-f0wh8qdpv-skyboy.vercel.app`, commit `fab817eb99542adab1293905116d48b6c94e5442`. Both `/login` requests without credentials return 302 to Vercel Authentication; project protection is `all_except_custom_domains`. Preview env inventory is empty and no mock-mode variable is declared. This is protection/metadata proof, not a tested backend integration or signed-in tester flow. The selected Blueprint now uses the actual stable origin/RP hostname; Render API URL and server secrets remain pending. Production branch/settings were not changed.
- **Remaining owner inputs:** Render workspace ID and permitted account mailbox are supplied; resources and transport proof are recorded below. An owned Resend sender domain (SPF/DKIM verification) is required for recipients beyond the account mailbox; an approved operator environment with TCP/5432 connectivity. Exact preview/API-documentation hostnames were added to the saved network draft; saving is not proof of publication. At that checkpoint no billable resource, Render service, email or production deployment was created; the later Free held-service and permitted transport-test results below supersede it.

## Render workspace provisioning and Vercel preparation — 2026-10-13

Owner workspace: `tea-db6vhoij9qps73amsn50`. The owner endpoint remains Cloudflare-blocked, but create/get ownership is verified. **Created and immediately suspended** in Frankfurt, both **Free**, repository root/feature branch, pinned existing commands, `/healthz`, later auto-deploy off:

- API `srv-db72r4d9fdbs73erf1s0`: reserved URL `https://blacklist-staging-api.onrender.com`.
- Separate worker `srv-db72r5ou01pc73c32l5g`: reserved URL `https://blacklist-staging-worker.onrender.com`.

These URLs identify held resources, **not live/tested applications**. Render initial deployment starts on create despite auto-deploy off; it was immediately suspended and state verified. DB/operator credentials are absent, so existing startup fails closed. API-only signing/internal/staging values were generated with a CSPRNG and stored in protected provider settings. Worker signer/gateway absence and operator-key absence on both tiers are verified. No default Neon owner URL, paid plan, fake readiness or new actor authority is introduced.

Vercel now has four **encrypted**, **preview-only**, **exact-feature-branch** entries: `API_INTERNAL_URL` set to the actual reserved API HTTPS URL; `DEPLOYMENT_ENV=staging`; internal and staging server tokens shared from the owned Render settings in memory. No value belongs in documentation/GitHub. Frontend has no DB/admin/mail/signing credential. Production settings were preserved. New branch builds will use this rewrite; hosted integration remains blocked until the backend is migrated/ready and review checks pass.

Resume services only after native-PG role/migration/TLS/grant/restore checks, sender setup and required security/ingress review. Direct PostgreSQL remains unreachable here (IPv4 refusal); use the existing operator scripts from an approved reachable environment or a separately reviewed runner. Source creation shape was verified against the official [Render CLI generated API models](https://github.com/render-oss/cli/blob/main/pkg/client/types_gen.go), without adding that CLI/dependencies to this application.

## Resend transport and protected worker settings — 2026-10-13

The owner provided the permitted Resend account mailbox; its address is kept out of source, evidence and logs. Created a fresh staging key with requested permission **`sending_access`**, using the official Resend API shape, and stored its value only in protected Render worker settings. Existing worker variables were preserved and re-read for equality; no signing/gateway/DB/operator credential was introduced. Set `EMAIL_PROVIDER=resend` and `EMAIL_FROM=onboarding@resend.dev`; worker remains suspended.

The existing `resendMailer` HTTPS adapter, using Node 24.21.0 `--use-env-proxy`, returned **`accepted_for_delivery`** for one authorized synthetic transport email. The authenticated provider receipt returned **`last_event=delivered`** and a matching message UUID. No verification token, account or database was created/accessed. Provider delivery is not a human mailbox confirmation or proof of registration/reset/token finalization. The initial attempt failed worker config validation on the proxy placeholder before sending; a freshly created valid key resolved it without changing validation. No key value, recipient, mail body or raw response was persisted locally or committed.

There are **zero verified domains**. The default sender is restricted to the Resend account mailbox, so additional testers require an owned verified sender domain. Tracking/link-rewriting/retention settings and full DB-backed activation remain unverified. No paid plan or billing change occurred. Sanitized evidence: `docs/evidence/2026-10-13-render-workspace-setup.json`.

For the owner-operated Windows fallback, follow [Neon staging setup from Windows](neon-windows-setup.md): pinned tools, masked passwords, empty-target preflight, separate provisioning/migration/runtime windows, catalog/hash/TLS verification and save-only settings for both held Render services. These steps are prepared, not remotely executed.

## Proposed browser-only operator alternative

The owner accepted [ADR0015](../adr/0015-staging-database-operator-execution.md) and authorized temporary Free Render operator activation. Claude independent review remains pending. Owner reports **no saved payment method**: Free allowance exhaustion stops services/builds without an overage charge, per Render documentation. Actual remaining quotas are unavailable; no paid fallback or billing change is permitted.

The implementation uses `infrastructure/render/operator/Dockerfile` with the verified Node24.21.0 digest, frozen pnpm12.7.0 policies and non-root uid/group1000. Build one dormant service with `OPERATOR_ENABLED=false`, no credentials and auto-deploy off; verify its exact source commit before activation. Ordinary Docker environment values become build arguments, so credentials/control tokens go **only** in the protected runtime secret file `blacklist-staging-operator.json`, excluded by `.dockerignore` at any depth. No build-secret mounts, credential ARG/ENV or provider API keys. `NODE_EXTRA_CA_CERTS` is an optional **public trust-bundle path** for intercepted development networks; certificate verification is never disabled.

Runtime file schema is strict JSON: common `runId` (UUID), `sourceCommit` (exact40hex), `statusToken` (independent64hex). Provision phase additionally has `phase=provision`, `adminUrl`, `runtimePassword`, `migratorPassword`; migration phase instead has `phase=migrate`, `migrationUrl`, `runtimeUrl`. Cross-phase/unknown fields fail. Values are created/retrieved/transferred in controller memory, never local files/chat/source. The file is `/etc/secrets/blacklist-staging-operator.json`, bounded16KiB, regular, no group/world write; target is the fixed direct Frankfurt staging database and roles, with exactly `sslmode=verify-full`. Source must match provider `RENDER_GIT_COMMIT`.

Use a new unlinked operator-only Render environment group to retain original runtime/migrator URLs and status tokens for interruption recovery. **Never link this group to any service/build/frontend.** Read back its empty serviceLinks before activating. Re-read service env privately and preserve unrelated settings; remove the existing privileged API URL into the operator boundary before work, and install the app URL on both held runtimes only after all phase results are authenticated/verified.

Activate through the trusted controller: install phase-specific secret file, set only nonsecret `OPERATOR_ENABLED=true`, then deploy the already-verified build (`deployMode=deploy_only`), avoiding another credential-bearing build. Entrypoint alone executes; HTTP has no write/SQL/trigger interface. GET/HEAD `/healthz` reports liveness only. `/status` needs header `x-blacklist-operator-status`; protected output is limited to run/source/phase/state/generic codes/verification booleans and counts. Child processes receive minimal phase-only environments and forward no driver output. Each child is capped120seconds, whole container20minutes, no retry/schedule/keepalive.

Provisioning checks a fresh target and absent app/migrator roles before the existing provision script, then verifies role flags/memberships/grants. Stop/remove its secret and service before creating the separate migrator container; no provisioner in phase2. Migration runs the existing runner twice and verifies seven source hashes,27schema-owned tables, queues and app permissions; rollback-safe negative checks prove no DDL/TEMP/raw verification/audit or delivery deletion. No test account is seeded. A restart against existing roles fails closed; retain credentials/applied journal and review partial failure, never reset/drop shared tables or silently rotate passwords.

After authenticated successful phase2 evidence, write only the verified `blacklist_app` URL to API/worker; verify both remain suspended and all unrelated settings unchanged. Suspend/delete only temporary executors and their files; retain unlinked migrator storage for future authorized migration/recovery. Re-run held-runtime secret checks. Hosted auth/email/restart/restore/ingress checks, baseline coverage/audit failures, Claude review and separate application-activation approval remain open. Do not merge PR8, resume API/worker, change Vercel production, or begin Phase8.

### Verified TLS at the Neon endpoint

The real Render diagnostic passed authorized native TLSSocket and SQL role/database/PG18 checks but observed `pg_stat_ssl.ssl=false` on Neon compute. This is separate from the client-to-endpoint connection: [Neon secure connections](https://neon.com/docs/connect/connect-securely) supports `sslmode=verify-full`. Enforce encrypted, certificate-authorized native TLS to the exact approved direct endpoint; retain compute's flag as informational `serverReportsTls`. Never use that flag to disable client TLS or claim the internal compute connection is TLS-encrypted. Real synthetic TLS-proxy regression checks verified frontend TLS with plaintext compute and denies wrong CA/hostname; the plaintext connector negative still fails. Target/query-option/source/role guards stay mandatory.

### Operator authorization matrix and failure diagnosis

| Method/path | Authorization | Effect |
| --- | --- | --- |
| GET/HEAD `/healthz` | Public | Container liveness only; no SQL or readiness claim |
| GET/HEAD `/status` | Independent constant-time status token | Allowlisted execution receipt, counts/booleans/static categories; no records or credentials |
| Any other method/path | Deny404 | No upload, command, retry, SQL or application action |

After a failure, suspend the executor and preserve its original credentials/journal before removing its protected file. If needed, retain its provisioner URL temporarily in the **unlinked operator-only** group; delete it after the provisioning investigation/execution completes. Never restore it to API/worker. Read-only investigation uses nonsecret `OPERATOR_INSPECT_ONLY=true`, validated strictly before any operation; mistyped values fail. Inspection calls only catalog reads through the same fixed-target verified-TLS connector, never provision/migrate scripts, and reports `failed/operator_inspection_only` rather than successful provisioning. A failed/inspected receipt cannot authorize runtime configuration or phase2. Error categories come from a fixed allowlist or recognized driver codes; arbitrary provider messages remain redacted. Log-read403 is an access limitation, not a database result. Review actual inspection evidence before any write recovery; no automatic retry, reset or password regeneration.

## Verified database integration and held application status — 2026-10-13

Latest [cloud evidence](../evidence/2026-10-13-neon-render-integration-complete.json) supersedes earlier blocked checkpoints: native verified endpoint TLS/PG18/fresh inventory, ordinary SQL roles,7hash-checked migrations run twice,27owned tables,16queues and actual app permission negatives passed on source `ede3929`. Both protected runtime URLs are tested direct `blacklist_app` / verify-full. API/worker remain suspended with auto-deploy off; all unrelated settings preserved. Temporary executors/files/admin/control copies removed; only runtime/migrator URLs retained in protected unlinked group `blacklist-staging-operator-20261013`. Never link it to a service or build. No credential/user data in evidence, no account seed/shared reset/drop or production change.

Render image reuse/restart did not expose updated authenticated runtime state in this execution. A **full rebuild of the exact same reviewed source** with phase-specific protected file excluded by `.dockerignore` and only nonsecret enable/inspection flags succeeded. No credential ARG/ENV, build-secret mount or dependency-process credential access. Treat reuse as unverified until it actually applies settings; preserve source/target checks and secret exclusion for every rebuild. `targetRoles`/`targetObjects` are inspection counters; execution defaults do not describe current roles. Actual role success separately checks exactly two safe roles.

Job health200 is container liveness. Hosted application health/auth/activation-email/password-reset/search/submission/dashboard/restart/restore tests remain pending because services are held and later business capabilities remain outside Phase7. Signed-out Vercel login remains302toAuthentication; production unchanged. Review coverage59.16%/75%, full dev audit1high, Claude review, trusted ingress (unset), sender domain/retention/recovery/monitoring before application activation; do not infer production or Phase8 readiness. Costs remain Free base0USD, no payment method owner-reported, remaining quotas unavailable and no paid fallback.

## Owner-added database URL recheck — 2026-10-13

The owner only pasted a Neon connection string into the API service. It is present on API, absent on worker, and still refers to a privileged role/pooler with `sslmode=require` and an unsupported extra query option. Its normalized endpoint matches the intended Frankfurt staging project. Existing runtime validation rejects it; services remain suspended and initial deployments canceled. External health URLs return 503 HTML, not application health. Latest direct TCP probe fails with errno 101 before authentication. No URL/password is in documentation/evidence; no provider setting/database was changed during this check.

Adding a connection string does not provision roles or application tables. From a separate approved operator machine with Node 24.21.0, pnpm 12.7.0 and native TCP/5432 access, follow steps 3–4 under **Intended deployment order** below. The exact operator-only variables are `DATABASE_ADMIN_URL`, `BLACKLIST_RUNTIME_PASSWORD`, `BLACKLIST_MIGRATOR_PASSWORD`; the later migration-only session uses `DATABASE_MIGRATION_URL`. Supply values via private environment settings/files outside the checkout, never chat/source/logs or runtime services. The two existing commands are:

```bash
node infrastructure/render/provision.mjs
```

Then, after ending the privileged session, use the separate migrator environment:

```bash
node infrastructure/render/migrate.mjs
```

Repeat migration once and validate grants/checksums/TLS/audit/queues/persistence/recovery. **These commands were not executed against Neon in this recheck.** Only after validation configure both runtime URLs with SQL-created `blacklist_app`, its separate password, direct staging host and exactly `sslmode=verify-full`; replacing just the host/TLS on the privileged URL is insufficient. The current environment cannot complete that operator step. Keep held services and existing guard checks until deployment/security reviews and hosted validation pass. Evidence: `docs/evidence/2026-10-13-neon-render-connection-recheck.json`.

## Safe environment inventory

Use Render/Vercel secret stores. Generate fresh staging CSPRNG credentials independent of local and production. The repository `.env.example` contains placeholders only. None of the following secret **values** belong in a PR, GitHub variable, log, browser bundle or backup of the credential store.

| Category | Names | Tier / handling |
|---|---|---|
| API runtime | `NODE_VERSION`, `NODE_ENV`, `DEPLOYMENT_ENV`, Render `PORT` | Node 24.21.0, production runtime semantics, staging deployment. Wrapper maps host/port; no manual `PORT` hardcoding |
| Common DB/origin | `DATABASE_URL`, `APP_ORIGIN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, optional `NODE_EXTRA_CA_CERTS` | API/worker only; direct Neon URL with SQL-created `blacklist_app`, explicit verified TLS; exact protected Vercel origin/RP |
| Auth/SSR/staging | `BETTER_AUTH_SECRET`, `INTERNAL_API_TOKEN`, `STAGING_ACCESS_TOKEN`, `TRUSTED_PROXY_CIDRS`, `BREAK_GLASS_ENABLED=false` | API; Vercel receives **only** internal and staging tokens, never DB URL or signer. Worker receives none of these tokens |
| Worker email | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | Worker only; sending-only key scoped to a verified staging domain. Fixed HTTPS endpoint |
| Optional worker health | `WORKER_WEB_SERVICE=true`, Render `PORT`, derived `WORKER_HEALTH_PORT` | Worker only; wrapper maps the assigned port to the status listener. Omit the flag for the established background-worker mode. No user routes or authority |
| Existing SMTP/local | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Existing SMTP mode retained; Mailpit remains local. Production SMTP still requires TLS. Unused by Resend mode |
| Provisioning | `DATABASE_ADMIN_URL`, `BLACKLIST_RUNTIME_PASSWORD`, `BLACKLIST_MIGRATOR_PASSWORD` | Separate authorized operator session only; never API/worker service configuration |
| Migration | `DATABASE_MIGRATION_URL` | Separate release/operator session only, `blacklist_migrator`, verified direct Neon TLS. Never runtime or frontend |
| Vercel server | `API_INTERNAL_URL`, `INTERNAL_API_TOKEN`, `DEPLOYMENT_ENV=staging`, `STAGING_ACCESS_TOKEN` | `API_INTERNAL_URL` must be the **actual** external Render HTTPS origin; configure at build and runtime; free API private inbound DNS is unsupported, so Vercel uses its external HTTPS endpoint. Existing frontend contract unchanged |
| Vercel build | `NEXT_PUBLIC_API_MODE` **unset**, normal Next production build; Node 24.x meeting root engine range | Never deploy the mock build. No public DB, signing, staging or email key |
| Local cloud operator | `RENDER_API_KEY`, `NEON_API_KEY`, `VERCEL_TOKEN` | Scoped HTTPS bindings for account/resource inspection and explicitly approved staging operations, not application runtime |
| Human verification | `HUMAN_VERIFICATION_SECRET_KEY`, `NEXT_PUBLIC_HUMAN_VERIFICATION_SITE_KEY` | O-6 unresolved; not activated by this task; login escalation continues failing closed |
| Chain/RPC | `SOLANA_PRIMARY_PROVIDER`, `HELIUS_API_KEY`, `SOLANA_SECONDARY_RPC_URL`, `EVM_PRIMARY_PROVIDER`, `ALCHEMY_API_KEY`, `ETHEREUM_SECONDARY_RPC_URL`, `ETHERSCAN_API_KEY`, `DNS_RESOLVER_URL` | Future Phase 8+ only; not provisioned or sent to current API/worker/frontend |
| Storage/evidence | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, quarantine/evidence/derivative bucket names, `EVIDENCE_DOWNLOAD_ORIGIN`, `EVIDENCE_PROCESSOR_*` limits | Future Phase 9; no object store, uploads, PDFs/malware service or processor is introduced |
| Monitoring | `LOG_LEVEL`, `ERROR_TRACKING_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `WORKER_CONCURRENCY` | Example/future knobs; current API logs info, worker concurrency comes from code. Error export/collector remain disabled; do not claim these knobs currently configure unsupported monitoring |

The Render runtime wrapper passes an explicit allowlist to API/worker children. The worker receives no signer/internal/staging token; neither application receives the provisioner or migrator URL. This is configuration hygiene, **not** an operating-system security boundary against the service wrapper's parent environment. Do not install operator secrets in runtime services in the first place. Free Render lacks shell/pre-deploy/one-off facilities; use a separate authorized operator against Neon’s approved direct TLS endpoint. A local rehearsal is not an executed Neon migration. Build subprocesses receive no application/DB/mail secrets. A frozen install includes build-time development dependencies; the unpatched development advisory remains disclosed. Runtime keeps the established workspace symlinks because Node 24 refuses TypeScript copied inside `node_modules`.

## Account setup when access is absent

Check existing supported bindings first. In environment settings, supply `RENDER_API_KEY` for `api.render.com`, `NEON_API_KEY` for `console.neon.tech`, `VERCEL_TOKEN` for `api.vercel.com`, and `RESEND_API_KEY` for `api.resend.com`; do not paste values in chat. Required Render/Vercel/Resend documentation/API destinations were saved; documentation and GitHub API reads now succeed. Credential configuration was corrected and supported account API requests now succeed; no further key values belong in chat. Draft saves do not execute scripts, inject credentials, provision resources or publish this environment.

If no Render workspace exists after authenticated inspection, sign in at [Render Dashboard](https://dashboard.render.com/) using GitHub, create/select a workspace, and authorize **only** `Skyboyyt/blacklist`. Do not select a paid workspace plan or create services until the quoted budget is approved. Create a scoped operator API key through account settings and enter it securely. Inspect Vercel's existing connected project, root `apps/web`, Git branch and actual deployment URL; create/modify only an approved staging deployment with Authentication. Confirm team/tester access and any extra seats/costs first.

Resend needs a verified sender domain and SPF/DKIM records controlled by the owner. Disable click/open tracking and security-link rewriting; confirm content/log retention and access before real identities. Use a sending-only staging key rather than an administrative key where possible. Resend's HTTPS adapter uses the existing `SecurityMailer` interface, Node fetch and Zod, with no new dependency. It accepts only HTTP 200/201 with a validated UUID receipt, rejects redirects, caps response bytes at 8192 and request time at 15 s, retries 408/429/5xx/transport failures, and never logs provider responses. No scheduled mail, attachments, arbitrary URLs, HTML, SDK callbacks or raw-key queue payloads are introduced. Controlled unit responses prove adapter behavior. The synthetic real-provider transport proof above establishes acceptance/provider-reported delivery to the authorized default-sender mailbox; configured tracking/retention and full account-activation semantics remain unverified.

## Intended deployment order after blocker resolution

1. Inspect the existing Render workspace, Neon Free organization/quota/version, exact Vercel project/staging origin/Authentication and Resend sender; enter credentials securely and satisfy required security checks. Validate the selected Render/Neon template against the current schema and review free-worker operating limits. Only the selected Free profile may be considered; no paid resource or public production activation is authorized. Do not treat syntax validation as deployment readiness.
2. After verifying free account/limits and the reviewed source, create a dedicated empty Neon staging project in Frankfurt with PostgreSQL 18, independent credentials and direct authenticated TLS. Never clone production records or use its default elevated account as `DATABASE_URL`. Verify actual Free history/snapshot limits; test restore to a separate disposable target without changing original data.
3. In a separate authorized operator session on Neon’s owner-approved direct TLS endpoint, supply only provisioning credentials and execute:
   ```bash
   node infrastructure/render/provision.mjs
   ```
   This creates `blacklist_app` (DML) and `blacklist_migrator` (schema creation), preserves existing passwords, rejects unsafe existing roles/schema ownership and requires PostgreSQL 18. It does not create/reset/drop databases or tables. Record only role/privilege status, never the credentials.
4. Remove provisioner credentials from that session. In a separate migrator session, supply only `DATABASE_MIGRATION_URL` and execute:
   ```bash
   node infrastructure/render/migrate.mjs
   ```
   Seven unchanged application SQL files run in generated-then-hand order with checksums, advisory locking and supported transactions. pg-boss queues and least-privilege grants are provisioned here, never on startup. Reapply once to verify idempotency. No seed accounts or destructive/down migrations.
5. Configure API/worker runtime secrets and exact staging origin independently of local/production. Configure the Resend sender/key and the Vercel server-only settings. Verify Vercel Authentication and the server-injected staging gate before a usable app is available. Verify trusted proxy behavior and internal viewer GET through Vercel.
6. Root directory is the repository root on Render. API build/start:
   ```bash
   node infrastructure/render/build.mjs api
   node infrastructure/render/run.mjs api
   ```
   Worker build/start:
   ```bash
   node infrastructure/render/build.mjs worker
   node infrastructure/render/run.mjs worker
   ```
   Build validates Node 24.21.0, uses pnpm 12.7.0, frozen install and the existing backend build with unchanged dependency controls. Runtime forces production semantics and restricted staging, uses Render's port and forwards SIGTERM/SIGINT for existing graceful shutdown. Auto-deploy is disabled. Record `RENDER_GIT_COMMIT` and compare to the explicitly reviewed commit; do not rely on the old default branch.
7. Vercel uses its existing Next.js workflow. Only the protected staging/preview deployment receives the new settings/build. Set the exact staging hostname before building/deploying, then verify headers, cookie host, no mock fixtures or browser secrets and the actual staging URL. Keep existing production settings untouched.
8. Run the staging checks below and capture sanitized evidence. Availability is blocked until critical security/deployment checks and account restrictions are verified. No real staff bootstrap/invitation or real-user import under this test task.

## Staging verification and recovery

Use synthetic accounts and an owner-controlled test mailbox, not fixture accounts in production or arbitrary recipients. Capture status/counts and commit IDs; never tokens, cookies, mail bodies, passwords, provider payloads or private records.

- Signed-out Vercel visitor is denied; authorized testers can reach the protected site. Direct Render `/api/v1/viewer` is 404 without the server-only staging header. GET/HEAD `/healthz` is 200 only with a healthy database; simulated/real DB outage yields sanitized 503. Wrong/missing/null mutation Origin is 403 even with the staging token; malformed JSON, forged roles and unauthenticated/private/admin requests fail safely.
- Register via Vercel, observe real Resend acceptance and the owner-controlled mailbox, consume the fragment token, then test login/logout, sessions, expiry/version invalidation, reauthentication, reset and email change using the exact existing contracts. Verify secure host-only cookies through the Vercel rewrite and that provider failures leave tokens unredeemable. Rate-limit/login-escalation cases must fail closed while O-6 is unresolved.
- Check actual `blacklist_app` flags/grants; deny DDL/TEMP, migration-journal access, auth-verification reads and audit mutation; verify append-only audit and queue payloads contain identifiers only. Verify no provisioner/migrator/signing key leaks in worker/web configuration, logs or bundles.
- Restart the API and worker, then verify synthetic account/session/queue/audit state persists in the same staging DB. Check connection counts, pool errors, queue progress/backlog and mail failures. Restore/role/password procedures must be tested against a **new** disposable restore target, never reset the live DB.
- Local migration tests rehearse logical `pg_dump`/`pg_restore` with ownership/ACLs and audit hashes; they do not prove Neon history/snapshot recovery. Neon Free history/snapshots have limited retention/capacity; actual provider restoration is untested. For a future approved production plan, verify retention, encrypted backups, restore-to-new-instance steps and credential separation, then perform the actual provider restore drill before production approval. Restrict restored DB access and apply reviewed grants/checksums without changing audit history.
- Search, project verification submissions, evidence uploads, scoring, findings and appeals have only approved contracts/mocks; the corresponding real backend workflows remain unavailable. Mark them **blocked by their phases**, not passed or fake successful. Do not deploy the mock API to supply them.

API logs contain request ID, method, route template and status only; exceptions are sanitized. Worker logging omits recipients, message text, links and raw provider errors. Configure platform log access/retention and alert on 5xx, DB health/pool exhaustion, queue failures/backlog and mail failures after provider/cost approval. No external telemetry or monitoring subscription is enabled automatically.

Rollback uses the previous reviewed application commit through a manual deploy, with compatible schema retained. Do not roll back SQL, edit an applied checksum, restore over the current database or force push. If schema compatibility cannot be maintained, stop rollout and use a separately reviewed forward repair or new restore target. Preserve original data and audit history, and record the incident/owner decision.

## Production preparation checklist (not approval or activation)

| Required item | Current preparation / unresolved evidence |
|---|---|
| API/worker configuration | Separate pinned Node/pnpm service build/start templates; manual reviewed-commit deployment and DB-backed health. Free worker sleeps; production availability/resource sizing pending |
| Database/region/resources | Staging Frankfurt PG18 direct verified TLS and SQL roles prepared. Production provider/networking, connection/storage limits and scaling choice pending |
| Costs | Free staging base $0 within account quotas; production plan, seats/add-ons/overages/taxes require itemized approval |
| Environment/domain/DNS | Safe inventory above; actual reserved API/worker and protected preview URLs verified, default-sender transport tested, owned sender domain and production domains unverified. Production domains, DNS, RP ID, exact origins and secrets must be separately reviewed |
| Recovery | Local logical restore passed; provider restoration, retention, encrypted backup access, RPO/RTO and restore-to-new-target drill pending |
| Monitoring | Status health and sanitized existing logs; account log access/retention, alert recipients, queue/mail/DB alerts and any paid telemetry approval pending |
| Release/rollback | Manual deploy exact reviewed commit, preserve migrations/checksums and schema-compatible rollback; no destructive SQL or automatic main merge |
| Security approval | Local negative tests and scanner evidence recorded. Required coverage, full audit/browser reliability, Claude review, identity recovery/human-verification and real cloud tests remain open |

## Production and Phase 8

Production remains **blocked**: required coverage, the unpatched development dependency, complete browser reliability, Claude review, ADR 0013/P-13, O-6, provider/security/recovery verification, launch/legal/retention gates and later real backend phases remain open. Produce a production checklist only from actual passing staging evidence and verified plan/domain/monitoring/rollback settings, then request separate owner approval. Do not treat restricted staging or publication to main as a production-readiness decision.

Phase 8 has **not begun and is not authorized**. Its future start requires owner authorization, Claude review of the outstanding foundation decisions and an honest assessment of failed foundation gates. No chain/RPC, evidence store, scoring or moderation backend is introduced by this infrastructure task.
