import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  issueIdentityToken,
  resetPassword,
  confirmEmailChange,
  signIn,
  resolveSession,
  completeRegistration,
  startRegistration,
  issueRegistration,
  type UserActor,
} from '@blacklist/domain';
import { digest } from '../../../packages/domain/src/shared/crypto.ts';
import { verifyPassword } from '../../../packages/domain/src/identity/password.ts';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';

let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
const newPassword = 'another isolated passphrase';
async function issued(user: typeof schema.user.$inferSelect, purpose: 'password_reset' | 'email_change') {
  const [r] =
    purpose === 'password_reset'
      ? await f.ctx.runtime.db.insert(schema.resetRequests).values({ email: user.email }).returning()
      : await f.ctx.runtime.db
          .insert(schema.emailRequests)
          .values({
            userId: user.id,
            oldEmail: user.email,
            newEmail: `changed-${randomUUID()}@example.test`,
            securityVersion: 1,
          })
          .returning();
  if (!r) throw new Error('fixture_request_missing');
  let raw = '';
  await issueIdentityToken(f.ctx, purpose, r.id, {
    async send(m) {
      raw = new URLSearchParams(new URL(m.text).hash.slice(1)).get('token') ?? '';
      return { outcome: 'accepted_for_delivery', providerMessageId: 'synthetic-token-message' };
    },
  });
  if (!raw) throw new Error('fixture_token_missing');
  const [token] = await f.ctx.runtime.db
    .select()
    .from(schema.tokens)
    .where(eq(schema.tokens.tokenHash, digest(raw)));
  if (!token) throw new Error('fixture_token_row_missing');
  return { raw, token, request: r };
}
async function signedIn(user: typeof schema.user.$inferSelect) {
  const result = await signIn(f.ctx, user.email, syntheticPassword);
  const headers = new Headers({ cookie: result.cookies.map((c) => c.split(';')[0]).join('; ') });
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, headers, true);
  if (!actor) throw new Error('fixture_session_missing');
  return actor;
}
async function passwordOf(userId: string) {
  const [credential] = await f.ctx.runtime.db
    .select()
    .from(schema.account)
    .where(eq(schema.account.userId, userId));
  if (!credential?.password) throw new Error('fixture_password_missing');
  return credential.password;
}

