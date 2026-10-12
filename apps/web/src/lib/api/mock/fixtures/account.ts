/**
 * Fictional account and security fixtures (development and tests only). No real
 * people, devices or addresses. Device summaries are coarse, as approved (PRD §6.1).
 */
import type {
  SecurityEvent,
  SessionSummary,
  StaffAuthenticator,
  StaffRecoveryStatus,
} from '@blacklist/contracts';

export const MOCK_ACCOUNT_RULES = {
  /** Any re-authentication or current password starting with this fails. */
  wrongPasswordPrefix: 'wrong',
  rateLimitedEmail: 'limited@example.test',
  unavailableEmail: 'unavailable@example.test',
  /** The only enrollment code the mock accepts. */
  enrollmentCode: 'DEMO2026AB',
} as const;

export const SESSION_FIXTURES: readonly SessionSummary[] = [
  {
    id: 'sess_demo_current',
    current: true,
    deviceSummary: 'Firefox on Windows',
    createdAt: '2026-10-04T08:10:00Z',
    lastActiveAt: '2026-10-05T09:00:00Z',
  },
  {
    id: 'sess_demo_phone',
    current: false,
    deviceSummary: 'Safari on iPhone',
    createdAt: '2026-09-29T19:42:00Z',
    lastActiveAt: '2026-10-03T21:15:00Z',
  },
  {
    id: 'sess_demo_laptop',
    current: false,
    deviceSummary: 'Chrome on macOS',
    createdAt: '2026-09-12T07:30:00Z',
    lastActiveAt: '2026-09-30T16:05:00Z',
  },
  /** Ended elsewhere before the list refreshed: revoking it reports "already ended". */
  {
    id: 'sess_demo_expired',
    current: false,
    deviceSummary: 'Edge on Windows',
    createdAt: '2026-09-01T10:00:00Z',
    lastActiveAt: '2026-09-08T12:00:00Z',
  },
];

export const SECURITY_EVENT_FIXTURES: readonly SecurityEvent[] = [
  { id: 'evt_1', kind: 'signed_in', at: '2026-10-04T08:10:00Z', deviceSummary: 'Firefox on Windows' },
  { id: 'evt_2', kind: 'password_changed', at: '2026-09-20T18:30:00Z', deviceSummary: 'Chrome on macOS' },
  { id: 'evt_3', kind: 'session_revoked', at: '2026-09-15T09:12:00Z', deviceSummary: 'Firefox on Windows' },
];

export const STAFF_AUTHENTICATOR_FIXTURES: readonly StaffAuthenticator[] = [
  {
    id: 'auth_demo_key',
    label: 'Hardware security key',
    kind: 'security_key',
    synced: false,
    registeredAt: '2026-09-01T10:00:00Z',
    lastUsedAt: '2026-10-05T08:55:00Z',
  },
  {
    id: 'auth_demo_passkey',
    label: 'Passkey (password manager)',
    kind: 'platform_passkey',
    synced: true,
    registeredAt: '2026-09-01T10:04:00Z',
    lastUsedAt: '2026-09-28T14:20:00Z',
  },
];

export const STAFF_RECOVERY_FIXTURE: StaffRecoveryStatus = {
  stage: 'objection_window',
  openedAt: '2026-10-03T09:00:00Z',
  objectionWindowEndsAt: '2026-10-06T10:30:00Z',
  identityVerificationsCompleted: 2,
};
