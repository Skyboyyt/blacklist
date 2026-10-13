import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { hash } from '@node-rs/argon2';
import { chromium } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { assertHeadlessOptions, authOptions, createAuth, validSession, type GateAuth } from './auth.js';
import { startDatabase, type Harness } from './database.js';
import { login } from './login.js';
import { completeRegistration, digest } from './registration.js';
import * as schema from './schema.js';
import { needsRehash } from './password.js';
import { createGateServer } from './server.js';

let h: Harness;
let auth: GateAuth;
const secret = randomBytes(48).toString('base64url');
const password = 'acceptance gate passphrase';
const email = 'gate-member@example.test';
let userId: string;
let cookie: string;
beforeAll(async () => {
  h = await startDatabase();
  auth = createAuth(h.db, secret);
  const token = randomBytes(32).toString('base64url');
  await h.db
    .insert(schema.intents)
    .values({ email, state: 'issued', tokenHash: digest(token), expiresAt: new Date(Date.now() + 1800_000) });
  userId = await completeRegistration(h, secret, token, password);
});
afterAll(async () => {
  if (h) await h.stop();
});

test('D8/S6: Better Auth Drizzle adapter user/account writes rollback with registration state and audit', async () => {
  for (let step = 1; step <= 5; step++) {
    const token = randomBytes(32).toString('base64url');
    const address = `crash-${step}@example.test`;
    await h.db.insert(schema.intents).values({
      email: address,
      state: 'issued',
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 1800_000),
    });
    const before = await h.runtime.query('SELECT count(*) FROM gate.audit_log');
    await expect(completeRegistration(h, secret, token, password, step)).rejects.toThrow(
      'injected_registration_crash',
    );
    const users = await h.db.select().from(schema.user).where(eq(schema.user.email, address));
    expect(users).toHaveLength(0);
    const [intent] = await h.db.select().from(schema.intents).where(eq(schema.intents.email, address));
    expect(intent?.state).toBe('issued');
    expect((await h.runtime.query('SELECT count(*) FROM gate.audit_log')).rows).toEqual(before.rows);
  }
});
test('S4/S5/S11 baseline: signed login creates policy/activity data; missing policy and stale version fail', async () => {
  const response = await login(h, auth, secret, email, password);
  cookie =
    response.headers
      .getSetCookie()
      .find((item) => item.startsWith('__Host-bl_session='))
      ?.split(';')[0] ?? '';
  expect(cookie.length > 0).toBe(true);
  const headers = new Headers({ cookie });
  const accepted = await validSession(h.db, auth, headers);
  expect(accepted?.userId).toBe(userId);
  if (!accepted) throw new Error('valid fixture session missing');
  const [policy] = await h.db
    .select()
    .from(schema.policy)
    .where(eq(schema.policy.sessionId, accepted.sessionId));
  expect(policy?.createdAt).toBeInstanceOf(Date);
  expect(policy?.lastActivityAt).toBeInstanceOf(Date);
  await h.db.update(schema.security).set({ securityVersion: 2 }).where(eq(schema.security.userId, userId));
  expect(await validSession(h.db, auth, headers)).toBeNull();
  await h.db.update(schema.security).set({ securityVersion: 1 }).where(eq(schema.security.userId, userId));
  await h.db.delete(schema.policy).where(eq(schema.policy.sessionId, accepted.sessionId));
  expect(await validSession(h.db, auth, headers)).toBeNull();
  await h.db
    .insert(schema.policy)
    .values({ sessionId: accepted.sessionId, userId, accountKind: 'member', securityVersion: 1 });
  await auth.api.signOut({ headers, returnHeaders: true });
  expect(await validSession(h.db, auth, headers)).toBeNull();
});
test('S3: normal registration, sign-in and sign-out leave auth_verifications empty', async () => {
  expect(await h.db.select().from(schema.verification)).toHaveLength(0);
});
test('S1/S2: only declared Blacklist routes; exact host-cookie stored and sent by a real browser', async () => {
  const server = await createGateServer(h, secret);
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  try {
    expect([...server.policies.keys()].some((key) => key.includes('/api/auth'))).toBe(false);
    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-up/email',
      '/api/auth/reset-password',
      '/api/auth/verify-email',
    ]) {
      const response = await server.app.inject({
        method: 'POST',
        url: path,
        headers: { origin: server.origin },
      });
      expect(response.statusCode).toBe(404);
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${server.origin}/probe`);
    const result = await page.evaluate(
      async ({ email, password }) => {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        return { status: response.status, body: (await response.json()) as unknown };
      },
      { email, password },
    );
    expect(result).toEqual({ status: 200, body: { status: 'signed_in' } });
    const cookies = await context.cookies(server.origin);
    const c = cookies.find((item) => item.name === '__Host-bl_session');
    expect(c?.secure).toBe(true);
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('Lax');
    expect(c?.path).toBe('/');
    expect(c?.domain).toBe('localhost');
    expect(cookies.some((item) => item.name.startsWith('__Secure-__Host-'))).toBe(false);
    const signedIn = await page.evaluate(async () => (await fetch('/api/v1/auth/session')).status);
    expect(signedIn).toBe(200);
    for (const origin of [
      undefined,
      'null',
      'https://evil.example',
      `${server.origin}/`,
      server.origin.replace('localhost', 'sibling.localhost'),
    ]) {
      const response = await server.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' },
        payload: { email, password },
      });
      expect(response.statusCode).toBe(403);
    }
  } finally {
    await browser.close();
    await server.app.close();
  }
});
test('S7: successful Better Auth login replaces an outdated Argon2id PHC hash', async () => {
  const old = await hash(password, { algorithm: 2, memoryCost: 8192, timeCost: 1, parallelism: 1 });
  await h.db.update(schema.account).set({ password: old }).where(eq(schema.account.userId, userId));
  await login(h, auth, secret, email, password);
  const [current] = await h.db.select().from(schema.account).where(eq(schema.account.userId, userId));
  expect(needsRehash(current?.password ?? '')).toBe(false);
});
test('S9: library flows work with HTTP/HTTPS/fetch denied and sockets limited to the test PostgreSQL port', async () => {
  const original = net.Socket.prototype.connect;
  const fetchBlock = vi.fn(async () => {
    throw new Error('egress_denied');
  });
  const httpBlock = vi.spyOn(http, 'request').mockImplementation(() => {
    throw new Error('egress_denied');
  });
  const httpsBlock = vi.spyOn(https, 'request').mockImplementation(() => {
    throw new Error('egress_denied');
  });
  const socketBlock = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (
    this: net.Socket,
    ...args: unknown[]
  ) {
    const first = args[0];
    const object = first && typeof first === 'object' && !Array.isArray(first) ? first : undefined;
    const port =
      typeof first === 'number' ? first : object && 'port' in object ? Number(object.port) : undefined;
    const host = typeof args[1] === 'string' ? args[1] : object && 'host' in object ? object.host : undefined;
    if (port !== h.port || !['127.0.0.1', 'localhost'].includes(String(host)))
      throw new Error('egress_denied');
    return Reflect.apply(original, this, args) as net.Socket;
  });
  vi.stubGlobal('fetch', fetchBlock);
  try {
    const isolated = createAuth(h.db, secret);
    const response = await login(h, isolated, secret, email, password);
    const header =
      response.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-bl_session='))
        ?.split(';')[0] ?? '';
    expect(!!(await validSession(h.db, isolated, new Headers({ cookie: header })))).toBe(true);
    expect(fetchBlock).not.toHaveBeenCalled();
    expect(httpBlock).not.toHaveBeenCalled();
    expect(httpsBlock).not.toHaveBeenCalled();
  } finally {
    socketBlock.mockRestore();
    httpBlock.mockRestore();
    httpsBlock.mockRestore();
    vi.unstubAllGlobals();
  }
});
test('S10: actual auth model SQL is migrator-owned and runtime cannot perform DDL', async () => {
  const ownership = await h.runtime.query(
    "SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'gate' AND tablename LIKE 'auth_%'",
  );
  expect(ownership.rows).toHaveLength(4);
  expect(ownership.rows.every((row: { tableowner: string }) => row.tableowner === 'gate_migrator')).toBe(
    true,
  );
  await expect(
    h.runtime.query('ALTER TABLE gate.auth_accounts ADD COLUMN unsafe integer'),
  ).rejects.toMatchObject({ code: '42501' });
  expect(await h.db.select().from(schema.verification)).toHaveLength(0);
});
test('S12: unknown-email vs wrong-password median timing differs by <=20ms and ratio <=1.5', async () => {
  const samples: number[][] = [[], []];
  for (let round = 0; round < 24; round++) {
    for (const index of round % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now();
      await expect(
        auth.api.signInEmail({
          body: { email: index ? 'absent@example.test' : email, password: 'another long wrong passphrase' },
          returnHeaders: true,
        }),
      ).rejects.toBeDefined();
      if (round >= 4) samples[index]?.push(performance.now() - start);
    }
  }
  const median = (list: number[]) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
  const known = median(samples[0] ?? []),
    unknown = median(samples[1] ?? []);
  expect(Math.abs(known - unknown)).toBeLessThanOrEqual(20);
  expect(Math.max(known, unknown) / Math.min(known, unknown)).toBeLessThanOrEqual(1.5);
});
test('S17: E-1 attack variants fail; legitimate cookies work; rotation plus revoke-all invalidates them', async () => {
  const response = await login(h, auth, secret, email, password);
  const good =
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-bl_session='))
      ?.split(';')[0] ?? '';
  const raw = response.response.token;
  const wrong = createHmac('sha256', randomBytes(48)).update(raw).digest('base64');
  for (const headers of [
    new Headers({ cookie: `__Host-bl_session=${raw}` }),
    new Headers({ cookie: `__Host-bl_session=${encodeURIComponent(`${raw}.${wrong}`)}` }),
    new Headers({ cookie: '__Host-bl_session=forged.invalid' }),
    new Headers({ authorization: `Bearer ${raw}` }),
    new Headers({ 'x-session-token': raw }),
  ])
    expect(await validSession(h.db, auth, headers)).toBeNull();
  expect(!!(await validSession(h.db, auth, new Headers({ cookie: good })))).toBe(true);
  const server = await createGateServer(h, secret);
  try {
    const query = await server.app.inject({ url: `/api/v1/auth/session?token=${encodeURIComponent(raw)}` });
    expect(query.statusCode).toBe(401);
    const body = await server.app.inject({ url: '/api/v1/auth/session', payload: { token: raw } });
    expect(body.statusCode).toBe(401);
  } finally {
    await server.app.close();
  }
  await h.db
    .update(schema.session)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(schema.session.token, raw));
  expect(await validSession(h.db, auth, new Headers({ cookie: good }))).toBeNull();
  const fresh = await login(h, auth, secret, email, password);
  const freshCookie =
    fresh.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-bl_session='))
      ?.split(';')[0] ?? '';
  const rotated = createAuth(h.db, randomBytes(48).toString('base64url'));
  expect(await validSession(h.db, rotated, new Headers({ cookie: freshCookie }))).toBeNull();
  await h.runtime.query('DELETE FROM gate.auth_sessions');
  await h.runtime.query('UPDATE gate.account_security_state SET security_version = security_version + 1');
  expect(await validSession(h.db, auth, new Headers({ cookie: freshCookie }))).toBeNull();
  expect(() => assertHeadlessOptions({ ...authOptions(h.db, secret), plugins: [{ id: 'bearer' }] })).toThrow(
    'forbidden_auth_configuration',
  );
});
