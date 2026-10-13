import { z } from 'zod';
import {
  issueRegistration,
  issueIdentityToken,
  issueInvitation,
  sendNotice,
  sendEmailChangeNotices,
  cleanupIdentity,
  verifyAudit,
  RetryableDeliveryError,
  type DeliveryContext,
  type SecurityMailer,
} from '@blacklist/domain';

// Each handler reloads its entity and account state in its domain protocol.
// Jobs cannot supply actor/role/status fields or bearer values.
export async function startWorker(ctx: DeliveryContext, mailer: SecurityMailer, pollingIntervalSeconds = 2) {
  const registrations: Array<Promise<unknown>> = [];
  const work = <S extends z.ZodType>(
    name: string,
    schema: S,
    handler: (value: z.output<S>) => Promise<unknown>,
  ) => {
    registrations.push(
      ctx.runtime.boss.work(name, { pollingIntervalSeconds }, async (jobs) => {
        for (const job of jobs) {
          try {
            await handler(schema.parse(job.data));
          } catch {
            throw new RetryableDeliveryError();
          }
        }
      }),
    );
  };
  work('identity.registration.issue', z.strictObject({ intentId: z.uuid() }), (v) =>
    issueRegistration(ctx, v.intentId, mailer),
  );
  work('identity.password_reset.issue', z.strictObject({ requestId: z.uuid() }), (v) =>
    issueIdentityToken(ctx, 'password_reset', v.requestId, mailer),
  );
  work('identity.email_change.issue', z.strictObject({ requestId: z.uuid() }), (v) =>
    issueIdentityToken(ctx, 'email_change', v.requestId, mailer),
  );
  work('identity.email_change.notice', z.strictObject({ requestId: z.uuid() }), (v) =>
    sendEmailChangeNotices(ctx, v.requestId, mailer),
  );
  work('identity.staff_invitation.issue', z.strictObject({ invitationId: z.uuid() }), (v) =>
    issueInvitation(ctx, v.invitationId, mailer),
  );
  work(
    'identity.security_notice',
    z.strictObject({
      accountId: z.uuid(),
      kind: z.enum([
        'password_reset',
        'password_changed',
        'email_changed',
        'staff_invitation_created',
        'staff_invitation_approved',
        'staff_invitation_revoked',
        'staff_enrolled',
        'staff_role_changed',
        'staff_role_requested',
        'staff.suspend',
        'user.suspend',
        'user.restore',
        'staff_offboarded',
        'staff_recovery_opened',
        'staff_recovery_verified',
        'staff_recovery_objection_window',
        'staff_recovery_objected',
        'break_glass_invoked',
        'staff_authenticator_removed',
        'staff_authenticator_registered',
        'staff_authenticator_flagged',
      ]),
    }),
    (v) => sendNotice(ctx, v.accountId, v.kind, mailer),
  );
  work('identity.cleanup', z.strictObject({}), () => cleanupIdentity(ctx));
  work('audit.verify', z.strictObject({}), async () => {
    const result = await verifyAudit(ctx.runtime.db);
    await ctx.runtime.boss.send(
      'audit.verify',
      {},
      { startAfter: 86400, singletonKey: `audit:${Math.floor(Date.now() / 86400000) + 1}` },
    );
    return result;
  });
  await Promise.all(registrations);
  await ctx.runtime.boss.send(
    'identity.cleanup',
    {},
    { singletonKey: `cleanup:${Math.floor(Date.now() / 60000)}` },
  );
  await ctx.runtime.boss.send(
    'audit.verify',
    {},
    { singletonKey: `audit:${Math.floor(Date.now() / 86400000)}` },
  );
}
