import { describe, it, expect } from 'vitest';
import { schema, eq, sql } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  submitReport,
  getOwnSubmission,
  getCase,
  decideCase,
  listRevisions,
  approveRevision,
  rejectRevision,
  proposeRevision,
  listFindings,
  suspendFinding,
  getFindingHistory,
  publicFindings,
  type UserActor,
} from '@blacklist/domain';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const address = '0x' + 'ef'.repeat(20);
const text = (s: string) => `${s} — fictional text long enough for validation.`;

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return actor as UserActor;
}

/** A report accepted by `author`: revision 1 of a new finding at `severity`. */
async function acceptedFinding(f: ApplicationFixture, author: Staff, severity: string) {
  const reporter = await member(f);
  const { id } = await submitReport(
    f.ctx,
    reporter,
    {
      category: 'phishing',
      title: 'Fictional report for a finding',
      subjects: [{ chain: 'ethereum', address }],
      narrative: text('Narrative'),
      incidentDate: '2026-10-01',
      txRefs: [{ chain: 'ethereum', hash: '0x' + '12'.repeat(32) }],
      urls: [],
      evidence: [],
    },
    'ip4:192.0.2.91',
  );
  const started = await decideCase(f.ctx, author.actor, id, 1, { action: 'start_review' });
  const decision = {
    action: 'accept_report',
    severity,
    publicSummary: text('Public summary'),
    internalRationale: text('Rationale'),
  };
  const step = await author.proof({
    action: 'case.accept_report',
    targetType: 'case',
    targetId: id,
    parameters: { version: started.version, decision },
  });
  const accepted = await decideCase(f.ctx, author.actor, id, started.version, decision, step);
  const [finding] = await f.ctx.runtime.db
    .select()
    .from(schema.findings)
    .where(
      eq(
        schema.findings.subjectId,
        (
          await f.ctx.runtime.db.select().from(schema.addresses).where(eq(schema.addresses.address, address))
        )[0]?.subjectId ?? '',
      ),
    );
  if (!finding) throw new Error('fixture_finding_missing');
  return { caseId: id, findingId: finding.id, accepted, reporter };
}

async function latest(f: ApplicationFixture, staff: Staff, findingId: string) {
  // A published finding has a history view; one awaiting its first approval is on the approvals list.
  const [row] = await f.ctx.runtime.db
    .select()
    .from(schema.findings)
    .where(eq(schema.findings.id, findingId));
  const revisions = row?.publishedRevisionId
    ? (await getFindingHistory(f.ctx, staff.actor, findingId)).revisions
    : (await listRevisions(f.ctx, staff.actor)).filter((r) => r.findingId === findingId);
  const r = revisions.at(-1);
  if (!r) throw new Error('fixture_revision_missing');
  return r;
}
async function approve(
  f: ApplicationFixture,
  staff: Staff,
  findingId: string,
  revisionNumber: number,
  contentHash: string,
) {
  return approveRevision(
    f.ctx,
    staff.actor,
    findingId,
    revisionNumber,
    contentHash,
    await staff.proof({
      action: 'finding.approve',
      targetType: 'finding',
      targetId: findingId,
      parameters: { revisionNumber, contentHash },
    }),
  );
}
const propose = (
  f: ApplicationFixture,
  staff: Staff,
  findingId: string,
  base: { revisionNumber: number; contentHash: string },
  severity: 'low' | 'medium' | 'high' | 'severe',
  summary: string,
) =>
  proposeRevision(f.ctx, staff.actor, findingId, base, {
    severity,
    publicSummary: text(summary),
    internalRationale: text('Revision rationale'),
  });

