import { schema, eq, type Database } from '@blacklist/db';
import { digest } from '../shared/crypto.ts';
import type { DeliveryContext } from './types.ts';
import type { DeliveryOutcome } from './mailer.ts';
export async function record(
  tx: Database,
  kind: string,
  entityType: string,
  entityId: string,
  generation: number,
  result: DeliveryOutcome,
) {
  await tx.insert(schema.deliveries).values({
    kind,
    entityType,
    entityId,
    generation,
    outcome: result.outcome,
    providerMessageId: result.outcome === 'accepted_for_delivery' ? result.providerMessageId : null,
    sanitizedErrorCode: result.outcome === 'accepted_for_delivery' ? null : result.code,
    providerStatus: result.outcome === 'accepted_for_delivery' ? null : (result.providerStatus ?? null),
  });
}
export async function claimNotice(ctx: DeliveryContext, email: string) {
  return ctx.runtime.transaction(async (tx) => {
    const key = `notice:${digest(email)}`;
    await tx.insert(schema.throttle).values({ key, attempts: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(schema.throttle).where(eq(schema.throttle.key, key)).for('update');
    if (!row) throw new Error('notice_state_missing');
    if (row.attempts > 0 && Date.now() - row.windowStartedAt.getTime() < 86400_000) return false;
    await tx
      .update(schema.throttle)
      .set({ attempts: 1, windowStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.throttle.key, key));
    return true;
  });
}
