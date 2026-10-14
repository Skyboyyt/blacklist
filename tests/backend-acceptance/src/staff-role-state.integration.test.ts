import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  requestRole,
  approveRole,
  operatorApproveRole,
  cancelRoleRequest,
  suspendAccount,
} from '@blacklist/domain';
import { startApplicationFixture } from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

const operator = {
  kind: 'cli' as const,
  actorRef: 'cli:synthetic-reviewer',
  operator: 'Synthetic role reviewer',
};
describe('staff privilege transitions on synthetic accounts with real signed assertions', () => {
  it('requires independent approval, invalidates target sessions, refuses replay and permits moderator revocation', async () => {
    const f = await startApplicationFixture();
    try {
      const admin = await addAssuredStaff(f),
        target = await addAssuredStaff(f, 'appeal_reviewer');
      const action = {
        action: 'staff.role',
        targetType: 'account',
        targetId: target.user.id,
        parameters: { role: 'moderator', operation: 'grant' },
      };
      const proof = await admin.proof(action),
        id = await requestRole(f.ctx, admin.actor, target.user.id, 'moderator', 'grant', proof);
      const approval = {
        action: 'staff.role.approve',
        targetType: 'role_request',
        targetId: id,
        parameters: {},
      };
      await expect(approveRole(f.ctx, admin.actor, id, await admin.proof(approval))).rejects.toThrow(
        'forbidden',
      );
      await operatorApproveRole(f.ctx, operator, id);
      const [r] = await f.ctx.runtime.db
        .select()
        .from(schema.roleRequests)
        .where(eq(schema.roleRequests.id, id));
      expect(r?.state).toBe('applied');
      expect(r?.approvedBy).toBe(operator.actorRef);
      expect(r?.approvalBasis).toBe('operator_cli');
      const grantedRoles = await f.ctx.runtime.db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.userId, target.user.id));
      expect(
        grantedRoles
          .filter((role) => role.revokedAt === null)
          .map((role) => role.role)
          .sort(),
      ).toEqual(['appeal_reviewer', 'moderator']);
      expect(
        await f.ctx.runtime.db
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, target.user.id)),
      ).toHaveLength(0);
      await expect(operatorApproveRole(f.ctx, operator, id)).rejects.toThrow('forbidden');
      await expect(
        requestRole(f.ctx, admin.actor, target.user.id, 'moderator', 'grant', await admin.proof(action)),
      ).rejects.toThrow('conflict');
      const revoke = { ...action, parameters: { role: 'moderator', operation: 'revoke' } };
      const revokeId = await requestRole(
        f.ctx,
        admin.actor,
        target.user.id,
        'moderator',
        'revoke',
        await admin.proof(revoke),
      );
      const [revoked] = await f.ctx.runtime.db
        .select()
        .from(schema.roleRequests)
        .where(eq(schema.roleRequests.id, revokeId));
      expect(revoked?.state).toBe('applied');
      const remainingRoles = await f.ctx.runtime.db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.userId, target.user.id));
      expect(remainingRoles.filter((role) => role.revokedAt === null).map((role) => role.role)).toEqual([
        'appeal_reviewer',
      ]);
      const [state] = await f.ctx.runtime.db
        .select()
        .from(schema.security)
        .where(eq(schema.security.userId, target.user.id));
      expect(state?.securityVersion).toBe(3);
      await expect(
        requestRole(f.ctx, admin.actor, target.user.id, 'moderator', 'revoke', await admin.proof(revoke)),
      ).rejects.toThrow('conflict');
      const missingId = randomUUID();
      await expect(
        requestRole(
          f.ctx,
          admin.actor,
          missingId,
          'moderator',
          'grant',
          await admin.proof({ ...action, targetId: missingId }),
        ),
      ).rejects.toThrow('not_found');
    } finally {
      await f.stop();
    }
  });
  it('refuses stale/suspended grants and limits CLI fallback when two administrators exist', async () => {
    const f = await startApplicationFixture();
    try {
      const first = await addAssuredStaff(f),
        target = await f.addUser('staff');
      const [stale] = await f.ctx.runtime.db
        .insert(schema.roleRequests)
        .values({
          targetUserId: target.id,
          role: 'moderator',
          action: 'grant',
          proposedBy: first.actor.actorRef,
          state: 'pending',
          securityVersion: 2,
        })
        .returning();
      if (!stale) throw new Error('fixture_request_missing');
      await expect(operatorApproveRole(f.ctx, operator, stale.id)).rejects.toThrow('conflict');
      const [unchanged] = await f.ctx.runtime.db
        .select()
        .from(schema.roleRequests)
        .where(eq(schema.roleRequests.id, stale.id));
      expect(unchanged?.approvedBy).toBeNull();
      await f.ctx.runtime.db
        .update(schema.roleRequests)
        .set({ securityVersion: 1 })
        .where(eq(schema.roleRequests.id, stale.id));
      await f.ctx.runtime.db
        .update(schema.user)
        .set({ status: 'suspended' })
        .where(eq(schema.user.id, target.id));
      await expect(operatorApproveRole(f.ctx, operator, stale.id)).rejects.toThrow('conflict');
      const second = await addAssuredStaff(f);
      await expect(operatorApproveRole(f.ctx, operator, stale.id)).rejects.toThrow('forbidden');
      await f.ctx.runtime.db
        .update(schema.user)
        .set({ status: 'active' })
        .where(eq(schema.user.id, target.id));
      const action = {
        action: 'staff.role.approve',
        targetType: 'role_request',
        targetId: stale.id,
        parameters: {},
      };
      await approveRole(f.ctx, second.actor, stale.id, await second.proof(action));
      const [approved] = await f.ctx.runtime.db
        .select()
        .from(schema.roleRequests)
        .where(eq(schema.roleRequests.id, stale.id));
      expect(approved?.approvalBasis).toBe('second_admin');
      await expect(operatorApproveRole(f.ctx, operator, randomUUID())).rejects.toThrow('forbidden');
    } finally {
      await f.stop();
    }
  });
  it('self-admin revocation applies immediately and cancellation is proposer-bound', async () => {
    const f = await startApplicationFixture();
    try {
      const admin = await addAssuredStaff(f),
        target = await f.addUser('staff');
      const action = {
        action: 'staff.role',
        targetType: 'account',
        targetId: target.id,
        parameters: { role: 'admin', operation: 'grant' },
      };
      const id = await requestRole(
        f.ctx,
        admin.actor,
        target.id,
        'admin',
        'grant',
        await admin.proof(action),
      );
      await expect(cancelRoleRequest(f.ctx, admin.actor, randomUUID())).rejects.toThrow('forbidden');
      const second = await addAssuredStaff(f);
      await expect(cancelRoleRequest(f.ctx, second.actor, id)).rejects.toThrow('forbidden');
      await cancelRoleRequest(f.ctx, admin.actor, id);
      await expect(cancelRoleRequest(f.ctx, admin.actor, id)).rejects.toThrow('forbidden');
      const [cancelled] = await f.ctx.runtime.db
        .select()
        .from(schema.roleRequests)
        .where(eq(schema.roleRequests.id, id));
      expect(cancelled?.state).toBe('cancelled');
      const self = {
        action: 'staff.role',
        targetType: 'account',
        targetId: admin.user.id,
        parameters: { role: 'admin', operation: 'revoke' },
      };
      const revoked = await requestRole(
        f.ctx,
        admin.actor,
        admin.user.id,
        'admin',
        'revoke',
        await admin.proof(self),
      );
      const [row] = await f.ctx.runtime.db
        .select()
        .from(schema.roleRequests)
        .where(eq(schema.roleRequests.id, revoked));
      expect(row?.state).toBe('applied');
      const selfRoles = await f.ctx.runtime.db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.userId, admin.user.id));
      expect(selfRoles.some((role) => role.role === 'admin' && role.revokedAt === null)).toBe(false);
      expect(
        await f.ctx.runtime.db
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, admin.user.id)),
      ).toHaveLength(0);
    } finally {
      await f.stop();
    }
  });
  it('member suspension/restoration are action-bound; deactivated members and staff restoration are refused', async () => {
    const f = await startApplicationFixture();
    try {
      const admin = await addAssuredStaff(f),
        member = await f.addUser(),
        reason = 'Synthetic access review';
      const action = {
        action: 'user.suspend',
        targetType: 'account',
        targetId: member.id,
        parameters: { reason },
      };
      await suspendAccount(f.ctx, admin.actor, member.id, reason, await admin.proof(action), 'member');
      const [suspended] = await f.ctx.runtime.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, member.id));
      expect(suspended?.status).toBe('suspended');
      const restoration = { ...action, action: 'user.restore' };
      await suspendAccount(
        f.ctx,
        admin.actor,
        member.id,
        reason,
        await admin.proof(restoration),
        'member',
        true,
      );
      const [active] = await f.ctx.runtime.db.select().from(schema.user).where(eq(schema.user.id, member.id));
      expect(active?.status).toBe('active');
      await f.ctx.runtime.db
        .update(schema.user)
        .set({ status: 'deactivated' })
        .where(eq(schema.user.id, member.id));
      await expect(
        suspendAccount(f.ctx, admin.actor, member.id, reason, await admin.proof(action), 'member'),
      ).rejects.toThrow('forbidden');
      const proof = await admin.proof({ ...action, action: 'staff.suspend' });
      expect(() => suspendAccount(f.ctx, admin.actor, member.id, reason, proof, 'staff', true)).toThrow(
        'forbidden',
      );
    } finally {
      await f.stop();
    }
  });
});
