import { schema, eq, and, desc, inArray, isNull, lte, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import type { IdentityContext } from '../identity/types.ts';
import { REDRESS_STATUS_LABEL, REPORT_STATUS_LABEL, PROJECT_STATUS_LABEL } from '../moderation/labels.ts';

// In-app notifications (data-model §8; Phase 10 slice 4). A notification stores a type, IDs
// and fixed template parameters only; its text is rendered here when read, so no member or
// staff free text is ever copied into it. The dedupe key notifies each recipient once per event.

export type NotificationType =
  | 'submission_received'
  | 'information_requested'
  | 'decision_recorded'
  | 'standing_decided'
  | 'appeal_escalated';
type Case = typeof schema.moderationCases.$inferSelect;
/** Template parameters: IDs and fixed codes only. */
type Payload = { readonly caseId: string; readonly outcome?: string };

const APPEAL_ESCALATION_MS = 14 * 86400_000;
const OUTCOME_LABEL: Readonly<Record<string, string>> = {
  ...PROJECT_STATUS_LABEL,
  ...REDRESS_STATUS_LABEL,
  ...REPORT_STATUS_LABEL,
};

export async function notify(
  tx: Database,
  recipientUserId: string,
  type: NotificationType,
  sourceRevision: string,
  payload: Payload,
) {
  await tx
    .insert(schema.notifications)
    .values({
      recipientUserId,
      type,
      payload,
      sourceRef: payload.caseId,
      sourceRevision,
      dedupeKey: `${type}:${payload.caseId}:${sourceRevision}`,
    })
    .onConflictDoNothing();
}

/** The member who submitted the case's source, or null for staff-opened cases. */
export async function caseOwner(tx: Database, c: Case): Promise<string | null> {
  const pick = async <T>(rows: Promise<readonly { id: T }[]>) => (await rows)[0]?.id ?? null;
  if (c.reportId)
    return pick(
      tx
        .select({ id: schema.reports.reporterUserId })
        .from(schema.reports)
        .where(eq(schema.reports.id, c.reportId)),
    );
  if (c.appealId)
    return pick(
      tx
        .select({ id: schema.appeals.appellantUserId })
        .from(schema.appeals)
        .where(eq(schema.appeals.id, c.appealId)),
    );
  if (c.responseId)
    return pick(
      tx
        .select({ id: schema.subjectResponses.authorUserId })
        .from(schema.subjectResponses)
        .where(eq(schema.subjectResponses.id, c.responseId)),
    );
  if (c.suggestionId)
    return pick(
      tx
        .select({ id: schema.projectSuggestions.submitterUserId })
        .from(schema.projectSuggestions)
        .where(eq(schema.projectSuggestions.id, c.suggestionId)),
    );
  if (c.correctionId)
    return pick(
      tx
        .select({ id: schema.correctionRequests.requesterUserId })
        .from(schema.correctionRequests)
        .where(eq(schema.correctionRequests.id, c.correctionId)),
    );
  return null;
}

const DECISIONS = new Set([
  'accept_report',
  'reject_report',
  'reject_abusive',
  'uphold',
  'amend',
  'reverse',
  'publish_response',
  'reject_response',
  'accept_suggestion',
  'reject_suggestion',
  'accept_correction',
  'reject_correction',
]);

/**
 * Called at the end of a case decision, in its transaction. Notifies the submitter of a
 * request for information, a standing decision or a final decision. `outcome` is the
 * member-visible status code after the decision.
 */
export async function notifyCaseDecision(tx: Database, caseId: string, action: string, outcome: string) {
  const [c] = await tx.select().from(schema.moderationCases).where(eq(schema.moderationCases.id, caseId));
  if (!c) return;
  const type: NotificationType | null =
    action === 'request_info'
      ? 'information_requested'
      : action === 'grant_standing' || action === 'deny_standing'
        ? 'standing_decided'
        : DECISIONS.has(action)
          ? 'decision_recorded'
          : null;
  if (!type) return;
  const owner = await caseOwner(tx, c);
  if (!owner) return;
  await notify(tx, owner, type, String(c.version), {
    caseId: c.id,
    outcome: type === 'standing_decided' ? (action === 'grant_standing' ? 'granted' : 'denied') : outcome,
  });
}

function textOf(type: string, payload: Payload) {
  switch (type) {
    case 'submission_received':
      return 'Your submission was received. It is private and has no public effect until staff review it.';
    case 'information_requested':
      return 'Staff asked for more information about one of your submissions.';
    case 'standing_decided':
      return payload.outcome === 'granted'
        ? 'Staff confirmed your proof of control.'
        : 'Staff could not confirm your proof of control. You can reply with more information.';
    case 'appeal_escalated':
      return 'An appeal has waited more than 14 days for a decision.';
    default:
      return `A decision was recorded on one of your submissions: ${OUTCOME_LABEL[payload.outcome ?? ''] ?? 'Decided'}.`;
  }
}

/** The signed-in member's notifications, newest first (contracts `memberNoticeSchema`). */
export async function listOwnNotices(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'notification:read:own');
  const rows = await ctx.runtime.db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.recipientUserId, actor.userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);
  return rows
    .filter((n) => n.type !== 'appeal_escalated')
    .map((n) => {
      const payload = n.payload as Payload;
      return {
        id: n.id,
        text: textOf(n.type, payload),
        at: n.createdAt.toISOString(),
        href: `/reports/${payload.caseId}`,
      };
    });
}

