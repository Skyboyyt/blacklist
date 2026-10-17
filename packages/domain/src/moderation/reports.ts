import { schema, eq, and, asc, desc, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { notify } from '../notifications/service.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { addressSubject, addressOf, type ChainSlug } from './subjects.ts';
import { defangUrl, REPORT_STATUS_LABEL, OPEN_REPORT_STATUSES } from './labels.ts';
import {
  ownedRedress,
  redressDetail,
  listOwnRedress,
  withdrawRedress,
  replyAfterDeniedStanding,
} from './redress.ts';
import {
  ownedProjectSubmission,
  projectSubmissionDetail,
  listOwnProjectSubmissions,
  replyToSuggestion,
} from '../projects/submissions.ts';
import { linkImagesToReport } from '../evidence/uploads.ts';

// Reports are private to the reporter and staff and change nothing public while
// unreviewed (moderation §10; AGENTS §5.7). Member views carry no staff identities.

const REPORT_SLA_MS = 4 * 86400_000;
const CASE_TARGET = 'moderation_case';

export interface ReportInput {
  category: string;
  title: string;
  subjects: readonly { chain: ChainSlug; address: string }[];
  narrative: string;
  incidentDate: string;
  lossAmount?: string | undefined;
  lossAsset?: string | undefined;
  txRefs: readonly { chain: ChainSlug; hash: string }[];
  urls: readonly string[];
  /** Images the member uploaded first (Phase 9b); only their ids are trusted. */
  evidence: readonly { id: string }[];
}

const IMAGES_UNAVAILABLE =
  'Image evidence is not available yet. Submit without images; you can describe them in the narrative.';

/** Replies to information requests do not take images yet (Phase 9b covers new reports). */
function noImages(evidence: readonly unknown[]) {
  if (evidence.length) throw refuse('evidence_unavailable', IMAGES_UNAVAILABLE);
}

export async function submitReport(
  ctx: IdentityContext,
  actor: UserActor,
  input: ReportInput,
  prefix: string,
  options: { images: boolean } = { images: false },
) {
  requirePermission(actor, 'report:create');
  if (!options.images) noImages(input.evidence);
  const [first] = input.subjects;
  if (!first) throw new DomainError('invalid_request');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await ctx.throttle.requestLimit(tx, 'report.submit', actor.userId, prefix, 10, 86400);
    const now = new Date();
    const [report] = await tx
      .insert(schema.reports)
      .values({
        reporterUserId: actor.userId,
        category: input.category,
        title: input.title,
        narrative: input.narrative,
        incidentAt: new Date(`${input.incidentDate}T00:00:00Z`),
        lossAmountRaw: input.lossAmount ?? null,
        lossAsset: input.lossAmount ? (input.lossAsset ?? null) : null,
        status: 'queued',
        submittedAt: now,
      })
      .returning();
    if (!report) throw new Error('report_creation_failed');
    await tx
      .insert(schema.reportStatusHistory)
      .values({ reportId: report.id, toStatus: 'queued', revision: 1, actorRef: actor.actorRef });
    const seen = new Set<string>();
    let primary: string | undefined;
    for (const subject of input.subjects) {
      const { subjectId } = await addressSubject(tx, subject.chain, subject.address);
      if (seen.has(subjectId)) continue;
      seen.add(subjectId);
      primary ??= subjectId;
      await tx
        .insert(schema.reportSubjects)
        .values({ reportId: report.id, subjectId, role: subjectId === primary ? 'primary' : 'related' });
    }
    await linkImagesToReport(
      tx,
      actor,
      report.id,
      input.evidence.map((e) => e.id),
      options.images,
    );
    const evidence = [
      ...input.txRefs.map((t) => ({
        kind: 'transaction_ref',
        chainSlug: t.chain,
        txHash: t.chain === 'ethereum' ? t.hash.toLowerCase() : t.hash,
        description: 'Transaction reference from the reporter',
      })),
      ...input.urls.map((u) => ({ kind: 'url', urlText: u, description: 'Link from the reporter' })),
    ];
    for (const item of evidence) {
      let chainId: string | null = null;
      if ('chainSlug' in item) {
        const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.slug, item.chainSlug));
        if (!network) throw new DomainError('invalid_request');
        chainId = network.chainId;
      }
      const [row] = await tx
        .insert(schema.evidenceItems)
        .values({
          kind: item.kind,
          submittedByUserId: actor.userId,
          submittedByRef: actor.actorRef,
          description: item.description,
          chainId,
          txHash: 'txHash' in item ? item.txHash : null,
          urlText: 'urlText' in item ? item.urlText : null,
          state: 'available',
        })
        .returning();
      if (!row) throw new Error('evidence_creation_failed');
      await tx
        .insert(schema.evidenceLinks)
        .values({ evidenceItemId: row.id, reportId: report.id, linkedByRef: actor.actorRef });
      await tx
        .insert(schema.evidenceCustodyEvents)
        .values({ evidenceItemId: row.id, event: 'submitted', actorRef: actor.actorRef });
    }
    const [created] = await tx
      .insert(schema.moderationCases)
      .values({
        caseType: 'report_review',
        subjectId: primary ?? null,
        reportId: report.id,
        status: 'queued',
        slaDueAt: new Date(now.getTime() + REPORT_SLA_MS),
      })
      .returning();
    if (!created) throw new Error('case_creation_failed');
    await appendAudit(tx, actor, 'moderation.case.created', CASE_TARGET, created.id);
    await notify(tx, actor.userId, 'submission_received', '0', { caseId: created.id });
    return { id: created.id };
  });
}

