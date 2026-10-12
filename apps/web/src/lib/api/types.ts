/**
 * Typed API client interfaces (ARCHITECTURE §36, frontend-first).
 *
 *   UI ──► ResearchApi / AuthApi (these interfaces) ──► adapter
 *                                                      ├─ mock adapter (NEXT_PUBLIC_API_MODE=mock; dev/test only)
 *                                                      └─ live adapter (Phase 7; until then "not connected")
 *
 * Every adapter returns values that satisfy `@blacklist/contracts`. No adapter
 * grants authority: the API (Phase 7) enforces every permission.
 */
import type {
  AccountActionResult,
  AccountError,
  AccountSecurityResult,
  AddressResearch,
  ChainSlugDto,
  Dashboard,
  EmailAcceptedOutcome,
  EmailChangeRequest,
  EnrollmentStart,
  EnrollmentStartResult,
  ForgotPasswordRequest,
  LoginOutcome,
  LoginRequest,
  PasskeyResult,
  PasswordChangeForm,
  ReauthRequest,
  RegisterCompleteForm,
  RegisterStartRequest,
  ResetPasswordForm,
  SearchRequest,
  SearchResponse,
  StaffRecoveryStatus,
  StaffSecurity,
  TokenFlowOutcome,
  TransactionResearch,
  Viewer,
} from '@blacklist/contracts';

export type ResearchResult<T> =
  | { readonly kind: 'found'; readonly data: T }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'provider_unavailable'; readonly retryAfterSeconds: number }
  | { readonly kind: 'invalid_identifier'; readonly reason: string };

/** Read-side API used by server components. */
export interface ResearchApi {
  getViewer(): Promise<Viewer>;
  search(request: SearchRequest): Promise<SearchResponse>;
  getAddressResearch(chain: ChainSlugDto, address: string): Promise<ResearchResult<AddressResearch>>;
  getTransactionResearch(chain: ChainSlugDto, hash: string): Promise<ResearchResult<TransactionResearch>>;
  /** The signed-in viewer's own activity. */
  getDashboard(): Promise<Dashboard>;
}

/**
 * Auth flows used by client components. Requests are POSTs; tokens are passed in
 * the body, never in a URL. Implementations must never log or store passwords.
 */
export interface AuthApi {
  login(request: LoginRequest, next: string): Promise<LoginOutcome>;
  registerStart(request: RegisterStartRequest): Promise<EmailAcceptedOutcome>;
  registerComplete(token: string, form: RegisterCompleteForm): Promise<TokenFlowOutcome>;
  forgotPassword(request: ForgotPasswordRequest): Promise<EmailAcceptedOutcome>;
  resetPassword(token: string, form: ResetPasswordForm): Promise<TokenFlowOutcome>;
  confirmEmailChange(token: string): Promise<TokenFlowOutcome>;
}

/** Thrown when no backend is connected (any non-mock build before Phase 7). */
export class ApiNotConnectedError extends Error {
  constructor() {
    super('The Blacklist API is not connected in this build.');
    this.name = 'ApiNotConnectedError';
  }
}

/**
 * Signed-in member account and security actions (identity design §5–§9). Client
 * components only. The browser never decides security outcomes: the API will verify
 * passwords, enforce re-authentication windows and cooling periods, and revoke sessions.
 */
export interface AccountApi {
  logout(): Promise<AccountActionResult>;
  getSecurity(): Promise<AccountSecurityResult>;
  /** Password re-entry for sensitive actions; the API keeps a 10-minute window per session. */
  reauthenticate(request: ReauthRequest): Promise<AccountActionResult>;
  changePassword(form: PasswordChangeForm): Promise<AccountActionResult>;
  /** Always the same response whether or not the new address belongs to an account (identity §7). */
  requestEmailChange(request: EmailChangeRequest): Promise<AccountActionResult>;
  revokeSession(sessionId: string): Promise<AccountActionResult>;
  revokeOtherSessions(): Promise<AccountActionResult>;
}

/**
 * Staff security (identity §10). Passkey methods return the result the API reports
 * after verifying a WebAuthn ceremony; the browser performs no cryptographic checks.
 */
export interface StaffSecurityApi {
  getStaffSecurity(): Promise<StaffSecurityResult>;
  /** Staff sign-in assurance or an action-bound step-up (challenge bound to the action). */
  verifyPasskey(purpose: PasskeyPurpose): Promise<PasskeyResult>;
  startEnrollment(request: EnrollmentStart): Promise<EnrollmentStartResult>;
  registerAuthenticator(step: 1 | 2): Promise<PasskeyResult>;
  /** Atomic activation after two authenticators (identity §10.5 step 5). */
  completeEnrollment(): Promise<AccountActionResult>;
  removeAuthenticator(authenticatorId: string): Promise<AccountActionResult>;
  getRecoveryStatus(): Promise<StaffRecoveryStatus | null>;
}

export type PasskeyPurpose =
  | { readonly kind: 'sign_in' }
  | { readonly kind: 'step_up'; readonly action: string; readonly targetId: string };

export type StaffSecurityResult = { readonly kind: 'ok'; readonly data: StaffSecurity } | AccountError;
