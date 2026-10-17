import { schema, eq, ne, and, asc, desc, inArray, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { addressOf, addressSubject, type ChainSlug } from './subjects.ts';
import { staffRefs, submitterPseudonym } from './refs.ts';
import { REDRESS_STATUS_LABEL } from './labels.ts';
import { issueChallenge, claimStanding, standingView, type StandingProofInput } from './standing.ts';
import {
  setStatus,
  participants,
  conflicted,
  proposeRevisionTx,
  POLICY_VERSION,
  type Severity,
} from './findings.ts';

// Appeals and right-of-reply responses (moderation §9). Filing an appeal does not hide the
// finding; it shows "Disputed — under appeal" until decided.

const APPEAL_SLA_MS = 14 * 86400_000;
const RESPONSE_SLA_MS = 4 * 86400_000;
const CASE_TARGET = 'moderation_case';
const OPEN_APPEAL = ['submitted', 'in_review'];

async function publishedFinding(tx: Database, findingId: string) {
  const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, findingId));
  if (!f || !f.publishedRevisionId || !['published', 'suspended'].includes(f.status))
    throw new DomainError('not_found');
  const [revision] = await tx
    .select()
    .from(schema.findingRevisions)
    .where(eq(schema.findingRevisions.id, f.publishedRevisionId));
  if (!revision) throw new DomainError('not_found');
  return { f, revision };
}

export async function appealTarget(ctx: IdentityContext, actor: UserActor, findingId: string) {
  requirePermission(actor, 'appeal:create');
  return ctx.runtime.transaction(async (tx) => {
    const { f, revision } = await publishedFinding(tx, findingId);
    const subject = await addressOf(tx, f.subjectId);
    if (!subject) throw new DomainError('not_found');
    const open = await tx
      .select({ appellant: schema.appeals.appellantUserId })
      .from(schema.appeals)
      .where(and(eq(schema.appeals.findingId, f.id), inArray(schema.appeals.status, OPEN_APPEAL)));
    return {
      findingId: f.id,
      title: `${revision.severity[0]?.toUpperCase()}${revision.severity.slice(1)} finding`,
      summary: revision.publicSummary,
      subject,
      subjectKind: 'unknown' as const,
      disputeState:
        f.status === 'suspended'
          ? ('suspended_pending_review' as const)
          : open.length
            ? ('under_appeal' as const)
            : ('none' as const),
      alreadyAppealed: open.some((o) => o.appellant === actor.userId),
    };
  });
}

export async function appealChallenge(ctx: IdentityContext, actor: UserActor, findingId: string) {
  requirePermission(actor, 'standing:prove');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const { f } = await publishedFinding(tx, findingId);
    return issueChallenge(ctx, tx, actor, 'appeal', { subjectId: f.subjectId, findingId: f.id });
  });
}

export async function submitAppeal(
  ctx: IdentityContext,
  actor: UserActor,
  input: { findingId: string; grounds: string; standing: StandingProofInput },
  prefix: string,
) {
  requirePermission(actor, 'appeal:create');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await ctx.throttle.requestLimit(tx, 'appeal.submit', actor.userId, prefix, 5, 86400);
    const { f, revision } = await publishedFinding(tx, input.findingId);
    const claim = await claimStanding(
      tx,
      actor,
      'appeal',
      { subjectId: f.subjectId, findingId: f.id },
      input.standing,
    );
    const [appeal] = await tx
      .insert(schema.appeals)
      .values({
        findingId: f.id,
        appealedRevisionId: revision.id,
        appellantUserId: actor.userId,
        standingClaimId: claim.id,
        statement: input.grounds,
        status: 'submitted',
      })
      .returning()
      .catch((error: unknown) => {
        throw uniqueAs(error, 'You already have an open appeal against this finding.');
      });
    if (!appeal) throw new Error('appeal_creation_failed');
    const [created] = await tx
      .insert(schema.moderationCases)
      .values({
        caseType: 'appeal_review',
        subjectId: f.subjectId,
        findingId: f.id,
        appealId: appeal.id,
        status: 'submitted',
        slaDueAt: new Date(Date.now() + APPEAL_SLA_MS),
      })
      .returning();
    if (!created) throw new Error('case_creation_failed');
    await appendAudit(tx, actor, 'moderation.case.created', CASE_TARGET, created.id);
    return { id: created.id };
  });
}

