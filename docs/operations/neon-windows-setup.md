# Neon staging database setup from Windows

Use **PowerShell 7** on your own Windows PC. These commands use the existing provisioning and migration scripts; they do not resume Render, change Vercel, merge a PR, seed accounts or reset a database. Run every Node command from the **repository root**, the folder containing `package.json` and `infrastructure`.

Current cloud status: the API has an unsuitable privileged/pooler URL, the worker has no URL, and both Render services remain suspended. Native TCP/5432 from the Codex environment is unreachable. **Cloud roles/migrations have not been verified or executed.** Windows execution still needs your PC; the local Linux PostgreSQL rehearsals are separate evidence.

## 1. Install the pinned tools and obtain the feature branch

Install [Git for Windows](https://git-scm.com/downloads/win), [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows), and the official [Node 24.21.0 x64 installer](https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi). Use the corresponding official ARM64 installer if your PC is ARM64. Verify the downloaded Node installer with its official SHA-256 manifest and Windows signature before installation. For an x64 installer saved in Downloads, run this in PowerShell 7:

```powershell
$installer = Join-Path $env:USERPROFILE 'Downloads\node-v24.21.0-x64.msi'
$manifest = (Invoke-WebRequest 'https://nodejs.org/dist/v24.21.0/SHASUMS256.txt').Content
$line = ($manifest -split "`n" | Where-Object { $_ -match ' node-v24\.21\.0-x64\.msi\s*$' })
if (@($line).Count -ne 1) { throw 'Expected installer hash missing; stop.' }
$expectedHash = (($line.Trim() -split '\s+')[0]).ToLowerInvariant()
if ((Get-FileHash -Algorithm SHA256 $installer).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Installer checksum mismatch; stop.'
}
if ((Get-AuthenticodeSignature $installer).Status -ne 'Valid') {
    throw 'Installer signature is not valid; stop.'
}
```

Install the verified installer through Windows, then open a new **PowerShell 7** window. Use a normal developer shell, not a shell transcript or a recorded/shared session. Turn off Windows clipboard history and cross-device clipboard sync before handling credentials. Never type a password into a command, paste it into chat, or run `Get-ChildItem Env:`.

```powershell
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Open PowerShell 7.' }
if ((node --version) -ne 'v24.21.0') { throw 'Pinned Node 24.21.0 required.' }
git --version
npm.cmd install --global pnpm@12.7.0
if ($LASTEXITCODE -ne 0) { throw 'pnpm installation failed; stop.' }
if ((pnpm.cmd --version) -ne '12.7.0') { throw 'Pinned pnpm 12.7.0 required.' }

$repoDir = Join-Path $env:USERPROFILE 'source\blacklist-staging'
if (Test-Path $repoDir) { throw 'Folder exists. Preserve it; use the existing-checkout instructions below.' }
New-Item -ItemType Directory -Force (Split-Path $repoDir) | Out-Null
git clone --config core.autocrlf=false --branch chore/render-staging-deployment --single-branch https://github.com/Skyboyyt/blacklist.git $repoDir
if ($LASTEXITCODE -ne 0) { throw 'Clone failed; stop.' }
Set-Location $repoDir
pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; stop; do not relax pnpm security policies.' }
git status --short
git rev-parse HEAD
```

If you already have a checkout, open its root with `Set-Location 'C:\your\existing\blacklist'`. Run `git status --short` first; preserve any changes and stop if it is dirty. For a clean checkout, run `git fetch origin`, `git switch chore/render-staging-deployment`, `git pull --ff-only origin chore/render-staging-deployment`, and `pnpm.cmd install --frozen-lockfile`, checking `$LASTEXITCODE` after each. If the local feature branch does not exist, use `git switch --track -c chore/render-staging-deployment origin/chore/render-staging-deployment` instead of `git switch`. Do not reset, force checkout, edit migrations or use `drizzle-kit push`. The byte-hash check below must pass; if this checkout converted SQL to CRLF, preserve it and use a fresh clone with `--config core.autocrlf=false` in another directory.

**Preserve LF bytes on Windows.** The existing `.gitattributes` already sets `eol=lf`; no repository policy change is needed. The clone command also keeps repository-local `core.autocrlf=false`. The runner hashes actual UTF-8 SQL text, including line endings: manual/editor conversion to CRLF would produce a different journal on Linux/Render. Disabling conversion after files have changed does not repair those files. Before any database operation, verify every local SQL file against the reviewed SHA-256 manifest:

```powershell
$evidence = Get-Content -Raw 'docs\evidence\2026-10-13-neon-windows-preparation.json' | ConvertFrom-Json
$generatedSql = @(Get-ChildItem 'packages\db\migrations\generated' -Filter '*.sql' | Sort-Object Name)
$handSql = @(Get-ChildItem 'packages\db\migrations' -Filter '*.sql' | Sort-Object Name)
$sqlFiles = @($generatedSql) + @($handSql)
if ($sqlFiles.Count -ne 7 -or $evidence.migrationManifest.Count -ne 7) { throw 'Unexpected migration set; stop.' }
foreach ($file in $sqlFiles) {
    $expected = @($evidence.migrationManifest | Where-Object { $_.name -eq $file.Name })
    if ($expected.Count -ne 1 -or (Get-FileHash -Algorithm SHA256 $file.FullName).Hash.ToLowerInvariant() -ne $expected[0].sha256) {
        throw 'Migration bytes differ from reviewed source. Stop; do not edit files/journal or run migrations.'
    }
}
Write-Host 'reviewed_migration_bytes_verified'
```

Repeat this byte check in the fresh migration window before step 4. Editors must preserve LF; do not save or modify reviewed SQL.

Check your PC's direct connectivity before any database login:

```powershell
$NeonDirectHost = 'ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech'
if (-not (Test-NetConnection -ComputerName $NeonDirectHost -Port 5432 -InformationLevel Quiet)) {
    throw 'This PC cannot reach Neon TCP/5432. Stop and resolve the network path; do not disable TLS.'
}
```

## 2. Confirm the target and prepare masked credential helpers

In the Neon dashboard, select **blacklist-staging**, project `curly-thunder-05276273`, branch **staging** / `br-wispy-unit-b95vz858`, database **blacklist_staging**, Frankfurt, PostgreSQL 18. The expected direct host is the one above, with **no `-pooler` marker**. The earlier US/Ohio `blacklist` project is outside this task.

For the provisioning password, select the existing **blacklist_provisioner** role in Neon's connection dialog and turn **connection pooling off**. Use only its password in the masked prompt below. Do not copy its full URL into Render or create new runtime roles through Neon's API/dashboard: those roles can inherit elevated provider privileges. The repository script creates the restricted SQL roles instead.

Copy this helper block into **each new operator PowerShell window**, from the repository root. It builds URLs with Node's URL encoder, the fixed staging host/database and exactly `sslmode=verify-full`. Passwords are entered through masked prompts, never command arguments or plaintext files. They necessarily exist transiently in process memory/environment; close the shell after each phase. The helper does not connect or print a URL.

```powershell
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Open PowerShell 7.' }
if ((node --version) -ne 'v24.21.0') { throw 'Pinned Node 24.21.0 required.' }
function Read-SecretText([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}

function Set-NeonConnection {
    param(
        [ValidateSet('DATABASE_ADMIN_URL', 'DATABASE_MIGRATION_URL', 'DATABASE_URL')]
        [string]$Variable,
        [ValidateSet('blacklist_provisioner', 'blacklist_migrator', 'blacklist_app')]
        [string]$Role
    )
    $env:BL_OPERATOR_ROLE = $Role
    $env:BL_OPERATOR_PASSWORD = Read-SecretText "Password for $Role (masked)"
    try {
        $connection = @'
import { verifiedDatabaseUrl } from './infrastructure/render/database-url.ts';
try {
  const role = process.env.BL_OPERATOR_ROLE;
  const password = process.env.BL_OPERATOR_PASSWORD;
  if (!password || !['blacklist_provisioner', 'blacklist_migrator', 'blacklist_app'].includes(role)) throw new Error();
  const url = new URL('postgresql://ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech:5432/blacklist_staging?sslmode=verify-full');
  url.username = role;
  url.password = password;
  verifiedDatabaseUrl(url.toString(), role);
  process.stdout.write(url.toString());
} catch { console.error('staging_connection_construction_failed'); process.exitCode = 1; }
'@ | node --input-type=module -
        if ($LASTEXITCODE -ne 0) { throw 'Connection construction failed; stop.' }
        [Environment]::SetEnvironmentVariable($Variable, [string]$connection, 'Process')
    } finally {
        Remove-Item Env:BL_OPERATOR_ROLE, Env:BL_OPERATOR_PASSWORD -ErrorAction SilentlyContinue
        Remove-Variable connection -ErrorAction SilentlyContinue
    }
}
```

Create two independent staging passwords in your existing password manager: one for `blacklist_app`, one for `blacklist_migrator`, **at least 32 ASCII characters** each; 32 random bytes encoded as base64url gives 43 characters. Save each under its exact role/project/branch. If your manager cannot generate a suitably long random password, this optional block generates one and copies it privately, without displaying it; run it separately for each role, saving the result in your manager before continuing:

```powershell
$generatedPassword = node --input-type=module -e "import {randomBytes} from 'node:crypto'; process.stdout.write(randomBytes(32).toString('base64url'));"
if ($LASTEXITCODE -ne 0) { throw 'Password generation failed.' }
try {
    Set-Clipboard -Value ([string]$generatedPassword)
    $null = Read-Host 'Paste into your password manager, save under the correct role, then press Enter'
} finally {
    Set-Clipboard -Value 'cleared'
    Remove-Variable generatedPassword -ErrorAction SilentlyContinue
}
```

Do not regenerate passwords for existing roles and assume provisioning resets them: **it intentionally preserves existing passwords**. The first-run preflight below stops if either role or existing user tables are found; an existing/partially migrated database needs a separate reviewed continuation using its original credentials.

## 3. Review and run provisioning in its own window

Changes reviewed before execution:

| Operation | Effect / review |
|---|---|
| Role provisioning | Creates `blacklist_app` and `blacklist_migrator` only when absent. Requires PG18; rejects unsafe pre-existing flags/membership or unexpected schema owner. Does not reset passwords or drop/reset a database. One transaction and advisory lock. |
| Database/schema privileges | Revokes CREATE/TEMP from PUBLIC/runtime and CREATE on `public`; grants CONNECT to both roles and database CREATE only to migrator. This affects other users of this database, so use only this dedicated empty staging database. |
| Generated migrations | Five generated files, then two hand-written files. `0001_rich_tomorrow_man.sql` replaces a challenge constraint and backfills `old_email` before making it required. `0004_harsh_molten_man.sql` cancels legacy pending staff role requests and backfills security versions. These are real state changes on populated data, not a harmless schema preview. First-run steps below require an empty target. |
| Hand-written migrations | Install append-only/audit/account-kind/staff guards and one system-state row; no test accounts. |
| Migration runner / queues / grants | Checks every applied SQL hash; serializes migrations; uses per-file transactions unless explicitly opted out (none of these seven opt out). Creates migration journal/pg-boss queues and approved DML grants. The complete run is not one transaction; completed files can remain if a later file fails. Repeat uses the journal; never change its hashes or delete it to force a rerun. |

There is no database/table reset, DROP TABLE, TRUNCATE or application-record DELETE in these seven SQL files. The constraint replacement, backfills, cancellation and privilege revocations above still require the target review. Do not run these first-run steps on production, a shared database or a populated staging database.

In the first PowerShell window, at the repository root, after loading step 2's helpers:

```powershell
Set-NeonConnection -Variable DATABASE_ADMIN_URL -Role blacklist_provisioner
```

Run this **read-only first-run preflight** before provisioning. It authenticates only to the fixed staging target, confirms verified TLS/PG18/database/role, and stops if application roles or user tables already exist. It prints only a generic status.

```powershell
@'
import { createRequire } from 'node:module';
import { verifiedDatabaseUrl } from './infrastructure/render/database-url.ts';
const { Pool } = createRequire(new URL('./packages/db/package.json', import.meta.url))('pg');
let pool, client;
try {
  const url = verifiedDatabaseUrl(process.env.DATABASE_ADMIN_URL, 'blacklist_provisioner');
  if (url.hostname !== 'ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech' || url.pathname !== '/blacklist_staging') throw new Error();
  pool = new Pool({connectionString:url.toString(), max:1, connectionTimeoutMillis:10000, options:'-c statement_timeout=10000'});
  client = await pool.connect();
  if (client.connection.stream.authorized !== true) throw new Error();
  await client.query('BEGIN READ ONLY');
  const {rows:[s]} = await client.query(`SELECT current_database()='blacklist_staging' AS database_ok,
    current_user='blacklist_provisioner' AS role_ok,
    current_setting('server_version_num')::int >= 180000 AS version_ok,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls_ok,
    (SELECT count(*)::int FROM pg_roles WHERE rolname IN ('blacklist_app','blacklist_migrator')) AS existing_roles,
    (SELECT count(*)::int FROM information_schema.tables WHERE table_type='BASE TABLE'
      AND table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%') AS existing_tables`);
  if (!s || !s.database_ok || !s.role_ok || !s.version_ok || !s.tls_ok || s.existing_roles !== 0 || s.existing_tables !== 0) throw new Error();
  await client.query('COMMIT');
  console.log('empty_staging_target_verified');
} catch { console.error('staging_preflight_failed_stop'); process.exitCode=1; }
finally { client?.release(); if (pool) await pool.end(); }
'@ | node --input-type=module -
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed. Stop; do not run provisioning.' }
```

Expected status: `empty_staging_target_verified`. Only then enter the two saved role passwords and run the existing script:

```powershell
$env:BLACKLIST_RUNTIME_PASSWORD = Read-SecretText 'Saved blacklist_app password (masked)'
$env:BLACKLIST_MIGRATOR_PASSWORD = Read-SecretText 'Saved blacklist_migrator password (masked)'
try {
    node infrastructure/render/provision.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed. Stop; do not migrate or reset anything.' }
} finally {
    Remove-Item Env:DATABASE_ADMIN_URL, Env:BLACKLIST_RUNTIME_PASSWORD, Env:BLACKLIST_MIGRATOR_PASSWORD -ErrorAction SilentlyContinue
}
```

Expected: `Cloud DDL/DML roles provisioned; existing credentials preserved.` Close this window. Do not put any of these three operator variables on Render.

## 4. Run and verify migrations in a separate window

Open a **new PowerShell 7 window**, `Set-Location` to the same repository root, and paste step 2's helper block again. This window has only the migrator credential; the admin/runtime passwords must not be in its environment.

```powershell
Set-NeonConnection -Variable DATABASE_MIGRATION_URL -Role blacklist_migrator
node infrastructure/render/migrate.mjs
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Stop; preserve the database/journal and investigate.' }
node infrastructure/render/migrate.mjs
if ($LASTEXITCODE -ne 0) { throw 'Repeat migration failed. Stop; do not resume services.' }
```

Expected **twice**: `Reviewed application migrations and queues provisioned.` Verify the actual migration journal against all seven local SQL hashes, PG18, 27 application tables, exact database/role and verified TLS, using only read-only queries:

```powershell
@'
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { verifiedDatabaseUrl } from './infrastructure/render/database-url.ts';
const { Pool } = createRequire(new URL('./packages/db/package.json', import.meta.url))('pg');
let pool, client;
try {
  const url=verifiedDatabaseUrl(process.env.DATABASE_MIGRATION_URL,'blacklist_migrator');
  if (url.hostname!=='ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech' || url.pathname!=='/blacklist_staging') throw new Error();
  pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000,options:'-c statement_timeout=10000'});
  client=await pool.connect();
  if (client.connection.stream.authorized!==true) throw new Error();
  await client.query('BEGIN READ ONLY');
  const root=new URL('./packages/db/migrations/',import.meta.url), generated=new URL('generated/',root);
  const files=[...(await readdir(generated)).filter(n=>n.endsWith('.sql')).sort().map(n=>new URL(n,generated)),
    ...(await readdir(root)).filter(n=>n.endsWith('.sql')).sort().map(n=>new URL(n,root))];
  const {rows}=await client.query('SELECT name,sha256 FROM blacklist_migrations.applied');
  if (files.length!==7 || rows.length!==files.length) throw new Error();
  for (const file of files) {
    const hash=createHash('sha256').update(await readFile(file,'utf8')).digest('hex');
    if (rows.find(r=>r.name===file.pathname.split('/').pop())?.sha256!==hash) throw new Error();
  }
  const {rows:[s]}=await client.query(`SELECT current_user='blacklist_migrator' AS role_ok,
    current_database()='blacklist_staging' AS database_ok,
    current_setting('server_version_num')::int >= 180000 AS version_ok,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls_ok,
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='blacklist') AS app_tables`);
  if (!s || !s.role_ok || !s.database_ok || !s.version_ok || !s.tls_ok || s.app_tables!==27) throw new Error();
  await client.query('COMMIT');
  console.log(JSON.stringify({migrationHashesMatch:true,appliedMigrations:7,applicationTables:27,verifiedTLS:true}));
} catch { console.error('staging_migration_verification_failed_stop'); process.exitCode=1; }
finally { client?.release(); if(pool) await pool.end(); }
'@ | node --input-type=module -
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed; stop.' }
Remove-Item Env:DATABASE_MIGRATION_URL -ErrorAction SilentlyContinue
```

Close the window. Never paste raw database errors, URLs/passwords, full environment dumps or logs in chat. If anything fails, close the shell and share only the generic stage/status, not sensitive output. Preserve any completed migrations; investigate before continuing.

## 5. Obtain and verify the runtime connection privately

The correct runtime password is the one you saved for **blacklist_app**, not the provisioner's password. SQL-created roles might not appear in Neon's console connection selector; you do not need to create another provider role or use its generated console URL. Build the URL with the helper instead.

Open a **third fresh PowerShell 7 window**, change to the repository root and paste step 2's helpers. Then:

```powershell
Set-NeonConnection -Variable DATABASE_URL -Role blacklist_app
```

This privately constructs:

```text
postgresql://blacklist_app:<URL-encoded-runtime-password>@ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech:5432/blacklist_staging?sslmode=verify-full
```

The text above is a placeholder template, not a usable credential. Do not display `$env:DATABASE_URL`. This role is a service database login, not an application administrator or staff approval role.

Run this read-only privilege/TLS verification. It reads catalog/grant metadata, **not user records**, and does not attempt DELETE/DDL or start API/worker jobs:

```powershell
@'
import { createRequire } from 'node:module';
import { verifiedDatabaseUrl } from './infrastructure/render/database-url.ts';
const { Pool }=createRequire(new URL('./packages/db/package.json',import.meta.url))('pg');
let pool,client;
try {
  const url=verifiedDatabaseUrl(process.env.DATABASE_URL,'blacklist_app');
  if(url.hostname!=='ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech' || url.pathname!=='/blacklist_staging') throw new Error();
  pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000,options:'-c statement_timeout=10000'});
  client=await pool.connect();
  if(client.connection.stream.authorized!==true) throw new Error();
  await client.query('BEGIN READ ONLY');
  const {rows:[s]}=await client.query(`SELECT current_user='blacklist_app' AS role_ok,
    current_database()='blacklist_staging' AS database_ok,
    current_setting('server_version_num')::int >= 180000 AS version_ok,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls_ok,
    r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolinherit) AS flags_ok,
    NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS membership_ok,
    has_database_privilege(current_user,current_database(),'CONNECT') AS connect_ok,
    NOT has_database_privilege(current_user,current_database(),'CREATE,TEMPORARY') AS database_ddl_denied,
    NOT has_schema_privilege(current_user,'public','CREATE') AS public_ddl_denied,
    NOT has_schema_privilege(current_user,'blacklist','CREATE') AS app_ddl_denied,
    NOT has_schema_privilege(current_user,'pgboss','CREATE') AS queue_ddl_denied,
    has_schema_privilege(current_user,'blacklist','USAGE') AND has_schema_privilege(current_user,'pgboss','USAGE') AS usage_ok,
    NOT has_schema_privilege(current_user,'blacklist_migrations','USAGE') AS journal_schema_denied,
    NOT has_table_privilege(current_user,'blacklist_migrations.applied','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS journal_denied,
    NOT has_table_privilege(current_user,'blacklist.auth_verifications','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS raw_verification_denied,
    NOT has_table_privilege(current_user,'blacklist.audit_log','INSERT,UPDATE,DELETE,TRUNCATE') AS audit_mutation_denied,
    NOT has_table_privilege(current_user,'blacklist.security_email_deliveries','UPDATE,DELETE,TRUNCATE') AS delivery_rewrite_denied,
    has_function_privilege(current_user,'blacklist.append_audit(jsonb)','EXECUTE') AS approved_audit_append_ok,
    NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid) AND
      NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AND
      NOT EXISTS(SELECT 1 FROM pg_proc WHERE proowner=r.oid) AS ownership_ok
    FROM pg_roles r WHERE r.rolname=current_user`);
  if(!s || Object.values(s).some(value=>value!==true)) throw new Error();
  const {rows:tables}=await client.query(`SELECT c.oid,n.nspname,c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('blacklist','pgboss') AND c.relkind IN ('r','p')`);
  if(tables.filter(t=>t.nspname==='blacklist').length!==27 || !tables.some(t=>t.nspname==='pgboss')) throw new Error();
  for(const table of tables) {
    const allowed=table.nspname==='blacklist' && table.relname==='auth_verifications' ? [] :
      table.nspname==='blacklist' && table.relname==='audit_log' ? ['SELECT'] :
      table.nspname==='blacklist' && table.relname==='security_email_deliveries' ? ['SELECT','INSERT'] : ['SELECT','INSERT','UPDATE','DELETE'];
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
      const {rows:[p]}=await client.query('SELECT has_table_privilege(current_user,$1::oid,$2::text) AS granted',[table.oid,privilege]);
      if(p.granted!==allowed.includes(privilege)) throw new Error();
    }
  }
  const {rows:sequences}=await client.query(`SELECT c.oid FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pgboss' AND c.relkind='S'`);
  for(const sequence of sequences) {
    const {rows:[p]}=await client.query(`SELECT has_sequence_privilege(current_user,$1::oid,'USAGE')
      AND has_sequence_privilege(current_user,$1::oid,'SELECT')
      AND NOT has_sequence_privilege(current_user,$1::oid,'UPDATE') AS allowed`,[sequence.oid]);
    if(p.allowed!==true) throw new Error();
  }
  const {rows:functions}=await client.query(`SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pgboss' AND p.prokind='f'`);
  for(const fn of functions) {
    const {rows:[p]}=await client.query('SELECT has_function_privilege(current_user,$1::oid,\'EXECUTE\') AS allowed',[fn.oid]);
    if(p.allowed!==true) throw new Error();
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({runtimeRoleVerified:true,verifiedTLS:true,privilegeBoundariesVerified:true,applicationTables:27}));
} catch { console.error('staging_runtime_verification_failed_stop'); process.exitCode=1; }
finally { client?.release(); if(pool) await pool.end(); }
'@ | node --input-type=module -
if ($LASTEXITCODE -ne 0) { throw 'Runtime verification failed. Stop; do not configure or resume services.' }
```

The approved runtime permissions are CONNECT, schema USAGE, ordinary application/queue DML, queue sequence USAGE/SELECT and required function EXECUTE. Exceptions protect raw auth verification rows, direct audit mutation, delivery rewrites and migration journal access. No database/schema CREATE/TEMP, superuser, CREATEDB, CREATEROLE, BYPASSRLS, inherited membership or object ownership. Application ownership/role/state checks remain server-side; these SQL privileges do not replace them.

## 6. Prepare Render settings while services stay suspended

After all local verifications pass, privately copy the runtime URL:

```powershell
Set-Clipboard -Value $env:DATABASE_URL
```

In the **existing** Render workspace `tea-db6vhoij9qps73amsn50`, set the protected **DATABASE_URL** value on both:

| Service | Setting |
|---|---|
| `blacklist-staging-api` / `srv-db72r4d9fdbs73erf1s0` | Replace the existing provisioner/pooler URL with the privately copied `blacklist_app` URL |
| `blacklist-staging-worker` / `srv-db72r5ou01pc73c32l5g` | Add the same verified `blacklist_app` URL; preserve its existing Resend settings |

Choose **Save only / save without deployment** if Render presents deployment options. Keep both services **suspended** and auto-deploy **off**. Do not click Resume, Deploy, or Save-and-deploy. If the UI cannot save without activating/deploying, stop and report that limitation; do not improvise. Do not create new services or change build/start commands.

Only `DATABASE_URL` goes on these services. Never add `DATABASE_ADMIN_URL`, `DATABASE_MIGRATION_URL`, either role-password provisioning variable, a Neon operator key, or a privileged role URL. Never add any database variable to Vercel or a `NEXT_PUBLIC_*` variable. API keeps its independent signer/internal/staging secrets; worker gets none of them. Leave proxy CIDRs unchanged until actual ingress behavior is reviewed.

After pasting into both protected fields:

```powershell
Set-Clipboard -Value 'cleared'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

