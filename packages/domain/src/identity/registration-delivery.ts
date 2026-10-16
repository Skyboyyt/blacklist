import { schema, eq } from '@blacklist/db';
import { randomToken, digest } from '../shared/crypto.ts';
import type { DeliveryContext } from './types.ts';
import { RetryableDeliveryError, sendSecurityMail, type SecurityMailer } from './mailer.ts';
import { record, claimNotice } from './mail-records.ts';
import { registrationAllowed } from './registration-access.ts';
export async function issueRegistration(ctx: DeliveryContext, intentId: string, mailer: SecurityMailer) {
  const plaintext = randomToken();
  const prepared = await ctx.runtime.transaction(async (tx) => {
    const [intent] = await tx
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.id, intentId))
      .for('update');
    if (
      !intent ||
      !['requested', 'pending_delivery', 'issued'].includes(intent.state) ||
      Date.now() - intent.createdAt.getTime() > 900_000
    )
      return null;
    const [existing] = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, intent.email));
    if (existing) {
      await tx
        .update(schema.intents)
        .set({
          state: 'superseded',
          closeReason: 'existing_account',
          supersededAt: new Date(),
          tokenHash: null,
        })
        .where(eq(schema.intents.id, intent.id));
      return { notice: true, email: intent.email, intent };
    }
    // ADR 0019: uninvited addresses are closed silently, so the HTTP answer stays uniform.
    if (!registrationAllowed(ctx.settings.registration, intent.email)) {
      await tx
        .update(schema.intents)
        .set({ state: 'superseded', closeReason: 'not_invited', supersededAt: new Date(), tokenHash: null })
        .where(eq(schema.intents.id, intent.id));
      return null;
    }
    const now = new Date(),
      generation = intent.generation + 1;
    await tx
      .update(schema.intents)
      .set({
        state: 'pending_delivery',
        generation,
        tokenHash: digest(plaintext),
        issuedAt: now,
        expiresAt: new Date(now.getTime() + 1800_000),
        deliveryOutcome: null,
      })
      .where(eq(schema.intents.id, intent.id));
    return { notice: false, email: intent.email, intent: { ...intent, generation } };
  });
  if (!prepared) return;
  if (prepared.notice) {
    if (await claimNotice(ctx, prepared.email))
      await sendSecurityMail(mailer, {
        recipient: prepared.email,
        subject: 'Blacklist account notice',
        text: `An account already uses this address. Sign in at ${ctx.settings.origin}/login or request a password reset. Contact support for a deactivated account.`,
      });
    return;
  }
  const result = await sendSecurityMail(mailer, {
    recipient: prepared.email,
    subject: 'Complete your Blacklist registration',
    text: `Choose your password and complete registration: ${ctx.settings.origin}/register/complete#token=${plaintext}`,
  });
  await ctx.runtime.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.id, intentId))
      .for('update');
    if (
      current?.state === 'pending_delivery' &&
      current.generation === prepared.intent.generation &&
      current.tokenHash === digest(plaintext)
    ) {
      const accepted = result.outcome === 'accepted_for_delivery';
      await tx
        .update(schema.intents)
        .set({
          state: accepted ? 'issued' : 'requested',
          deliveryOutcome: result.outcome,
          tokenHash: accepted ? current.tokenHash : null,
        })
        .where(eq(schema.intents.id, intentId));
    }
    await record(tx, 'registration', 'registration_intent', intentId, prepared.intent.generation, result);
  });
  if (result.outcome === 'retryable_failure') throw new RetryableDeliveryError();
}