/** Administrator alerts for the overview (contracts `adminOverviewSchema.alerts`). */
export async function adminAlerts(tx: Database, userId: string) {
  const rows = await tx
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientUserId, userId),
        eq(schema.notifications.type, 'appeal_escalated'),
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(20);
  return rows.map((n) => ({
    id: n.id,
    at: n.createdAt.toISOString(),
    text: textOf(n.type, n.payload as Payload),
  }));
}

/**
 * Escalates appeals still open 14 days after submission to every active administrator.
 * `escalated_at` is set by compare-and-set, so each appeal escalates exactly once even if
 * sweeps overlap. Returns the number escalated.
 */
export async function escalateOverdueAppeals(
  runtime: { db: Database; transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> },
  now = new Date(),
) {
  const due = await runtime.db
    .select({ id: schema.appeals.id })
    .from(schema.appeals)
    .where(
      and(
        inArray(schema.appeals.status, ['submitted', 'in_review']),
        isNull(schema.appeals.escalatedAt),
        lte(schema.appeals.submittedAt, new Date(now.getTime() - APPEAL_ESCALATION_MS)),
      ),
    )
    .limit(100);
  let escalated = 0;
  for (const { id } of due)
    await runtime.transaction(async (tx) => {
      // Find the case first: an appeal is marked escalated only when its alert is written.
      const [c] = await tx
        .select({ id: schema.moderationCases.id })
        .from(schema.moderationCases)
        .where(eq(schema.moderationCases.appealId, id));
      if (!c) return;
      const [appeal] = await tx
        .update(schema.appeals)
        .set({ escalatedAt: now })
        .where(
          and(
            eq(schema.appeals.id, id),
            isNull(schema.appeals.escalatedAt),
            inArray(schema.appeals.status, ['submitted', 'in_review']),
          ),
        )
        .returning({ id: schema.appeals.id });
      if (!appeal) return;
      const admins = await tx
        .select({ id: schema.user.id })
        .from(schema.roles)
        .innerJoin(schema.user, eq(schema.roles.userId, schema.user.id))
        .where(
          and(
            eq(schema.roles.role, 'admin'),
            isNull(schema.roles.revokedAt),
            eq(schema.user.status, 'active'),
          ),
        );
      for (const admin of admins) await notify(tx, admin.id, 'appeal_escalated', '14d', { caseId: c.id });
      await appendAudit(
        tx,
        { kind: 'system', actorRef: 'moderation.appeal_escalation', jobKind: 'moderation.appeal_escalation' },
        'moderation.appeal.escalated',
        'moderation_case',
        c.id,
      );
      escalated++;
    });
  return escalated;
}
