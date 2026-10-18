import { onFindingChanged } from '../risk/service.ts';
import { onDelegateFindingChanged } from '../risk/feeders.ts';
import { schema, ne, eq, and, asc, desc, inArray, isNull, or, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { hasPermission, requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import { canonicalJson, digest } from '../shared/crypto.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { withStepup, type AssertionInput } from '../staff/webauthn.ts';
import { notifyAdmins, type Client } from '../staff/common.ts';
import { addressOf } from './subjects.ts';
import { staffRefs } from './refs.ts';

// Findings, revisions, approval and system publication (moderation design §2–§5, §8).

export const POLICY_VERSION = '2026-10';
const SYSTEM = {
  kind: 'system' as const,
  actorRef: 'moderation.publication',
  jobKind: 'moderation.publication',
};
const SUSPENSION_REVIEW_MS = 72 * 3600_000;
type Finding = typeof schema.findings.$inferSelect;
type Revision = typeof schema.findingRevisions.$inferSelect;
export type Severity = 'low' | 'medium' | 'high' | 'severe';

/** SHA-256 over the canonical JSON of every asserted field (moderation §2). */
export function revisionHash(r: Omit<Revision, 'id' | 'contentHash' | 'createdAt' | 'sourceCaseId'>) {
  return digest(
    canonicalJson({
      findingId: r.findingId,
      revisionNumber: r.revisionNumber,
      authorRef: r.authorRef,
      subjectId: r.subjectId,
      findingType: r.findingType,
      severity: r.severity,
      publicSummary: r.publicSummary,
      internalRationale: r.internalRationale,
      evidenceSet: r.evidenceSet,
      linkedFactorCodes: r.linkedFactorCodes,
      policyVersion: r.policyVersion,
    }),
  );
}

/** Non-image evidence has no stored object; its hash covers the item's recorded content. */
export function evidenceHash(e: typeof schema.evidenceItems.$inferSelect) {
  return digest(
    canonicalJson({
      kind: e.kind,
      chainId: e.chainId,
      txHash: e.txHash,
      address: e.address,
      urlText: e.urlText,
      statementText: e.statementText,
    }),
  );
}

async function insertRevision(tx: Database, fields: Omit<Revision, 'id' | 'contentHash' | 'createdAt'>) {
  const contentHash = revisionHash(fields);
  const [row] = await tx
    .insert(schema.findingRevisions)
    .values({ ...fields, contentHash })
    .returning();
  if (!row) throw new Error('revision_creation_failed');
  const items = (fields.evidenceSet as { itemId: string }[]).map((e) => e.itemId);
  for (const evidenceItemId of items)
    await tx
      .insert(schema.evidenceLinks)
      .values({ evidenceItemId, findingRevisionId: row.id, linkedByRef: fields.authorRef });
  return row;
}

async function revisionsOf(tx: Database, findingId: string) {
  return tx
    .select()
    .from(schema.findingRevisions)
    .where(eq(schema.findingRevisions.findingId, findingId))
    .orderBy(asc(schema.findingRevisions.revisionNumber));
}

async function lockFinding(tx: Database, findingId: string) {
  const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, findingId)).for('update');
  if (!f) throw new DomainError('not_found');
  return f;
}

/** Status change with history; any change of the finding's public state also updates its risk signals. */
export async function setStatus(
  tx: Database,
  f: Finding,
  to: string,
  set: Partial<typeof schema.findings.$inferInsert>,
  link: { decisionId?: string; publicationEventId?: string; publicNote?: string } = {},
) {
  await tx
    .update(schema.findings)
    .set({ ...set, status: to, statusRevision: f.statusRevision + 1 })
    .where(eq(schema.findings.id, f.id));
  await tx.insert(schema.findingStatusHistory).values({
    findingId: f.id,
    fromStatus: f.status,
    toStatus: to,
    statusRevision: f.statusRevision + 1,
    decisionId: link.decisionId ?? null,
    publicationEventId: link.publicationEventId ?? null,
    publicNote: link.publicNote ?? null,
  });
  await onFindingChanged(tx, f.id, `finding.${to}`, { decisionId: link.decisionId, toStatus: to });
  // Wallets delegating to this address lose their automatic signal once it is unflagged (ADR 0021).
  const subject = await addressOf(tx, f.subjectId);
  if (subject) await onDelegateFindingChanged(tx, subject.chain, subject.address);
}

