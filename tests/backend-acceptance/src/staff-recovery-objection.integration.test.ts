import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { schema, eq, sql } from '@blacklist/db';
import {
  openRecovery,
  verifyRecoveryIdentity,
  approveRecovery,
  operatorApproveRecovery,
  objectRecovery,
  withdrawRecoveryObjection,
  reopenRecovery,
  issueRecoveryObjectionLink,
  redeemRecoveryObjectionLink,
  completeRegistration,
  resetPassword,
  type SecurityMailer,
} from '@blacklist/domain';
import { startApplicationFixture, type ApplicationFixture } from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const reason = 'I spoke with the subject; they did not ask for this recovery.';
const prefix = 'ip4:192.0.2.71';
const recoveryAction = (action: string, id: string, parameters: Record<string, unknown> = {}) => ({
  action,
  targetType: 'recovery',
  targetId: id,
  parameters,
});

async function caseRow(f: ApplicationFixture, id: string) {
  const [r] = await f.ctx.runtime.db.select().from(schema.recoveries).where(eq(schema.recoveries.id, id));
  if (!r) throw new Error('fixture_case_missing');
  return r;
}
/** Opens, verifies (one admin, one moderator) and approves a case: it enters its objection window. */
async function windowOpen(
  f: ApplicationFixture,
  subject: Staff,
  opener: Staff,
  verifiers: [Staff, Staff],
  approver: Staff,
  id?: string,
) {
  const caseId =
    id ??
    (await openRecovery(
      f.ctx,
      opener.actor,
      subject.user.id,
      await opener.proof({
        action: 'staff.recovery.open',
        targetType: 'account',
        targetId: subject.user.id,
        parameters: {},
      }),
    ));
  for (const v of verifiers)
    await verifyRecoveryIdentity(f.ctx, v.actor, caseId, 'Video call', 'Matched the known face and voice.');
  await approveRecovery(
    f.ctx,
    approver.actor,
    caseId,
    await approver.proof(recoveryAction('staff.recovery.approve', caseId)),
  );
  expect((await caseRow(f, caseId)).state).toBe('objection_window');
  return caseId;
}
async function noticeKinds(f: ApplicationFixture) {
  const rows = await f.ctx.runtime.db.execute<{ kind: string }>(
    sql`select data->>'kind' as kind from pgboss.job where name = 'identity.security_notice'`,
  );
  return rows.rows.map((r) => r.kind);
}

