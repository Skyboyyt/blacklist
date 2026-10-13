import { schema, eq, and, ne, inArray, desc } from '@blacklist/db';
import { requirePermission } from '../access/policies.ts';
import type { UserActor } from '../access/types.ts';
import { lockActor } from '../identity/sessions.ts';
import type { IdentityContext } from '../identity/types.ts';
export async function recoveryVerificationCases(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'staff:recovery:verify');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const rows = await tx
      .select()
      .from(schema.recoveries)
      .where(
        and(
          ne(schema.recoveries.subjectUserId, actor.userId),
          inArray(schema.recoveries.state, [
            'identity_verification',
            'second_admin_approval',
            'objection_window',
            'fresh_enrollment',
            'objected',
            'completed',
          ]),
        ),
      )
      .limit(100);
    async function ref(id: string) {
      const [map] = await tx.select().from(schema.actorMap).where(eq(schema.actorMap.actorRef, id));
      const [p] = await tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, map?.userId ?? id));
      return { id, handle: p?.handle ?? 'Operator' };
    }
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        subject: await ref(r.subjectUserId),
        openedBy: await ref(r.openedBy),
        approvedBy: r.approvedBy ? await ref(r.approvedBy) : null,
        state:
          r.state === 'identity_verification'
            ? 'verifying'
            : r.state === 'second_admin_approval'
              ? 'awaiting_approval'
              : r.state,
        createdAt: r.createdAt.toISOString(),
        objectionWindowEndsAt: r.objectionWindowEndsAt?.toISOString() ?? null,
        verifications: await Promise.all(
          (
            await tx
              .select()
              .from(schema.recoveryVerifications)
              .where(eq(schema.recoveryVerifications.caseId, r.id))
          ).map(async (v) => ({
            verifier: await ref(v.verifier),
            method: v.method,
            at: v.createdAt.toISOString(),
          })),
        ),
      })),
    );
  });
}
export async function ownRecoveryStatus(ctx: IdentityContext, actor: UserActor) {
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const [r] = await tx
      .select()
      .from(schema.recoveries)
      .where(eq(schema.recoveries.subjectUserId, actor.userId))
      .orderBy(desc(schema.recoveries.createdAt))
      .limit(1);
    if (!r) return null;
    const verifications = await tx
      .select({ id: schema.recoveryVerifications.id })
      .from(schema.recoveryVerifications)
      .where(eq(schema.recoveryVerifications.caseId, r.id));
    return {
      stage:
        r.state === 'identity_verification'
          ? 'identity_verification'
          : r.state === 'second_admin_approval'
            ? 'second_admin_approval'
            : r.state,
      openedAt: r.createdAt.toISOString(),
      objectionWindowEndsAt: r.objectionWindowEndsAt?.toISOString() ?? null,
      identityVerificationsCompleted: Math.min(2, verifications.length),
    };
  });
}
