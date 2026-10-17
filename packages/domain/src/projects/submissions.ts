import { schema, eq, and, asc, isNull, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { notify } from '../notifications/service.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { addressSubject, type ChainSlug } from '../moderation/subjects.ts';
import { submitterPseudonym } from '../moderation/refs.ts';
import { defangUrl, PROJECT_STATUS_LABEL } from '../moderation/labels.ts';
import { POLICY_VERSION } from '../moderation/findings.ts';
import { createProject, latestRevision, type ProjectCategory } from './profiles.ts';

// Project suggestions (ADR 0010 Part A) and profile corrections (moderation §6.2 mechanism 5:
// no standing needed). Both are private to the member and staff and change nothing public
// until staff accept them; acceptance needs `project:manage` and a step-up.

const CASE_TARGET = 'moderation_case';
const SLA_MS = 7 * 86400_000;

function noImages(evidence: readonly unknown[]) {
  if (evidence.length)
    throw refuse(
      'evidence_unavailable',
      'Image evidence is not available yet. Describe it in the text instead.',
    );
}

export async function submitSuggestion(
  ctx: IdentityContext,
  actor: UserActor,
  input: {
    name: string;
    category: ProjectCategory;
    chain: ChainSlug;
    identifier: string;
    links: readonly string[];
    description: string;
    relationship: string;
    evidence: readonly unknown[];
  },
  prefix: string,
) {
  requirePermission(actor, 'report:create');
  noImages(input.evidence);
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await ctx.throttle.requestLimit(tx, 'suggestion.submit', actor.userId, prefix, 5, 86400);
    const { subjectId, chainId, address } = await addressSubject(tx, input.chain, input.identifier);
    const [suggestion] = await tx
      .insert(schema.projectSuggestions)
      .values({
        submitterUserId: actor.userId,
        name: input.name,
        category: input.category,
        chainId,
        identifier: address,
        linksText: input.links.map(defangUrl),
        description: input.description,
        relationship: input.relationship,
        status: 'submitted',
      })
      .returning();
    if (!suggestion) throw new Error('suggestion_creation_failed');
    const [created] = await tx
      .insert(schema.moderationCases)
      .values({
        caseType: 'project_suggestion',
        subjectId,
        suggestionId: suggestion.id,
        status: 'submitted',
        slaDueAt: new Date(Date.now() + SLA_MS),
      })
      .returning();
    if (!created) throw new Error('case_creation_failed');
    await appendAudit(tx, actor, 'moderation.case.created', CASE_TARGET, created.id);
    await notify(tx, actor.userId, 'submission_received', '0', { caseId: created.id });
    return { id: created.id };
  });
}

export async function submitCorrection(
  ctx: IdentityContext,
  actor: UserActor,
  input: {
    projectSlug: string;
    statement: string;
    description?: string | undefined;
    addDomain?: string | undefined;
    retireDomain?: string | undefined;
    evidence: readonly unknown[];
  },
  prefix: string,
) {
  requirePermission(actor, 'correction:create');
  noImages(input.evidence);
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    await ctx.throttle.requestLimit(tx, 'correction.submit', actor.userId, prefix, 5, 86400);
    const [project] = await tx
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.slug, input.projectSlug));
    if (!project) throw new DomainError('not_found');
    const [correction] = await tx
      .insert(schema.correctionRequests)
      .values({
        requesterUserId: actor.userId,
        projectId: project.id,
        baseRevision: project.currentRevision,
        statement: input.statement,
        proposedDescription: input.description ?? null,
        addDomain: input.addDomain ?? null,
        retireDomain: input.retireDomain ?? null,
        status: 'submitted',
      })
      .returning();
    if (!correction) throw new Error('correction_creation_failed');
    const [created] = await tx
      .insert(schema.moderationCases)
      .values({
        caseType: 'correction_request',
        subjectId: project.subjectId,
        correctionId: correction.id,
        status: 'submitted',
        slaDueAt: new Date(Date.now() + SLA_MS),
      })
      .returning();
    if (!created) throw new Error('case_creation_failed');
    await appendAudit(tx, actor, 'moderation.case.created', CASE_TARGET, created.id);
    await notify(tx, actor.userId, 'submission_received', '0', { caseId: created.id });
    return { id: created.id };
  });
}

