import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAuth, validSession } from './auth.js';
import { startDatabase, type Harness } from './database.js';
import { issueReset } from './delivery.js';
import { createMember, fixturePassword, tokenFromLink } from './fixtures.js';
import { login } from './login.js';
import { digest } from './registration.js';
import { resetPassword } from './reset.js';
import * as schema from './schema.js';

let h: Harness;
const secret = randomBytes(48).toString('base64url');
const newPassword = 'changed gate acceptance password';
beforeAll(async () => {
  h = await startDatabase();
});
afterAll(async () => {
  if (h) await h.stop();
});
async function fixture() {
  const member = await createMember(h, secret);
  let rawToken = '';
  await issueReset(h, member.requestId, async ({ link }) => {
    rawToken = tokenFromLink(link);
    return 'accepted_for_delivery';
  });
  return { ...member, rawToken };
}
async function snapshot(userId: string) {
  const result = await h.runtime.query(
    `SELECT
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM gate.auth_accounts a WHERE user_id = $1) AS accounts,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM gate.auth_sessions s WHERE user_id = $1) AS sessions,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY session_id) FROM gate.session_policy_state p WHERE user_id = $1) AS policies,
    (SELECT to_jsonb(s) FROM gate.account_security_state s WHERE user_id = $1) AS security,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM gate.identity_tokens t WHERE user_id = $1) AS tokens,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY seq) FROM gate.audit_log a WHERE target_id = $1) AS audit,
    (SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM pgboss.job j WHERE data->>'accountId' = $1::text) AS jobs`,
    [userId],
  );
  // Assert opaque digests rather than exposing hashes or session/token data on failure.
  return digest(JSON.stringify(result.rows));
}
test('S16: crash after every reset boundary leaves credential, tokens, sessions, version, cooling, audit and notice unchanged', async () => {
  const member = await fixture();
  const auth = createAuth(h.db, secret);
  const signedIn = await login(h, auth, secret, member.email, fixturePassword);
  const cookie =
    signedIn.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-bl_session='))
      ?.split(';')[0] ?? '';
  const before = await snapshot(member.userId);
  for (let step = 1; step <= 7; step++) {
    await expect(resetPassword(h, member.rawToken, newPassword, step)).rejects.toThrow(
      'injected_reset_crash',
    );
    expect(await snapshot(member.userId)).toBe(before);
  }
  await resetPassword(h, member.rawToken, newPassword);
  expect((await snapshot(member.userId)) === before).toBe(false);
  expect(await validSession(h.db, auth, new Headers({ cookie }))).toBeNull();
  await expect(login(h, auth, secret, member.email, fixturePassword)).rejects.toBeDefined();
  await login(h, auth, secret, member.email, newPassword);
  const [state] = await h.db.select().from(schema.security).where(eq(schema.security.userId, member.userId));
  expect(state?.securityVersion).toBe(2);
  expect((state?.sensitiveActionsLockedUntil?.getTime() ?? 0) - Date.now()).toBeGreaterThan(71 * 3600_000);
  const jobs = await h.runtime.query(
    "SELECT count(*)::int AS count FROM pgboss.job WHERE name = 'identity.security_notice' AND data->>'accountId' = $1",
    [member.userId],
  );
  expect(jobs.rows[0]?.count).toBe(1);
  await expect(resetPassword(h, member.rawToken, newPassword)).rejects.toThrow('reset_link_invalid');
});
test('S16: simultaneous redemption succeeds once; sign-in racing reset never keeps an old-version session', async () => {
  const member = await fixture();
  const results = await Promise.allSettled([
    resetPassword(h, member.rawToken, newPassword),
    resetPassword(h, member.rawToken, newPassword),
  ]);
  expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
  const next = await fixture();
  const auth = createAuth(h.db, secret);
  const race = await Promise.allSettled([
    login(h, auth, secret, next.email, fixturePassword),
    resetPassword(h, next.rawToken, newPassword),
  ]);
  expect(race[1]?.status).toBe('fulfilled');
  if (race[0]?.status === 'fulfilled') {
    const cookie =
      race[0].value.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-bl_session='))
        ?.split(';')[0] ?? '';
    expect(await validSession(h.db, auth, new Headers({ cookie }))).toBeNull();
  }
  await expect(login(h, auth, secret, next.email, fixturePassword)).rejects.toBeDefined();
});
test.each(['email_change', 'recovery', 'suspension'])(
  'S16: reset vs %s serializes on security version with exactly one transition',
  async (transition) => {
    const member = await fixture();
    const competing = async () =>
      h.transaction(async (tx) => {
        const [state] = await tx
          .select()
          .from(schema.security)
          .where(eq(schema.security.userId, member.userId))
          .for('update');
        if (state?.securityVersion !== 1) throw new Error('stale_security_transition');
        if (transition === 'email_change')
          await tx
            .update(schema.user)
            .set({ email: `changed-${member.email}` })
            .where(eq(schema.user.id, member.userId));
        if (transition === 'suspension')
          await tx.update(schema.user).set({ status: 'suspended' }).where(eq(schema.user.id, member.userId));
        await tx
          .update(schema.security)
          .set({ securityVersion: 2 })
          .where(eq(schema.security.userId, member.userId));
        await tx.delete(schema.session).where(eq(schema.session.userId, member.userId));
      });
    const race = await Promise.allSettled([resetPassword(h, member.rawToken, newPassword), competing()]);
    expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [state] = await h.db
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, member.userId));
    expect(state?.securityVersion).toBe(2);
  },
);
test('S16 negatives: expired, wrong-purpose, stale-version and unassured staff reset never replace credentials', async () => {
  for (const invalid of ['expired', 'wrong_purpose', 'stale_version', 'staff']) {
    const member = await fixture();
    if (invalid === 'expired')
      await h.db
        .update(schema.tokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.tokens.userId, member.userId));
    if (invalid === 'wrong_purpose')
      await h.db
        .update(schema.tokens)
        .set({ purpose: 'email_change' })
        .where(eq(schema.tokens.userId, member.userId));
    if (invalid === 'stale_version')
      await h.db
        .update(schema.security)
        .set({ securityVersion: 2 })
        .where(eq(schema.security.userId, member.userId));
    if (invalid === 'staff')
      await h.db.update(schema.user).set({ accountKind: 'staff' }).where(eq(schema.user.id, member.userId));
    const before = await snapshot(member.userId);
    await expect(resetPassword(h, member.rawToken, newPassword)).rejects.toThrow('reset_link_invalid');
    expect(await snapshot(member.userId)).toBe(before);
  }
});
