import type { TokenFlowOutcome } from '@blacklist/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { RegisterCompleteForm } from './register-complete-form';
import { ResetPasswordForm } from './reset-password-form';

const registerComplete = vi.fn<(token: string) => Promise<TokenFlowOutcome>>();
const resetPassword = vi.fn<(token: string) => Promise<TokenFlowOutcome>>();
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
