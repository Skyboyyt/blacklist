import { randomUUID } from 'node:crypto';
import { schema, sql, eq, asc, type Database } from '@blacklist/db';
import type { Actor } from '../access/types.ts';
import { canonicalJson, digest } from '../shared/crypto.ts';

const accountEvents = [
  'account.registered',
  'account.password_reset',
  'account.password_changed',
  'account.email_changed',
] as const;
const staffEvents = [
  'staff.bootstrap.created',
  'staff.invitation.created',
  'staff.invitation.approved',
  'staff.invitation.revoked',
  'staff.invitation.accepted',
  'staff.enrollment.code_failed',
  'staff.enrollment.started',
  'staff.enrollment.completed',
  'staff.authenticator.registered',
  'staff.authenticator.removed',
  'staff.authenticator.flagged',
  'staff.assurance.succeeded',
  'staff.assurance.failed',
  'staff.stepup.succeeded',
  'staff.stepup.failed',
  'staff.role.requested',
  'staff.role.approved',
  'staff.role.granted',
  'staff.role.revoked',
  'staff.suspended',
  'staff.restored',
  'staff.offboarded',
  'staff.recovery.opened',
  'staff.recovery.verified',
  'staff.recovery.approved',
  'staff.recovery.objected',
  'staff.recovery.withdrawn',
  'staff.recovery.reopened',
  'staff.recovery.completed',
  'staff.breakglass.invoked',
  'staff.breakglass.reviewed',
  'user.suspended',
  'user.restored',
] as const;
// Phase 9a case events. Statuses and pseudonymous references only; notes, messages and
// rationales stay in their own private tables.
const moderationEvents = [
  'moderation.case.created',
  'moderation.case.assigned',
  'moderation.case.unassigned',
  'moderation.case.note_added',
  'moderation.case.status_changed',
  'moderation.case.info_requested',
  'moderation.case.replied',
  'moderation.case.standing_decided',
  'finding.created',
  'finding.revision_submitted',
  'finding.approved',
  'finding.rejected',
  'finding.became_public',
  'finding.superseded',
  'finding.suspended',
  'finding.reinstated',
  'finding.reversed',
  'project.created',
  'project.revised',
] as const;
export type AuditAction =
  (typeof accountEvents)[number] | (typeof staffEvents)[number] | (typeof moderationEvents)[number];
// No free-form values. Recovery rationale/operator incident live in private state,
// not in the immutable audit payload. Event facts refer to IDs only.
const detailKeys: Record<string, readonly string[]> = {
  'staff.invitation.created': ['role', 'basis'],
  'staff.bootstrap.created': ['basis'],
  'staff.role.requested': ['role', 'operation'],
  'staff.role.granted': ['role'],
  'staff.role.revoked': ['role'],
  'staff.breakglass.invoked': ['incidentRef'],
  'staff.authenticator.flagged': ['reason'],
  'moderation.case.assigned': ['assigneeRef'],
  'moderation.case.unassigned': ['previousRef'],
  'moderation.case.status_changed': ['from', 'to'],
  'moderation.case.info_requested': ['from', 'to'],
  'moderation.case.replied': ['from', 'to'],
  'moderation.case.standing_decided': ['outcome'],
  'finding.created': ['revisionNumber', 'severity'],
  'finding.revision_submitted': ['revisionNumber', 'severity'],
  'finding.approved': ['revisionNumber'],
  'finding.rejected': ['revisionNumber'],
  'finding.became_public': ['revisionNumber'],
  'finding.superseded': ['revisionNumber'],
  'finding.suspended': ['severity'],
};
export async function actorReference(tx: Database, userId: string) {
  await tx.insert(schema.actorMap).values({ actorRef: randomUUID(), userId }).onConflictDoNothing();
  const [row] = await tx.select().from(schema.actorMap).where(eq(schema.actorMap.userId, userId));
  if (!row) throw new Error('actor_reference_missing');
  return row.actorRef;
}
export async function appendAudit(
  tx: Database,
  actor: Actor,
  action: AuditAction,
  targetType: string,
  targetId: string,
  details: Record<string, string | number | boolean> = {},
) {
  if (![...accountEvents, ...staffEvents, ...moderationEvents].includes(action))
    throw new Error('unknown_audit_action');
  if (
    Object.keys(details).some((k) => !detailKeys[action]?.includes(k)) ||
    Object.values(details).some((v) => typeof v === 'string' && v.length > 80)
  )
    throw new Error('audit_details_rejected');
  const event = {
    actor_type: actor.kind,
    actor_ref: actor.actorRef,
    actor_session_ref: actor.kind === 'user' ? actor.sessionId : null,
    actor_label: actor.kind === 'cli' ? actor.operator : null,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  };
  await tx.execute(sql`select blacklist.append_audit(${JSON.stringify(event)}::jsonb)`);
}
export async function verifyAudit(db: Database) {
  const rows = await db.select().from(schema.auditLog).orderBy(asc(schema.auditLog.seq));
  let previous = '0'.repeat(64);
  let seq = 1n;
  for (const r of rows) {
    const row = {
      seq: r.seq,
      id: r.id,
      occurred_at: r.occurredAt.toISOString(),
      actor_type: r.actorType,
      actor_ref: r.actorRef,
      actor_session_ref: r.actorSessionRef,
      actor_label: r.actorLabel,
      action: r.action,
      target_type: r.targetType,
      target_id: r.targetId,
      request_id: r.requestId,
      ip_prefix: r.ipPrefix,
      details: r.details,
    };
    if (r.seq !== seq || r.prevHash !== previous || r.rowHash !== digest(previous + canonicalJson(row)))
      throw new Error('audit_chain_invalid');
    previous = r.rowHash;
    seq++;
  }
  return { rows: rows.length, headHash: previous };
}
