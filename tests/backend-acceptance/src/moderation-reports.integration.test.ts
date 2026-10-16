import { randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { schema, eq } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  submitReport,
  listOwnSubmissions,
  getOwnSubmission,
  withdrawOwnSubmission,
  respondToInfoRequest,
  listOwnNotices,
  caseQueue,
  getCase,
  assignCase,
  addCaseNote,
  decideCase,
  type UserActor,
} from '@blacklist/domain';
import { createServer } from '../../../apps/api/src/server.ts';
import {
  startApplicationFixture,
  fixtureUrl,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

const prefix = 'ip4:192.0.2.81';
const address = '0x' + 'ab'.repeat(20);
const request = (overrides: Record<string, unknown> = {}) => ({
  category: 'phishing',
  title: 'Fictional phishing report',
  subjects: [{ chain: 'ethereum' as const, address }],
  narrative: 'A fictional narrative long enough to be accepted by validation.',
  incidentDate: '2026-10-01',
  txRefs: [{ chain: 'ethereum' as const, hash: '0x' + 'cd'.repeat(32) }],
  urls: ['https://phish.example.invalid/login'],
  evidence: [],
  ...overrides,
});
const queueQuery = { assignment: 'any', sort: 'sla_due', page: 1 } as const;

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return { user, actor: actor as UserActor, cookie };
}
const rejectAction = (id: string, version: number, decision: Record<string, unknown>) => ({
  action: `case.${String(decision['action'])}`,
  targetType: 'case',
  targetId: id,
  parameters: { version, decision },
});