/** Authors, approvers and suspension/reversal actors of a finding (moderation §1). */
export async function participants(tx: Database, findingId: string) {
  const out = new Set<string>();
  for (const r of await revisionsOf(tx, findingId)) out.add(r.authorRef);
  const approvals = await tx
    .select({ ref: schema.findingApprovalEvents.approverRef })
    .from(schema.findingApprovalEvents)
    .where(
      and(
        eq(schema.findingApprovalEvents.findingId, findingId),
        eq(schema.findingApprovalEvents.event, 'approve'),
      ),
    );
  for (const a of approvals) out.add(a.ref);
  const decisions = await tx
    .select({ ref: schema.moderationDecisions.decidedByRef })
    .from(schema.moderationDecisions)
    .where(
      and(
        eq(schema.moderationDecisions.findingId, findingId),
        // Upholding an appeal is review, not authorship; amendments and reversals still count.
        ne(schema.moderationDecisions.decisionType, 'appeal_outcome'),
      ),
    );
  for (const d of decisions) out.add(d.ref);
  return out;
}

/** Recorded conflicts (moderation §7.2) for the finding or its subject. */
export async function conflicted(
  tx: Database,
  actorRef: string,
  f: { id: string | null; subjectId: string },
) {
  const rows = await tx
    .select({ id: schema.staffConflicts.id })
    .from(schema.staffConflicts)
    .where(
      and(
        eq(schema.staffConflicts.staffRef, actorRef),
        isNull(schema.staffConflicts.revokedAt),
        f.id
          ? or(eq(schema.staffConflicts.findingId, f.id), eq(schema.staffConflicts.subjectId, f.subjectId))
          : eq(schema.staffConflicts.subjectId, f.subjectId),
      ),
    );
  return rows.length > 0;
}

async function publishedRevision(tx: Database, f: Finding) {
  if (!f.publishedRevisionId) return null;
  const [r] = await tx
    .select()
    .from(schema.findingRevisions)
    .where(eq(schema.findingRevisions.id, f.publishedRevisionId));
  return r ?? null;
}

async function causingApproval(tx: Database, revisionId: string) {
  const [row] = await tx
    .select({ a: schema.findingApprovalEvents })
    .from(schema.findingPublicationEvents)
    .innerJoin(
      schema.findingApprovalEvents,
      eq(schema.findingApprovalEvents.id, schema.findingPublicationEvents.causeApprovalEventId),
    )
    .where(eq(schema.findingPublicationEvents.revisionId, revisionId))
    .orderBy(desc(schema.findingPublicationEvents.at))
    .limit(1);
  return row?.a ?? null;
}

/** Report acceptance (moderation §10): staff author revision 1 of a new finding. */
export async function createFindingFromReport(
  tx: Database,
  actor: UserActor,
  source: { caseId: string; reportId: string; subjectId: string; category: string },
  draft: { severity: Severity; publicSummary: string; internalRationale: string },
) {
  if (await conflicted(tx, actor.actorRef, { id: null, subjectId: source.subjectId }))
    throw refuse('not_eligible', 'You recorded a conflict of interest for this subject.');
  const items = await tx
    .select({ e: schema.evidenceItems })
    .from(schema.evidenceLinks)
    .innerJoin(schema.evidenceItems, eq(schema.evidenceItems.id, schema.evidenceLinks.evidenceItemId))
    .where(and(eq(schema.evidenceLinks.reportId, source.reportId), isNull(schema.evidenceLinks.unlinkedAt)));
  const [f] = await tx
    .insert(schema.findings)
    .values({
      subjectId: source.subjectId,
      status: draft.severity === 'severe' ? 'pending_second_approval' : 'proposed',
    })
    .returning();
  if (!f) throw new Error('finding_creation_failed');
  const revision = await insertRevision(tx, {
    findingId: f.id,
    revisionNumber: 1,
    authorRef: actor.actorRef,
    subjectId: source.subjectId,
    findingType: source.category,
    severity: draft.severity,
    publicSummary: draft.publicSummary,
    internalRationale: draft.internalRationale,
    evidenceSet: items.map(({ e }) => ({ itemId: e.id, kind: e.kind, sha256: evidenceHash(e) })),
    linkedFactorCodes: [`finding.${draft.severity}`],
    policyVersion: POLICY_VERSION,
    sourceCaseId: source.caseId,
  });
  await tx
    .update(schema.findings)
    .set({ currentRevisionId: revision.id })
    .where(eq(schema.findings.id, f.id));
  await tx
    .insert(schema.findingStatusHistory)
    .values({ findingId: f.id, toStatus: f.status, statusRevision: 1 });
  await appendAudit(tx, actor, 'finding.created', 'finding', f.id, {
    revisionNumber: 1,
    severity: draft.severity,
  });
  return f.id;
}

