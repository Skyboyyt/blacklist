import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { provisionCloudRoles } from '../../../packages/db/src/provision.ts';
import {
  verifyFreshOperatorTarget,
  operatorTargetInventory,
  verifyOperatorRoles,
  verifyOperatorMigrations,
  verifyOperatorRuntime,
  withVerifiedOperatorConnection,
} from '../../../packages/db/src/staging-operator.ts';
import { startDatabase, type Harness } from './database.ts';

let harness: Harness;
let app: Pool;
let migrator: Pool;
let admin: Pool;
let adminUrl: string;
let migrationUrl: string;
const passwords = { runtime: randomBytes(32).toString('hex'), migrator: randomBytes(32).toString('hex') };
beforeAll(async () => {
  harness = await startDatabase();
  await harness.admin.query('CREATE DATABASE operator_fixture');
  const password = randomBytes(32).toString('hex');
  const formatted = await harness.admin.query<{ command: string }>(
    "SELECT format('ALTER ROLE postgres PASSWORD %L', $1::text) AS command",
    [password],
  );
  const command = formatted.rows[0]?.command;
  if (!command) throw new Error('fixture_command_missing');
  await harness.admin.query(command);
  const url = new URL(`postgresql://127.0.0.1:${harness.port}/operator_fixture`);
  url.username = 'postgres';
  url.password = password;
  adminUrl = url.toString();
  admin = new Pool({ connectionString: adminUrl });
  url.username = 'blacklist_migrator';
  url.password = passwords.migrator;
  migrationUrl = url.toString();
  migrator = new Pool({ connectionString: migrationUrl });
  url.username = 'blacklist_app';
  url.password = passwords.runtime;
  app = new Pool({ connectionString: url.toString() });
});
afterAll(async () => {
  await Promise.all([admin?.end(), app?.end(), migrator?.end()]);
  await harness?.stop();
});
describe('operator catalog rehearsal on disposable PostgreSQL18 (TLS production connector never relaxed)', () => {
  it('fails closed on plaintext production connector and populated target', async () => {
    await expect(
      withVerifiedOperatorConnection(adminUrl, 'postgres', 'operator_fixture', async () => true),
    ).rejects.toThrow('operator_tls_not_verified');
    const client = await admin.connect();
    try {
      await verifyFreshOperatorTarget(client);
      expect(await operatorTargetInventory(client)).toEqual({ targetRoles: 0, targetObjects: 0, tables: 0 });
      await client.query('CREATE TABLE public.existing_record(id int)');
      await expect(verifyFreshOperatorTarget(client)).rejects.toThrow('operator_target_not_fresh');
      await client.query('DROP TABLE public.existing_record');
    } finally {
      client.release();
    }
  });
  it('provisions safe roles, rejects a provision restart and verifies eleven repeatable migrations', async () => {
    await provisionCloudRoles(adminUrl, passwords);
    const provisioner = await admin.connect();
    try {
      await verifyOperatorRoles(provisioner);
      await expect(verifyFreshOperatorTarget(provisioner)).rejects.toThrow('operator_target_not_fresh');
    } finally {
      provisioner.release();
    }
    await migrate(migrationUrl, 'blacklist_app');
    await migrate(migrationUrl, 'blacklist_app');
    const client = await migrator.connect();
    try {
      expect(await verifyOperatorMigrations(client)).toMatchObject({ migrations: 14, tables: 56 });
    } finally {
      client.release();
    }
    const runtime = await app.connect();
    try {
      await verifyOperatorRuntime(runtime);
    } finally {
      runtime.release();
    }
  });
  it('detects tampered migration journal without modifying migrations', async () => {
    const client = await migrator.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE blacklist_migrations.applied SET sha256=repeat('0',64)");
      await expect(verifyOperatorMigrations(client)).rejects.toThrow('operator_migration_hash_mismatch');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
  it('detects privilege escalation and rolls back all negative checks without test accounts', async () => {
    await admin.query('ALTER ROLE blacklist_app CREATEDB');
    const client = await admin.connect();
    try {
      await expect(verifyOperatorRoles(client)).rejects.toThrow('operator_roles_unsafe');
    } finally {
      client.release();
      await admin.query('ALTER ROLE blacklist_app NOCREATEDB');
    }
    const runtime = await app.connect();
    try {
      await verifyOperatorRuntime(runtime);
    } finally {
      runtime.release();
    }
    expect((await migrator.query('SELECT count(*)::int AS n FROM blacklist.auth_users')).rows[0]?.n).toBe(0);
  });
});