function uniqueAs(error: unknown, detail: string) {
  const code = (error as { code?: unknown }).code ?? (error as { cause?: { code?: unknown } }).cause?.code;
  return code === '23505' ? refuse('invalid_transition', detail) : error;
}

export async function responseTarget(
  ctx: IdentityContext,
  actor: UserActor,
  target: { kind: 'address'; chain: ChainSlug; address: string } | { kind: 'project'; slug: string },
) {
  requirePermission(actor, 'response:create');
  if (target.kind === 'project')
    throw refuse('invalid_transition', 'Responses about projects arrive with project profiles.');
  return ctx.runtime.transaction(async (tx) => {
    const { subjectId, address } = await addressSubject(tx, target.chain, target.address);
    const open = await tx
      .select({ id: schema.subjectResponses.id })
      .from(schema.subjectResponses)
      .where(
        and(
          eq(schema.subjectResponses.subjectId, subjectId),
          eq(schema.subjectResponses.authorUserId, actor.userId),
          inArray(schema.subjectResponses.status, ['submitted', 'in_review']),
        ),
      );
    return {
      target: { kind: 'address' as const, chain: target.chain, address },
      title: `${target.chain}: ${address}`,
      subjectKind: 'unknown' as const,
      domains: [],
      alreadyResponding: open.length > 0,
    };
  });
}

export async function responseChallenge(
  ctx: IdentityContext,
  actor: UserActor,
  target: { kind: 'address'; chain: ChainSlug; address: string } | { kind: 'project'; slug: string },
) {
  requirePermission(actor, 'standing:prove');
  if (target.kind === 'project')
    throw refuse('invalid_transition', 'Responses about projects arrive with project profiles.');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const { subjectId } = await addressSubject(tx, target.chain, target.address);
    return issueChallenge(ctx, tx, actor, 'response', { subjectId, findingId: null });
  });
}

export async function submitResponse(
  ctx: IdentityContext,
  actor: UserActor,
  input: {
    target: { kind: 'address'; chain: ChainSlug; address: string } | { kind: 'project'; slug: string };
    body: string;
    standing: StandingProofInput;
  },
  prefix: string,
) {
  requirePermission(actor, 'response:create');
  if (input.target.kind === 'project')
    throw refuse('invalid_transition', 'Responses about projects arrive with project profiles.');
  const target = input.target;
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await ctx.throttle.requestLimit(tx, 'response.submit', actor.userId, prefix, 5, 86400);
    const { subjectId } = await addressSubject(tx, target.chain, target.address);
    const claim = await claimStanding(tx, actor, 'response', { subjectId, findingId: null }, input.standing);
    const [response] = await tx
      .insert(schema.subjectResponses)
      .values({
        subjectId,
        authorUserId: actor.userId,
        standingClaimId: claim.id,
        body: input.body,
        status: 'submitted',
      })
      .returning()
      .catch((error: unknown) => {
        throw uniqueAs(error, 'You already have a response under review for this subject.');
      });
    if (!response) throw new Error('response_creation_failed');
    const [created] = await tx
      .insert(schema.moderationCases)
      .values({
        caseType: 'subject_response',
        subjectId,
        responseId: response.id,
        status: 'submitted',
        slaDueAt: new Date(Date.now() + RESPONSE_SLA_MS),
      })
      .returning();
    if (!created) throw new Error('case_creation_failed');
    await appendAudit(tx, actor, 'moderation.case.created', CASE_TARGET, created.id);
    return { id: created.id };
  });
}

