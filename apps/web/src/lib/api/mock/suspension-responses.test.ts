import { addressResearchSchema, projectDetailSchema, type CaseDecision } from '@blacklist/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberApi, MemberResult, ModerationApi, ModerationResult } from '../types';
import { createMockAdminApi } from './admin-api';
import { EVM } from './fixtures/ids';
import { createMockMemberApi } from './member-api';
import { createMockModerationApi, stepUpActionFor } from './moderation-api';
import { createMockResearchApi } from './research-api';
import { createStore, type MockStore } from './store';

let cookies = '';
let store: MockStore;
let staff: ModerationApi;
let member: MemberApi;
const as = (viewer: string) => {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=verified`;
};

beforeEach(() => {
  store = createStore();
  const options = {
    cookies: () => cookies,
    latencyMs: 0,
    now: () => new Date('2026-10-01T12:00:00Z'),
    store,
  };
  staff = createMockModerationApi(options);
  member = createMockMemberApi(options);
});

function ok<T>(result: ModerationResult<T> | MemberResult<T>): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}
const code = (result: { kind: string; code?: string }) => (result.kind === 'error' ? result.code : 'ok');
const research = () => createMockResearchApi({ latencyMs: 0, store });

async function addressPage(address: string) {
  const r = await research().getAddressResearch('ethereum', address);
  if (r.kind !== 'found') throw new Error('missing');
  expect(addressResearchSchema.safeParse(r.data).success).toBe(true);
  return r.data;
}

async function suspend(viewer: string, findingId: string) {
  as(viewer);
  await staff.verifyStepUp('finding.suspend', findingId);
  return staff.suspendFinding(findingId, 'Personal data was published by mistake.');
}

async function decide(viewer: string, id: string, decision: CaseDecision) {
  as(viewer);
  const version = ok(await staff.getCase(id)).version;
  if (decision.action !== 'start_review') {
    const c = ok(await staff.getCase(id));
    if (!c.assignedTo) ok(await staff.assign(id, version, { to: 'me' }));
  }
  await staff.verifyStepUp(stepUpActionFor(decision.action), id);
  return staff.decide(id, ok(await staff.getCase(id)).version, decision);
}

describe('emergency suspension (moderation §8.3)', () => {
  it('needs the suspend permission and a step-up', async () => {
    as('member');
    expect(code(await staff.suspendFinding('demo-finding-301', 'A reason long enough.'))).toBe('forbidden');
    as('appeal_reviewer');
    expect(code(await staff.suspendFinding('demo-finding-301', 'A reason long enough.'))).toBe('forbidden');
    as('moderator');
    expect(code(await staff.suspendFinding('demo-finding-301', 'A reason long enough.'))).toBe(
      'stepup_required',
    );
  });

  it('hides the finding text, removes it from scoring and opens a 72-hour review', async () => {
    const before = await addressPage(EVM.high);
    expect(before.assessment.band).toBe('high');
    const review = ok(await suspend('moderator', 'demo-finding-301'));
    expect(review.type).toBe('suspension_review');
    expect(new Date(review.slaDueAt).getTime() - new Date('2026-10-01T12:00:00Z').getTime()).toBe(
      72 * 3600 * 1000,
    );
    const after = await addressPage(EVM.high);
    const finding = after.findings.find((f) => f.id === 'demo-finding-301');
    expect(finding?.title).toBe('Temporarily suspended pending review');
    expect(finding?.disputeState).toBe('suspended_pending_review');
    expect(after.assessment.factors).toHaveLength(0);
    expect(after.assessment.band).toBe('low');
    expect(JSON.stringify(after)).not.toContain('Personal data was published by mistake');
    expect(code(await suspend('moderator', 'demo-finding-301'))).toBe('invalid_transition');
  });

  it('suspending a severe finding alerts every administrator', async () => {
    ok(await suspend('moderator_b', 'demo-finding-401'));
    as('admin');
    const overview = ok(
      await createMockAdminApi({ cookies: () => cookies, latencyMs: 0, store }).getOverview(),
    );
    expect(overview.alerts[0]?.text).toMatch(/suspended severe finding demo-finding-401/);
  });

  it('a participant cannot review; a non-participant reinstates and the finding counts again', async () => {
    const review = ok(await suspend('moderator', 'demo-finding-301'));
    as('moderator_b');
    ok(await staff.assign(review.id, review.version, { to: 'me' }));
    const refused = await decide('moderator_b', review.id, {
      action: 'reinstate_finding',
      publicSummary: 'The concern was resolved.',
      internalRationale: 'Checked the published text.',
    });
    expect(code(refused)).toBe('not_eligible');
    as('moderator_b');
    ok(await staff.assign(review.id, ok(await staff.getCase(review.id)).version, { to: 'nobody' }));
    ok(
      await decide('moderator', review.id, {
        action: 'reinstate_finding',
        publicSummary: 'The concern was resolved; no personal data remains.',
        internalRationale: 'Verified the text was corrected.',
      }),
    );
    const page = await addressPage(EVM.high);
    expect(page.findings.find((f) => f.id === 'demo-finding-301')?.title).not.toMatch(/suspended/i);
    expect(page.assessment.band).toBe('high');
    expect(page.timeline.some((e) => e.kind === 'finding_reinstated')).toBe(true);
  });

  it('a severe finding cannot be reversed by the person who suspended it', async () => {
    const review = ok(await suspend('admin', 'demo-finding-401'));
    const refused = await decide('admin', review.id, {
      action: 'reverse_finding',
      publicSummary: 'The finding named the wrong contract.',
      internalRationale: 'Deployment records show a different contract.',
    });
    expect(code(refused)).toBe('not_eligible');
  });

  it('a non-participant reverses: the finding is removed and the history explains', async () => {
    const review = ok(await suspend('moderator', 'demo-finding-301'));
    ok(
      await decide('admin', review.id, {
        action: 'reverse_finding',
        publicSummary: 'The finding named the wrong address.',
        internalRationale: 'Payment records point to a different address.',
      }),
    );
    const page = await addressPage(EVM.high);
    expect(page.findings.some((f) => f.id === 'demo-finding-301')).toBe(false);
    expect(page.timeline.find((e) => e.kind === 'finding_reversed')?.label).toMatch(/wrong address/);
  });
});

describe('right-of-reply responses (moderation §9)', () => {
  it('checks standing against the subject: no control signature for a contract, no authority signature for a wallet', async () => {
    as('member');
    const body = 'This contract belongs to a fictional bridge and was audited.';
    expect(
      code(
        await member.submitResponse({
          target: { kind: 'address', chain: 'ethereum', address: EVM.contractWithDisclosures },
          body,
          standing: { mechanism: 'signature', simulated: true },
        }),
      ),
    ).toBe('invalid');
    expect(
      code(
        await member.submitResponse({
          target: { kind: 'address', chain: 'ethereum', address: EVM.high },
          body,
          standing: { mechanism: 'authority_signature', authorityRole: 'owner', simulated: true },
        }),
      ),
    ).toBe('invalid');
  });

  it('a project response with DNS standing must use an official domain', async () => {
    as('member');
    const target = ok(await member.getResponseTarget({ kind: 'project', slug: 'demoswap' }));
    expect(target.domains.length).toBeGreaterThan(0);
    expect(
      code(
        await member.submitResponse({
          target: { kind: 'project', slug: 'demoswap' },
          body: 'DemoSwap responds to the published finding with context.',
          standing: { mechanism: 'dns_txt', domain: 'unrelated.example', simulated: true },
        }),
      ),
    ).toBe('invalid');
  });

  it('nothing is public until staff publish; then it appears as plain text with time-bound wording', async () => {
    as('member');
    const { id } = ok(
      await member.submitResponse({
        target: { kind: 'address', chain: 'ethereum', address: EVM.contractWithDisclosures },
        body: 'The owner role was transferred to a timelock on 1 September.',
        standing: { mechanism: 'authority_signature', authorityRole: 'owner', simulated: true },
      }),
    );
    expect((await addressPage(EVM.contractWithDisclosures)).responses).toHaveLength(0);
    as('member');
    expect(
      code(
        await member.submitResponse({
          target: { kind: 'address', chain: 'ethereum', address: EVM.contractWithDisclosures },
          body: 'A second response while the first is under review.',
          standing: { mechanism: 'authority_signature', authorityRole: 'owner', simulated: true },
        }),
      ),
    ).toBe('conflict');

    as('appeal_reviewer');
    expect(code(await staff.getCase(id))).toBe('not_found');
    ok(await decide('moderator', id, { action: 'start_review' }));
    ok(
      await decide('moderator', id, {
        action: 'publish_response',
        internalRationale: 'No personal data or links.',
      }),
    );
    const page = await addressPage(EVM.contractWithDisclosures);
    expect(page.responses[0]?.summary).toBe('The owner role was transferred to a timelock on 1 September.');
    expect(page.responses[0]?.standing).toBe('authority_signature');
    expect(JSON.stringify(page)).not.toContain('No personal data or links');
    as('member');
    const detail = ok(await member.getSubmission(id));
    expect(detail.status).toBe('Published');
    expect(detail.publicLink).toBe(`/address/ethereum/${EVM.contractWithDisclosures}`);
  });

  it('documentary standing is decided before publishing; a project response appears on the profile', async () => {
    as('member');
    const { id } = ok(
      await member.submitResponse({
        target: { kind: 'project', slug: 'demoswap' },
        body: 'DemoSwap’s team clarifies the timeline of the incident.',
        standing: {
          mechanism: 'documentary',
          explanation: 'Signed letter on company letterhead.',
          evidence: [{ name: 'letter.png', type: 'image/png', size: 1200 }],
        },
      }),
    );
    ok(await decide('moderator', id, { action: 'start_review' }));
    const early = await decide('moderator', id, {
      action: 'publish_response',
      internalRationale: 'Looks fine to publish.',
    });
    expect(code(early)).toBe('invalid_transition');
    ok(
      await decide('moderator', id, {
        action: 'grant_standing',
        internalRationale: 'The letter establishes the team.',
      }),
    );
    ok(
      await decide('moderator', id, {
        action: 'publish_response',
        internalRationale: 'No personal data or links.',
      }),
    );
    const project = await research().getProject('demoswap');
    if (project.kind !== 'found') throw new Error('missing');
    expect(projectDetailSchema.safeParse(project.data).success).toBe(true);
    expect(project.data.responses.some((r) => r.summary.includes('clarifies the timeline'))).toBe(true);
  });

  it('a rejected response shows the fixed-list reason to the responder only', async () => {
    as('member');
    const { id } = ok(
      await member.submitResponse({
        target: { kind: 'address', chain: 'ethereum', address: EVM.high },
        body: 'This response would include someone’s home address.',
        standing: { mechanism: 'signature', simulated: true },
      }),
    );
    ok(await decide('moderator', id, { action: 'start_review' }));
    ok(
      await decide('moderator', id, {
        action: 'reject_response',
        reason: 'out_of_scope',
        internalRationale: 'Contains personal data about a third party.',
      }),
    );
    expect((await addressPage(EVM.high)).responses).toHaveLength(0);
    as('member');
    const detail = ok(await member.getSubmission(id));
    expect(detail.submitterReason).toBe('out_of_scope');
    expect(JSON.stringify(detail)).not.toContain('third party');
  });
});

describe('profile (PRD §5.3)', () => {
  it('updates the display name only, and refuses markup', async () => {
    as('member');
    expect(ok(await member.getProfile()).handle).toBe('demo_member');
    expect(ok(await member.updateProfile({ displayName: 'Dee' })).displayName).toBe('Dee');
    expect(ok(await member.updateProfile({ displayName: '' })).displayName).toBeNull();
    expect(code(await member.updateProfile({ displayName: '<b>x</b>' }))).toBe('invalid');
    as('anonymous');
    expect(code(await member.getProfile())).toBe('sign_in_required');
  });
});
