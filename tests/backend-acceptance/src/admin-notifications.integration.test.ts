import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readApiConfig } from '@blacklist/config';
import { describe, it, expect } from 'vitest';
import { schema, eq, and, sql } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  submitReport,
  decideCase,
  assignCase,
  getCase,
  approveRevision,
  appealChallenge,
  submitAppeal,
  respondToInfoRequest,
  getOwnSubmission,
  listOwnNotices,
  escalateOverdueAppeals,
  staffAdministration,
  addLabel,
  retireLabel,
  listLabels,
  publicLabels,
  suppressSignal,
  liftSuppression,
  listSuppressions,
  publicAssessment,
  staffAssessment,
  recomputeSubject,
  auditEntries,
  suspendAccount,
  bootstrapStaff,
  type UserActor,
  type CaseDecisionInput,
} from '@blacklist/domain';
import {
  startApplicationFixture,
  syntheticPassword,
  fixtureUrl,
  type ApplicationFixture,
} from './application-fixture.ts';
import { createServer } from '../../../apps/api/src/server.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

// Phase 10 slice 4: notifications, 14-day appeal escalation, labels, signal suppressions,
// the audit viewer and member suspension (Phase 10 plan, slice 4 tests).

type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const prefix = 'ip4:192.0.2.95';
const text = (s: string) => `${s} — fictional text long enough for validation.`;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes: Uint8Array) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}
function wallet() {
  const pair = generateKeyPairSync('ed25519');
  const address = base58(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  return { address, sign: (message: string) => base58(sign(null, Buffer.from(message), pair.privateKey)) };
}

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return { actor: actor as UserActor, cookie, userId: user.id };
}

async function decide(f: ApplicationFixture, who: Staff, caseId: string, decision: CaseDecisionInput) {
  const current = await getCase(f.ctx, who.actor, caseId);
  const assigned =
    current.assignedTo?.id === who.actor.actorRef || decision.action === 'start_review'
      ? current
      : await assignCase(f.ctx, who.actor, caseId, current.version, { to: 'me', takeOver: true });
  const quiet = ['start_review', 'request_info'].includes(decision.action);
  return decideCase(
    f.ctx,
    who.actor,
    caseId,
    assigned.version,
    decision,
    quiet
      ? undefined
      : await who.proof({
          action: `case.${decision.action}`,
          targetType: 'case',
          targetId: caseId,
          parameters: { version: assigned.version, decision },
        }),
  );
}

async function report(f: ApplicationFixture, who: UserActor, address: string, title: string) {
  return submitReport(
    f.ctx,
    who,
    {
      category: 'phishing',
      title,
      subjects: [{ chain: 'solana', address }],
      narrative: text('Private narrative'),
      incidentDate: '2026-10-01',
      txRefs: [],
      urls: [],
      evidence: [],
    },
    prefix,
  );
}

const subjectOf = async (f: ApplicationFixture, address: string) =>
  (await f.ctx.runtime.db.select().from(schema.addresses).where(eq(schema.addresses.address, address)))[0]
    ?.subjectId ?? '';