/** Staff case-detail fields for appeal and response cases (contracts `caseDetailSchema`). */
export async function redressCaseFields(tx: Database, c: typeof schema.moderationCases.$inferSelect) {
  if (c.appealId) {
    const [appeal] = await tx.select().from(schema.appeals).where(eq(schema.appeals.id, c.appealId));
    if (!appeal) throw new Error('appeal_missing');
    const [revision] = await tx
      .select()
      .from(schema.findingRevisions)
      .where(eq(schema.findingRevisions.id, appeal.appealedRevisionId));
    const [claim] = await tx
      .select()
      .from(schema.standingClaims)
      .where(eq(schema.standingClaims.id, appeal.standingClaimId));
    const [publication] = await tx
      .select({ e: schema.findingPublicationEvents, a: schema.findingApprovalEvents })
      .from(schema.findingPublicationEvents)
      .innerJoin(
        schema.findingApprovalEvents,
        eq(schema.findingApprovalEvents.id, schema.findingPublicationEvents.causeApprovalEventId),
      )
      .where(eq(schema.findingPublicationEvents.revisionId, appeal.appealedRevisionId))
      .limit(1);
    if (!revision || !claim) throw new Error('appeal_context_missing');
    const refs = await staffRefs(tx, [
      revision.authorRef,
      ...(publication ? [publication.a.approverRef] : []),
    ]);
    const ref = (id: string) => refs.get(id) ?? { id, handle: 'Staff' };
    return {
      type: 'appeal_review' as const,
      title: `Appeal against finding ${appeal.findingId.slice(0, 8)}`,
      fields: {
        appellantRef: submitterPseudonym(c.id, appeal.appellantUserId, 'A'),
        appealedDecision: {
          findingId: appeal.findingId,
          revisionNumber: revision.revisionNumber,
          severity: revision.severity as Severity,
          publicSummary: revision.publicSummary,
          author: ref(revision.authorRef),
          approver: publication ? ref(publication.a.approverRef) : { id: 'system', handle: 'Staff' },
          publishedAt: (publication?.e.at ?? revision.createdAt).toISOString(),
        },
        grounds: appeal.statement,
        standing: standingView(claim),
      },
    };
  }
  if (c.responseId) {
    const [response] = await tx
      .select()
      .from(schema.subjectResponses)
      .where(eq(schema.subjectResponses.id, c.responseId));
    if (!response) throw new Error('response_missing');
    const [claim] = await tx
      .select()
      .from(schema.standingClaims)
      .where(eq(schema.standingClaims.id, response.standingClaimId));
    if (!claim) throw new Error('response_context_missing');
    return {
      type: 'subject_response' as const,
      title: 'Response from a party claiming standing',
      fields: {
        responderRef: submitterPseudonym(c.id, response.authorUserId, 'S'),
        body: response.body,
        standing: standingView(claim),
      },
    };
  }
  return null;
}

async function claimFor(tx: Database, c: typeof schema.moderationCases.$inferSelect) {
  const id = c.appealId
    ? (await tx.select().from(schema.appeals).where(eq(schema.appeals.id, c.appealId)))[0]?.standingClaimId
    : (
        await tx
          .select()
          .from(schema.subjectResponses)
          .where(eq(schema.subjectResponses.id, c.responseId ?? ''))
      )[0]?.standingClaimId;
  const [claim] = id
    ? await tx.select().from(schema.standingClaims).where(eq(schema.standingClaims.id, id)).for('update')
    : [];
  if (!claim) throw new Error('claim_missing');
  return claim;
}

/** Appeal reviewers and standing reviewers are never participants of the finding (§7, §9). */
async function requireIndependent(
  tx: Database,
  actor: UserActor,
  findingId: string | null,
  subjectId: string | null,
) {
  if (findingId && (await participants(tx, findingId)).has(actor.actorRef))
    throw refuse(
      'not_eligible',
      'You took part in the decision under appeal (author or approver), so you cannot review this appeal or its standing.',
    );
  if (subjectId && (await conflicted(tx, actor.actorRef, { id: findingId, subjectId })))
    throw refuse('not_eligible', 'You recorded a conflict of interest for this subject.');
}

/**
 * Appeal and response decisions, called by the case workflow inside its locked transaction
 * after permission, version, status and assignment checks.
 */
