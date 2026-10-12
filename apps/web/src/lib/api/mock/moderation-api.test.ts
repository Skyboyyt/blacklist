import {
  addressResearchSchema,
  caseDetailSchema,
  queueResponseSchema,
  staffAssessmentSchema,
  type CaseDecision,
} from '@blacklist/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ModerationApi, ModerationResult } from '../types';
import { ADDRESS_FIXTURES } from './fixtures/addresses';
import { CASE_FIXTURES } from './fixtures/moderation';
import { PROJECT_ADDRESS_FIXTURES, PROJECT_FIXTURES } from './fixtures/projects';
import { createMockModerationApi, stepUpActionFor } from './moderation-api';
import { applyCorrection } from './profile-corrections';
import { createProjectCatalog } from './project-api';
import { PROPOSED_CONTRIBUTIONS, staffAssessmentFor } from './staff-scoring';

let cookies = '';
let api: ModerationApi;
const as = (viewer: string, passkey = 'verified') => {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=${passkey}`;
};

beforeEach(() => {
  as('moderator');
  api = createMockModerationApi({
    cookies: () => cookies,
    latencyMs: 0,
    now: () => new Date('2026-09-28T12:00:00Z'),
  });
});

function data<T>(result: ModerationResult<T>): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}
const code = (result: ModerationResult<unknown>) => (result.kind === 'error' ? result.code : 'ok');
const version = async (id: string) => data(await api.getCase(id)).version;

async function decide(id: string, decision: CaseDecision) {
  await api.verifyStepUp(stepUpActionFor(decision.action), id);
  return api.decide(id, await version(id), decision);
}

const reason = 'Enough detail for the internal record.';

describe('fixtures', () => {
  it('conform to the staff contracts', () => {
    for (const c of CASE_FIXTURES) expect(caseDetailSchema.safeParse(c).success).toBe(true);
  });
});

describe('access and roles (ARCHITECTURE §9.2)', () => {
  it('refuses members and anonymous viewers on every method', async () => {
    for (const viewer of ['member', 'anonymous']) {
      as(viewer);
      expect(code(await api.getQueue({}))).toBe('forbidden');
      expect(code(await api.getCase('RPT-1001'))).toBe('forbidden');
      expect(code(await api.assign('RPT-1001', 1, { to: 'me' }))).toBe('forbidden');
      expect(code(await api.decide('RPT-1001', 1, { action: 'start_review' }))).toBe('forbidden');
      expect(code(await api.listRevisions())).toBe('forbidden');
      expect(code(await api.getAuditLog())).toBe('forbidden');
      expect(await api.verifyStepUp('case.accept_report', 'RPT-1001')).toEqual({ kind: 'session_expired' });
    }
  });

  it('limits appeal reviewers to appeal cases in the service, not only in the UI', async () => {
    as('appeal_reviewer');
    const queue = data(await api.getQueue({}));
    expect(queue.items.every((i) => i.type === 'appeal_review')).toBe(true);
    expect(queue.counts.openReports).toBe(0);
    expect(code(await api.getCase('RPT-1001'))).toBe('not_found');
    expect(code(await api.decide('RPT-1001', 1, { action: 'start_review' }))).toBe('not_found');
    expect(code(await api.assign('APL-2001', 1, { to: 'me' }))).toBe('forbidden');
    expect(code(await api.listRevisions())).toBe('forbidden');
  });

  it('gives the audit history to administrators only', async () => {
    expect(code(await api.getAuditLog())).toBe('forbidden');
    as('admin');
    expect(data(await api.getAuditLog()).length).toBeGreaterThan(0);
  });
});

describe('queue', () => {
  it('derives counts from the records and paginates', async () => {
    const queue = queueResponseSchema.parse(data(await api.getQueue({})));
    expect(queue.totalItems).toBe(CASE_FIXTURES.length);
    expect(queue.items).toHaveLength(8);
    expect(queue.totalPages).toBe(2);
    expect(queue.counts).toEqual({
      openReports: 6,
      needsInfo: 1,
      openAppeals: 2,
      openCorrections: 2,
      openSuggestions: 0,
      openResponses: 0,
      openSuspensionReviews: 0,
      unassigned: 5,
      pendingApprovals: 3,
    });
  });

  it('filters by type, status, network, assignment and search', async () => {
    const ids = async (request: Parameters<ModerationApi['getQueue']>[0]) =>
      data(await api.getQueue(request)).items.map((i) => i.id);
    expect(await ids({ type: 'appeal_review' })).toEqual(['APL-2002', 'APL-2001']);
    expect(await ids({ type: 'report_review', status: 'needs_info' })).toEqual(['RPT-1003']);
    expect((await ids({ chain: 'solana' })).sort()).toEqual(['RPT-1003', 'RPT-1004']);
    expect((await ids({ assignment: 'unassigned' })).sort()).toEqual([
      'APL-2001',
      'COR-3001',
      'RPT-1001',
      'RPT-1004',
      'RPT-1008',
    ]);
    expect((await ids({ assignment: 'mine' })).sort()).toEqual(['COR-3003', 'RPT-1002', 'RPT-1005']);
    expect(await ids({ query: 'demoswap' })).toEqual(['COR-3001']);
  });

  it('sorts open cases by the earliest review deadline by default, closed cases last', async () => {
    const open = data(await api.getQueue({ assignment: 'any' })).items.filter((i) =>
      ['submitted', 'screening', 'queued', 'in_review', 'needs_info'].includes(i.status),
    );
    const due = open.map((i) => i.slaDueAt);
    expect(due).toEqual([...due].sort());
    const page2 = data(await api.getQueue({ page: 2 })).items;
    expect(page2.slice(-3).every((i) => ['accepted', 'rejected'].includes(i.status))).toBe(true);
    expect(page2.slice(0, -3).every((i) => !['accepted', 'rejected'].includes(i.status))).toBe(true);
  });
});

describe('workflow transitions (moderation §9–§10)', () => {
  it('starts a review and assigns an unassigned case to the reviewer', async () => {
    const c = data(await api.decide('RPT-1001', 1, { action: 'start_review' }));
    expect(c.status).toBe('in_review');
    expect(c.assignedTo?.handle).toBe('demo_moderator');
    expect(c.version).toBe(2);
  });

  it('refuses decisions the status or case type does not allow', async () => {
    expect(
      code(
        await decide('RPT-1001', { action: 'reject_report', reason: 'duplicate', internalRationale: reason }),
      ),
    ).toBe('invalid_transition');
    expect(code(await api.decide('RPT-1008', 1, { action: 'start_review' }))).toBe('invalid_transition');
    as('appeal_reviewer');
    expect(
      code(
        await api.decide('APL-2002', 2, {
          action: 'request_info',
          messageToSubmitter: 'Please send more detail.',
        }),
      ),
    ).toBe('invalid_transition');
  });

  it('needs a fresh, single-use step-up for consequential decisions', async () => {
    await api.decide('RPT-1001', 1, { action: 'start_review' });
    const decision: CaseDecision = {
      action: 'reject_report',
      reason: 'insufficient_evidence',
      internalRationale: reason,
    };
    expect(code(await api.decide('RPT-1001', 2, decision))).toBe('stepup_required');
    await api.verifyStepUp('case.accept_report', 'RPT-1001');
    expect(code(await api.decide('RPT-1001', 2, decision))).toBe('stepup_required');
    as('moderator', 'cancelled');
    expect(await api.verifyStepUp(stepUpActionFor('reject_report'), 'RPT-1001')).toEqual({
      kind: 'cancelled',
    });
    expect(code(await api.decide('RPT-1001', 2, decision))).toBe('stepup_required');
    as('moderator');
    const decided = data(await decide('RPT-1001', decision));
    expect(decided.status).toBe('rejected');
    expect(decided.submitterReason).toBe('insufficient_evidence');
  });

  it('lets only the assigned reviewer decide, and needs confirmation to take a case over', async () => {
    as('moderator_b');
    expect(code(await decide('RPT-1002', { action: 'reject_abusive', internalRationale: reason }))).toBe(
      'not_eligible',
    );
    expect(code(await api.assign('RPT-1002', 3, { to: 'me' }))).toBe('not_eligible');
    const taken = data(await api.assign('RPT-1002', 3, { to: 'me', takeOver: true }));
    expect(taken.assignedTo?.handle).toBe('demo_moderator_b');
    expect(taken.history.at(-1)?.changes).toEqual([
      { field: 'assigned_to', from: 'demo_moderator', to: 'demo_moderator_b' },
    ]);
  });

  it('accepting a report creates a finding revision awaiting approval, never a publication', async () => {
    const c = data(
      await decide('RPT-1002', {
        action: 'accept_report',
        severity: 'severe',
        publicSummary: 'This contract drains approved tokens.',
        internalRationale: reason,
      }),
    );
    expect(c.status).toBe('accepted');
    const revisions = data(await api.listRevisions());
    const created = revisions.find((r) => r.sourceCaseId === 'RPT-1002');
    expect(created?.status).toBe('pending_second_approval');
    expect(created?.author.handle).toBe('demo_moderator');
  });
});

describe('conflicts and duplicates', () => {
  it('reports another reviewer’s concurrent change instead of overwriting it', async () => {
    as('moderator_b');
    const seen = await version('RPT-1007');
    const first = await api.addNote('RPT-1007', seen, 'My note.');
    expect(first.kind === 'error' && first.code).toBe('conflict');
    const latest = data(await api.getCase('RPT-1007'));
    expect(latest.notes.map((n) => n.author.handle)).toContain('demo_moderator');
    expect(latest.notes.some((n) => n.text === 'My note.')).toBe(false);
    expect(code(await api.addNote('RPT-1007', latest.version, 'My note.'))).toBe('ok');
  });

  it('rejects a repeated submission with the old version', async () => {
    expect(code(await api.decide('RPT-1001', 1, { action: 'start_review' }))).toBe('ok');
    expect(code(await api.decide('RPT-1001', 1, { action: 'start_review' }))).toBe('conflict');
  });
});

describe('appeals (moderation §9)', () => {
  it('refuses participants of the appealed decision', async () => {
    as('admin');
    await api.decide('APL-2001', 1, { action: 'start_review' });
    as('moderator');
    expect(code(await api.assign('APL-2001', await version('APL-2001'), { to: 'me', takeOver: true }))).toBe(
      'ok',
    );
    const result = await decide('APL-2001', {
      action: 'uphold',
      publicSummary: 'The finding stays after review.',
      internalRationale: reason,
    });
    expect(result.kind === 'error' && result.code).toBe('not_eligible');
  });

  it('lets an independent appeal reviewer decide, with the original decision and grounds kept', async () => {
    as('appeal_reviewer');
    const c = data(
      await decide('APL-2002', {
        action: 'reverse',
        publicSummary: 'The finding was reversed on appeal.',
        internalRationale: reason,
      }),
    );
    expect(c.status).toBe('reversed');
    expect(c.type === 'appeal_review' && c.appealedDecision.findingId).toBe('demo-finding-301');
    expect(c.type === 'appeal_review' && c.grounds).toMatch(/I control this wallet/);
    expect(c.history.at(-1)?.action).toBe('appeal_decided');
  });
});

describe('project-profile corrections', () => {
  it('moderators cannot change a project profile; administrators can', async () => {
    await api.decide('COR-3001', 1, { action: 'start_review' });
    const decision: CaseDecision = {
      action: 'accept_correction',
      publicSummary: 'Profile description updated.',
      internalRationale: reason,
    };
    expect(code(await decide('COR-3001', decision))).toBe('forbidden');
    as('admin');
    await api.assign('COR-3001', await version('COR-3001'), { to: 'me', takeOver: true });
    const before = data(await api.getProfileState('demoswap'));
    expect(code(await decide('COR-3001', decision))).toBe('ok');
    const after = data(await api.getProfileState('demoswap'));
    expect(after.revision).toBe(before.revision + 1);
    expect(after.domains).toContain('docs.demoswap.example');
    expect(after.description).toMatch(/staff-approved correction/);
  });

  it('a rejected correction keeps the existing profile', async () => {
    as('admin');
    const before = data(await api.getProfileState('demo-dormant-protocol'));
    expect(
      code(
        await decide('COR-3002', {
          action: 'reject_correction',
          reason: 'not_reproducible',
          internalRationale: reason,
        }),
      ),
    ).toBe('ok');
    expect(data(await api.getProfileState('demo-dormant-protocol'))).toEqual(before);
  });

  it('applyCorrection adds, retires and replaces only the proposed fields', () => {
    const profile = { slug: 'x', revision: 3, description: 'Old.', domains: ['a.example', 'b.example'] };
    expect(
      applyCorrection(profile, [
        { field: 'description', label: 'Description', current: 'Old.', proposed: 'New.' },
        { field: 'domain_added', label: 'Added', current: null, proposed: 'c.example' },
        { field: 'domain_retired', label: 'Retired', current: 'a.example', proposed: null },
      ]),
    ).toEqual({ slug: 'x', revision: 4, description: 'New.', domains: ['b.example', 'c.example'] });
  });
});

describe('finding approvals (moderation §4)', () => {
  it('requires an independent approver for severe revisions', async () => {
    await api.verifyStepUp('finding.approve', 'demo-finding-502');
    expect(code(await api.approveRevision('demo-finding-502', 1, 'b2c3d4e5f6071829'))).toBe('not_eligible');
    as('moderator_b');
    await api.verifyStepUp('finding.approve', 'demo-finding-502');
    const revisions = data(await api.approveRevision('demo-finding-502', 1, 'b2c3d4e5f6071829'));
    expect(revisions.find((r) => r.findingId === 'demo-finding-502')?.status).toBe('published');
    as('admin');
    const log = data(await api.getAuditLog());
    expect(log.slice(0, 2).map((e) => [e.action, e.actor === 'system' ? 'system' : e.actor.handle])).toEqual([
      ['finding_approved', 'demo_moderator_b'],
      ['finding_became_public', 'system'],
    ]);
  });

  it('allows self-approval of a non-severe revision', async () => {
    await api.verifyStepUp('finding.approve', 'demo-finding-501');
    expect(code(await api.approveRevision('demo-finding-501', 1, 'a1b2c3d4e5f60718'))).toBe('ok');
  });

  it('refuses a superseded revision and blocks publication while evidence is unavailable', async () => {
    expect(code(await api.approveRevision('demo-finding-503', 1, 'c3d4e5f60718293a'))).toBe('conflict');
    await api.verifyStepUp('finding.approve', 'demo-finding-503');
    expect(code(await api.approveRevision('demo-finding-503', 2, 'd4e5f60718293a4b'))).toBe(
      'evidence_unavailable',
    );
  });
});

describe('privacy: internal notes stay staff-only', () => {
  it('public project data never contains internal notes, rationales or reporter references', async () => {
    await decide('RPT-1002', {
      action: 'reject_abusive',
      internalRationale: 'INTERNAL-ONLY rationale text.',
    });
    const publicDetails = createProjectCatalog({
      addresses: addressResearchSchema.array().parse([...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]),
      projects: PROJECT_FIXTURES,
    }).details;
    const text = JSON.stringify(publicDetails) + JSON.stringify(ADDRESS_FIXTURES);
    for (const c of CASE_FIXTURES) {
      for (const note of c.notes) expect(text).not.toContain(note.text);
      if (c.type === 'report_review') {
        expect(text).not.toContain(c.reporterRef);
        expect(text).not.toContain(c.narrative);
      }
    }
    expect(text).not.toContain('INTERNAL-ONLY');
  });
});

describe('staff scoring demonstration (§15.3 proposal, O-12 open)', () => {
  it('matches the public band, uses only documented contributions, and never scores missing data', () => {
    for (const research of [...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]) {
      const staff = staffAssessmentSchema.parse(staffAssessmentFor(research));
      if (research.assessment.band === 'not_assessed') {
        expect(staff.kind).toBe('unscored');
        continue;
      }
      expect(staff.kind).toBe('scored');
      if (staff.kind !== 'scored') continue;
      expect(staff.band).toBe(research.assessment.band);
      expect(staff.calibration).toBe('proposal_not_signed_off');
      for (const c of staff.contributions) expect(c.contribution).toBe(PROPOSED_CONTRIBUTIONS[c.factorCode]);
      expect(staff.ceiling).toBe(
        staff.contributions.some((c) => c.factorCode === 'finding.severe') ? 100 : 74,
      );
    }
  });
});
