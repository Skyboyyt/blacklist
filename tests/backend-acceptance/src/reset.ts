import { and, eq, inArray, sql } from 'drizzle-orm';
import { executor, type Harness } from './database.js';
import { hashPassword } from './password.js';
import { digest } from './registration.js';
import * as schema from './schema.js';
import { VerifiedStaffReset } from './webauthn.js';

export async function resetPassword(
  h: Harness,
  rawToken: string,
  password: string,
  failAt?: number,
  proof?: VerifiedStaffReset,
) {
  const stored = await hashPassword(password);
  return h.transaction(async (tx, client) => {
    const [candidate] = await tx
      .select()
      .from(schema.tokens)
      .where(and(eq(schema.tokens.tokenHash, digest(rawToken)), eq(schema.tokens.purpose, 'password_reset')));
    if (!candidate) throw new Error('reset_link_invalid');
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, candidate.userId))
      .for('update');
    const [token] = await tx
      .select()
      .from(schema.tokens)
      .where(
        and(
          eq(schema.tokens.id, candidate.id),
          eq(schema.tokens.tokenHash, digest(rawToken)),
          eq(schema.tokens.purpose, 'password_reset'),
        ),
      )
      .for('update');
    if (
      !token ||
      token.userId !== candidate.userId ||
      token.state !== 'active' ||
      token.expiresAt.getTime() <= Date.now()
    )
      throw new Error('reset_link_invalid');
    const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, token.userId));
    if (
      !state ||
      state.securityVersion !== token.securityVersion ||
      state.lastResetGeneration !== token.generation ||
      user?.status !== 'active'
    )
      throw new Error('reset_link_invalid');
    if (user.accountKind === 'staff') {
      if (
        !(proof instanceof VerifiedStaffReset) ||
        proof.tokenId !== token.id ||
        proof.userId !== token.userId
      )
        throw new Error('reset_link_invalid');
      const [challenge] = await tx
        .select()
        .from(schema.challenges)
        .where(eq(schema.challenges.id, proof.challengeId))
        .for('update');
      const [authenticator] = await tx
        .select()
        .from(schema.authenticators)
        .where(eq(schema.authenticators.id, proof.authenticatorId))
        .for('update');
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= Date.now() ||
        challenge.tokenId !== token.id ||
        challenge.purpose !== 'reset' ||
        authenticator?.userId !== token.userId ||
        authenticator.signCount !== proof.priorCounter
      )
        throw new Error('reset_link_invalid');
      await tx
        .update(schema.challenges)
        .set({ consumedAt: new Date() })
        .where(eq(schema.challenges.id, challenge.id));
      await tx
        .update(schema.authenticators)
        .set({ signCount: proof.nextCounter })
        .where(eq(schema.authenticators.id, authenticator.id));
    }
    const checkpoint = (step: number) => {
      if (failAt === step) throw new Error('injected_reset_crash');
    };
    checkpoint(1);
    const updated = await tx
      .update(schema.account)
      .set({ password: stored, updatedAt: new Date() })
      .where(and(eq(schema.account.userId, token.userId), eq(schema.account.providerId, 'credential')))
      .returning({ id: schema.account.id });
    if (updated.length !== 1) throw new Error('reset_link_invalid');
    checkpoint(2);
    await tx.update(schema.tokens).set({ state: 'consumed' }).where(eq(schema.tokens.id, token.id));
    await tx
      .update(schema.tokens)
      .set({ state: 'invalidated' })
      .where(
        and(
          eq(schema.tokens.userId, token.userId),
          inArray(schema.tokens.state, ['pending_delivery', 'active']),
        ),
      );
    checkpoint(3);
    await tx.delete(schema.session).where(eq(schema.session.userId, token.userId));
    checkpoint(4);
    await tx
      .update(schema.security)
      .set({
        securityVersion: state.securityVersion + 1,
        sensitiveActionsLockedUntil: new Date(Date.now() + 72 * 3600_000),
        passwordChangedAt: new Date(),
      })
      .where(eq(schema.security.userId, token.userId));
    checkpoint(5);
    await tx.execute(
      sql`select gate.append_audit('account.password_reset', ${token.userId}::uuid, '{}'::jsonb)`,
    );
    checkpoint(6);
    await h.boss.send(
      'identity.security_notice',
      { accountId: token.userId, kind: 'password_reset' },
      { db: executor(client) },
    );
    checkpoint(7);
    return token.userId;
  });
}