export async function decideRedress(
  tx: Database,
  actor: UserActor,
  c: typeof schema.moderationCases.$inferSelect,
  decision: { action: string } & Readonly<Record<string, unknown>>,
  stepupChallengeId: string | null,
): Promise<string | null> {
  const rationale = String(decision['internalRationale'] ?? '');
  await requireIndependent(tx, actor, c.findingId, c.subjectId);
  const claim = await claimFor(tx, c);
  if (decision.action === 'start_review') return 'in_review';
  if (decision.action === 'grant_standing' || decision.action === 'deny_standing') {
    if (claim.outcome !== 'pending')
      throw refuse('invalid_transition', 'Standing has already been decided for this case.');
    const granted = decision.action === 'grant_standing';
    await tx
      .update(schema.standingClaims)
      .set({
        outcome: granted ? 'granted' : 'denied',
        decidedByRef: actor.actorRef,
        decidedAt: new Date(),
        scopeStatement: granted
          ? 'A standing reviewer accepted the documents for this case only. They establish authority to appeal or respond here, not identity or innocence.'
          : 'A standing reviewer found the documents insufficient for this case.',
      })
      .where(eq(schema.standingClaims.id, claim.id));
    await tx.insert(schema.moderationDecisions).values({
      caseId: c.id,
      decisionType: 'standing_outcome',
      // Bound to the case, not the finding: deciding standing does not make the reviewer a
      // participant of the finding.
      findingId: null,
      outcome: granted ? 'granted' : 'denied',
      rationaleInternal: rationale,
      policyVersion: POLICY_VERSION,
      decidedByRef: actor.actorRef,
      stepupChallengeId,
    });
    return null;
  }
  // Not publishing a response needs no standing decision in its favour; every other outcome does.
  const needs =
    decision.action === 'reject_response' ? claim.outcome !== 'pending' : claim.outcome === 'granted';
  if (!needs) throw refuse('invalid_transition', 'Standing must be decided before this case can be decided.');
  const publicSummary = String(decision['publicSummary'] ?? '') || null;
  if (c.appealId) {
    const [appeal] = await tx
      .select()
      .from(schema.appeals)
      .where(eq(schema.appeals.id, c.appealId))
      .for('update');
    const [f] = await tx
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.id, c.findingId ?? ''))
      .for('update');
    if (!appeal || !f) throw new Error('appeal_context_missing');
    // An appeal is bound to the revision it was filed against (moderation §9).
    if (f.publishedRevisionId !== appeal.appealedRevisionId || f.status === 'reversed')
      throw refuse(
        'conflict',
        'The published finding changed. Review a fresh appeal against its current revision.',
        1,
      );
    const outcome =
      decision.action === 'uphold' ? 'upheld' : decision.action === 'amend' ? 'amended' : 'reversed';
    const [row] = await tx
      .insert(schema.moderationDecisions)
      .values({
        caseId: c.id,
        decisionType: decision.action === 'reverse' ? 'finding_reverse' : 'appeal_outcome',
        findingId: f.id,
        revisionId: appeal.appealedRevisionId,
        outcome,
        rationaleInternal: rationale,
        publicSummary,
        policyVersion: POLICY_VERSION,
        decidedByRef: actor.actorRef,
        stepupChallengeId,
      })
      .returning();
    if (!row) throw new Error('decision_creation_failed');
    if (decision.action === 'amend') {
      // An amendment is a new revision that still needs approval (§8.1, §9).
      const [current] = await tx
        .select()
        .from(schema.findingRevisions)
        .where(eq(schema.findingRevisions.findingId, f.id))
        .orderBy(desc(schema.findingRevisions.revisionNumber))
        .limit(1);
      if (!current) throw new Error('finding_without_revision');
      await proposeRevisionTx(
        tx,
        actor,
        f.id,
        { revisionNumber: current.revisionNumber, contentHash: current.contentHash },
        {
          severity: String(decision['severity']) as Severity,
          publicSummary: String(decision['publicSummary'] ?? ''),
          internalRationale: rationale,
        },
        c.id,
      );
    }
    if (decision.action === 'reverse') {
      await setStatus(
        tx,
        f,
        'reversed',
        {},
        { decisionId: row.id, ...(publicSummary ? { publicNote: publicSummary } : {}) },
      );
      await appendAudit(tx, actor, 'finding.reversed', 'finding', f.id);
    }
    await tx
      .update(schema.appeals)
      .set({ status: outcome, decisionId: row.id, decidedAt: new Date() })
      .where(eq(schema.appeals.id, appeal.id));
    return outcome;
  }
  const [response] = await tx
    .select()
    .from(schema.subjectResponses)
    .where(eq(schema.subjectResponses.id, c.responseId ?? ''))
    .for('update');
  if (!response) throw new Error('response_missing');
  const publish = decision.action === 'publish_response';
  await tx.insert(schema.moderationDecisions).values({
    caseId: c.id,
    decisionType: 'response_outcome',
    outcome: publish ? 'published' : 'rejected',
    rationaleInternal: rationale,
    policyVersion: POLICY_VERSION,
    decidedByRef: actor.actorRef,
    stepupChallengeId,
  });
  await tx
    .update(schema.subjectResponses)
    .set(
      publish
        ? { status: 'published', publishedAt: new Date() }
        : { status: 'rejected', submitterReason: String(decision['reason'] ?? '') },
    )
    .where(eq(schema.subjectResponses.id, response.id));
  return publish ? 'published' : 'rejected';
}

