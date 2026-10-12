/** Plain-language labels for the account holder's own security activity. */
import type { SecurityEventKind } from '@blacklist/contracts';

export const SECURITY_EVENT_LABEL: Readonly<Record<SecurityEventKind, string>> = {
  signed_in: 'Signed in',
  password_changed: 'Password changed',
  password_reset: 'Password reset by email link',
  email_change_requested: 'Email change requested',
  email_changed: 'Email address changed',
  session_revoked: 'A session was signed out',
  other_sessions_revoked: 'All other sessions were signed out',
  staff_authenticator_registered: 'Security key or passkey added',
  staff_authenticator_removed: 'Security key or passkey removed',
  staff_recovery_completed: 'Staff account recovery completed',
};
