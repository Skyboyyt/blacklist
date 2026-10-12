import {
  accountActionResultSchema,
  accountSecurityResultSchema,
  passkeyResultSchema,
} from '@blacklist/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockAccountApis } from './account-api';

let cookies = '';
let clock = new Date('2026-10-05T09:00:00Z');
const signOut = vi.fn();
const signInStaff = vi.fn();
let apis = createMockAccountApis({
  cookies: () => cookies,
  signOut,
  signInStaff,
  now: () => clock,
  latencyMs: 0,
  passkeyLatencyMs: 0,
});

beforeEach(() => {
  cookies = 'bl_mock_viewer=member';
  clock = new Date('2026-10-05T09:00:00Z');
  signOut.mockClear();
  signInStaff.mockClear();
  apis = createMockAccountApis({
    cookies: () => cookies,
    signOut,
    signInStaff,
    now: () => clock,
    latencyMs: 0,
    passkeyLatencyMs: 0,
  });
});

const newEmail = { newEmail: 'someone@example.test' };

describe('mock account API (identity §6.4, §7, §9)', () => {
  it('returns contract-valid security data with coarse sessions only', async () => {
    const result = accountSecurityResultSchema.parse(await apis.account.getSecurity());
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.sessions.filter((s) => s.current)).toHaveLength(1);
      expect(JSON.stringify(result.data)).not.toMatch(/token|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    }
  });

  it('requires fresh re-authentication for email change, valid for 10 minutes', async () => {
    expect(await apis.account.requestEmailChange(newEmail)).toEqual({
      kind: 'error',
      code: 'reauth_required',
    });
    expect(await apis.account.reauthenticate({ password: 'wrong password' })).toEqual({
      kind: 'error',
      code: 'invalid_credentials',
    });
    expect(await apis.account.reauthenticate({ password: 'a correct passphrase' })).toEqual({ kind: 'ok' });
    expect(await apis.account.requestEmailChange(newEmail)).toEqual({ kind: 'ok' });
    clock = new Date(clock.getTime() + 11 * 60 * 1000);
    expect(await apis.account.requestEmailChange(newEmail)).toEqual({
      kind: 'error',
      code: 'reauth_required',
    });
  });

  it('answers email change identically whether or not the address has an account', async () => {
    await apis.account.reauthenticate({ password: 'a correct passphrase' });
    const existing = await apis.account.requestEmailChange({ newEmail: 'member@example.test' });
    const fresh = await apis.account.requestEmailChange({ newEmail: 'brand-new@example.test' });
    expect(existing).toEqual(fresh);
  });

  it('blocks email change during the cooling period, before anything else', async () => {
    cookies = 'bl_mock_viewer=member; bl_mock_scenario=cooling_period';
    const result = accountActionResultSchema.parse(await apis.account.requestEmailChange(newEmail));
    expect(result).toMatchObject({ kind: 'error', code: 'cooling_period' });
    const security = await apis.account.getSecurity();
    expect(security.kind === 'ok' && security.data.cooling?.reason).toBe('password_reset');
  });

  it('password change ends other sessions but keeps the current one', async () => {
    const form = {
      currentPassword: 'current passphrase',
      newPassword: 'a new long passphrase',
      confirmPassword: 'a new long passphrase',
    };
    expect(await apis.account.changePassword({ ...form, currentPassword: 'wrong current' })).toEqual({
      kind: 'error',
      code: 'current_password_incorrect',
    });
    expect(await apis.account.changePassword(form)).toEqual({ kind: 'ok' });
    const security = await apis.account.getSecurity();
    expect(security.kind === 'ok' && security.data.sessions.map((s) => s.current)).toEqual([true]);
  });

  it('protects the current session and reports already-ended ones', async () => {
    expect(await apis.account.revokeSession('sess_demo_current')).toEqual({
      kind: 'error',
      code: 'cannot_revoke_current_session',
    });
    expect(await apis.account.revokeSession('sess_demo_expired')).toEqual({
      kind: 'error',
      code: 'session_not_found',
    });
    expect(await apis.account.revokeSession('sess_demo_phone')).toEqual({ kind: 'ok' });
  });

  it('requires re-authentication to sign out all other sessions', async () => {
    expect(await apis.account.revokeOtherSessions()).toEqual({ kind: 'error', code: 'reauth_required' });
    await apis.account.reauthenticate({ password: 'a correct passphrase' });
    expect(await apis.account.revokeOtherSessions()).toEqual({ kind: 'ok' });
  });

  it('reports an expired session for every action in that scenario', async () => {
    cookies = 'bl_mock_viewer=member; bl_mock_scenario=session_expired';
    expect(await apis.account.getSecurity()).toEqual({ kind: 'error', code: 'session_expired' });
    expect(await apis.account.revokeOtherSessions()).toEqual({ kind: 'error', code: 'session_expired' });
  });

  it('logout ends the mock session through the injected hook only', async () => {
    expect(await apis.account.logout()).toEqual({ kind: 'ok' });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('mock staff security API (identity §10)', () => {
  it('maps the simulated authenticator result and signs staff in only on verified sign-in', async () => {
    cookies = 'bl_mock_viewer=member; bl_mock_passkey=cancelled';
    expect(passkeyResultSchema.parse(await apis.staff.verifyPasskey({ kind: 'sign_in' }))).toEqual({
      kind: 'cancelled',
    });
    expect(signInStaff).not.toHaveBeenCalled();
    cookies = 'bl_mock_viewer=member; bl_mock_passkey=verified';
    expect(await apis.staff.verifyPasskey({ kind: 'sign_in' })).toEqual({ kind: 'verified' });
    expect(signInStaff).toHaveBeenCalledTimes(1);
    expect(await apis.staff.verifyPasskey({ kind: 'step_up', action: 'x', targetId: 'y' })).toEqual({
      kind: 'verified',
    });
    expect(signInStaff).toHaveBeenCalledTimes(1);
  });

  it('needs both the invitation link and the enrollment code', async () => {
    const token = 'demo-invite-token-0001';
    expect(
      await apis.staff.startEnrollment({ token: 'expired-invite-token-01', code: 'DEMO2026AB' }),
    ).toEqual({ kind: 'invitation_problem', status: 'expired' });
    expect(await apis.staff.startEnrollment({ token, code: 'WRONG00000' })).toEqual({
      kind: 'code_incorrect',
      attemptsRemaining: 3,
    });
    expect(await apis.staff.startEnrollment({ token, code: 'DEMO2026AB' })).toEqual({
      kind: 'ok',
      role: 'moderator',
    });
  });

  it('flags an authenticator deficit after removal below two', async () => {
    cookies = 'bl_mock_viewer=moderator';
    await apis.staff.removeAuthenticator('auth_demo_passkey');
    const result = await apis.staff.getStaffSecurity();
    expect(result.kind === 'ok' && result.data.authenticators).toHaveLength(1);
    expect(result.kind === 'ok' && result.data.authenticatorDeficitSince).toBe(clock.toISOString());
  });

  it('only shows a recovery case in that scenario', async () => {
    expect(await apis.staff.getRecoveryStatus()).toBeNull();
    cookies = 'bl_mock_scenario=staff_recovery';
    expect((await apis.staff.getRecoveryStatus())?.stage).toBe('objection_window');
  });
});
