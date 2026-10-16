import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TLSSocket } from 'node:tls';
import { Pool, type PoolClient } from 'pg';
import { identityQueues } from './queues.ts';
import { orderedMigrationFiles } from './migration-order.ts';

export async function withVerifiedOperatorConnection<T>(
  url: string,
  role: string,
  database: string,
  operation: (client: PoolClient, transport: { serverReportsTls: boolean }) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 10000,
    options: '-c lock_timeout=5000 -c statement_timeout=15000 -c idle_in_transaction_session_timeout=15000',
  });
  pool.on('error', () => {
    /* No provider payloads in operator logs. */
  });
  try {
    const client = await pool.connect();
    try {
      const connection = client as unknown as { connection: { stream: unknown } };
      const stream = connection.connection.stream;
      if (!(stream instanceof TLSSocket) || !stream.encrypted || !stream.authorized)
        throw new Error('operator_tls_not_verified');
      const result = await client.query<{ role: string; database: string; version: number; tls: boolean }>(
        `SELECT current_user AS role,current_database() AS database,
         current_setting('server_version_num')::int AS version,
         (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`,
      );
      const row = result.rows[0];
      if (
        !row ||
        row.role !== role ||
        row.database !== database ||
        row.version < 180000 ||
        typeof row.tls !== 'boolean'
      )
        throw new Error('operator_database_identity_invalid');
      // Neon terminates verified client TLS at its proxy; compute's pg_stat_ssl is informational.
      return await operation(client, { serverReportsTls: row.tls });
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/** Fresh-target check: no role/password changes or migration on an unexpected existing database. */
export async function operatorTargetInventory(client: PoolClient) {
  const roles = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('blacklist_app','blacklist_migrator')",
  );
  const objects = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
     AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','S','f')`,
  );
  const tables = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='blacklist' AND c.relkind IN ('r','p')",
  );
  return {
    targetRoles: roles.rows[0]?.n ?? -1,
    targetObjects: objects.rows[0]?.n ?? -1,
    tables: tables.rows[0]?.n ?? -1,
  };
}
export async function verifyFreshOperatorTarget(client: PoolClient) {
  const inventory = await operatorTargetInventory(client);
  if (inventory.targetRoles !== 0 || inventory.targetObjects !== 0)
    throw new Error('operator_target_not_fresh');
}

