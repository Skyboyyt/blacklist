import type { LoginOutcome } from '@blacklist/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { LoginForm } from './login-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let resolveLogin: ((outcome: LoginOutcome) => void) | undefined;
const login = vi.fn(() => new Promise<LoginOutcome>((resolve) => (resolveLogin = resolve)));
vi.mock('@/lib/api/browser', () => ({ getAuthApi: async () => ({ login }) }));

beforeEach(() => {
  push.mockClear();
  login.mockClear();
});

const email = () => screen.getByLabelText('Email');
const password = () => screen.getByLabelText('Password');

describe('LoginForm', () => {
  it('uses the right autocomplete tokens and input types', () => {
    render(<LoginForm next="/dashboard" />);
    expect(email()).toHaveAttribute('autocomplete', 'username');
    expect(email()).toHaveAttribute('type', 'email');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
    expect(password()).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });

  it('shows accessible inline errors and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveAccessibleDescription(/Enter your email address/);
    expect(password()).toHaveAccessibleDescription(/Enter your password/);
    expect(email()).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
  });

  it('toggles password visibility accessibly', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    await user.click(toggle);
    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('prevents double submission while signing in', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/reports" />);
    await user.type(email(), 'member@example.test');
    await user.type(password(), 'a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    const busy = screen.getByRole('button', { name: /Signing in/ });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    await user.keyboard('{Enter}');
    expect(login).toHaveBeenCalledTimes(1);
    resolveLogin?.({ kind: 'signed_in', redirectTo: '/reports' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/reports'));
  });

  it('shows a generic failure that does not reveal whether the account exists, and clears the password', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    await user.type(email(), 'someone@example.test');
    await user.type(password(), 'wrong password value');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    resolveLogin?.({ kind: 'invalid_credentials' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(password()).toHaveValue('');
    expect(email()).toHaveValue('someone@example.test');
  });

  it('sends the email normalized and the password unmodified to the client', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    await user.type(email(), '  Member@Example.TEST ');
    await user.type(password(), '  spaced passphrase  ');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(login).toHaveBeenCalledWith(
      { email: 'member@example.test', password: '  spaced passphrase  ' },
      '/dashboard',
    );
  });

  it('routes staff accounts to passkey verification', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    await user.type(email(), 'staff@example.test');
    await user.type(password(), 'a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    resolveLogin?.({ kind: 'staff_verification_required' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/staff/verify'));
  });

  it('shows rate limiting and unexpected errors with a reference only', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    await user.type(email(), 'error@example.test');
    await user.type(password(), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    resolveLogin?.({ kind: 'unexpected_error', requestId: 'req-123' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We couldn’t complete this request');
    expect(alert).toHaveTextContent('Nothing was changed');
    expect(alert).toHaveTextContent('req-123');
  });

  it('explains a temporarily unavailable service without blaming the user', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/dashboard" />);
    await user.type(email(), 'unavailable@example.test');
    await user.type(password(), 'a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    resolveLogin?.({ kind: 'temporarily_unavailable' });
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t available right now');
  });

  it.each([
    ['session_expired', 'Your session has ended'],
    ['staff_verification_expired', 'Your staff verification has ended'],
  ] as const)('shows a calm banner when returning after %s', (reason, title) => {
    render(<LoginForm next="/dashboard" endedReason={reason} />);
    expect(screen.getByRole('status')).toHaveTextContent(title);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<LoginForm next="/dashboard" endedReason="session_expired" />);
    await expectNoAxeViolations(container);
  });
});
