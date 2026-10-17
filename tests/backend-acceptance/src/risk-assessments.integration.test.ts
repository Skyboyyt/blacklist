import { describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  submitReport,
  decideCase,
  approveRevision,
  proposeRevision,
  suspendFinding,
  getFindingHistory,
  getCase,
  assignCase,
  recomputeSubject,
  currentAssessment,
  assessmentHistory,
  storedInputs,
  sweepDueAssessments,
  publicAssessment,
  staffAssessment,
  assess,
  V1_RULESET,
  type UserActor,
  type RiskInput,
} from '@blacklist/domain';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

// Phase 10 slice 2: assessments follow published findings in the same transaction
// (ARCHITECTURE §15.4–§15.7). Stale recomputes never move the result backwards.

type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const text = (s: string) => `${s} — fictional text long enough for validation.`;

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return actor as UserActor;
}

async function decide(
  f: ApplicationFixture,
  who: Staff,
  id: string,
  decision: { action: string } & Record<string, unknown>,
) {
  const current = await getCase(f.ctx, who.actor, id);
  const version = current.version;
  if (decision.action === 'start_review') return decideCase(f.ctx, who.actor, id, version, decision);
  return decideCase(
    f.ctx,
    who.actor,
    id,
    version,
    decision,
    await who.proof({
      action: `case.${decision.action}`,
      targetType: 'case',
      targetId: id,
      parameters: { version, decision },
    }),
  );
}

async function approve(
  f: ApplicationFixture,
  who: Staff,
  findingId: string,
  revisionNumber: number,
  contentHash: string,
) {
  return approveRevision(
    f.ctx,
    who.actor,
    findingId,
    revisionNumber,
    contentHash,
    await who.proof({
      action: 'finding.approve',
      targetType: 'finding',
      targetId: findingId,
      parameters: { revisionNumber, contentHash },
    }),
  );
}

/** A finding at `severity`, authored by `author` and still awaiting approval. */
async function proposedFinding(f: ApplicationFixture, author: Staff, address: string, severity: string) {
  const reporter = await member(f);
  const { id } = await submitReport(
    f.ctx,
    reporter,
    {
      category: 'phishing',
      title: 'Fictional report for risk',
      subjects: [{ chain: 'ethereum', address }],
      narrative: text('Narrative'),
      incidentDate: '2026-10-01',
      txRefs: [{ chain: 'ethereum', hash: '0x' + '34'.repeat(32) }],
      urls: [],
      evidence: [],
    },
    'ip4:192.0.2.93',
  );
  await decide(f, author, id, { action: 'start_review' });
  await decide(f, author, id, {
    action: 'accept_report',
    severity,
    publicSummary: text('Public summary'),
    internalRationale: text('Rationale'),
  });
  const [c] = await f.ctx.runtime.db
    .select()
    .from(schema.moderationCases)
    .where(eq(schema.moderationCases.id, id));
  const [finding] = await f.ctx.runtime.db
    .select()
    .from(schema.findings)
    .where(eq(schema.findings.id, c?.findingId ?? ''));
  const [revision] = await f.ctx.runtime.db
    .select()
    .from(schema.findingRevisions)
    .where(eq(schema.findingRevisions.findingId, finding?.id ?? ''));
  if (!finding || !revision) throw new Error('fixture_finding_missing');
  return { findingId: finding.id, subjectId: finding.subjectId, contentHash: revision.contentHash };
}

