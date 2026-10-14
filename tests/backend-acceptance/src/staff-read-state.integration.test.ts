import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  recoveryVerificationCases,
  ownRecoveryStatus,
  staffAdministration,
  staffSecurity,
  listInvitations,
  listStaff,
} from '@blacklist/domain';
import { startApplicationFixture } from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

describe('staff read permissions and recovery privacy', () => {
  it('maps retained recovery states and independent verifications without private narratives', async () => {
    const f = await startApplicationFixture();
    try {
      const admin = await addAssuredStaff(f),
        moderator = await addAssuredStaff(f, 'moderator');
      expect(await ownRecoveryStatus(f.ctx, admin.actor)).toBeNull();
      for (const state of [
        'identity_verification',
        'second_admin_approval',
        'objection_window',
        'completed',
      ] as const) {
        const target = await f.addUser('staff');
        const [r] = await f.ctx.runtime.db
          .insert(schema.recoveries)
          .values({
            subjectUserId: target.id,
            openedBy: admin.actor.actorRef,
            approvedBy: state === 'identity_verification' ? null : moderator.actor.actorRef,
            state,
            objectionWindowEndsAt: state === 'objection_window' ? new Date(Date.now() + 3600_000) : null,
          })
          .returning();
        if (!r) throw new Error('fixture_recovery_missing');
        await f.ctx.runtime.db.insert(schema.recoveryVerifications).values({
          caseId: r.id,
          verifier: moderator.actor.actorRef,
          wasAdmin: false,
          method: 'live_video',
          rationale: 'Private synthetic narrative',
        });
      }
      const [self] = await f.ctx.runtime.db
        .insert(schema.recoveries)
        .values({ subjectUserId: admin.user.id, openedBy: moderator.actor.actorRef, state: 'completed' })
        .returning();
      if (!self) throw new Error('fixture_recovery_missing');
      const cases = await recoveryVerificationCases(f.ctx, admin.actor);
      expect(cases).toHaveLength(4);
      expect(cases.some((c) => c.id === self.id)).toBe(false);
      expect(cases.map((c) => c.state).sort()).toEqual([
        'awaiting_approval',
        'completed',
        'objection_window',
        'verifying',
      ]);
      expect(JSON.stringify(cases).includes('Private synthetic narrative')).toBe(false);
      for (const c of cases) {
        expect(c.verifications).toHaveLength(1);
        expect(c.verifications[0]).not.toHaveProperty('rationale');
      }
      const own = await ownRecoveryStatus(f.ctx, admin.actor);
      expect(own?.stage).toBe('completed');
      expect(own?.identityVerificationsCompleted).toBe(0);
      const appeal = await addAssuredStaff(f, 'appeal_reviewer');
      await expect(recoveryVerificationCases(f.ctx, appeal.actor)).rejects.toThrow('forbidden');
      await expect(staffSecurity(f.ctx, { ...admin.actor, staffAssured: false })).rejects.toThrow(
        'forbidden',
      );
      await expect(staffSecurity(f.ctx, { ...admin.actor, roles: [] })).rejects.toThrow('forbidden');
      expect((await staffSecurity(f.ctx, appeal.actor)).role).toBe('appeal_reviewer');
      const administration = await staffAdministration(f.ctx, admin.actor);
      expect(administration.recoveries).toHaveLength(5);
      expect(JSON.stringify(administration).includes('Private synthetic narrative')).toBe(false);
    } finally {
      await f.stop();
    }
  });
  it('staff listings mask mailboxes and represent retained operator invitations without exposing proof', async () => {
    const f = await startApplicationFixture();
    try {
      const admin = await addAssuredStaff(f),
        target = await f.addUser('staff');
      await f.ctx.runtime.db.delete(schema.profiles).where(eq(schema.profiles.userId, target.id));
      await f.ctx.runtime.db.insert(schema.invitations).values({
        email: 'invited-synthetic@example.test',
        role: 'moderator',
        basis: 'admin',
        invitedByActor: 'cli:synthetic',
        approvedByActor: admin.actor.actorRef,
        requiresSecondApproval: false,
        state: 'issued',
        enrollmentCodeHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const invitations = await listInvitations(f.ctx, admin.actor);
      expect(invitations).toHaveLength(1);
      expect(invitations[0]?.invitedBy.handle).toBe('Operator');
      expect(invitations[0]?.approvedBy?.handle.startsWith('fixture_')).toBe(true);
      expect(invitations[0]).not.toHaveProperty('tokenHash');
      expect(invitations[0]).not.toHaveProperty('enrollmentCodeHash');
      expect(invitations[0]).not.toHaveProperty('enrollmentCode');
      const staff = await listStaff(f.ctx, admin.actor),
        retained = staff.find((s) => s.id === target.id);
      expect(retained?.handle).toBe('staff');
      expect(retained?.emailMasked.includes(target.email)).toBe(false);
      expect((await staffAdministration(f.ctx, admin.actor)).overview.activeStaff).toBe(2);
    } finally {
      await f.stop();
    }
  });
});
