import { Pool } from 'pg';

/** Operator-only, additive role provisioning. Never called by runtime startup. */
export async function provisionCloudRoles(
  connectionString: string,
  passwords: { runtime: string; migrator: string },
) {
  if (Object.values(passwords).some((value) => Buffer.byteLength(value) < 32))
    throw new Error('provisioning_password_configuration_invalid');
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    options: '-c lock_timeout=5000 -c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000',
  });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(730026)');
      const version = await client.query<{ version: number }>(
        "SELECT current_setting('server_version_num')::integer AS version",
      );
      if ((version.rows[0]?.version ?? 0) < 180000) throw new Error('PostgreSQL_18_required');
      for (const [name, password] of [
        ['blacklist_app', passwords.runtime],
        ['blacklist_migrator', passwords.migrator],
      ]) {
        const prior = await client.query<{ unsafe: boolean }>(
          `SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolinherit OR NOT rolcanlogin
           OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS unsafe
           FROM pg_roles WHERE rolname=$1`,
          [name],
        );
        if (prior.rows[0]?.unsafe) throw new Error('existing_database_role_unsafe');
        if (!prior.rowCount) {
          const statement = await client.query<{ command: string }>(
            "SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', $1::text, $2::text) AS command",
            [name, password],
          );
          const command = statement.rows[0]?.command;
          if (!command) throw new Error('role_provisioning_failed');
          await client.query(command);
        }
      }
      const owner = await client.query<{ expected: boolean }>(
        `SELECT n.nspowner=r.oid AS expected FROM pg_namespace n
         JOIN pg_roles r ON r.rolname='blacklist_migrator' WHERE n.nspname='blacklist'`,
      );
      if (owner.rows[0]?.expected === false) throw new Error('existing_schema_owner_mismatch');
      const statements = await client.query<{ command: string }>(
        `SELECT format('REVOKE CREATE,TEMPORARY ON DATABASE %I FROM PUBLIC,blacklist_app;
         REVOKE CREATE ON SCHEMA public FROM PUBLIC,blacklist_app;
         GRANT CONNECT ON DATABASE %I TO blacklist_app,blacklist_migrator;
         GRANT CREATE ON DATABASE %I TO blacklist_migrator',
         current_database(),current_database(),current_database()) AS command`,
      );
      const command = statements.rows[0]?.command;
      if (!command) throw new Error('role_provisioning_failed');
      await client.query(command);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