/** Keeps the appeal or response record in step with its case status (start, withdraw). */
export async function syncRedressStatus(
  tx: Database,
  c: typeof schema.moderationCases.$inferSelect,
  status: string,
) {
  if (c.appealId) await tx.update(schema.appeals).set({ status }).where(eq(schema.appeals.id, c.appealId));
  if (c.responseId)
    await tx
      .update(schema.subjectResponses)
      .set({ status })
      .where(eq(schema.subjectResponses.id, c.responseId));
}

/**
 * The public redress view of a subject: published responses, which published findings are
 * under appeal, and the matching timeline events. Withdrawn appeals leave no public trace;
 * appellant and responder identities are never shown (moderation §9).
 */
export async function publicRedress(db: Database, subjectId: string | null, findingIds: readonly string[]) {
  if (!subjectId) return { responses: [], underAppeal: new Set<string>(), timeline: [] };
  const rows = await db
    .select({ r: schema.subjectResponses, c: schema.standingClaims })
    .from(schema.subjectResponses)
    .innerJoin(schema.standingClaims, eq(schema.standingClaims.id, schema.subjectResponses.standingClaimId))
    .where(
      and(eq(schema.subjectResponses.subjectId, subjectId), eq(schema.subjectResponses.status, 'published')),
    );
  const responses = rows.map(({ r, c }) => ({
    id: r.id,
    summary: r.body,
    standing: (c.mechanism === 'signature' ? 'wallet_signature' : c.mechanism) as
      'wallet_signature' | 'authority_signature' | 'dns_txt' | 'documentary',
    standingProvenAt: (c.decidedAt ?? c.createdAt).toISOString(),
    publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
  }));
  const appeals = findingIds.length
    ? await db
        .select()
        .from(schema.appeals)
        .where(
          and(inArray(schema.appeals.findingId, [...findingIds]), ne(schema.appeals.status, 'withdrawn')),
        )
    : [];
  const underAppeal = new Set(appeals.filter((a) => OPEN_APPEAL.includes(a.status)).map((a) => a.findingId));
  const timeline = [
    ...appeals.map((a) => ({
      id: `appeal-filed-${a.id}`,
      kind: 'appeal_filed' as const,
      label: 'Appeal filed by a party that proved standing',
      at: a.submittedAt.toISOString(),
      actor: 'subject' as const,
    })),
    ...appeals
      .filter((a) => a.decidedAt)
      .map((a) => ({
        id: `appeal-decided-${a.id}`,
        kind: 'appeal_decided' as const,
        label: `Appeal decided: finding ${a.status}`,
        at: (a.decidedAt ?? a.submittedAt).toISOString(),
        actor: 'moderator' as const,
      })),
    ...responses.map((r) => ({
      id: `response-${r.id}`,
      kind: 'response_published' as const,
      label: 'Response published from a party that proved standing',
      at: r.publishedAt,
      actor: 'subject' as const,
    })),
  ];
  return { responses, underAppeal, timeline };
}

