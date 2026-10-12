import type { RecoveryStage } from '@blacklist/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { createMockAccountApis } from '@/lib/api/mock/account-api';
import { RecoveryProgress } from './recovery-progress';
import { StaffEnrollmentFlow } from './staff-enrollment-flow';
import { StaffSecurityPanel } from './staff-security-panel';
import { StaffVerify } from './staff-verify';

let cookies = '';
let apis = createMockAccountApis({
  cookies: () => cookies,
  signOut: vi.fn(),
  signInStaff: vi.fn(),
  latencyMs: 0,
  passkeyLatencyMs: 0,
});

vi.mock('@/lib/api/browser', () => ({
  getAccountApi: async () => apis.account,
  getStaffSecurityApi: async () => apis.staff,
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/staff/verify',
}));

function setPasskey(result: string) {
  cookies = `bl_mock_viewer=moderator; bl_mock_passkey=${result}`;
}

beforeEach(() => {
  setPasskey('verified');
  push.mockClear();
  apis = createMockAccountApis({
    cookies: () => cookies,
    signOut: vi.fn(),
    signInStaff: vi.fn(),
    latencyMs: 0,
    passkeyLatencyMs: 0,
  });
  Object.defineProperty(window, 'PublicKeyCredential', {
    value: function PublicKeyCredential() {},
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'PublicKeyCredential');
});

describe('staff passkey verification', () => {
  it.each([
    ['cancelled', 'Verification was cancelled'],
    ['timed_out', 'Verification timed out'],
    ['failed', 'Verification didn’t succeed'],
  ])('shows the %s state with a retry', async (result, title) => {
    setPasskey(result);
    const user = userEvent.setup();
    render(<StaffVerify />);
    await user.click(screen.getByRole('button', { name: 'Use security key or passkey' }));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('detects browsers without WebAuthn before starting', async () => {
    Reflect.deleteProperty(window, 'PublicKeyCredential');
    const user = userEvent.setup();
    render(<StaffVerify />);
    await user.click(screen.getByRole('button', { name: 'Use security key or passkey' }));
    expect(await screen.findByText('This browser can’t use passkeys')).toBeInTheDocument();
  });

  it('opens the staff area only after verification', async () => {
    const user = userEvent.setup();
    render(<StaffVerify />);
    await user.click(screen.getByRole('button', { name: 'Use security key or passkey' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/mod'));
  });

  it('links to the recovery explanation and has no accessibility violations', async () => {
    const { container } = render(<StaffVerify />);
    expect(screen.getByRole('link', { name: 'How staff recovery works' })).toHaveAttribute(
      'href',
      '/staff/recovery',
    );
    await expectNoAxeViolations(container);
  });
});

describe('staff enrollment', () => {
  const open = (token: string) => window.history.replaceState(null, '', `/staff/enroll#token=${token}`);

  it('needs the out-of-band code, then a password and two authenticators, then activates', async () => {
    open('demo-invite-token-0001');
    const sendPassword = vi.spyOn(apis.staff, 'setEnrollmentPassword');
    const user = userEvent.setup();
    render(<StaffEnrollmentFlow />);
    const code = await screen.findByLabelText('Enrollment code');
    expect(window.location.hash).toBe('');
    await user.type(code, 'wrong00000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/That code is incorrect\. 3 attempts left\./)).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, 'demo-2026-ab');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(await screen.findByLabelText('Password'), 'a long staff passphrase');
    await user.type(screen.getByLabelText('Confirm password'), 'a long staff passphrase');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // P2-01: the chosen password reaches the bound enrollment flow, and only the password.
    await waitFor(() => expect(sendPassword).toHaveBeenCalledWith({ password: 'a long staff passphrase' }));

    await user.click(await screen.findByRole('button', { name: 'Register first authenticator' }));
    expect(
      await screen.findByText(/Two registrations do not guarantee two independent devices/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register second authenticator' }));
    expect(await screen.findByText('Your staff account is ready')).toBeInTheDocument();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  async function reachPasswordStep(user: ReturnType<typeof userEvent.setup>) {
    open('demo-invite-token-0001');
    render(<StaffEnrollmentFlow />);
    await user.type(await screen.findByLabelText('Enrollment code'), 'DEMO2026AB');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Password'), 'a long staff passphrase');
    await user.type(screen.getByLabelText('Confirm password'), 'a long staff passphrase');
  }

  it('does not activate when the password never reached the enrollment flow', async () => {
    // A client that skips delivering the password: the flow refuses activation.
    vi.spyOn(apis.staff, 'setEnrollmentPassword').mockResolvedValue({ kind: 'ok' });
    const user = userEvent.setup();
    await reachPasswordStep(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Register first authenticator' }));
    await user.click(await screen.findByRole('button', { name: 'Register second authenticator' }));
    expect(await screen.findByText('Enrollment isn’t finished')).toBeInTheDocument();
    expect(screen.queryByText('Your staff account is ready')).toBeNull();
  });

  it('stays on the password step when the enrollment session has ended', async () => {
    vi.spyOn(apis.staff, 'setEnrollmentPassword').mockResolvedValue({
      kind: 'error',
      code: 'session_expired',
    });
    const user = userEvent.setup();
    await reachPasswordStep(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Your enrollment session has ended')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register first authenticator' })).toBeNull();
  });

  it('keeps the user on the step when the authenticator prompt is cancelled', async () => {
    open('demo-invite-token-0001');
    const user = userEvent.setup();
    render(<StaffEnrollmentFlow />);
    await user.type(await screen.findByLabelText('Enrollment code'), 'DEMO2026AB');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Password'), 'a long staff passphrase');
    await user.type(screen.getByLabelText('Confirm password'), 'a long staff passphrase');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    setPasskey('cancelled');
    await user.click(await screen.findByRole('button', { name: 'Register first authenticator' }));
    expect(await screen.findByText('Verification was cancelled')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Enrollment steps' }).querySelector('[aria-current="step"]'),
    ).toHaveTextContent('First authenticator');
  });

  it.each([
    ['expired-invite-token-01', 'This link has expired'],
    ['superseded-invite-tok-1', 'A newer link was sent'],
    ['revoked-invite-token-01', 'This link is not valid'],
  ])('explains invitation problems (%s)', async (token, title) => {
    open(token);
    const user = userEvent.setup();
    render(<StaffEnrollmentFlow />);
    await user.type(await screen.findByLabelText('Enrollment code'), 'DEMO2026AB');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(title)).toBeInTheDocument();
  });
});

describe('staff security keys', () => {
  it('requires a fresh, action-bound verification before removing an authenticator', async () => {
    const user = userEvent.setup();
    render(<StaffSecurityPanel />);
    await user.click(await screen.findByRole('button', { name: 'Remove Hardware security key' }));
    const stepUp = screen.getByRole('dialog', { name: 'Verify with your security key' });
    expect(within(stepUp).getByText(/This verification applies to this action only/)).toBeInTheDocument();
    await user.click(within(stepUp).getByRole('button', { name: 'Verify and continue' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove this authenticator?' });
    expect(within(confirm).getByText(/fewer than two/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByText(/Staff accounts need at least 2 security keys or passkeys/),
    ).toBeInTheDocument();
  });

  it('does not remove anything when step-up is cancelled', async () => {
    setPasskey('cancelled');
    const user = userEvent.setup();
    render(<StaffSecurityPanel />);
    await user.click(await screen.findByRole('button', { name: 'Remove Hardware security key' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByText('Verification was cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Remove this authenticator?' })).toBeNull();
  });

  it('explains that synced passkeys can share fate', async () => {
    render(<StaffSecurityPanel />);
    expect(await screen.findByText(/Synced passkeys can be lost together/)).toBeInTheDocument();
  });
});

describe('staff recovery progress', () => {
  const status = (stage: RecoveryStage) => ({
    stage,
    openedAt: '2026-10-03T09:00:00Z',
    objectionWindowEndsAt: '2026-10-06T10:30:00Z',
    identityVerificationsCompleted: 1,
  });

  it('shows every required step in order and marks the current one', () => {
    render(<RecoveryProgress status={status('identity_verification')} />);
    const steps = screen.getAllByRole('listitem');
    expect(steps.map((s) => s.querySelector('p')?.textContent?.replace(/ \(.*\)$/, ''))).toEqual([
      'Recovery case opened',
      'Identity verification',
      'Second administrator approval',
      '24-hour objection window',
      'Fresh enrollment',
      'Recovery completed',
    ]);
    expect(screen.getByText('1 of 2 verifications completed.')).toBeInTheDocument();
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
  });

  it('shows the objection window end and the rejected state', () => {
    const view = render(<RecoveryProgress status={status('objection_window')} />);
    expect(screen.getByText(/if no one objects/)).toBeInTheDocument();
    view.unmount();
    render(<RecoveryProgress status={status('rejected')} />);
    expect(screen.getByText('Recovery was not approved')).toBeInTheDocument();
    expect(screen.getByText(/stays suspended/)).toBeInTheDocument();
  });
});
