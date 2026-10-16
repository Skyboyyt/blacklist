import { schema, eq, and, inArray } from '@blacklist/db';
import { randomToken, digest } from '../shared/crypto.ts';
import type { DeliveryContext } from '../identity/types.ts';
import { sendSecurityMail, RetryableDeliveryError, type SecurityMailer } from '../identity/mailer.ts';
import { record } from '../identity/mail-records.ts';

/**
 * ADR 0013 C2: when a recovery case enters its objection window, the subject's notice
 * carries a single-use objection link instead of the generic text. Returns false when
 * the account is not the subject of a case in its window (the generic notice applies).
 * The link becomes redeemable only after `accepted_for_delivery` (identity §8).
 */
export async function issueRecoveryObjectionLink(
  ctx: DeliveryContext,
  accountId: string,
  mailer: SecurityMailer,
) {
  const raw = randomToken();
  const prepared = await ctx.runtime.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(schema.recoveries)
      .where(
        and(eq(schema.recoveries.subjectUserId, accountId), eq(schema.recoveries.state, 'objection_window')),
      )
      .for('update');
    if (!r?.objectionWindowEndsAt || r.objectionWindowEndsAt.getTime() <= Date.now()) return null;
    const [subject] = await tx.select().from(schema.user).where(eq(schema.user.id, accountId));
    if (!subject) return null;
    await tx
      .update(schema.recoveryObjectionLinks)
      .set({ state: 'invalidated', tokenHash: null })
      .where(
        and(
          eq(schema.recoveryObjectionLinks.caseId, r.id),
          inArray(schema.recoveryObjectionLinks.state, ['pending_delivery', 'active']),
        ),
      );
    const [link] = await tx
      .insert(schema.recoveryObjectionLinks)
      .values({
        caseId: r.id,
        tokenHash: digest(raw),
        state: 'pending_delivery',
        expiresAt: r.objectionWindowEndsAt,
      })
      .returning();
    if (!link) throw new Error('objection_link_creation_failed');
    return { link, email: subject.email, endsAt: r.objectionWindowEndsAt };
  });
  if (!prepared) return false;
  const result = await sendSecurityMail(mailer, {
    recipient: prepared.email,
    subject: 'Blacklist staff account recovery: object if this was not you',
    text: `A recovery of your Blacklist staff account was approved. Re-enrollment can start after ${prepared.endsAt.toISOString()}.\n\nIf you did not ask for this, object here before then (this link only records an objection):\n${ctx.settings.origin}/recovery/object#token=${raw}`,
  });
  await ctx.runtime.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(schema.recoveryObjectionLinks)
      .where(eq(schema.recoveryObjectionLinks.id, prepared.link.id))
      .for('update');
    if (link?.state === 'pending_delivery')
      await tx
        .update(schema.recoveryObjectionLinks)
        .set(
          result.outcome === 'accepted_for_delivery'
            ? { state: 'active' }
            : { state: 'invalidated', tokenHash: null },
        )
        .where(eq(schema.recoveryObjectionLinks.id, link.id));
    await record(
      tx,
      'staff_recovery_objection',
      'staff_recovery_objection_link',
      prepared.link.id,
      1,
      result,
    );
  });
  if (result.outcome === 'retryable_failure') throw new RetryableDeliveryError();
  return true;
}
