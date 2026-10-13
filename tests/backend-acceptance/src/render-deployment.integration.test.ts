import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createIdentity, type IdentityContext } from '@blacklist/domain';
import { createServer } from '@blacklist/api';
import { readApiConfig } from '@blacklist/config';
import { provisionCloudRoles } from '../../../packages/db/src/provision.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { startDatabase, type Harness } from './database.ts';

let h: Harness, adminUrl: string, runtimeUrl: string, migratorUrl: string;
let ctx: IdentityContext | undefined;
const runtimePassword = randomBytes(32).toString('base64url');
const migratorPassword = randomBytes(32).toString('base64url');
const stagingToken = randomBytes(32).toString('base64url');
const origin = 'https://staging.example.test';
const config = () =>
  readApiConfig({
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: 'staging',
    DATABASE_URL: runtimeUrl,
    APP_ORIGIN: origin,
    WEBAUTHN_RP_ID: 'staging.example.test',
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
    INTERNAL_API_TOKEN: randomBytes(32).toString('base64url'),
    STAGING_ACCESS_TOKEN: stagingToken,
    TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
  });
beforeAll(async () => {
  h = await startDatabase();
  const password = randomBytes(32).toString('base64url');
  const statement = await h.admin.query<{ command: string }>(
    "SELECT format('CREATE ROLE managed_owner LOGIN CREATEROLE NOINHERIT NOCREATEDB NOSUPERUSER PASSWORD %L', $1::text) AS command",
    [password],
  );
  const command = statement.rows[0]?.command;
  if (!command) throw new Error('fixture_owner_missing');
  await h.admin.query(command);
  await h.admin.query('CREATE DATABASE render_staging_fixture OWNER managed_owner');
  const url = new URL(`postgresql://127.0.0.1:${h.port}/render_staging_fixture`);
  url.username = 'managed_owner';
  url.password = password;
  adminUrl = url.toString();
  url.username = 'blacklist_app';
  url.password = runtimePassword;
  runtimeUrl = url.toString();
  url.username = 'blacklist_migrator';
  url.password = migratorPassword;
  migratorUrl = url.toString();
});
afterAll(async () => {
  if (ctx) await ctx.runtime.close();
  await h?.stop();
});

