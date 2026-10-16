import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { z } from 'zod';
import { readApiConfig, readWorkerConfig } from '@blacklist/config';
import { createServer } from '@blacklist/api';
import { smtpMailer, startWorker } from '@blacklist/worker';
import {
  createIdentity,
  verifyAudit,
  bootstrapStaff,
  startEnrollment,
  completeEnrollment,
  resolveSession,
  operatorApproveInvitation,
  cleanupIdentity,
  type IdentityContext,
} from '@blacklist/domain';
import { schema, eq, sql } from '@blacklist/db';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { startDatabase, type Harness } from './database.ts';
import { browserRegistration, browserAssertion } from './browser-webauthn.ts';
import {
  enrollmentChallenge,
  authenticationChallenge,
  type UserActor,
  type StaffAction,
  replacementChallenge,
  hasPermission,
  lockActor,
} from '@blacklist/domain';

let h: Harness,
  ctx: IdentityContext,
  app: ReturnType<typeof createServer>,
  mailContainer: string,
  mailApi: string,
  origin: string;
const secret = randomBytes(32).toString('hex');
const operator = { kind: 'cli' as const, actorRef: 'cli:test-operator', operator: 'Test operator' };
let pendingStaff: { email: string; flowToken: string };
function urlFor(pool: Harness['migrator']) {
  const u = new URL(`postgresql://127.0.0.1:${h.port}/postgres`);
  u.username = pool.options.user ?? '';
  if (typeof pool.options.password !== 'string') throw new Error('test_database_password_missing');
  u.password = pool.options.password;
  return u.toString();
}
async function waitFor<T>(fn: () => Promise<T | null>, seconds = 15): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('test_condition_timeout');
}
async function findToken(recipient: string, path: string, invitationId?: string) {
  return waitFor(async () => {
    const response = await fetch(`${mailApi}/api/v1/messages`);
    const data = z
      .object({
        messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
      })
      .parse(await response.json());
    for (const m of data.messages.filter((m) => m.To.some((to) => to.Address === recipient))) {
      const body = z
        .object({ Text: z.string() })
        .parse(await (await fetch(`${mailApi}/api/v1/message/${m.ID}`)).json());
      const token = body.Text.split(`${origin}${path}#token=`)[1]?.split(/\s/u)[0];
      if (token && invitationId) {
        const [i] = await ctx.runtime.db
          .select()
          .from(schema.invitations)
          .where(eq(schema.invitations.id, invitationId));
        if (i?.tokenHash === createHash('sha256').update(token).digest('hex') && i.deliveredAt) return token;
      } else if (token) return token;
    }
    return null;
  });
}
const post = (url: string, payload: unknown, cookie?: string) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    payload: JSON.stringify(payload),
  });
const cookieOf = (headers: Record<string, unknown>) => {
  const all = headers['set-cookie'];
  const first = Array.isArray(all) ? all[0] : all;
  if (typeof first !== 'string') throw new Error('test_cookie_missing');
  return first.split(';')[0] ?? '';
};
beforeAll(async () => {
  h = await startDatabase();
  await migrate(urlFor(h.migrator), 'gate_runtime');
  mailContainer = execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--publish',
      '127.0.0.1::1025',
      '--publish',
      '127.0.0.1::8025',
      'axllent/mailpit:v1.27.8',
    ],
    { encoding: 'utf8' },
  ).trim();
  const port = (containerPort: string) =>
    Number(
      execFileSync(
        'docker',
        [
          'inspect',
          '--format',
          `{{(index (index .NetworkSettings.Ports "${containerPort}/tcp") 0).HostPort}}`,
          mailContainer,
        ],
        { encoding: 'utf8' },
      ).trim(),
    );
  mailApi = `http://127.0.0.1:${port('8025')}`;
  const probe = netServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const bound = probe.address();
  if (!bound || typeof bound === 'string') throw new Error('test_port_missing');
  const apiPort = bound.port;
  await new Promise<void>((r) => probe.close(() => r()));
  origin = `http://localhost:${apiPort}`;
  const env = {
    NODE_ENV: 'test',
    DATABASE_URL: urlFor(h.runtime),
    APP_ORIGIN: origin,
    BETTER_AUTH_SECRET: secret,
    INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
    WEBAUTHN_RP_ID: 'localhost',
    API_PORT: String(apiPort),
    TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
  };
  ctx = createIdentity(
    env.DATABASE_URL,
    {
      secret,
      origin,
      rpId: 'localhost',
      rpName: 'Blacklist',
      breakGlassEnabled: false,
      registration: { mode: 'open' },
    },
    { breach: async () => false },
  );
  await ctx.runtime.start();
  app = createServer(ctx, readApiConfig(env), false);
  await app.listen({ host: '127.0.0.1', port: apiPort });
  const mailer = smtpMailer(
    readWorkerConfig({
      ...env,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(port('1025')),
      SMTP_SECURE: 'false',
      EMAIL_FROM: 'security@example.test',
    }),
  );
  await waitFor(async () => {
    try {
      const response = await fetch(`${mailApi}/api/v1/messages`);
      return response.ok ? true : null;
    } catch {
      return null;
    }
  });
  await startWorker(ctx, mailer, 0.5);
}, 120000);
afterAll(async () => {
  if (app) await app.close();
  if (ctx) await ctx.runtime.close();
  if (h) await h.stop();
  if (mailContainer) execFileSync('docker', ['rm', '--force', mailContainer], { stdio: 'ignore' });
});