async function approvalEvents(tx: Database, findingId: string) {
  return tx
    .select()
    .from(schema.findingApprovalEvents)
    .where(eq(schema.findingApprovalEvents.findingId, findingId))
    .orderBy(asc(schema.findingApprovalEvents.at));
}

/** Status of each revision as staff see it (contracts `findingRevisionSchema.status`). */
async function revisionViews(tx: Database, f: Finding) {
  const revisions = await revisionsOf(tx, f.id);
  const events = await approvalEvents(tx, f.id);
  const published = await publishedRevision(tx, f);
  const refs = await staffRefs(
    tx,
    revisions.map((r) => r.authorRef),
  );
  const subject = await addressOf(tx, f.subjectId);
  if (!subject) throw new Error('finding_subject_missing');
  const latest = revisions.at(-1);
  return revisions.map((r) => {
    const last = events.filter((e) => e.revisionId === r.id).at(-1);
    const status =
      f.publishedRevisionId === r.id
        ? 'published'
        : r !== latest || (published && published.revisionNumber > r.revisionNumber)
          ? 'superseded'
          : last?.event === 'reject'
            ? 'rejected'
            : r.severity === 'severe' || published?.severity === 'severe'
              ? 'pending_second_approval'
              : 'proposed';
    return {
      findingId: f.id,
      revisionNumber: r.revisionNumber,
      subject: {
        kind: 'address' as const,
        chain: subject.chain,
        address: subject.address,
        displayAddress: subject.address,
      },
      severity: r.severity as Severity,
      publicSummary: r.publicSummary,
      internalRationale: r.internalRationale,
      evidenceIds: (r.evidenceSet as { itemId: string }[]).map((e) => e.itemId),
      author: refs.get(r.authorRef) ?? { id: r.authorRef, handle: 'Staff' },
      createdAt: r.createdAt.toISOString(),
      contentHash: r.contentHash,
      status: status as 'proposed' | 'pending_second_approval' | 'published' | 'rejected' | 'superseded',
      isLatest: r === latest,
      sourceCaseId: r.sourceCaseId,
    };
  });
}

/** Revisions for the approvals screen: every revision of findings that still have one pending. */
export async function listRevisions(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'finding:publish');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const findings = await tx
      .select()
      .from(schema.findings)
      .where(inArray(schema.findings.status, ['proposed', 'pending_second_approval', 'published']))
      .orderBy(desc(schema.findings.createdAt))
      .limit(200);
    const out = [];
    for (const f of findings) {
      const views = await revisionViews(tx, f);
      if (views.some((v) => v.isLatest && v.status !== 'published' && v.status !== 'rejected'))
        out.push(...views);
    }
    return out;
  });
}

/**
 * Approve-and-publish (moderation §4.2): one transaction, finding row locked, every check
 * re-run, then the approval event and the system publication it causes.
 */
