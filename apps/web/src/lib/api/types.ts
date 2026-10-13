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
  AdminLabel,
  AdminOverview,
  Invitation,
  InvitationCreated,
  InvitationRequest,
  LabelRequest,
  MemberAccount,
  Profile,
  ProfileUpdate,
  RecoveryCase,
  RecoveryCompletion,
  ResponseRequest,
  ResponseTarget,
  ResponseTargetRef,
  RoleChangeRequest,
  RoleRequest,
  StaffFinding,
  StaffMember,
  Suppression,
  SuppressionRequest,
  AccountActionResult,
  AccountError,
  AccountSecurityResult,
  AddressResearch,
  AppealRequest,
  AppealTarget,
  AuditEntry,
  CaseDecision,
  CaseDetail,
  CorrectionRequest,
  ChainSlugDto,
  Dashboard,
  EmailAcceptedOutcome,
  EmailChangeRequest,
  EnrollmentPasswordRequest,
  EnrollmentStart,
  EnrollmentStartResult,
  FindingHistory,
  FindingRevision,
  RevisionBase,
  RevisionDraft,
  ForgotPasswordRequest,
  InfoResponse,
  LoginOutcome,
  LoginRequest,
  MemberError,
  MemberNotice,
  MemberSubmissionDetail,
  MemberSubmissionSummary,
  ModerationError,
  PasskeyResult,
  PasswordChangeForm,
  ProjectDetail,
  ProjectDirectoryQuery,
  ProjectDirectoryResponse,
  QueueRequest,
  QueueResponse,
  ReauthRequest,
  RegisterCompleteForm,
  RegisterStartRequest,
  ReportRequest,
  ResetPasswordForm,
  ResetPasswordOutcome,
  ScoreboardRequest,
  ScoreboardResponse,
  SearchRequest,
  SearchResponse,
  StaffRecoveryStatus,
  StaffSecurity,
  SuggestionRequest,
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
  /** Staff-created project profiles (PRD §5.10). Address queries are network-scoped. */
  listProjects(request: ProjectDirectoryQuery): Promise<ProjectDirectoryResponse>;
  getProject(slug: string): Promise<ResearchResult<ProjectDetail>>;
  /** Band ranking of reviewed projects (ADR 0012, band-only; no numeric score). */
  getScoreboard(request: ScoreboardRequest): Promise<ScoreboardResponse>;
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
  /**
   * Redeems a reset link (identity §6.3). With `withPasskey`, the adapter first runs the
   * WebAuthn ceremony against a challenge bound to this token (staff accounts), then
   * submits the assertion with the password in the same request.
   */
  resetPassword(
    token: string,
    form: ResetPasswordForm,
    options?: { readonly withPasskey: boolean },
  ): Promise<ResetPasswordOutcome>;
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
  /** Sends the chosen password into the bound enrollment flow (identity §10.5 step 2). */
  setEnrollmentPassword(request: EnrollmentPasswordRequest): Promise<AccountActionResult>;
  registerAuthenticator(step: 1 | 2): Promise<PasskeyResult>;
  /**
   * Atomic activation (identity §10.5 step 5). The API refuses with
   * `enrollment_incomplete` unless the bound flow holds a password and two authenticators.
   */
  completeEnrollment(): Promise<AccountActionResult>;
  removeAuthenticator(authenticatorId: string): Promise<AccountActionResult>;
  getRecoveryStatus(): Promise<StaffRecoveryStatus | null>;
}

/** Outcome of a human-verification challenge (identity §12). The API verifies `response`. */
export type HumanVerificationResult =
  | { readonly kind: 'passed'; readonly response: string }
  | { readonly kind: 'failed' }
  | { readonly kind: 'unavailable' };

/**
 * Provider-neutral human-verification widget (`HumanVerifier` port; provider decision
 * O-6). `challenge` renders into `container` and resolves when the person finishes.
 * It fails closed: without a configured provider it reports `unavailable`.
 */
export interface HumanVerifierClient {
  challenge(container: HTMLElement): Promise<HumanVerificationResult>;
}

/** Result of a staff moderation call: data or a typed error. */
export type ModerationResult<T> =
  { readonly kind: 'ok'; readonly data: T } | ({ readonly kind: 'error' } & ModerationError);

/** Current public profile state of a project, as the demo applies corrections to it. */
export interface ProfileState {
  readonly slug: string;
  readonly revision: number;
  readonly description: string;
  readonly domains: readonly string[];
}