type CaseRow = typeof schema.moderationCases.$inferSelect;
type Owned =
  | { c: CaseRow; kind: 'project_suggestion'; s: typeof schema.projectSuggestions.$inferSelect }
  | { c: CaseRow; kind: 'correction'; r: typeof schema.correctionRequests.$inferSelect };

/** The member's own suggestion or correction case, or null. */
export async function ownedProjectSubmission(tx: Database, actor: UserActor, caseId: string, lock = false) {
  const query = tx.select().from(schema.moderationCases).where(eq(schema.moderationCases.id, caseId));
  const [c] = lock ? await query.for('update') : await query;
  if (c?.suggestionId) {
    const [s] = await tx
      .select()
      .from(schema.projectSuggestions)
      .where(
        and(
          eq(schema.projectSuggestions.id, c.suggestionId),
          eq(schema.projectSuggestions.submitterUserId, actor.userId),
        ),
      );
    if (s) return { c, kind: 'project_suggestion', s } satisfies Owned as Owned;
  }
  if (c?.correctionId) {
    const [r] = await tx
      .select()
      .from(schema.correctionRequests)
      .where(
        and(
          eq(schema.correctionRequests.id, c.correctionId),
          eq(schema.correctionRequests.requesterUserId, actor.userId),
        ),
      );
    if (r) return { c, kind: 'correction', r } satisfies Owned as Owned;
  }
  return null;
}

async function projectName(tx: Database, projectId: string) {
  return (await latestRevision(tx, projectId)).name;
}

async function summaryOf(tx: Database, o: Owned) {
  const status = o.kind === 'project_suggestion' ? o.s.status : o.r.status;
  return {
    id: o.c.id,
    kind: o.kind,
    title:
      o.kind === 'project_suggestion'
        ? `Project suggestion: ${o.s.name}`
        : `Correction to ${await projectName(tx, o.r.projectId)}`,
    status: PROJECT_STATUS_LABEL[status] ?? status,
    submittedAt: (o.kind === 'project_suggestion' ? o.s.submittedAt : o.r.submittedAt).toISOString(),
    updatedAt: (o.c.closedAt ?? o.c.createdAt).toISOString(),
    needsAction: o.kind === 'project_suggestion' && o.s.status === 'needs_information',
  };
}

export async function listOwnProjectSubmissions(db: Database, actor: UserActor) {
  const suggestions = await db
    .select({ c: schema.moderationCases, s: schema.projectSuggestions })
    .from(schema.projectSuggestions)
    .innerJoin(schema.moderationCases, eq(schema.moderationCases.suggestionId, schema.projectSuggestions.id))
    .where(eq(schema.projectSuggestions.submitterUserId, actor.userId))
    .limit(200);
  const corrections = await db
    .select({ c: schema.moderationCases, r: schema.correctionRequests })
    .from(schema.correctionRequests)
    .innerJoin(schema.moderationCases, eq(schema.moderationCases.correctionId, schema.correctionRequests.id))
    .where(eq(schema.correctionRequests.requesterUserId, actor.userId))
    .limit(200);
  return [
    ...(await Promise.all(suggestions.map((x) => summaryOf(db, { ...x, kind: 'project_suggestion' })))),
    ...(await Promise.all(corrections.map((x) => summaryOf(db, { ...x, kind: 'correction' })))),
  ];
}