export async function approveRevision(
  ctx: IdentityContext,
  actor: UserActor,
  findingId: string,
  revisionNumber: number,
  contentHash: string,
  assertion?: AssertionInput,
) {
  requirePermission(actor, 'finding:publish');
  if (!assertion) throw new DomainError('stepup_required');
  return withStepup(
    ctx,
    actor,
    {
      action: 'finding.approve',
      targetType: 'finding',
      targetId: findingId,
      parameters: { revisionNumber, contentHash },
    },
    assertion,
    async (tx) => {
      const f = await lockFinding(tx, findingId);
      const revisions = await revisionsOf(tx, f.id);
      const latest = revisions.at(-1);
      const target = revisions.find((r) => r.revisionNumber === revisionNumber);
      if (!target) throw new DomainError('not_found');
      if (f.status === 'reversed')
        throw refuse('invalid_transition', 'This finding was reversed and cannot be published again.');
      if (f.publishedRevisionId === target.id) return listRevisionsTx(tx, f.id);
      // §4.2 check 1: only the latest revision can be approved.
      if (target !== latest)
        throw refuse(
          'conflict',
          'A newer revision exists. Review the latest revision instead.',
          latest?.revisionNumber ?? revisionNumber,
        );
      // Check 2: the stored hash matches its content and the hash the approver saw.
      if (revisionHash(target) !== target.contentHash || target.contentHash !== contentHash)
        throw refuse(
          'conflict',
          'This revision changed since you opened it. Reload before approving.',
          target.revisionNumber,
        );
      // Check 5: no open suspension or legal hold blocks publication (a hold is recorded below).
      if (f.status === 'suspended')
        throw refuse('invalid_transition', 'An open suspension review blocks approval.');
      const events = await approvalEvents(tx, f.id);
      if (events.some((e) => e.revisionId === target.id && e.event === 'reject'))
        throw refuse('invalid_transition', 'This revision was rejected. Propose a new revision instead.');
      // Check 3: every evidence item is available and unchanged.
      for (const e of target.evidenceSet as { itemId: string; sha256: string }[]) {
        const [item] = await tx
          .select()
          .from(schema.evidenceItems)
          .where(eq(schema.evidenceItems.id, e.itemId));
        if (!item || item.state !== 'available' || evidenceHash(item) !== e.sha256)
          throw refuse(
            'evidence_unavailable',
            'An evidence item in this revision is no longer available or has changed.',
          );
      }
      // Check 4 (§4.1): who may approve.
      const current = await publishedRevision(tx, f);
      const authors = new Set(revisions.map((r) => r.authorRef));
      if (await conflicted(tx, actor.actorRef, f))
        throw refuse('not_eligible', 'You recorded a conflict of interest for this finding.');
      const independent = target.severity === 'severe' || current?.severity === 'severe';
      if (independent) {
        if (!hasPermission(actor, 'finding:approve_severe'))
          throw refuse('not_eligible', 'A severe finding needs an approver with severe-approval permission.');
        if (authors.has(actor.actorRef))
          throw refuse(
            'not_eligible',
            'You authored a revision of this finding, so an independent approver must approve it.',
          );
        if (current?.severity === 'severe') {
          const currentApproval = await causingApproval(tx, current.id);
          if (actor.actorRef === current.authorRef || actor.actorRef === currentApproval?.approverRef)
            throw refuse(
              'not_eligible',
              'You took part in the currently public severe revision, so you cannot approve its replacement.',
            );
        }
      }
      const [approval] = await tx
        .insert(schema.findingApprovalEvents)
        .values({
          findingId: f.id,
          revisionId: target.id,
          revisionContentHash: target.contentHash,
          approverRef: actor.actorRef,
          event: 'approve',
          publicationBlocked: f.legalHoldAt ? 'legal_hold' : null,
          stepupChallengeId: assertion.challengeId,
        })
        .returning();
      if (!approval) throw new Error('approval_creation_failed');
      await appendAudit(tx, actor, 'finding.approved', 'finding', f.id, { revisionNumber });
      if (f.legalHoldAt) return listRevisionsTx(tx, f.id);
      const [publication] = await tx
        .insert(schema.findingPublicationEvents)
        .values({
          findingId: f.id,
          revisionId: target.id,
          causeApprovalEventId: approval.id,
          supersededRevisionId: current?.id ?? null,
        })
        .returning();
      if (!publication) throw new Error('publication_failed');
      await setStatus(
        tx,
        f,
        'published',
        { publishedRevisionId: target.id, currentRevisionId: target.id },
        { publicationEventId: publication.id },
      );
      await appendAudit(tx, SYSTEM, 'finding.became_public', 'finding', f.id, { revisionNumber });
      if (current)
        await appendAudit(tx, SYSTEM, 'finding.superseded', 'finding', f.id, {
          revisionNumber: current.revisionNumber,
        });
      return listRevisionsTx(tx, f.id);
    },
  );
}

async function listRevisionsTx(tx: Database, findingId: string) {
  const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, findingId));
  if (!f) throw new DomainError('not_found');
  return revisionViews(tx, f);
}

