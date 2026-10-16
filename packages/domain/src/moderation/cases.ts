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

// Staff case workflow (moderation design; contracts moderation.ts). Phase 9a slice 2 runs
// report_review cases; other case types arrive with their slices.

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
/** Report decisions in this slice. `accept_report` creates a finding and arrives with slice 3. */
const REPORT_RULES: Readonly<Record<string, Rule>> = {
  start_review: { from: ['queued'], to: 'in_review', permission: 'finding:propose', stepUp: false },
  request_info: { from: ['in_review'], to: 'needs_info', permission: 'finding:propose', stepUp: false },
  reject_report: { from: ['in_review'], to: 'rejected', permission: 'finding:propose', stepUp: true },
  reject_abusive: {
    from: ['in_review'],
    to: 'rejected_abusive',
    permission: 'finding:propose',
    stepUp: true,
  },
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
  r: Report,
  subject: Awaited<ReturnType<typeof subjectView>>,
  refs: Map<string, StaffRefView>,
) {
  return {
    id: c.id,
    ...subject,
    title: r.title,
    assignedTo: c.assignedToRef
      ? (refs.get(c.assignedToRef) ?? { id: c.assignedToRef, handle: 'Staff' })
      : null,
    submittedAt: (r.submittedAt ?? r.createdAt).toISOString(),
    lastActivityAt: r.lastActivityAt.toISOString(),
    slaDueAt: (c.slaDueAt ?? r.createdAt).toISOString(),
    version: c.version,
    type: 'report_review' as const,
    status: r.status,
    category: r.category,
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

async function detailOf(tx: Database, c: Case, r: Report) {
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
  const items = await tx
    .select({ e: schema.evidenceItems })
    .from(schema.evidenceLinks)
    .innerJoin(schema.evidenceItems, eq(schema.evidenceItems.id, schema.evidenceLinks.evidenceItemId))
    .where(eq(schema.evidenceLinks.reportId, r.id));
  const [reporterRef] = await tx
    .select({ ref: schema.actorMap.actorRef })
    .from(schema.actorMap)
    .where(eq(schema.actorMap.userId, r.reporterUserId));
  const reporter = submitterPseudonym(c.id, r.reporterUserId);
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
  return {
    ...summaryOf(c, r, subject, refs),
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
    submitterReason: r.submitterReason,
    publicSummary: null,
    infoRequest: r.status === 'needs_info' ? (lastRequest?.body ?? null) : null,
    submitterMessages: messages
      .filter((m) => m.direction === 'from_submitter')
      .map((m) => ({ at: m.at.toISOString(), text: m.body })),
    reporterRef: reporter,
    narrative: r.narrative,
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
      .innerJoin(schema.reports, eq(schema.reports.id, schema.moderationCases.reportId))
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
        pendingApprovals: 0,
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
    if (!report) throw new DomainError('not_found');
    return detailOf(tx, c, report);
  });
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
  if (!report) throw new DomainError('not_found');
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
  const rule = REPORT_RULES[decision.action];
  if (!rule) {
    if (decision.action === 'accept_report')
      throw refuse('invalid_transition', 'Accepting a report creates a finding, which is not available yet.');
    throw refuse('invalid_transition', 'This decision does not apply to this kind of case.');
  }
  if (!hasPermission(actor, rule.permission))
    throw refuse('forbidden', 'Your role cannot make this decision.');
  const apply = async (tx: Database) => {
    const { c, report } = await loadCase(tx, actor, caseId, true);
    if (c.caseType !== 'report_review' || !report)
      throw refuse('invalid_transition', 'This decision does not apply to this kind of case.');
    requireVersion(c, version);
    if (!rule.from.includes(report.status))
      throw refuse(
        'invalid_transition',
        `A case that is “${report.status.replaceAll('_', ' ')}” cannot take this decision.`,
      );
    if (decision.action === 'start_review') {
      if (c.assignedToRef && c.assignedToRef !== actor.actorRef)
        throw refuse('not_eligible', 'This case is assigned to another reviewer. Take it over first.');
    } else if (c.assignedToRef !== actor.actorRef)
      throw refuse(
        'not_eligible',
        c.assignedToRef
          ? 'Only the assigned reviewer can decide this case.'
          : 'Assign the case to yourself before deciding.',
      );
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
      const rationale = String(decision['internalRationale'] ?? '');
      // An abusive report gets no reason text: the member sees "Not accepted" only.
      const reason = decision.action === 'reject_report' ? String(decision['reason'] ?? '') : undefined;
      await tx.insert(schema.moderationDecisions).values({
        caseId: c.id,
        decisionType: 'report_outcome',
        outcome: rule.to,
        rationaleInternal: rationale,
        policyVersion: '2026-10',
        decidedByRef: actor.actorRef,
        stepupChallengeId: assertion?.challengeId ?? null,
      });
      await moveReport(
        tx,
        actor,
        c,
        report,
        rule.to,
        'moderation.case.status_changed',
        reason ? { submitterReason: reason } : {},
      );
    }
    return reload(tx, actor, caseId);
  };
  if (!rule.stepUp)
    return ctx.runtime.transaction(async (tx) => {
      await lockActor(tx, actor);
      return apply(tx);
    });
  if (!assertion) throw new DomainError('stepup_required');
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
