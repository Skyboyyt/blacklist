import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgBoss } from 'pg-boss';
import * as schema from './schema.js';

export type GateDatabase = NodePgDatabase<typeof schema>;
export const POSTGRES_IMAGE =
  'postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';

export async function startDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'blacklist-gates-'));
  const password = randomBytes(32).toString('hex');
  const runtimePassword = randomBytes(32).toString('hex');
  const migratorPassword = randomBytes(32).toString('hex');
  const envFile = join(directory, 'postgres.env');
  await writeFile(envFile, `POSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
  const container = execFileSync(
    'docker',
    ['run', '--detach', '--env-file', envFile, '--publish', '127.0.0.1::5432', POSTGRES_IMAGE],
    { encoding: 'utf8' },
  ).trim();
  const port = Number(
    execFileSync(
      'docker',
      ['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container],
      { encoding: 'utf8' },
    ).trim(),
  );
  const base = { host: '127.0.0.1', port, database: 'postgres', connectionTimeoutMillis: 1000 };
  const admin = new Pool({ ...base, user: 'postgres', password });
  const runtime = new Pool({
    ...base,
    user: 'gate_runtime',
    password: runtimePassword,
    max: 8,
    options: '-c statement_timeout=10000',
  });
  const migrator = new Pool({
    ...base,
    user: 'gate_migrator',
    password: migratorPassword,
    options: '-c lock_timeout=5000 -c statement_timeout=30000',
  });
  try {
    const deadline = Date.now() + 30_000;
    while (true) {
      try {
        await admin.query('SELECT 1');
        break;
      } catch {
        if (Date.now() > deadline) throw new Error('PostgreSQL acceptance container did not become ready');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    for (const [role, rolePassword] of [
      ['gate_runtime', runtimePassword],
      ['gate_migrator', migratorPassword],
    ]) {
      const result = await admin.query<{ command: string }>(
        "SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text, $2::text) AS command",
        [role, rolePassword],
      );
      const command = result.rows[0]?.command;
      if (!command) throw new Error('Role provisioning failed');
      await admin.query(command);
    }
    await admin.query(
      'REVOKE CREATE, TEMPORARY ON DATABASE postgres FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CREATE ON DATABASE postgres TO gate_migrator',
    );
    const generated = new URL('../fixtures/generated/', import.meta.url);
    const files = (await readdir(generated)).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      await migrator.query('BEGIN');
      try {
        await migrator.query(await readFile(new URL(file, generated), 'utf8'));
        await migrator.query('COMMIT');
      } catch (error) {
        await migrator.query('ROLLBACK');
        throw error;
      }
    }
    await migrator.query(await readFile(new URL('../fixtures/append-only.sql', import.meta.url), 'utf8'));
    const provisioner = new PgBoss({ db: executor(migrator), supervise: false, schedule: false });
    provisioner.on('error', () => {
      /* assertions surface errors without library payload logging */
    });
    await provisioner.start();
    await provisioner.createQueue('identity.security_notice');
    await provisioner.createQueue('identity.password_reset.dead');
    await provisioner.createQueue('identity.password_reset.issue', {
      retryLimit: 4,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: 'identity.password_reset.dead',
    });
    await provisioner.stop();
    await migrator.query(
      'GRANT USAGE ON SCHEMA pgboss TO gate_runtime; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO gate_runtime; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO gate_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO gate_runtime',
    );
    const boss = new PgBoss({
      db: executor(runtime),
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
    });
    boss.on('error', () => {
      /* errors checked by operations, not logged */
    });
    await boss.start();
    return {
      directory,
      container,
      port,
      admin,
      runtime,
      migrator,
      boss,
      db: drizzle(runtime, { schema }),
      async transaction<T>(fn: (tx: GateDatabase, client: Parameters<typeof executor>[0]) => Promise<T>) {
        const client = await runtime.connect();
        try {
          return await drizzle(client, { schema }).transaction((tx) => fn(tx, client));
        } finally {
          client.release();
        }
      },
      async stop() {
        await boss.stop();
        await Promise.all([admin.end(), runtime.end(), migrator.end()]);
        execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await Promise.all([admin.end(), runtime.end(), migrator.end()]);
    execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
export function executor(client: Pick<Pool, 'query'>) {
  return {
    async executeSql(text: string, values?: unknown[]) {
      return client.query(text, values);
    },
  };
}
export type Harness = Awaited<ReturnType<typeof startDatabase>>;