export async function rejectRevision(
  ctx: IdentityContext,
  actor: UserActor,
  findingId: string,
  revisionNumber: number,
  rationale: string,
  assertion?: AssertionInput,
) {
  requirePermission(actor, 'finding:publish');
  const text = rationale.trim();
  if (text.length < 10 || text.length > 2000)
    throw refuse('invalid_transition', 'Give a rationale of at least 10 characters.');
  if (!assertion) throw new DomainError('stepup_required');
  return withStepup(
    ctx,
    actor,
    {
      action: 'finding.reject',
      targetType: 'finding',
      targetId: findingId,
      parameters: { revisionNumber, rationale: text },
    },
    assertion,
    async (tx) => {
      const f = await lockFinding(tx, findingId);
      const revisions = await revisionsOf(tx, f.id);
      const target = revisions.find((r) => r.revisionNumber === revisionNumber);
      if (!target) throw new DomainError('not_found');
      if (target !== revisions.at(-1) || f.publishedRevisionId === target.id)
        throw refuse('invalid_transition', 'Only the latest unpublished revision can be rejected.');
      await tx.insert(schema.findingApprovalEvents).values({
        findingId: f.id,
        revisionId: target.id,
        revisionContentHash: target.contentHash,
        approverRef: actor.actorRef,
        event: 'reject',
        rationale: text,
        stepupChallengeId: assertion.challengeId,
      });
      await appendAudit(tx, actor, 'finding.rejected', 'finding', f.id, { revisionNumber });
      return listRevisionsTx(tx, f.id);
    },
  );
}

/** A new immutable revision based on the latest one the editor saw (moderation §2, §8.1). */
export async function proposeRevision(
  ctx: IdentityContext,
  actor: UserActor,
  findingId: string,
  base: { revisionNumber: number; contentHash: string },
  draft: { severity: Severity; publicSummary: string; internalRationale: string },
  sourceCaseId: string | null = null,
) {
  requirePermission(actor, 'finding:propose');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await proposeRevisionTx(tx, actor, findingId, base, draft, sourceCaseId);
    return historyTx(tx, findingId);
  });
}

export async function proposeRevisionTx(
  tx: Database,
  actor: UserActor,
  findingId: string,
  base: { revisionNumber: number; contentHash: string },
  draft: { severity: Severity; publicSummary: string; internalRationale: string },
  sourceCaseId: string | null,
) {
  const f = await lockFinding(tx, findingId);
  if (f.status === 'reversed') throw refuse('invalid_transition', 'This finding was reversed.');
  // Before its first publication a finding changes only through approval or rejection.
  if (f.status !== 'published' && f.status !== 'suspended')
    throw refuse(
      'invalid_transition',
      'Only a published finding can be revised. Approve or reject the pending revision.',
    );
  const latest = (await revisionsOf(tx, f.id)).at(-1);
  if (!latest) throw new Error('finding_without_revision');
  if (latest.revisionNumber !== base.revisionNumber || latest.contentHash !== base.contentHash)
    throw refuse(
      'conflict',
      'This changed while you were working. Load the latest revision.',
      latest.revisionNumber,
    );
  if (await conflicted(tx, actor.actorRef, f))
    throw refuse('not_eligible', 'You recorded a conflict of interest for this finding.');
  if (
    latest.severity === draft.severity &&
    latest.publicSummary === draft.publicSummary &&
    latest.internalRationale === draft.internalRationale
  )
    throw refuse('invalid_transition', 'Nothing changed. Edit the severity or text to propose a revision.');
  const revision = await insertRevision(tx, {
    findingId: f.id,
    revisionNumber: latest.revisionNumber + 1,
    authorRef: actor.actorRef,
    subjectId: latest.subjectId,
    findingType: latest.findingType,
    severity: draft.severity,
    publicSummary: draft.publicSummary,
    internalRationale: draft.internalRationale,
    evidenceSet: latest.evidenceSet,
    linkedFactorCodes: [`finding.${draft.severity}`],
    policyVersion: POLICY_VERSION,
    sourceCaseId,
  });
  const pending = draft.severity === 'severe' || (await publishedRevision(tx, f))?.severity === 'severe';
  if (f.status === 'published' || f.status === 'suspended')
    await tx
      .update(schema.findings)
      .set({ currentRevisionId: revision.id })
      .where(eq(schema.findings.id, f.id));
  else
    await setStatus(tx, f, pending ? 'pending_second_approval' : 'proposed', {
      currentRevisionId: revision.id,
    });
  await appendAudit(tx, actor, 'finding.revision_submitted', 'finding', f.id, {
    revisionNumber: revision.revisionNumber,
    severity: draft.severity,
  });
  return revision;
}