describe('Phase 7 application foundation (not disposable gate schema)', () => {
  it('cleans an expired enrollment flow even when its last challenge has a later expiry', async () => {
    const [inv] = await ctx.runtime.db
      .insert(schema.invitations)
      .values({
        email: `cleanup-${randomUUID()}@example.test`,
        role: 'moderator',
        basis: 'admin',
        invitedByActor: 'system:test',
        requiresSecondApproval: false,
        state: 'issued',
        enrollmentCodeHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      })
      .returning();
    if (!inv) throw new Error('test_cleanup_invitation_missing');
    const [flow] = await ctx.runtime.db
      .insert(schema.enrollmentFlows)
      .values({
        invitationId: inv.id,
        flowHash: randomBytes(32).toString('hex'),
        invitationGeneration: 0,
        expiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!flow) throw new Error('test_cleanup_flow_missing');
    await ctx.runtime.db.insert(schema.challenges).values({
      invitationId: inv.id,
      flowId: flow.id,
      purpose: 'enroll',
      challengeHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 300000),
    });
    await cleanupIdentity(ctx);
    expect(
      await ctx.runtime.db
        .select()
        .from(schema.enrollmentFlows)
        .where(eq(schema.enrollmentFlows.id, flow.id)),
    ).toHaveLength(0);
  });
  it('runs reviewed migrations twice and protects runtime DDL, TEMP, audit and staff role boundaries', async () => {
    await migrate(urlFor(h.migrator), 'gate_runtime');
    await expect(h.runtime.query('CREATE TABLE blacklist.forbidden (id int)')).rejects.toThrow();
    await expect(h.runtime.query('CREATE TEMP TABLE forbidden (id int)')).rejects.toThrow();
    await expect(h.runtime.query('DELETE FROM blacklist.audit_log')).rejects.toThrow();
    await expect(h.runtime.query('INSERT INTO blacklist.audit_log(seq) VALUES(999)')).rejects.toThrow();
    const [u] = await ctx.runtime.db
      .insert(schema.user)
      .values({ email: `boundary-${randomUUID()}@example.test`, name: 'Boundary', emailVerified: true })
      .returning();
    if (!u) throw new Error('test_fixture_missing');
    await expect(
      ctx.runtime.db
        .insert(schema.roles)
        .values({ userId: u.id, role: 'admin', grantedVia: 'invitation', sourceId: randomUUID() }),
    ).rejects.toThrow();
    await expect(h.runtime.query('SELECT * FROM blacklist.auth_verifications')).rejects.toThrow();
  });
  it('rejects every invalid mutation origin, raw token surface and undeclared route', async () => {
    await writeFile(
      '/tmp/blacklist-phase7-authorization-matrix.json',
      JSON.stringify(app.authorizationMatrix, null, 2),
    );
    for (const route of app.authorizationMatrix.filter((r) => r.policy.auth !== 'public')) {
      const response = await app.inject({
        method: route.method as 'GET' | 'HEAD' | 'POST' | 'PATCH',
        url: route.path,
        headers: { origin, 'content-type': 'application/json' },
        ...(route.policy.mutation ? { payload: '{}' } : {}),
      });
      expect(response.statusCode).toBe(route.policy.auth === 'internal' ? 404 : 401);
    }
    for (const invalid of [
      undefined,
      'null',
      'https://localhost',
      'http://localhost:1',
      'http://sibling.localhost',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { ...(invalid ? { origin: invalid } : {}), 'content-type': 'application/json' },
        payload: { email: 'nobody@example.test', password: 'fictional test passphrase' },
      });
      expect(response.statusCode).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/sign-up/email',
          headers: { origin },
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(() => app.get('/undeclared', async () => ({ success: true }))).toThrow();
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/viewer?token=fake',
      headers: { authorization: 'Bearer fake', cookie: '__Host-bl_session=fake' },
    });
    expect(r.json()).toEqual({ kind: 'anonymous' });
  });
  it('wakes only after committed accepted mail requests and preserves actual queued SMTP delivery', async () => {
    const target = 'https://fixture-worker.onrender.com/healthz',
      originalFetch = globalThis.fetch;
    const wake = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      input === target ? new Response(null) : originalFetch(input, init),
    );
    vi.stubGlobal('fetch', wake);
    const gateway = randomBytes(32).toString('hex');
    const second = createServer(
      ctx,
      readApiConfig({
        NODE_ENV: 'test',
        DEPLOYMENT_ENV: 'staging',
        DATABASE_URL: urlFor(h.runtime),
        APP_ORIGIN: origin,
        WEBAUTHN_RP_ID: 'localhost',
        BETTER_AUTH_SECRET: secret,
        INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
        STAGING_ACCESS_TOKEN: gateway,
        MAIL_WORKER_HEALTH_URL: target,
      }),
      false,
    );
    const email = `wake-${randomUUID()}@example.test`;
    try {
      for (const [extra, payload, expected] of [
        [{ origin: 'https://foreign.example.test', 'x-blacklist-staging-access': gateway }, { email }, 403],
        [{ origin, 'x-blacklist-staging-access': 'incorrect' }, { email }, 404],
        [{ origin, 'x-blacklist-staging-access': gateway }, { email: 'invalid' }, 400],
      ] as const) {
        expect(
          (
            await second.inject({
              method: 'POST',
              url: '/api/v1/auth/register/start',
              headers: { ...extra, 'content-type': 'application/json' },
              payload,
            })
          ).statusCode,
        ).toBe(expected);
      }
      expect(wake.mock.calls.filter(([input]) => input === target)).toHaveLength(0);
      expect(
        (
          await second.inject({
            method: 'POST',
            url: '/api/v1/auth/register/start',
            headers: { origin, 'x-blacklist-staging-access': gateway, 'content-type': 'application/json' },
            payload: { email },
          })
        ).statusCode,
      ).toBe(202);
      expect(wake.mock.calls.filter(([input]) => input === target)).toHaveLength(1);
      expect(
        await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, email)),
      ).toHaveLength(0);
      await findToken(email, '/register/complete');
      await waitFor(async () => {
        const [intent] = await ctx.runtime.db
          .select()
          .from(schema.intents)
          .where(eq(schema.intents.email, email));
        return intent?.state === 'issued' ? true : null;
      });
    } finally {
      await second.close();
      vi.unstubAllGlobals();
    }
  });
  it('registers and resets members with twelve characters while rejecting shorter passwords, expired links and replay (ADR 0016)', async () => {
    const email = `eight-${randomUUID()}@example.test`,
      password = randomBytes(6).toString('hex');
    expect((await post('/api/v1/auth/register/start', { email })).statusCode).toBe(202);
    const token = await findToken(email, '/register/complete');
    const form = { handle: `e_${randomBytes(5).toString('hex')}`, password, confirmPassword: password };
    expect(
      (
        await post('/api/v1/auth/register/complete', {
          token,
          form: { ...form, password: 'eleven11111', confirmPassword: 'eleven11111' },
        })
      ).statusCode,
    ).toBe(400);
    expect(await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(
      0,
    );
    const result = await post('/api/v1/auth/register/complete', { token, form });
    expect(result.statusCode).toBe(200);
    const cookie = cookieOf(result.headers);
    for (const url of ['/api/v1/me', '/api/v1/viewer'])
      expect((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/me',
          headers: { cookie, origin, 'content-type': 'application/json' },
          payload: { displayName: 'Synthetic member' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/me',
          headers: { cookie, origin, 'content-type': 'application/json' },
          payload: { displayName: null },
        })
      ).statusCode,
    ).toBe(400);
    expect((await post('/api/v1/auth/register/complete', { token, form })).statusCode).toBe(400);
    expect((await post('/api/v1/auth/login', { email, password })).statusCode).toBe(200);
    expect((await post('/api/v1/auth/password/forgot', { email })).statusCode).toBe(202);
    const reset = await findToken(email, '/reset-password'),
      next = randomBytes(6).toString('hex');
    expect(
      (
        await post('/api/v1/auth/password/reset', {
          token: reset,
          form: { password: 'eleven11111', confirmPassword: 'eleven11111' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post('/api/v1/auth/password/reset', {
          token: reset,
          form: { password: next, confirmPassword: next },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me/security', headers: { cookie } })).statusCode,
    ).toBe(401);
    expect((await post('/api/v1/auth/login', { email, password })).statusCode).toBe(401);
    expect((await post('/api/v1/auth/login', { email, password: next })).statusCode).toBe(200);
    expect(
      (
        await post('/api/v1/auth/password/reset', {
          token: reset,
          form: { password: next, confirmPassword: next },
        })
      ).statusCode,
    ).toBe(400);
    const expiredEmail = `expired-${randomUUID()}@example.test`;
    expect((await post('/api/v1/auth/register/start', { email: expiredEmail })).statusCode).toBe(202);
    const expiredToken = await findToken(expiredEmail, '/register/complete');
    await ctx.runtime.db
      .update(schema.intents)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.intents.email, expiredEmail));
    expect(
      (
        await post('/api/v1/auth/register/complete', {
          token: expiredToken,
          form: { ...form, handle: `x_${randomBytes(5).toString('hex')}` },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, expiredEmail)),
    ).toHaveLength(0);
  });
  it('completes email-first registration via real queued SMTP delivery and rejects replay', async () => {
    const email = `member-${randomUUID()}@example.test`,
      password = 'fictional member passphrase 2026';
    expect((await post('/api/v1/auth/register/start', { email })).statusCode).toBe(202);
    expect(await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(
      0,
    );
    const token = await findToken(email, '/register/complete');
    const form = { handle: `m_${randomBytes(5).toString('hex')}`, password, confirmPassword: password };
    const result = await post('/api/v1/auth/register/complete', { token, form });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ kind: 'success' });
    const cookie = cookieOf(result.headers);
    const set = result.headers['set-cookie'];
    expect(String(set).includes('__Host-bl_session=')).toBe(true);
    expect(String(set).includes('Secure')).toBe(true);
    expect(String(set).includes('HttpOnly')).toBe(true);
    expect((await post('/api/v1/auth/register/complete', { token, form })).statusCode).toBe(400);
    const security = await app.inject({ method: 'GET', url: '/api/v1/me/security', headers: { cookie } });
    expect(security.statusCode).toBe(200);
    expect(security.json().data.email).toBe(email);
    const otherLogin = await post('/api/v1/auth/login', { email, password });
    expect(otherLogin.statusCode).toBe(200);
    const otherCookie = cookieOf(otherLogin.headers);
    const revokeWithoutReauth = await post('/api/v1/me/sessions/revoke', { sessionId: 'others' }, cookie);
    expect(revokeWithoutReauth.statusCode).toBe(400);
    expect(revokeWithoutReauth.json().code).toBe('reauth_required');
    expect((await post('/api/v1/auth/reauth', { password }, cookie)).statusCode).toBe(200);
    expect((await post('/api/v1/me/sessions/revoke', { sessionId: 'others' }, cookie)).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me/security', headers: { cookie: otherCookie } }))
        .statusCode,
    ).toBe(401);
    const [u] = await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, email));
    if (!u) throw new Error('test_member_missing');
    const [s] = await ctx.runtime.db.select().from(schema.session).where(eq(schema.session.userId, u.id));
    if (!s) throw new Error('test_session_missing');
    for (const header of [
      { cookie: `__Host-bl_session=${s.token}` },
      { authorization: `Bearer ${s.token}` },
    ]) {
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/me/security', headers: header })).statusCode,
      ).toBe(401);
    }
    expect((await post('/api/v1/auth/password/forgot', { email })).statusCode).toBe(202);
    const reset = await findToken(email, '/reset-password');
    const next = 'fictional replacement passphrase 2026';
    expect(
      (
        await post('/api/v1/auth/password/reset', {
          token: reset,
          form: { password: next, confirmPassword: next },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await post('/api/v1/auth/password/reset', {
          token: reset,
          form: { password: next, confirmPassword: next },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me/security', headers: { cookie } })).statusCode,
    ).toBe(401);
    expect((await post('/api/v1/auth/login', { email, password })).statusCode).toBe(401);
    const login = await post('/api/v1/auth/login', { email, password: next });
    expect(login.statusCode).toBe(200);
    const signed = cookieOf(login.headers);
    await post('/api/v1/auth/reauth', { password: next }, signed);
    const blocked = await post(
      '/api/v1/me/email-change',
      { newEmail: `new-${randomUUID()}@example.test` },
      signed,
    );
    expect(blocked.json().code).toBe('cooling_period');
    expect((await verifyAudit(ctx.runtime.db)).rows).toBeGreaterThanOrEqual(2);
  });
  it('enforces split-secret invitation delivery, five attempts, no partial account and no bootstrap reuse', async () => {
    const email = `staff-${randomUUID()}@example.test`;
    const created = await bootstrapStaff(ctx, operator, email);
    await expect(bootstrapStaff(ctx, operator, `other-${randomUUID()}@example.test`)).rejects.toThrow(
      'forbidden',
    );
    const token = await findToken(email, '/staff/enroll');
    await waitFor(async () => {
      const [i] = await ctx.runtime.db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.id, created.invitationId));
      return i?.deliveredAt ? true : null;
    });
    await expect(operatorApproveInvitation(ctx, operator, created.invitationId)).rejects.toThrow('forbidden');
    const bad = await startEnrollment(ctx, token, 'ZZZZZZZZZZ');
    expect(bad.kind).toBe('code_incorrect');
    const correct = await startEnrollment(ctx, token, created.enrollmentCode);
    expect(correct.kind).toBe('ok');
    if (correct.kind !== 'ok') throw new Error('test_enrollment_failed');
    pendingStaff = { email, flowToken: correct.flowToken };
    await expect(completeEnrollment(ctx, correct.flowToken)).rejects.toThrow('enrollment_incomplete');
    expect(await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(
      0,
    );
    const arbitrary = await resolveSession(
      ctx.runtime,
      ctx.auth,
      new Headers({ cookie: `__Host-bl_session=${token}` }),
    );
    expect(arbitrary).toBeNull();
    await ctx.runtime.db.execute(sql`select 1`);
  });
  it('activates staff only after two verified keys; binds assurance, independent approvals, offboarding and recovery barriers', async () => {
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${origin}/healthz`);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      const devices = new Map<
        string,
        {
          credentialId: string;
          isResidentCredential: boolean;
          rpId?: string;
          privateKey: string;
          userHandle?: string;
          signCount: number;
        }
      >();
      const addDevice = () =>
        cdp.send('WebAuthn.addVirtualAuthenticator', {
          options: {
            protocol: 'ctap2',
            transport: 'usb',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
          },
        });
      async function assertionFor(options: Parameters<typeof browserAssertion>[1]) {
        const key = options.allowCredentials?.find((k) => devices.has(k.id));
        const credential = key ? devices.get(key.id) : undefined;
        if (!credential || !key) throw new Error('test_authenticator_missing');
        const device = await addDevice();
        await cdp.send('WebAuthn.addCredential', { authenticatorId: device.authenticatorId, credential });
        try {
          const response = await browserAssertion(page, options);
          const updated = await cdp.send('WebAuthn.getCredentials', {
            authenticatorId: device.authenticatorId,
          });
          if (updated.credentials[0]) devices.set(key.id, updated.credentials[0]);
          return response;
        } finally {
          await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: device.authenticatorId });
        }
      }
      const password = 'fictional staff password 2026';
      async function enroll(flowToken: string) {
        expect(
          (
            await post(
              '/api/v1/auth/staff/enrollment/password',
              { password },
              `__Host-bl_enroll=${flowToken}`,
            )
          ).statusCode,
        ).toBe(200);
        for (let i = 0; i < 2; i++) {
          const challenge = await enrollmentChallenge(ctx, flowToken);
          const device = await addDevice();
          const response = await browserRegistration(page, challenge.options);
          const stored = await cdp.send('WebAuthn.getCredentials', {
            authenticatorId: device.authenticatorId,
          });
          if (!stored.credentials[0]) throw new Error('test_registered_credential_missing');
          devices.set(response.id, stored.credentials[0]);
          await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: device.authenticatorId });
          const registered = await post(
            '/api/v1/auth/staff/enrollment/credential',
            { challengeId: challenge.challengeId, response },
            `__Host-bl_enroll=${flowToken}`,
          );
          expect(registered.statusCode).toBe(200);
          expect(
            (
              await post(
                '/api/v1/auth/staff/enrollment/credential',
                { challengeId: challenge.challengeId, response },
                `__Host-bl_enroll=${flowToken}`,
              )
            ).statusCode,
          ).toBe(400);
        }
        expect(
          (await post('/api/v1/auth/staff/enrollment/complete', {}, `__Host-bl_enroll=${flowToken}`))
            .statusCode,
        ).toBe(200);
      }
      async function staffLogin(email: string) {
        const login = await post('/api/v1/auth/login', { email, password });
        expect(login.json()).toEqual({ kind: 'staff_verification_required' });
        const cookie = cookieOf(login.headers);
        expect(
          (await app.inject({ method: 'GET', url: '/api/v1/admin/staff', headers: { cookie } })).statusCode,
        ).toBe(401);
        const actor = await resolveSession(ctx.runtime, ctx.auth, new Headers({ cookie }), true);
        if (!actor) throw new Error('test_pending_actor_missing');
        const challenge = await authenticationChallenge(ctx, actor, 'login');
        const response = await assertionFor(challenge.options);
        expect(
          (
            await post(
              '/api/v1/auth/staff/login/assertion',
              { challengeId: challenge.challengeId, response },
              cookie,
            )
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await post(
              '/api/v1/auth/staff/login/assertion',
              { challengeId: challenge.challengeId, response },
              cookie,
            )
          ).statusCode,
        ).toBe(400);
        const assured = await resolveSession(ctx.runtime, ctx.auth, new Headers({ cookie }));
        if (!assured) throw new Error('test_assured_actor_missing');
        const viewer = await app.inject({ method: 'GET', url: '/api/v1/viewer', headers: { cookie } });
        expect(viewer.statusCode).toBe(200);
        expect(viewer.json().kind).toBe('signed_in');
        expect(viewer.body).not.toContain(email);
        for (const url of [
          '/api/v1/me/security',
          '/api/v1/me/staff-security',
          '/api/v1/me/staff-recovery',
          '/api/v1/mod/recoveries',
        ])
          expect((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode).toBe(200);
        for (const url of [
          '/api/v1/admin/staff',
          '/api/v1/admin/invitations',
          '/api/v1/admin/overview',
          '/api/v1/admin/roles',
          '/api/v1/admin/recoveries',
          '/api/v1/admin/members',
        ]) {
          const result = await app.inject({ method: 'GET', url, headers: { cookie } });
          expect(result.statusCode).toBe(assured.roles.includes('admin') ? 200 : 403);
          expect(result.body).not.toContain(email);
        }
        return { actor: assured, cookie };
      }
      async function proof(actor: UserActor, action: StaffAction, credentialId?: string) {
        const challenge = await authenticationChallenge(ctx, actor, 'stepup', action);
        return {
          challengeId: challenge.challengeId,
          response: await assertionFor(
            credentialId
              ? {
                  ...challenge.options,
                  allowCredentials: challenge.options.allowCredentials?.filter((k) => k.id === credentialId),
                }
              : challenge.options,
          ),
        };
      }
      async function invitationFlow(id: string, email: string, code: string) {
        const token = await findToken(email, '/staff/enroll', id);
        const flow = await startEnrollment(ctx, token, code);
        if (flow.kind !== 'ok') throw new Error('test_invitation_flow_failed');
        return flow.flowToken;
      }
      await enroll(pendingStaff.flowToken);
      const a = await staffLogin(pendingStaff.email);
      const secondEmail = `second-admin-${randomUUID()}@example.test`;
      const invitationProof = await proof(a.actor, {
        action: 'staff.invite',
        targetType: 'invitation',
        targetId: 'new',
        parameters: { email: secondEmail, role: 'admin' },
      });
      const invitation = await post(
        '/api/v1/admin/invitations',
        { request: { email: secondEmail, role: 'admin' }, assertion: invitationProof },
        a.cookie,
      );
      expect(invitation.statusCode).toBe(200);
      const created = z
        .object({ invitationId: z.uuid(), enrollmentCode: z.string() })
        .parse(invitation.json());
      expect(
        (
          await post(
            '/api/v1/admin/invitations',
            { request: { email: secondEmail, role: 'admin' }, assertion: invitationProof },
            a.cookie,
          )
        ).statusCode,
      ).toBe(400);
      const selfProof = await proof(a.actor, {
        action: 'staff.invitation.approve',
        targetType: 'invitation',
        targetId: created.invitationId,
        parameters: {},
      });
      expect(
        (
          await post(
            '/api/v1/admin/invitations/action',
            { id: created.invitationId, operation: 'approve', assertion: selfProof },
            a.cookie,
          )
        ).statusCode,
      ).toBe(403);
      await operatorApproveInvitation(ctx, operator, created.invitationId);
      await enroll(await invitationFlow(created.invitationId, secondEmail, created.enrollmentCode));
      const b = await staffLogin(secondEmail);
      await expect(
        ctx.runtime.transaction((tx) => lockActor(tx, { ...a.actor, actorRef: b.actor.actorRef })),
      ).rejects.toThrow('session_expired');
      async function newModerator() {
        const email = `moderator-${randomUUID()}@example.test`;
        const assertion = await proof(a.actor, {
          action: 'staff.invite',
          targetType: 'invitation',
          targetId: 'new',
          parameters: { email, role: 'moderator' },
        });
        const response = await post(
          '/api/v1/admin/invitations',
          { request: { email, role: 'moderator' }, assertion },
          a.cookie,
        );
        const created = z
          .object({ invitationId: z.uuid(), enrollmentCode: z.string() })
          .parse(response.json());
        await enroll(await invitationFlow(created.invitationId, email, created.enrollmentCode));
        return staffLogin(email);
      }
      let m = await newModerator();
      const keys = await ctx.runtime.db
        .select()
        .from(schema.authenticators)
        .where(eq(schema.authenticators.userId, m.actor.userId));
      if (!keys[0] || !keys[1]) throw new Error('test_staff_keys_missing');
      const removing = await proof(
        m.actor,
        {
          action: 'staff.authenticator.remove',
          targetType: 'authenticator',
          targetId: keys[1].id,
          parameters: {},
        },
        keys[0].credentialId,
      );
      expect(
        (
          await post(
            '/api/v1/me/staff-authenticators/remove',
            { id: keys[1].id, assertion: removing },
            m.cookie,
          )
        ).statusCode,
      ).toBe(200);
      await ctx.runtime.db
        .update(schema.security)
        .set({ staffAuthenticatorDeficitSince: new Date(Date.now() - 8 * 86400000) })
        .where(eq(schema.security.userId, m.actor.userId));
      const deficient = await resolveSession(ctx.runtime, ctx.auth, new Headers({ cookie: m.cookie }));
      if (!deficient) throw new Error('test_deficient_actor_missing');
      expect(hasPermission(deficient, 'staff:recovery:verify')).toBe(false);
      const replacement = await replacementChallenge(ctx, deficient);
      const newDevice = await addDevice();
      const registration = await browserRegistration(page, replacement.options);
      const newCredentials = await cdp.send('WebAuthn.getCredentials', {
        authenticatorId: newDevice.authenticatorId,
      });
      if (!newCredentials.credentials[0]) throw new Error('test_replacement_key_missing');
      devices.set(registration.id, newCredentials.credentials[0]);
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: newDevice.authenticatorId });
      // A stolen assured cookie plus a newly registered attacker factor is insufficient.
      expect(
        (
          await post(
            '/api/v1/me/staff-authenticators/credential',
            { challengeId: replacement.challengeId, response: registration },
            m.cookie,
          )
        ).statusCode,
      ).toBe(400);
      const existingProof = await proof(
        deficient,
        {
          action: 'staff.authenticator.register',
          targetType: 'account',
          targetId: 'me',
          parameters: { challengeId: replacement.challengeId, credentialId: registration.id },
        },
        keys[0].credentialId,
      );
      expect(
        (
          await post(
            '/api/v1/me/staff-authenticators/credential',
            { challengeId: replacement.challengeId, response: registration, assertion: existingProof },
            m.cookie,
          )
        ).statusCode,
      ).toBe(200);
      const repaired = await resolveSession(ctx.runtime, ctx.auth, new Headers({ cookie: m.cookie }));
      if (!repaired) throw new Error('test_repaired_actor_missing');
      expect(hasPermission(repaired, 'staff:recovery:verify')).toBe(true);
      m = { actor: repaired, cookie: m.cookie };
      const wrong = await proof(a.actor, {
        action: 'staff.suspend',
        targetType: 'account',
        targetId: m.actor.userId,
        parameters: { reason: 'First reason for suspension' },
      });
      expect(
        (
          await post(
            '/api/v1/admin/staff/state',
            {
              id: m.actor.userId,
              operation: 'suspend',
              reason: 'Different reason for suspension',
              assertion: wrong,
            },
            a.cookie,
          )
        ).statusCode,
      ).toBe(400);
      const opening = await proof(a.actor, {
        action: 'staff.recovery.open',
        targetType: 'account',
        targetId: m.actor.userId,
        parameters: {},
      });
      const opened = await post(
        '/api/v1/admin/recoveries',
        { subjectId: m.actor.userId, assertion: opening },
        a.cookie,
      );
      expect(opened.statusCode).toBe(200);
      const id = z.object({ id: z.uuid() }).parse(opened.json()).id;
      expect(await resolveSession(ctx.runtime, ctx.auth, new Headers({ cookie: m.cookie }))).toBeNull();
      for (const verifier of [a, b])
        expect(
          (
            await post(
              '/api/v1/admin/recoveries/verify',
              {
                id,
                method: 'Verified separate identity channel',
                rationale: 'Independent fictional recovery identity verification',
              },
              verifier.cookie,
            )
          ).statusCode,
        ).toBe(200);
      const selfApproval = await proof(a.actor, {
        action: 'staff.recovery.approve',
        targetType: 'recovery',
        targetId: id,
        parameters: {},
      });
      expect(
        (
          await post(
            '/api/v1/admin/recoveries/action',
            { id, operation: 'approve', assertion: selfApproval },
            a.cookie,
          )
        ).statusCode,
      ).toBe(403);
      const approval = await proof(b.actor, {
        action: 'staff.recovery.approve',
        targetType: 'recovery',
        targetId: id,
        parameters: {},
      });
      expect(
        (
          await post(
            '/api/v1/admin/recoveries/action',
            { id, operation: 'approve', assertion: approval },
            b.cookie,
          )
        ).statusCode,
      ).toBe(200);
      const early = await proof(a.actor, {
        action: 'staff.recovery.complete',
        targetType: 'recovery',
        targetId: id,
        parameters: {},
      });
      expect(
        (
          await post(
            '/api/v1/admin/recoveries/action',
            { id, operation: 'complete', assertion: early },
            a.cookie,
          )
        ).statusCode,
      ).toBe(403);
      // Advance only the fixture's window; the runtime still checks wall-clock time.
      await ctx.runtime.db
        .update(schema.recoveries)
        .set({ objectionWindowEndsAt: new Date(Date.now() - 1000) })
        .where(eq(schema.recoveries.id, id));
      const completion = await proof(a.actor, {
        action: 'staff.recovery.complete',
        targetType: 'recovery',
        targetId: id,
        parameters: {},
      });
      const recovered = await post(
        '/api/v1/admin/recoveries/action',
        { id, operation: 'complete', assertion: completion },
        a.cookie,
      );
      expect(recovered.statusCode).toBe(200);
      const recoveryInvite = z
        .object({ invitationId: z.uuid(), enrollmentCode: z.string() })
        .parse(recovered.json());
      const [subject] = await ctx.runtime.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, m.actor.userId));
      if (!subject) throw new Error('test_subject_missing');
      await enroll(
        await invitationFlow(recoveryInvite.invitationId, subject.email, recoveryInvite.enrollmentCode),
      );
      const restored = await staffLogin(subject.email);
      expect(restored.actor.userId).toBe(m.actor.userId);
      const offboard = await proof(b.actor, {
        action: 'staff.offboard',
        targetType: 'account',
        targetId: restored.actor.userId,
        parameters: { reason: 'Fictional staff offboarding exercise' },
      });
      expect(
        (
          await post(
            '/api/v1/admin/staff/state',
            {
              id: restored.actor.userId,
              operation: 'offboard',
              reason: 'Fictional staff offboarding exercise',
              assertion: offboard,
            },
            b.cookie,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        await resolveSession(ctx.runtime, ctx.auth, new Headers({ cookie: restored.cookie })),
      ).toBeNull();
      expect((await verifyAudit(ctx.runtime.db)).rows).toBeGreaterThan(20);
    } finally {
      await browser.close();
    }
  }, 60000);
});
