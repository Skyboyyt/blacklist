import { Pool } from 'pg';
const required = ['POSTGRES_PASSWORD', 'BLACKLIST_RUNTIME_PASSWORD', 'BLACKLIST_MIGRATOR_PASSWORD'];
if (required.some((name) => !process.env[name])) throw new Error('Missing local provisioning configuration');
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'blacklist',
  user: 'postgres',
  password: process.env.POSTGRES_PASSWORD,
});
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      if (Date.now() > deadline) throw new Error('Local database unavailable');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  for (const [role, password] of [
    ['blacklist_app', process.env.BLACKLIST_RUNTIME_PASSWORD],
    ['blacklist_migrator', process.env.BLACKLIST_MIGRATOR_PASSWORD],
  ]) {
    const existing = await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!existing.rowCount) {
      const result = await pool.query(
        "SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', $1::text,$2::text) command",
        [role, password],
      );
      const command = result.rows[0]?.command;
      if (!command) throw new Error('Role provisioning failed');
      await pool.query(command);
    }
  }
  await pool.query(
    'REVOKE CREATE,TEMPORARY ON DATABASE blacklist FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CREATE ON DATABASE blacklist TO blacklist_migrator',
  );
  console.log('Local DDL/DML roles provisioned; existing role credentials preserved.');
} catch {
  throw new Error('Local provisioning failed');
} finally {
  await pool.end();
}
