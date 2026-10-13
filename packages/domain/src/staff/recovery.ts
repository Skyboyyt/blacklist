import { schema, eq, and, isNull } from '@blacklist/db';
import type { UserActor, OperatorActor, StaffRole } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit, actorReference } from '../audit/service.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
import { invalidateAccount, notifyAdmins, createRecoveryInvitation } from './lifecycle.ts';
import { lockActor } from '../identity/sessions.ts';

export function openRecovery(
  ctx: IdentityContext,
  actor: UserActor,
  subjectId: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:recovery:open');
  if (subjectId === actor.userId) throw new DomainError('forbidden');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.recovery.open', targetType: 'account', targetId: subjectId, parameters: {} },
    assertion,
    async (tx, client) => {
      const [state] = await tx
        .select()
        .from(schema.security)
        .where(eq(schema.security.userId, subjectId))
        .for('update');
      const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, subjectId));
      if (!state || user?.accountKind !== 'staff' || user.status === 'deactivated')
        throw new DomainError('not_found');
      await invalidateAccount(tx, subjectId, state.securityVersion + 1);
      await tx
        .update(schema.user)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(eq(schema.user.id, subjectId));
      await tx
        .update(schema.security)
        .set({ staffRecoveryPending: true })
        .where(eq(schema.security.userId, subjectId));
      await tx
        .update(schema.authenticators)
        .set({ revokedAt: new Date(), revokeReason: 'recovery' })
        .where(and(eq(schema.authenticators.userId, subjectId), isNull(schema.authenticators.revokedAt)));
      const [r] = await tx
        .insert(schema.recoveries)
        .values({ subjectUserId: subjectId, openedBy: actor.actorRef, state: 'identity_verification' })
        .returning();
      if (!r) throw new Error('recovery_creation_failed');
      await appendAudit(tx, actor, 'staff.recovery.opened', 'recovery', r.id);
      await notifyAdmins(ctx, tx, client, 'staff_recovery_opened', subjectId);
      return r.id;
    },
  );
}
export async function verifyRecoveryIdentity(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  method: string,
  rationale: string,
) {
  requirePermission(actor, 'staff:recovery:verify');
  if (method.length < 3 || method.length > 100 || rationale.length < 10 || rationale.length > 1000)
    throw new DomainError('forbidden');
  await ctx.runtime.transaction(async (tx, client) => {
    await lockActor(tx, actor);
    const [r] = await tx.select().from(schema.recoveries).where(eq(schema.recoveries.id, id)).for('update');
    if (
      !r ||
      r.subjectUserId === actor.userId ||
      !['identity_verification', 'second_admin_approval'].includes(r.state)
    )
      throw new DomainError('forbidden');
    const prior = await tx
      .select()
      .from(schema.recoveryVerifications)
      .where(eq(schema.recoveryVerifications.caseId, id));
    if (prior.length >= 2 || prior.some((v) => v.verifier === actor.actorRef))
      throw new DomainError('forbidden');
    await tx.insert(schema.recoveryVerifications).values({
      caseId: id,
      verifier: actor.actorRef,
      wasAdmin: actor.roles.includes('admin'),
      method,
      rationale,
    });
    if (prior.length === 1)
      await tx
        .update(schema.recoveries)
        .set({ state: 'second_admin_approval' })
        .where(eq(schema.recoveries.id, id));
    await appendAudit(tx, actor, 'staff.recovery.verified', 'recovery', id);
    await notifyAdmins(ctx, tx, client, 'staff_recovery_verified');
  });
}
async function approveTx(
  ctx: IdentityContext,
  tx: Parameters<typeof lockActor>[0],
  client: Parameters<Parameters<typeof ctx.runtime.transaction>[0]>[1],
  actor: UserActor | OperatorActor,
  id: string,
) {
  const [r] = await tx.select().from(schema.recoveries).where(eq(schema.recoveries.id, id)).for('update');
  const verifications = await tx
    .select()
    .from(schema.recoveryVerifications)
    .where(eq(schema.recoveryVerifications.caseId, id));
  const subjectRef = r ? await actorReference(tx, r.subjectUserId) : null;
  if (
    !r ||
    r.state !== 'second_admin_approval' ||
    actor.actorRef === r.openedBy ||
    actor.actorRef === subjectRef ||
    verifications.length !== 2 ||
    !verifications.some((v) => v.wasAdmin) ||
    verifications.some((v) => v.verifier === subjectRef)
  )
    throw new DomainError('forbidden');
  if (actor.kind === 'cli') {
    const admins = await tx
      .select({ id: schema.user.id })
      .from(schema.roles)
      .innerJoin(schema.user, eq(schema.roles.userId, schema.user.id))
      .where(
        and(eq(schema.roles.role, 'admin'), isNull(schema.roles.revokedAt), eq(schema.user.status, 'active')),
      );
    // The documented operator exception applies when the recovery subject was
    // the only admin, rather than being an alternate approval route for a team.
    const subjectRoles = await tx
      .select()
      .from(schema.roles)
      .where(
        and(
          eq(schema.roles.userId, r.subjectUserId),
          eq(schema.roles.role, 'admin'),
          isNull(schema.roles.revokedAt),
        ),
      );
    if (admins.length || !subjectRoles.length) throw new DomainError('forbidden');
  }
  await tx
    .update(schema.recoveries)
    .set({
      approvedBy: actor.actorRef,
      state: 'objection_window',
      objectionWindowEndsAt: new Date(Date.now() + 86400_000),
    })
    .where(eq(schema.recoveries.id, id));
  await appendAudit(tx, actor, 'staff.recovery.approved', 'recovery', id);
  await notifyAdmins(ctx, tx, client, 'staff_recovery_objection_window', r.subjectUserId);
}
export function approveRecovery(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:recovery:approve');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.recovery.approve', targetType: 'recovery', targetId: id, parameters: {} },
    assertion,
    (tx, client) => approveTx(ctx, tx, client, actor, id),
  );
}
export function operatorApproveRecovery(ctx: IdentityContext, actor: OperatorActor, id: string) {
  return ctx.runtime.transaction((tx, client) => approveTx(ctx, tx, client, actor, id));
}
export async function objectRecovery(ctx: IdentityContext, actor: UserActor | OperatorActor, id: string) {
  if (actor.kind === 'user') requirePermission(actor, 'staff:recovery:approve');
  await ctx.runtime.transaction(async (tx, client) => {
    if (actor.kind === 'user') await lockActor(tx, actor);
    const [r] = await tx.select().from(schema.recoveries).where(eq(schema.recoveries.id, id)).for('update');
    if (!r || !['objection_window', 'fresh_enrollment'].includes(r.state)) throw new DomainError('forbidden');
    await tx.update(schema.recoveries).set({ state: 'objected' }).where(eq(schema.recoveries.id, id));
    if (r.invitationId)
      await tx
        .update(schema.invitations)
        .set({ state: 'revoked', tokenHash: null, deliveredAt: null })
        .where(eq(schema.invitations.id, r.invitationId));
    await appendAudit(tx, actor, 'staff.recovery.objected', 'recovery', id);
    await notifyAdmins(ctx, tx, client, 'staff_recovery_objected', r.subjectUserId);
  });
}
export function completeRecovery(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:recovery:complete');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.recovery.complete', targetType: 'recovery', targetId: id, parameters: {} },
    assertion,
    async (tx, client) => {
      const [r] = await tx.select().from(schema.recoveries).where(eq(schema.recoveries.id, id)).for('update');
      if (
        !r ||
        r.state !== 'objection_window' ||
        !r.objectionWindowEndsAt ||
        r.objectionWindowEndsAt.getTime() > Date.now()
      )
        throw new DomainError('forbidden');
      const [subject] = await tx.select().from(schema.user).where(eq(schema.user.id, r.subjectUserId));
      if (!subject || subject.status !== 'suspended') throw new DomainError('forbidden');
      const roles = await tx
        .select()
        .from(schema.roles)
        .where(and(eq(schema.roles.userId, subject.id), isNull(schema.roles.revokedAt)));
      const role = roles.some((r) => r.role === 'admin')
        ? 'admin'
        : roles.some((r) => r.role === 'moderator')
          ? 'moderator'
          : 'appeal_reviewer';
      const result = await createRecoveryInvitation(
        ctx,
        tx,
        client,
        actor,
        subject.email,
        role as StaffRole,
        subject.id,
      );
      await tx
        .update(schema.recoveries)
        .set({ state: 'fresh_enrollment', invitationId: result.invitationId })
        .where(eq(schema.recoveries.id, id));
      await appendAudit(tx, actor, 'staff.recovery.completed', 'recovery', id);
      return result;
    },
  );
}
