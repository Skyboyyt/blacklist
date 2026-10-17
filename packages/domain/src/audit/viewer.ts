import { schema, eq, and, desc, inArray, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import type { IdentityContext } from '../identity/types.ts';

// Administrator audit viewer (contracts moderation.ts `auditEntrySchema`). It reads the
// hash-chained audit log, which holds IDs and fixed codes only, so `reason` is always null:
// rationales stay in their own private tables. Members appear as "Member", never by handle.

const ACTION = {
  'moderation.case.created': 'case_created',
  'moderation.case.assigned': 'case_assigned',
  'moderation.case.unassigned': 'case_unassigned',
  'moderation.case.note_added': 'case_note_added',
  'moderation.case.status_changed': 'case_status_changed',
  'moderation.case.info_requested': 'info_requested',
  'moderation.case.replied': 'case_status_changed',
  'moderation.case.standing_decided': 'standing_decided',
  'moderation.appeal.escalated': 'admin_alert',
  'finding.created': 'finding_revision_submitted',
  'finding.revision_submitted': 'finding_revision_submitted',
  'finding.approved': 'finding_approved',
  'finding.rejected': 'finding_rejected',
  'finding.became_public': 'finding_became_public',
  'finding.suspended': 'finding_suspended',
  'finding.reinstated': 'finding_reinstated',
  'finding.reversed': 'finding_reversed',
  'project.created': 'profile_revised',
  'project.revised': 'profile_revised',
  'staff.bootstrap.created': 'staff_invitation_created',
  'staff.invitation.created': 'staff_invitation_created',
  'staff.invitation.approved': 'staff_invitation_approved',
  'staff.invitation.revoked': 'staff_invitation_revoked',
  'staff.role.requested': 'staff_role_requested',
  'staff.role.approved': 'staff_role_approved',
  'staff.role.revoked': 'staff_role_revoked',
  'staff.suspended': 'staff_suspended',
  'staff.offboarded': 'staff_offboarded',
  'staff.recovery.opened': 'staff_recovery_opened',
  'staff.recovery.verified': 'staff_recovery_verified',
  'staff.recovery.approved': 'staff_recovery_approved',
  'staff.recovery.objected': 'staff_recovery_objected',
  'staff.recovery.withdrawn': 'staff_recovery_withdrawn',
  'staff.recovery.reopened': 'staff_recovery_reopened',
  'staff.recovery.completed': 'staff_recovery_completed',
  'user.suspended': 'user_suspended',
  'user.restored': 'user_restored',
  'label.added': 'label_added',
  'label.retired': 'label_retired',
  'signal.suppressed': 'signal_suppressed',
  'signal.suppression_lifted': 'suppression_lifted',
} as const;
type MappedAction = keyof typeof ACTION;
const LIMIT = 200;

async function actorViews(tx: Database, refs: readonly string[]) {
  const unique = [...new Set(refs)];
  const out = new Map<string, { id: string; handle: string }>();
  if (!unique.length) return out;
  const rows = await tx
    .select({ ref: schema.actorMap.actorRef, kind: schema.user.accountKind, handle: schema.profiles.handle })
    .from(schema.actorMap)
    .leftJoin(schema.user, eq(schema.user.id, schema.actorMap.userId))
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.actorMap.userId))
    .where(inArray(schema.actorMap.actorRef, unique));
  for (const r of rows)
    out.set(
      r.ref,
      r.kind === 'staff' ? { id: r.ref, handle: r.handle ?? 'Staff' } : { id: 'member', handle: 'Member' },
    );
  return out;
}

/** The newest audit entries the viewer understands, optionally for one case. */
export async function auditEntries(ctx: IdentityContext, actor: UserActor, caseId?: string) {
  requirePermission(actor, 'audit:read');
  const db = ctx.runtime.db;
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        inArray(schema.auditLog.action, Object.keys(ACTION)),
        ...(caseId
          ? [eq(schema.auditLog.targetType, 'moderation_case'), eq(schema.auditLog.targetId, caseId)]
          : []),
      ),
    )
    .orderBy(desc(schema.auditLog.seq))
    .limit(LIMIT);
  const actors = await actorViews(
    db,
    rows.filter((r) => r.actorType === 'user').map((r) => r.actorRef),
  );
  return rows.map((r) => {
    const details = r.details as Record<string, unknown>;
    const from = typeof details['from'] === 'string' ? details['from'] : null;
    const to = typeof details['to'] === 'string' ? details['to'] : null;
    return {
      id: r.id,
      at: r.occurredAt.toISOString(),
      actor:
        r.actorType === 'user'
          ? (actors.get(r.actorRef) ?? { id: r.actorRef, handle: 'Staff' })
          : r.actorType === 'cli'
            ? { id: r.actorRef, handle: 'Operator' }
            : ('system' as const),
      // Rows are filtered to mapped actions above.
      action: ACTION[r.action as MappedAction],
      caseId: r.targetType === 'moderation_case' ? r.targetId : null,
      reason: null,
      changes: from || to ? [{ field: 'status', from, to }] : [],
    };
  });
}