describe('application token proof, revision and mailbox invariants', () => {
  for (const purpose of ['password_reset', 'email_change'] as const) {
    for (const mutation of ['pending_delivery', 'expired', 'security_version', 'inactive'] as const) {
      it(`${purpose} refuses ${mutation} without modifying the account`, async () => {
        const user = await f.addUser(),
          issuedToken = await issued(user, purpose);
        const before = await passwordOf(user.id);
        if (mutation === 'pending_delivery')
          await f.ctx.runtime.db
            .update(schema.tokens)
            .set({ state: 'pending_delivery' })
            .where(eq(schema.tokens.id, issuedToken.token.id));
        if (mutation === 'expired')
          await f.ctx.runtime.db
            .update(schema.tokens)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(schema.tokens.id, issuedToken.token.id));
        if (mutation === 'security_version')
          await f.ctx.runtime.db
            .update(schema.security)
            .set({ securityVersion: 2 })
            .where(eq(schema.security.userId, user.id));
        if (mutation === 'inactive')
          await f.ctx.runtime.db
            .update(schema.user)
            .set({ status: 'suspended' })
            .where(eq(schema.user.id, user.id));
        const action =
          purpose === 'password_reset'
            ? resetPassword(f.ctx, issuedToken.raw, newPassword, 'ip4:192.0.2.20')
            : confirmEmailChange(f.ctx, issuedToken.raw, 'ip4:192.0.2.21');
        await expect(action).rejects.toThrow('token_invalid');
        expect((await passwordOf(user.id)) === before).toBe(true);
        const [after] = await f.ctx.runtime.db.select().from(schema.user).where(eq(schema.user.id, user.id));
        expect(after?.email).toBe(user.email);
      });
    }
  }
  it('rejects unknown/wrong-purpose tokens and stale reset generation, including supplied assertion preflight', async () => {
    const user = await f.addUser(),
      r = await issued(user, 'password_reset');
    await expect(resetPassword(f.ctx, randomUUID(), newPassword, 'ip4:192.0.2.22')).rejects.toThrow(
      'token_invalid',
    );
    await expect(confirmEmailChange(f.ctx, r.raw, 'ip4:192.0.2.23')).rejects.toThrow('token_invalid');
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ lastResetGeneration: 2 })
      .where(eq(schema.security.userId, user.id));
    await expect(resetPassword(f.ctx, r.raw, newPassword, 'ip4:192.0.2.24')).rejects.toThrow('token_invalid');
    await expect(
      Reflect.apply(resetPassword, undefined, [f.ctx, r.raw, newPassword, 'ip4:192.0.2.25', {}]),
    ).rejects.toThrow('token_invalid');
    await expect(
      Reflect.apply(resetPassword, undefined, [f.ctx, randomUUID(), newPassword, 'ip4:192.0.2.26', {}]),
    ).rejects.toThrow('token_invalid');
  });
  it('staff cannot use mailbox proof alone; absent credentials do not become successful resets', async () => {
    const staff = await f.addUser('staff'),
      token = await issued(staff, 'password_reset');
    await expect(resetPassword(f.ctx, token.raw, newPassword, 'ip4:192.0.2.27')).rejects.toThrow(
      'passkey_required',
    );
    const missing = await f.addUser('member', false),
      r = await issued(missing, 'password_reset');
    await expect(resetPassword(f.ctx, r.raw, newPassword, 'ip4:192.0.2.28')).rejects.toThrow('token_invalid');
    const [unchanged] = await f.ctx.runtime.db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.id, r.token.id));
    expect(unchanged?.state).toBe('active');
  });
  it('member reset atomically revokes sessions, invalidates tokens and begins cooling; replay cannot change the new password', async () => {
    const user = await f.addUser(),
      actor = await signedIn(user),
      reset = await issued(user, 'password_reset'),
      email = await issued(user, 'email_change');
    await resetPassword(f.ctx, reset.raw, newPassword, 'ip4:192.0.2.29');
    expect(await verifyPassword({ hash: await passwordOf(user.id), password: newPassword })).toBe(true);
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, user.id)),
    ).toHaveLength(0);
    const [state] = await f.ctx.runtime.db
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, user.id));
    expect(state?.securityVersion).toBe(actor.securityVersion + 1);
    expect((state?.sensitiveActionsLockedUntil?.getTime() ?? 0) > Date.now()).toBe(true);
    const [resetRow] = await f.ctx.runtime.db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.id, reset.token.id));
    expect(resetRow?.state).toBe('consumed');
    const [emailRow] = await f.ctx.runtime.db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.id, email.token.id));
    expect(emailRow?.state).toBe('invalidated');
    await expect(resetPassword(f.ctx, reset.raw, syntheticPassword, 'ip4:192.0.2.30')).rejects.toThrow(
      'token_invalid',
    );
    expect(await verifyPassword({ hash: await passwordOf(user.id), password: newPassword })).toBe(true);
  });
  for (const current of ['matching', 'different', 'stale', 'absent'] as const) {
    it(`email confirmation retains only a ${current} current session when authorized`, async () => {
      const user = await f.addUser(),
        first = await signedIn(user);
      await signedIn(user);
      const r = await issued(user, 'email_change');
      const actor: UserActor | null =
        current === 'absent'
          ? null
          : current === 'different'
            ? await signedIn(await f.addUser())
            : current === 'stale'
              ? { ...first, securityVersion: 0 }
              : first;
      await confirmEmailChange(f.ctx, r.raw, 'ip4:192.0.2.31', actor);
      const [after] = await f.ctx.runtime.db.select().from(schema.user).where(eq(schema.user.id, user.id));
      expect(after).toBeDefined();
      expect(after?.email).toBe(r.token.targetEmail);
      const sessions = await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, user.id));
      expect(sessions).toHaveLength(current === 'matching' ? 1 : 0);
      if (current === 'matching') {
        expect(sessions[0]?.id).toBe(first.sessionId);
        const [p] = await f.ctx.runtime.db
          .select()
          .from(schema.policy)
          .where(eq(schema.policy.sessionId, first.sessionId));
        expect(p?.securityVersion).toBe(2);
      }
      await expect(confirmEmailChange(f.ctx, r.raw, 'ip4:192.0.2.32')).rejects.toThrow('token_invalid');
    });
  }
  it('email proof cannot bypass cooling or confirm a token without a target mailbox', async () => {
    const user = await f.addUser(),
      r = await issued(user, 'email_change');
    await f.ctx.runtime.db
      .update(schema.tokens)
      .set({ targetEmail: null })
      .where(eq(schema.tokens.id, r.token.id));
    await expect(confirmEmailChange(f.ctx, r.raw, 'ip4:192.0.2.33')).rejects.toThrow('token_invalid');
    await f.ctx.runtime.db
      .update(schema.tokens)
      .set({ targetEmail: 'synthetic-target@example.test' })
      .where(eq(schema.tokens.id, r.token.id));
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: new Date(Date.now() + 3600_000) })
      .where(eq(schema.security.userId, user.id));
    await expect(confirmEmailChange(f.ctx, r.raw, 'ip4:192.0.2.34')).rejects.toThrow('token_invalid');
  });
  it('registration rejects mailbox/handle races with the same safe error and preserves issued proof on rollback', async () => {
    const existing = await f.addUser();
    const [profile] = await f.ctx.runtime.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, existing.id));
    if (!profile) throw new Error('fixture_profile_missing');
    for (const collision of ['email', 'handle'] as const) {
      const raw = randomUUID(),
        [intent] = await f.ctx.runtime.db
          .insert(schema.intents)
          .values({
            email: collision === 'email' ? existing.email : `registration-${randomUUID()}@example.test`,
            state: 'issued',
            tokenHash: digest(raw),
            expiresAt: new Date(Date.now() + 3600_000),
          })
          .returning();
      if (!intent) throw new Error('fixture_intent_missing');
      await expect(
        completeRegistration(
          f.ctx,
          raw,
          collision === 'handle' ? profile.handle : `user_${randomUUID().replaceAll('-', '').slice(0, 10)}`,
          newPassword,
          'ip4:192.0.2.35',
        ),
      ).rejects.toThrow('token_invalid');
      const [after] = await f.ctx.runtime.db
        .select()
        .from(schema.intents)
        .where(eq(schema.intents.id, intent.id));
      expect(after?.state).toBe('issued');
    }
    await expect(
      completeRegistration(f.ctx, randomUUID(), 'unknown_handle', newPassword, 'ip4:192.0.2.36'),
    ).rejects.toThrow('token_invalid');
  });
  it('new registration starts supersede prior intents without checking mailbox existence', async () => {
    const email = `start-${randomUUID()}@example.test`;
    await startRegistration(f.ctx, email, 'ip4:192.0.2.37');
    await startRegistration(f.ctx, email, 'ip4:192.0.2.37');
    const intents = await f.ctx.runtime.db
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.email, email));
    expect(intents.filter((i) => i.state === 'requested')).toHaveLength(1);
    expect(intents.filter((i) => i.state === 'superseded')).toHaveLength(1);
    const latest = intents.find((i) => i.state === 'requested');
    if (!latest) throw new Error('fixture_intent_missing');
    await issueRegistration(f.ctx, latest.id, {
      async send() {
        return { outcome: 'permanent_failure', code: 'rejected' };
      },
    });
    const [after] = await f.ctx.runtime.db
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.id, latest.id));
    expect(after?.state).toBe('requested');
    expect(after?.tokenHash).toBeNull();
  });
});