async function ownedCase(tx: Database, actor: UserActor, caseId: string, lock = false) {
  const query = tx
    .select({ c: schema.moderationCases, r: schema.reports })
    .from(schema.moderationCases)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.moderationCases.reportId))
    .where(and(eq(schema.moderationCases.id, caseId), eq(schema.reports.reporterUserId, actor.userId)));
  const [row] = lock ? await query.for('update') : await query;
  // Another member's report is indistinguishable from a missing one (ARCHITECTURE §9.1).
  if (!row) throw new DomainError('not_found');
  return row;
}

function summary(c: typeof schema.moderationCases.$inferSelect, r: typeof schema.reports.$inferSelect) {
  return {
    id: c.id,
    kind: 'report' as const,
    title: r.title,
    status: REPORT_STATUS_LABEL[r.status] ?? r.status,
    submittedAt: (r.submittedAt ?? r.createdAt).toISOString(),
    updatedAt: r.lastActivityAt.toISOString(),
    needsAction: r.status === 'needs_info',
  };
}

async function detail(
  tx: Database,
  c: typeof schema.moderationCases.$inferSelect,
  r: typeof schema.reports.$inferSelect,
) {
  const subjects = await tx
    .select()
    .from(schema.reportSubjects)
    .where(eq(schema.reportSubjects.reportId, r.id));
  const addresses = [];
  for (const s of subjects.sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0))) {
    const a = await addressOf(tx, s.subjectId);
    if (a) addresses.push(`${a.chain}: ${a.address}`);
  }
  const items = await tx
    .select({ e: schema.evidenceItems })
    .from(schema.evidenceLinks)
    .innerJoin(schema.evidenceItems, eq(schema.evidenceItems.id, schema.evidenceLinks.evidenceItemId))
    .where(eq(schema.evidenceLinks.reportId, r.id));
  const history = await tx
    .select()
    .from(schema.reportStatusHistory)
    .where(eq(schema.reportStatusHistory.reportId, r.id))
    .orderBy(asc(schema.reportStatusHistory.revision));
  const messages = await tx
    .select()
    .from(schema.caseMessages)
    .where(eq(schema.caseMessages.caseId, c.id))
    .orderBy(asc(schema.caseMessages.at));
  const timeline: { at: string; label: string }[] = [];
  for (const h of history) {
    if (h.fromStatus === null) timeline.push({ at: h.at.toISOString(), label: 'Submitted' });
    else if (h.toStatus === 'needs_info')
      timeline.push({ at: h.at.toISOString(), label: 'Staff asked for more information' });
    else
      timeline.push({
        at: h.at.toISOString(),
        label: `Status: ${REPORT_STATUS_LABEL[h.toStatus] ?? h.toStatus}`,
      });
  }
  for (const m of messages.filter((m) => m.direction === 'from_submitter'))
    timeline.push({ at: m.at.toISOString(), label: 'You replied' });
  timeline.sort((a, b) => a.at.localeCompare(b.at));
  const lastRequest = messages.filter((m) => m.direction === 'to_submitter').at(-1);
  const details = [
    { label: addresses.length > 1 ? 'Subjects' : 'Subject', value: addresses.join('\n') },
    { label: 'What happened', value: r.narrative },
    ...(r.incidentAt ? [{ label: 'Incident date', value: r.incidentAt.toISOString().slice(0, 10) }] : []),
    ...(r.lossAmountRaw
      ? [{ label: 'Reported loss', value: `${r.lossAmountRaw} ${r.lossAsset ?? ''}`.trim() }]
      : []),
    ...items
      .filter(({ e }) => e.kind === 'transaction_ref')
      .map(({ e }) => ({ label: 'Transaction', value: e.txHash ?? '' })),
    ...items
      .filter(({ e }) => e.kind === 'url')
      .map(({ e }) => ({ label: 'Link (never opened by Blacklist)', value: defangUrl(e.urlText ?? '') })),
  ];
  const open = OPEN_REPORT_STATUSES.includes(r.status);
  // The public result exists only once the finding is published (never before approval).
  let publicOutcome: string | null = null;
  let publicLink: string | null = null;
  if (c.findingId) {
    const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, c.findingId));
    if (f?.status === 'published' && f.publishedRevisionId) {
      const [rev] = await tx
        .select({ summary: schema.findingRevisions.publicSummary })
        .from(schema.findingRevisions)
        .where(eq(schema.findingRevisions.id, f.publishedRevisionId));
      const subject = await addressOf(tx, f.subjectId);
      publicOutcome = rev?.summary ?? null;
      publicLink = subject ? `/address/${subject.chain}/${subject.address}` : null;
    }
  }
  return {
    ...summary(c, r),
    version: c.version,
    details,
    evidenceNames: [],
    timeline,
    infoRequest: r.status === 'needs_info' ? (lastRequest?.body ?? null) : null,
    submitterReason: r.submitterReason,
    publicOutcome,
    publicLink,
    canRespond: r.status === 'needs_info',
    canWithdraw: open,
  };
}