// Member side: the appellant or responder sees their own submission, never staff identities
// or internal rationale.

type CaseRow = typeof schema.moderationCases.$inferSelect;
type Owned =
  | { c: CaseRow; kind: 'appeal'; appeal: typeof schema.appeals.$inferSelect }
  | { c: CaseRow; kind: 'response'; response: typeof schema.subjectResponses.$inferSelect };

/** The member's own appeal or response case, or null when the case is not one of theirs. */
export async function ownedRedress(tx: Database, actor: UserActor, caseId: string, lock = false) {
  const query = tx.select().from(schema.moderationCases).where(eq(schema.moderationCases.id, caseId));
  const [c] = lock ? await query.for('update') : await query;
  if (c?.appealId) {
    const [appeal] = await tx
      .select()
      .from(schema.appeals)
      .where(and(eq(schema.appeals.id, c.appealId), eq(schema.appeals.appellantUserId, actor.userId)));
    if (appeal) return { c, kind: 'appeal', appeal } satisfies Owned as Owned;
  }
  if (c?.responseId) {
    const [response] = await tx
      .select()
      .from(schema.subjectResponses)
      .where(
        and(
          eq(schema.subjectResponses.id, c.responseId),
          eq(schema.subjectResponses.authorUserId, actor.userId),
        ),
      );
    if (response) return { c, kind: 'response', response } satisfies Owned as Owned;
  }
  return null;
}

function redressSummary(o: Owned) {
  const status = o.kind === 'appeal' ? o.appeal.status : o.response.status;
  return {
    id: o.c.id,
    kind: o.kind,
    title:
      o.kind === 'appeal'
        ? `Appeal against finding ${o.appeal.findingId.slice(0, 8)}`
        : 'Response about an address',
    status: REDRESS_STATUS_LABEL[status] ?? status,
    submittedAt: (o.kind === 'appeal' ? o.appeal.submittedAt : o.response.createdAt).toISOString(),
    updatedAt: (o.c.closedAt ?? o.c.createdAt).toISOString(),
    needsAction: false,
  };
}

export async function listOwnRedress(db: Database, actor: UserActor) {
  const appeals = await db
    .select({ c: schema.moderationCases, appeal: schema.appeals })
    .from(schema.appeals)
    .innerJoin(schema.moderationCases, eq(schema.moderationCases.appealId, schema.appeals.id))
    .where(eq(schema.appeals.appellantUserId, actor.userId))
    .limit(200);
  const responses = await db
    .select({ c: schema.moderationCases, response: schema.subjectResponses })
    .from(schema.subjectResponses)
    .innerJoin(schema.moderationCases, eq(schema.moderationCases.responseId, schema.subjectResponses.id))
    .where(eq(schema.subjectResponses.authorUserId, actor.userId))
    .limit(200);
  return [
    ...appeals.map((a) => redressSummary({ ...a, kind: 'appeal' })),
    ...responses.map((r) => redressSummary({ ...r, kind: 'response' })),
  ];
}