describe('managed PostgreSQL staging deployment rehearsal (local PostgreSQL 18)', () => {
  it('provisions with a non-superuser owner, preserves credentials and applies seven existing migrations', async () => {
    await provisionCloudRoles(adminUrl, { runtime: runtimePassword, migrator: migratorPassword });
    await provisionCloudRoles(adminUrl, {
      runtime: randomBytes(32).toString('base64url'),
      migrator: randomBytes(32).toString('base64url'),
    });
    await migrate(migratorUrl, 'blacklist_app');
    await migrate(migratorUrl, 'blacklist_app');
    const migrator = new Pool({ connectionString: migratorUrl });
    try {
      expect(
        (await migrator.query('SELECT count(*)::int AS n FROM blacklist_migrations.applied')).rows[0]?.n,
      ).toBe(7);
      expect(
        (
          await migrator.query(
            "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='blacklist'",
          )
        ).rows[0]?.n,
      ).toBe(27);
    } finally {
      await migrator.end();
    }
    ctx = createIdentity(runtimeUrl, {
      secret: randomBytes(32).toString('base64url'),
      origin,
      rpId: 'staging.example.test',
      rpName: 'Blacklist Staging',
      breakGlassEnabled: false,
    });
    await ctx.runtime.start();
    expect((await ctx.runtime.pool.query('SELECT current_user AS name')).rows[0]?.name).toBe('blacklist_app');
    await expect(ctx.runtime.pool.query('CREATE TABLE public.forbidden_test(id int)')).rejects.toThrow();
    await expect(ctx.runtime.pool.query('CREATE TEMP TABLE forbidden_test(id int)')).rejects.toThrow();
    await expect(ctx.runtime.pool.query('SELECT * FROM blacklist.auth_verifications')).rejects.toThrow();
    await expect(ctx.runtime.pool.query('DELETE FROM blacklist.audit_log')).rejects.toThrow();
    await expect(ctx.runtime.pool.query('INSERT INTO blacklist.audit_log(seq) VALUES (1)')).rejects.toThrow();
  });
  it('keeps authentication, exact Origin and internal-route policy mandatory behind the staging gate', async () => {
    if (!ctx) throw new Error('fixture_runtime_missing');
    const settings = config();
    const app = createServer(ctx, settings, false);
    const gate = { 'x-blacklist-staging-access': stagingToken };
    try {
      expect((await app.inject('/healthz')).statusCode).toBe(200);
      expect((await app.inject('/api/v1/me/security')).statusCode).toBe(404);
      expect((await app.inject({ url: '/api/v1/me/security', headers: gate })).statusCode).toBe(401);
      expect((await app.inject({ url: '/api/internal/v1/viewer', headers: gate })).statusCode).toBe(404);
      expect(
        (
          await app.inject({
            url: '/api/internal/v1/viewer',
            headers: { ...gate, 'x-bl-internal-token': settings.INTERNAL_API_TOKEN },
          })
        ).json(),
      ).toEqual({ kind: 'anonymous' });
      for (const value of ['https://foreign.example', 'null', undefined])
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/auth/register/start',
              headers: { ...gate, 'content-type': 'application/json', ...(value ? { origin: value } : {}) },
              payload: { email: 'synthetic-deployment@example.test' },
            })
          ).statusCode,
        ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/register/start',
            headers: { ...gate, origin, 'content-type': 'application/json' },
            payload: { email: 'synthetic-deployment@example.test' },
          })
        ).statusCode,
      ).toBe(202);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/register/start',
            headers: { ...gate, origin, 'content-type': 'application/json' },
            payload: { email: 'not-an-email' },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
  it('reports a database health failure safely instead of returning fake readiness', async () => {
    if (!ctx) throw new Error('fixture_runtime_missing');
    const app = createServer(ctx, config(), false);
    const outage = vi
      .spyOn(ctx.runtime, 'checkConnection')
      .mockRejectedValue(new Error('private driver payload'));
    try {
      const result = await app.inject('/healthz');
      expect(result.statusCode).toBe(503);
      expect(result.json()).toMatchObject({ status: 503, code: 'temporarily_unavailable' });
      expect(result.body).not.toContain('private driver payload');
    } finally {
      outage.mockRestore();
      await app.close();
    }
  });
  it('retains synthetic private state after application runtime restart', async () => {
    if (!ctx) throw new Error('fixture_runtime_missing');
    const before = await ctx.runtime.pool.query('SELECT id FROM blacklist.registration_intents');
    expect(before.rowCount).toBe(1);
    await ctx.runtime.close();
    ctx = undefined;
    const settings = config();
    ctx = createIdentity(runtimeUrl, {
      secret: settings.BETTER_AUTH_SECRET,
      origin,
      rpId: 'staging.example.test',
      rpName: 'Blacklist Staging',
      breakGlassEnabled: false,
    });
    await ctx.runtime.start();
    expect((await ctx.runtime.pool.query('SELECT id FROM blacklist.registration_intents')).rows).toEqual(
      before.rows,
    );
  });
  it('rejects preexisting unsafe roles instead of repairing them silently', async () => {
    await h.admin.query('ALTER ROLE blacklist_app CREATEDB');
    try {
      await expect(
        provisionCloudRoles(adminUrl, {
          runtime: runtimePassword,
          migrator: migratorPassword,
        }),
      ).rejects.toThrow('existing_database_role_unsafe');
    } finally {
      await h.admin.query('ALTER ROLE blacklist_app NOCREATEDB');
    }
  });
});
