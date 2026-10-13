import { schema, eq, and, inArray, sql, executor } from '@blacklist/db';
import type { DeliveryContext } from './types.ts';
export async function cleanupIdentity(ctx: DeliveryContext) {
  await ctx.runtime.transaction(async (tx, client) => {
    await tx
      .update(schema.invitations)
      .set({ state: 'expired', tokenHash: null, deliveredAt: null })
      .where(
        and(
          inArray(schema.invitations.state, ['issued', 'pending_approval']),
          sql`${schema.invitations.expiresAt}<now()`,
        ),
      );
    await tx
      .update(schema.tokens)
      .set({ state: 'invalidated', invalidationReason: 'cleanup', terminalAt: new Date() })
      .where(
        and(
          eq(schema.tokens.state, 'pending_delivery'),
          sql`${schema.tokens.issuedAt}<now()-interval '15 minutes'`,
        ),
      );
    await tx
      .update(schema.tokens)
      .set({ state: 'expired', terminalAt: new Date() })
      .where(and(eq(schema.tokens.state, 'active'), sql`${schema.tokens.expiresAt}<now()`));
    await tx
      .update(schema.intents)
      .set({ state: 'expired', tokenHash: null, closeReason: 'expired' })
      .where(
        and(
          inArray(schema.intents.state, ['requested', 'pending_delivery', 'issued']),
          sql`coalesce(${schema.intents.expiresAt},${schema.intents.createdAt}+interval '15 minutes')<now()`,
        ),
      );
    await tx
      .delete(schema.challenges)
      .where(
        sql`${schema.challenges.expiresAt}<now() or ${schema.challenges.flowId} in (select id from blacklist.staff_enrollment_flows where expires_at<now())`,
      );
    await tx.delete(schema.credentialIntents).where(sql`${schema.credentialIntents.expiresAt}<now()`);
    await tx.delete(schema.enrollmentFlows).where(sql`${schema.enrollmentFlows.expiresAt}<now()`);
    await tx
      .delete(schema.tokens)
      .where(
        and(
          inArray(schema.tokens.state, ['invalidated', 'consumed', 'expired']),
          sql`${schema.tokens.terminalAt}<now()-interval '24 hours'`,
        ),
      );
    await tx
      .delete(schema.intents)
      .where(
        and(
          inArray(schema.intents.state, ['completed', 'superseded', 'expired']),
          sql`coalesce(${schema.intents.completedAt},${schema.intents.supersededAt},${schema.intents.expiresAt},${schema.intents.createdAt})<now()-interval '24 hours'`,
        ),
      );
    await tx
      .delete(schema.resetRequests)
      .where(sql`${schema.resetRequests.requestedAt}<now()-interval '7 days'`);
    await tx
      .delete(schema.emailRequests)
      .where(sql`${schema.emailRequests.requestedAt}<now()-interval '7 days'`);
    await tx
      .delete(schema.securityEvents)
      .where(sql`${schema.securityEvents.occurredAt}<now()-interval '180 days'`);
    await ctx.runtime.boss.send(
      'identity.cleanup',
      {},
      { db: executor(client), startAfter: 60, singletonKey: `cleanup:${Math.floor(Date.now() / 60000) + 1}` },
    );
  });
}