export async function projectSubmissionDetail(tx: Database, o: Owned) {
  const messages = await tx
    .select()
    .from(schema.caseMessages)
    .where(eq(schema.caseMessages.caseId, o.c.id))
    .orderBy(asc(schema.caseMessages.at));
  const lastRequest = messages.filter((m) => m.direction === 'to_submitter').at(-1);
  if (o.kind === 'project_suggestion') {
    const { s } = o;
    const [result] = s.resultingProjectId
      ? await tx.select().from(schema.projects).where(eq(schema.projects.id, s.resultingProjectId))
      : [];
    return {
      ...(await summaryOf(tx, o)),
      version: o.c.version,
      details: [
        { label: 'Name', value: s.name },
        { label: 'Identifier', value: s.identifier },
        { label: 'Links (never opened by Blacklist)', value: (s.linksText as string[]).join('\n') },
        { label: 'Description', value: s.description },
        { label: 'Your relationship', value: s.relationship },
      ],
      evidenceNames: [],
      timeline: [
        { at: s.submittedAt.toISOString(), label: 'Submitted' },
        ...messages.map((m) => ({
          at: m.at.toISOString(),
          label: m.direction === 'to_submitter' ? 'Staff asked for more information' : 'You replied',
        })),
        ...(s.decidedAt
          ? [
              {
                at: s.decidedAt.toISOString(),
                label: `Status: ${PROJECT_STATUS_LABEL[s.status] ?? s.status}`,
              },
            ]
          : []),
      ],
      infoRequest: s.status === 'needs_information' ? (lastRequest?.body ?? null) : null,
      submitterReason: s.submitterReason,
      publicOutcome: result ? 'A project profile was published.' : null,
      publicLink: result ? `/project/${result.slug}` : null,
      canRespond: s.status === 'needs_information',
      canWithdraw: false,
    };
  }
  const { r } = o;
  const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, r.projectId));
  return {
    ...(await summaryOf(tx, o)),
    version: o.c.version,
    details: [
      { label: 'Explanation', value: r.statement },
      ...(r.proposedDescription ? [{ label: 'Proposed description', value: r.proposedDescription }] : []),
      ...(r.addDomain ? [{ label: 'Add official domain', value: r.addDomain }] : []),
      ...(r.retireDomain ? [{ label: 'Retire official domain', value: r.retireDomain }] : []),
    ],
    evidenceNames: [],
    timeline: [
      { at: r.submittedAt.toISOString(), label: 'Submitted' },
      ...(r.decidedAt
        ? [{ at: r.decidedAt.toISOString(), label: `Status: ${PROJECT_STATUS_LABEL[r.status] ?? r.status}` }]
        : []),
    ],
    infoRequest: null,
    submitterReason: r.submitterReason,
    publicOutcome: r.status === 'accepted' ? 'The project profile was revised.' : null,
    publicLink: r.status === 'accepted' && project ? `/project/${project.slug}` : null,
    canRespond: false,
    canWithdraw: false,
  };
}

/** The member answers a request for information on a suggestion; it goes back to staff. */
export async function replyToSuggestion(tx: Database, actor: UserActor, o: Owned, message: string) {
  if (o.kind !== 'project_suggestion' || o.s.status !== 'needs_information')
    throw refuse('invalid_transition', 'Staff are not waiting for information on this submission.');
  await tx
    .insert(schema.caseMessages)
    .values({ caseId: o.c.id, direction: 'from_submitter', authorRef: actor.actorRef, body: message });
  await tx
    .update(schema.projectSuggestions)
    .set({ status: 'submitted' })
    .where(eq(schema.projectSuggestions.id, o.s.id));
  await tx
    .update(schema.moderationCases)
    .set({ status: 'submitted', version: o.c.version + 1 })
    .where(eq(schema.moderationCases.id, o.c.id));
  await appendAudit(tx, actor, 'moderation.case.replied', CASE_TARGET, o.c.id, {
    from: 'needs_information',
    to: 'submitted',
  });
}