describe('ADR 0013 C: recovery objections, withdrawal and reopening', () => {
  it('requires step-up for staff objections, excludes objectors from the reopened case and alerts on repeats', async () => {
    const f = await startApplicationFixture();
    try {
      const opener = await addAssuredStaff(f),
        objector = await addAssuredStaff(f),
        approver = await addAssuredStaff(f),
        spare = await addAssuredStaff(f),
        moderator = await addAssuredStaff(f, 'moderator'),
        subject = await addAssuredStaff(f, 'moderator');
      const id = await windowOpen(f, subject, opener, [objector, moderator], approver);

      // A staff objection without a matching step-up is refused (C1).
      await expect(
        objectRecovery(
          f.ctx,
          objector.actor,
          id,
          reason,
          await objector.proof(recoveryAction('staff.recovery.approve', id)),
        ),
      ).rejects.toThrow();
      await expect(
        objectRecovery(
          f.ctx,
          objector.actor,
          id,
          reason,
          await objector.proof(
            recoveryAction('staff.recovery.object', id, { reason: 'a different reason text' }),
          ),
        ),
      ).rejects.toThrow();
      await expect(
        objectRecovery(
          f.ctx,
          objector.actor,
          id,
          'too short',
          await objector.proof(recoveryAction('staff.recovery.object', id, { reason: 'too short' })),
        ),
      ).rejects.toThrow('invalid_request');
      expect((await caseRow(f, id)).state).toBe('objection_window');

      await objectRecovery(
        f.ctx,
        objector.actor,
        id,
        reason,
        await objector.proof(recoveryAction('staff.recovery.object', id, { reason })),
      );
      expect((await caseRow(f, id)).state).toBe('objected');

      // Only the objector withdraws, with step-up; the window restarts for 24 hours (C5).
      await expect(
        withdrawRecoveryObjection(
          f.ctx,
          spare.actor,
          id,
          await spare.proof(recoveryAction('staff.recovery.withdraw', id)),
        ),
      ).rejects.toThrow('forbidden');
      await withdrawRecoveryObjection(
        f.ctx,
        objector.actor,
        id,
        await objector.proof(recoveryAction('staff.recovery.withdraw', id)),
      );
      const restarted = await caseRow(f, id);
      expect(restarted.state).toBe('objection_window');
      expect(restarted.objectionWindowEndsAt?.getTime()).toBeGreaterThan(Date.now() + 86_000_000);

      // A second objection by the same person within 30 days alerts every admin (C6).
      expect(await noticeKinds(f)).not.toContain('staff_recovery_objection_pattern');
      await objectRecovery(
        f.ctx,
        objector.actor,
        id,
        reason,
        await objector.proof(recoveryAction('staff.recovery.object', id, { reason })),
      );
      expect(await noticeKinds(f)).toContain('staff_recovery_objection_pattern');

      // Resolution is a new case: never opened by the objector or the subject (C4).
      await expect(
        reopenRecovery(
          f.ctx,
          objector.actor,
          id,
          await objector.proof(recoveryAction('staff.recovery.reopen', id)),
        ),
      ).rejects.toThrow('forbidden');
      const reopened = await reopenRecovery(
        f.ctx,
        spare.actor,
        id,
        await spare.proof(recoveryAction('staff.recovery.reopen', id)),
      );
      const fresh = await caseRow(f, reopened);
      expect(fresh).toMatchObject({ state: 'identity_verification', reopensCaseId: id });
      expect((await caseRow(f, id)).state).toBe('objected');
      await expect(
        reopenRecovery(
          f.ctx,
          opener.actor,
          id,
          await opener.proof(recoveryAction('staff.recovery.reopen', id)),
        ),
      ).rejects.toThrow();
      // Withdrawing after the case was reopened is a conflict, not a second open case.
      await expect(
        withdrawRecoveryObjection(
          f.ctx,
          objector.actor,
          id,
          await objector.proof(recoveryAction('staff.recovery.withdraw', id)),
        ),
      ).rejects.toThrow();

      // The objector can neither verify nor approve the reopened case; verification restarts.
      await expect(
        verifyRecoveryIdentity(
          f.ctx,
          objector.actor,
          reopened,
          'Video call',
          'Matched the known face and voice.',
        ),
      ).rejects.toThrow('forbidden');
      await verifyRecoveryIdentity(
        f.ctx,
        opener.actor,
        reopened,
        'Video call',
        'Matched the known face and voice.',
      );
      await verifyRecoveryIdentity(
        f.ctx,
        moderator.actor,
        reopened,
        'Video call',
        'Matched the known face and voice.',
      );
      await expect(
        approveRecovery(
          f.ctx,
          objector.actor,
          reopened,
          await objector.proof(recoveryAction('staff.recovery.approve', reopened)),
        ),
      ).rejects.toThrow('forbidden');
      await approveRecovery(
        f.ctx,
        approver.actor,
        reopened,
        await approver.proof(recoveryAction('staff.recovery.approve', reopened)),
      );
      expect((await caseRow(f, reopened)).state).toBe('objection_window');
      const objections = await f.ctx.runtime.db
        .select()
        .from(schema.recoveryObjections)
        .where(eq(schema.recoveryObjections.caseId, id));
      expect(objections.map((o) => Boolean(o.withdrawnAt)).sort()).toEqual([false, true]);
    } finally {
      await f.stop();
    }
  });

  it('gives the subject a single-use objection link that grants nothing else', async () => {
    const f = await startApplicationFixture();
    try {
      const a = await addAssuredStaff(f),
        b = await addAssuredStaff(f),
        c = await addAssuredStaff(f),
        moderator = await addAssuredStaff(f, 'moderator'),
        subject = await addAssuredStaff(f, 'moderator');
      const id = await windowOpen(f, subject, a, [b, moderator], c);
      const sent: string[] = [];
      let outcome: 'accepted_for_delivery' | 'permanent_failure' = 'permanent_failure';
      const mailer: SecurityMailer = {
        async send(message) {
          sent.push(message.text);
          return outcome === 'accepted_for_delivery'
            ? { outcome, providerMessageId: 'synthetic-provider-message' }
            : { outcome, code: 'rejected' };
        },
      };
      const tokenOf = (text: string | undefined) => /#token=([^\s]+)/u.exec(text ?? '')?.[1] ?? '';

      // Not the subject of a case in its window: the generic notice applies.
      expect(await issueRecoveryObjectionLink(f.ctx, a.user.id, mailer)).toBe(false);
      // A link is never redeemable before the provider accepts the mail (identity §8).
      expect(await issueRecoveryObjectionLink(f.ctx, subject.user.id, mailer)).toBe(true);
      await expect(redeemRecoveryObjectionLink(f.ctx, tokenOf(sent[0]), 'object', prefix)).rejects.toThrow(
        'token_invalid',
      );
      outcome = 'accepted_for_delivery';
      expect(await issueRecoveryObjectionLink(f.ctx, subject.user.id, mailer)).toBe(true);
      const token = tokenOf(sent[1]);
      expect(sent[1]).toContain('/recovery/object#token=');

      // It is not a reset, registration or any other credential.
      await expect(resetPassword(f.ctx, token, 'fictional new staff phrase', prefix)).rejects.toThrow(
        'token_invalid',
      );
      await expect(
        completeRegistration(f.ctx, token, 'link_holder', 'fictional new member phrase', prefix),
      ).rejects.toThrow('token_invalid');
      await expect(redeemRecoveryObjectionLink(f.ctx, token, 'withdraw', prefix)).rejects.toThrow(
        'token_invalid',
      );

      await redeemRecoveryObjectionLink(f.ctx, token, 'object', prefix);
      expect((await caseRow(f, id)).state).toBe('objected');
      await expect(redeemRecoveryObjectionLink(f.ctx, token, 'object', prefix)).rejects.toThrow(
        'token_invalid',
      );
      await expect(redeemRecoveryObjectionLink(f.ctx, randomUUID(), 'object', prefix)).rejects.toThrow(
        'token_invalid',
      );
      const [subjectUser] = await f.ctx.runtime.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, subject.user.id));
      expect(subjectUser?.status).toBe('suspended');

      await redeemRecoveryObjectionLink(f.ctx, token, 'withdraw', prefix);
      expect((await caseRow(f, id)).state).toBe('objection_window');
      await expect(redeemRecoveryObjectionLink(f.ctx, token, 'withdraw', prefix)).rejects.toThrow(
        'token_invalid',
      );
      await expect(redeemRecoveryObjectionLink(f.ctx, token, 'object', prefix)).rejects.toThrow(
        'token_invalid',
      );
      const [link] = await f.ctx.runtime.db
        .select()
        .from(schema.recoveryObjectionLinks)
        .where(eq(schema.recoveryObjectionLinks.caseId, id))
        .orderBy(schema.recoveryObjectionLinks.createdAt);
      expect(link).toMatchObject({ state: 'invalidated', tokenHash: null });
    } finally {
      await f.stop();
    }
  });

  it('keeps the operator path unavailable until P-13 is recorded (ADR 0013 B, D)', async () => {
    const f = await startApplicationFixture();
    try {
      const operator = {
        kind: 'cli' as const,
        actorRef: 'cli:synthetic-operator',
        operator: 'Synthetic operator',
      };
      await expect(operatorApproveRecovery(f.ctx, operator, randomUUID())).rejects.toThrow('forbidden');
    } finally {
      await f.stop();
    }
  });
});
