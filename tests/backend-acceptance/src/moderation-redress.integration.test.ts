import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import { standingProofSchema } from '@blacklist/contracts';
import {
  signIn,
  resolveSession,
  submitReport,
  decideCase,
  assignCase,
  getCase,
  getFindingHistory,
  approveRevision,
  publicFindings,
  publicRedress,
  appealTarget,
  appealChallenge,
  submitAppeal,
  responseChallenge,
  submitResponse,
  listOwnSubmissions,
  getOwnSubmission,
  withdrawOwnSubmission,
  respondToInfoRequest,
  type UserActor,
  type CaseDecisionInput,
} from '@blacklist/domain';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

// Phase 9a slice 4: standing, appeals and responses (moderation §6, §9; testing-strategy §7.2).
// Solana keys sign here with node:crypto; EVM verification has its own unit test.

type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const text = (s: string) => `${s} — fictional text long enough for validation.`;
const prefix = 'ip4:192.0.2.92';

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
type Wallet = ReturnType<typeof wallet>;

async function session(f: ApplicationFixture, email: string) {
  const login = await signIn(f.ctx, email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return actor as UserActor;
}
async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  return { actor: await session(f, user.email), email: user.email };
}

async function decide(f: ApplicationFixture, who: Staff, caseId: string, decision: CaseDecisionInput) {
  const current = await getCase(f.ctx, who.actor, caseId);
  const assigned =
    current.assignedTo?.id === who.actor.actorRef ||
    ['start_review', 'grant_standing', 'deny_standing'].includes(decision.action)
      ? current
      : await assignCase(f.ctx, who.actor, caseId, current.version, { to: 'me', takeOver: true });
  if (decision.action === 'start_review')
    return decideCase(f.ctx, who.actor, caseId, assigned.version, decision);
  return decideCase(
    f.ctx,
    who.actor,
    caseId,
    assigned.version,
    decision,
    await who.proof({
      action: `case.${decision.action}`,
      targetType: 'case',
      targetId: caseId,
      parameters: { version: assigned.version, decision },
    }),
  );
}

/** A published `severity` finding on a Solana address, authored by `author`, approved by `approver`. */
async function publishedFinding(f: ApplicationFixture, author: Staff, approver: Staff, address: string) {
  const reporter = await member(f);
  const { id } = await submitReport(
    f.ctx,
    reporter.actor,
    {
      category: 'phishing',
      title: 'Fictional report for an appeal',
      subjects: [{ chain: 'solana', address }],
      narrative: text('Narrative'),
      incidentDate: '2026-10-01',
      txRefs: [],
      urls: [],
      evidence: [],
    },
    prefix,
  );
  await decide(f, author, id, { action: 'start_review' });
  await decide(f, author, id, {
    action: 'accept_report',
    severity: 'high',
    publicSummary: text('Public summary'),
    internalRationale: text('Rationale'),
  });
  const [c] = await f.ctx.runtime.db
    .select()
    .from(schema.moderationCases)
    .where(eq(schema.moderationCases.id, id));
  const findingId = c?.findingId ?? '';
  const r1 = (await getFindingHistory(f.ctx, approver.actor, findingId).catch(() => null))?.revisions.at(-1);
  const [revision] = r1
    ? [r1]
    : await f.ctx.runtime.db
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
  return findingId;
}

async function signedAppeal(f: ApplicationFixture, who: UserActor, w: Wallet, findingId: string) {
  const challenge = await appealChallenge(f.ctx, who, findingId);
  return submitAppeal(
    f.ctx,
    who,
    {
      findingId,
      grounds: text('The finding names the wrong address'),
      standing: {
        mechanism: 'signature',
        challengeId: challenge.challengeId,
        signature: w.sign(challenge.message),
      },
    },
    prefix,
  );
}

async function standingOf(f: ApplicationFixture, who: Staff, caseId: string) {
  const detail = await getCase(f.ctx, who.actor, caseId);
  if (!('standing' in detail)) throw new Error('fixture_not_a_redress_case');
  return detail.standing;
}

const subjectOf = async (f: ApplicationFixture, address: string) =>
  (await f.ctx.runtime.db.select().from(schema.addresses).where(eq(schema.addresses.address, address)))[0]
    ?.subjectId ?? null;