/** Staff case-detail fields (contracts `caseDetailSchema` project_suggestion and correction_request). */
export async function projectCaseFields(tx: Database, c: CaseRow) {
  if (c.suggestionId) {
    const [s] = await tx
      .select()
      .from(schema.projectSuggestions)
      .where(eq(schema.projectSuggestions.id, c.suggestionId));
    if (!s) throw new Error('suggestion_missing');
    const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.chainId, s.chainId));
    const [result] = s.resultingProjectId
      ? await tx.select().from(schema.projects).where(eq(schema.projects.id, s.resultingProjectId))
      : [];
    return {
      type: 'project_suggestion' as const,
      status: s.status,
      title: `Project suggestion: ${s.name}`,
      submitterReason: s.submitterReason,
      fields: {
        submitterRef: submitterPseudonym(c.id, s.submitterUserId, 'P'),
        proposal: {
          name: s.name,
          category: s.category,
          chain: (network?.slug ?? 'ethereum') as ChainSlug,
          identifier: s.identifier,
          links: s.linksText as string[],
          description: s.description,
          relationship: s.relationship,
        },
        resultingSlug: result?.slug ?? null,
      },
    };
  }
  if (c.correctionId) {
    const [r] = await tx
      .select()
      .from(schema.correctionRequests)
      .where(eq(schema.correctionRequests.id, c.correctionId));
    if (!r) throw new Error('correction_missing');
    const latest = await latestRevision(tx, r.projectId);
    return {
      type: 'correction_request' as const,
      status: r.status,
      title: `Correction to ${latest.name}`,
      submitterReason: r.submitterReason,
      fields: {
        requesterRef: submitterPseudonym(c.id, r.requesterUserId, 'C'),
        statement: r.statement,
        currentRevision: latest.revisionNumber,
        changes: [
          ...(r.proposedDescription
            ? [
                {
                  field: 'description' as const,
                  label: 'Description',
                  current: latest.description,
                  proposed: r.proposedDescription,
                },
              ]
            : []),
          ...(r.addDomain
            ? [
                {
                  field: 'domain_added' as const,
                  label: 'Official domain',
                  current: null,
                  proposed: r.addDomain,
                },
              ]
            : []),
          ...(r.retireDomain
            ? [
                {
                  field: 'domain_retired' as const,
                  label: 'Official domain',
                  current: r.retireDomain,
                  proposed: null,
                },
              ]
            : []),
        ],
      },
    };
  }
  return null;
}

/** Hostnames from defanged link text, for the profile's official domains. */
function hostnames(links: readonly string[]) {
  const out = new Set<string>();
  for (const link of links) {
    const host = /^hxxps?:\/\/([^/\s]+)/i
      .exec(link)?.[1]
      ?.replace(/\[\.\]/g, '.')
      .toLowerCase();
    if (host && /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(host)) out.add(host);
  }
  return [...out];
}

/**
 * Suggestion and correction decisions, called by the case workflow inside its locked
 * transaction after permission, version, status and assignment checks. Returns the new
 * case status.
 */
