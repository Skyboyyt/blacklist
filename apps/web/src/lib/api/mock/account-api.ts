/**
 * Mock account and staff-security adapters (development and tests only; never in
 * production builds). All mock security behaviour lives here, not in components.
 *
 * State is in memory for the current page session. Outcomes follow the approved
 * rules so the UI is built against realistic behaviour: re-authentication lasts
 * 10 minutes, email change is blocked during the 72-hour cooling period and always
 * answers the same way, password change ends other sessions, and revoking all other
 * sessions needs fresh re-authentication (identity §6.4, §7, §9). Staff enrollment
 * activates only when its flow holds a password and two authenticators (§10.5); the
 * mock records that a password was sent, never the password itself.
 * Mock outcomes never verify anything and grant nothing.
 */
import {
  accountSecurityResultSchema,
  STAFF_MIN_AUTHENTICATORS,
  type AccountActionResult,
  type AccountErrorCode,
  type PasskeyResult,
  type SecurityEvent,
  type SecurityEventKind,
  type SessionSummary,
  type StaffAuthenticator,
} from '@blacklist/contracts';
import type { AccountApi, PasskeyPurpose, StaffSecurityApi } from '../types';
import {
  MOCK_ACCOUNT_RULES,
  SECURITY_EVENT_FIXTURES,
  SESSION_FIXTURES,
  STAFF_AUTHENTICATOR_FIXTURES,
  STAFF_RECOVERY_FIXTURE,
} from './fixtures/account';
import { MOCK_COOKIES, currentPasskeyResult, currentScenario, currentViewerKey } from './scenario';

const REAUTH_WINDOW_MS = 10 * 60 * 1000;
const COOLING_REMAINING_MS = 60 * 60 * 60 * 1000;
const STAFF_HANDLES = { moderator: 'demo_moderator', admin: 'demo_admin' } as const;

export interface MockAccountOptions {
  /** Cookie string to read preview controls from (document.cookie in the browser). */
  readonly cookies: () => string;
  /** Called by logout to end the mock viewer's session (sets the viewer cookie in the browser). */
  readonly signOut: () => void;
  /** Called when a mock staff sign-in verification succeeds (sets the preview viewer). */
  readonly signInStaff: () => void;
  readonly now?: () => Date;
  readonly latencyMs?: number;
  readonly passkeyLatencyMs?: number;
}

interface Store {
  sessions: SessionSummary[];
  events: SecurityEvent[];
  reauthUntil: number | null;
  passwordChangedAt: string | null;
  authenticators: StaffAuthenticator[];
  deficitSince: string | null;
  enrollmentAttemptsRemaining: number;
  /** The bound enrollment flow (identity §10.4), or null before the code is accepted. */
  enrollment: { passwordSet: boolean; authenticators: Set<1 | 2> } | null;
}

function newStore(): Store {
  return {
    sessions: SESSION_FIXTURES.map((s) => ({ ...s })),
    events: SECURITY_EVENT_FIXTURES.map((e) => ({ ...e })),
    reauthUntil: null,
    passwordChangedAt: '2026-09-20T18:30:00Z',
    authenticators: STAFF_AUTHENTICATOR_FIXTURES.map((a) => ({ ...a })),
    deficitSince: null,
    enrollmentAttemptsRemaining: 4,
    enrollment: null,
  };
}

const error = (code: AccountErrorCode, extra: { retryAfterSeconds?: number; until?: string } = {}) =>
  ({ kind: 'error', code, ...extra }) as const;
const ok = { kind: 'ok' } as const;