describe('Phase 9a slice 4: standing (moderation §6; testing-strategy §7.2)', () => {
  it('accepts only a server-built, single-use challenge bound to member, session, purpose and target', async () => {
    const f = await startApplicationFixture();
    try {
      const mod = await addAssuredStaff(f, 'moderator');
      const owner = wallet(),
        stranger = wallet(),
        elsewhere = wallet();
      const findingId = await publishedFinding(f, mod, mod, owner.address);
      const appellant = await member(f);
      const other = await member(f);
      expect(await appealTarget(f.ctx, appellant.actor, findingId)).toMatchObject({
        disputeState: 'none',
        alreadyAppealed: false,
        subject: { chain: 'solana', address: owner.address },
      });

      const challenge = await appealChallenge(f.ctx, appellant.actor, findingId);
      expect(challenge.message).toContain(owner.address);
      expect(challenge.message).toContain(`Network: ${SOLANA}`);
      expect(challenge.message).toContain('does not authorize any transaction');
      expect(challenge.message).toContain(`Request ID: ${challenge.challengeId}`);
      const attempt = (who: UserActor, signature: string, challengeId = challenge.challengeId) =>
        submitAppeal(
          f.ctx,
          who,
          {
            findingId,
            grounds: text('Grounds'),
            standing: { mechanism: 'signature', challengeId, signature },
          },
          prefix,
        );

      // The client never supplies the message: the contract rejects one, and a signature over
      // any other text (here: a later expiry) does not verify against the stored challenge.
      expect(
        standingProofSchema.safeParse({
          mechanism: 'signature',
          challengeId: challenge.challengeId,
          signature: owner.sign(challenge.message),
          message: challenge.message,
        }).success,
      ).toBe(false);
      const edited = challenge.message.replace(
        /Expiration Time: .*/u,
        'Expiration Time: 2099-01-01T00:00:00.000Z',
      );
      await expect(attempt(appellant.actor, owner.sign(edited))).rejects.toThrow('invalid_transition');
      // Wrong address: a valid signature by a key that does not control the subject.
      await expect(attempt(appellant.actor, stranger.sign(challenge.message))).rejects.toThrow(
        'invalid_transition',
      );
      // Bound to the member and to the session that requested it.
      await expect(attempt(other.actor, owner.sign(challenge.message))).rejects.toThrow('invalid_transition');
      const secondSession = await session(f, appellant.email);
      await expect(attempt(secondSession, owner.sign(challenge.message))).rejects.toThrow(
        'invalid_transition',
      );
      // Bound to purpose and target: an appeal challenge cannot back a response, and a response
      // challenge for one address cannot back a response about another.
      await expect(
        submitResponse(
          f.ctx,
          appellant.actor,
          {
            target: { kind: 'address', chain: 'solana', address: owner.address },
            body: text('Response body'),
            standing: {
              mechanism: 'signature',
              challengeId: challenge.challengeId,
              signature: owner.sign(challenge.message),
            },
          },
          prefix,
        ),
      ).rejects.toThrow('invalid_transition');
      const responseFor = await responseChallenge(f.ctx, appellant.actor, {
        kind: 'address',
        chain: 'solana',
        address: elsewhere.address,
      });
      await expect(
        submitResponse(
          f.ctx,
          appellant.actor,
          {
            target: { kind: 'address', chain: 'solana', address: owner.address },
            body: text('Response body'),
            standing: {
              mechanism: 'signature',
              challengeId: responseFor.challengeId,
              signature: owner.sign(responseFor.message),
            },
          },
          prefix,
        ),
      ).rejects.toThrow('invalid_transition');

      // The right member, session, key and text: standing granted, the challenge consumed.
      const { id: caseId } = await attempt(appellant.actor, owner.sign(challenge.message));
      await expect(attempt(appellant.actor, owner.sign(challenge.message))).rejects.toThrow(
        'invalid_transition',
      );
      const [claim] = await f.ctx.runtime.db.select().from(schema.standingClaims);
      expect(claim).toMatchObject({ mechanism: 'signature', outcome: 'granted' });
      expect(claim?.scopeStatement).toContain('not identity');

      // An expired challenge is refused even when correctly signed.
      const late = await appealChallenge(f.ctx, other.actor, findingId);
      await f.ctx.runtime.db
        .update(schema.standingChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.standingChallenges.id, late.challengeId));
      await expect(attempt(other.actor, owner.sign(late.message), late.challengeId)).rejects.toThrow(
        'invalid_transition',
      );

      // Filing makes the finding "Disputed — under appeal"; nothing names the appellant.
      expect(await appealTarget(f.ctx, appellant.actor, findingId)).toMatchObject({
        disputeState: 'under_appeal',
        alreadyAppealed: true,
      });
      const pub = await publicRedress(f.ctx.runtime.db, await subjectOf(f, owner.address), [findingId]);
      expect([...pub.underAppeal]).toEqual([findingId]);
      expect(pub.timeline.map((t) => t.kind)).toEqual(['appeal_filed']);
      expect(JSON.stringify(pub)).not.toContain(appellant.actor.userId);
      // One open appeal per member and finding.
      await expect(signedAppeal(f, appellant.actor, owner, findingId)).rejects.toThrow('invalid_transition');

      const own = await listOwnSubmissions(f.ctx, appellant.actor);
      expect(own.map((s) => [s.kind, s.status])).toEqual([['appeal', 'Submitted']]);
      const detail = await getOwnSubmission(f.ctx, appellant.actor, caseId);
      expect(detail).toMatchObject({ kind: 'appeal', canWithdraw: true, publicOutcome: null });
      expect(JSON.stringify(detail)).not.toContain(mod.actor.actorRef);
      await expect(getOwnSubmission(f.ctx, other.actor, caseId)).rejects.toThrow('not_found');

      // Other mechanisms in 9a: DNS is for project domains; authority needs verified chain data.
      await expect(
        submitAppeal(
          f.ctx,
          other.actor,
          { findingId, grounds: text('Grounds'), standing: { mechanism: 'dns_txt', domain: 'example.org' } },
          prefix,
        ),
      ).rejects.toThrow('invalid_transition');
      await expect(
        submitAppeal(
          f.ctx,
          other.actor,
          {
            findingId,
            grounds: text('Grounds'),
            standing: {
              mechanism: 'authority_signature',
              authorityRole: 'contract_owner',
              challengeId: late.challengeId,
              signature: 'x',
            },
          },
          prefix,
        ),
      ).rejects.toThrow('temporarily_unavailable');
    } finally {
      await f.stop();
    }
  });
});