describe('Phase 10 slice 2: assessments follow published findings', () => {
  it('scores on publication, revision, suspension and reinstatement; stale recomputes change nothing', async () => {
    const f = await startApplicationFixture();
    try {
      const author = await addAssuredStaff(f, 'moderator'),
        reviewer = await addAssuredStaff(f, 'moderator');
      const address = '0x' + 'a1'.repeat(20);
      const { findingId, subjectId, contentHash } = await proposedFinding(f, author, address, 'high');
      // Unpublished: nothing is assessed.
      expect(await currentAssessment(f.ctx.runtime.db, subjectId)).toBeNull();
      expect(await staffAssessment(f.ctx.runtime.db, subjectId)).toMatchObject({ kind: 'unscored' });

      await approve(f, author, findingId, 1, contentHash);
      const first = await currentAssessment(f.ctx.runtime.db, subjectId);
      expect(first?.assessment).toMatchObject({
        seq: 1,
        score: 55,
        band: 'high',
        ceiling: 74,
        trigger: 'signal_change',
      });
      expect(await staffAssessment(f.ctx.runtime.db, subjectId)).toMatchObject({
        kind: 'scored',
        score: 55,
        band: 'high',
        calibration: 'proposal_not_signed_off',
        contributions: [{ factorCode: 'finding.high', contribution: 55, evidenceRefs: [findingId] }],
      });
      // Public bands off (O-12): nothing about the assessment leaves the server.
      const hidden = await publicAssessment(f.ctx.runtime.db, subjectId, {
        publicBands: false,
        disputeState: 'none',
      });
      expect(hidden).toMatchObject({ band: 'not_assessed', factors: [] });
      // Public bands on: the band and reasons, never a number.
      const shown = await publicAssessment(f.ctx.runtime.db, subjectId, {
        publicBands: true,
        disputeState: 'none',
      });
      expect(shown).toMatchObject({ band: 'high', factors: [{ code: 'finding.high', weight: 'primary' }] });
      expect('score' in shown).toBe(false);
      expect(
        JSON.stringify({
          ...shown,
          asOf: '',
          factors: shown.factors.map((x) => ({ ...x, id: '', observedAt: '' })),
        }),
      ).not.toMatch(/55|74/);

      // A new published revision supersedes the old signal.
      await proposeRevision(
        f.ctx,
        reviewer.actor,
        findingId,
        { revisionNumber: 1, contentHash },
        {
          severity: 'medium',
          publicSummary: text('Second summary'),
          internalRationale: text('Second rationale'),
        },
      );
      const r2 = (await getFindingHistory(f.ctx, reviewer.actor, findingId)).revisions.at(-1);
      await approve(f, author, findingId, 2, r2?.contentHash ?? '');
      expect((await currentAssessment(f.ctx.runtime.db, subjectId))?.assessment).toMatchObject({
        seq: 2,
        score: 30,
        band: 'moderate',
      });
      const signals = await f.ctx.runtime.db
        .select()
        .from(schema.riskSignals)
        .where(eq(schema.riskSignals.subjectId, subjectId));
      expect(signals.map((s) => [s.factorCode, s.status]).sort()).toEqual([
        ['finding.high', 'superseded'],
        ['finding.medium', 'active'],
      ]);

      // Suspension: the finding no longer counts and the earlier assessment is annotated, not edited.
      const reason = text('Wrong subject');
      const reviewCase = await suspendFinding(
        f.ctx,
        reviewer.actor,
        findingId,
        reason,
        await reviewer.proof({
          action: 'finding.suspend',
          targetType: 'finding',
          targetId: findingId,
          parameters: { reason },
        }),
      );
      const suspended = await currentAssessment(f.ctx.runtime.db, subjectId);
      expect(suspended?.assessment).toMatchObject({ seq: 3, score: null, band: 'not_assessed' });
      const notes = await f.ctx.runtime.db
        .select()
        .from(schema.assessmentAnnotations)
        .where(eq(schema.assessmentAnnotations.subjectId, subjectId));
      expect(notes.map((n) => n.kind)).toEqual(['finding_suspended']);

      // Reinstatement by a non-participant brings it back as a new assessment.
      const third = await addAssuredStaff(f, 'moderator');
      const c = await getCase(f.ctx, third.actor, reviewCase);
      const assigned = await assignCase(f.ctx, third.actor, reviewCase, c.version, { to: 'me' });
      const decision = {
        action: 'reinstate_finding',
        publicSummary: text('Reinstated'),
        internalRationale: text('Checked'),
      };
      await decideCase(
        f.ctx,
        third.actor,
        reviewCase,
        assigned.version,
        decision,
        await third.proof({
          action: 'case.reinstate_finding',
          targetType: 'case',
          targetId: reviewCase,
          parameters: { version: assigned.version, decision },
        }),
      );
      expect((await currentAssessment(f.ctx.runtime.db, subjectId))?.assessment).toMatchObject({
        seq: 4,
        score: 30,
      });

      // A delayed or repeated recompute reads current signals: no new row, no step back.
      const again = await f.ctx.runtime.transaction((tx) => recomputeSubject(tx, subjectId, 'expiry'));
      expect(again).toMatchObject({ created: false, seq: 4 });
      // No V1 input expires, so the expiry sweep has nothing to do.
      expect(await sweepDueAssessments(f.ctx.runtime)).toBe(0);
      await expect(
        f.ctx.runtime.db
          .update(schema.currentRiskAssessments)
          .set({ seq: 1, assessmentId: first?.assessment.id ?? '' })
          .where(eq(schema.currentRiskAssessments.subjectId, subjectId)),
      ).rejects.toThrow();
      await expect(
        f.ctx.runtime.db
          .delete(schema.currentRiskAssessments)
          .where(eq(schema.currentRiskAssessments.subjectId, subjectId)),
      ).rejects.toThrow();
      // History is append-only.
      await expect(
        f.ctx.runtime.db
          .update(schema.riskAssessments)
          .set({ band: 'low' })
          .where(eq(schema.riskAssessments.subjectId, subjectId)),
      ).rejects.toThrow();

      // Replay: every stored assessment is reproduced from its stored inputs and ruleset.
      const stored = await assessmentHistory(f.ctx.runtime.db, subjectId);
      expect(stored.map((a) => a.seq)).toEqual([4, 3, 2, 1]);
      const inputs = await storedInputs(
        f.ctx.runtime.db,
        stored.map((a) => a.id),
      );
      for (const a of stored) {
        const own: RiskInput[] = inputs
          .filter((i) => i.assessmentId === a.id)
          .map((i) => ({
            signalId: i.signalId,
            signalRevision: i.signalRevision,
            factorCode: i.factorCode,
            tier: i.tier as RiskInput['tier'],
            provenance: i.provenance,
            status: i.statusAtEvaluation as RiskInput['status'],
            sourceRevision: i.sourceRevision,
            validUntil: i.validUntil?.toISOString() ?? null,
            evidenceRefs: i.evidenceRefs as string[],
            independentlyApproved: i.independentlyApproved,
          }));
        const re = assess(
          own,
          a.coverage as { findingsReviewed: boolean; chainFactsVerified: boolean },
          V1_RULESET,
          a.evaluationTime.toISOString(),
        );
        expect([re.score, re.band, re.effectiveInputsHash, re.rulesetChecksum]).toEqual([
          a.score,
          a.band,
          a.effectiveInputsHash,
          a.rulesetChecksum,
        ]);
      }
    } finally {
      await f.stop();
    }
  });

  it('reaches Severe only through an independently approved severe finding', async () => {
    const f = await startApplicationFixture();
    try {
      const author = await addAssuredStaff(f, 'moderator'),
        admin = await addAssuredStaff(f, 'admin');
      const { findingId, subjectId, contentHash } = await proposedFinding(
        f,
        author,
        '0x' + 'b2'.repeat(20),
        'severe',
      );
      await expect(approve(f, author, findingId, 1, contentHash)).rejects.toThrow('not_eligible');
      expect(await currentAssessment(f.ctx.runtime.db, subjectId)).toBeNull();
      await approve(f, admin, findingId, 1, contentHash);
      expect((await currentAssessment(f.ctx.runtime.db, subjectId))?.assessment).toMatchObject({
        score: 80,
        band: 'severe',
        ceiling: 100,
        ceilingReason: 'severe_finding',
      });
    } finally {
      await f.stop();
    }
  });
});
