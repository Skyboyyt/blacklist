import { schema, eq, and, gt, isNull, inArray, type Database } from '@blacklist/db';
import type { UserActor, OperatorActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit, actorReference } from '../audit/service.ts';
import { DomainError } from '../shared/errors.ts';
import { digest } from '../shared/crypto.ts';
import type { IdentityContext } from '../identity/types.ts';
import { admitTokenAction } from '../identity/token-throttle.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
import { notifyAdmins, type Client } from './common.ts';

// ADR 0013 C: objections, withdrawal, reopening and the abuse signal.
const WINDOW_MS = 86400_000;
const PATTERN_WINDOW_MS = 30 * 86400_000;
type Recovery = typeof schema.recoveries.$inferSelect;

async function lockCase(tx: Database, id: string) {
  const [r] = await tx.select().from(schema.recoveries).where(eq(schema.recoveries.id, id)).for('update');
  return r;
}
function validReason(reason: string) {
  return reason.trim().length >= 10 && reason.length <= 1000;
}

/** Everyone who objected anywhere along a reopened chain; they never verify or approve it. */
export async function chainObjectors(tx: Database, r: Recovery) {
  const objectors = new Set<string>();
  for (let caseId = r.reopensCaseId, depth = 0; caseId && depth < 50; depth++) {
    const rows = await tx
      .select({ objector: schema.recoveryObjections.objector })
      .from(schema.recoveryObjections)
      .where(eq(schema.recoveryObjections.caseId, caseId));
    for (const row of rows) objectors.add(row.objector);
    const [parent] = await tx
      .select({ reopensCaseId: schema.recoveries.reopensCaseId })
      .from(schema.recoveries)
      .where(eq(schema.recoveries.id, caseId));
    caseId = parent?.reopensCaseId ?? null;
  }
  return objectors;
}

async function recordObjection(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: UserActor | OperatorActor | { kind: 'system'; actorRef: string; jobKind: string },
  r: Recovery,
  objector: { ref: string; kind: 'staff' | 'subject' | 'operator'; reason: string | null },
) {
  if (!['objection_window', 'fresh_enrollment'].includes(r.state)) throw new DomainError('forbidden');
  await tx.insert(schema.recoveryObjections).values({
    caseId: r.id,
    objector: objector.ref,
    objectorKind: objector.kind,
    reason: objector.reason,
  });
  await tx.update(schema.recoveries).set({ state: 'objected' }).where(eq(schema.recoveries.id, r.id));
  if (r.invitationId)
    await tx
      .update(schema.invitations)
      .set({ state: 'revoked', tokenHash: null, deliveredAt: null })
      .where(eq(schema.invitations.id, r.invitationId));
  await appendAudit(tx, actor, 'staff.recovery.objected', 'recovery', r.id);
  await notifyAdmins(ctx, tx, client, 'staff_recovery_objected', r.subjectUserId);
  if (objector.kind !== 'staff') return;
  // C6: repeated objections by one staff member alert every admin (the owner included).
  const recent = await tx
    .select({ id: schema.recoveryObjections.id })
    .from(schema.recoveryObjections)
    .where(
      and(
        eq(schema.recoveryObjections.objector, objector.ref),
        gt(schema.recoveryObjections.createdAt, new Date(Date.now() - PATTERN_WINDOW_MS)),
      ),
    );
  if (recent.length >= 2) await notifyAdmins(ctx, tx, client, 'staff_recovery_objection_pattern');
}

/** C1: a staff objection needs an action-bound step-up and a reason. */
export async function objectRecovery(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  reason: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:recovery:approve');
  if (!validReason(reason)) throw new DomainError('invalid_request');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.recovery.object', targetType: 'recovery', targetId: id, parameters: { reason } },
    assertion,
    async (tx, client) => {
      const r = await lockCase(tx, id);
      if (!r || r.subjectUserId === actor.userId) throw new DomainError('forbidden');
      await recordObjection(ctx, tx, client, actor, r, { ref: actor.actorRef, kind: 'staff', reason });
    },
  );
}
export async function operatorObjectRecovery(
  ctx: IdentityContext,
  actor: OperatorActor,
  id: string,
  reason: string,
) {
  if (!validReason(reason)) throw new DomainError('invalid_request');
  await ctx.runtime.transaction(async (tx, client) => {
    const r = await lockCase(tx, id);
    if (!r) throw new DomainError('forbidden');
    await recordObjection(ctx, tx, client, actor, r, { ref: actor.actorRef, kind: 'operator', reason });
  });
}

/**
 * C5: the objector withdraws within 24 hours of objecting. The case returns to a new
 * 24-hour objection window only when no other objection on it is still standing.
 */