describe('Phase 9a slice 4: appeals (moderation §9)', () => {
  it('needs a non-participant reviewer, granted standing and the appealed revision', async () => {
    const f = await startApplicationFixture();
    try {
      const author = await addAssuredStaff(f, 'moderator'),
        approver = await addAssuredStaff(f, 'admin'),
        standingReviewer = await addAssuredStaff(f, 'moderator'),
        reviewer = await addAssuredStaff(f, 'appeal_reviewer');
      const owner = wallet();
      const findingId = await publishedFinding(f, author, approver, owner.address);
      const appellant = await member(f);
      const { id: signedCase } = await signedAppeal(f, appellant.actor, owner, findingId);

      // Appeal reviewers see appeal cases only.
      const detail = await getCase(f.ctx, reviewer.actor, signedCase);
      expect(detail).toMatchObject({
        type: 'appeal_review',
        status: 'submitted',
        appealedDecision: { findingId, revisionNumber: 1, severity: 'high' },
        standing: { mechanism: 'signature', outcome: 'granted' },
      });
      expect(JSON.stringify(detail)).not.toContain(appellant.actor.userId);
      const [reportCase] = await f.ctx.runtime.db
        .select()
        .from(schema.moderationCases)
        .where(eq(schema.moderationCases.caseType, 'report_review'));
      await expect(getCase(f.ctx, reviewer.actor, reportCase?.id ?? '')).rejects.toThrow('not_found');

      // The author and the approver took part in the decision under appeal.
      await expect(decide(f, author, signedCase, { action: 'start_review' })).rejects.toThrow('not_eligible');
      await expect(decide(f, approver, signedCase, { action: 'start_review' })).rejects.toThrow(
        'not_eligible',
      );
      await decide(f, reviewer, signedCase, { action: 'start_review' });
      const outcome = { publicSummary: text('Appeal outcome'), internalRationale: text('Appeal rationale') };
      const upheld = await decide(f, reviewer, signedCase, { action: 'uphold', ...outcome });
      expect(upheld.status).toBe('upheld');
      expect((await publicFindings(f.ctx.runtime.db, SOLANA, owner.address)).findings[0]?.disputeState).toBe(
        'none',
      );
      const after = await publicRedress(f.ctx.runtime.db, await subjectOf(f, owner.address), [findingId]);
      expect(after.underAppeal.size).toBe(0);
      expect(after.timeline.map((t) => t.kind)).toEqual(['appeal_filed', 'appeal_decided']);

      // Lost-key journey: documentary standing waits for a standing reviewer.
      const lostKey = await member(f);
      const { id: docCase } = await submitAppeal(
        f.ctx,
        lostKey.actor,
        {
          findingId,
          grounds: text('I lost the key; these transactions show the funds were mine'),
          standing: {
            mechanism: 'documentary',
            explanation: text('Exchange withdrawal records'),
            evidence: [],
            txRefs: [{ chain: 'solana', hash: base58(Buffer.alloc(64, 7)) }],
          },
        },
        prefix,
      );
      expect(await standingOf(f, reviewer, docCase)).toMatchObject({
        mechanism: 'documentary',
        outcome: 'pending',
      });
      await decide(f, reviewer, docCase, { action: 'start_review' });
      // No outcome before standing; appeal reviewers do not decide standing.
      await expect(decide(f, reviewer, docCase, { action: 'reverse', ...outcome })).rejects.toThrow(
        'invalid_transition',
      );
      await expect(
        decide(f, reviewer, docCase, { action: 'grant_standing', internalRationale: text('Docs fine') }),
      ).rejects.toThrow('forbidden');
      await expect(
        decide(f, author, docCase, { action: 'grant_standing', internalRationale: text('Docs fine') }),
      ).rejects.toThrow('not_eligible');
      const granted = await decide(f, standingReviewer, docCase, {
        action: 'grant_standing',
        internalRationale: text('Records match'),
      });
      expect(granted).toMatchObject({ status: 'in_review', standing: { outcome: 'granted' } });
      await expect(
        decide(f, standingReviewer, docCase, {
          action: 'deny_standing',
          internalRationale: text('Changed mind'),
        }),
      ).rejects.toThrow('invalid_transition');

      const reversed = await decide(f, reviewer, docCase, { action: 'reverse', ...outcome });
      expect(reversed.status).toBe('reversed');
      const pub = await publicFindings(f.ctx.runtime.db, SOLANA, owner.address);
      expect(pub.findings).toEqual([]);
      expect(pub.timeline.map((t) => t.kind)).toContain('finding_reversed');
      expect((await getOwnSubmission(f.ctx, lostKey.actor, docCase)).status).toBe(
        'Decided: finding reversed',
      );
    } finally {
      await f.stop();
    }
  });

  it('amends through a new revision that still needs approval, and refuses a stale appeal', async () => {
    const f = await startApplicationFixture();
    try {
      const author = await addAssuredStaff(f, 'moderator'),
        reviewer = await addAssuredStaff(f, 'appeal_reviewer'),
        secondReviewer = await addAssuredStaff(f, 'appeal_reviewer'),
        approver = await addAssuredStaff(f, 'moderator');
      const owner = wallet();
      const findingId = await publishedFinding(f, author, author, owner.address);
      const first = await member(f),
        second = await member(f);
      const { id: amendCase } = await signedAppeal(f, first.actor, owner, findingId);
      const { id: staleCase } = await signedAppeal(f, second.actor, owner, findingId);
      await decide(f, reviewer, amendCase, { action: 'start_review' });
      await decide(f, secondReviewer, staleCase, { action: 'start_review' });
      const amended = await decide(f, reviewer, amendCase, {
        action: 'amend',
        severity: 'medium',
        publicSummary: text('Amended summary'),
        internalRationale: text('Amendment rationale'),
      });
      expect(amended.status).toBe('amended');
      const history = await getFindingHistory(f.ctx, approver.actor, findingId);
      expect(history.revisions.map((r) => [r.revisionNumber, r.status, r.sourceCaseId])).toEqual([
        [1, 'published', expect.any(String)],
        [2, 'proposed', amendCase],
      ]);
      // Nothing public changed: the amended text appears only after approval.
      const pub = await publicFindings(f.ctx.runtime.db, SOLANA, owner.address);
      expect(JSON.stringify(pub)).not.toContain('Amended summary');
      const r2 = history.revisions.at(-1);
      await approveRevision(
        f.ctx,
        approver.actor,
        findingId,
        2,
        r2?.contentHash ?? '',
        await approver.proof({
          action: 'finding.approve',
          targetType: 'finding',
          targetId: findingId,
          parameters: { revisionNumber: 2, contentHash: r2?.contentHash ?? '' },
        }),
      );
      // The other appeal was filed against revision 1, which is no longer public.
      await expect(
        decide(f, secondReviewer, staleCase, {
          action: 'uphold',
          publicSummary: text('Outcome'),
          internalRationale: text('Rationale'),
        }),
      ).rejects.toThrow('conflict');
    } finally {
      await f.stop();
    }
  });
});

