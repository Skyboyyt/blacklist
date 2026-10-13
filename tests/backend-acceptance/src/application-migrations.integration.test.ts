import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { startDatabase } from './database.ts';

describe('application migration and restore safety', () => {
  it('backfills populated pre-change rows and retires pending approvals without inventing authority', async () => {
    const h = await startDatabase();
    try {
      const name = '0000_fixed_alex_wilder.sql';
      const initial = await readFile(
        new URL(`../../../packages/db/migrations/generated/${name}`, import.meta.url),
        'utf8',
      );
      await h.migrator.query(initial);
      await h.migrator.query(`CREATE SCHEMA blacklist_migrations;
        CREATE TABLE blacklist_migrations.applied (
          name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
        )`);
      await h.migrator.query('INSERT INTO blacklist_migrations.applied(name,sha256) VALUES ($1,$2)', [
        name,
        createHash('sha256').update(initial).digest('hex'),
      ]);
      const user = await h.migrator.query<{ id: string }>(`INSERT INTO blacklist.auth_users
        (name,email,email_verified,account_kind) VALUES
        ('Migration fixture','migration@example.test',true,'staff') RETURNING id`);
      const id = user.rows[0]?.id;
      if (!id) throw new Error('test_user_missing');
      await h.migrator.query(
        'INSERT INTO blacklist.account_security_state(user_id,security_version) VALUES ($1,7)',
        [id],
      );
      await h.migrator.query(
        `INSERT INTO blacklist.email_change_requests
        (user_id,new_email,security_version) VALUES ($1,'next@example.test',7)`,
        [id],
      );
      await h.migrator.query(
        `INSERT INTO blacklist.staff_role_requests
        (target_user_id,role,action,proposed_by,state) VALUES
        ($1,'admin','grant','fixture-proposer','pending'),
        ($1,'moderator','grant','fixture-proposer','applied')`,
        [id],
      );
      const url = new URL(`postgresql://127.0.0.1:${h.port}/postgres`);
      url.username = h.migrator.options.user ?? '';
      if (typeof h.migrator.options.password !== 'string') throw new Error('test_password_missing');
      url.password = h.migrator.options.password;
      await migrate(url.toString(), 'gate_runtime');
      expect((await h.runtime.query('SELECT old_email FROM blacklist.email_change_requests')).rows).toEqual([
        { old_email: 'migration@example.test' },
      ]);
      expect(
        (
          await h.runtime.query(`SELECT role,state,security_version
        FROM blacklist.staff_role_requests ORDER BY role`)
        ).rows,
      ).toEqual([
        { role: 'admin', state: 'cancelled', security_version: 7 },
        { role: 'moderator', state: 'applied', security_version: 7 },
      ]);
      await expect(
        h.runtime.query(`UPDATE blacklist.auth_users SET account_kind='member' WHERE id=$1`, [id]),
      ).rejects.toThrow('account kind is immutable');
    } finally {
      await h.stop();
    }
  });

  it('applies the exact application SQL, restores ownership/grants and detects applied checksum drift', async () => {
    const h = await startDatabase();
    const connection = (database: string) => {
      const url = new URL(`postgresql://127.0.0.1:${h.port}/${database}`);
      url.username = h.migrator.options.user ?? '';
      if (typeof h.migrator.options.password !== 'string') throw new Error('test_password_missing');
      url.password = h.migrator.options.password;
      return url.toString();
    };
    let restored: Pool | undefined;
    let restoredRuntime: Pool | undefined;
    try {
      await migrate(connection('postgres'), 'gate_runtime');
      await migrate(connection('postgres'), 'gate_runtime');
      const root = new URL('../../../packages/db/migrations/', import.meta.url);
      const expected: Array<{ name: string; sha256: string }> = [];
      for (const directory of [new URL('generated/', root), root]) {
        for (const name of (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort()) {
          expected.push({
            name,
            sha256: createHash('sha256')
              .update(await readFile(new URL(name, directory)))
              .digest('hex'),
          });
        }
      }
      const applied = await h.migrator.query<{ name: string; sha256: string }>(
        'SELECT name,sha256 FROM blacklist_migrations.applied ORDER BY name',
      );
      expect(applied.rows).toEqual(expected.sort((a, b) => a.name.localeCompare(b.name)));
      const tables = await h.runtime.query<{ count: string }>(
        "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='blacklist'",
      );
      expect(Number(tables.rows[0]?.count)).toBe(27);
      await h.runtime.query(`SELECT blacklist.append_audit(jsonb_build_object(
        'actor_type','system','actor_ref','migration-test','action','migration.test',
        'target_type','database','target_id','fixture','details','{}'::jsonb))`);
      const before = await h.runtime.query<{ seq: string; row_hash: string }>(
        'SELECT seq,row_hash FROM blacklist.audit_log ORDER BY seq',
      );
      const dump = execFileSync('docker', [
        'exec',
        h.container,
        'pg_dump',
        '--username=postgres',
        '--dbname=postgres',
        '--format=custom',
      ]);
      await h.admin.query('CREATE DATABASE phase7_restore');
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          h.container,
          'pg_restore',
          '--username=postgres',
          '--dbname=phase7_restore',
          '--exit-on-error',
        ],
        { input: dump, stdio: ['pipe', 'ignore', 'pipe'] },
      );
      // pg_dump preserves schema owners and explicit ACLs. Database ACLs are a
      // provisioning responsibility and are deliberately restored separately.
      await h.admin.query(`REVOKE CREATE,TEMPORARY ON DATABASE phase7_restore FROM PUBLIC;
        GRANT CREATE ON DATABASE phase7_restore TO gate_migrator`);
      restored = new Pool({ connectionString: connection('phase7_restore') });
      restoredRuntime = new Pool({
        ...h.runtime.options,
        password: h.runtime.options.password,
        database: 'phase7_restore',
      });
      await migrate(connection('phase7_restore'), 'gate_runtime');
      expect(
        (await restoredRuntime.query('SELECT seq,row_hash FROM blacklist.audit_log ORDER BY seq')).rows,
      ).toEqual(before.rows);
      for (const statement of [
        'CREATE TABLE blacklist.forbidden (id int)',
        'CREATE TEMP TABLE forbidden (id int)',
        'TRUNCATE blacklist.audit_log',
        'DELETE FROM blacklist.audit_log',
        'UPDATE blacklist.audit_log SET action=action',
        'UPDATE blacklist.security_email_deliveries SET outcome=outcome',
        'SELECT * FROM blacklist.auth_verifications',
        'UPDATE blacklist_migrations.applied SET sha256=sha256',
        'ALTER FUNCTION blacklist.append_audit(jsonb) SECURITY INVOKER',
      ])
        await expect(restoredRuntime.query(statement)).rejects.toThrow();
      await restored.query("UPDATE blacklist_migrations.applied SET sha256=repeat('0',64) WHERE name=$1", [
        expected[0]?.name,
      ]);
      await expect(migrate(connection('phase7_restore'), 'gate_runtime')).rejects.toThrow(
        'applied_migration_changed',
      );
    } finally {
      await restoredRuntime?.end();
      await restored?.end();
      await h.stop();
    }
  });
});