/**
 * Staff review API (moderation design; ARCHITECTURE §9.2). Client components only.
 * Every method checks the caller's role and the case state itself: the UI hiding a
 * button is never the only guard. Mutations carry the version the caller saw, so a
 * change by someone else is reported as `conflict` instead of being overwritten.
 */
export interface ModerationApi {
  getQueue(request: QueueRequest): Promise<ModerationResult<QueueResponse>>;
  getCase(caseId: string): Promise<ModerationResult<CaseDetail>>;
  assign(
    caseId: string,
    expectedVersion: number,
    target: { readonly to: 'me' | 'nobody'; readonly takeOver?: boolean },
  ): Promise<ModerationResult<CaseDetail>>;
  addNote(caseId: string, expectedVersion: number, text: string): Promise<ModerationResult<CaseDetail>>;
  /** Action-bound step-up (identity §10.7): single use, for this action and target only. */
  verifyStepUp(action: string, targetId: string, parameters?: readonly unknown[]): Promise<PasskeyResult>;
  decide(
    caseId: string,
    expectedVersion: number,
    decision: CaseDecision,
  ): Promise<ModerationResult<CaseDetail>>;
  listRevisions(): Promise<ModerationResult<readonly FindingRevision[]>>;
  approveRevision(
    findingId: string,
    revisionNumber: number,
    contentHash: string,
  ): Promise<ModerationResult<readonly FindingRevision[]>>;
  rejectRevision(
    findingId: string,
    revisionNumber: number,
    rationale: string,
  ): Promise<ModerationResult<readonly FindingRevision[]>>;
  getAuditLog(caseId?: string): Promise<ModerationResult<readonly AuditEntry[]>>;
  getProfileState(slug: string): Promise<ModerationResult<ProfileState>>;
  /** Published and suspended findings, for emergency suspension (moderation §8.3). */
  listFindings(): Promise<ModerationResult<readonly StaffFinding[]>>;
  /** Emergency suspension with step-up `finding.suspend`; opens a 72-hour suspension review case. */
  suspendFinding(findingId: string, reason: string): Promise<ModerationResult<CaseDetail>>;
  /** Immutable revision history of a published finding, with what blocks approval now. */
  getFindingHistory(findingId: string): Promise<ModerationResult<FindingHistory>>;
  /**
   * Propose a new revision (moderation §2, §8.1). `base` is the latest revision the editor
   * saw; a newer one is a `conflict`. Nothing becomes public until a separate approval.
   */
  proposeRevision(
    findingId: string,
    base: RevisionBase,
    draft: RevisionDraft,
  ): Promise<ModerationResult<FindingHistory>>;
  /** Open staff recovery cases collecting identity verifications (identity §10.11 step 2). */
  listRecoveryVerifications(): Promise<ModerationResult<readonly RecoveryCase[]>>;
  /** Record how the caller verified the subject's identity; the subject never verifies. */
  verifyRecoveryIdentity(id: string, method: string): Promise<ModerationResult<RecoveryCase>>;
}

/** Result of a member submission call. */
export type MemberResult<T> =
  { readonly kind: 'ok'; readonly data: T } | ({ readonly kind: 'error' } & MemberError);

/**
 * The signed-in member's own submissions (PRD §5.11, §5.18; ADR 0010 Part A). Client
 * components only. Every call acts for the session's account; the API decides ownership
 * and never returns internal notes, staff identities or other people's submissions.
 */
export interface MemberApi {
  listSubmissions(): Promise<MemberResult<readonly MemberSubmissionSummary[]>>;
  getSubmission(id: string): Promise<MemberResult<MemberSubmissionDetail>>;
  submitReport(request: ReportRequest): Promise<MemberResult<{ readonly id: string }>>;
  submitSuggestion(request: SuggestionRequest): Promise<MemberResult<{ readonly id: string }>>;
  submitCorrection(request: CorrectionRequest): Promise<MemberResult<{ readonly id: string }>>;
  submitAppeal(request: AppealRequest): Promise<MemberResult<{ readonly id: string }>>;
  /** Reply to a request for information. Carries the version the member saw. */
  respond(
    id: string,
    expectedVersion: number,
    response: InfoResponse,
  ): Promise<MemberResult<MemberSubmissionDetail>>;
  withdraw(id: string, expectedVersion: number): Promise<MemberResult<MemberSubmissionDetail>>;
  listNotices(): Promise<MemberResult<readonly MemberNotice[]>>;
  getAppealTarget(findingId: string): Promise<MemberResult<AppealTarget>>;
  /** The exact text the member would sign for signature standing (moderation §6.4). */
  getStandingChallenge(findingId: string): Promise<MemberResult<{ readonly message: string }>>;
  /** Right-of-reply response (moderation §9): plain text, published only after safety moderation. */
  submitResponse(request: ResponseRequest): Promise<MemberResult<{ readonly id: string }>>;
  getResponseTarget(target: ResponseTargetRef): Promise<MemberResult<ResponseTarget>>;
  getResponseChallenge(target: ResponseTargetRef): Promise<MemberResult<{ readonly message: string }>>;
  /** The member's own private profile (PRD §5.3). */
  getProfile(): Promise<MemberResult<Profile>>;
  updateProfile(update: ProfileUpdate): Promise<MemberResult<Profile>>;
}

