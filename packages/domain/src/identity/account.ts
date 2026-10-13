import { schema, eq, and, inArray, ne, executor, sql } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { DomainError } from '../shared/errors.ts';
import { appendAudit } from '../audit/service.ts';
import { lockActor, requireReauth } from './sessions.ts';
import { verifyPassword } from './password.ts';
import { preparePassword } from './password-policy.ts';
import type { IdentityContext } from './types.ts';
import { securityEvent } from './telemetry.ts';

async function verifyCurrent(tx: Parameters<typeof lockActor>[0], userId: string, password: string) {
  const [credential] = await tx
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')));
  if (
    !credential?.password ||
    !(await verifyPassword({ hash: credential.password, password }).catch(() => false))
  )
    throw new DomainError('invalid_credentials');
}
export async function reauthenticate(ctx: IdentityContext, actor: UserActor, password: string) {
  if (actor.accountKind !== 'member') throw new DomainError('passkey_required');
  await ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await verifyCurrent(tx, actor.userId, password);
    await tx
      .update(schema.policy)
      .set({ reauthenticatedAt: new Date() })
      .where(eq(schema.policy.sessionId, actor.sessionId));
    await securityEvent(tx, actor.userId, 'reauthenticated');
  });
}
export async function changePassword(
  ctx: IdentityContext,
  actor: UserActor,
  currentPassword: string,
  password: string,
) {
  // Staff action-bound assertion is handled in the staff execution wrapper.
  if (actor.accountKind === 'staff') throw new DomainError('passkey_required');
  requirePermission(actor, 'session:manage:own');
  const stored = await preparePassword(password, ctx.breachCheck);
  await ctx.runtime.transaction(async (tx, client) => {
    const { state, policy } = await lockActor(tx, actor);
    requireReauth(policy);
    await verifyCurrent(tx, actor.userId, currentPassword);
    await tx
      .update(schema.account)
      .set({ password: stored, updatedAt: new Date() })
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
      .set({ securityVersion: state.securityVersion + 1, reauthenticatedAt: new Date() })
      .where(eq(schema.policy.sessionId, actor.sessionId));
    await appendAudit(tx, actor, 'account.password_changed', 'account', actor.actorRef);
    await securityEvent(tx, actor.userId, 'password_changed');
    await ctx.runtime.boss.send(
      'identity.security_notice',
      { accountId: actor.userId, kind: 'password_changed' },
      { db: executor(client) },
    );
  });
}
export async function requestEmailChange(
  ctx: IdentityContext,
  actor: UserActor,
  newEmail: string,
  prefix: string,
) {
  if (actor.accountKind === 'staff') throw new DomainError('passkey_required');
  await ctx.runtime.transaction(async (tx, client) => {
    const { state, policy, user } = await lockActor(tx, actor);
    requireReauth(policy);
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
    await securityEvent(tx, actor.userId, 'email_change_requested', prefix);
    const id = request.id;
    await ctx.runtime.boss.send(
      'identity.email_change.issue',
      { requestId: id },
      { db: executor(client), singletonKey: id },
    );
  });
}
export async function revokeSessions(ctx: IdentityContext, actor: UserActor, target: 'others' | string) {
  requirePermission(actor, 'session:manage:own');
  await ctx.runtime.transaction(async (tx) => {
    const { policy } = await lockActor(tx, actor);
    if (target === 'others' && actor.accountKind === 'member') requireReauth(policy);
    if (target === actor.sessionId) throw new DomainError('conflict');
    const condition =
      target === 'others' ? ne(schema.session.id, actor.sessionId) : eq(schema.session.id, target);
    const removed = await tx
      .delete(schema.session)
      .where(and(eq(schema.session.userId, actor.userId), condition))
      .returning({ id: schema.session.id });
    if (target !== 'others' && !removed.length) throw new DomainError('not_found');
    await securityEvent(tx, actor.userId, target === 'others' ? 'other_sessions_revoked' : 'session_revoked');
  });
}
export async function accountSecurity(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'session:manage:own');
  return ctx.runtime.transaction(async (tx) => {
    const { state, user, policy } = await lockActor(tx, actor);
    const [profile] = await tx.select().from(schema.profiles).where(eq(schema.profiles.userId, actor.userId));
    if (!profile) throw new DomainError('not_found');
    const sessions = await tx.select().from(schema.policy).where(eq(schema.policy.userId, actor.userId));
    const events = await tx
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.userId, actor.userId))
      .orderBy(sql`${schema.securityEvents.occurredAt} desc`)
      .limit(30);
    const visibleEvents = new Set([
      'password_changed',
      'password_reset',
      'email_change_requested',
      'email_changed',
      'session_revoked',
      'other_sessions_revoked',
    ]);
    return {
      accountKind: user.accountKind,
      handle: profile.handle,
      email: user.email,
      passwordChangedAt: state.passwordChangedAt?.toISOString() ?? null,
      cooling:
        state.sensitiveActionsLockedUntil && state.sensitiveActionsLockedUntil.getTime() > Date.now()
          ? { reason: 'password_reset', until: state.sensitiveActionsLockedUntil.toISOString() }
          : null,
      reauthValidUntil: policy.reauthenticatedAt
        ? new Date(policy.reauthenticatedAt.getTime() + 600_000).toISOString()
        : null,
      sessions: sessions.map((s) => ({
        id: s.sessionId,
        current: s.sessionId === actor.sessionId,
        deviceSummary: s.userAgentSummary ?? 'Browser session',
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.lastActivityAt.toISOString(),
      })),
      recentEvents: events
        .filter((e) => visibleEvents.has(e.eventType))
        .map((e) => ({
          id: e.id,
          kind: e.eventType,
          at: e.occurredAt.toISOString(),
          deviceSummary: e.userAgentSummary,
        })),
    };
  });
}
