import { schema, eq, and, asc, desc, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { hasPermission, requirePermission, type Permission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { withStepup, type AssertionInput } from '../staff/webauthn.ts';
import { addressOf, type ChainSlug } from './subjects.ts';
import { staffRefs, submitterPseudonym, type StaffRefView } from './refs.ts';
import { defangUrl } from './labels.ts';
import { moveReport } from './reports.ts';
import { decideRedress, redressCaseFields, syncRedressStatus } from './redress.ts';
import {
  createFindingFromReport,
  decideSuspension,
  suspensionCaseFields,
  POLICY_VERSION,
  type Severity,
} from './findings.ts';

// Staff case workflow (moderation design; contracts moderation.ts). Phase 9a runs report
// reviews, emergency-suspension reviews, appeals and right-of-reply responses. Corrections
// and project suggestions arrive with project profiles (Phase 10).

const CASE_TARGET = 'moderation_case';
const PAGE_SIZE = 8;
const OPEN: Readonly<Record<string, readonly string[]>> = {
  report_review: ['submitted', 'screening', 'queued', 'in_review', 'needs_info'],
  appeal_review: ['submitted', 'in_review'],
  correction_request: ['submitted', 'in_review'],
  project_suggestion: ['submitted', 'needs_information'],
  subject_response: ['submitted', 'in_review'],
  suspension_review: ['open'],
};
type Case = typeof schema.moderationCases.$inferSelect;
type Report = typeof schema.reports.$inferSelect;

/** Validated at the route with contracts `caseDecisionSchema`; fields read here are typed by action. */
export type CaseDecisionInput = { readonly action: string } & Readonly<Record<string, unknown>>;

interface Rule {
  from: readonly string[];
  to: string;
  permission: Permission;
  stepUp: boolean;
}
/** Decisions per case type (contracts `caseDecisionSchema`; api-integration-contracts check order). */
const REPORT_RULES: Readonly<Record<string, Rule>> = {
  start_review: { from: ['queued'], to: 'in_review', permission: 'finding:propose', stepUp: false },
  request_info: { from: ['in_review'], to: 'needs_info', permission: 'finding:propose', stepUp: false },
  accept_report: { from: ['in_review'], to: 'accepted', permission: 'finding:propose', stepUp: true },
  reject_report: { from: ['in_review'], to: 'rejected', permission: 'finding:propose', stepUp: true },
  reject_abusive: {
    from: ['in_review'],
    to: 'rejected_abusive',
    permission: 'finding:propose',
    stepUp: true,
  },
};
const SUSPENSION_RULES: Readonly<Record<string, Rule>> = {
  reinstate_finding: { from: ['open'], to: 'reinstated', permission: 'finding:publish', stepUp: true },
  reverse_finding: { from: ['open'], to: 'reversed', permission: 'finding:publish', stepUp: true },
};
const STANDING_RULES: Readonly<Record<string, Rule>> = {
  grant_standing: { from: ['in_review'], to: '', permission: 'standing:decide', stepUp: true },
  deny_standing: { from: ['in_review'], to: '', permission: 'standing:decide', stepUp: true },
};
// `to` is decided by the redress workflow for outcomes (amend stays a pending revision).
const APPEAL_RULES: Readonly<Record<string, Rule>> = {
  start_review: { from: ['submitted'], to: 'in_review', permission: 'appeal:decide', stepUp: false },
  ...STANDING_RULES,
  uphold: { from: ['in_review'], to: 'upheld', permission: 'appeal:decide', stepUp: true },
  amend: { from: ['in_review'], to: 'amended', permission: 'appeal:decide', stepUp: true },
  reverse: { from: ['in_review'], to: 'reversed', permission: 'appeal:decide', stepUp: true },
};
const RESPONSE_RULES: Readonly<Record<string, Rule>> = {
  start_review: { from: ['submitted'], to: 'in_review', permission: 'response:moderate', stepUp: false },
  ...STANDING_RULES,
  publish_response: { from: ['in_review'], to: 'published', permission: 'response:moderate', stepUp: true },
  reject_response: { from: ['in_review'], to: 'rejected', permission: 'response:moderate', stepUp: true },
};
const RULES: Readonly<Record<string, Readonly<Record<string, Rule>>>> = {
  report_review: REPORT_RULES,
  suspension_review: SUSPENSION_RULES,
  appeal_review: APPEAL_RULES,
  subject_response: RESPONSE_RULES,
};

/** Appeal reviewers see appeal cases only (ARCHITECTURE §9.2); others never exist for them. */
function visibleTypes(actor: UserActor): readonly string[] | null {
  return actor.roles.some((r) => r === 'moderator' || r === 'admin') ? null : ['appeal_review'];
}

async function loadCase(tx: Database, actor: UserActor, caseId: string, lock = false) {
  const query = tx.select().from(schema.moderationCases).where(eq(schema.moderationCases.id, caseId));
  const [c] = lock ? await query.for('update') : await query;
  const types = visibleTypes(actor);
  if (!c || (types && !types.includes(c.caseType))) throw new DomainError('not_found');
  let report: Report | undefined;
  if (c.reportId) {
    const rq = tx.select().from(schema.reports).where(eq(schema.reports.id, c.reportId));
    [report] = lock ? await rq.for('update') : await rq;
  }
  return { c, report };
}

async function subjectView(tx: Database, c: Case) {
  const a = c.subjectId ? await addressOf(tx, c.subjectId) : null;
  if (!a) throw new Error('case_subject_missing');
  return {
    subject: { kind: 'address' as const, chain: a.chain, address: a.address, displayAddress: a.address },
    chain: a.chain,
  };
}

function summaryOf(
  c: Case,
  r: Report | null | undefined,
  subject: Awaited<ReturnType<typeof subjectView>>,
  refs: Map<string, StaffRefView>,
) {
  const common = {
    id: c.id,
    ...subject,
    assignedTo: c.assignedToRef
      ? (refs.get(c.assignedToRef) ?? { id: c.assignedToRef, handle: 'Staff' })
      : null,
    slaDueAt: (c.slaDueAt ?? c.createdAt).toISOString(),
    version: c.version,
  };
  if (r)
    return {
      ...common,
      title: r.title,
      submittedAt: (r.submittedAt ?? r.createdAt).toISOString(),
      lastActivityAt: r.lastActivityAt.toISOString(),
      type: 'report_review' as const,
      status: r.status,
      category: r.category,
    };
  if (c.caseType === 'appeal_review' || c.caseType === 'subject_response')
    return {
      ...common,
      title:
        c.caseType === 'appeal_review' ? 'Appeal against a published finding' : 'Response about an address',
      submittedAt: c.createdAt.toISOString(),
      lastActivityAt: (c.closedAt ?? c.createdAt).toISOString(),
      type: c.caseType,
      status: c.status,
    };
  return {
    ...common,
    title: 'Emergency suspension review',
    submittedAt: c.createdAt.toISOString(),
    lastActivityAt: (c.closedAt ?? c.createdAt).toISOString(),
    type: 'suspension_review' as const,
    status: c.status,
  };
}

const HISTORY_ACTION: Readonly<Record<string, string>> = {
  'moderation.case.created': 'case_created',
  'moderation.case.assigned': 'case_assigned',
  'moderation.case.unassigned': 'case_unassigned',
  'moderation.case.note_added': 'case_note_added',
  'moderation.case.status_changed': 'case_status_changed',
  'moderation.case.info_requested': 'info_requested',
  'moderation.case.replied': 'case_status_changed',
};

async function detailOf(tx: Database, c: Case, r: Report | undefined) {
  const subject = await subjectView(tx, c);
  const notes = await tx
    .select()
    .from(schema.caseNotes)
    .where(eq(schema.caseNotes.caseId, c.id))
    .orderBy(asc(schema.caseNotes.at));
  const messages = await tx
    .select()
    .from(schema.caseMessages)
    .where(eq(schema.caseMessages.caseId, c.id))
    .orderBy(asc(schema.caseMessages.at));
  const audit = await tx
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.targetType, CASE_TARGET), eq(schema.auditLog.targetId, c.id)))
    .orderBy(asc(schema.auditLog.seq));
  const items = r
    ? await tx
        .select({ e: schema.evidenceItems })
        .from(schema.evidenceLinks)
        .innerJoin(schema.evidenceItems, eq(schema.evidenceItems.id, schema.evidenceLinks.evidenceItemId))
        .where(eq(schema.evidenceLinks.reportId, r.id))
    : [];
  const [reporterRef] = r
    ? await tx
        .select({ ref: schema.actorMap.actorRef })
        .from(schema.actorMap)
        .where(eq(schema.actorMap.userId, r.reporterUserId))
    : [];
  const reporter = r ? submitterPseudonym(c.id, r.reporterUserId) : '';
  const refs = await staffRefs(tx, [
    ...notes.map((n) => n.authorRef),
    ...audit.map((a) => a.actorRef),
    ...(c.assignedToRef ? [c.assignedToRef] : []),
  ]);
  const actorOf = (ref: string) =>
    ref === reporterRef?.ref
      ? { id: reporter, handle: `Reporter ${reporter}` }
      : (refs.get(ref) ?? { id: ref, handle: 'Staff' });
  const lastRequest = messages.filter((m) => m.direction === 'to_submitter').at(-1);
  const chainSlugs = new Map<string, string>();
  for (const { e } of items)
    if (e.chainId && !chainSlugs.has(e.chainId)) {
      const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.chainId, e.chainId));
      if (network) chainSlugs.set(e.chainId, network.slug);
    }
  const evidence = items.map(({ e }) => {
    const common = {
      id: e.id,
      description: (e.description ?? '').slice(0, 300),
      submittedBy: e.submittedByRef === reporterRef?.ref ? ('reporter' as const) : ('staff' as const),
      submittedAt: e.submittedAt.toISOString(),
      state: e.state,
      visibility: e.visibility,
      stateNote:
        e.kind === 'url' ? 'Stored as text and never fetched.' : 'Not yet verified against chain data.',
    };
    if (e.kind === 'transaction_ref')
      return {
        ...common,
        kind: 'transaction_ref' as const,
        chain: chainSlugs.get(e.chainId ?? ''),
        txHash: e.txHash ?? '',
        verification: 'pending' as const,
      };
    if (e.kind === 'url')
      return { ...common, kind: 'url' as const, defangedUrl: defangUrl(e.urlText ?? '').slice(0, 500) };
    return { ...common, kind: 'statement' as const, stateNote: null, text: e.statementText ?? '' };
  });
  const [decision] = await tx
    .select({ publicSummary: schema.moderationDecisions.publicSummary })
    .from(schema.moderationDecisions)
    .where(eq(schema.moderationDecisions.caseId, c.id))
    .orderBy(desc(schema.moderationDecisions.decidedAt))
    .limit(1);
  const common = {
    evidence,
    notes: notes.map((n) => ({
      id: n.id,
      author: refs.get(n.authorRef) ?? { id: n.authorRef, handle: 'Staff' },
      at: n.at.toISOString(),
      text: n.body,
    })),
    history: audit.map((a) => {
      const details = (a.details ?? {}) as Record<string, string>;
      return {
        id: a.id,
        at: a.occurredAt.toISOString(),
        actor: a.actorType === 'system' ? ('system' as const) : actorOf(a.actorRef),
        action: HISTORY_ACTION[a.action] ?? 'case_status_changed',
        caseId: c.id,
        reason: null,
        changes:
          details['from'] || details['to']
            ? [{ field: 'status', from: details['from'] ?? null, to: details['to'] ?? null }]
            : [],
      };
    }),
    assessment: null,
    submitterReason: r?.submitterReason ?? null,
    publicSummary: decision?.publicSummary ?? null,
    infoRequest: r?.status === 'needs_info' ? (lastRequest?.body ?? null) : null,
    submitterMessages: messages
      .filter((m) => m.direction === 'from_submitter')
      .map((m) => ({ at: m.at.toISOString(), text: m.body })),
  };
  if (r)
    return { ...summaryOf(c, r, subject, refs), ...common, reporterRef: reporter, narrative: r.narrative };
  const redress = await redressCaseFields(tx, c);
  if (redress)
    return {
      ...summaryOf(c, null, subject, refs),
      ...common,
      type: redress.type,
      title: redress.title,
      ...redress.fields,
    };
  return {
    ...summaryOf(c, null, subject, refs),
    ...common,
    type: 'suspension_review' as const,
    ...(await suspensionCaseFields(tx, c)),
  };
}

