import { schema, type Database } from '@blacklist/db';
const kinds = [
  'login_succeeded',
  'login_failed',
  'reauthenticated',
  'reauth_failed',
  'password_changed',
  'password_reset',
  'email_change_requested',
  'email_changed',
  'session_revoked',
  'other_sessions_revoked',
] as const;
export type SecurityKind = (typeof kinds)[number];
export async function securityEvent(
  tx: Database,
  userId: string | null,
  eventType: SecurityKind,
  prefix?: string,
) {
  if (!(kinds as readonly string[]).includes(eventType)) throw new Error('unknown_security_event');
  await tx
    .insert(schema.securityEvents)
    .values({ userId, eventType, ipPrefix: prefix ?? null, userAgentSummary: null, details: {} });
}
