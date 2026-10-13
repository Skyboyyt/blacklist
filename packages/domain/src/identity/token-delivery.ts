import { schema, eq, and, inArray, sql } from '@blacklist/db';
import { randomToken, digest } from '../shared/crypto.ts';
import type { DeliveryContext } from './types.ts';
import { RetryableDeliveryError, sendSecurityMail, type SecurityMailer } from './mailer.ts';
import { record, claimNotice } from './mail-records.ts';
const open = ['pending_delivery', 'active'];
export async function issueIdentityToken(
  ctx: DeliveryContext,
  purpose: 'password_reset' | 'email_change',
  requestId: string,
  mailer: SecurityMailer,
) {
  const plaintext = randomToken();
  const prepared = await ctx.runtime.transaction(async (tx) => {
    const [candidate] =
      purpose === 'password_reset'
        ? await tx.select().from(schema.resetRequests).where(eq(schema.resetRequests.id, requestId))
        : await tx.select().from(schema.emailRequests).where(eq(schema.emailRequests.id, requestId));
    if (!candidate || Date.now() - candidate.requestedAt.getTime() > 900_000) return null;
    const [user] = await tx
      .select()
      .from(schema.user)
      .where(
        'email' in candidate ? eq(schema.user.email, candidate.email) : eq(schema.user.id, candidate.userId),
      );
    if (!user) return null;
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, user.id))
      .for('update');
    // Account first, then request/token rows, matching confirmation and every
    // security transition. The preliminary lookup supplies no authority.
    const [request] =
      purpose === 'password_reset'
        ? await tx
            .select()
            .from(schema.resetRequests)
            .where(eq(schema.resetRequests.id, requestId))
            .for('update')
        : await tx
            .select()
            .from(schema.emailRequests)
            .where(eq(schema.emailRequests.id, requestId))
            .for('update');
    const [current] = await tx.select().from(schema.user).where(eq(schema.user.id, user.id));
    if (
      !request ||
      Date.now() - request.requestedAt.getTime() > 900_000 ||
      !state ||
      current?.status !== 'active' ||
      ('email' in request && request.email !== current.email) ||
      ('securityVersion' in request && request.securityVersion !== state.securityVersion)
    )
      return null;
    if ('newEmail' in request) {
      if (state.sensitiveActionsLockedUntil && state.sensitiveActionsLockedUntil.getTime() > Date.now())
        return null;
      const [taken] = await tx.select().from(schema.user).where(eq(schema.user.email, request.newEmail));
      if (taken) return { notice: true as const, recipient: request.newEmail };
    }
    const recent = await tx
      .select({ id: schema.tokens.id })
      .from(schema.tokens)
      .where(
        and(
          eq(schema.tokens.userId, user.id),
          eq(schema.tokens.purpose, purpose),
          sql`${schema.tokens.issuedAt}>now()-interval '1 hour'`,
        ),
      );
    if (recent.length >= 3) throw new RetryableDeliveryError();
    const all = await tx
      .select({ generation: schema.tokens.generation })
      .from(schema.tokens)
      .where(and(eq(schema.tokens.userId, user.id), eq(schema.tokens.purpose, purpose)));
    const generation =
      purpose === 'password_reset'
        ? state.lastResetGeneration + 1
        : Math.max(0, ...all.map((t) => t.generation)) + 1;
    await tx
      .update(schema.tokens)
      .set({ state: 'invalidated', terminalAt: new Date(), invalidationReason: 'superseded' })
      .where(
        and(
          eq(schema.tokens.userId, user.id),
          eq(schema.tokens.purpose, purpose),
          inArray(schema.tokens.state, open),
        ),
      );
    if (purpose === 'password_reset')
      await tx
        .update(schema.security)
        .set({ lastResetGeneration: generation })
        .where(eq(schema.security.userId, user.id));
    const [token] = await tx
      .insert(schema.tokens)
      .values({
        userId: user.id,
        purpose,
        requestId,
        generation,
        securityVersion: state.securityVersion,
        targetEmail: 'newEmail' in request ? request.newEmail : null,
        state: 'pending_delivery',
        tokenHash: digest(plaintext),
        expiresAt: new Date(Date.now() + (purpose === 'password_reset' ? 1800_000 : 3600_000)),
      })
      .returning();
    if (!token) throw new Error('token_creation_failed');
    return {
      notice: false as const,
      recipient: 'newEmail' in request ? request.newEmail : current.email,
      token,
    };
  });
  if (!prepared) return;
  if (prepared.notice) {
    if (await claimNotice(ctx, prepared.recipient))
      await sendSecurityMail(mailer, {
        recipient: prepared.recipient,
        subject: 'Blacklist account notice',
        text: `This address already belongs to an account. Sign in at ${ctx.settings.origin}/login.`,
      });
    return;
  }
  const path = purpose === 'password_reset' ? '/reset-password' : '/email-change/confirm';
  const result = await sendSecurityMail(mailer, {
    recipient: prepared.recipient,
    subject:
      purpose === 'password_reset' ? 'Reset your Blacklist password' : 'Confirm your Blacklist email change',
    text: `${ctx.settings.origin}${path}#token=${plaintext}`,
  });
  await ctx.runtime.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, prepared.token.userId))
      .for('update');
    const [token] = await tx
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.id, prepared.token.id))
      .for('update');
    const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, prepared.token.userId));
    if (
      token?.state === 'pending_delivery' &&
      state?.securityVersion === token.securityVersion &&
      user?.status === 'active' &&
      (purpose !== 'password_reset' || state.lastResetGeneration === token.generation)
    ) {
      await tx
        .update(schema.tokens)
        .set({
          state: result.outcome === 'accepted_for_delivery' ? 'active' : 'invalidated',
          activatedAt: result.outcome === 'accepted_for_delivery' ? new Date() : null,
          terminalAt: result.outcome === 'accepted_for_delivery' ? null : new Date(),
          invalidationReason:
            result.outcome === 'accepted_for_delivery'
              ? null
              : result.outcome === 'retryable_failure'
                ? 'delivery_retryable'
                : 'delivery_permanent',
        })
        .where(eq(schema.tokens.id, token.id));
    }
    await record(tx, purpose, 'identity_token', prepared.token.id, prepared.token.generation, result);
  });
  if (result.outcome === 'retryable_failure') throw new RetryableDeliveryError();
}
