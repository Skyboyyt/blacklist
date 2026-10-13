import { schema, eq, and, isNull, sql, type DatabaseRuntime, type Database } from '@blacklist/db';
import type { StaffRole, UserActor } from '../access/types.ts';
import { actorReference } from '../audit/service.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityAuth } from './auth.ts';

export async function lockActor(tx: Database, actor: UserActor, allowPending = false, allowDeficit = false) {
  const [state] = await tx
    .select()
    .from(schema.security)
    .where(eq(schema.security.userId, actor.userId))
    .for('update');
  const [u] = await tx.select().from(schema.user).where(eq(schema.user.id, actor.userId));
  const [p] = await tx
    .select()
    .from(schema.policy)
    .where(and(eq(schema.policy.sessionId, actor.sessionId), eq(schema.policy.userId, actor.userId)));
  const [s] = await tx.select().from(schema.session).where(eq(schema.session.id, actor.sessionId));
  const [identity] = await tx
    .select()
    .from(schema.actorMap)
    .where(eq(schema.actorMap.actorRef, actor.actorRef));
  if (
    !state ||
    !p ||
    !s ||
    u?.status !== 'active' ||
    u.accountKind !== actor.accountKind ||
    identity?.userId !== actor.userId ||
    s.expiresAt.getTime() <= Date.now() ||
    state.securityVersion !== p.securityVersion ||
    state.securityVersion !== actor.securityVersion
  )
    throw new DomainError('session_expired');
  const staff = u.accountKind === 'staff';
  if (
    Date.now() - p.createdAt.getTime() > (staff ? 12 * 3600_000 : 30 * 86400_000) ||
    Date.now() - p.lastActivityAt.getTime() > (staff ? 1800_000 : 7 * 86400_000)
  )
    throw new DomainError('session_expired');
  if (staff) {
    const [a] = await tx.select().from(schema.assurance).where(eq(schema.assurance.sessionId, s.id));
    if (!a && !allowPending) throw new DomainError('forbidden');
    if (!a && Date.now() - p.createdAt.getTime() > 300_000) throw new DomainError('session_expired');
    if (
      state.staffRecoveryPending ||
      (!allowDeficit &&
        state.staffAuthenticatorDeficitSince &&
        Date.now() - state.staffAuthenticatorDeficitSince.getTime() > 7 * 86400_000)
    )
      throw new DomainError('forbidden');
    if (a) {
      const [key] = await tx
        .select()
        .from(schema.authenticators)
        .where(eq(schema.authenticators.id, a.authenticatorId));
      if (!key || key.revokedAt || key.flaggedAt) throw new DomainError('forbidden');
    }
    const assigned = await tx
      .select()
      .from(schema.roles)
      .where(and(eq(schema.roles.userId, u.id), isNull(schema.roles.revokedAt)));
    const current = assigned
      .map((r) => r.role)
      .sort()
      .join(',');
    if (current !== [...actor.roles].sort().join(',')) throw new DomainError('session_expired');
  }
  return { state, user: u, policy: p };
}
export function requireReauth(p: typeof schema.policy.$inferSelect) {
  if (!p.reauthenticatedAt || Date.now() - p.reauthenticatedAt.getTime() > 600_000)
    throw new DomainError('reauth_required');
}
export async function resolveSession(
  runtime: DatabaseRuntime,
  auth: IdentityAuth,
  headers: Headers,
  allowPending = false,
): Promise<UserActor | null> {
  const result = await auth.api.getSession({ headers, returnHeaders: true });
  if (!result.response) return null;
  const s = result.response.session;
  return runtime.transaction(async (tx) => {
    const [u] = await tx.select().from(schema.user).where(eq(schema.user.id, s.userId));
    const [state] = await tx.select().from(schema.security).where(eq(schema.security.userId, s.userId));
    if (!u || !state || (u.accountKind !== 'staff' && u.accountKind !== 'member')) return null;
    const assignments = await tx
      .select()
      .from(schema.roles)
      .where(and(eq(schema.roles.userId, u.id), isNull(schema.roles.revokedAt)));
    const [a] = await tx.select().from(schema.assurance).where(eq(schema.assurance.sessionId, s.id));
    const actor: UserActor = {
      kind: 'user',
      userId: u.id,
      sessionId: s.id,
      actorRef: await actorReference(tx, u.id),
      accountKind: u.accountKind,
      securityVersion: state.securityVersion,
      roles: assignments
        .map((r) => r.role)
        .filter((r): r is StaffRole => ['admin', 'moderator', 'appeal_reviewer'].includes(r)),
      staffAssured: !!a,
      staffPermissionsActive:
        !state.staffRecoveryPending &&
        (!state.staffAuthenticatorDeficitSince ||
          Date.now() - state.staffAuthenticatorDeficitSince.getTime() <= 7 * 86400_000),
    };
    try {
      await lockActor(tx, actor, allowPending, true);
    } catch (error) {
      if (error instanceof DomainError) return null;
      throw error;
    }
    await tx
      .update(schema.policy)
      .set({ lastActivityAt: new Date() })
      .where(
        and(
          eq(schema.policy.sessionId, s.id),
          sql`${schema.policy.lastActivityAt} <= now() - interval '60 seconds'`,
        ),
      );
    return actor;
  });
}