export interface QueueQueryInput {
  query?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  chain?: string | undefined;
  assignment: 'any' | 'mine' | 'unassigned';
  sort: 'sla_due' | 'newest' | 'last_activity';
  page: number;
}

export async function caseQueue(ctx: IdentityContext, actor: UserActor, q: QueueQueryInput) {
  requirePermission(actor, 'moderation:queue:read');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const types = visibleTypes(actor);
    const rows = await tx
      .select({
        c: schema.moderationCases,
        r: schema.reports,
        address: schema.addresses.address,
        chain: schema.chains.slug,
      })
      .from(schema.moderationCases)
      .leftJoin(schema.reports, eq(schema.reports.id, schema.moderationCases.reportId))
      .innerJoin(schema.addresses, eq(schema.addresses.subjectId, schema.moderationCases.subjectId))
      .innerJoin(schema.chains, eq(schema.chains.chainId, schema.addresses.chainId))
      .orderBy(desc(schema.moderationCases.createdAt))
      .limit(1000);
    const visible = rows.filter(({ c }) => !types || types.includes(c.caseType));
    const open = visible.filter(({ c }) => OPEN[c.caseType]?.includes(c.status));
    const refs = await staffRefs(
      tx,
      visible.map(({ c }) => c.assignedToRef).filter((r): r is string => !!r),
    );
    const items = visible.map(({ c, r, address, chain }) =>
      summaryOf(
        c,
        r,
        {
          subject: { kind: 'address', chain: chain as ChainSlug, address, displayAddress: address },
          chain: chain as ChainSlug,
        },
        refs,
      ),
    );
    const needle = q.query?.toLowerCase();
    const filtered = items.filter(
      (i) =>
        (!needle || i.title.toLowerCase().includes(needle) || i.id.includes(needle)) &&
        (!q.type || i.type === q.type) &&
        (!q.status || i.status === q.status) &&
        (!q.chain || i.chain === q.chain) &&
        (q.assignment === 'any' ||
          (q.assignment === 'mine' ? i.assignedTo?.id === actor.actorRef : i.assignedTo === null)),
    );
    // With no status filter, the queue lists open cases only.
    const listed = q.status ? filtered : filtered.filter((i) => OPEN[i.type]?.includes(i.status));
    const key = { sla_due: 'slaDueAt', newest: 'submittedAt', last_activity: 'lastActivityAt' } as const;
    listed.sort((a, b) =>
      q.sort === 'sla_due'
        ? a.slaDueAt.localeCompare(b.slaDueAt)
        : b[key[q.sort]].localeCompare(a[key[q.sort]]),
    );
    const totalPages = Math.max(1, Math.ceil(listed.length / PAGE_SIZE));
    const page = Math.min(q.page, totalPages);
    const count = (type: string, status?: string) =>
      open.filter(({ c }) => c.caseType === type && (!status || c.status === status)).length;
    return {
      counts: {
        openReports: count('report_review'),
        needsInfo: count('report_review', 'needs_info'),
        openAppeals: count('appeal_review'),
        openCorrections: count('correction_request'),
        openSuggestions: count('project_suggestion'),
        openResponses: count('subject_response'),
        openSuspensionReviews: count('suspension_review'),
        unassigned: open.filter(({ c }) => !c.assignedToRef).length,
        pendingApprovals: await pendingApprovals(tx),
      },
      items: listed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      page,
      totalItems: listed.length,
      totalPages,
    };
  });
}

