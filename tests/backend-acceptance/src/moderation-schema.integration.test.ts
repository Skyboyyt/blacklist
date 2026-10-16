import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { schema, eq, sql } from '@blacklist/db';
import { startApplicationFixture } from './application-fixture.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Phase 9a schema guards (moderation §2–§4, data-model §5–§6)', () => {
  it('keeps history append-only for the runtime role and ties system publication to a matching approval', async () => {
    const f = await startApplicationFixture();
    try {
      const db = f.ctx.runtime.db;
      const reporter = await f.addUser();
      const [subject] = await db.insert(schema.subjects).values({ kind: 'address' }).returning();
      if (!subject) throw new Error('fixture_subject_missing');
      await db
        .insert(schema.addresses)
        .values({ subjectId: subject.id, chainId: 'eip155:1', address: '0x' + 'ab'.repeat(20) });
      // An address row cannot point at a subject of another kind.
      const [domainSubject] = await db.insert(schema.subjects).values({ kind: 'domain' }).returning();
      if (!domainSubject) throw new Error('fixture_subject_missing');
      await expect(
        db
          .insert(schema.addresses)
          .values({ subjectId: domainSubject.id, chainId: 'eip155:1', address: '0x' + 'cd'.repeat(20) }),
      ).rejects.toThrow();

      const [report] = await db
        .insert(schema.reports)
        .values({
          reporterUserId: reporter.id,
          category: 'phishing',
          title: 'Fictional report',
          narrative: 'Fictional narrative.',
          status: 'submitted',
        })
        .returning();
      if (!report) throw new Error('fixture_report_missing');
      const [history] = await db
        .insert(schema.reportStatusHistory)
        .values({ reportId: report.id, toStatus: 'submitted', revision: 1, actorRef: 'fictional-ref' })
        .returning();
      if (!history) throw new Error('fixture_history_missing');
      await expect(
        db
          .update(schema.reportStatusHistory)
          .set({ note: 'edited' })
          .where(eq(schema.reportStatusHistory.id, history.id)),
      ).rejects.toThrow();
      await expect(
        db.delete(schema.reportStatusHistory).where(eq(schema.reportStatusHistory.id, history.id)),
      ).rejects.toThrow();
      await expect(
        db.insert(schema.reports).values({
          reporterUserId: reporter.id,
          category: 'phishing',
          title: 'Bad status',
          narrative: 'x',
          status: 'public',
        }),
      ).rejects.toThrow();

      // Evidence columns must match their kind.
      await expect(
        db.insert(schema.evidenceItems).values({
          kind: 'transaction_ref',
          submittedByRef: 'fictional-ref',
          state: 'available',
          statementText: 'wrong column',
        }),
      ).rejects.toThrow();

      const [finding] = await db
        .insert(schema.findings)
        .values({ subjectId: subject.id, status: 'proposed' })
        .returning();
      if (!finding) throw new Error('fixture_finding_missing');
      const contentHash = hash('fictional revision');
      const [revision] = await db
        .insert(schema.findingRevisions)
        .values({
          findingId: finding.id,
          revisionNumber: 1,
          authorRef: 'author-ref',
          subjectId: subject.id,
          findingType: 'phishing',
          severity: 'high',
          publicSummary: 'Fictional summary.',
          internalRationale: 'Fictional rationale.',
          evidenceSet: [],
          linkedFactorCodes: [],
          policyVersion: '2026-10',
          contentHash,
        })
        .returning();
      if (!revision) throw new Error('fixture_revision_missing');
      await expect(
        db
          .update(schema.findingRevisions)
          .set({ publicSummary: 'edited' })
          .where(eq(schema.findingRevisions.id, revision.id)),
      ).rejects.toThrow();

      const approval = async (event: 'approve' | 'reject', revisionHash = contentHash) => {
        const [row] = await db
          .insert(schema.findingApprovalEvents)
          .values({
            findingId: finding.id,
            revisionId: revision.id,
            revisionContentHash: revisionHash,
            approverRef: 'approver-ref',
            event,
            rationale: event === 'reject' ? 'Fictional rejection rationale.' : null,
            stepupChallengeId: randomUUID(),
          })
          .returning();
        if (!row) throw new Error('fixture_approval_missing');
        return row;
      };
      // A rejection needs a rationale; an approval of a non-matching hash cannot publish.
      await expect(
        db.insert(schema.findingApprovalEvents).values({
          findingId: finding.id,
          revisionId: revision.id,
          revisionContentHash: contentHash,
          approverRef: 'approver-ref',
          event: 'reject',
          stepupChallengeId: randomUUID(),
        }),
      ).rejects.toThrow();
      const publish = (causeApprovalEventId: string) =>
        db.insert(schema.findingPublicationEvents).values({
          findingId: finding.id,
          revisionId: revision.id,
          causeApprovalEventId,
        });
      await expect(publish((await approval('reject')).id)).rejects.toThrow();
      await expect(publish((await approval('approve', hash('other content'))).id)).rejects.toThrow();
      const good = await approval('approve');
      await publish(good.id);
      // One publication per approval; the actor is always the system.
      await expect(publish(good.id)).rejects.toThrow();
      await expect(
        db.insert(schema.findingPublicationEvents).values({
          findingId: finding.id,
          revisionId: revision.id,
          causeApprovalEventId: (await approval('approve')).id,
          actorType: 'user',
        }),
      ).rejects.toThrow();
      await expect(
        db.delete(schema.findingApprovalEvents).where(eq(schema.findingApprovalEvents.id, good.id)),
      ).rejects.toThrow();
      // The same NULL-passing CHECK existed for staff recovery objections (0006); 0007 fixes it.
      const [recoverySubject] = await db.select().from(schema.user).where(eq(schema.user.id, reporter.id));
      if (!recoverySubject) throw new Error('fixture_user_missing');
      const [recovery] = await db
        .insert(schema.recoveries)
        .values({ subjectUserId: recoverySubject.id, openedBy: 'opener-ref', state: 'objection_window' })
        .returning();
      if (!recovery) throw new Error('fixture_case_missing');
      await expect(
        db
          .insert(schema.recoveryObjections)
          .values({ caseId: recovery.id, objector: 'staff-ref', objectorKind: 'staff' }),
      ).rejects.toThrow();
      await db
        .insert(schema.recoveryObjections)
        .values({ caseId: recovery.id, objector: 'subject-ref', objectorKind: 'subject' });
      const grants = await db.execute<{ allowed: boolean }>(
        sql`select has_table_privilege(current_user, 'blacklist.finding_publication_events', 'UPDATE') as allowed`,
      );
      expect(grants.rows[0]?.allowed).toBe(false);
    } finally {
      await f.stop();
    }
  });
});
