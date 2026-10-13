import { schema, eq, and, isNull, inArray, sql } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit, actorReference } from '../audit/service.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
import { lockTarget, invalidateAccount, notifyAdmins } from './common.ts';
export function suspendAccount(
  ctx: IdentityContext,
  actor: UserActor,
  targetId: string,
  reason: string,
  assertion: AssertionInput,
  kind: 'staff' | 'member' = 'staff',
  restore = false,
) {
  requirePermission(actor, kind === 'staff' ? 'staff:suspend' : 'user:suspend');
  if (kind === 'staff' && restore) throw new DomainError('forbidden'); // staff restoration uses recovery
  const action = kind === 'staff' ? 'staff.suspend' : restore ? 'user.restore' : 'user.suspend';
  return withStepup(
    ctx,
    actor,
    { action, targetType: 'account', targetId, parameters: { reason } },
    assertion,
    async (tx, client) => {
      const { state, user } = await lockTarget(tx, targetId, kind);
      if (user.status === 'deactivated') throw new DomainError('forbidden');
      await invalidateAccount(tx, targetId, state.securityVersion + 1);
      await tx
        .update(schema.user)
        .set({ status: restore ? 'active' : 'suspended', updatedAt: new Date() })
        .where(eq(schema.user.id, targetId));
      await tx
        .update(schema.security)
        .set({ suspensionReason: restore ? null : reason })
        .where(eq(schema.security.userId, targetId));
      await appendAudit(
        tx,
        actor,
        kind === 'staff' ? 'staff.suspended' : restore ? 'user.restored' : 'user.suspended',
        'account',
        await actorReference(tx, targetId),
      );
      await notifyAdmins(ctx, tx, client, action, targetId);
    },
  );
}
export function offboardStaff(
  ctx: IdentityContext,
  actor: UserActor,
  targetId: string,
  reason: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:offboard');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.offboard', targetType: 'account', targetId, parameters: { reason } },
    assertion,
    async (tx, client) => {
      const { state } = await lockTarget(tx, targetId);
      await invalidateAccount(tx, targetId, state.securityVersion + 1);
      await tx
        .update(schema.roles)
        .set({ revokedAt: new Date(), revokeReason: 'offboarded' })
        .where(and(eq(schema.roles.userId, targetId), isNull(schema.roles.revokedAt)));
      await tx
        .update(schema.authenticators)
        .set({ revokedAt: new Date(), revokeReason: 'offboarded' })
        .where(and(eq(schema.authenticators.userId, targetId), isNull(schema.authenticators.revokedAt)));
      const ref = await actorReference(tx, targetId);
      await tx
        .update(schema.invitations)
        .set({ state: 'revoked', tokenHash: null })
        .where(
          and(
            eq(schema.invitations.invitedByActor, ref),
            inArray(schema.invitations.state, ['issued', 'pending_approval']),
          ),
        );
      await tx
        .update(schema.invitations)
        .set({ state: 'revoked', tokenHash: null })
        .where(eq(schema.invitations.targetUserId, targetId));
      await tx
        .update(schema.recoveries)
        .set({ state: 'cancelled' })
        .where(
          and(eq(schema.recoveries.subjectUserId, targetId), sql`${schema.recoveries.state} <> 'completed'`),
        );
      await tx
        .update(schema.user)
        .set({ status: 'deactivated', updatedAt: new Date() })
        .where(eq(schema.user.id, targetId));
      await tx
        .update(schema.security)
        .set({ deactivatedAt: new Date(), staffRecoveryPending: false })
        .where(eq(schema.security.userId, targetId));
      // Moderation cases do not exist in Phase 7; Phase 9 must add reassignment in
      // this same transaction before exposing offboarding over case-owning accounts.
      await appendAudit(tx, actor, 'staff.offboarded', 'account', ref);
      await notifyAdmins(ctx, tx, client, 'staff_offboarded', targetId);
    },
  );
}
