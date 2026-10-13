import { schema, eq, and, isNull, sql, type Database } from '@blacklist/db';
import type { Actor, OperatorActor, UserActor, StaffRole } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit, actorReference } from '../audit/service.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
import { adminCount, lockTarget, invalidateAccount, notifyAdmins, type Client } from './common.ts';
async function applyRole(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: Actor,
  request: typeof schema.roleRequests.$inferSelect,
) {
  const { state, user } = await lockTarget(tx, request.targetUserId);
  if (
    state.securityVersion !== request.securityVersion ||
    (request.action === 'grant' && user.status !== 'active')
  )
    throw new DomainError('conflict');
  if (request.action === 'grant')
    await tx
      .insert(schema.roles)
      .values({
        userId: request.targetUserId,
        role: request.role,
        sourceId: request.id,
        grantedVia: 'role_request',
      })
      .onConflictDoNothing();
  else
    await tx
      .update(schema.roles)
      .set({ revokedAt: new Date(), revokeReason: 'role_request' })
      .where(
        and(
          eq(schema.roles.userId, request.targetUserId),
          eq(schema.roles.role, request.role),
          isNull(schema.roles.revokedAt),
        ),
      );
  await invalidateAccount(tx, request.targetUserId, state.securityVersion + 1);
  await tx
    .update(schema.roleRequests)
    .set({ state: 'applied', approvedAt: new Date() })
    .where(eq(schema.roleRequests.id, request.id));
  await appendAudit(
    tx,
    actor,
    request.action === 'grant' ? 'staff.role.granted' : 'staff.role.revoked',
    'account',
    await actorReference(tx, request.targetUserId),
    { role: request.role },
  );
  await notifyAdmins(ctx, tx, client, 'staff_role_changed', request.targetUserId);
}
export function requestRole(
  ctx: IdentityContext,
  actor: UserActor,
  targetId: string,
  role: StaffRole,
  operation: 'grant' | 'revoke',
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:role:request');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.role', targetType: 'account', targetId, parameters: { role, operation } },
    assertion,
    async (tx, client) => {
      const target = await lockTarget(tx, targetId);
      const present = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(
          and(eq(schema.roles.userId, targetId), eq(schema.roles.role, role), isNull(schema.roles.revokedAt)),
        );
      if ((operation === 'grant' && present.length) || (operation === 'revoke' && !present.length))
        throw new DomainError('conflict');
      const [r] = await tx
        .insert(schema.roleRequests)
        .values({
          targetUserId: targetId,
          role,
          action: operation,
          proposedBy: actor.actorRef,
          state: 'pending',
          securityVersion: target.state.securityVersion,
        })
        .returning();
      if (!r) throw new Error('role_request_creation_failed');
      await appendAudit(tx, actor, 'staff.role.requested', 'role_request', r.id, { role, operation });
      if (operation === 'revoke' && (role !== 'admin' || targetId === actor.userId))
        await applyRole(ctx, tx, client, actor, r);
      else await notifyAdmins(ctx, tx, client, 'staff_role_requested');
      return r.id;
    },
  );
}
async function approveRoleTx(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: UserActor | OperatorActor,
  id: string,
) {
  const [r] = await tx.select().from(schema.roleRequests).where(eq(schema.roleRequests.id, id)).for('update');
  if (!r || r.state !== 'pending' || r.proposedBy === actor.actorRef) throw new DomainError('forbidden');
  if (actor.kind === 'cli' && (await adminCount(tx)) >= 2) throw new DomainError('forbidden');
  await tx
    .update(schema.roleRequests)
    .set({
      approvedBy: actor.actorRef,
      approvalBasis: actor.kind === 'cli' ? 'operator_cli' : 'second_admin',
    })
    .where(eq(schema.roleRequests.id, id));
  await appendAudit(tx, actor, 'staff.role.approved', 'role_request', id);
  await applyRole(ctx, tx, client, actor, r);
}
export function approveRole(ctx: IdentityContext, actor: UserActor, id: string, assertion: AssertionInput) {
  requirePermission(actor, 'staff:role:approve');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.role.approve', targetType: 'role_request', targetId: id, parameters: {} },
    assertion,
    (tx, client) => approveRoleTx(ctx, tx, client, actor, id),
  );
}
export function operatorApproveRole(ctx: IdentityContext, actor: OperatorActor, id: string) {
  return ctx.runtime.transaction(async (tx, client) => {
    await tx.execute(sql`select pg_advisory_xact_lock(730026)`);
    return approveRoleTx(ctx, tx, client, actor, id);
  });
}
