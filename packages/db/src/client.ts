import { Pool, type PoolClient } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgBoss } from 'pg-boss';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema>;
export function executor(client: Pick<Pool, 'query'>) {
  return {
    async executeSql(text: string, values?: unknown[]) {
      return client.query(text, values);
    },
  };
}
export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    options: '-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000',
  });
  pool.on('error', () => {
    console.error('database_pool_unavailable');
  });
  const db = drizzle(pool, { schema });
  const boss = new PgBoss({
    db: executor(pool),
    migrate: false,
    createSchema: false,
    supervise: true,
    schedule: false,
    persistWarnings: false,
    persistQueueStats: false,
    reindex: false,
  });
  boss.on('error', () => {
    console.error('job_queue_unavailable');
  });
  return {
    db,
    pool,
    boss,
    async checkConnection() {
      await pool.query('SELECT 1');
    },
    async start() {
      const result = await pool.query<{ unsafe: boolean }>(`SELECT
        r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR
        has_database_privilege(current_user,current_database(),'CREATE') OR
        has_database_privilege(current_user,current_database(),'TEMPORARY') OR
        has_schema_privilege(current_user,'blacklist','CREATE') OR
        pg_has_role(current_user,n.nspowner,'MEMBER') AS unsafe
        FROM pg_roles r JOIN pg_namespace n ON n.nspname='blacklist' WHERE r.rolname=current_user`);
      if (result.rows.length !== 1 || result.rows[0]?.unsafe !== false)
        throw new Error('runtime_database_role_rejected');
      await boss.start();
    },
    async transaction<T>(fn: (tx: Database, client: PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        return await drizzle(client, { schema }).transaction((tx) => fn(tx, client));
      } finally {
        client.release();
      }
    },
    async close() {
      await boss.stop();
      await pool.end();
    },
  };
}
export type DatabaseRuntime = ReturnType<typeof createDatabase>;
