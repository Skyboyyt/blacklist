import { randomInt } from 'node:crypto';
import { schema, eq, and, inArray, sql, executor, type Database } from '@blacklist/db';
import type { Actor, OperatorActor, UserActor, StaffRole } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { digest } from '../shared/crypto.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
import { adminCount, notifyAdmins, type Client } from './common.ts';
const enrollmentCode = () =>
  Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
export async function insertInvitation(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: Actor,
  email: string,
  role: StaffRole,
  basis: 'admin' | 'bootstrap' | 'break_glass' | 'recovery',
  targetUserId?: string,
) {
  const code = enrollmentCode();
  const needsApproval = basis === 'admin' && role === 'admin';
  const [existing] = await tx.select().from(schema.user).where(eq(schema.user.email, email));
  if (existing && existing.id !== targetUserId) throw new DomainError('conflict');
  const [invitation] = await tx
    .insert(schema.invitations)
    .values({
      email,
      role,
      basis,
      invitedByActor: actor.actorRef,
      requiresSecondApproval: needsApproval,
      state: needsApproval ? 'pending_approval' : 'issued',
      enrollmentCodeHash: digest(code),
      targetUserId: targetUserId ?? null,
      expiresAt: new Date(Date.now() + (['bootstrap', 'break_glass'].includes(basis) ? 24 : 72) * 3600_000),
    })
    .returning();
  if (!invitation) throw new Error('invitation_creation_failed');
  if (!needsApproval)
    await ctx.runtime.boss.send(
      'identity.staff_invitation.issue',
      { invitationId: invitation.id },
      { db: executor(client), singletonKey: invitation.id },
    );
  await appendAudit(
    tx,
    actor,
    basis === 'bootstrap' ? 'staff.bootstrap.created' : 'staff.invitation.created',
    'invitation',
    invitation.id,
    basis === 'bootstrap' ? { basis } : { role, basis },
  );
  await notifyAdmins(ctx, tx, client, 'staff_invitation_created');
  return { invitationId: invitation.id, enrollmentCode: code };
}
export const createRecoveryInvitation = (
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: Actor,
  email: string,
  role: StaffRole,
  targetUserId: string,
) => insertInvitation(ctx, tx, client, actor, email, role, 'recovery', targetUserId);
export function inviteStaff(
  ctx: IdentityContext,
  actor: UserActor,
  email: string,
  role: StaffRole,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:invite');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.invite', targetType: 'invitation', targetId: 'new', parameters: { email, role } },
    assertion,
    (tx, client) => insertInvitation(ctx, tx, client, actor, email, role, 'admin'),
  );
}
async function approveInvitationTx(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: UserActor | OperatorActor,
  id: string,
) {
  const [i] = await tx.select().from(schema.invitations).where(eq(schema.invitations.id, id)).for('update');
  if (
    !i ||
    i.state !== 'pending_approval' ||
    i.invitedByActor === actor.actorRef ||
    i.expiresAt.getTime() <= Date.now()
  )
    throw new DomainError('forbidden');
  if (actor.kind === 'cli' && (await adminCount(tx)) >= 2) throw new DomainError('forbidden');
  await tx
    .update(schema.invitations)
    .set({ state: 'issued', approvedByActor: actor.actorRef, approvedAt: new Date() })
    .where(eq(schema.invitations.id, id));
  await ctx.runtime.boss.send(
    'identity.staff_invitation.issue',
    { invitationId: id },
    { db: executor(client), singletonKey: id },
  );
  await appendAudit(tx, actor, 'staff.invitation.approved', 'invitation', id);
  await notifyAdmins(ctx, tx, client, 'staff_invitation_approved');
}
export function approveInvitation(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:invite');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.invitation.approve', targetType: 'invitation', targetId: id, parameters: {} },
    assertion,
    (tx, client) => approveInvitationTx(ctx, tx, client, actor, id),
  );
}
export function operatorApproveInvitation(ctx: IdentityContext, actor: OperatorActor, id: string) {
  return ctx.runtime.transaction(async (tx, client) => {
    await tx.execute(sql`select pg_advisory_xact_lock(730026)`);
    return approveInvitationTx(ctx, tx, client, actor, id);
  });
}
export function revokeInvitation(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:invite');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.invitation.revoke', targetType: 'invitation', targetId: id, parameters: {} },
    assertion,
    async (tx, client) => {
      const changed = await tx
        .update(schema.invitations)
        .set({ state: 'revoked', tokenHash: null, deliveredAt: null })
        .where(
          and(
            eq(schema.invitations.id, id),
            inArray(schema.invitations.state, ['issued', 'pending_approval']),
          ),
        )
        .returning();
      if (!changed.length) throw new DomainError('conflict');
      await appendAudit(tx, actor, 'staff.invitation.revoked', 'invitation', id);
      await notifyAdmins(ctx, tx, client, 'staff_invitation_revoked');
    },
  );
}
