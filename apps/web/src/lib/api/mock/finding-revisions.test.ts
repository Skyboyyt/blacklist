import { addressResearchSchema, findingHistorySchema, type CaseDecision } from '@blacklist/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ModerationApi, ModerationResult } from '../types';
import { EVM } from './fixtures/ids';
import { createMockModerationApi, stepUpActionFor } from './moderation-api';
import { createMockResearchApi } from './research-api';
import { createStore, type MockStore } from './store';

let cookies = '';
let store: MockStore;
let staff: ModerationApi;
const as = (viewer: string) => {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=verified`;
};

beforeEach(() => {
  store = createStore();
  staff = createMockModerationApi({
    cookies: () => cookies,
    latencyMs: 0,
    now: () => new Date('2026-10-01T12:00:00Z'),
    store,
  });
});

function ok<T>(result: ModerationResult<T>): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}
const code = (result: { kind: string; code?: string }) => (result.kind === 'error' ? result.code : 'ok');

async function publicFinding(address: string, findingId: string) {
  const r = await createMockResearchApi({ latencyMs: 0, store }).getAddressResearch('ethereum', address);
  if (r.kind !== 'found') throw new Error('missing');
  expect(addressResearchSchema.safeParse(r.data).success).toBe(true);
  return { page: r.data, finding: r.data.findings.find((f) => f.id === findingId) };
}

async function latestBase(findingId: string) {
  const history = ok(await staff.getFindingHistory(findingId));
  const latest = history.revisions[0];
  if (!latest) throw new Error('no revision');
  return { revisionNumber: latest.revisionNumber, contentHash: latest.contentHash };
}

async function approve(viewer: string, findingId: string) {
  as(viewer);
  const { revisionNumber, contentHash } = await latestBase(findingId);
  await staff.verifyStepUp('finding.approve', findingId, [findingId, revisionNumber, contentHash]);
  return staff.approveRevision(findingId, revisionNumber, contentHash);
}

const EDIT = {
  severity: 'high' as const,
  publicSummary: 'Payments from at least four people reached this address after a fake support chat.',
  internalRationale: 'Two further reports confirmed the same pattern.',
};

describe('finding revision editor (moderation §2, §8.1)', () => {
  it('shows the immutable history of a published finding to staff with finding:propose only', async () => {
    as('moderator');
    const history = ok(await staff.getFindingHistory('demo-finding-301'));
    expect(findingHistorySchema.safeParse(history).success).toBe(true);
    expect(history.revisions[0]).toMatchObject({ revisionNumber: 1, status: 'published' });
    expect(history.publicText).toBeTruthy();
    expect(code(await staff.getFindingHistory('demo-finding-unknown'))).toBe('not_found');
    as('appeal_reviewer');
    expect(code(await staff.getFindingHistory('demo-finding-301'))).toBe('forbidden');
    as('member');
    expect(code(await staff.getFindingHistory('demo-finding-301'))).toBe('forbidden');
  });

  it('a change creates a new revision with a new hash; the earlier one is untouched and nothing public changes', async () => {
    as('moderator');
    const before = structuredClone(store.revisions.find((r) => r.findingId === 'demo-finding-301'));
    const publicBefore = (await publicFinding(EVM.high, 'demo-finding-301')).finding;
    const history = ok(
      await staff.proposeRevision('demo-finding-301', await latestBase('demo-finding-301'), EDIT),
    );
    const [created, original] = history.revisions;
    expect(created).toMatchObject({ revisionNumber: 2, status: 'proposed', isLatest: true });
    expect(created?.contentHash).not.toBe(original?.contentHash);
    expect(original).toMatchObject({ ...before, isLatest: false });
    expect(original?.status).toBe('published');
    expect((await publicFinding(EVM.high, 'demo-finding-301')).finding).toEqual(publicBefore);
  });

  it('refuses a stale base and an unchanged draft', async () => {
    as('moderator');
    const base = await latestBase('demo-finding-301');
    ok(await staff.proposeRevision('demo-finding-301', base, EDIT));
    const stale = await staff.proposeRevision('demo-finding-301', base, {
      ...EDIT,
      publicSummary: 'A different edit from an older screen.',
    });
    expect(stale).toMatchObject({ kind: 'error', code: 'conflict', currentVersion: 2 });
    const same = await staff.proposeRevision('demo-finding-301', await latestBase('demo-finding-301'), EDIT);
    expect(code(same)).toBe('invalid_transition');
    expect(store.revisions.filter((r) => r.findingId === 'demo-finding-301')).toHaveLength(2);
  });

  it('a non-severe revision may be self-approved; publication replaces the public text and supersedes the old revision', async () => {
    as('moderator');
    ok(await staff.proposeRevision('demo-finding-301', await latestBase('demo-finding-301'), EDIT));
    ok(await approve('moderator', 'demo-finding-301'));
    const { page, finding } = await publicFinding(EVM.high, 'demo-finding-301');
    expect(finding?.summary).toBe(EDIT.publicSummary);
    expect(page.timeline.some((e) => /Revision 2 of a finding was published/.test(e.label))).toBe(true);
    expect(JSON.stringify(page)).not.toContain(EDIT.internalRationale);
    const statuses = store.revisions
      .filter((r) => r.findingId === 'demo-finding-301')
      .map((r) => [r.revisionNumber, r.status]);
    expect(statuses).toEqual([
      [1, 'superseded'],
      [2, 'published'],
    ]);
  });

  it('an approval names one exact revision: a newer revision makes the older one unapprovable', async () => {
    as('moderator');
    ok(await staff.proposeRevision('demo-finding-301', await latestBase('demo-finding-301'), EDIT));
    ok(
      await staff.proposeRevision('demo-finding-301', await latestBase('demo-finding-301'), {
        ...EDIT,
        publicSummary: 'Payments from at least five people reached this address after a fake support chat.',
      }),
    );
    const older = store.revisions.find((r) => r.findingId === 'demo-finding-301' && r.revisionNumber === 2);
    if (!older) throw new Error('missing');
    expect(older.status).toBe('superseded');
    await staff.verifyStepUp('finding.approve', 'demo-finding-301', [
      'demo-finding-301',
      2,
      older.contentHash,
    ]);
    expect(code(await staff.approveRevision('demo-finding-301', 2, older.contentHash))).toBe('conflict');
  });

  it('replacing a public severe revision needs an independent approver who took no part in it', async () => {
    as('moderator');
    const history = ok(
      await staff.proposeRevision('demo-finding-401', await latestBase('demo-finding-401'), {
        ...EDIT,
        severity: 'high',
      }),
    );
    expect(history.revisions[0]?.status).toBe('pending_second_approval');
    // Author of the new revision (and of the public one).
    expect(code(await approve('moderator', 'demo-finding-401'))).toBe('not_eligible');
    // Approver of the public severe revision.
    expect(code(await approve('moderator_b', 'demo-finding-401'))).toBe('not_eligible');
    ok(await approve('admin', 'demo-finding-401'));
    const { finding } = await publicFinding(EVM.severeUnderAppeal, 'demo-finding-401');
    expect(finding?.summary).toBe(EDIT.publicSummary);
  });

  it('a revision can be proposed during an emergency suspension but never published until the review ends', async () => {
    as('admin');
    const reason = 'Personal data was published by mistake.';
    await staff.verifyStepUp('finding.suspend', 'demo-finding-301', ['demo-finding-301', reason]);
    ok(await staff.suspendFinding('demo-finding-301', reason));
    as('moderator');
    const history = ok(
      await staff.proposeRevision('demo-finding-301', await latestBase('demo-finding-301'), {
        ...EDIT,
        publicSummary: 'Payments reached this address after a fake support chat; personal data removed.',
      }),
    );
    expect(history.approvalBlockedReason).toMatch(/suspension/);
    expect(code(await approve('moderator', 'demo-finding-301'))).toBe('invalid_transition');
    expect((await publicFinding(EVM.high, 'demo-finding-301')).finding?.title).toBe(
      'Temporarily suspended pending review',
    );
  });
});

describe('appeal amendment (moderation §8.1, §9)', () => {
  async function decide(viewer: string, id: string, decision: CaseDecision) {
    as(viewer);
    const c = ok(await staff.getCase(id));
    await staff.verifyStepUp(stepUpActionFor(decision.action), id, [id, c.version, decision]);
    return staff.decide(id, c.version, decision);
  }

  const AMEND = {
    action: 'amend' as const,
    severity: 'medium' as const,
    publicSummary: 'Payments reached this address, but the earlier text overstated the number of victims.',
    internalRationale: 'The appellant showed two reports were duplicates.',
  };

  it('creates a new revision authored by the reviewer; the public text changes only after a fresh approval', async () => {
    const { finding: before } = await publicFinding(EVM.high, 'demo-finding-301');
    ok(await decide('appeal_reviewer', 'APL-2002', AMEND));
    const latest = store.revisions.find((r) => r.findingId === 'demo-finding-301' && r.isLatest);
    expect(latest).toMatchObject({
      revisionNumber: 2,
      severity: 'medium',
      status: 'proposed',
      sourceCaseId: 'APL-2002',
      publicSummary: AMEND.publicSummary,
    });
    const { page, finding } = await publicFinding(EVM.high, 'demo-finding-301');
    expect(finding?.summary).toBe(before?.summary);
    expect(finding?.disputeState).toBe('none');
    expect(JSON.stringify(page)).not.toContain(AMEND.publicSummary);
    ok(await approve('moderator', 'demo-finding-301'));
    expect((await publicFinding(EVM.high, 'demo-finding-301')).finding?.summary).toBe(AMEND.publicSummary);
  });

  it('the decision needs a severity and a public summary', async () => {
    const result = await decide('appeal_reviewer', 'APL-2002', {
      action: 'amend',
      publicSummary: AMEND.publicSummary,
      internalRationale: AMEND.internalRationale,
    } as unknown as CaseDecision);
    expect(code(result)).not.toBe('ok');
    expect(store.revisions.filter((r) => r.findingId === 'demo-finding-301')).toHaveLength(1);
  });
});