describe('Phase 9a slice 2: private reports and the staff case workflow', () => {
  it('routes enforce account kind and permission; unknown fields are refused', async () => {
    const f = await startApplicationFixture();
    const app = createServer(
      f.ctx,
      readApiConfig({
        NODE_ENV: 'test',
        DATABASE_URL: fixtureUrl(f.h, 'runtime'),
        APP_ORIGIN: f.ctx.settings.origin,
        BETTER_AUTH_SECRET: f.ctx.settings.secret,
        INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
        WEBAUTHN_RP_ID: f.ctx.settings.rpId,
      }),
      false,
    );
    try {
      const m = await member(f);
      const moderator = await addAssuredStaff(f, 'moderator');
      const staffCookie = moderator.headers.get('cookie') ?? '';
      const post = (url: string, body: unknown, cookie?: string) =>
        app.inject({
          method: 'POST',
          url,
          headers: {
            origin: f.ctx.settings.origin,
            'content-type': 'application/json',
            ...(cookie ? { cookie } : {}),
          },
          payload: JSON.stringify(body),
        });
      const get = (url: string, cookie?: string) =>
        app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
      expect((await get('/api/v1/me/submissions')).statusCode).toBe(401);
      expect((await get('/api/v1/mod/queue', m.cookie)).statusCode).toBe(403);
      expect((await post('/api/v1/reports', request(), staffCookie)).statusCode).toBe(403);
      expect((await post('/api/v1/reports', { ...request(), status: 'accepted' }, m.cookie)).statusCode).toBe(
        400,
      );
      const created = await post('/api/v1/reports', request(), m.cookie);
      expect(created.statusCode).toBe(200);
      const id = (created.json() as { data: { id: string } }).data.id;
      expect((await get(`/api/v1/me/submissions/${id}`, m.cookie)).statusCode).toBe(200);
      const queue = await get('/api/v1/mod/queue?assignment=unassigned&page=1', staffCookie);
      expect(queue.statusCode).toBe(200);
      expect(queue.body).toContain(id);
      expect(queue.body).not.toContain(m.user.email);
      const detail = await get(`/api/v1/mod/cases/${id}`, staffCookie);
      expect(detail.statusCode).toBe(200);
      expect(detail.body).not.toContain(m.user.email);
      expect(detail.body).not.toContain(m.user.id);
      expect(
        (
          await post(
            `/api/v1/mod/cases/${id}/decisions`,
            { expectedVersion: 1, decision: { action: 'start_review' }, role: 'admin' },
            staffCookie,
          )
        ).statusCode,
      ).toBe(400);

      // Slice 4 redress routes: member accounts only; findingId must match the path.
      const missing = '00000000-0000-4000-8000-000000000000';
      const sol = 'So11111111111111111111111111111111111111112';
      expect((await get(`/api/v1/findings/${missing}/appeal-target`)).statusCode).toBe(401);
      expect((await get(`/api/v1/findings/${missing}/appeal-target`, staffCookie)).statusCode).toBe(403);
      expect((await get(`/api/v1/findings/${missing}/appeal-target`, m.cookie)).statusCode).toBe(404);
      expect((await post(`/api/v1/findings/${missing}/standing-challenges`, {}, m.cookie)).statusCode).toBe(
        404,
      );
      expect(
        (await post(`/api/v1/findings/${missing}/standing-challenges`, {}, staffCookie)).statusCode,
      ).toBe(403);
      const appeal = {
        findingId: missing,
        grounds: 'Fictional grounds that are long enough to validate.',
        standing: {
          mechanism: 'documentary',
          explanation: 'Fictional records',
          evidence: [],
          urls: ['https://example.org'],
        },
      };
      expect((await post(`/api/v1/findings/${randomUUID()}/appeals`, appeal, m.cookie)).statusCode).toBe(404);
      expect(
        (await post(`/api/v1/findings/${missing}/appeals`, { ...appeal, status: 'upheld' }, m.cookie))
          .statusCode,
      ).toBe(400);
      expect((await post(`/api/v1/findings/${missing}/appeals`, appeal, staffCookie)).statusCode).toBe(403);
      const target = await get(`/api/v1/responses/target?chain=solana&address=${sol}`, m.cookie);
      expect(target.statusCode).toBe(200);
      expect(target.json()).toMatchObject({ data: { alreadyResponding: false } });
      expect(
        (await get(`/api/v1/responses/target?chain=solana&address=${sol}`, staffCookie)).statusCode,
      ).toBe(403);
      const challenge = await post(
        '/api/v1/responses/standing-challenges',
        { kind: 'address', chain: 'solana', address: sol },
        m.cookie,
      );
      expect(challenge.statusCode).toBe(200);
      expect(challenge.body).toContain('does not authorize any transaction');
      expect(
        (
          await post(
            '/api/v1/responses',
            {
              target: { kind: 'address', chain: 'solana', address: sol },
              body: 'x',
              standing: appeal.standing,
            },
            m.cookie,
          )
        ).statusCode,
      ).toBe(400);
      expect((await post('/api/v1/responses', {}, staffCookie)).statusCode).toBe(403);

      // Slice 3 finding routes over HTTP: accept, approve, revise, reject and suspend.
      const data = <T>(r: { json: () => unknown }) => (r.json() as { data: T }).data;
      const started = await post(
        `/api/v1/mod/cases/${id}/decisions`,
        { expectedVersion: 1, decision: { action: 'start_review' } },
        staffCookie,
      );
      expect(started.statusCode).toBe(200);
      const acceptDecision = {
        action: 'accept_report',
        severity: 'medium',
        publicSummary: 'Fictional public summary long enough to validate.',
        internalRationale: 'Fictional rationale long enough to validate.',
      };
      const startedVersion = data<{ version: number }>(started).version;
      const accepted = await post(
        `/api/v1/mod/cases/${id}/decisions`,
        {
          expectedVersion: startedVersion,
          decision: acceptDecision,
          assertion: await moderator.proof({
            action: 'case.accept_report',
            targetType: 'case',
            targetId: id,
            parameters: { version: startedVersion, decision: acceptDecision },
          }),
        },
        staffCookie,
      );
      expect(accepted.statusCode).toBe(200);
      expect((await get('/api/v1/mod/approvals', m.cookie)).statusCode).toBe(403);
      const approvals = await get('/api/v1/mod/approvals', staffCookie);
      expect(approvals.statusCode).toBe(200);
      const [r1] = data<{ findingId: string; contentHash: string }[]>(approvals);
      if (!r1) throw new Error('fixture_revision_missing');
      const fid = r1.findingId;
      const approvePath = `/api/v1/mod/findings/${fid}/approvals`;
      expect(
        (
          await post(
            approvePath,
            { event: 'approve', revisionNumber: 1, contentHash: r1.contentHash },
            staffCookie,
          )
        ).statusCode,
      ).toBe(400);
      const approved = await post(
        approvePath,
        {
          event: 'approve',
          revisionNumber: 1,
          contentHash: r1.contentHash,
          assertion: await moderator.proof({
            action: 'finding.approve',
            targetType: 'finding',
            targetId: fid,
            parameters: { revisionNumber: 1, contentHash: r1.contentHash },
          }),
        },
        staffCookie,
      );
      expect(approved.statusCode).toBe(200);
      expect(data<unknown[]>(await get('/api/v1/mod/findings', staffCookie))).toHaveLength(1);
      expect((await get(`/api/v1/mod/findings/${fid}/revisions`, staffCookie)).statusCode).toBe(200);
      const revised = await post(
        `/api/v1/mod/findings/${fid}/revisions`,
        {
          base: { revisionNumber: 1, contentHash: r1.contentHash },
          draft: {
            severity: 'low',
            publicSummary: 'Second fictional public summary text.',
            internalRationale: 'Second fictional rationale text here.',
          },
        },
        staffCookie,
      );
      expect(revised.statusCode).toBe(200);
      const rationale = 'Fictional rejection rationale.';
      const rejected = await post(
        approvePath,
        {
          event: 'reject',
          revisionNumber: 2,
          rationale,
          assertion: await moderator.proof({
            action: 'finding.reject',
            targetType: 'finding',
            targetId: fid,
            parameters: { revisionNumber: 2, rationale },
          }),
        },
        staffCookie,
      );
      expect(rejected.statusCode).toBe(200);
      const reason = 'Fictional suspension reason text.';
      const suspended = await post(
        `/api/v1/mod/findings/${fid}/suspend`,
        {
          reason,
          assertion: await moderator.proof({
            action: 'finding.suspend',
            targetType: 'finding',
            targetId: fid,
            parameters: { reason },
          }),
        },
        staffCookie,
      );
      expect(suspended.statusCode).toBe(200);
      expect(data<{ type: string }>(suspended).type).toBe('suspension_review');
    } finally {
      await app.close();
      await f.stop();
    }
  });

  it('keeps reports private, runs the review lifecycle and refuses out-of-turn decisions', async () => {
    const f = await startApplicationFixture();
    try {
      const reporter = await member(f),
        other = await member(f);
      const modA = await addAssuredStaff(f, 'moderator'),
        modB = await addAssuredStaff(f, 'moderator'),
        reviewer = await addAssuredStaff(f, 'appeal_reviewer');

      await expect(
        submitReport(
          f.ctx,
          reporter.actor,
          request({ evidence: [{ name: 'a.png', type: 'image/png', size: 10 }] }),
          prefix,
        ),
      ).rejects.toThrow('evidence_unavailable');
      const { id } = await submitReport(f.ctx, reporter.actor, request(), prefix);

      // Private: another member cannot tell it exists; an appeal reviewer does not see it.
      await expect(getOwnSubmission(f.ctx, other.actor, id)).rejects.toThrow('not_found');
      expect(await listOwnSubmissions(f.ctx, other.actor)).toEqual([]);
      await expect(getCase(f.ctx, reviewer.actor, id)).rejects.toThrow('not_found');
      expect((await caseQueue(f.ctx, reviewer.actor, queueQuery)).totalItems).toBe(0);
      // Unreviewed reports create nothing public.
      expect(await f.ctx.runtime.db.select().from(schema.findings)).toEqual([]);

      const mine = await getOwnSubmission(f.ctx, reporter.actor, id);
      expect(mine).toMatchObject({ status: 'Waiting for review', canWithdraw: true, version: 1 });
      expect(mine.details.find((d) => d.label.startsWith('Link'))?.value).toBe(
        'hxxps://phish[.]example[.]invalid/login',
      );

      const queue = await caseQueue(f.ctx, modA.actor, queueQuery);
      expect(queue.counts.openReports).toBe(1);
      expect(queue.items[0]).toMatchObject({ id, status: 'queued', assignedTo: null });

      // Deciding needs the case to be yours; versions guard concurrent edits.
      await expect(
        decideCase(f.ctx, modA.actor, id, 1, {
          action: 'request_info',
          messageToSubmitter: 'Please add the date of the first contact.',
        }),
      ).rejects.toThrow();
      const started = await decideCase(f.ctx, modA.actor, id, 1, { action: 'start_review' });
      expect(started).toMatchObject({ status: 'in_review', assignedTo: { id: modA.actor.actorRef } });
      await expect(addCaseNote(f.ctx, modB.actor, id, 1, 'stale version')).rejects.toThrow('conflict');
      await expect(
        decideCase(f.ctx, modB.actor, id, started.version, {
          action: 'request_info',
          messageToSubmitter: 'Please add the date of the first contact.',
        }),
      ).rejects.toThrow('not_eligible');
      await expect(assignCase(f.ctx, modB.actor, id, started.version, { to: 'me' })).rejects.toThrow(
        'not_eligible',
      );
      await expect(assignCase(f.ctx, modB.actor, id, started.version, { to: 'nobody' })).rejects.toThrow(
        'forbidden',
      );
      const noted = await addCaseNote(
        f.ctx,
        modA.actor,
        id,
        started.version,
        'Internal: checked the transaction.',
      );

      const asked = await decideCase(f.ctx, modA.actor, id, noted.version, {
        action: 'request_info',
        messageToSubmitter: 'Please add the date of the first contact.',
      });
      expect(asked.status).toBe('needs_info');
      const waiting = await getOwnSubmission(f.ctx, reporter.actor, id);
      expect(waiting).toMatchObject({
        needsAction: true,
        infoRequest: 'Please add the date of the first contact.',
      });
      expect(JSON.stringify(waiting)).not.toContain('Internal: checked');
      expect(JSON.stringify(waiting)).not.toContain(modA.actor.actorRef);
      await expect(
        respondToInfoRequest(f.ctx, reporter.actor, id, 1, {
          message: 'First contact was 1 October.',
          evidence: [],
        }),
      ).rejects.toThrow('conflict');
      const replied = await respondToInfoRequest(f.ctx, reporter.actor, id, waiting.version, {
        message: 'First contact was 1 October.',
        evidence: [],
      });
      expect(replied.status).toBe('In review');
      expect(replied.timeline.map((t) => t.label)).toContain('You replied');

      const current = await getCase(f.ctx, modA.actor, id);
      expect(current.submitterMessages.map((m) => m.text)).toEqual(['First contact was 1 October.']);
      expect(current.history.map((h) => h.action)).toEqual(
        expect.arrayContaining([
          'case_created',
          'case_assigned',
          'case_note_added',
          'info_requested',
          'case_status_changed',
        ]),
      );
      if (current.type !== 'report_review') throw new Error('fixture_case_type');
      expect(current.reporterRef).toMatch(/^R-[0-9A-F]{6}$/);

      // Consequential decisions need an action-bound step-up for this exact decision.
      const decision = {
        action: 'reject_report',
        reason: 'insufficient_evidence',
        internalRationale: 'Only one transaction and no corroboration.',
      };
      await expect(decideCase(f.ctx, modA.actor, id, current.version, decision)).rejects.toThrow(
        'stepup_required',
      );
      await expect(
        decideCase(
          f.ctx,
          modA.actor,
          id,
          current.version,
          decision,
          await modA.proof(rejectAction(id, current.version, { ...decision, reason: 'duplicate' })),
        ),
      ).rejects.toThrow();
      await expect(
        decideCase(f.ctx, modA.actor, id, current.version, {
          action: 'accept_report',
          severity: 'high',
          publicSummary: 'x'.repeat(20),
          internalRationale: 'y'.repeat(20),
        }),
      ).rejects.toThrow('stepup_required');
      const rejected = await decideCase(
        f.ctx,
        modA.actor,
        id,
        current.version,
        decision,
        await modA.proof(rejectAction(id, current.version, decision)),
      );
      expect(rejected).toMatchObject({ status: 'rejected', submitterReason: 'insufficient_evidence' });

      const outcome = await getOwnSubmission(f.ctx, reporter.actor, id);
      expect(outcome).toMatchObject({
        status: 'Not accepted',
        submitterReason: 'insufficient_evidence',
        canWithdraw: false,
      });
      await expect(withdrawOwnSubmission(f.ctx, reporter.actor, id, outcome.version)).rejects.toThrow(
        'invalid_transition',
      );
      expect((await listOwnNotices(f.ctx, reporter.actor)).map((n) => n.text).join(' ')).toContain(
        'A decision was recorded',
      );

      // A second report can be withdrawn before any decision.
      const second = await submitReport(
        f.ctx,
        reporter.actor,
        request({ title: 'Second fictional report' }),
        prefix,
      );
      const withdrawn = await withdrawOwnSubmission(f.ctx, reporter.actor, second.id, 1);
      expect(withdrawn).toMatchObject({ status: 'Withdrawn', canWithdraw: false });
      const [history] = await f.ctx.runtime.db
        .select()
        .from(schema.reportStatusHistory)
        .where(eq(schema.reportStatusHistory.toStatus, 'withdrawn'));
      expect(history?.fromStatus).toBe('queued');
    } finally {
      await f.stop();
    }
  });
});
