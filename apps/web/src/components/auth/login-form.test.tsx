import type { LoginOutcome } from '@blacklist/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import type { HumanVerificationResult } from '@/lib/api/types';
import { LoginForm } from './login-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let resolveLogin: ((outcome: LoginOutcome) => void) | undefined;
const login = vi.fn(() => new Promise<LoginOutcome>((resolve) => (resolveLogin = resolve)));
const challenge = vi.fn<() => Promise<HumanVerificationResult>>();
vi.mock('@/lib/api/browser', () => ({
  getAuthApi: async () => ({ login }),
  getHumanVerifier: async () => ({ challenge }),
}));

beforeEach(() => {
  push.mockClear();
  login.mockClear();
  challenge.mockReset();
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

  describe('human verification (identity §12, P2-03)', () => {
    async function submitChallenged(user: ReturnType<typeof userEvent.setup>) {
      render(<LoginForm next="/dashboard" />);
      await user.type(email(), 'challenge@example.test');
      await user.type(password(), 'a long enough passphrase');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      resolveLogin?.({ kind: 'human_verification_required' });
    }

    it('keeps the fields and retries once with the verification response', async () => {
      challenge.mockResolvedValue({ kind: 'passed', response: 'opaque-check-response' });
      const user = userEvent.setup();
      await submitChallenged(user);
      await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
      expect(login).toHaveBeenLastCalledWith(
        {
          email: 'challenge@example.test',
          password: 'a long enough passphrase',
          humanVerification: 'opaque-check-response',
        },
        '/dashboard',
      );
      resolveLogin?.({ kind: 'signed_in', redirectTo: '/dashboard' });
      await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    });

    it('does not retry sign-in when the check fails, and offers the check again', async () => {
      challenge.mockResolvedValueOnce({ kind: 'failed' });
      const user = userEvent.setup();
      await submitChallenged(user);
      expect(await screen.findByText('The check didn’t succeed. Try again.')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Confirm you’re a person' })).toBeInTheDocument();
      expect(password()).toHaveValue('a long enough passphrase');
      expect(login).toHaveBeenCalledTimes(1);

      challenge.mockResolvedValueOnce({ kind: 'passed', response: 'second-response' });
      await user.click(screen.getByRole('button', { name: 'Try the check again' }));
      await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
      expect(login.mock.calls[1]).toEqual([
        expect.objectContaining({ humanVerification: 'second-response' }),
        '/dashboard',
      ]);
    });

    it('fails closed when the check is unavailable', async () => {
      challenge.mockResolvedValue({ kind: 'unavailable' });
      const user = userEvent.setup();
      await submitChallenged(user);
      expect(await screen.findByText(/sign-in is paused/)).toBeInTheDocument();
      expect(login).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
    });

    it('has no detectable accessibility violations while challenging', async () => {
      challenge.mockResolvedValue({ kind: 'failed' });
      const user = userEvent.setup();
      await submitChallenged(user);
      await screen.findByText('The check didn’t succeed. Try again.');
      await expectNoAxeViolations(document.body);
    });
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<LoginForm next="/dashboard" endedReason="session_expired" />);
    await expectNoAxeViolations(container);
  });
});
