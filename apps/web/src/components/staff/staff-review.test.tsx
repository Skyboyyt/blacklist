import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { createMockMemberApi } from '@/lib/api/mock/member-api';
import { createMockModerationApi } from '@/lib/api/mock/moderation-api';
import { createStore } from '@/lib/api/mock/store';
import type { ModerationApi } from '@/lib/api/types';
import { ApprovalsView } from './approvals-view';
import { AuditLogView } from './audit-log-view';
import { CaseWorkspace } from './case-workspace';
import { ReviewDashboard } from './review-dashboard';

let cookies = '';
let api: ModerationApi;
vi.mock('@/lib/api/browser', () => ({ getModerationApi: async () => api }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/mod',
}));

const NOW = '2026-09-28T12:00:00Z';
function as(viewer: string, passkey = 'verified') {
  cookies = `bl_mock_viewer=${viewer}; bl_mock_passkey=${passkey}`;
}

beforeEach(() => {
  as('moderator');
  api = createMockModerationApi({ cookies: () => cookies, latencyMs: 0, now: () => new Date(NOW) });
  Object.defineProperty(window, 'PublicKeyCredential', {
    value: function PublicKeyCredential() {},
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  Reflect.deleteProperty(window, 'PublicKeyCredential');
});

const HANDLES: Record<string, string> = {
  moderator: 'demo_moderator',
  moderator_b: 'demo_moderator_b',
  appeal_reviewer: 'demo_appeal_reviewer',
  admin: 'demo_admin',
};
function workspace(
  caseId: string,
  viewer = 'moderator',
  role: 'moderator' | 'admin' | 'appeal_reviewer' = 'moderator',
) {
  as(viewer);
  return render(<CaseWorkspace caseId={caseId} staffRole={role} myHandle={HANDLES[viewer] ?? viewer} />);
}

describe('review dashboard', () => {
  it('shows counts derived from the records and the queue', async () => {
    render(<ReviewDashboard staffRole="moderator" now={NOW} />);
    expect(await screen.findByText('Open reports')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '13 cases' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Overdue/).length).toBeGreaterThan(0);
  });

  it('filters by type with only that type’s documented statuses, and by assignment', async () => {
    const user = userEvent.setup();
    render(<ReviewDashboard staffRole="moderator" now={NOW} />);
    await screen.findByText('Open reports');
    await user.selectOptions(screen.getByLabelText('Case type'), 'appeal_review');
    const statuses = within(screen.getByLabelText('Status'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(statuses).toEqual([
      'Any status',
      'Submitted',
      'In review',
      'Upheld',
      'Amended',
      'Reversed',
      'Withdrawn',
    ]);
    await user.selectOptions(screen.getByLabelText('Assignment'), 'unassigned');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('heading', { name: '1 case' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Appeal against the severe finding/ })).toBeInTheDocument();
  });

  it('shows appeal reviewers appeals only, because the service returns only appeals', async () => {
    as('appeal_reviewer');
    render(<ReviewDashboard staffRole="appeal_reviewer" now={NOW} />);
    expect(await screen.findByRole('heading', { name: '2 cases' })).toBeInTheDocument();
    const types = within(screen.getByLabelText('Case type'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(types).toEqual(['Appeal']);
  });

  it('shows access denied for non-staff, and error and empty states', async () => {
    as('member');
    const denied = render(<ReviewDashboard staffRole="moderator" now={NOW} />);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    denied.unmount();
    as('moderator');
    const user = userEvent.setup();
    render(<ReviewDashboard staffRole="moderator" now={NOW} />);
    await screen.findByText('Open reports');
    await user.type(screen.getByLabelText(/^Search/), 'nothing-matches');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('No cases match these filters')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Search/));
    await user.type(screen.getByLabelText(/^Search/), 'error-demo');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('The review data couldn’t be loaded')).toBeInTheDocument();
  });
});

describe('case workspace', () => {
  it('never renders evidence as active content and explains unavailable items', async () => {
    const { container } = workspace('RPT-1003', 'moderator_b');
    expect(await screen.findByText(/It was never opened, previewed or rendered/)).toBeInTheDocument();
    expect(screen.getByText('Rejected file')).toBeInTheDocument();
    expect(screen.getByText('In quarantine')).toBeInTheDocument();
    expect(container.querySelector('iframe, object, embed, img, script')).toBeNull();
  });

  it('shows markup in statements as plain text', async () => {
    const { container } = workspace('RPT-1002');
    expect(await screen.findByText(/<b>10:02<\/b> approved token/)).toBeInTheDocument();
    expect(container.querySelector('#evidence b')).toBeNull();
  });

  it('shows the staff score as a labelled proposal and an unscored subject without a number', async () => {
    const scored = workspace('RPT-1002');
    expect(await screen.findByText('Staff only: calibration proposal')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    scored.unmount();
    workspace('RPT-1008');
    expect(await screen.findByText('Unscored')).toBeInTheDocument();
    expect(screen.getByText(/A missing score is not 0/)).toBeInTheDocument();
    expect(screen.queryByText(/Staff score/)).toBeNull();
  });

  it('confirms, then asks for a security key, then records the decision once', async () => {
    const user = userEvent.setup();
    workspace('RPT-1001');
    await user.click(await screen.findByRole('button', { name: 'Start review' }));
    await user.click(await screen.findByRole('button', { name: 'Reject report' }));
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    expect(screen.getByLabelText('Internal rationale')).toHaveAccessibleDescription(
      /Write at least 10 characters/,
    );
    await user.type(screen.getByLabelText('Internal rationale'), 'No payment evidence could be verified.');
    await user.selectOptions(screen.getByLabelText('Reason shown to the submitter'), 'insufficient_evidence');
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reject report?' });
    expect(within(confirm).getByText(/Internal rationale \(staff only\):/)).toBeInTheDocument();
    expect(within(confirm).getByText(/Submitter sees:/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Continue to security key' }));
    const stepUp = await screen.findByRole('dialog', { name: 'Verify with your security key' });
    await user.click(within(stepUp).getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByText('Shown to the submitter only')).toBeInTheDocument();
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Reject report' })).toBeNull();
  });

  it('does not decide when the security key step is cancelled', async () => {
    const user = userEvent.setup();
    workspace('RPT-1002');
    await user.click(await screen.findByRole('button', { name: 'Reject as abusive' }));
    await user.type(screen.getByLabelText('Internal rationale'), 'Repeated duplicate submissions.');
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    as('moderator', 'cancelled');
    const stepUp = await screen.findByRole('dialog', { name: 'Verify with your security key' });
    await user.click(within(stepUp).getByRole('button', { name: 'Verify and continue' }));
    expect(await within(stepUp).findByText('Verification was cancelled')).toBeInTheDocument();
    expect(
      (await api.getCase('RPT-1002')).kind === 'ok' &&
        ((await api.getCase('RPT-1002')) as { data: { status: string } }).data.status,
    ).toBe('in_review');
  });

  it('reports a conflicting change by another reviewer and offers the latest version', async () => {
    const user = userEvent.setup();
    workspace('RPT-1007', 'moderator_b');
    await user.type(await screen.findByLabelText('Add an internal note'), 'My working note.');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('This changed while you were working')).toBeInTheDocument();
    expect(screen.getByLabelText('Add an internal note')).toHaveValue('My working note.');
    await user.click(screen.getByRole('button', { name: 'Load the latest version' }));
    expect(
      await screen.findByText('Added evidence context while you had this case open.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('My working note.', { selector: 'p' })).toBeInTheDocument();
  });

  it('asks for confirmation before taking over another reviewer’s case', async () => {
    const user = userEvent.setup();
    workspace('RPT-1002', 'moderator_b');
    expect(await screen.findByText('Assigned to demo_moderator')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take over case' }));
    const dialog = screen.getByRole('dialog', { name: 'Take over this case?' });
    await user.click(within(dialog).getByRole('button', { name: 'Take over' }));
    expect(await screen.findByText('Assigned to you')).toBeInTheDocument();
  });

  it('shows the appealed decision and grounds, and refuses a participant', async () => {
    as('admin');
    await api.decide('APL-2001', 1, { action: 'start_review' });
    await api.assign('APL-2001', 2, { to: 'nobody' });
    const user = userEvent.setup();
    workspace('APL-2001');
    expect(await screen.findByText('Original decision')).toBeInTheDocument();
    expect(screen.getByText(/deployed by a former contractor/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));
    await user.click(await screen.findByRole('button', { name: 'Uphold finding' }));
    await user.type(screen.getByLabelText('Public explanation'), 'The finding stays after review.');
    await user.type(screen.getByLabelText('Internal rationale'), 'Documents do not change the conduct.');
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(await screen.findByText('You can’t take this decision')).toBeInTheDocument();
  });

  it('an administrator accepts a project suggestion with a public explanation', async () => {
    const user = userEvent.setup();
    const store = createStore();
    const options = { cookies: () => cookies, latencyMs: 0, now: () => new Date(NOW), store };
    api = createMockModerationApi(options);
    as('member');
    const submitted = await createMockMemberApi(options).submitSuggestion({
      name: 'Demo Lending Hub',
      category: 'defi',
      chain: 'ethereum',
      identifier: `0xb1ac${'7'.repeat(36)}`,
      links: ['https://lending-hub.example'],
      description: 'A fictional lending market used to demonstrate suggestions.',
      relationship: 'I am a fictional community member.',
      evidence: [],
    });
    if (submitted.kind !== 'ok') throw new Error('suggestion not created');
    as('admin');
    await api.assign(submitted.data.id, 1, { to: 'me' });
    workspace(submitted.data.id, 'admin', 'admin');
    expect(await screen.findByText('lending-hub[.]example', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept and publish profile' }));
    await user.type(
      screen.getByLabelText('Public explanation'),
      'Profile created from a checked suggestion.',
    );
    await user.type(screen.getByLabelText('Internal rationale'), 'Official link and contract matched.');
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(await screen.findByRole('link', { name: /\/project\/demo-lending-hub/ })).toBeInTheDocument();
  });

  it('refuses a moderator changing a project profile, and applies it for an administrator', async () => {
    const user = userEvent.setup();
    as('admin');
    await api.assign('COR-3002', 2, { to: 'nobody' });
    as('moderator');
    await api.assign('COR-3002', 3, { to: 'me' });
    const view = workspace('COR-3002');
    await user.click(await screen.findByRole('button', { name: 'Accept correction' }));
    expect(screen.getByText(/limited to administrators/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Public explanation'), 'The expired domain was retired.');
    await user.type(screen.getByLabelText('Internal rationale'), 'Registration lookup confirms expiry.');
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(await screen.findByText('Your role can’t do this')).toBeInTheDocument();
    view.unmount();

    as('admin');
    await api.assign('COR-3002', 4, { to: 'me', takeOver: true });
    workspace('COR-3002', 'admin', 'admin');
    expect(
      await screen.findByText(/Current public profile: revision 1. Official domains: dormant.example/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept correction' }));
    await user.type(screen.getByLabelText('Public explanation'), 'The expired domain was retired.');
    await user.type(screen.getByLabelText('Internal rationale'), 'Registration lookup confirms expiry.');
    await user.click(screen.getByRole('button', { name: 'Review and confirm' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(
      await screen.findByText(/Current public profile: revision 2. Official domains: none/),
    ).toBeInTheDocument();
    expect(screen.getByText('Project profile revised')).toBeInTheDocument();
  });

  it('shows not found for cases outside the reviewer’s scope', async () => {
    workspace('RPT-1001', 'appeal_reviewer', 'appeal_reviewer');
    expect(
      await screen.findByText('This case does not exist or is outside your review scope.'),
    ).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = workspace('APL-2002', 'appeal_reviewer', 'appeal_reviewer');
    await screen.findByText('Original decision');
    await expectNoAxeViolations(container);
  });
});

describe('approvals', () => {
  it('requires an independent approver for a severe revision', async () => {
    const user = userEvent.setup();
    render(<ApprovalsView />);
    const card = (await screen.findByRole('heading', { name: 'demo-finding-502 · revision 1' })).closest(
      'article',
    );
    if (!card) throw new Error('card missing');
    await user.click(within(card).getByRole('button', { name: 'Approve this revision' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(await screen.findByText(/Severe findings need an independent approver/)).toBeInTheDocument();
  });

  it('lets an independent approver publish, and refuses an outdated revision', async () => {
    as('moderator_b');
    const user = userEvent.setup();
    render(<ApprovalsView />);
    const outdated = (await screen.findByRole('heading', { name: 'demo-finding-503 · revision 1' })).closest(
      'article',
    );
    if (!outdated) throw new Error('card missing');
    await user.click(within(outdated).getByRole('button', { name: 'Approve this revision' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(await screen.findByText(/A newer revision of this finding exists/)).toBeInTheDocument();

    const severe = screen.getByRole('heading', { name: 'demo-finding-502 · revision 1' }).closest('article');
    if (!severe) throw new Error('card missing');
    await user.click(within(severe).getByRole('button', { name: 'Approve this revision' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to security key' }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Verify with your security key' })).getByRole(
        'button',
        { name: 'Verify and continue' },
      ),
    );
    expect(await screen.findByText('Revision approved')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(
          screen
            .getByRole('heading', { name: 'demo-finding-502 · revision 1' })
            .closest('article') as HTMLElement,
        ).getByText('Published'),
      ).toBeInTheDocument(),
    );
  });

  it('denies appeal reviewers', async () => {
    as('appeal_reviewer');
    render(<ApprovalsView />);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });
});

describe('audit history', () => {
  it('is refused for moderators and shown, labelled as mock, to administrators', async () => {
    const denied = render(<AuditLogView />);
    expect(
      await screen.findByText('The audit history is available to administrators only.'),
    ).toBeInTheDocument();
    denied.unmount();
    as('admin');
    render(<AuditLogView />);
    expect(await screen.findByText('Mock audit history')).toBeInTheDocument();
    expect(screen.getAllByText('Case created').length).toBeGreaterThan(0);
  });
});