export async function getCase(ctx: IdentityContext, actor: UserActor, caseId: string) {
  requirePermission(actor, 'moderation:case:read');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const { c, report } = await loadCase(tx, actor, caseId);
    return detailOf(tx, c, report);
  });
}

/** Findings whose latest revision awaits approval (contracts `queueCountsSchema`). */
async function pendingApprovals(tx: Database) {
  const rows = await tx
    .select({ id: schema.findings.id })
    .from(schema.findings)
    .where(and(eq(schema.findings.status, 'proposed')));
  const severe = await tx
    .select({ id: schema.findings.id })
    .from(schema.findings)
    .where(eq(schema.findings.status, 'pending_second_approval'));
  return rows.length + severe.length;
}

function requireVersion(c: Case, version: number) {
  if (c.version !== version)
    throw refuse(
      'conflict',
      'This case changed since you opened it. Reload to see the latest version.',
      c.version,
    );
}

async function bump(tx: Database, c: Case, set: Partial<typeof schema.moderationCases.$inferInsert> = {}) {
  await tx
    .update(schema.moderationCases)
    .set({ ...set, version: c.version + 1 })
    .where(eq(schema.moderationCases.id, c.id));
  if (c.reportId)
    await tx
      .update(schema.reports)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.reports.id, c.reportId));
}

