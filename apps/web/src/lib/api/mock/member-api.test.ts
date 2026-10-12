import {
  memberSubmissionDetailSchema,
  type CaseDecision,
  type ReportRequest,
  type SuggestionRequest,
} from '@blacklist/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberApi, MemberResult, ModerationApi, ModerationResult } from '../types';
import { EVM } from './fixtures/ids';
import { createMockMemberApi } from './member-api';
import { createMockModerationApi, stepUpActionFor } from './moderation-api';
import { createProjectCatalog } from './project-api';
import { createStore, type MockStore } from './store';

let cookies = '';
let store: MockStore;
let member: MemberApi;
let staff: ModerationApi;
const as = (viewer: string) => {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=verified`;
};

beforeEach(() => {
  as('member');
  store = createStore();
  const options = {
    cookies: () => cookies,
    latencyMs: 0,
    now: () => new Date('2026-10-01T12:00:00Z'),
    store,
  };
  member = createMockMemberApi(options);
  staff = createMockModerationApi(options);
});

async function submitted(result: MemberResult<{ readonly id: string }>) {
  return ok(await member.getSubmission(ok(result).id));
}

function ok<T>(result: MemberResult<T> | ModerationResult<T>): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}
const code = (result: MemberResult<unknown>) => (result.kind === 'error' ? result.code : 'ok');

async function staffDecide(viewer: string, id: string, decision: CaseDecision) {
  as(viewer);
  await staff.verifyStepUp(stepUpActionFor(decision.action), id);
  const version = ok(await staff.getCase(id)).version;
  const result = await staff.decide(id, version, decision);
  as('member');
  return result;
}

const report: ReportRequest = {
  category: 'phishing',
  title: 'Fake airdrop claim page',
  subjects: [{ chain: 'ethereum', address: EVM.low }],
  narrative: 'A fake airdrop page asked me to approve a token spender.',
  incidentDate: '2026-09-01',
  txRefs: [],
  urls: ['https://claim-airdrop.example'],
  evidence: [{ name: 'screenshot.png', type: 'image/png', size: 2048 }],
};

const suggestion: SuggestionRequest = {
  name: 'Demo Lending Hub',
  category: 'defi',
  chain: 'ethereum',
  identifier: `0xb1ac${'7'.repeat(36)}`,
  links: ['https://lending-hub.example'],
  description: 'A fictional lending market used to demonstrate suggestions.',
  relationship: 'I am a fictional community member.',
  evidence: [],
};

describe('access and ownership', () => {
  it('asks signed-out viewers to sign in on every method', async () => {
    as('anonymous');
    expect(code(await member.listSubmissions())).toBe('sign_in_required');
    expect(code(await member.getSubmission('RPT-1003'))).toBe('sign_in_required');
    expect(code(await member.submitReport(report))).toBe('sign_in_required');
    expect(code(await member.respond('RPT-1003', 1, { message: 'More information.', evidence: [] }))).toBe(
      'sign_in_required',
    );
    expect(code(await member.listNotices())).toBe('sign_in_required');
  });

  it("lists only the member's own submissions and hides others as not found", async () => {
    const ids = ok(await member.listSubmissions()).map((s) => s.id);
    expect(ids.sort()).toEqual(['COR-3003', 'RPT-1003']);
    expect(code(await member.getSubmission('RPT-1001'))).toBe('not_found');
    expect(code(await member.withdraw('RPT-1001', 1))).toBe('not_found');
  });

  it('never returns internal notes, rationales or staff identities to the member', async () => {
    as('moderator');
    const before = ok(await staff.getCase('RPT-1003'));
    ok(await staff.addNote('RPT-1003', before.version, 'INTERNAL-NOTE do not show the reporter.'));
    as('member');
    const detail = ok(await member.getSubmission('RPT-1003'));
    expect(memberSubmissionDetailSchema.safeParse(detail).success).toBe(true);
    const text = JSON.stringify(detail);
    expect(text).not.toContain('INTERNAL-NOTE');
    expect(text).not.toMatch(/demo_moderator|stf_mod/);
  });
});

describe('submissions', () => {
  it('returns field errors and saves nothing for an invalid report', async () => {
    const result = await member.submitReport({
      ...report,
      subjects: [{ chain: 'solana', address: EVM.low }],
      narrative: 'short',
    });
    expect(
      result.kind === 'error' && result.code === 'invalid' ? Object.keys(result.fieldErrors).sort() : [],
    ).toEqual(['narrative', 'subjects.0.address']);
    expect(ok(await member.listSubmissions())).toHaveLength(2);
  });

  it('refuses non-image evidence and oversized files', async () => {
    const result = await member.submitReport({
      ...report,
      evidence: [{ name: 'page.html', type: 'text/html' as 'image/png', size: 10 }],
    });
    expect(code(result)).toBe('invalid');
    const big = await member.submitReport({
      ...report,
      evidence: [{ name: 'big.png', type: 'image/png', size: 11 * 1024 * 1024 }],
    });
    expect(code(big)).toBe('invalid');
  });

  it('a new report is private, waits for review, and reaches the staff queue', async () => {
    const detail = await submitted(await member.submitReport(report));
    expect(detail.status).toBe('Waiting for review');
    expect(detail.evidenceNames).toEqual(['screenshot.png']);
    expect(ok(await member.listNotices())[0]?.text).toMatch(/received/i);
    as('moderator');
    const queue = ok(await staff.getQueue({ type: 'report_review' }));
    expect(queue.items.map((c) => c.id)).toContain(detail.id);
  });
});

describe('information requests, replies and withdrawal', () => {
  it('reports a stale reply as a conflict and accepts the current version', async () => {
    const detail = ok(await member.getSubmission('RPT-1003'));
    expect(detail.canRespond).toBe(true);
    expect(detail.infoRequest).not.toBeNull();
    expect(
      code(await member.respond('RPT-1003', detail.version - 1, { message: 'Too late now.', evidence: [] })),
    ).toBe('conflict');
    const after = ok(
      await member.respond('RPT-1003', detail.version, { message: 'Here is the transaction.', evidence: [] }),
    );
    expect(after.status).toBe('In review');
    expect(after.canRespond).toBe(false);
    as('moderator');
    expect(ok(await staff.getCase('RPT-1003')).submitterMessages.at(-1)?.text).toBe(
      'Here is the transaction.',
    );
  });

  it('refuses a reply when no information was requested', async () => {
    const created = await submitted(await member.submitReport(report));
    expect(
      code(
        await member.respond(created.id, created.version, { message: 'Unrequested reply.', evidence: [] }),
      ),
    ).toBe('invalid_transition');
  });

  it('allows withdrawal before a decision and refuses it afterwards', async () => {
    const created = await submitted(await member.submitReport(report));
    const withdrawn = ok(await member.withdraw(created.id, created.version));
    expect(withdrawn.status).toBe('Withdrawn');
    expect(code(await member.withdraw('COR-3003', ok(await member.getSubmission('COR-3003')).version))).toBe(
      'invalid_transition',
    );
  });
});

describe('appeals and standing (moderation §6, §9)', () => {
  const finding = (id: string) => store.addresses.flatMap((a) => a.findings).find((f) => f.id === id);

  it('documentary standing waits for staff; the finding shows it is under appeal', async () => {
    store.cases.delete('APL-2002');
    const detail = await submitted(
      await member.submitAppeal({
        findingId: 'demo-finding-301',
        grounds: 'The payments were refunds from a support desk I operate.',
        standing: {
          mechanism: 'documentary',
          explanation: 'Refund records for each payment.',
          evidence: [{ name: 'records.png', type: 'image/png', size: 1000 }],
        },
      }),
    );
    expect(finding('demo-finding-301')?.disputeState).toBe('under_appeal');
    as('moderator');
    const c = ok(await staff.getCase(detail.id));
    expect(c.type === 'appeal_review' && c.standing.outcome).toBe('pending');
    as('member');
    expect(
      code(
        await member.submitAppeal({
          findingId: 'demo-finding-301',
          grounds: 'A second appeal on the same finding.',
          standing: { mechanism: 'signature', simulated: true },
        }),
      ),
    ).toBe('conflict');
    ok(await member.withdraw(detail.id, detail.version));
    expect(finding('demo-finding-301')?.disputeState).toBe('none');
  });

  it("withdrawing keeps the finding under appeal while someone else's appeal is open", async () => {
    const detail = await submitted(
      await member.submitAppeal({
        findingId: 'demo-finding-301',
        grounds: 'The payments were refunds from a support desk I operate.',
        standing: { mechanism: 'signature', simulated: true },
      }),
    );
    ok(await member.withdraw(detail.id, detail.version));
    expect(finding('demo-finding-301')?.disputeState).toBe('under_appeal');
  });

  it('labels simulated signature standing and never downgrades a suspended finding', async () => {
    const detail = await submitted(
      await member.submitAppeal({
        findingId: 'demo-finding-501',
        grounds: 'This finding confuses my wallet with another one.',
        standing: { mechanism: 'signature', simulated: true },
      }),
    );
    as('moderator');
    const c = ok(await staff.getCase(detail.id));
    expect(c.type === 'appeal_review' && c.standing.scopeStatement).toMatch(/^SIMULATED/);
    expect(finding('demo-finding-501')?.disputeState).toBe('suspended_pending_review');
  });

  it('the signing challenge authorizes no transaction', async () => {
    const challenge = ok(await member.getStandingChallenge('demo-finding-301'));
    expect(challenge.message).toMatch(/does not authorize any transaction/);
  });

  it('a standing decision comes first, then a reversal removes the finding and its factor', async () => {
    const detail = await submitted(
      await member.submitAppeal({
        findingId: 'demo-finding-301',
        grounds: 'The payments were refunds from a support desk I operate.',
        standing: {
          mechanism: 'documentary',
          explanation: 'Refund records for each payment.',
          evidence: [{ name: 'records.png', type: 'image/png', size: 1000 }],
        },
      }),
    );
    ok(await staffDecide('moderator', detail.id, { action: 'start_review' }));
    const early = await staffDecide('moderator', detail.id, {
      action: 'reverse',
      publicSummary: 'The payments were refunds.',
      internalRationale: 'Records verified in detail.',
    });
    expect(early.kind === 'error' && early.code).toBe('invalid_transition');
    expect(
      (
        await staffDecide('moderator_b', detail.id, {
          action: 'grant_standing',
          internalRationale: 'Participant.',
        })
      ).kind,
    ).toBe('error');
    ok(
      await staffDecide('moderator', detail.id, {
        action: 'grant_standing',
        internalRationale: 'Records match.',
      }),
    );
    ok(
      await staffDecide('moderator', detail.id, {
        action: 'reverse',
        publicSummary: 'The payments were refunds.',
        internalRationale: 'Records verified in detail.',
      }),
    );
    const address = store.addresses.find((a) => a.address === EVM.high);
    expect(address?.findings.some((f) => f.id === 'demo-finding-301')).toBe(false);
    expect(address?.assessment.factors.some((f) => f.id === 'high-r1')).toBe(false);
    expect(ok(await member.getSubmission(detail.id)).status).toBe('Decided: finding reversed');
  });
});

describe('project suggestions (ADR 0010 Part A)', () => {
  it('only an administrator can accept; the profile then appears in the directory', async () => {
    const created = await submitted(await member.submitSuggestion(suggestion));
    as('moderator');
    ok(await staff.assign(created.id, ok(await staff.getCase(created.id)).version, { to: 'me' }));
    const refused = await staffDecide('moderator', created.id, {
      action: 'accept_suggestion',
      publicSummary: 'Profile created from a checked suggestion.',
      internalRationale: 'Checked the official links.',
    });
    expect(refused.kind === 'error' && refused.code).toBe('forbidden');

    as('admin');
    ok(
      await staff.assign(created.id, ok(await staff.getCase(created.id)).version, {
        to: 'me',
        takeOver: true,
      }),
    );
    ok(
      await staffDecide('admin', created.id, {
        action: 'accept_suggestion',
        publicSummary: 'Profile created from a checked suggestion.',
        internalRationale: 'Official link and contract matched.',
      }),
    );
    const detail = ok(await member.getSubmission(created.id));
    expect(detail.status).toBe('Accepted: profile published');
    expect(detail.publicLink).toMatch(/^\/project\/demo-lending-hub/);

    const catalog = createProjectCatalog(store);
    const listed = catalog.list({ query: 'Lending', findings: 'any', page: 1, sort: 'name' });
    expect(listed.kind === 'results' ? listed.items.map((p) => p.name) : []).toContain('Demo Lending Hub');
    const slug = detail.publicLink?.split('/').pop() ?? '';
    const project = catalog.get(slug);
    expect(project.kind === 'found' && project.data.description).toMatch(/fictional lending market/);
    expect(JSON.stringify(project)).not.toContain('fictional community member');
  });
});