describe('Phase 10 slice 4: notifications and escalation', () => {
  it('notifies members with IDs and template keys only, and escalates an overdue appeal once', async () => {
    const f = await startApplicationFixture();
    try {
      const reporter = await member(f),
        other = await member(f);
      const author = await addAssuredStaff(f, 'moderator'),
        approver = await addAssuredStaff(f, 'admin'),
        secondAdmin = await addAssuredStaff(f, 'admin');
      const owner = wallet();
      const title = 'Secret report title for notices';
      const { id } = await report(f, reporter.actor, owner.address, title);
      await decide(f, author, id, { action: 'start_review' });
      await decide(f, author, id, { action: 'request_info', messageToSubmitter: text('Private request') });
      const asked = await getOwnSubmission(f.ctx, reporter.actor, id);
      await respondToInfoRequest(f.ctx, reporter.actor, id, asked.version, {
        message: text('Private reply'),
        evidence: [],
      });
      await decide(f, author, id, {
        action: 'accept_report',
        severity: 'high',
        publicSummary: text('Public summary'),
        internalRationale: text('Private rationale'),
      });
      const notices = await listOwnNotices(f.ctx, reporter.actor);
      expect(notices.map((n) => n.text)).toEqual([
        'A decision was recorded on one of your submissions: Accepted.',
        'Staff asked for more information about one of your submissions.',
        'Your submission was received. It is private and has no public effect until staff review it.',
      ]);
      expect(notices.every((n) => n.href === `/reports/${id}`)).toBe(true);
      expect(await listOwnNotices(f.ctx, other.actor)).toEqual([]);
      // Stored rows carry IDs and fixed codes only, never member or staff text.
      const stored = await f.ctx.runtime.db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.recipientUserId, reporter.userId));
      for (const n of stored) {
        expect(Object.keys(n.payload as object).every((k) => ['caseId', 'outcome'].includes(k))).toBe(true);
        expect(JSON.stringify(n)).not.toMatch(/Secret|Private|fictional/);
      }
      // A notification can only be marked read; it cannot be rewritten.
      await expect(
        f.ctx.runtime.db.execute(
          sql`update blacklist.notifications set type = 'appeal_escalated' where recipient_user_id = ${reporter.userId}`,
        ),
      ).rejects.toThrow();

      // Publish the finding, then the address owner appeals.
      const [c] = await f.ctx.runtime.db
        .select()
        .from(schema.moderationCases)
        .where(eq(schema.moderationCases.id, id));
      const findingId = c?.findingId ?? '';
      const [revision] = await f.ctx.runtime.db
        .select()
        .from(schema.findingRevisions)
        .where(eq(schema.findingRevisions.findingId, findingId));
      if (!revision) throw new Error('fixture_revision_missing');
      await approveRevision(
        f.ctx,
        approver.actor,
        findingId,
        1,
        revision.contentHash,
        await approver.proof({
          action: 'finding.approve',
          targetType: 'finding',
          targetId: findingId,
          parameters: { revisionNumber: 1, contentHash: revision.contentHash },
        }),
      );
      const appellant = await member(f);
      const challenge = await appealChallenge(f.ctx, appellant.actor, findingId);
      const appeal = await submitAppeal(
        f.ctx,
        appellant.actor,
        {
          findingId,
          grounds: text('The finding names the wrong address'),
          standing: {
            mechanism: 'signature',
            challengeId: challenge.challengeId,
            signature: owner.sign(challenge.message),
          },
        },
        prefix,
      );
      expect(await escalateOverdueAppeals(f.ctx.runtime)).toBe(0);
      await f.ctx.runtime.db.execute(
        sql`update blacklist.appeals set submitted_at = now() - interval '15 days' where finding_id = ${findingId}`,
      );
      expect(await escalateOverdueAppeals(f.ctx.runtime)).toBe(1);
      expect(await escalateOverdueAppeals(f.ctx.runtime)).toBe(0);
      for (const admin of [approver, secondAdmin]) {
        const { overview } = await staffAdministration(f.ctx, admin.actor);
        expect(overview.alerts.map((a) => a.text)).toEqual([
          'An appeal has waited more than 14 days for a decision.',
        ]);
      }
      const escalations = await f.ctx.runtime.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'moderation.appeal.escalated'));
      expect(escalations.map((e) => e.targetId)).toEqual([appeal.id]);
      // The appellant was told the appeal arrived; escalation alerts go to administrators only.
      expect((await listOwnNotices(f.ctx, appellant.actor)).map((n) => n.text)).toEqual([
        'Your submission was received. It is private and has no public effect until staff review it.',
      ]);
      await expect(staffAdministration(f.ctx, author.actor)).rejects.toThrow('forbidden');
      // The audit viewer filtered to one case: members are anonymous, changes are status codes.
      const caseLog = await auditEntries(f.ctx, approver.actor, id);
      expect(caseLog.every((e) => e.caseId === id)).toBe(true);
      expect(caseLog.at(-1)).toMatchObject({
        action: 'case_created',
        actor: { id: 'member', handle: 'Member' },
      });
      expect(caseLog).toContainEqual(
        expect.objectContaining({
          action: 'info_requested',
          changes: [{ field: 'status', from: 'in_review', to: 'needs_info' }],
        }),
      );
      const all = await auditEntries(f.ctx, approver.actor);
      expect(all.find((e) => e.action === 'admin_alert')).toMatchObject({
        actor: 'system',
        caseId: appeal.id,
      });
      expect(all.find((e) => e.action === 'finding_approved')?.actor).toMatchObject({
        id: approver.actor.actorRef,
      });
    } finally {
      await f.stop();
    }
  });
});

