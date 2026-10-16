export type ErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'token_invalid'
  | 'password_policy_rejected'
  | 'password_breached'
  | 'handle_unavailable'
  | 'rate_limited'
  | 'human_verification_required'
  | 'temporarily_unavailable'
  | 'session_expired'
  | 'reauth_required'
  | 'cooling_period'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'passkey_required'
  | 'passkey_not_verified'
  | 'enrollment_incomplete'
  // Moderation (contracts moderationErrorSchema / memberErrorSchema).
  | 'invalid_transition'
  | 'not_eligible'
  | 'stepup_required'
  | 'evidence_unavailable';
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterSeconds: number | undefined;
  /** Fixed, server-written explanation (never user input or private data). */
  readonly detail: string | undefined;
  /** For `conflict`: the record's current version, so the client can reload. */
  readonly currentVersion: number | undefined;
  constructor(
    code: ErrorCode,
    retryAfterSeconds?: number,
    extra: { detail?: string; currentVersion?: number } = {},
  ) {
    super(code);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.detail = extra.detail;
    this.currentVersion = extra.currentVersion;
  }
}
/** A moderation refusal with a fixed explanation for the staff or member UI. */
export function refuse(code: ErrorCode, detail: string, currentVersion?: number): DomainError {
  return new DomainError(
    code,
    undefined,
    currentVersion === undefined ? { detail } : { detail, currentVersion },
  );
}