async function reload(tx: Database, actor: UserActor, caseId: string) {
  const { c, report } = await loadCase(tx, actor, caseId);
  return detailOf(tx, c, report);
}

export async function assignCase(
  ctx: IdentityContext,
  actor: UserActor,
  caseId: string,
  version: number,
  target: { to: 'me' | 'nobody'; takeOver?: boolean | undefined },
) {
  requirePermission(actor, 'moderation:case:assign');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const { c } = await loadCase(tx, actor, caseId, true);
    requireVersion(c, version);
    if (target.to === 'me') {
      if (c.assignedToRef === actor.actorRef) return reload(tx, actor, caseId);
      if (c.assignedToRef && !target.takeOver) {
        const holder = (await staffRefs(tx, [c.assignedToRef])).get(c.assignedToRef);
        throw refuse(
          'not_eligible',
          `This case is assigned to ${holder?.handle ?? 'another reviewer'}. Confirm to take it over.`,
        );
      }
      await bump(tx, c, { assignedToRef: actor.actorRef });
      await appendAudit(tx, actor, 'moderation.case.assigned', CASE_TARGET, c.id, {
        assigneeRef: actor.actorRef,
      });
    } else {
      if (!c.assignedToRef) return reload(tx, actor, caseId);
      if (c.assignedToRef !== actor.actorRef && !actor.roles.includes('admin'))
        throw refuse('forbidden', 'Only the assigned reviewer or an administrator can unassign this case.');
      await bump(tx, c, { assignedToRef: null });
      await appendAudit(tx, actor, 'moderation.case.unassigned', CASE_TARGET, c.id, {
        previousRef: c.assignedToRef,
      });
    }
    return reload(tx, actor, caseId);
  });
}

