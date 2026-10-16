import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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
const config = (extra: Record<string, string | undefined> = {}) =>
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
    ...extra,
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
  it('provisions with a non-superuser owner, preserves credentials and applies eleven forward migrations', async () => {
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
      ).toBe(11);
      expect(
        (
          await migrator.query(
            "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='blacklist'",
          )
        ).rows[0]?.n,
      ).toBe(34);
    } finally {
      await migrator.end();
    }
    ctx = createIdentity(runtimeUrl, {
      secret: randomBytes(32).toString('base64url'),
      origin,
      rpId: 'staging.example.test',
      rpName: 'Blacklist Staging',
      breakGlassEnabled: false,
      registration: { mode: 'open' },
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
  it('rejects spoofed proxy peers and confines SSR client-IP authority to the internal route', async () => {
    if (!ctx) throw new Error('fixture_runtime_missing');
    const settings = config();
    const app = createServer(ctx, settings, false);
    let observedPrefix: string | undefined;
    app.addHook('preHandler', async (request) => {
      observedPrefix = request.clientPrefix;
    });
    const gate = { 'x-blacklist-staging-access': stagingToken };
    const internal = { ...gate, 'x-bl-internal-token': settings.INTERNAL_API_TOKEN };
    try {
      const spoofed = await app.inject({
        url: '/api/internal/v1/viewer',
        remoteAddress: '192.0.2.9',
        headers: { ...internal, 'x-forwarded-for': '127.0.0.1', 'x-bl-client-ip': '198.51.100.7' },
      });
      expect(spoofed.statusCode).toBe(404);
      expect(observedPrefix).toBeUndefined();
      for (const supplied of [undefined, 'wrong']) {
        const rejected = await app.inject({
          url: '/api/internal/v1/viewer',
          remoteAddress: '127.0.0.1',
          headers: { ...gate, ...(supplied ? { 'x-bl-internal-token': supplied } : {}) },
        });
        expect(rejected.statusCode).toBe(404);
        expect(observedPrefix).toBeUndefined();
      }
      for (const test of [
        { peer: '192.0.2.9', forwarded: '198.51.100.7', expected: 'ip4:192.0.2.9' },
        { peer: '127.0.0.1', forwarded: '198.51.100.7', expected: 'ip4:198.51.100.7' },
        { peer: '127.0.0.1', forwarded: '198.51.100.7, 192.0.2.9', expected: 'ip4:127.0.0.1' },
        { peer: '127.0.0.1', forwarded: 'malformed', expected: 'ip4:127.0.0.1' },
      ]) {
        const result = await app.inject({
          url: '/api/v1/viewer',
          remoteAddress: test.peer,
          headers: { ...internal, 'x-forwarded-for': test.forwarded, 'x-bl-client-ip': '203.0.113.8' },
        });
        expect(result.statusCode).toBe(200);
        expect(result.json()).toEqual({ kind: 'anonymous' });
        expect(observedPrefix).toBe(test.expected);
        expect(result.body).not.toContain(test.forwarded);
        expect(result.body).not.toContain(settings.INTERNAL_API_TOKEN);
      }
      const authorized = await app.inject({
        url: '/api/internal/v1/viewer',
        remoteAddress: '127.0.0.1',
        headers: { ...internal, 'x-forwarded-for': '192.0.2.9', 'x-bl-client-ip': '198.51.100.7' },
      });
      expect(authorized.statusCode).toBe(200);
      expect(authorized.json()).toEqual({ kind: 'anonymous' });
      expect(observedPrefix).toBe('ip4:198.51.100.7');
    } finally {
      await app.close();
    }
  });
  it('separates visitors behind the web gateway only when the forwarding secret proves the client IP', async () => {
    if (!ctx) throw new Error('fixture_runtime_missing');
    const forwardingToken = randomBytes(32).toString('base64url');
    const settings = config({ CLIENT_IP_FORWARDING_TOKEN: forwardingToken });
    const app = createServer(ctx, settings, false);
    let observedPrefix: string | undefined;
    app.addHook('preHandler', async (request) => {
      observedPrefix = request.clientPrefix;
    });
    const gate = { 'x-blacklist-staging-access': stagingToken };
    const visit = async (headers: Record<string, string>) => {
      const result = await app.inject({ url: '/api/v1/viewer', remoteAddress: '192.0.2.9', headers });
      expect(result.statusCode).toBe(200);
      expect(result.body).not.toContain(forwardingToken);
      return observedPrefix;
    };
    try {
      const proven = (ip: string) => ({
        ...gate,
        'x-bl-client-ip': ip,
        'x-bl-client-ip-token': forwardingToken,
      });
      expect(await visit(proven('198.51.100.7'))).toBe('ip4:198.51.100.7');
      expect(await visit(proven('203.0.113.8'))).toBe('ip4:203.0.113.8');
      expect(await visit(proven('2001:db8:1:2:3::9'))).toBe('ip6:2001:db8:1:2::/64');
      // A browser or direct caller cannot choose its own bucket without the secret.
      for (const token of [undefined, 'wrong', `${forwardingToken}x`])
        expect(
          await visit({
            ...gate,
            'x-bl-client-ip': '198.51.100.7',
            ...(token ? { 'x-bl-client-ip-token': token } : {}),
          }),
        ).toBe('ip4:192.0.2.9');
      expect(await visit(proven('not-an-ip'))).toBe('ip4:192.0.2.9');
    } finally {
      await app.close();
    }
    const unconfigured = createServer(ctx, config(), false);
    unconfigured.addHook('preHandler', async (request) => {
      observedPrefix = request.clientPrefix;
    });
    try {
      await unconfigured.inject({
        url: '/api/v1/viewer',
        remoteAddress: '192.0.2.9',
        headers: { ...gate, 'x-bl-client-ip': '198.51.100.7', 'x-bl-client-ip-token': forwardingToken },
      });
      expect(observedPrefix).toBe('ip4:192.0.2.9');
    } finally {
      await unconfigured.close();
    }
  });
  it('measures a private peer with expiring operator credentials without bypassing route authorization', async () => {
    if (!ctx) throw new Error('fixture_runtime_missing');
    const settings = config({
      STAGING_INGRESS_DIAGNOSTIC_KEY: randomBytes(32).toString('hex'),
      STAGING_INGRESS_DIAGNOSTIC_UNTIL: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    const app = createServer(ctx, settings, false);
    const headers = {
      'x-blacklist-staging-access': stagingToken,
      'x-bl-internal-token': settings.INTERNAL_API_TOKEN,
      'x-bl-ingress-diagnostic': settings.STAGING_INGRESS_DIAGNOSTIC_KEY,
    };
    const peer = '10.111.7.1';
    try {
      const blocked = await app.inject({ url: '/api/internal/v1/viewer', remoteAddress: peer, headers });
      expect(blocked.statusCode).toBe(404);
      expect(blocked.headers).not.toHaveProperty('x-bl-ingress-receipt');
      const r = await app.inject({ url: '/api/v1/viewer', remoteAddress: peer, headers });
      expect(r.json()).toEqual({ kind: 'anonymous' });
      const encoded = r.headers['x-bl-ingress-receipt'];
      if (typeof encoded !== 'string') throw new Error('test_receipt_missing');
      const measured = z
        .strictObject({
          peer: z.ipv4(),
          forwardedIsSingleIp: z.boolean(),
          forwardedContainsProbe: z.boolean(),
          probeAcceptedAsClientIp: z.boolean(),
          internalPeers: z.array(z.ipv4()).max(8),
          internalAccepted: z.number().int().nonnegative(),
          internalDenied: z.number().int().nonnegative(),
        })
        .parse(JSON.parse(Buffer.from(encoded, 'base64url').toString()));
      expect(measured.peer).toBe(peer);
      expect(measured.internalPeers).toEqual([peer]);
      expect(measured.internalAccepted).toBe(0);
      expect(measured.internalDenied).toBe(1);
      expect(settings.TRUSTED_PROXY_CIDRS).toBe('127.0.0.1/32');
      const privateRequest = await app.inject({ url: '/api/v1/me/security', remoteAddress: peer, headers });
      expect(privateRequest.statusCode).toBe(401);
      expect(privateRequest.headers).not.toHaveProperty('x-bl-ingress-receipt');
      const configured = createServer(
        ctx,
        { ...settings, TRUSTED_PROXY_CIDRS: `${measured.peer}/32` },
        false,
      );
      try {
        const authorized = await configured.inject({
          url: '/api/internal/v1/viewer',
          remoteAddress: peer,
          headers,
        });
        expect(authorized.statusCode).toBe(200);
        expect(authorized.json()).toEqual({ kind: 'anonymous' });
        const stillPrivate = await configured.inject({
          url: '/api/v1/me/security',
          remoteAddress: peer,
          headers,
        });
        expect(stillPrivate.statusCode).toBe(401);
      } finally {
        await configured.close();
      }
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
      registration: { mode: 'open' },
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