async function withdrawTx(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  actor: UserActor | { kind: 'system'; actorRef: string; jobKind: string },
  r: Recovery,
  objectorRef: string,
) {
  if (r.state !== 'objected') throw new DomainError('forbidden');
  const standing = await tx
    .select()
    .from(schema.recoveryObjections)
    .where(and(eq(schema.recoveryObjections.caseId, r.id), isNull(schema.recoveryObjections.withdrawnAt)))
    .for('update');
  const own = standing.find(
    (o) => o.objector === objectorRef && o.createdAt.getTime() > Date.now() - WINDOW_MS,
  );
  if (!own) throw new DomainError('forbidden');
  const [reopened] = await tx
    .select({ id: schema.recoveries.id })
    .from(schema.recoveries)
    .where(eq(schema.recoveries.reopensCaseId, r.id));
  if (reopened) throw new DomainError('conflict');
  await tx
    .update(schema.recoveryObjections)
    .set({ withdrawnAt: new Date() })
    .where(eq(schema.recoveryObjections.id, own.id));
  if (standing.length === 1)
    await tx
      .update(schema.recoveries)
      .set({ state: 'objection_window', objectionWindowEndsAt: new Date(Date.now() + WINDOW_MS) })
      .where(eq(schema.recoveries.id, r.id));
  await appendAudit(tx, actor, 'staff.recovery.withdrawn', 'recovery', r.id);
  await notifyAdmins(
    ctx,
    tx,
    client,
    standing.length === 1 ? 'staff_recovery_objection_window' : 'staff_recovery_objection_withdrawn',
    r.subjectUserId,
  );
}
export async function withdrawRecoveryObjection(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:recovery:approve');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.recovery.withdraw', targetType: 'recovery', targetId: id, parameters: {} },
    assertion,
    async (tx, client) => {
      const r = await lockCase(tx, id);
      if (!r) throw new DomainError('forbidden');
      try {
        await withdrawTx(ctx, tx, client, actor, r, actor.actorRef);
      } catch (error) {
        throw toOpenCaseConflict(error);
      }
    },
  );
}

/**
 * C4: resolving an objection opens a new case that references the objected one. An
 * admin other than the subject and every objector opens it; verification and the
 * objection window restart from the beginning.
 */
export async function reopenRecovery(
  ctx: IdentityContext,
  actor: UserActor,
  objectedId: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'staff:recovery:open');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.recovery.reopen', targetType: 'recovery', targetId: objectedId, parameters: {} },
    assertion,
    async (tx, client) => {
      const r = await lockCase(tx, objectedId);
      if (!r || r.state !== 'objected' || r.subjectUserId === actor.userId)
        throw new DomainError('forbidden');
      const objectors = await chainObjectors(tx, { ...r, reopensCaseId: r.id });
      if (objectors.has(actor.actorRef)) throw new DomainError('forbidden');
      const [subject] = await tx.select().from(schema.user).where(eq(schema.user.id, r.subjectUserId));
      if (subject?.status !== 'suspended') throw new DomainError('forbidden');
      const [created] = await tx
        .insert(schema.recoveries)
        .values({
          subjectUserId: r.subjectUserId,
          openedBy: actor.actorRef,
          state: 'identity_verification',
          reopensCaseId: r.id,
        })
        .returning()
        .catch((error: unknown) => {
          throw toOpenCaseConflict(error);
        });
      if (!created) throw new Error('recovery_creation_failed');
      await tx
        .update(schema.recoveryObjectionLinks)
        .set({ state: 'invalidated', tokenHash: null })
        .where(
          and(
            eq(schema.recoveryObjectionLinks.caseId, r.id),
            inArray(schema.recoveryObjectionLinks.state, ['pending_delivery', 'active', 'objected']),
          ),
        );
      await appendAudit(tx, actor, 'staff.recovery.reopened', 'recovery', created.id);
      await notifyAdmins(ctx, tx, client, 'staff_recovery_reopened', r.subjectUserId);
      return created.id;
    },
  );
}

/** A second open case for the subject, or a second reopening of one case, is a conflict. */
function toOpenCaseConflict(error: unknown) {
  if (error instanceof DomainError) return error;
  const code =
    (error as { code?: unknown; cause?: { code?: unknown } }).code ??
    (error as { cause?: { code?: unknown } }).cause?.code;
  return code === '23505' ? new DomainError('conflict') : error;
}

/**
 * C2/C5: the subject's emailed link records one objection and, once, its withdrawal.
 * It grants nothing else and works while the subject's sessions are suspended.
 */
export async function redeemRecoveryObjectionLink(
  ctx: IdentityContext,
  rawToken: string,
  operation: 'object' | 'withdraw',
  prefix: string,
) {
  await admitTokenAction(ctx, 'staff_recovery.objection_link', rawToken, prefix);
  const system = {
    kind: 'system' as const,
    actorRef: 'staff.recovery.subject_link',
    jobKind: 'staff.recovery',
  };
  await ctx.runtime.transaction(async (tx, client) => {
    const [link] = await tx
      .select()
      .from(schema.recoveryObjectionLinks)
      .where(eq(schema.recoveryObjectionLinks.tokenHash, digest(rawToken)))
      .for('update');
    if (!link) throw new DomainError('token_invalid');
    const r = await lockCase(tx, link.caseId);
    if (!r) throw new DomainError('token_invalid');
    const subjectRef = await actorReference(tx, r.subjectUserId);
    if (operation === 'object') {
      if (
        link.state !== 'active' ||
        link.expiresAt.getTime() <= Date.now() ||
        !['objection_window', 'fresh_enrollment'].includes(r.state)
      )
        throw new DomainError('token_invalid');
      await recordObjection(ctx, tx, client, system, r, { ref: subjectRef, kind: 'subject', reason: null });
      await tx
        .update(schema.recoveryObjectionLinks)
        .set({ state: 'objected', usedAt: new Date() })
        .where(eq(schema.recoveryObjectionLinks.id, link.id));
      return;
    }
    if (link.state !== 'objected' || r.state !== 'objected') throw new DomainError('token_invalid');
    try {
      await withdrawTx(ctx, tx, client, system, r, subjectRef);
    } catch (error) {
      throw error instanceof DomainError && error.code === 'forbidden'
        ? new DomainError('token_invalid')
        : toOpenCaseConflict(error);
    }
    await tx
      .update(schema.recoveryObjectionLinks)
      .set({ state: 'withdrawn', tokenHash: null, usedAt: new Date() })
      .where(eq(schema.recoveryObjectionLinks.id, link.id));
  });
}