describe('Phase 10 slice 4: administration', () => {
  it('manages labels and audited suppressions, shows the audit log and blocks suspended members', async () => {
    const f = await startApplicationFixture();
    try {
      // The operator CLI bootstraps the first administrator invitation.
      await bootstrapStaff(
        f.ctx,
        { kind: 'cli', operator: 'fixture-operator', actorRef: 'cli:fixture-operator' },
        'first-admin@example.test',
      );
      const admin = await addAssuredStaff(f, 'admin'),
        moderator = await addAssuredStaff(f, 'moderator');
      const target = await member(f);
      const address = wallet().address;
      // Labels: identification only, retired never deleted.
      await expect(
        addLabel(f.ctx, moderator.actor, {
          chain: 'solana',
          address,
          text: 'Fictional exchange',
          provenance: 'moderator_finding',
          basisNote: text('Basis'),
        }),
      ).rejects.toThrow('forbidden');
      const labels = await addLabel(f.ctx, admin.actor, {
        chain: 'solana',
        address,
        text: 'Fictional exchange',
        provenance: 'external_source',
        sourceName: 'Fictional registry',
        basisNote: text('Basis'),
      });
      expect(labels).toMatchObject([
        { text: 'Fictional exchange', status: 'active', sourceName: 'Fictional registry' },
      ]);
      await expect(
        addLabel(f.ctx, admin.actor, {
          chain: 'solana',
          address,
          text: 'FICTIONAL EXCHANGE',
          provenance: 'moderator_finding',
          basisNote: text('Basis'),
        }),
      ).rejects.toThrow('conflict');
      const subjectId = await subjectOf(f, address);
      expect(await publicLabels(f.ctx.runtime.db, subjectId)).toMatchObject([
        { text: 'Fictional exchange', provenance: 'external_source' },
      ]);
      const labelId = labels[0]?.id ?? '';
      await expect(
        f.ctx.runtime.db.execute(
          sql`update blacklist.address_labels set text = 'Changed' where id = ${labelId}`,
        ),
      ).rejects.toThrow();
      await expect(
        f.ctx.runtime.db.execute(sql`delete from blacklist.address_labels where id = ${labelId}`),
      ).rejects.toThrow();
      expect((await staffAdministration(f.ctx, admin.actor)).overview.activeLabels).toBe(1);
      await retireLabel(f.ctx, admin.actor, labelId, text('No longer accurate'));
      await expect(retireLabel(f.ctx, admin.actor, labelId, text('Again'))).rejects.toThrow(
        'invalid_transition',
      );
      expect(await publicLabels(f.ctx.runtime.db, subjectId)).toEqual([]);
      expect((await listLabels(f.ctx, admin.actor))[0]?.status).toBe('retired');

      // Suppressions: an analysis signal stops contributing, with a public reason and step-up.
      const [signal] = await f.ctx.runtime.db
        .insert(schema.riskSignals)
        .values({
          subjectId,
          factorCode: 'eoa.delegated_to_flagged',
          tier: 'analysis',
          provenance: 'platform_analysis',
          sourceType: 'chain_analysis',
          sourceRef: 'fixture-analysis',
          currentRevision: 1,
          status: 'active',
        })
        .returning();
      await f.ctx.runtime.db.insert(schema.riskSignalRevisions).values({
        signalId: signal?.id ?? '',
        revision: 1,
        status: 'active',
        sourceRevision: 'fixture@1',
        independentlyApproved: false,
        evidenceRefs: [],
        reason: 'fixture',
      });
      await f.ctx.runtime.transaction((tx) => recomputeSubject(tx, subjectId, 'signal_change'));
      expect(await staffAssessment(f.ctx.runtime.db, subjectId)).toMatchObject({
        kind: 'scored',
        band: 'moderate',
      });
      const request = {
        chain: 'solana' as const,
        address,
        factorCode: 'eoa.delegated_to_flagged' as const,
        publicReason: 'The delegation target was reviewed and is not malicious.',
        internalRationale: text('Reviewed the delegate contract'),
      };
      const suppressProof = () =>
        admin.proof({
          action: 'signal.suppress',
          targetType: 'suppression',
          targetId: 'new',
          parameters: request,
        });
      await expect(suppressSignal(f.ctx, moderator.actor, request, await suppressProof())).rejects.toThrow(
        'forbidden',
      );
      await expect(
        suppressSignal(
          f.ctx,
          admin.actor,
          { ...request, factorCode: 'token.symbol_impersonation' },
          await admin.proof({
            action: 'signal.suppress',
            targetType: 'suppression',
            targetId: 'new',
            parameters: { ...request, factorCode: 'token.symbol_impersonation' },
          }),
        ),
      ).rejects.toThrow('invalid_transition');
      // A proof bound to different parameters is refused.
      await expect(
        suppressSignal(
          f.ctx,
          admin.actor,
          { ...request, publicReason: 'A different public reason here.' },
          await suppressProof(),
        ),
      ).rejects.toThrow();
      const suppressed = await suppressSignal(f.ctx, admin.actor, request, await suppressProof());
      expect(suppressed).toMatchObject([{ factorCode: 'eoa.delegated_to_flagged', liftedAt: null }]);
      await expect(suppressSignal(f.ctx, admin.actor, request, await suppressProof())).rejects.toThrow();
      expect(await staffAssessment(f.ctx.runtime.db, subjectId)).toMatchObject({ kind: 'unscored' });
      const shown = await publicAssessment(f.ctx.runtime.db, subjectId, {
        publicBands: true,
        disputeState: 'none',
      });
      expect(shown.suppressions).toEqual([
        expect.objectContaining({
          factorCode: 'eoa.delegated_to_flagged',
          publicReason: request.publicReason,
        }),
      ]);
      expect(JSON.stringify(shown)).not.toContain('Reviewed the delegate');
      const hidden = await publicAssessment(f.ctx.runtime.db, subjectId, {
        publicBands: false,
        disputeState: 'none',
      });
      expect(hidden.suppressions).toEqual([]);
      expect((await staffAdministration(f.ctx, admin.actor)).overview.activeSuppressions).toBe(1);
      const suppressionId = suppressed[0]?.id ?? '';
      const lift = (reason: string) =>
        admin.proof({
          action: 'signal.suppression.lift',
          targetType: 'suppression',
          targetId: suppressionId,
          parameters: { reason },
        });
      const reason = text('New analysis shows the delegate is malicious');
      const lifted = await liftSuppression(f.ctx, admin.actor, suppressionId, reason, await lift(reason));
      expect(lifted[0]?.liftedBy?.id).toBe(admin.actor.actorRef);
      await expect(
        liftSuppression(f.ctx, admin.actor, suppressionId, reason, await lift(reason)),
      ).rejects.toThrow('invalid_transition');
      expect(await staffAssessment(f.ctx.runtime.db, subjectId)).toMatchObject({
        kind: 'scored',
        band: 'moderate',
      });
      expect((await listSuppressions(f.ctx, admin.actor)).length).toBe(1);
      await expect(
        f.ctx.runtime.db.execute(
          sql`delete from blacklist.risk_signal_suppressions where id = ${suppressionId}`,
        ),
      ).rejects.toThrow();
      const revisions = await f.ctx.runtime.db
        .select()
        .from(schema.riskSignalRevisions)
        .where(eq(schema.riskSignalRevisions.signalId, signal?.id ?? ''));
      expect(revisions.map((r) => r.status)).toEqual(['active', 'suppressed', 'active']);

      // Member suspension ends the member's sessions; a stale actor cannot submit.
      await suspendAccount(
        f.ctx,
        admin.actor,
        target.userId,
        text('Abusive submissions'),
        await admin.proof({
          action: 'user.suspend',
          targetType: 'account',
          targetId: target.userId,
          parameters: { reason: text('Abusive submissions') },
        }),
        'member',
      );
      expect(
        await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie: target.cookie })),
      ).toBeNull();
      await expect(report(f, target.actor, wallet().address, 'After suspension')).rejects.toThrow();
      expect(
        await f.ctx.runtime.db
          .select()
          .from(schema.reports)
          .where(and(eq(schema.reports.reporterUserId, target.userId))),
      ).toEqual([]);

      // Audit viewer: administrators only, IDs and codes only.
      await expect(auditEntries(f.ctx, moderator.actor)).rejects.toThrow('forbidden');
      const log = await auditEntries(f.ctx, admin.actor);
      const actions = log.map((e) => e.action);
      for (const action of [
        'label_added',
        'label_retired',
        'signal_suppressed',
        'suppression_lifted',
        'user_suspended',
      ])
        expect(actions).toContain(action);
      expect(log.every((e) => e.reason === null)).toBe(true);
      expect(log.find((e) => e.action === 'staff_invitation_created')?.actor).toEqual({
        id: 'cli:fixture-operator',
        handle: 'Operator',
      });
      expect(JSON.stringify(log)).not.toMatch(/Abusive|Reviewed the delegate|No longer accurate/);
    } finally {
      await f.stop();
    }
  });

  it('serves the administration routes to administrators only, with validated input', async () => {
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
      const admin = await addAssuredStaff(f, 'admin'),
        moderator = await addAssuredStaff(f, 'moderator');
      const m = await member(f);
      const adminCookie = admin.headers.get('cookie') ?? '';
      const send = (method: 'GET' | 'POST', url: string, cookie: string, body?: unknown) =>
        app.inject({
          method,
          url,
          headers: {
            origin: f.ctx.settings.origin,
            cookie,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        });
      for (const url of ['/api/v1/admin/labels', '/api/v1/admin/suppressions', '/api/v1/mod/audit']) {
        expect((await send('GET', url, adminCookie)).statusCode).toBe(200);
        expect((await send('GET', url, moderator.headers.get('cookie') ?? '')).statusCode).toBe(403);
        expect((await send('GET', url, m.cookie)).statusCode).toBe(403);
      }
      expect((await send('GET', '/api/v1/mod/audit?caseId=not-a-uuid', adminCookie)).statusCode).toBe(400);
      const address = wallet().address;
      const label = {
        chain: 'solana',
        address,
        text: 'Fictional bridge',
        provenance: 'moderator_finding',
        basisNote: text('Basis'),
      };
      expect(
        (await send('POST', '/api/v1/admin/labels', adminCookie, { ...label, address: '0xnot' })).statusCode,
      ).toBe(400);
      expect(
        (await send('POST', '/api/v1/admin/labels', adminCookie, { ...label, provenance: 'external_source' }))
          .statusCode,
      ).toBe(400);
      const added = await send('POST', '/api/v1/admin/labels', adminCookie, label);
      expect(added.statusCode).toBe(200);
      const id = (added.json() as { data: { id: string }[] }).data[0]?.id ?? '';
      expect(
        (await send('POST', '/api/v1/admin/labels/retire', adminCookie, { id, reason: 'short' })).statusCode,
      ).toBe(400);
      const retired = await send('POST', '/api/v1/admin/labels/retire', adminCookie, {
        id,
        reason: text('Retired'),
      });
      expect((retired.json() as { data: { status: string }[] }).data[0]?.status).toBe('retired');
      const request = {
        chain: 'solana',
        address,
        factorCode: 'token.symbol_impersonation',
        publicReason: 'Reviewed: this token is the original.',
        internalRationale: text('Checked the mint authority'),
      };
      const assertion = await admin.proof({
        action: 'signal.suppress',
        targetType: 'suppression',
        targetId: 'new',
        parameters: request,
      });
      const refused = await send('POST', '/api/v1/admin/suppressions', adminCookie, { request, assertion });
      expect(refused.statusCode).not.toBe(200);
      expect(refused.body).toContain('invalid_transition');
      expect((await send('POST', '/api/v1/admin/suppressions', adminCookie, { request })).statusCode).toBe(
        400,
      );
      expect(
        (
          await send('POST', '/api/v1/admin/suppressions/lift', adminCookie, {
            id,
            reason: text('Lift'),
            assertion,
          })
        ).statusCode,
      ).not.toBe(200);
      const audit = await send('GET', `/api/v1/mod/audit`, adminCookie);
      expect((audit.json() as { data: { action: string }[] }).data.map((e) => e.action)).toContain(
        'label_added',
      );
      const notices = await send('GET', '/api/v1/me/notifications', m.cookie);
      expect(notices.json()).toEqual({ kind: 'ok', data: [] });
    } finally {
      await app.close();
      await f.stop();
    }
  });
});
