import type { ResetPasswordOutcome, TokenFlowOutcome } from '@blacklist/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { RegisterCompleteForm } from './register-complete-form';
import { ResetPasswordForm } from './reset-password-form';

const registerComplete = vi.fn<(token: string) => Promise<TokenFlowOutcome>>();
const resetPassword =
  vi.fn<
    (token: string, form: unknown, options?: { withPasskey: boolean }) => Promise<ResetPasswordOutcome>
  >();
vi.mock('@/lib/api/browser', () => ({ getAuthApi: async () => ({ registerComplete, resetPassword }) }));

function openAt(path: string) {
  window.history.replaceState(null, '', path);
}

beforeEach(() => {
  registerComplete.mockReset();
  resetPassword.mockReset();
});

describe('token pages', () => {
  it('strip the token from the address bar and send it only on submit', async () => {
    openAt('/reset-password#token=demo-valid-token-0001');
    resetPassword.mockResolvedValue({ kind: 'success' });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await screen.findByLabelText('New password');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/reset-password');
    expect(resetPassword).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('New password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm new password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
    expect(resetPassword.mock.calls[0]?.[0]).toBe('demo-valid-token-0001');
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByText(/every signed-in session is ended/)).toBeInTheDocument();
    expect(screen.getByText(/paused for 72 hours/)).toBeInTheDocument();
  });

  it('show the incomplete-link state when no token is present', async () => {
    openAt('/reset-password');
    render(<ResetPasswordForm />);
    expect(await screen.findByText('This link is incomplete')).toBeInTheDocument();
  });

  it('show the invalid state for a malformed token', async () => {
    openAt('/register/complete#token=bad');
    render(<RegisterCompleteForm />);
    expect(await screen.findByText('This link is not valid')).toBeInTheDocument();
  });

  it('show expired and used states returned by the API', async () => {
    openAt('/register/complete#token=expired-demo-token-0001');
    registerComplete.mockResolvedValue({ kind: 'token_problem', status: 'expired' });
    const user = userEvent.setup();
    render(<RegisterCompleteForm />);
    await user.type(await screen.findByLabelText('Handle'), 'demo_user');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/register');
  });

  it('explain a superseded link (only the newest email works)', async () => {
    openAt('/reset-password#token=superseded-demo-token-1');
    resetPassword.mockResolvedValue({ kind: 'token_problem', status: 'superseded' });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await user.type(await screen.findByLabelText('New password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm new password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('A newer link was sent')).toBeInTheDocument();
    expect(screen.getByText(/Only the most recent link works/)).toBeInTheDocument();
  });

  it('never persist the token in browser storage', async () => {
    openAt('/reset-password#token=demo-valid-token-0001');
    render(<ResetPasswordForm />);
    await screen.findByLabelText('New password');
    const stored = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(stored).not.toContain('demo-valid-token-0001');
    expect(window.location.href).not.toContain('demo-valid-token-0001');
  });

  it('enforce the password policy client-side before calling the API', async () => {
    openAt('/register/complete#token=demo-valid-token-0001');
    const user = userEvent.setup();
    render(<RegisterCompleteForm />);
    await user.type(await screen.findByLabelText('Handle'), 'demo_user');
    await user.type(screen.getByLabelText('Password'), 'fourteen chars');
    await user.type(screen.getByLabelText('Confirm password'), 'fourteen chars');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Use at least 15 characters/);
    expect(registerComplete).not.toHaveBeenCalled();
  });

  it('use new-password autocomplete and have no detectable accessibility violations', async () => {
    openAt('/register/complete#token=demo-valid-token-0001');
    const { container } = render(<RegisterCompleteForm />);
    expect(await screen.findByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('autocomplete', 'new-password');
    await expectNoAxeViolations(container);
  });
});

describe('staff password reset (identity §6.3, P2-02)', () => {
  const PASSWORD = 'correct horse battery staple';

  beforeEach(() => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function PublicKeyCredential() {},
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'PublicKeyCredential');
  });

  async function submitStaffReset(user: ReturnType<typeof userEvent.setup>) {
    openAt('/reset-password#token=staff-reset-token-0001');
    render(<ResetPasswordForm />);
    await user.type(await screen.findByLabelText('New password'), PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    return screen.findByRole('button', { name: 'Verify and set new password' });
  }

  it('does not show success after token and password alone', async () => {
    resetPassword.mockResolvedValue({ kind: 'passkey_required' });
    const user = userEvent.setup();
    await submitStaffReset(user);
    expect(screen.getByText(/This is a staff account/)).toBeInTheDocument();
    expect(screen.queryByText('Password changed')).toBeNull();
    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(resetPassword.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('completes only after the passkey verifies, resending the same password with the token', async () => {
    resetPassword
      .mockResolvedValueOnce({ kind: 'passkey_required' })
      .mockResolvedValueOnce({ kind: 'success' });
    const user = userEvent.setup();
    await user.click(await submitStaffReset(user));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(resetPassword).toHaveBeenLastCalledWith(
      'staff-reset-token-0001',
      { password: PASSWORD, confirmPassword: PASSWORD },
      { withPasskey: true },
    );
    const stored = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(stored).not.toContain(PASSWORD);
  });

  it.each([
    ['cancelled', 'Verification was cancelled'],
    ['timed_out', 'Verification timed out'],
    ['failed', 'Verification didn’t succeed'],
  ] as const)('stays unfinished and offers a retry when the passkey is %s', async (result, title) => {
    resetPassword
      .mockResolvedValueOnce({ kind: 'passkey_required' })
      .mockResolvedValueOnce({ kind: 'passkey_not_verified', result });
    const user = userEvent.setup();
    await user.click(await submitStaffReset(user));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByText('Password changed')).toBeNull();
  });

  it('detects a browser without passkeys before contacting the API again', async () => {
    resetPassword.mockResolvedValue({ kind: 'passkey_required' });
    const user = userEvent.setup();
    const verify = await submitStaffReset(user);
    Reflect.deleteProperty(window, 'PublicKeyCredential');
    await user.click(verify);
    expect(await screen.findByText('This browser can’t use passkeys')).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'How staff recovery works' })).toHaveAttribute(
      'href',
      '/staff/recovery',
    );
  });

  it('explains a link that expired during verification', async () => {
    resetPassword
      .mockResolvedValueOnce({ kind: 'passkey_required' })
      .mockResolvedValueOnce({ kind: 'token_problem', status: 'expired' });
    const user = userEvent.setup();
    await user.click(await submitStaffReset(user));
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
    expect(screen.queryByText('Password changed')).toBeNull();
  });

  it('has no detectable accessibility violations on the passkey step', async () => {
    resetPassword.mockResolvedValue({ kind: 'passkey_required' });
    const user = userEvent.setup();
    await submitStaffReset(user);
    await expectNoAxeViolations(document.body);
  });
});