export async function redressDetail(tx: Database, o: Owned) {
  const status = o.kind === 'appeal' ? o.appeal.status : o.response.status;
  const claimId = o.kind === 'appeal' ? o.appeal.standingClaimId : o.response.standingClaimId;
  const [claim] = await tx.select().from(schema.standingClaims).where(eq(schema.standingClaims.id, claimId));
  if (!claim) throw new Error('claim_missing');
  const subject = o.c.subjectId ? await addressOf(tx, o.c.subjectId) : null;
  const decisions = await tx
    .select()
    .from(schema.moderationDecisions)
    .where(eq(schema.moderationDecisions.caseId, o.c.id))
    .orderBy(asc(schema.moderationDecisions.decidedAt));
  const standingLabel =
    claim.outcome === 'granted'
      ? 'Standing accepted'
      : claim.outcome === 'denied'
        ? 'Standing not accepted'
        : 'Standing awaits a reviewer';
  const timeline = [
    {
      at: (o.kind === 'appeal' ? o.appeal.submittedAt : o.response.createdAt).toISOString(),
      label: 'Submitted',
    },
    ...decisions.map((d) => ({
      at: d.decidedAt.toISOString(),
      label:
        d.decisionType === 'standing_outcome'
          ? standingLabel
          : `Status: ${REDRESS_STATUS_LABEL[status] ?? status}`,
    })),
  ];
  const outcome = decisions.findLast((d) => d.decisionType !== 'standing_outcome');
  const published = o.kind === 'response' ? o.response.status === 'published' : !!outcome;
  return {
    ...redressSummary(o),
    version: o.c.version,
    details: [
      ...(subject ? [{ label: 'Subject', value: `${subject.chain}: ${subject.address}` }] : []),
      {
        label: o.kind === 'appeal' ? 'Grounds' : 'Response',
        value: o.kind === 'appeal' ? o.appeal.statement : o.response.body,
      },
      { label: 'Standing', value: `${standingLabel}. ${claim.scopeStatement}` },
    ],
    evidenceNames: [],
    timeline,
    infoRequest:
      claim.outcome === 'denied' && OPEN_REDRESS.includes(status)
        ? 'Your standing was not accepted. You can reply with more information for a fresh review.'
        : null,
    submitterReason: o.kind === 'response' ? o.response.submitterReason : null,
    publicOutcome:
      o.kind === 'response' ? (published ? o.response.body : null) : (outcome?.publicSummary ?? null),
    publicLink: published && subject ? `/address/${subject.chain}/${subject.address}` : null,
    canRespond: claim.outcome === 'denied' && OPEN_REDRESS.includes(status),
    canWithdraw: OPEN_REDRESS.includes(status),
  };
}

const OPEN_REDRESS = ['submitted', 'in_review'];

/**
 * A reply after denied standing sends the claim back to a standing reviewer
 * (api-integration-contracts §3: standing `denied → pending`, case status unchanged).
 */
export async function replyAfterDeniedStanding(tx: Database, actor: UserActor, o: Owned, message: string) {
  const status = o.kind === 'appeal' ? o.appeal.status : o.response.status;
  const claim = await claimFor(tx, o.c);
  if (claim.outcome !== 'denied' || !OPEN_REDRESS.includes(status))
    throw refuse('invalid_transition', 'Staff are not waiting for information on this submission.');
  await tx
    .insert(schema.caseMessages)
    .values({ caseId: o.c.id, direction: 'from_submitter', authorRef: actor.actorRef, body: message });
  await tx
    .update(schema.standingClaims)
    .set({
      outcome: 'pending',
      decidedByRef: null,
      decidedAt: null,
      scopeStatement: 'Documentary standing awaits a standing reviewer.',
    })
    .where(eq(schema.standingClaims.id, claim.id));
  await tx
    .update(schema.moderationCases)
    .set({ version: o.c.version + 1 })
    .where(eq(schema.moderationCases.id, o.c.id));
  await appendAudit(tx, actor, 'moderation.case.replied', CASE_TARGET, o.c.id, { from: status, to: status });
}

/** Withdrawal closes the case; a decided appeal or response stays as recorded. */
export async function withdrawRedress(tx: Database, actor: UserActor, o: Owned) {
  const status = o.kind === 'appeal' ? o.appeal.status : o.response.status;
  if (!OPEN_REDRESS.includes(status))
    throw refuse(
      'invalid_transition',
      'A decision was already recorded, so this can no longer be withdrawn.',
    );
  await syncRedressStatus(tx, o.c, 'withdrawn');
  await tx
    .update(schema.moderationCases)
    .set({ status: 'withdrawn', version: o.c.version + 1, closedAt: new Date() })
    .where(eq(schema.moderationCases.id, o.c.id));
  await appendAudit(tx, actor, 'moderation.case.status_changed', CASE_TARGET, o.c.id, {
    from: o.c.status,
    to: 'withdrawn',
  });
}
