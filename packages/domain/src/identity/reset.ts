import { schema, eq, and, inArray, ne, executor, type Database } from '@blacklist/db';
import { digest } from '../shared/crypto.ts';
import { DomainError } from '../shared/errors.ts';
import { actorReference, appendAudit } from '../audit/service.ts';
import { preparePassword } from './password-policy.ts';
import { VerifiedAssertion, consumeAssertion, type AssertionInput } from '../staff/webauthn.ts';
import type { IdentityContext } from './types.ts';
import type { UserActor } from '../access/types.ts';
import { admitTokenAction } from './token-throttle.ts';
import { securityEvent } from './telemetry.ts';

async function lockedToken(tx: Database, rawToken: string, purpose: 'password_reset' | 'email_change') {
  const [candidate] = await tx
    .select()
    .from(schema.tokens)
    .where(and(eq(schema.tokens.tokenHash, digest(rawToken)), eq(schema.tokens.purpose, purpose)));
  if (!candidate) throw new DomainError('token_invalid');
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
        eq(schema.tokens.purpose, purpose),
      ),
    )
    .for('update');
  if (
    !token ||
    token.userId !== candidate.userId ||
    token.state !== 'active' ||
    token.expiresAt.getTime() <= Date.now()
  )
    throw new DomainError('token_invalid');
  const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, token.userId));
  if (
    !state ||
    state.securityVersion !== token.securityVersion ||
    user?.status !== 'active' ||
    (purpose === 'password_reset' && state.lastResetGeneration !== token.generation)
  )
    throw new DomainError('token_invalid');
  return { token, state, user };
}
async function invalidateTokens(tx: Database, userId: string, consumedId: string) {
  await tx
    .update(schema.tokens)
    .set({ state: 'consumed', consumedAt: new Date(), terminalAt: new Date() })
    .where(eq(schema.tokens.id, consumedId));
  await tx
    .update(schema.tokens)
    .set({ state: 'invalidated', invalidationReason: 'security_transition', terminalAt: new Date() })
    .where(
      and(eq(schema.tokens.userId, userId), inArray(schema.tokens.state, ['pending_delivery', 'active'])),
    );
}
export async function resetPassword(
  ctx: IdentityContext,
  rawToken: string,
  password: string,
  prefix: string,
  assertion?: AssertionInput,
) {
  await admitTokenAction(ctx, 'password_reset.complete', rawToken, prefix);
  // Cheap token pre-check before Argon2 and the breach lookup (CR-15.2); the locked
  // re-check in the transaction stays authoritative.
  const [candidate] = await ctx.runtime.db
    .select({
      state: schema.tokens.state,
      expiresAt: schema.tokens.expiresAt,
      accountKind: schema.user.accountKind,
    })
    .from(schema.tokens)
    .innerJoin(schema.user, eq(schema.user.id, schema.tokens.userId))
    .where(and(eq(schema.tokens.tokenHash, digest(rawToken)), eq(schema.tokens.purpose, 'password_reset')));
  if (!candidate || candidate.state !== 'active' || candidate.expiresAt.getTime() <= Date.now())
    throw new DomainError('token_invalid');
  // The minimum depends on the account kind (ADR 0016); the locked re-check confirms it.
  const kind = candidate.accountKind === 'staff' ? 'staff' : 'member';
  const stored = await preparePassword(password, kind, ctx.breachCheck);
  let proof: VerifiedAssertion | undefined;
  if (assertion) {
    const [token] = await ctx.runtime.db
      .select()
      .from(schema.tokens)
      .where(and(eq(schema.tokens.tokenHash, digest(rawToken)), eq(schema.tokens.purpose, 'password_reset')));
    if (!token || token.state !== 'active' || token.expiresAt.getTime() <= Date.now())
      throw new DomainError('token_invalid');
    const [state] = await ctx.runtime.db
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, token.userId));
    if (state?.securityVersion !== token.securityVersion || state.lastResetGeneration !== token.generation)
      throw new DomainError('token_invalid');
    proof = await VerifiedAssertion.verify(ctx, assertion, {
      userId: token.userId,
      purpose: 'reset',
      tokenId: token.id,
      securityVersion: token.securityVersion,
    });
  }
  await ctx.runtime.transaction(async (tx, client) => {
    const { token, state, user } = await lockedToken(tx, rawToken, 'password_reset');
    if ((user.accountKind === 'staff' ? 'staff' : 'member') !== kind) throw new DomainError('token_invalid');
    if (user.accountKind === 'staff') {
      if (!proof) throw new DomainError('passkey_required');
      await consumeAssertion(tx, proof, { userId: user.id, purpose: 'reset', tokenId: token.id });
    }
    const updated = await tx
      .update(schema.account)
      .set({ password: stored, updatedAt: new Date() })
      .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, 'credential')))
      .returning();
    if (updated.length !== 1) throw new DomainError('token_invalid');
    await invalidateTokens(tx, user.id, token.id);
    await tx.delete(schema.session).where(eq(schema.session.userId, user.id));
    await tx
      .update(schema.security)
      .set({
        securityVersion: state.securityVersion + 1,
        passwordChangedAt: new Date(),
        sensitiveActionsLockedUntil: new Date(Date.now() + 72 * 3600_000),
      })
      .where(eq(schema.security.userId, user.id));
    await appendAudit(
      tx,
      { kind: 'system', actorRef: 'identity.password_reset', jobKind: 'identity.password_reset' },
      'account.password_reset',
      'account',
      await actorReference(tx, user.id),
    );
    await ctx.runtime.boss.send(
      'identity.security_notice',
      { accountId: user.id, kind: 'password_reset' },
      { db: executor(client) },
    );
    await securityEvent(tx, user.id, 'password_reset');
  });
}
export async function confirmEmailChange(
  ctx: IdentityContext,
  rawToken: string,
  prefix: string,
  currentActor: UserActor | null = null,
) {
  await admitTokenAction(ctx, 'email_change.complete', rawToken, prefix);
  await ctx.runtime.transaction(async (tx, client) => {
    const { token, state, user } = await lockedToken(tx, rawToken, 'email_change');
    if (
      !token.targetEmail ||
      (state.sensitiveActionsLockedUntil && state.sensitiveActionsLockedUntil.getTime() > Date.now())
    )
      throw new DomainError('token_invalid');
    // At confirmation the token supplies the mailbox proof. The unique email
    // constraint is the final guard against a worker/confirmation race.
    await tx
      .update(schema.user)
      .set({ email: token.targetEmail, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id));
    await invalidateTokens(tx, user.id, token.id);
    const current =
      currentActor?.userId === user.id && currentActor.securityVersion === state.securityVersion
        ? currentActor
        : null;
    await tx
      .delete(schema.session)
      .where(
        current
          ? and(eq(schema.session.userId, user.id), ne(schema.session.id, current.sessionId))
          : eq(schema.session.userId, user.id),
      );
    if (current)
      await tx
        .update(schema.policy)
        .set({ securityVersion: state.securityVersion + 1 })
        .where(eq(schema.policy.sessionId, current.sessionId));
    await tx
      .update(schema.security)
      .set({ securityVersion: state.securityVersion + 1 })
      .where(eq(schema.security.userId, user.id));
    await appendAudit(
      tx,
      { kind: 'system', actorRef: 'identity.email_change', jobKind: 'identity.email_change' },
      'account.email_changed',
      'account',
      await actorReference(tx, user.id),
    );
    await tx
      .update(schema.emailRequests)
      .set({ outcome: 'confirmed', processedAt: new Date() })
      .where(eq(schema.emailRequests.id, token.requestId));
    await ctx.runtime.boss.send(
      'identity.email_change.notice',
      { requestId: token.requestId },
      { db: executor(client) },
    );
    await securityEvent(tx, user.id, 'email_changed');
  });
}
