import { schema, eq } from '@blacklist/db';
import type { DeliveryContext } from './types.ts';
import { RetryableDeliveryError, sendSecurityMail, type SecurityMailer } from './mailer.ts';
export async function sendNotice(
  ctx: DeliveryContext,
  accountId: string,
  kind: string,
  mailer: SecurityMailer,
) {
  const [u] = await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.id, accountId));
  if (!u) return;
  const result = await sendSecurityMail(mailer, {
    recipient: u.email,
    subject: 'Blacklist security notification',
    text: `A security event (${kind}) occurred on your account. Review your sessions at ${ctx.settings.origin}/settings/security.`,
  });
  if (result.outcome === 'retryable_failure') throw new RetryableDeliveryError();
}
export async function sendEmailChangeNotices(
  ctx: DeliveryContext,
  requestId: string,
  mailer: SecurityMailer,
) {
  const [request] = await ctx.runtime.db
    .select()
    .from(schema.emailRequests)
    .where(eq(schema.emailRequests.id, requestId));
  if (!request || request.outcome !== 'confirmed') return;
  for (const recipient of new Set([request.oldEmail, request.newEmail])) {
    const result = await sendSecurityMail(mailer, {
      recipient,
      subject: 'Blacklist email changed',
      text: `Your account email changed. If you did not authorize this, contact support. Review security at ${ctx.settings.origin}/settings/security.`,
    });
    if (result.outcome === 'retryable_failure') throw new RetryableDeliveryError();
  }
}