export async function verifyOperatorRoles(client: PoolClient) {
  const result = await client.query<{ name: string; safe: boolean }>(
    `SELECT rolname AS name, NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolinherit)
      AND rolcanlogin AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS safe
     FROM pg_roles r WHERE rolname IN ('blacklist_app','blacklist_migrator')`,
  );
  if (result.rowCount !== 2 || result.rows.some((r) => !r.safe)) throw new Error('operator_roles_unsafe');
  const grants = await client.query<{ safe: boolean }>(
    `SELECT has_database_privilege('blacklist_app',current_database(),'CONNECT')
      AND NOT has_database_privilege('blacklist_app',current_database(),'CREATE')
      AND NOT has_database_privilege('blacklist_app',current_database(),'TEMP')
      AND NOT has_schema_privilege('blacklist_app','public','CREATE')
      AND has_database_privilege('blacklist_migrator',current_database(),'CREATE') AS safe`,
  );
  if (!grants.rows[0]?.safe) throw new Error('operator_grants_unsafe');
  const owners = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
     WHERE r.rolname='blacklist_app'`,
  );
  if (owners.rows[0]?.n !== 0) throw new Error('operator_runtime_owns_schema');
}

export async function operatorMigrationManifest() {
  const files = await orderedMigrationFiles();
  return Promise.all(
    files.map(async (file) => ({
      name: file.pathname.split('/').pop(),
      sha256: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    })),
  );
}

export async function verifyOperatorMigrations(client: PoolClient) {
  const manifest = await operatorMigrationManifest();
  const journal = await client.query<{ name: string; sha256: string }>(
    'SELECT name,sha256 FROM blacklist_migrations.applied',
  );
  if (
    journal.rowCount !== manifest.length ||
    manifest.some((f) => !journal.rows.some((r) => r.name === f.name && r.sha256 === f.sha256))
  )
    throw new Error('operator_migration_hash_mismatch');
  const tables = await client.query<{ n: number; owned: boolean }>(
    `SELECT count(*)::int AS n,bool_and(r.rolname='blacklist_migrator') AS owned
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='blacklist' AND c.relkind IN ('r','p')`,
  );
  if (tables.rows[0]?.n !== 36 || !tables.rows[0]?.owned) throw new Error('operator_schema_invalid');
  const queues = await client.query<{ name: string }>('SELECT name FROM pgboss.queue');
  if (
    identityQueues.some(
      (name) =>
        !queues.rows.some((q) => q.name === name) || !queues.rows.some((q) => q.name === `${name}.dead`),
    )
  )
    throw new Error('operator_queues_invalid');
  await verifyOperatorRoles(client);
  return { migrations: journal.rows.length, tables: tables.rows[0].n, queues: queues.rows.length };
}

export async function verifyOperatorRuntime(client: PoolClient) {
  await verifyOperatorRoles(client);
  const checks = await client.query<{ safe: boolean }>(
    `SELECT current_user='blacklist_app'
     AND NOT has_schema_privilege(current_user,'blacklist','CREATE')
     AND NOT has_schema_privilege(current_user,'pgboss','CREATE')
     AND NOT has_schema_privilege(current_user,'blacklist_migrations','USAGE')
     AND NOT has_table_privilege(current_user,'blacklist.auth_verifications','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     AND NOT has_table_privilege(current_user,'blacklist.audit_log','INSERT,UPDATE,DELETE,TRUNCATE')
     AND NOT has_table_privilege(current_user,'blacklist.security_email_deliveries','UPDATE,DELETE,TRUNCATE')
     AND NOT has_table_privilege(current_user,'blacklist.chains','INSERT,UPDATE,DELETE,TRUNCATE')
     AND NOT has_table_privilege(current_user,'blacklist.staff_recovery_objections','DELETE,TRUNCATE')
     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='blacklist' AND c.relname IN ('verification_receipts','chain_fact_verifications','chain_transactions','asset_transfers','chain_fact_invalidations')
       AND has_table_privilege(current_user,c.oid,'UPDATE,DELETE,TRUNCATE'))
     AND has_table_privilege(current_user,'blacklist.auth_users','SELECT,INSERT,UPDATE,DELETE')
     AND has_table_privilege(current_user,'pgboss.job','SELECT,INSERT,UPDATE,DELETE')
     AND has_function_privilege(current_user,'blacklist.append_audit(jsonb)','EXECUTE') AS safe`,
  );
  if (!checks.rows[0]?.safe) throw new Error('operator_runtime_grants_unsafe');
  const permissions = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS p(permission)
     WHERE n.nspname IN ('blacklist','pgboss') AND c.relkind IN ('r','p')
     AND NOT (n.nspname='blacklist' AND (c.relname='auth_verifications'
       OR (c.relname='audit_log' AND p.permission<>'SELECT')
       OR (c.relname='security_email_deliveries' AND p.permission IN ('UPDATE','DELETE'))
       OR (c.relname='chains' AND p.permission<>'SELECT')
       OR (c.relname='staff_recovery_objections' AND p.permission='DELETE')
       OR (c.relname IN ('verification_receipts','chain_fact_verifications','chain_transactions','asset_transfers','chain_fact_invalidations') AND p.permission IN ('UPDATE','DELETE'))))
     AND NOT has_table_privilege(current_user,c.oid,p.permission)`,
  );
  if (permissions.rows[0]?.n !== 0) throw new Error('operator_runtime_permissions_missing');
  for (const statement of [
    'CREATE TABLE public.operator_forbidden(id int)',
    'CREATE TEMP TABLE operator_forbidden(id int)',
    'SELECT * FROM blacklist.auth_verifications LIMIT 0',
    'DELETE FROM blacklist.audit_log WHERE false',
    'DELETE FROM blacklist.security_email_deliveries WHERE false',
    'UPDATE blacklist.chains SET enabled=enabled WHERE false',
    'DELETE FROM blacklist.staff_recovery_objections WHERE false',
    'DELETE FROM blacklist.verification_receipts WHERE false',
    'UPDATE blacklist.chain_transactions SET pinned_reason=pinned_reason WHERE false',
  ]) {
    await client.query('BEGIN');
    let denied = false;
    try {
      await client.query(statement);
    } catch (error) {
      denied = typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';
    } finally {
      await client.query('ROLLBACK');
    }
    if (!denied) throw new Error('operator_negative_check_failed');
  }
}