export async function listOwnSubmissions(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'report:read:own');
  const rows = await ctx.runtime.db
    .select({ c: schema.moderationCases, r: schema.reports })
    .from(schema.moderationCases)
    .innerJoin(schema.reports, eq(schema.reports.id, schema.moderationCases.reportId))
    .where(eq(schema.reports.reporterUserId, actor.userId))
    .orderBy(desc(schema.reports.lastActivityAt))
    .limit(200);
  const all = [
    ...rows.map(({ c, r }) => summary(c, r)),
    ...(await listOwnRedress(ctx.runtime.db, actor)),
    ...(await listOwnProjectSubmissions(ctx.runtime.db, actor)),
  ];
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getOwnSubmission(ctx: IdentityContext, actor: UserActor, caseId: string) {
  requirePermission(actor, 'report:read:own');
  return ctx.runtime.transaction(async (tx) => {
    const redress = await ownedRedress(tx, actor, caseId);
    if (redress) return redressDetail(tx, redress);
    const project = await ownedProjectSubmission(tx, actor, caseId);
    if (project) return projectSubmissionDetail(tx, project);
    const { c, r } = await ownedCase(tx, actor, caseId);
    return detail(tx, c, r);
  });
}

/** One locked status change on a report and its case, with history and audit. */
export async function moveReport(
  tx: Database,
  actor: Parameters<typeof appendAudit>[1],
  c: typeof schema.moderationCases.$inferSelect,
  r: typeof schema.reports.$inferSelect,
  to: string,
  audit: 'moderation.case.status_changed' | 'moderation.case.info_requested' | 'moderation.case.replied',
  extra: { submitterReason?: string; note?: string; assignedToRef?: string | null } = {},
) {
  const now = new Date();
  const decided = ['accepted', 'rejected', 'rejected_abusive', 'withdrawn'].includes(to);
  await tx
    .update(schema.reports)
    .set({
      status: to,
      revision: r.revision + 1,
      lastActivityAt: now,
      ...(decided ? { decidedAt: now } : {}),
      ...(extra.submitterReason ? { submitterReason: extra.submitterReason } : {}),
    })
    .where(eq(schema.reports.id, r.id));
  await tx.insert(schema.reportStatusHistory).values({
    reportId: r.id,
    fromStatus: r.status,
    toStatus: to,
    revision: r.revision + 1,
    actorRef: actor.actorRef,
    note: extra.note ?? null,
  });
  await tx
    .update(schema.moderationCases)
    .set({
      status: to,
      version: c.version + 1,
      ...(decided ? { closedAt: now } : {}),
      ...(extra.assignedToRef !== undefined ? { assignedToRef: extra.assignedToRef } : {}),
    })
    .where(eq(schema.moderationCases.id, c.id));
  await appendAudit(tx, actor, audit, CASE_TARGET, c.id, { from: r.status, to });
}