describe('Phase 9a slice 3: findings, approval and system publication (moderation §2–§5, §8)', () => {
  it('binds approval to the latest revision and hash, publishes as the system, and enforces independence', async () => {
    const f = await startApplicationFixture();
    try {
      const modA = await addAssuredStaff(f, 'moderator'),
        modB = await addAssuredStaff(f, 'moderator'),
        modC = await addAssuredStaff(f, 'moderator'),
        admin = await addAssuredStaff(f, 'admin');
      const { findingId, accepted, reporter, caseId } = await acceptedFinding(f, modA, 'high');
      expect((await getOwnSubmission(f.ctx, reporter, caseId)).publicLink).toBeNull();
      expect(accepted.status).toBe('accepted');
      expect(await publicFindings(f.ctx.runtime.db, 'eip155:1', address)).toMatchObject({
        findings: [],
        timeline: [],
      });

      const r1 = await latest(f, modA, findingId);
      expect(r1).toMatchObject({ revisionNumber: 1, status: 'proposed', isLatest: true, severity: 'high' });
      expect((await listRevisions(f.ctx, modB.actor)).some((r) => r.findingId === findingId)).toBe(true);

      // Approval needs a step-up bound to this revision and hash.
      await expect(approveRevision(f.ctx, modA.actor, findingId, 1, r1.contentHash)).rejects.toThrow(
        'stepup_required',
      );
      await expect(approve(f, modA, findingId, 1, '0'.repeat(64))).rejects.toThrow('conflict');
      // Non-severe: self-approval by the author is permitted (§4.1).
      await approve(f, modA, findingId, 1, r1.contentHash);
      const published = await publicFindings(f.ctx.runtime.db, 'eip155:1', address);
      const ownView = await getOwnSubmission(f.ctx, reporter, caseId);
      expect(ownView).toMatchObject({ status: 'Accepted', publicLink: `/address/ethereum/${address}` });
      expect(JSON.stringify(ownView)).not.toContain(modA.actor.actorRef);
      expect(published.findings).toHaveLength(1);
      expect(published.findings[0]).toMatchObject({
        provenance: 'moderator_finding',
        summary: text('Public summary'),
      });
      expect(published.timeline.map((t) => [t.kind, t.actor])).toEqual([['finding_published', 'system']]);
      const pubs = await f.ctx.runtime.db.select().from(schema.findingPublicationEvents);
      expect(pubs).toHaveLength(1);
      expect(pubs[0]?.actorType).toBe('system');
      const [cause] = await f.ctx.runtime.db
        .select()
        .from(schema.findingApprovalEvents)
        .where(eq(schema.findingApprovalEvents.id, pubs[0]?.causeApprovalEventId ?? ''));
      expect(cause).toMatchObject({
        event: 'approve',
        approverRef: modA.actor.actorRef,
        revisionContentHash: r1.contentHash,
      });
      const audit = await f.ctx.runtime.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.targetId, findingId));
      expect(audit.find((a) => a.action === 'finding.became_public')?.actorType).toBe('system');
      // Repeating the approval of the public revision is idempotent.
      await approve(f, modA, findingId, 1, r1.contentHash);
      expect(await f.ctx.runtime.db.select().from(schema.findingPublicationEvents)).toHaveLength(1);

      // Revision N's approval never authorizes N+1; only the latest can be approved.
      await expect(
        propose(f, modB, findingId, { revisionNumber: 1, contentHash: '0'.repeat(64) }, 'high', 'Stale base'),
      ).rejects.toThrow('conflict');
      // Unchanged content is refused (api-integration-contracts §3).
      await expect(
        proposeRevision(f.ctx, modB.actor, findingId, r1, {
          severity: r1.severity,
          publicSummary: r1.publicSummary,
          internalRationale: r1.internalRationale,
        }),
      ).rejects.toThrow('invalid_transition');
      await propose(f, modB, findingId, r1, 'medium', 'Second wording');
      const r2 = await latest(f, modB, findingId);
      await propose(f, modB, findingId, r2, 'medium', 'Third wording');
      const r3 = await latest(f, modB, findingId);
      await expect(approve(f, modC, findingId, 2, r2.contentHash)).rejects.toThrow('conflict');

      // A rejected revision cannot then be approved.
      await expect(rejectRevision(f.ctx, modC.actor, findingId, 3, 'too short')).rejects.toThrow(
        'invalid_transition',
      );
      await rejectRevision(
        f.ctx,
        modC.actor,
        findingId,
        3,
        text('Rejected'),
        await modC.proof({
          action: 'finding.reject',
          targetType: 'finding',
          targetId: findingId,
          parameters: { revisionNumber: 3, rationale: text('Rejected') },
        }),
      );
      expect((await latest(f, modC, findingId)).status).toBe('rejected');
      await expect(approve(f, modC, findingId, 3, r3.contentHash)).rejects.toThrow('invalid_transition');

      // Severe: no author of any revision may approve; an independent approver can.
      await propose(f, modB, findingId, r3, 'severe', 'Severe wording');
      const r4 = await latest(f, modB, findingId);
      expect(r4.status).toBe('pending_second_approval');
      await expect(approve(f, modB, findingId, 4, r4.contentHash)).rejects.toThrow('not_eligible');
      await expect(approve(f, modA, findingId, 4, r4.contentHash)).rejects.toThrow('not_eligible');
      await approve(f, admin, findingId, 4, r4.contentHash);
      expect((await latest(f, admin, findingId)).status).toBe('published');

      // Replacing a public severe revision: also not a participant of that revision.
      await propose(f, modA, findingId, r4, 'high', 'Downgraded wording');
      const r5 = await latest(f, modA, findingId);
      expect(r5.status).toBe('pending_second_approval');
      await expect(approve(f, admin, findingId, 5, r5.contentHash)).rejects.toThrow('not_eligible');
      await expect(approve(f, modA, findingId, 5, r5.contentHash)).rejects.toThrow('not_eligible');
      await approve(f, modC, findingId, 5, r5.contentHash);
      const pubsAfter = await f.ctx.runtime.db.select().from(schema.findingPublicationEvents);
      expect(pubsAfter).toHaveLength(3);
      expect(pubsAfter.every((p) => p.actorType === 'system')).toBe(true);

      // A changed evidence item blocks publication of the next revision.
      await propose(f, modB, findingId, r5, 'medium', 'Evidence check wording');
      const r6 = await latest(f, modB, findingId);
      const [link] = await f.ctx.runtime.db
        .select()
        .from(schema.evidenceLinks)
        .where(
          eq(
            schema.evidenceLinks.findingRevisionId,
            (
              await f.ctx.runtime.db
                .select()
                .from(schema.findingRevisions)
                .where(eq(schema.findingRevisions.contentHash, r6.contentHash))
            )[0]?.id ?? '',
          ),
        );
      await f.ctx.runtime.db
        .update(schema.evidenceItems)
        .set({ state: 'unpublished' })
        .where(eq(schema.evidenceItems.id, link?.evidenceItemId ?? ''));
      await expect(approve(f, modC, findingId, 6, r6.contentHash)).rejects.toThrow('evidence_unavailable');
    } finally {
      await f.stop();
    }
  });

  it('serializes a concurrent approval and a new revision on the finding row', async () => {
    const f = await startApplicationFixture();
    try {
      const modA = await addAssuredStaff(f, 'moderator'),
        modB = await addAssuredStaff(f, 'moderator');
      const { findingId } = await acceptedFinding(f, modA, 'medium');
      const r1 = await latest(f, modA, findingId);
      await approve(f, modA, findingId, 1, r1.contentHash);
      await propose(f, modA, findingId, r1, 'low', 'Second wording');
      const r2 = await latest(f, modA, findingId);
      const proof = await modB.proof({
        action: 'finding.approve',
        targetType: 'finding',
        targetId: findingId,
        parameters: { revisionNumber: 2, contentHash: r2.contentHash },
      });
      const [approval, proposal] = await Promise.allSettled([
        approveRevision(f.ctx, modB.actor, findingId, 2, r2.contentHash, proof),
        propose(f, modA, findingId, r2, 'medium', 'Concurrent wording'),
      ]);
      expect(proposal.status).toBe('fulfilled');
      const [finding] = await f.ctx.runtime.db
        .select()
        .from(schema.findings)
        .where(eq(schema.findings.id, findingId));
      const revisions = await f.ctx.runtime.db
        .select()
        .from(schema.findingRevisions)
        .where(eq(schema.findingRevisions.findingId, findingId));
      const byNumber = (n: number) => revisions.find((r) => r.revisionNumber === n)?.id;
      const pubs = await f.ctx.runtime.db.select().from(schema.findingPublicationEvents);
      if (approval.status === 'fulfilled') {
        // Approval won the lock: revision 2 became public before revision 3 existed.
        expect(finding?.publishedRevisionId).toBe(byNumber(2));
        expect(pubs).toHaveLength(2);
      } else {
        // The proposal won: revision 2 was no longer the latest, so nothing new was published.
        expect(finding?.publishedRevisionId).toBe(byNumber(1));
        expect(pubs).toHaveLength(1);
      }
      expect(revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2, 3]);
    } finally {
      await f.stop();
    }
  });

  it('emergency suspension hides the finding at once and needs a non-participant review', async () => {
    const f = await startApplicationFixture();
    try {
      const author = await addAssuredStaff(f, 'moderator'),
        approver = await addAssuredStaff(f, 'admin'),
        suspender = await addAssuredStaff(f, 'moderator'),
        reviewer = await addAssuredStaff(f, 'moderator');
      const { findingId } = await acceptedFinding(f, author, 'severe');
      const r1 = await latest(f, author, findingId);
      await approve(f, approver, findingId, 1, r1.contentHash);
      expect((await listFindings(f.ctx, suspender.actor)).map((x) => x.status)).toEqual(['published']);

      const reason = text('Wrong subject');
      await expect(suspendFinding(f.ctx, suspender.actor, findingId, reason)).rejects.toThrow(
        'stepup_required',
      );
      const caseId = await suspendFinding(
        f.ctx,
        suspender.actor,
        findingId,
        reason,
        await suspender.proof({
          action: 'finding.suspend',
          targetType: 'finding',
          targetId: findingId,
          parameters: { reason },
        }),
      );
      const review = await getCase(f.ctx, reviewer.actor, caseId);
      expect(review).toMatchObject({ type: 'suspension_review', status: 'open', suspensionReason: reason });
      // Hidden from the public at once: only the suspension notice remains.
      const pub = await publicFindings(f.ctx.runtime.db, 'eip155:1', address);
      expect(pub.findings).toEqual([]);
      expect(pub.timeline.map((t) => t.kind)).toEqual(['finding_published', 'finding_suspended']);
      expect(JSON.stringify(pub)).not.toContain('Public summary');
      // A severe suspension alerts every admin.
      const jobs = await f.ctx.runtime.db.execute<{ kind: string }>(
        sql`select data->>'kind' as kind from pgboss.job where name = 'identity.security_notice'`,
      );
      expect(jobs.rows.map((r) => r.kind)).toContain('moderation_severe_finding_suspended');
      // Approval stays blocked while the review is open.
      expect((await getFindingHistory(f.ctx, reviewer.actor, findingId)).approvalBlockedReason).toContain(
        'suspension',
      );

      const decide = async (who: Staff, action: 'reinstate_finding' | 'reverse_finding') => {
        const current = await getCase(f.ctx, who.actor, caseId);
        const assigned =
          current.assignedTo?.id === who.actor.actorRef
            ? current
            : await (
                await import('@blacklist/domain')
              ).assignCase(f.ctx, who.actor, caseId, current.version, { to: 'me', takeOver: true });
        const decision = {
          action,
          publicSummary: text('Outcome'),
          internalRationale: text('Review rationale'),
        };
        return decideCase(
          f.ctx,
          who.actor,
          caseId,
          assigned.version,
          decision,
          await who.proof({
            action: `case.${action}`,
            targetType: 'case',
            targetId: caseId,
            parameters: { version: assigned.version, decision },
          }),
        );
      };
      // Participants (author or approver) may not review; the severe suspender may not reverse alone.
      await expect(decide(author, 'reverse_finding')).rejects.toThrow('not_eligible');
      await expect(decide(suspender, 'reverse_finding')).rejects.toThrow('not_eligible');
      const reinstated = await decide(reviewer, 'reinstate_finding');
      expect(reinstated.status).toBe('reinstated');
      const after = await publicFindings(f.ctx.runtime.db, 'eip155:1', address);
      expect(after.findings).toHaveLength(1);
      expect(after.timeline.map((t) => t.kind)).toEqual([
        'finding_published',
        'finding_suspended',
        'finding_reinstated',
      ]);
    } finally {
      await f.stop();
    }
  });
});
