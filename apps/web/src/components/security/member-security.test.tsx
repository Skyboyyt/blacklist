import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { createMockAccountApis } from '@/lib/api/mock/account-api';
import { EmailChangePanel } from './email-change-panel';
import { LogoutButton } from './logout-button';
import { PasswordChangeForm } from './password-change-form';
import { SecurityOverview } from './security-overview';
import { SessionExpiredPanel } from './session-expired-panel';
import { SessionManager } from './session-manager';

let cookies = 'bl_mock_viewer=member';
const signOut = vi.fn();
let apis = createMockAccountApis({
  cookies: () => cookies,
  signOut,
  signInStaff: vi.fn(),
  latencyMs: 0,
  passkeyLatencyMs: 0,
});
let logoutOverride: (() => Promise<{ kind: 'error'; code: 'temporarily_unavailable' }>) | null = null;

vi.mock('@/lib/api/browser', () => ({
  getAccountApi: async () => (logoutOverride ? { ...apis.account, logout: logoutOverride } : apis.account),
  getStaffSecurityApi: async () => apis.staff,
}));

const push = vi.fn();
let pathname = '/settings/security';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => pathname,
}));

beforeEach(() => {
  cookies = 'bl_mock_viewer=member';
  pathname = '/settings/security';
  logoutOverride = null;
  push.mockClear();
  signOut.mockClear();
  apis = createMockAccountApis({
    cookies: () => cookies,
    signOut,
    signInStaff: vi.fn(),
    latencyMs: 0,
    passkeyLatencyMs: 0,
  });
});

describe('security overview', () => {
  it('shows password, email, sessions, recovery and activity without staff sections for members', async () => {
    render(<SecurityOverview />);
    expect(await screen.findByRole('region', { name: 'Password' })).toBeInTheDocument();
    expect(screen.getByText('member@example.test')).toBeInTheDocument();
    expect(screen.getByText(/Signed in on this device and 3 others/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent security activity' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Security keys and passkeys' })).toBeNull();
    expect(screen.getByText(/never asks you to change it on a schedule/)).toBeInTheDocument();
  });

  it('shows the staff section for staff viewers (presentation only)', async () => {
    cookies = 'bl_mock_viewer=moderator';
    render(<SecurityOverview />);
    expect(await screen.findByRole('region', { name: 'Security keys and passkeys' })).toBeInTheDocument();
  });

  it('explains the cooling period calmly and hides the email change action', async () => {
    cookies = 'bl_mock_viewer=member; bl_mock_scenario=cooling_period';
    render(<SecurityOverview />);
    const banner = await screen.findByText('Some changes are paused after a password reset');
    expect(banner.closest('[role="status"]')).not.toBeNull();
    const email = screen.getByRole('region', { name: 'Email address' });
    expect(within(email).queryByRole('link', { name: 'Change' })).toBeNull();
  });

  it('shows the session-ended experience when the session is gone', async () => {
    cookies = 'bl_mock_viewer=member; bl_mock_scenario=session_expired';
    render(<SecurityOverview />);
    expect(await screen.findByRole('heading', { name: 'Your session has ended' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login?reason=session_expired&next=%2Fsettings%2Fsecurity',
    );
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<SecurityOverview />);
    await screen.findByRole('region', { name: 'Password' });
    await expectNoAxeViolations(container);
  });
});

describe('session-ended panel', () => {
  it.each(['//evil.example/x', '/\\evil.example', '/login'])(
    'never carries an unsafe return path (%s)',
    (unsafe) => {
      pathname = unsafe;
      render(<SessionExpiredPanel />);
      expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
        'href',
        '/login?reason=session_expired&next=%2Fdashboard',
      );
    },
  );
});

describe('password change', () => {
  const fill = async (current: string) => {
    const user = userEvent.setup();
    render(<PasswordChangeForm />);
    await user.type(screen.getByLabelText('Current password'), current);
    await user.type(screen.getByLabelText('New password'), 'a brand new long passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new long passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    return user;
  };

  it('reports an incorrect current password on that field and clears it', async () => {
    await fill('wrong current password');
    const current = screen.getByLabelText('Current password');
    await waitFor(() => expect(current).toHaveAccessibleDescription(/current password is incorrect/));
    expect(current).toHaveValue('');
    expect(current).toHaveFocus();
  });

  it('succeeds and explains that other sessions are signed out', async () => {
    await fill('my current passphrase');
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByText(/other sessions are signed out; this one stays signed in/)).toBeInTheDocument();
  });

  it('shows the live length requirement without a strength meter', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm />);
    await user.type(screen.getByLabelText('New password'), 'short');
    expect(screen.getByText('At least 15 characters (5/15)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/strong|weak|symbol/i);
  });
});

