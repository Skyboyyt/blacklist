import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import { issueIdentityToken, resetChallenge, resetPassword } from '@blacklist/domain';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { verifyPassword } from '../../../packages/domain/src/identity/password.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
async function resetToken(user: typeof schema.user.$inferSelect) {
  const [request] = await f.ctx.runtime.db
    .insert(schema.resetRequests)
    .values({ email: user.email })
    .returning();
  if (!request) throw new Error('fixture_request_missing');
  let raw = '';
  await issueIdentityToken(f.ctx, 'password_reset', request.id, {
    async send(message) {
      raw = new URLSearchParams(new URL(message.text).hash.slice(1)).get('token') ?? '';
      return { outcome: 'accepted_for_delivery', providerMessageId: 'synthetic-reset-message' };
    },
  });
  if (!raw) throw new Error('fixture_token_missing');
  return raw;
}
describe('staff reset retains mailbox and cryptographic proof requirements', () => {
  it('accepts a valid delivered reset only with the exact signed reset challenge and consumes both proofs', async () => {
    const staff = await addAssuredStaff(f),
      raw = await resetToken(staff.user);
    const challenge = await resetChallenge(f.ctx, raw),
      proof = staff.respond(challenge);
    await resetPassword(f.ctx, raw, 'fresh synthetic reset passphrase', 'ip4:192.0.2.50', proof);
    const [credential] = await f.ctx.runtime.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, staff.user.id));
    if (!credential?.password) throw new Error('fixture_password_missing');
    expect(
      await verifyPassword({ hash: credential.password, password: 'fresh synthetic reset passphrase' }),
    ).toBe(true);
    expect(await verifyPassword({ hash: credential.password, password: syntheticPassword })).toBe(false);
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, staff.user.id)),
    ).toHaveLength(0);
    const [token] = await f.ctx.runtime.db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.userId, staff.user.id));
    expect(token?.state).toBe('consumed');
    const [used] = await f.ctx.runtime.db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challenge.challengeId));
    expect(used?.consumedAt).toBeInstanceOf(Date);
    const [state] = await f.ctx.runtime.db
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, staff.user.id));
    expect(state?.securityVersion).toBe(2);
    await expect(
      resetPassword(f.ctx, raw, 'another synthetic reset passphrase', 'ip4:192.0.2.51', proof),
    ).rejects.toThrow('token_invalid');
  });
  for (const failure of [
    'member',
    'inactive',
    'revision',
    'generation',
    'keys',
    'pending',
    'expired',
  ] as const) {
    it(`refuses ${failure} reset authority before issuing a usable challenge`, async () => {
      const staff = failure === 'member' ? null : await addAssuredStaff(f),
        user = staff?.user ?? (await f.addUser()),
        raw = await resetToken(user);
      if (failure === 'inactive')
        await f.ctx.runtime.db
          .update(schema.user)
          .set({ status: 'suspended' })
          .where(eq(schema.user.id, user.id));
      if (failure === 'revision')
        await f.ctx.runtime.db
          .update(schema.security)
          .set({ securityVersion: 2 })
          .where(eq(schema.security.userId, user.id));
      if (failure === 'generation')
        await f.ctx.runtime.db
          .update(schema.security)
          .set({ lastResetGeneration: 2 })
          .where(eq(schema.security.userId, user.id));
      if (failure === 'keys')
        await f.ctx.runtime.db
          .update(schema.authenticators)
          .set({ revokedAt: new Date() })
          .where(eq(schema.authenticators.userId, user.id));
      if (failure === 'pending')
        await f.ctx.runtime.db
          .update(schema.tokens)
          .set({ state: 'pending_delivery' })
          .where(eq(schema.tokens.userId, user.id));
      if (failure === 'expired')
        await f.ctx.runtime.db
          .update(schema.tokens)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.tokens.userId, user.id));
      await expect(resetChallenge(f.ctx, raw)).rejects.toThrow('token_invalid');
      const challenges = await f.ctx.runtime.db
        .select()
        .from(schema.challenges)
        .where(eq(schema.challenges.userId, user.id));
      expect(challenges.filter((c) => c.purpose === 'reset')).toHaveLength(0);
    });
  }
  it('does not provide reset challenges for unknown mailbox proof', async () => {
    await expect(resetChallenge(f.ctx, randomUUID())).rejects.toThrow('token_invalid');
  });
});