async function staffFindingView(tx: Database, f: Finding) {
  const published = await publishedRevision(tx, f);
  if (!published) return null;
  const approval = await causingApproval(tx, published.id);
  const [publication] = await tx
    .select()
    .from(schema.findingPublicationEvents)
    .where(eq(schema.findingPublicationEvents.revisionId, published.id))
    .orderBy(desc(schema.findingPublicationEvents.at))
    .limit(1);
  const refs = await staffRefs(tx, [published.authorRef, ...(approval ? [approval.approverRef] : [])]);
  const subject = await addressOf(tx, f.subjectId);
  if (!subject) throw new Error('finding_subject_missing');
  const [review] = await tx
    .select({ id: schema.moderationCases.id })
    .from(schema.moderationCases)
    .where(
      and(
        eq(schema.moderationCases.findingId, f.id),
        eq(schema.moderationCases.caseType, 'suspension_review'),
        eq(schema.moderationCases.status, 'open'),
      ),
    );
  return {
    findingId: f.id,
    title: `Finding on ${subject.chain}: ${subject.address}`,
    severity: published.severity as Severity,
    subject: {
      kind: 'address' as const,
      chain: subject.chain,
      address: subject.address,
      displayAddress: subject.address,
    },
    author: refs.get(published.authorRef) ?? { id: published.authorRef, handle: 'Staff' },
    approver: approval
      ? (refs.get(approval.approverRef) ?? { id: approval.approverRef, handle: 'Staff' })
      : { id: 'system', handle: 'Staff' },
    publishedAt: (publication?.at ?? published.createdAt).toISOString(),
    status: f.status === 'suspended' ? ('suspended' as const) : ('published' as const),
    reviewCaseId: review?.id ?? null,
  };
}

export async function listFindings(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'finding:suspend');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const rows = await tx
      .select()
      .from(schema.findings)
      .where(inArray(schema.findings.status, ['published', 'suspended']))
      .orderBy(desc(schema.findings.createdAt))
      .limit(200);
    const out = [];
    for (const f of rows) {
      const view = await staffFindingView(tx, f);
      if (view) out.push(view);
    }
    return out;
  });
}

async function historyTx(tx: Database, findingId: string) {
  const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, findingId));
  if (!f) throw new DomainError('not_found');
  const finding = await staffFindingView(tx, f);
  if (!finding) throw new DomainError('not_found');
  const published = await publishedRevision(tx, f);
  return {
    finding,
    revisions: await revisionViews(tx, f),
    publicText: f.status === 'suspended' ? null : (published?.publicSummary ?? null),
    approvalBlockedReason:
      f.status === 'suspended'
        ? 'An open suspension review blocks approval until it is decided.'
        : f.legalHoldAt
          ? 'A legal hold blocks publication.'
          : null,
  };
}

export async function getFindingHistory(ctx: IdentityContext, actor: UserActor, findingId: string) {
  requirePermission(actor, 'finding:propose');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    return historyTx(tx, findingId);
  });
}

/**
 * Emergency suspension (moderation §8.3): any staff member with step-up; the finding leaves
 * public view at once and a non-participant must review it within 72 hours.
 */
export async function suspendFinding(
  ctx: IdentityContext,
  actor: UserActor,
  findingId: string,
  reason: string,
  assertion?: AssertionInput,
) {
  requirePermission(actor, 'finding:suspend');
  const text = reason.trim();
  if (text.length < 10 || text.length > 2000)
    throw refuse('invalid_transition', 'Give a reason of at least 10 characters.');
  if (!assertion) throw new DomainError('stepup_required');
  return withStepup(
    ctx,
    actor,
    { action: 'finding.suspend', targetType: 'finding', targetId: findingId, parameters: { reason: text } },
    assertion,
    async (tx, client) => {
      const f = await lockFinding(tx, findingId);
      if (f.status !== 'published')
        throw refuse('invalid_transition', 'Only a published finding can be suspended.');
      const published = await publishedRevision(tx, f);
      const [decision] = await tx
        .insert(schema.moderationDecisions)
        .values({
          decisionType: 'finding_suspend',
          findingId: f.id,
          revisionId: f.publishedRevisionId,
          outcome: 'suspended',
          rationaleInternal: text,
          policyVersion: POLICY_VERSION,
          decidedByRef: actor.actorRef,
          stepupChallengeId: assertion.challengeId,
        })
        .returning();
      if (!decision) throw new Error('decision_creation_failed');
      await setStatus(
        tx,
        f,
        'suspended',
        {},
        { decisionId: decision.id, publicNote: 'Temporarily suspended pending review' },
      );
      const [review] = await tx
        .insert(schema.moderationCases)
        .values({
          caseType: 'suspension_review',
          subjectId: f.subjectId,
          findingId: f.id,
          status: 'open',
          priority: 'urgent',
          slaDueAt: new Date(Date.now() + SUSPENSION_REVIEW_MS),
        })
        .returning();
      if (!review) throw new Error('case_creation_failed');
      await appendAudit(tx, actor, 'finding.suspended', 'finding', f.id, {
        severity: published?.severity ?? 'unknown',
      });
      await appendAudit(tx, actor, 'moderation.case.created', 'moderation_case', review.id);
      // A single person reducing a severe finding is the abuse case this alert watches.
      if (published?.severity === 'severe')
        await notifyAdmins(ctx, tx, client as Client, 'moderation_severe_finding_suspended');
      return review.id;
    },
  );
}