describe('email change', () => {
  it('asks to re-authenticate, then shows a generic pending state', async () => {
    const user = userEvent.setup();
    render(<EmailChangePanel />);
    await user.type(
      await screen.findByLabelText('New email address'),
      'member@example.test'.replace('member', 'new'),
    );
    await user.click(screen.getByRole('button', { name: 'Send confirmation link' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it’s you' });
    await user.type(within(dialog).getByLabelText('Password'), 'my current passphrase');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Check your new inbox')).toBeInTheDocument();
    expect(screen.getByText(/If/).textContent).toMatch(/If new@example\.test can be used/);
    expect(document.body.textContent).not.toMatch(/already (registered|in use|exists)|no account/i);
  });

  it('rejects the current address and is blocked during cooling', async () => {
    const user = userEvent.setup();
    const view = render(<EmailChangePanel />);
    await user.type(await screen.findByLabelText('New email address'), 'member@example.test');
    await user.click(screen.getByRole('button', { name: 'Send confirmation link' }));
    expect(screen.getByLabelText('New email address')).toHaveAccessibleDescription(
      /already your email address/,
    );
    view.unmount();
    cookies = 'bl_mock_viewer=member; bl_mock_scenario=cooling_period';
    render(<EmailChangePanel />);
    expect(await screen.findByText('Some changes are paused after a password reset')).toBeInTheDocument();
    expect(screen.queryByLabelText('New email address')).toBeNull();
  });
});

describe('sessions', () => {
  it('confirms before signing out one session, then reloads the list', async () => {
    const user = userEvent.setup();
    render(<SessionManager />);
    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out this session?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out session' }));
    expect(await screen.findByText('Safari on iPhone was signed out.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sign out Safari on iPhone' })).toBeNull(),
    );
  });

  it('treats an already-ended session as done, not as a failure', async () => {
    const user = userEvent.setup();
    render(<SessionManager />);
    await user.click(await screen.findByRole('button', { name: 'Sign out Edge on Windows' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out session' }));
    expect(await screen.findByText('Edge on Windows had already ended.')).toBeInTheDocument();
  });

  it('never offers to revoke the current session', async () => {
    render(<SessionManager />);
    expect(await screen.findByText('This device')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out Firefox on Windows' })).toBeNull();
  });

  it('requires re-authentication to sign out all other sessions', async () => {
    const user = userEvent.setup();
    render(<SessionManager />);
    await user.click(await screen.findByRole('button', { name: 'Sign out all other sessions' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out others' }));
    const reauth = await screen.findByRole('dialog', { name: 'Confirm it’s you' });
    await user.type(within(reauth).getByLabelText('Password'), 'my current passphrase');
    await user.click(within(reauth).getByRole('button', { name: 'Continue' }));
    const confirm = await screen.findByRole('dialog', { name: 'Sign out all other sessions?' });
    await user.click(within(confirm).getByRole('button', { name: 'Sign out others' }));
    expect(await screen.findByText('All other sessions were signed out.')).toBeInTheDocument();
  });

  it('returns focus to the button that opened the dialog when it closes', async () => {
    const user = userEvent.setup();
    render(<SessionManager />);
    const opener = await screen.findByRole('button', { name: 'Sign out Safari on iPhone' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('has no detectable accessibility violations with a dialog open', async () => {
    const user = userEvent.setup();
    render(<SessionManager />);
    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }));
    await expectNoAxeViolations(document.body);
  });
});

describe('logout', () => {
  it('signs out and goes to a safe public page', async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('says clearly when signing out failed', async () => {
    logoutOverride = async () => ({ kind: 'error', code: 'temporarily_unavailable' });
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are still signed in');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('browser storage', () => {
  it('keeps passwords and security data out of localStorage and sessionStorage', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm />);
    await user.type(screen.getByLabelText('Current password'), 'my current passphrase');
    await user.type(screen.getByLabelText('New password'), 'a brand new long passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new long passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText('Password changed');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
