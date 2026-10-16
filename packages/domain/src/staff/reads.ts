import { schema, eq, and, isNull, desc } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { lockActor } from '../identity/sessions.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
export async function staffSecurity(ctx: IdentityContext, actor: UserActor) {
  if (actor.accountKind !== 'staff' || !actor.staffAssured || !actor.roles.length)
    throw new DomainError('forbidden');
  return ctx.runtime.transaction(async (tx) => {
    const { state } = await lockActor(tx, actor, false, true);
    const keys = await tx
      .select()
      .from(schema.authenticators)
      .where(and(eq(schema.authenticators.userId, actor.userId), isNull(schema.authenticators.revokedAt)));
    return {
      role: actor.roles.includes('admin')
        ? 'admin'
        : actor.roles.includes('moderator')
          ? 'moderator'
          : 'appeal_reviewer',
      authenticators: keys.map((k) => ({
        id: k.id,
        label: k.label,
        kind: k.backupEligible ? 'platform_passkey' : 'security_key',
        synced: k.backupEligible,
        registeredAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      })),
      authenticatorDeficitSince: state.staffAuthenticatorDeficitSince?.toISOString() ?? null,
    };
  });
}
const mask = (email: string) => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
};
export async function listStaff(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'staff:invite');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const users = await tx.select().from(schema.user).where(eq(schema.user.accountKind, 'staff')).limit(100);
    const result = [];
    for (const u of users) {
      const [p] = await tx.select().from(schema.profiles).where(eq(schema.profiles.userId, u.id));
      const roles = await tx
        .select()
        .from(schema.roles)
        .where(and(eq(schema.roles.userId, u.id), isNull(schema.roles.revokedAt)));
      const keys = await tx
        .select()
        .from(schema.authenticators)
        .where(and(eq(schema.authenticators.userId, u.id), isNull(schema.authenticators.revokedAt)));
      const [last] = await tx
        .select()
        .from(schema.policy)
        .where(eq(schema.policy.userId, u.id))
        .orderBy(desc(schema.policy.lastActivityAt))
        .limit(1);
      result.push({
        id: u.id,
        handle: p?.handle ?? 'staff',
        emailMasked: mask(u.email),
        roles: roles.map((r) => r.role),
        status: u.status,
        authenticators: keys.length,
        lastActiveAt: last?.lastActivityAt.toISOString() ?? null,
      });
    }
    return result;
  });
}
export async function listInvitations(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'staff:invite');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const rows = await tx
      .select()
      .from(schema.invitations)
      .orderBy(desc(schema.invitations.createdAt))
      .limit(100);
    async function ref(value: string) {
      const [a] = await tx.select().from(schema.actorMap).where(eq(schema.actorMap.actorRef, value));
      const [p] = a?.userId
        ? await tx.select().from(schema.profiles).where(eq(schema.profiles.userId, a.userId))
        : [];
      return { id: value, handle: p?.handle ?? 'Operator' };
    }
    return Promise.all(
      rows.map(async (i) => ({
        id: i.id,
        emailMasked: mask(i.email),
        role: i.role,
        state: i.state,
        invitedBy: await ref(i.invitedByActor),
        approvedBy: i.approvedByActor ? await ref(i.approvedByActor) : null,
        requiresSecondApproval: i.requiresSecondApproval,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
    );
  });
}
export async function staffAdministration(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'staff:invite');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const users = await tx.select().from(schema.user).limit(1000);
    const profiles = await tx.select().from(schema.profiles).limit(1000);
    const maps = await tx.select().from(schema.actorMap).limit(1000);
    const securityStates = await tx.select().from(schema.security).limit(1000);
    const ref = (id: string) => {
      const userId = maps.find((m) => m.actorRef === id)?.userId ?? id;
      return { id, handle: profiles.find((p) => p.userId === userId)?.handle ?? 'Operator' };
    };
    const invitations = await tx.select().from(schema.invitations);
    const roles = await tx
      .select()
      .from(schema.roleRequests)
      .orderBy(desc(schema.roleRequests.createdAt))
      .limit(100);
    const recoveries = await tx
      .select()
      .from(schema.recoveries)
      .orderBy(desc(schema.recoveries.createdAt))
      .limit(100);
    const verifications = await tx.select().from(schema.recoveryVerifications);
    const objections = await tx.select().from(schema.recoveryObjections);
    return {
      overview: {
        activeStaff: users.filter((u) => u.accountKind === 'staff' && u.status === 'active').length,
        pendingInvitations: invitations.filter((i) => ['pending_approval', 'issued'].includes(i.state))
          .length,
        pendingRoleRequests: roles.filter((r) => r.state === 'pending').length,
        openRecoveryCases: recoveries.filter((r) => !['completed', 'cancelled', 'objected'].includes(r.state))
          .length,
        suspendedMembers: users.filter((u) => u.accountKind === 'member' && u.status === 'suspended').length,
        activeLabels: 0,
        activeSuppressions: 0,
        alerts: [],
      },
      roles: roles.map((r) => ({
        id: r.id,
        target: ref(r.targetUserId),
        role: r.role,
        action: r.action,
        proposedBy: ref(r.proposedBy),
        approvedBy: r.approvedBy ? ref(r.approvedBy) : null,
        state: r.state === 'applied' ? 'approved' : r.state,
        createdAt: r.createdAt.toISOString(),
      })),
      recoveries: recoveries.map((r) => ({
        id: r.id,
        subject: ref(r.subjectUserId),
        openedBy: ref(r.openedBy),
        approvedBy: r.approvedBy ? ref(r.approvedBy) : null,
        state:
          r.state === 'identity_verification'
            ? 'verifying'
            : r.state === 'second_admin_approval'
              ? 'awaiting_approval'
              : r.state,
        objectionWindowEndsAt: r.objectionWindowEndsAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        verifications: verifications
          .filter((v) => v.caseId === r.id)
          .map((v) => ({ verifier: ref(v.verifier), method: v.method, at: v.createdAt.toISOString() })),
        ...objectionView(
          r,
          objections.filter((o) => o.caseId === r.id),
          actor.actorRef,
          ref,
        ),
      })),
      members: users
        .filter((u) => u.accountKind === 'member' && u.status !== 'deactivated')
        .map((u) => ({
          id: u.id,
          handle: profiles.find((p) => p.userId === u.id)?.handle ?? 'Member',
          status: u.status,
          joinedAt: u.createdAt.toISOString(),
          openSubmissions: 0,
          suspensionReason: securityStates.find((s) => s.userId === u.id)?.suspensionReason ?? null,
        })),
    };
  });
}
export async function cancelRoleRequest(ctx: IdentityContext, actor: UserActor, id: string) {
  requirePermission(actor, 'staff:role:request');
  await ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const [request] = await tx
      .select()
      .from(schema.roleRequests)
      .where(eq(schema.roleRequests.id, id))
      .for('update');
    if (!request || request.proposedBy !== actor.actorRef || request.state !== 'pending')
      throw new DomainError('forbidden');
    await tx.update(schema.roleRequests).set({ state: 'cancelled' }).where(eq(schema.roleRequests.id, id));
  });
}
type StaffRef = { id: string; handle: string };
/** Shared by the admin and verifier views of a recovery case (ADR 0013 C). */
export function objectionView(
  r: typeof schema.recoveries.$inferSelect,
  objections: Array<typeof schema.recoveryObjections.$inferSelect>,
  viewerRef: string,
  ref: (id: string) => StaffRef,
) {
  return {
    reopensCaseId: r.reopensCaseId,
    objections: objections.map((o) => ({
      by: ref(o.objector),
      kind: o.objectorKind as 'staff' | 'subject' | 'operator',
      reason: o.reason,
      at: o.createdAt.toISOString(),
      withdrawnAt: o.withdrawnAt?.toISOString() ?? null,
    })),
    viewerObjected: objections.some((o) => o.objector === viewerRef && !o.withdrawnAt),
  };
}