export async function addCaseNote(
  ctx: IdentityContext,
  actor: UserActor,
  caseId: string,
  version: number,
  text: string,
) {
  requirePermission(actor, 'moderation:case:read');
  const body = text.trim();
  if (body.length < 1 || body.length > 2000)
    throw refuse('invalid_transition', 'A note needs between 1 and 2000 characters.');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const { c } = await loadCase(tx, actor, caseId, true);
    requireVersion(c, version);
    await tx.insert(schema.caseNotes).values({ caseId: c.id, authorRef: actor.actorRef, body });
    await bump(tx, c);
    await appendAudit(tx, actor, 'moderation.case.note_added', CASE_TARGET, c.id);
    return reload(tx, actor, caseId);
  });
}

/**
 * A case decision. Mutations re-check permission, state, assignment and version inside the
 * locked transaction; consequential decisions also need an action-bound step-up bound to
 * the case, the version seen and the exact decision.
 */
export async function decideCase(
  ctx: IdentityContext,
  actor: UserActor,
  caseId: string,
  version: number,
  decision: CaseDecisionInput,
  assertion?: AssertionInput,
) {
  const apply = async (tx: Database) => {
    const { c, report } = await loadCase(tx, actor, caseId, true);
    const rule = RULES[c.caseType]?.[decision.action];
    if (!rule) throw refuse('invalid_transition', 'This decision does not apply to this kind of case.');
    if (!hasPermission(actor, rule.permission))
      throw refuse('forbidden', 'Your role cannot make this decision.');
    requireVersion(c, version);
    const status = report?.status ?? c.status;
    if (!rule.from.includes(status))
      throw refuse(
        'invalid_transition',
        `A case that is “${status.replaceAll('_', ' ')}” cannot take this decision.`,
      );
    // A standing reviewer decides standing without taking the case from its assigned reviewer
    // (appeal reviewers cannot reassign cases; ARCHITECTURE §9.2).
    const standing = decision.action === 'grant_standing' || decision.action === 'deny_standing';
    if (standing) {
      // Independence and pending-claim checks run in the redress workflow.
    } else if (decision.action === 'start_review') {
      if (c.assignedToRef && c.assignedToRef !== actor.actorRef)
        throw refuse('not_eligible', 'This case is assigned to another reviewer. Take it over first.');
    } else if (c.assignedToRef !== actor.actorRef)
      throw refuse(
        'not_eligible',
        c.assignedToRef
          ? 'Only the assigned reviewer can decide this case.'
          : 'Assign the case to yourself before deciding.',
      );
    if (rule.stepUp && !assertion) throw new DomainError('stepup_required');
    const rationale = String(decision['internalRationale'] ?? '');
    if (c.caseType === 'appeal_review' || c.caseType === 'subject_response') {
      const to = await decideRedress(tx, actor, c, decision, assertion?.challengeId ?? null);
      if (to === null) {
        await bump(tx, c);
        await appendAudit(tx, actor, 'moderation.case.standing_decided', CASE_TARGET, c.id, {
          outcome: decision.action === 'grant_standing' ? 'granted' : 'denied',
        });
        return reload(tx, actor, caseId);
      }
      const closed = to !== 'in_review';
      await syncRedressStatus(tx, c, to);
      await tx
        .update(schema.moderationCases)
        .set({
          status: to,
          version: c.version + 1,
          ...(closed ? { closedAt: new Date() } : { assignedToRef: actor.actorRef }),
        })
        .where(eq(schema.moderationCases.id, c.id));
      await appendAudit(tx, actor, 'moderation.case.status_changed', CASE_TARGET, c.id, {
        from: c.status,
        to,
      });
      return reload(tx, actor, caseId);
    }
    if (c.caseType === 'suspension_review') {
      const publicSummary = String(decision['publicSummary'] ?? '');
      await decideSuspension(
        tx,
        actor,
        c,
        decision.action as 'reinstate_finding' | 'reverse_finding',
        { publicSummary, internalRationale: rationale },
        assertion?.challengeId ?? '',
      );
      await tx
        .update(schema.moderationCases)
        .set({ status: rule.to, version: c.version + 1, closedAt: new Date() })
        .where(eq(schema.moderationCases.id, c.id));
      await appendAudit(tx, actor, 'moderation.case.status_changed', CASE_TARGET, c.id, {
        from: c.status,
        to: rule.to,
      });
      return reload(tx, actor, caseId);
    }
    if (!report) throw new Error('report_case_without_report');
    if (decision.action === 'start_review') {
      if (!c.assignedToRef)
        await appendAudit(tx, actor, 'moderation.case.assigned', CASE_TARGET, c.id, {
          assigneeRef: actor.actorRef,
        });
      await moveReport(tx, actor, c, report, rule.to, 'moderation.case.status_changed', {
        assignedToRef: actor.actorRef,
      });
    } else if (decision.action === 'request_info') {
      const message = String(decision['messageToSubmitter'] ?? '');
      await tx
        .insert(schema.caseMessages)
        .values({ caseId: c.id, direction: 'to_submitter', authorRef: actor.actorRef, body: message });
      await moveReport(tx, actor, c, report, rule.to, 'moderation.case.info_requested');
    } else {
      // Acceptance authors revision 1 of a finding; nothing is public until approved (§4.2).
      const findingId =
        decision.action === 'accept_report'
          ? await createFindingFromReport(
              tx,
              actor,
              { caseId: c.id, reportId: report.id, subjectId: c.subjectId ?? '', category: report.category },
              {
                severity: String(decision['severity']) as Severity,
                publicSummary: String(decision['publicSummary'] ?? ''),
                internalRationale: rationale,
              },
            )
          : null;
      await tx.insert(schema.moderationDecisions).values({
        caseId: c.id,
        decisionType: 'report_outcome',
        findingId,
        outcome: rule.to,
        rationaleInternal: rationale,
        publicSummary: decision.action === 'accept_report' ? String(decision['publicSummary'] ?? '') : null,
        policyVersion: POLICY_VERSION,
        decidedByRef: actor.actorRef,
        stepupChallengeId: assertion?.challengeId ?? null,
      });
      // An abusive report gets no reason text: the member sees "Not accepted" only.
      const reason = decision.action === 'reject_report' ? String(decision['reason'] ?? '') : undefined;
      await moveReport(
        tx,
        actor,
        c,
        report,
        rule.to,
        'moderation.case.status_changed',
        reason ? { submitterReason: reason } : {},
      );
      if (findingId)
        await tx.update(schema.moderationCases).set({ findingId }).where(eq(schema.moderationCases.id, c.id));
    }
    return reload(tx, actor, caseId);
  };
  if (!assertion)
    return ctx.runtime.transaction(async (tx) => {
      await lockActor(tx, actor);
      return apply(tx);
    });
  return withStepup(
    ctx,
    actor,
    {
      action: `case.${decision.action}`,
      targetType: 'case',
      targetId: caseId,
      parameters: { version, decision },
    },
    assertion,
    (tx) => apply(tx),
  );
}
