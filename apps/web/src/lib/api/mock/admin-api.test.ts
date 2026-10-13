import { addressResearchSchema } from '@blacklist/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminApi, MemberApi, ModerationApi, ModerationResult } from '../types';
import { createMockAdminApi } from './admin-api';
import { SOLANA, EVM } from './fixtures/ids';
import { createMockMemberApi } from './member-api';
import { createMockModerationApi } from './moderation-api';
import { createMockResearchApi } from './research-api';
import { createStore, type MockStore } from './store';

let cookies = '';
let store: MockStore;
let admin: AdminApi;
let staff: ModerationApi;
let member: MemberApi;
let clock = new Date('2026-10-01T12:00:00Z');
const as = (viewer: string, passkey = 'verified') => {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=${passkey}`;
};

beforeEach(() => {
  as('admin');
  store = createStore();
  clock = new Date('2026-10-01T12:00:00Z');
  const options = { cookies: () => cookies, latencyMs: 0, now: () => clock, store };
  admin = createMockAdminApi(options);
  staff = createMockModerationApi(options);
  member = createMockMemberApi(options);
});

function ok<T>(result: ModerationResult<T>): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}
const code = (result: { kind: string; code?: string }) => (result.kind === 'error' ? result.code : 'ok');

async function withStepUp<T>(
  action: string,
  target: string,
  parameters: readonly unknown[],
  run: () => Promise<T>,
): Promise<T> {
  await admin.verifyStepUp(action, target, parameters);
  return run();
}

const research = () => createMockResearchApi({ latencyMs: 0, store });

describe('access', () => {
  it('refuses everyone but an active administrator', async () => {
    for (const viewer of ['anonymous', 'member', 'moderator', 'appeal_reviewer']) {
      as(viewer);
      expect(code(await admin.getOverview())).toBe('forbidden');
      expect(code(await admin.listStaff())).toBe('forbidden');
      expect(code(await admin.suspendMember('usr_demo_member', 'A reason long enough.'))).toBe('forbidden');
    }
  });

  it('needs a fresh, single-use step-up for consequential actions', async () => {
    expect(code(await admin.suspendMember('usr_demo_member', 'Repeated abusive reports.'))).toBe(
      'stepup_required',
    );
    await admin.verifyStepUp('user.suspend', 'usr_demo_member', [
      'usr_demo_member',
      'Repeated abusive reports.',
    ]);
    ok(await admin.suspendMember('usr_demo_member', 'Repeated abusive reports.'));
    expect(code(await admin.restoreMember('usr_demo_member', 'Suspension was a mistake.'))).toBe(
      'stepup_required',
    );
  });
});

describe('two-person rules (identity §10.4, §10.8)', () => {
  it('an admin invitation waits for a second, different administrator', async () => {
    const created = ok(
      await withStepUp('staff.invite', 'new', [{ email: 'new.admin@example.test', role: 'admin' }], () =>
        admin.createInvitation({ email: 'new.admin@example.test', role: 'admin' }),
      ),
    );
    expect(created.invitation.state).toBe('pending_approval');
    expect(created.enrollmentCode).toMatch(/^DEMO\d{6}$/);
    expect(created.invitation.emailMasked).toBe('n•••@example.test');
    expect(
      code(
        await withStepUp('staff.invitation.approve', created.invitation.id, [created.invitation.id], () =>
          admin.approveInvitation(created.invitation.id),
        ),
      ),
    ).toBe('not_eligible');
    as('admin_b');
    const approved = ok(
      await withStepUp('staff.invitation.approve', created.invitation.id, [created.invitation.id], () =>
        admin.approveInvitation(created.invitation.id),
      ),
    );
    expect(approved.state).toBe('issued');
    expect(approved.approvedBy?.handle).toBe('demo_admin_b');
  });

  it('refuses to invite an email that already belongs to an account', async () => {
    const result = await withStepUp(
      'staff.invite',
      'new',
      [{ email: 'demo_member@example.test', role: 'moderator' }],
      () => admin.createInvitation({ email: 'demo_member@example.test', role: 'moderator' }),
    );
    expect(code(result)).toBe('invalid_transition');
  });

  it('a moderator invitation is issued at once by one administrator', async () => {
    const created = ok(
      await withStepUp(
        'staff.invite',
        'new',
        [{ email: 'reviewer@example.test', role: 'appeal_reviewer' }],
        () => admin.createInvitation({ email: 'reviewer@example.test', role: 'appeal_reviewer' }),
      ),
    );
    expect(created.invitation.state).toBe('issued');
  });

  it('a role grant needs a second admin, while removing a moderator role is immediate', async () => {
    const pending = ok(
      await withStepUp(
        'staff.role',
        'stf_mod_a',
        [{ targetId: 'stf_mod_a', role: 'appeal_reviewer', action: 'grant' }],
        () => admin.requestRoleChange({ targetId: 'stf_mod_a', role: 'appeal_reviewer', action: 'grant' }),
      ),
    );
    const request = pending[0];
    if (!request) throw new Error('no request');
    expect(request.state).toBe('pending');
    expect(store.staff.find((s) => s.id === 'stf_mod_a')?.roles).toEqual(['moderator']);
    expect(
      code(
        await withStepUp('staff.role.approve', request.id, [request.id], () =>
          admin.approveRoleRequest(request.id),
        ),
      ),
    ).toBe('not_eligible');
    as('admin_b');
    ok(
      await withStepUp('staff.role.approve', request.id, [request.id], () =>
        admin.approveRoleRequest(request.id),
      ),
    );
    expect(store.staff.find((s) => s.id === 'stf_mod_a')?.roles).toEqual(['moderator', 'appeal_reviewer']);

    ok(
      await withStepUp(
        'staff.role',
        'stf_mod_b',
        [{ targetId: 'stf_mod_b', role: 'moderator', action: 'revoke' }],
        () => admin.requestRoleChange({ targetId: 'stf_mod_b', role: 'moderator', action: 'revoke' }),
      ),
    );
    expect(store.staff.find((s) => s.id === 'stf_mod_b')?.roles).toEqual([]);
    as('moderator_b');
    expect(code(await staff.getQueue({}))).toBe('forbidden');
  });

  it('removing another administrator waits for a second admin; the last admin is never removed', async () => {
    ok(
      await withStepUp(
        'staff.role',
        'stf_admin_b',
        [{ targetId: 'stf_admin_b', role: 'admin', action: 'revoke' }],
        () => admin.requestRoleChange({ targetId: 'stf_admin_b', role: 'admin', action: 'revoke' }),
      ),
    );
    expect(store.staff.find((s) => s.id === 'stf_admin_b')?.roles).toEqual(['admin']);
    expect(store.roleRequests[0]?.state).toBe('pending');
  });
});

describe('staff suspension, offboarding and recovery', () => {
  it('suspension ends staff access at once and releases assigned cases', async () => {
    as('moderator_b');
    expect(code(await staff.getQueue({}))).toBe('ok');
    as('admin');
    ok(
      await withStepUp(
        'staff.suspend',
        'stf_mod_b',
        ['stf_mod_b', 'Suspected compromise of the account.'],
        () => admin.suspendStaff('stf_mod_b', 'Suspected compromise of the account.'),
      ),
    );
    as('moderator_b');
    expect(code(await staff.getQueue({}))).toBe('forbidden');
    expect([...store.cases.values()].some((c) => c.assignedTo?.id === 'stf_mod_b')).toBe(false);
  });

  it('offboarding deactivates the account and revokes the invitations it issued', async () => {
    as('admin_b');
    ok(
      await withStepUp('staff.offboard', 'stf_admin', ['stf_admin', 'Left the organisation.'], () =>
        admin.offboardStaff('stf_admin', 'Left the organisation.'),
      ),
    );
    const departed = store.staff.find((s) => s.id === 'stf_admin');
    expect(departed?.status).toBe('deactivated');
    expect(departed?.roles).toEqual([]);
    expect(store.invitations.find((i) => i.id === 'INV-1001')?.state).toBe('revoked');
  });

  it('recovery needs two verifiers, a different approver and a 24-hour objection window', async () => {
    const opened = ok(
      await withStepUp('staff.recovery.open', 'stf_mod_c', ['stf_mod_c'], () =>
        admin.openRecovery('stf_mod_c'),
      ),
    );
    expect(store.staff.find((s) => s.id === 'stf_mod_c')?.status).toBe('suspended');
    ok(await admin.verifyRecovery(opened.id, 'Video call with ID check.'));
    expect(code(await admin.verifyRecovery(opened.id, 'Second check by the same person.'))).toBe(
      'not_eligible',
    );
    as('admin_b');
    const verified = ok(await admin.verifyRecovery(opened.id, 'Call-back to the number on file.'));
    expect(verified.state).toBe('awaiting_approval');
    as('admin');
    expect(
      code(
        await withStepUp('staff.recovery.approve', opened.id, [opened.id], () =>
          admin.approveRecovery(opened.id),
        ),
      ),
    ).toBe('not_eligible');
    as('admin_b');
    const approved = ok(
      await withStepUp('staff.recovery.approve', opened.id, [opened.id], () =>
        admin.approveRecovery(opened.id),
      ),
    );
    expect(approved.state).toBe('objection_window');
    expect(code(await admin.completeRecovery(opened.id))).toBe('invalid_transition');
    clock = new Date(clock.getTime() + 25 * 60 * 60 * 1000);
    expect(ok(await admin.completeRecovery(opened.id)).state).toBe('completed');
    expect(store.invitations[0]?.state).toBe('issued');
  });
});

describe('members, labels and suppressions reach the rest of the demo', () => {
  it('a suspended member cannot submit', async () => {
    ok(
      await withStepUp(
        'user.suspend',
        'usr_demo_member',
        ['usr_demo_member', 'Repeated abusive reports.'],
        () => admin.suspendMember('usr_demo_member', 'Repeated abusive reports.'),
      ),
    );
    as('member');
    const result = await member.submitSuggestion({
      name: 'Demo Lending Hub',
      category: 'defi',
      chain: 'ethereum',
      identifier: `0xb1ac${'7'.repeat(36)}`,
      links: ['https://lending-hub.example'],
      description: 'A fictional lending market used to demonstrate suggestions.',
      relationship: 'I am a fictional community member.',
      evidence: [],
    });
    expect(code(result)).toBe('account_suspended');
    expect(code(await member.listSubmissions())).toBe('ok');
  });

  it('a label shows on the public page without changing the band, and retiring removes it', async () => {
    const before = await research().getAddressResearch('ethereum', EVM.low);
    if (before.kind !== 'found') throw new Error('missing');
    const labels = ok(
      await admin.addLabel({
        chain: 'ethereum',
        address: EVM.low,
        text: 'Demo exchange deposit wallet',
        provenance: 'external_source',
        sourceName: 'Fictional exchange registry',
        basisNote: 'Listed in the fictional registry export.',
      }),
    );
    const after = await research().getAddressResearch('ethereum', EVM.low);
    if (after.kind !== 'found') throw new Error('missing');
    expect(addressResearchSchema.safeParse(after.data).success).toBe(true);
    expect(after.data.labels.map((l) => l.text)).toContain('Demo exchange deposit wallet');
    expect(after.data.assessment.band).toBe(before.data.assessment.band);
    expect(JSON.stringify(after.data)).not.toContain('fictional registry export');
    const id = labels[0]?.id ?? '';
    ok(await admin.retireLabel(id, 'Registry entry was withdrawn.'));
    const retired = await research().getAddressResearch('ethereum', EVM.low);
    expect(retired.kind === 'found' && retired.data.labels.some((l) => l.id === id)).toBe(false);
  });

  it('a suppression removes the indicator, recomputes the band and is shown publicly with its reason', async () => {
    const before = await research().getAddressResearch('solana', SOLANA.lookalikeToken);
    expect(before.kind === 'found' && before.data.assessment.band).toBe('moderate');
    const request = {
      chain: 'solana' as const,
      address: SOLANA.lookalikeToken,
      factorCode: 'token.symbol_impersonation' as const,
      publicReason: 'The issuer showed the token is an officially bridged version.',
      internalRationale: 'INTERNAL-ONLY bridge documentation was reviewed.',
    };
    expect(code(await admin.suppressSignal(request))).toBe('stepup_required');
    const list = ok(
      await withStepUp('signal.suppress', 'new', [request], () => admin.suppressSignal(request)),
    );
    const after = await research().getAddressResearch('solana', SOLANA.lookalikeToken);
    if (after.kind !== 'found') throw new Error('missing');
    expect(after.data.assessment.factors).toHaveLength(0);
    expect(after.data.assessment.band).toBe('low');
    expect(after.data.assessment.suppressions[0]?.publicReason).toMatch(/officially bridged/);
    expect(JSON.stringify(after.data)).not.toContain('INTERNAL-ONLY');
    const id = list[0]?.id ?? '';
    ok(
      await withStepUp('signal.suppression.lift', id, [id, 'New evidence of impersonation.'], () =>
        admin.liftSuppression(id, 'New evidence of impersonation.'),
      ),
    );
    const lifted = await research().getAddressResearch('solana', SOLANA.lookalikeToken);
    expect(lifted.kind === 'found' && lifted.data.assessment.band).toBe('moderate');
  });

  it('findings cannot be suppressed: only analysis indicators', async () => {
    const result = await withStepUp(
      'signal.suppress',
      'new',
      [
        {
          chain: 'ethereum',
          address: EVM.high,
          factorCode: 'eoa.delegated_to_flagged',
          publicReason: 'Trying to suppress a finding factor.',
          internalRationale: 'This must be refused by the service.',
        },
      ],
      () =>
        admin.suppressSignal({
          chain: 'ethereum',
          address: EVM.high,
          factorCode: 'eoa.delegated_to_flagged',
          publicReason: 'Trying to suppress a finding factor.',
          internalRationale: 'This must be refused by the service.',
        }),
    );
    expect(code(result)).toBe('invalid_transition');
  });
});