Close the runtime window. Keep the two role passwords securely in your manager for future authorized operator work, separate from production. Return only the generic success messages/booleans and source commit ID from these steps; **no URLs, passwords or screenshots containing credentials**. Codex can then re-read protected Render settings in memory, verify the exact role/direct/TLS/database policy and that services remain held. Actual Render connectivity, trusted ingress, hosted auth/email, restart persistence and provider recovery remain untested until a separately approved resume/validation step.

## Failure handling and approval boundary

- Stop at any nonzero command exit or failed preflight. Connection timeout/refusal requires network diagnosis; failed authentication requires the correct original role password. Existing roles are not silently reset. No blanket grants or unsafe role repair.
- Keep certificate verification on. Do not add `sslmode=require`, `no-verify`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, a pooler, driver-query overrides, an HTTP/serverless driver or startup migrations to bypass a failure.
- For partial migrations, preserve journal/data and the exact SQL. Share only the generic failing stage, then review the state before retrying; do not delete rows, drop schemas, alter hashes or run down migrations.
- Never restore over an existing database. Provider restore/recovery needs a separately reviewed disposable target and quota/cost check; this procedure does not claim PITR readiness.
- This procedure prepares the empty staging database and protected settings only. It gives **no approval** to resume services, merge PR #8, change production, purchase services or start Phase 8.