/** Suspension review outcome (moderation §8.2–§8.3), called from the case workflow. */
export async function decideSuspension(
  tx: Database,
  actor: UserActor,
  caseRow: typeof schema.moderationCases.$inferSelect,
  outcome: 'reinstate_finding' | 'reverse_finding',
  text: { publicSummary: string; internalRationale: string },
  stepupChallengeId: string,
) {
  if (!caseRow.findingId) throw new Error('suspension_case_without_finding');
  const f = await lockFinding(tx, caseRow.findingId);
  if (f.status !== 'suspended') throw refuse('invalid_transition', 'This finding is no longer suspended.');
  const published = await publishedRevision(tx, f);
  const people = await participants(tx, f.id);
  const [suspension] = await tx
    .select()
    .from(schema.moderationDecisions)
    .where(
      and(
        eq(schema.moderationDecisions.findingId, f.id),
        eq(schema.moderationDecisions.decisionType, 'finding_suspend'),
      ),
    )
    .orderBy(desc(schema.moderationDecisions.decidedAt))
    .limit(1);
  const approval = published ? await causingApproval(tx, published.id) : null;
  const authorsAndApprovers = new Set([
    ...(await revisionsOf(tx, f.id)).map((r) => r.authorRef),
    ...(approval ? [approval.approverRef] : []),
  ]);
  if (authorsAndApprovers.has(actor.actorRef) || (await conflicted(tx, actor.actorRef, f)))
    throw refuse(
      'not_eligible',
      'You took part in this finding (author or approver). A non-participant must review the suspension.',
    );
  const severe = published?.severity === 'severe';
  if (severe && outcome === 'reverse_finding' && suspension?.decidedByRef === actor.actorRef)
    throw refuse(
      'not_eligible',
      'You suspended this severe finding. Reversing it needs a second person who is not a participant.',
    );
  if (
    severe &&
    outcome === 'reinstate_finding' &&
    (!hasPermission(actor, 'finding:approve_severe') || people.has(actor.actorRef))
  )
    throw refuse(
      'not_eligible',
      'Reinstating a severe finding needs an independent approver who is not a participant.',
    );
  const [decision] = await tx
    .insert(schema.moderationDecisions)
    .values({
      caseId: caseRow.id,
      decisionType: outcome === 'reinstate_finding' ? 'finding_reinstate' : 'finding_reverse',
      findingId: f.id,
      revisionId: f.publishedRevisionId,
      outcome: outcome === 'reinstate_finding' ? 'reinstated' : 'reversed',
      rationaleInternal: text.internalRationale,
      publicSummary: text.publicSummary,
      policyVersion: POLICY_VERSION,
      decidedByRef: actor.actorRef,
      stepupChallengeId,
      supersedesDecisionId: suspension?.id ?? null,
    })
    .returning();
  if (!decision) throw new Error('decision_creation_failed');
  await setStatus(
    tx,
    f,
    outcome === 'reinstate_finding' ? 'published' : 'reversed',
    {},
    {
      decisionId: decision.id,
      publicNote: text.publicSummary,
    },
  );
  await appendAudit(
    tx,
    actor,
    outcome === 'reinstate_finding' ? 'finding.reinstated' : 'finding.reversed',
    'finding',
    f.id,
  );
  return outcome === 'reinstate_finding' ? 'reinstated' : 'reversed';
}

