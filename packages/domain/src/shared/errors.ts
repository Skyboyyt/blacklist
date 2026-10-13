export type ErrorCode =
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
  | 'enrollment_incomplete';
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterSeconds: number | undefined;
  constructor(code: ErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
