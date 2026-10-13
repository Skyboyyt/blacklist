import { schema, eq } from '@blacklist/db';
import { randomToken, digest } from '../shared/crypto.ts';
import type { DeliveryContext } from '../identity/types.ts';
import { sendSecurityMail, RetryableDeliveryError, type SecurityMailer } from '../identity/mailer.ts';
export async function issueInvitation(ctx: DeliveryContext, id: string, mailer: SecurityMailer) {
  const raw = randomToken();
  const prepared = await ctx.runtime.transaction(async (tx) => {
    const [i] = await tx.select().from(schema.invitations).where(eq(schema.invitations.id, id)).for('update');
    if (
      !i ||
      i.state !== 'issued' ||
      i.expiresAt.getTime() <= Date.now() ||
      Date.now() - (i.approvedAt ?? i.createdAt).getTime() > 900_000 ||
      (i.requiresSecondApproval && !i.approvedByActor)
    )
      return null;
    const generation = i.generation + 1;
    await tx
      .update(schema.invitations)
      .set({ generation, tokenHash: digest(raw), deliveredAt: null, issuedAt: new Date() })
      .where(eq(schema.invitations.id, id));
    return { ...i, generation };
  });
  if (!prepared) return;
  const result = await sendSecurityMail(mailer, {
    recipient: prepared.email,
    subject: 'Blacklist staff enrollment',
    text: `Use your separately delivered enrollment code at:\n${ctx.settings.origin}/staff/enroll#token=${raw}\n\nRegister two authenticators in different failure domains where possible.`,
  });
  await ctx.runtime.transaction(async (tx) => {
    const [i] = await tx.select().from(schema.invitations).where(eq(schema.invitations.id, id)).for('update');
    if (i?.state === 'issued' && i.generation === prepared.generation && i.tokenHash === digest(raw))
      await tx
        .update(schema.invitations)
        .set({
          deliveredAt: result.outcome === 'accepted_for_delivery' ? new Date() : null,
          tokenHash: result.outcome === 'accepted_for_delivery' ? i.tokenHash : null,
        })
        .where(eq(schema.invitations.id, id));
    await tx.insert(schema.deliveries).values({
      kind: 'staff_invitation',
      entityType: 'staff_invitation',
      entityId: id,
      generation: prepared.generation,
      outcome: result.outcome,
      providerMessageId: result.outcome === 'accepted_for_delivery' ? result.providerMessageId : null,
      sanitizedErrorCode: result.outcome === 'accepted_for_delivery' ? null : result.code,
    });
  });
  if (result.outcome === 'retryable_failure') throw new RetryableDeliveryError();
}