describe('Phase 9a slice 4: responses (moderation §9 "Responses")', () => {
  it('publishes a moderated response with its standing mechanism and date only', async () => {
    const f = await startApplicationFixture();
    try {
      const mod = await addAssuredStaff(f, 'moderator');
      const owner = wallet();
      const target = { kind: 'address' as const, chain: 'solana' as const, address: owner.address };
      const responder = await member(f);
      const challenge = await responseChallenge(f.ctx, responder.actor, target);
      const { id: publishedCase } = await submitResponse(
        f.ctx,
        responder.actor,
        {
          target,
          body: text('This address belongs to a market maker'),
          standing: {
            mechanism: 'signature',
            challengeId: challenge.challengeId,
            signature: owner.sign(challenge.message),
          },
        },
        prefix,
      );
      await decide(f, mod, publishedCase, { action: 'start_review' });
      await decide(f, mod, publishedCase, {
        action: 'publish_response',
        internalRationale: text('Civil and on topic'),
      });
      const subjectId = await subjectOf(f, owner.address);
      const pub = await publicRedress(f.ctx.runtime.db, subjectId, []);
      expect(pub.responses).toEqual([
        expect.objectContaining({
          summary: text('This address belongs to a market maker'),
          standing: 'wallet_signature',
        }),
      ]);
      expect(JSON.stringify(pub)).not.toContain(responder.actor.userId);
      expect((await getOwnSubmission(f.ctx, responder.actor, publishedCase)).publicLink).toBe(
        `/address/solana/${owner.address}`,
      );

      // A rejected response shows the member the fixed-list reason only.
      const second = await member(f);
      const { id: rejectedCase } = await submitResponse(
        f.ctx,
        second.actor,
        {
          target,
          body: text('Documentary response'),
          standing: {
            mechanism: 'documentary',
            explanation: text('Records'),
            evidence: [],
            urls: ['https://example.org/x'],
          },
        },
        prefix,
      );
      await decide(f, mod, rejectedCase, { action: 'start_review' });
      await expect(
        decide(f, mod, rejectedCase, {
          action: 'reject_response',
          reason: 'out_of_scope',
          internalRationale: text('Off topic'),
        }),
      ).rejects.toThrow('invalid_transition');
      await decide(f, mod, rejectedCase, {
        action: 'deny_standing',
        internalRationale: text('Insufficient'),
      });
      await expect(
        decide(f, mod, rejectedCase, { action: 'publish_response', internalRationale: text('Civil') }),
      ).rejects.toThrow('invalid_transition');
      // After denied standing the member may reply once more for a fresh standing review.
      const denied = await getOwnSubmission(f.ctx, second.actor, rejectedCase);
      expect(denied).toMatchObject({
        canRespond: true,
        infoRequest: expect.stringContaining('not accepted'),
      });
      const replied = await respondToInfoRequest(f.ctx, second.actor, rejectedCase, denied.version, {
        message: text('More records attached as links'),
        evidence: [],
      });
      expect(replied.canRespond).toBe(false);
      expect((await standingOf(f, mod, rejectedCase)).outcome).toBe('pending');
      await decide(f, mod, rejectedCase, {
        action: 'deny_standing',
        internalRationale: text('Still insufficient'),
      });
      await decide(f, mod, rejectedCase, {
        action: 'reject_response',
        reason: 'insufficient_evidence',
        internalRationale: text('Standing not shown'),
      });
      expect(await getOwnSubmission(f.ctx, second.actor, rejectedCase)).toMatchObject({
        status: 'Not accepted',
        submitterReason: 'insufficient_evidence',
        publicOutcome: null,
        publicLink: null,
      });

      // A third member withdraws before any decision.
      const third = await member(f);
      const thirdChallenge = await responseChallenge(f.ctx, third.actor, target);
      const { id: withdrawnCase } = await submitResponse(
        f.ctx,
        third.actor,
        {
          target,
          body: text('Withdrawn response'),
          standing: {
            mechanism: 'signature',
            challengeId: thirdChallenge.challengeId,
            signature: owner.sign(thirdChallenge.message),
          },
        },
        prefix,
      );
      const withdrawn = await withdrawOwnSubmission(f.ctx, third.actor, withdrawnCase, 1);
      expect(withdrawn).toMatchObject({ status: 'Withdrawn', canWithdraw: false });
      await expect(decide(f, mod, withdrawnCase, { action: 'start_review' })).rejects.toThrow(
        'invalid_transition',
      );
      expect((await publicRedress(f.ctx.runtime.db, subjectId, [])).responses).toHaveLength(1);
    } finally {
      await f.stop();
    }
  });
});