export function createMockAccountApis(options: MockAccountOptions): {
  account: AccountApi;
  staff: StaffSecurityApi;
} {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 500;
  const passkeyLatency = options.passkeyLatencyMs ?? 1200;
  const store = newStore();
  const wait = (ms: number) =>
    ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

  const scenario = () => currentScenario(options.cookies());
  const viewer = () => currentViewerKey(options.cookies());
  const isStaff = () => viewer() === 'moderator' || viewer() === 'admin';
  const sessionGone = () => viewer() === 'anonymous' || scenario() === 'session_expired';
  const coolingUntil = () =>
    scenario() === 'cooling_period' ? new Date(now().getTime() + COOLING_REMAINING_MS).toISOString() : null;
  const reauthFresh = () => store.reauthUntil !== null && store.reauthUntil > now().getTime();
  const wrongPassword = (value: string) => value.startsWith(MOCK_ACCOUNT_RULES.wrongPasswordPrefix);

  function record(kind: SecurityEventKind): void {
    store.events.unshift({
      id: `evt_${store.events.length + 1}_${kind}`,
      kind,
      at: now().toISOString(),
      deviceSummary: 'Firefox on Windows',
    });
  }

  async function passkey(purpose: PasskeyPurpose): Promise<PasskeyResult> {
    await wait(passkeyLatency);
    // Staff sign-in happens before a staff session exists; step-up needs a live session.
    if (scenario() === 'session_expired' || (purpose.kind === 'step_up' && sessionGone()))
      return { kind: 'session_expired' };
    const kind = currentPasskeyResult(options.cookies());
    if (kind === 'verified' && purpose.kind === 'sign_in') options.signInStaff();
    return { kind };
  }

  const account: AccountApi = {
    async logout(): Promise<AccountActionResult> {
      await wait(latency);
      options.signOut();
      return ok;
    },
    async getSecurity() {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      const staffKey = viewer();
      const staff = staffKey === 'moderator' || staffKey === 'admin';
      const until = coolingUntil();
      return accountSecurityResultSchema.parse({
        kind: 'ok',
        data: {
          accountKind: staff ? 'staff' : 'member',
          handle: staff ? STAFF_HANDLES[staffKey] : 'demo_member',
          email: staff ? 'staff@example.test' : 'member@example.test',
          passwordChangedAt: until ? now().toISOString() : store.passwordChangedAt,
          cooling: until ? { reason: 'password_reset', until } : null,
          reauthValidUntil:
            reauthFresh() && store.reauthUntil ? new Date(store.reauthUntil).toISOString() : null,
          sessions: store.sessions,
          recentEvents: store.events.slice(0, 8),
        },
      });
    },
    async reauthenticate({ password }) {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      if (wrongPassword(password)) return error('invalid_credentials');
      store.reauthUntil = now().getTime() + REAUTH_WINDOW_MS;
      return ok;
    },
    async changePassword(form) {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      if (form.currentPassword.startsWith('limited'))
        return error('rate_limited', { retryAfterSeconds: 300 });
      if (wrongPassword(form.currentPassword)) return error('current_password_incorrect');
      // Identity §6.4: other sessions end; the current session continues.
      store.sessions = store.sessions.filter((s) => s.current);
      store.passwordChangedAt = now().toISOString();
      record('password_changed');
      return ok;
    },
    async requestEmailChange({ newEmail }) {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      const until = coolingUntil();
      if (until) return error('cooling_period', { until });
      if (!reauthFresh()) return error('reauth_required');
      if (newEmail === MOCK_ACCOUNT_RULES.rateLimitedEmail)
        return error('rate_limited', { retryAfterSeconds: 600 });
      if (newEmail === MOCK_ACCOUNT_RULES.unavailableEmail) return error('temporarily_unavailable');
      // Same answer whether or not the address belongs to an account (identity §7).
      record('email_change_requested');
      return ok;
    },
    async revokeSession(sessionId) {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      const target = store.sessions.find((s) => s.id === sessionId);
      if (target?.current) return error('cannot_revoke_current_session');
      store.sessions = store.sessions.filter((s) => s.id !== sessionId);
      if (!target || target.id === 'sess_demo_expired') return error('session_not_found');
      record('session_revoked');
      return ok;
    },
    async revokeOtherSessions() {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      if (!reauthFresh()) return error('reauth_required');
      store.sessions = store.sessions.filter((s) => s.current);
      record('other_sessions_revoked');
      return ok;
    },
  };

  const staff: StaffSecurityApi = {
    async getStaffSecurity() {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      if (!isStaff()) return error('session_expired');
      return {
        kind: 'ok',
        data: {
          role: viewer() === 'admin' ? 'admin' : 'moderator',
          authenticators: store.authenticators,
          authenticatorDeficitSince: store.deficitSince,
        },
      };
    },
    verifyPasskey: (purpose) => passkey(purpose),
    async startEnrollment({ token, code }) {
      await wait(latency);
      for (const status of ['expired', 'used', 'invalid', 'superseded', 'revoked'] as const) {
        if (token.startsWith(status)) return { kind: 'invitation_problem', status };
      }
      if (code !== MOCK_ACCOUNT_RULES.enrollmentCode) {
        store.enrollmentAttemptsRemaining = Math.max(0, store.enrollmentAttemptsRemaining - 1);
        return { kind: 'code_incorrect', attemptsRemaining: store.enrollmentAttemptsRemaining };
      }
      store.enrollment = { passwordSet: false, authenticators: new Set() };
      return { kind: 'ok', role: 'moderator' };
    },
    async setEnrollmentPassword() {
      await wait(latency);
      if (!store.enrollment) return error('session_expired');
      store.enrollment.passwordSet = true;
      return ok;
    },
    async registerAuthenticator(step) {
      await wait(passkeyLatency);
      if (!store.enrollment) return { kind: 'session_expired' };
      const kind = currentPasskeyResult(options.cookies());
      if (kind === 'verified') store.enrollment.authenticators.add(step);
      return { kind };
    },
    async completeEnrollment() {
      await wait(latency);
      const flow = store.enrollment;
      if (!flow) return error('session_expired');
      if (!flow.passwordSet || flow.authenticators.size < STAFF_MIN_AUTHENTICATORS)
        return error('enrollment_incomplete');
      store.enrollment = null; // the invitation is consumed
      return ok;
    },
    async removeAuthenticator(id) {
      await wait(latency);
      if (sessionGone()) return error('session_expired');
      store.authenticators = store.authenticators.filter((a) => a.id !== id);
      if (store.authenticators.length < STAFF_MIN_AUTHENTICATORS) store.deficitSince ??= now().toISOString();
      record('staff_authenticator_removed');
      return ok;
    },
    async getRecoveryStatus() {
      await wait(latency);
      return scenario() === 'staff_recovery' ? STAFF_RECOVERY_FIXTURE : null;
    },
  };

  return { account, staff };
}

const browserApis = createMockAccountApis({
  cookies: () => (typeof document === 'undefined' ? '' : document.cookie),
  signOut: () => {
    document.cookie = `${MOCK_COOKIES.viewer}=anonymous; path=/; SameSite=Lax`;
  },
  signInStaff: () => {
    document.cookie = `${MOCK_COOKIES.viewer}=moderator; path=/; SameSite=Lax`;
  },
});

export const mockAccountApi = browserApis.account;
export const mockStaffSecurityApi = browserApis.staff;