function requireVersion(c: typeof schema.moderationCases.$inferSelect, version: number) {
  if (c.version !== version)
    throw refuse(
      'conflict',
      'This submission changed since you opened it. Reload to see the latest status.',
      c.version,
    );
}

export async function withdrawOwnSubmission(
  ctx: IdentityContext,
  actor: UserActor,
  caseId: string,
  version: number,
) {
  requirePermission(actor, 'report:read:own');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const redress = await ownedRedress(tx, actor, caseId, true);
    if (redress) {
      requireVersion(redress.c, version);
      await withdrawRedress(tx, actor, redress);
      const fresh = await ownedRedress(tx, actor, caseId);
      if (!fresh) throw new Error('redress_missing');
      return redressDetail(tx, fresh);
    }
    const { c, r } = await ownedCase(tx, actor, caseId, true);
    requireVersion(c, version);
    if (!OPEN_REPORT_STATUSES.includes(r.status))
      throw refuse(
        'invalid_transition',
        'A decision was already recorded, so this can no longer be withdrawn.',
      );
    await moveReport(tx, actor, c, r, 'withdrawn', 'moderation.case.status_changed');
    const fresh = await ownedCase(tx, actor, caseId);
    return detail(tx, fresh.c, fresh.r);
  });
}

export async function respondToInfoRequest(
  ctx: IdentityContext,
  actor: UserActor,
  caseId: string,
  version: number,
  input: { message: string; evidence: readonly unknown[] },
) {
  requirePermission(actor, 'report:read:own');
  noImages(input.evidence);
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const redress = await ownedRedress(tx, actor, caseId, true);
    if (redress) {
      requireVersion(redress.c, version);
      await replyAfterDeniedStanding(tx, actor, redress, input.message);
      const fresh = await ownedRedress(tx, actor, caseId);
      if (!fresh) throw new Error('redress_missing');
      return redressDetail(tx, fresh);
    }
    const project = await ownedProjectSubmission(tx, actor, caseId, true);
    if (project) {
      requireVersion(project.c, version);
      await replyToSuggestion(tx, actor, project, input.message);
      const fresh = await ownedProjectSubmission(tx, actor, caseId);
      if (!fresh) throw new Error('project_submission_missing');
      return projectSubmissionDetail(tx, fresh);
    }
    const { c, r } = await ownedCase(tx, actor, caseId, true);
    requireVersion(c, version);
    if (r.status !== 'needs_info')
      throw refuse('invalid_transition', 'Staff are not waiting for information on this submission.');
    await tx
      .insert(schema.caseMessages)
      .values({ caseId: c.id, direction: 'from_submitter', authorRef: actor.actorRef, body: input.message });
    await moveReport(tx, actor, c, r, 'in_review', 'moderation.case.replied');
    const fresh = await ownedCase(tx, actor, caseId);
    return detail(tx, fresh.c, fresh.r);
  });
}