/** Suspension case detail fields (contracts `caseDetailSchema` suspension_review). */
export async function suspensionCaseFields(
  tx: Database,
  caseRow: typeof schema.moderationCases.$inferSelect,
) {
  if (!caseRow.findingId) throw new Error('suspension_case_without_finding');
  const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, caseRow.findingId));
  if (!f) throw new Error('finding_missing');
  const published = await publishedRevision(tx, f);
  if (!published) throw new Error('finding_unpublished');
  const approval = await causingApproval(tx, published.id);
  const [suspension] = await tx
    .select()
    .from(schema.moderationDecisions)
    .where(
      and(
        eq(schema.moderationDecisions.findingId, f.id),
        eq(schema.moderationDecisions.decisionType, 'finding_suspend'),
      ),
    )
    .orderBy(desc(schema.moderationDecisions.decidedAt))
    .limit(1);
  const [publication] = await tx
    .select()
    .from(schema.findingPublicationEvents)
    .where(eq(schema.findingPublicationEvents.revisionId, published.id))
    .limit(1);
  const refs = await staffRefs(tx, [
    published.authorRef,
    ...(approval ? [approval.approverRef] : []),
    ...(suspension ? [suspension.decidedByRef] : []),
  ]);
  const ref = (id: string) => refs.get(id) ?? { id, handle: 'Staff' };
  return {
    suspendedFinding: {
      findingId: f.id,
      revisionNumber: published.revisionNumber,
      severity: published.severity as Severity,
      publicSummary: published.publicSummary,
      author: ref(published.authorRef),
      approver: approval ? ref(approval.approverRef) : { id: 'system', handle: 'Staff' },
      publishedAt: (publication?.at ?? published.createdAt).toISOString(),
    },
    suspendedBy: suspension ? ref(suspension.decidedByRef) : { id: 'system', handle: 'Staff' },
    suspensionReason: suspension?.rationaleInternal ?? '',
  };
}

/** Published findings for a subject, as the public sees them (contracts `findingSummarySchema`). */
export async function publicFindings(db: Database, chainId: string, address: string) {
  const [row] = await db
    .select({ subjectId: schema.addresses.subjectId })
    .from(schema.addresses)
    .where(and(eq(schema.addresses.chainId, chainId), eq(schema.addresses.address, address)));
  if (!row) return { subjectId: null, findings: [], timeline: [], suspended: false };
  const findings = await db
    .select()
    .from(schema.findings)
    .where(
      and(
        eq(schema.findings.subjectId, row.subjectId),
        inArray(schema.findings.status, ['published', 'suspended', 'reversed']),
      ),
    );
  const out = [];
  const timeline = [];
  for (const f of findings) {
    const history = await db
      .select()
      .from(schema.findingStatusHistory)
      .where(eq(schema.findingStatusHistory.findingId, f.id))
      .orderBy(asc(schema.findingStatusHistory.statusRevision));
    for (const h of history) {
      const kind =
        h.toStatus === 'published' && h.fromStatus === 'suspended'
          ? 'finding_reinstated'
          : h.toStatus === 'published'
            ? 'finding_published'
            : h.toStatus === 'suspended'
              ? 'finding_suspended'
              : h.toStatus === 'reversed'
                ? 'finding_reversed'
                : null;
      if (kind)
        timeline.push({
          id: h.id,
          kind,
          label:
            kind === 'finding_published'
              ? 'Finding published after approval'
              : kind === 'finding_suspended'
                ? 'Finding temporarily suspended pending review'
                : kind === 'finding_reinstated'
                  ? 'Finding reinstated after review'
                  : 'Finding reversed',
          at: h.at.toISOString(),
          actor: kind === 'finding_published' ? ('system' as const) : ('moderator' as const),
        });
    }
    // A suspended or reversed finding shows only its notice, never its text (§8.2–§8.3).
    if (f.status !== 'published') continue;
    const published = await publishedRevision(db, f);
    if (!published) continue;
    const firstPublished = history.find((h) => h.toStatus === 'published');
    out.push({
      id: f.id,
      title: `${published.severity[0]?.toUpperCase()}${published.severity.slice(1)} finding`,
      summary: published.publicSummary,
      provenance: 'moderator_finding' as const,
      publishedAt: (firstPublished?.at ?? published.createdAt).toISOString(),
      disputeState: 'none' as const,
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));
  // A suspended finding shows no text, but its subject's assessment is disputed (§8.3).
  const suspended = findings.some((f) => f.status === 'suspended');
  return { subjectId: row.subjectId, findings: out, timeline, suspended };
}