export async function decideProjectCase(
  tx: Database,
  actor: UserActor,
  c: CaseRow,
  decision: { action: string } & Readonly<Record<string, unknown>>,
  stepupChallengeId: string | null,
): Promise<string> {
  const rationale = String(decision['internalRationale'] ?? '');
  const reason = decision['reason'] === undefined ? null : String(decision['reason']);
  const record = async (decisionType: string, outcome: string, publicSummary: string | null) =>
    tx.insert(schema.moderationDecisions).values({
      caseId: c.id,
      decisionType,
      outcome,
      rationaleInternal: rationale || outcome,
      publicSummary,
      policyVersion: POLICY_VERSION,
      decidedByRef: actor.actorRef,
      stepupChallengeId,
    });
  if (c.suggestionId) {
    const [s] = await tx
      .select()
      .from(schema.projectSuggestions)
      .where(eq(schema.projectSuggestions.id, c.suggestionId))
      .for('update');
    if (!s) throw new Error('suggestion_missing');
    if (decision.action === 'request_info') {
      await tx.insert(schema.caseMessages).values({
        caseId: c.id,
        direction: 'to_submitter',
        authorRef: actor.actorRef,
        body: String(decision['messageToSubmitter'] ?? ''),
      });
      await tx
        .update(schema.projectSuggestions)
        .set({ status: 'needs_information' })
        .where(eq(schema.projectSuggestions.id, s.id));
      return 'needs_information';
    }
    if (decision.action === 'reject_suggestion') {
      await record('correction_outcome', 'not_accepted', null);
      await tx
        .update(schema.projectSuggestions)
        .set({ status: 'not_accepted', submitterReason: reason, decidedAt: new Date() })
        .where(eq(schema.projectSuggestions.id, s.id));
      return 'not_accepted';
    }
    const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.chainId, s.chainId));
    const project = await createProject(tx, actor, {
      name: s.name,
      category: s.category as ProjectCategory,
      description: s.description,
      address: { chain: (network?.slug ?? 'ethereum') as ChainSlug, address: s.identifier },
      domains: hostnames(s.linksText as string[]),
      sourceCaseId: c.id,
    });
    await record(
      'correction_outcome',
      'accepted_into_profile',
      String(decision['publicSummary'] ?? '') || null,
    );
    await tx
      .update(schema.projectSuggestions)
      .set({ status: 'accepted_into_profile', resultingProjectId: project.id, decidedAt: new Date() })
      .where(eq(schema.projectSuggestions.id, s.id));
    return 'accepted_into_profile';
  }
  if (!c.correctionId) throw new Error('project_case_without_source');
  const [r] = await tx
    .select()
    .from(schema.correctionRequests)
    .where(eq(schema.correctionRequests.id, c.correctionId))
    .for('update');
  if (!r) throw new Error('correction_missing');
  if (decision.action === 'start_review') {
    await tx
      .update(schema.correctionRequests)
      .set({ status: 'in_review' })
      .where(eq(schema.correctionRequests.id, r.id));
    return 'in_review';
  }
  if (decision.action === 'reject_correction') {
    await record('correction_outcome', 'rejected', null);
    await tx
      .update(schema.correctionRequests)
      .set({ status: 'rejected', submitterReason: reason, decidedAt: new Date() })
      .where(eq(schema.correctionRequests.id, r.id));
    return 'rejected';
  }
  // accept_correction: the profile must still be at the revision the requester saw.
  const [project] = await tx
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, r.projectId))
    .for('update');
  if (!project) throw new Error('project_missing');
  if (project.currentRevision !== r.baseRevision)
    throw refuse(
      'conflict',
      'The profile changed since this correction was sent. Ask for a fresh correction.',
      project.currentRevision,
    );
  const latest = await latestRevision(tx, project.id);
  const next = project.currentRevision + 1;
  await tx.insert(schema.projectRevisions).values({
    projectId: project.id,
    revisionNumber: next,
    name: latest.name,
    category: latest.category,
    description: r.proposedDescription ?? latest.description,
    authorRef: actor.actorRef,
    sourceCaseId: c.id,
    publicNote: 'Profile revised after a correction request',
  });
  await tx.update(schema.projects).set({ currentRevision: next }).where(eq(schema.projects.id, project.id));
  if (r.addDomain)
    await tx
      .insert(schema.projectDomains)
      .values({
        projectId: project.id,
        hostname: r.addDomain,
        basis: 'staff_documentary_review',
        basisNote: 'Added after staff reviewed a correction request.',
      })
      .onConflictDoNothing();
  if (r.retireDomain) {
    // Only an active domain can be retired; a retired row keeps its original history.
    const retired = await tx
      .update(schema.projectDomains)
      .set({ retiredAt: new Date() })
      .where(
        and(
          eq(schema.projectDomains.projectId, project.id),
          eq(schema.projectDomains.hostname, r.retireDomain),
          isNull(schema.projectDomains.retiredAt),
        ),
      )
      .returning({ id: schema.projectDomains.id });
    if (!retired.length)
      throw refuse(
        'invalid_transition',
        'That domain is not an active official domain of this profile. Reject the correction or ask for a new one.',
      );
  }
  await record('correction_outcome', 'accepted', String(decision['publicSummary'] ?? '') || null);
  await tx
    .update(schema.correctionRequests)
    .set({ status: 'accepted', decidedAt: new Date() })
    .where(eq(schema.correctionRequests.id, r.id));
  await appendAudit(tx, actor, 'project.revised', 'project', project.id);
  return 'accepted';
}
