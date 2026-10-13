import { schema, eq, and, inArray, ne, executor } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { DomainError } from '../shared/errors.ts';
import { preparePassword } from '../identity/password-policy.ts';
import { verifyPassword } from '../identity/password.ts';
import { lockActor } from '../identity/sessions.ts';
import type { IdentityContext } from '../identity/types.ts';
import { appendAudit } from '../audit/service.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
export async function prepareStaffPasswordChange(
  ctx: IdentityContext,
  actor: UserActor,
  currentPassword: string,
  password: string,
) {
  if (actor.accountKind !== 'staff' || !actor.staffAssured) throw new DomainError('forbidden');
  const hash = await preparePassword(password, ctx.breachCheck);
  return ctx.runtime.transaction(async (tx) => {
    const { state } = await lockActor(tx, actor);
    const [credential] = await tx
      .select()
      .from(schema.account)
      .where(and(eq(schema.account.userId, actor.userId), eq(schema.account.providerId, 'credential')));
    if (
      !credential?.password ||
      !(await verifyPassword({ hash: credential.password, password: currentPassword }).catch(() => false))
    )
      throw new DomainError('invalid_credentials');
    const [intent] = await tx
      .insert(schema.credentialIntents)
      .values({
        userId: actor.userId,
        sessionId: actor.sessionId,
        securityVersion: state.securityVersion,
        passwordHash: hash,
        expiresAt: new Date(Date.now() + 300_000),
      })
      .returning({ id: schema.credentialIntents.id });
    if (!intent) throw new Error('credential_intent_creation_failed');
    return {
      intentId: intent.id,
      action: {
        action: 'account.password_changed',
        targetType: 'account',
        targetId: 'me',
        parameters: { intentId: intent.id },
      },
    };
  });
}
export function changeStaffPassword(
  ctx: IdentityContext,
  actor: UserActor,
  intentId: string,
  assertion: AssertionInput,
) {
  return withStepup(
    ctx,
    actor,
    { action: 'account.password_changed', targetType: 'account', targetId: 'me', parameters: { intentId } },
    assertion,
    async (tx, client) => {
      const { state } = await lockActor(tx, actor);
      const [intent] = await tx
        .select()
        .from(schema.credentialIntents)
        .where(eq(schema.credentialIntents.id, intentId))
        .for('update');
      if (
        !intent ||
        intent.userId !== actor.userId ||
        intent.sessionId !== actor.sessionId ||
        intent.securityVersion !== state.securityVersion ||
        intent.consumedAt ||
        intent.expiresAt.getTime() <= Date.now()
      )
        throw new DomainError('forbidden');
      await tx
        .update(schema.account)
        .set({ password: intent.passwordHash, updatedAt: new Date() })
        .where(and(eq(schema.account.userId, actor.userId), eq(schema.account.providerId, 'credential')));
      await tx
        .update(schema.tokens)
        .set({ state: 'invalidated', terminalAt: new Date(), invalidationReason: 'security_transition' })
        .where(
          and(
            eq(schema.tokens.userId, actor.userId),
            inArray(schema.tokens.state, ['pending_delivery', 'active']),
          ),
        );
      await tx
        .delete(schema.session)
        .where(and(eq(schema.session.userId, actor.userId), ne(schema.session.id, actor.sessionId)));
      await tx
        .update(schema.security)
        .set({ securityVersion: state.securityVersion + 1, passwordChangedAt: new Date() })
        .where(eq(schema.security.userId, actor.userId));
      await tx
        .update(schema.policy)
        .set({ securityVersion: state.securityVersion + 1 })
        .where(eq(schema.policy.sessionId, actor.sessionId));
      await tx.delete(schema.credentialIntents).where(eq(schema.credentialIntents.userId, actor.userId));
      await appendAudit(tx, actor, 'account.password_changed', 'account', actor.actorRef);
      await ctx.runtime.boss.send(
        'identity.security_notice',
        { accountId: actor.userId, kind: 'password_changed' },
        { db: executor(client) },
      );
    },
  );
}
export function requestStaffEmailChange(
  ctx: IdentityContext,
  actor: UserActor,
  newEmail: string,
  prefix: string,
  assertion: AssertionInput,
) {
  return withStepup(
    ctx,
    actor,
    { action: 'account.email_change', targetType: 'account', targetId: 'me', parameters: { newEmail } },
    assertion,
    async (tx, client) => {
      const { state, user } = await lockActor(tx, actor);
      if (state.sensitiveActionsLockedUntil && state.sensitiveActionsLockedUntil.getTime() > Date.now())
        throw new DomainError('cooling_period');
      await ctx.throttle.requestLimit(tx, 'email_change', newEmail, prefix);
      const [request] = await tx
        .insert(schema.emailRequests)
        .values({
          userId: actor.userId,
          newEmail,
          oldEmail: user.email,
          securityVersion: state.securityVersion,
          requestedIpPrefix: prefix,
        })
        .returning({ id: schema.emailRequests.id });
      if (!request) throw new Error('email_request_creation_failed');
      await ctx.runtime.boss.send(
        'identity.email_change.issue',
        { requestId: request.id },
        { db: executor(client), singletonKey: request.id },
      );
    },
  );
}
