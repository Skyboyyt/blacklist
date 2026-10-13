import { beforeEach, expect, it } from 'vitest';
import type { CaseDecision } from '@blacklist/contracts';
import { createMockAdminApi } from './admin-api';
import { createMockMemberApi } from './member-api';
import { createMockModerationApi, stepUpActionFor } from './moderation-api';
import { EVM } from './fixtures/ids';
import { SOLANA } from './fixtures/ids';
import { STAFF } from './fixtures/moderation';
import { createStore } from './store';

let cookies = '';
let store = createStore();
const opts = () => ({ cookies: () => cookies, store, latencyMs: 0 });
const as = (viewer: string) => {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=verified`;
};
const ok = <T>(r: { kind: 'ok'; data: T } | { kind: 'error' }) => {
  if (r.kind !== 'ok') throw new Error(JSON.stringify(r));
  return r.data;
};
beforeEach(() => {
  store = createStore();
  as('member');
});

async function decide(id: string, decision: CaseDecision) {
  const api = createMockModerationApi(opts());
  const c = store.cases.get(id);
  if (!c) throw new Error('missing case');
  if (!c.assignedTo) ok(await api.assign(id, c.version, { to: 'me' }));
  await api.verifyStepUp(stepUpActionFor(decision.action), id, [id, c.version, decision]);
  return api.decide(id, c.version, decision);
}

it('R-01 requires the acting admin to obtain their own step-up', async () => {
  as('admin');
  const api = createMockAdminApi(opts());
  await api.verifyStepUp('user.suspend', 'usr_demo_member', ['usr_demo_member', 'A reason for suspension.']);
  as('admin_b');
  expect(await api.suspendMember('usr_demo_member', 'A reason for suspension.')).toMatchObject({
    kind: 'error',
    code: 'stepup_required',
  });
});

it('R-02 refuses self-approved replacement of a currently public severe finding', async () => {
  const template = store.revisions[0];
  if (!template) throw new Error('missing revision');
  store.revisions.push({
    ...template,
    findingId: 'demo-finding-401',
    revisionNumber: 1,
    severity: 'severe',
    status: 'published',
    isLatest: false,
    author: STAFF.moderatorA,
  });
  store.revisions.push({
    ...template,
    findingId: 'demo-finding-401',
    revisionNumber: 2,
    severity: 'low',
    status: 'proposed',
    isLatest: true,
    author: STAFF.moderatorA,
    subject: {
      kind: 'address',
      chain: 'ethereum',
      address: EVM.severeUnderAppeal,
      displayAddress: EVM.severeUnderAppeal,
    },
    evidenceIds: [],
    contentHash: 'a'.repeat(64),
  });
  as('moderator');
  const api = createMockModerationApi(opts());
  await api.verifyStepUp('finding.approve', 'demo-finding-401', ['demo-finding-401', 2, 'a'.repeat(64)]);
  expect(await api.approveRevision('demo-finding-401', 2, 'a'.repeat(64))).toMatchObject({
    kind: 'error',
    code: 'not_eligible',
  });
  as('admin');
  await api.verifyStepUp('finding.approve', 'demo-finding-401', ['demo-finding-401', 2, 'a'.repeat(64)]);
  ok(await api.approveRevision('demo-finding-401', 2, 'a'.repeat(64)));
  expect(store.addresses.find((a) => a.address === EVM.severeUnderAppeal)?.assessment.band).toBe('low');
  expect([...(store.findingParticipantHistory.get('demo-finding-401') ?? [])]).toEqual(
    expect.arrayContaining([STAFF.moderatorA.id, STAFF.moderatorB.id, STAFF.admin.id]),
  );
});

it('R-03 refuses unrelated DNS standing for an address response', async () => {
  const api = createMockMemberApi(opts());
  expect(
    await api.submitResponse({
      target: { kind: 'address', chain: 'ethereum', address: EVM.low },
      body: 'This is a response about this address.',
      standing: { mechanism: 'dns_txt', domain: 'unrelated.example', simulated: true },
    }),
  ).toMatchObject({ kind: 'error', code: 'invalid' });
});

it('R-04 refuses a profile correction whose base revision has changed', async () => {
  const project = store.projects[0];
  if (!project) throw new Error('missing project');
  const api = createMockMemberApi(opts());
  const first = ok(
    await api.submitCorrection({
      projectSlug: project.slug,
      statement: 'First description correction.',
      description: 'First replacement description for the profile.',
      evidence: [],
    }),
  );
  const second = ok(
    await api.submitCorrection({
      projectSlug: project.slug,
      statement: 'Second description correction.',
      description: 'Second replacement description for the profile.',
      evidence: [],
    }),
  );
  as('admin');
  const d = {
    action: 'accept_correction',
    publicSummary: 'Profile corrected after review.',
    internalRationale: 'Checked the supplied evidence.',
  } as const;
  ok(await decide(first.id, { action: 'start_review' }));
  ok(await decide(second.id, { action: 'start_review' }));
  ok(await decide(first.id, d));
  expect(await decide(second.id, d)).toMatchObject({ kind: 'error', code: 'conflict' });
});

it('R-05 publishes an approved report for a valid previously unknown address', async () => {
  const address = `0xb1ac${'7'.repeat(36)}`;
  const api = createMockMemberApi(opts());
  const submission = ok(
    await api.submitReport({
      category: 'phishing',
      title: 'New address report',
      subjects: [{ chain: 'ethereum', address }],
      narrative: 'An address used a fake support payment request.',
      incidentDate: '2026-10-01',
      txRefs: [],
      urls: [],
      evidence: [],
    }),
  );
  as('moderator');
  ok(await decide(submission.id, { action: 'start_review' }));
  ok(
    await decide(submission.id, {
      action: 'accept_report',
      severity: 'high',
      publicSummary: 'Reviewed finding for this previously unknown address.',
      internalRationale: 'Evidence reviewed.',
    }),
  );
  const revision = store.revisions.find((r) => r.sourceCaseId === submission.id);
  if (!revision) throw new Error('missing new revision');
  const staff = createMockModerationApi(opts());
  await staff.verifyStepUp('finding.approve', revision.findingId, [
    revision.findingId,
    revision.revisionNumber,
    revision.contentHash,
  ]);
  ok(await staff.approveRevision(revision.findingId, revision.revisionNumber, revision.contentHash));
  expect(
    store.addresses.find((a) => a.address === address)?.findings.some((f) => f.id === revision.findingId),
  ).toBe(true);
});

it('R-06 blocks normal publication while an emergency suspension review is open', async () => {
  as('moderator');
  const api = createMockModerationApi(opts());
  await api.verifyStepUp('finding.suspend', 'demo-finding-301', [
    'demo-finding-301',
    'Public text must stay hidden for review.',
  ]);
  ok(await api.suspendFinding('demo-finding-301', 'Public text must stay hidden for review.'));
  const template = store.revisions[0];
  if (!template) throw new Error('missing revision');
  store.revisions.push({
    ...template,
    findingId: 'demo-finding-301',
    revisionNumber: 2,
    severity: 'high',
    status: 'proposed',
    isLatest: true,
    author: STAFF.moderatorA,
    subject: { kind: 'address', chain: 'ethereum', address: EVM.high, displayAddress: EVM.high },
    evidenceIds: [],
    contentHash: 'b'.repeat(64),
  });
  await api.verifyStepUp('finding.approve', 'demo-finding-301', ['demo-finding-301', 2, 'b'.repeat(64)]);
  const before = structuredClone(store.addresses);
  expect(await api.approveRevision('demo-finding-301', 2, 'b'.repeat(64))).toMatchObject({
    kind: 'error',
    code: 'invalid_transition',
  });
  expect(store.addresses).toEqual(before);
  expect(store.suspended.has('demo-finding-301')).toBe(true);
});

it('R-01 refuses changed invitation parameters and consumes the mismatched grant', async () => {
  as('admin');
  const api = createMockAdminApi(opts());
  const request = { email: 'new.staff@example.test', role: 'moderator' } as const;
  const before = structuredClone(store.invitations);
  await api.verifyStepUp('staff.invite', 'new', [request]);
  expect(await api.createInvitation({ ...request, role: 'admin' })).toMatchObject({
    kind: 'error',
    code: 'stepup_required',
  });
  expect(await api.createInvitation(request)).toMatchObject({ kind: 'error', code: 'stepup_required' });
  expect(store.invitations).toEqual(before);
});

it('R-01 refuses grants from a different demo session', async () => {
  as('admin');
  cookies += '; bl_mock_session=session-one';
  const api = createMockAdminApi(opts());
  const args = ['usr_demo_member', 'A reason for suspension.'];
  await api.verifyStepUp('user.suspend', 'usr_demo_member', args);
  cookies = cookies.replace('session-one', 'session-two');
  expect(await api.suspendMember('usr_demo_member', 'A reason for suspension.')).toMatchObject({
    kind: 'error',
    code: 'stepup_required',
  });
});

it('R-01 expires a grant and rejects every staff action after session expiry', async () => {
  as('admin');
  let clock = new Date('2026-10-01T12:00:00Z');
  const api = createMockAdminApi({ ...opts(), now: () => clock });
  const args = ['usr_demo_member', 'A reason for suspension.'];
  await api.verifyStepUp('user.suspend', 'usr_demo_member', args);
  clock = new Date('2026-10-01T12:06:00Z');
  expect(await api.suspendMember('usr_demo_member', 'A reason for suspension.')).toMatchObject({
    kind: 'error',
    code: 'stepup_required',
  });
  await api.verifyStepUp('user.suspend', 'usr_demo_member', args);
  cookies += '; bl_mock_scenario=session_expired';
  expect(await api.suspendMember('usr_demo_member', 'A reason for suspension.')).toMatchObject({
    kind: 'error',
    code: 'forbidden',
  });
});

it('R-01 refuses a changed revision number even when the finding target is identical', async () => {
  as('moderator_b');
  const api = createMockModerationApi(opts());
  const template = store.revisions.find((r) => r.findingId === 'demo-finding-502');
  if (!template) throw new Error('missing revision');
  await api.verifyStepUp('finding.approve', template.findingId, [
    template.findingId,
    template.revisionNumber,
    template.contentHash,
  ]);
  template.isLatest = false;
  store.revisions.push({ ...template, revisionNumber: 2, isLatest: true });
  expect(await api.approveRevision(template.findingId, 2, template.contentHash)).toMatchObject({
    kind: 'error',
    code: 'stepup_required',
  });
});

it('R-02 refuses the prior severe approver even when they authored no revision', async () => {
  const template = store.revisions[0];
  if (!template) throw new Error('missing revision');
  store.revisions.push({
    ...template,
    findingId: 'demo-finding-401',
    revisionNumber: 2,
    severity: 'low',
    status: 'proposed',
    isLatest: true,
    author: STAFF.admin,
    evidenceIds: [],
    contentHash: 'c'.repeat(64),
  });
  as('moderator_b');
  const api = createMockModerationApi(opts());
  await api.verifyStepUp('finding.approve', 'demo-finding-401', ['demo-finding-401', 2, 'c'.repeat(64)]);
  expect(await api.approveRevision('demo-finding-401', 2, 'c'.repeat(64))).toMatchObject({
    kind: 'error',
    code: 'not_eligible',
  });
});

it('R-03 refuses unrelated DNS standing for an address appeal without public changes', async () => {
  const api = createMockMemberApi(opts());
  const before = structuredClone(store.addresses);
  expect(
    await api.submitAppeal({
      findingId: 'demo-finding-301',
      grounds: 'This finding contains a factual error.',
      standing: { mechanism: 'dns_txt', domain: 'unrelated.example', simulated: true },
    }),
  ).toMatchObject({ kind: 'error', code: 'invalid' });
  expect(store.addresses).toEqual(before);
});

it('R-05 preserves a new Solana identifier and publishes no invented chain facts', async () => {
  const address = SOLANA.wallet.replace(/2/g, '3');
  const member = createMockMemberApi(opts());
  const { id } = ok(
    await member.submitReport({
      category: 'phishing',
      title: 'New Solana address report',
      subjects: [{ chain: 'solana', address }],
      narrative: 'A wallet requested payments using a fake support identity.',
      incidentDate: '2026-10-01',
      txRefs: [],
      urls: [],
      evidence: [],
    }),
  );
  as('moderator');
  ok(await decide(id, { action: 'start_review' }));
  ok(
    await decide(id, {
      action: 'accept_report',
      severity: 'high',
      publicSummary: 'Reviewed finding for the reported Solana address.',
      internalRationale: 'Evidence reviewed.',
    }),
  );
  const r = store.revisions.find((r) => r.sourceCaseId === id);
  if (!r) throw new Error('missing revision');
  const staff = createMockModerationApi(opts());
  await staff.verifyStepUp('finding.approve', r.findingId, [r.findingId, r.revisionNumber, r.contentHash]);
  ok(await staff.approveRevision(r.findingId, r.revisionNumber, r.contentHash));
  const record = store.addresses.find((a) => a.chain === 'solana' && a.address === address);
  expect(record?.findings).toHaveLength(1);
  expect(record?.displayAddress).toBe(address);
  expect(record?.facts).toEqual([]);
  expect(record?.assessment.coverage).toContain('No chain data has been loaded');
});