/**
 * Administrator console (PRD §5.24; identity §10; ARCHITECTURE §9.4). Client components
 * only. Privilege increases need a second administrator; consequential actions need an
 * action-bound step-up obtained with `verifyStepUp` for the named action and target.
 */
export interface AdminApi {
  verifyStepUp(action: string, targetId: string, parameters?: readonly unknown[]): Promise<PasskeyResult>;
  getOverview(): Promise<ModerationResult<AdminOverview>>;
  listStaff(): Promise<ModerationResult<readonly StaffMember[]>>;
  listInvitations(): Promise<ModerationResult<readonly Invitation[]>>;
  /** Step-up `staff.invite` on target `new`. */
  createInvitation(request: InvitationRequest): Promise<ModerationResult<InvitationCreated>>;
  /** Step-up `staff.invitation.approve`. A different administrator from the inviter. */
  approveInvitation(id: string): Promise<ModerationResult<Invitation>>;
  /** Step-up `staff.invitation.revoke`. */
  revokeInvitation(id: string): Promise<ModerationResult<Invitation>>;
  listRoleRequests(): Promise<ModerationResult<readonly RoleRequest[]>>;
  /** Step-up `staff.role` on the target. Reductions apply at once; increases wait for a second admin. */
  requestRoleChange(request: RoleChangeRequest): Promise<ModerationResult<readonly RoleRequest[]>>;
  /** Step-up `staff.role.approve`. */
  approveRoleRequest(id: string): Promise<ModerationResult<readonly RoleRequest[]>>;
  cancelRoleRequest(id: string): Promise<ModerationResult<readonly RoleRequest[]>>;
  /** Step-up `staff.suspend` on the target. */
  suspendStaff(id: string, reason: string): Promise<ModerationResult<readonly StaffMember[]>>;
  /** Step-up `staff.offboard` on the target. */
  offboardStaff(id: string, reason: string): Promise<ModerationResult<readonly StaffMember[]>>;
  listRecoveries(): Promise<ModerationResult<readonly RecoveryCase[]>>;
  /** Step-up `staff.recovery.open` on the subject. */
  openRecovery(staffId: string): Promise<ModerationResult<RecoveryCase>>;
  verifyRecovery(id: string, method: string): Promise<ModerationResult<RecoveryCase>>;
  /** Step-up `staff.recovery.approve`. */
  approveRecovery(id: string): Promise<ModerationResult<RecoveryCase>>;
  completeRecovery(id: string): Promise<ModerationResult<RecoveryCompletion>>;
  listMembers(): Promise<ModerationResult<readonly MemberAccount[]>>;
  /** Step-up `user.suspend` on the member. */
  suspendMember(id: string, reason: string): Promise<ModerationResult<readonly MemberAccount[]>>;
  /** Step-up `user.restore` on the member. */
  restoreMember(id: string, reason: string): Promise<ModerationResult<readonly MemberAccount[]>>;
  listLabels(): Promise<ModerationResult<readonly AdminLabel[]>>;
  addLabel(request: LabelRequest): Promise<ModerationResult<readonly AdminLabel[]>>;
  retireLabel(id: string, reason: string): Promise<ModerationResult<readonly AdminLabel[]>>;
  listSuppressions(): Promise<ModerationResult<readonly Suppression[]>>;
  /** Step-up `signal.suppress` on target `new`. */
  suppressSignal(request: SuppressionRequest): Promise<ModerationResult<readonly Suppression[]>>;
  /** Step-up `signal.suppression.lift`. */
  liftSuppression(id: string, reason: string): Promise<ModerationResult<readonly Suppression[]>>;
}

export type PasskeyPurpose =
  | { readonly kind: 'sign_in' }
  | { readonly kind: 'step_up'; readonly action: string; readonly targetId: string };

export type StaffSecurityResult = { readonly kind: 'ok'; readonly data: StaffSecurity } | AccountError;
