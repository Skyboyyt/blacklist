/**
 * Adapter used by every non-mock build until the live API client exists (Phase 7).
 * It never fabricates data: reads fail with ApiNotConnectedError, auth flows return
 * "temporarily unavailable", and no passkey ceremony ever succeeds.
 */
import {
  ApiNotConnectedError,
  type AccountApi,
  type AdminApi,
  type AuthApi,
  type HumanVerifierClient,
  type MemberApi,
  type ModerationApi,
  type ResearchApi,
  type StaffSecurityApi,
} from './types';

const fail = (): Promise<never> => Promise.reject(new ApiNotConnectedError());

export const notConnectedResearchApi: ResearchApi = {
  getViewer: () => Promise.resolve({ kind: 'anonymous' }),
  search: fail,
  getAddressResearch: fail,
  getTransactionResearch: fail,
  getDashboard: fail,
  listProjects: fail,
  getProject: fail,
};

const unavailable = () => Promise.resolve({ kind: 'temporarily_unavailable' as const });

export const notConnectedAuthApi: AuthApi = {
  login: unavailable,
  registerStart: unavailable,
  registerComplete: unavailable,
  forgotPassword: unavailable,
  resetPassword: unavailable,
  confirmEmailChange: unavailable,
};

const accountUnavailable = () =>
  Promise.resolve({ kind: 'error' as const, code: 'temporarily_unavailable' as const });

export const notConnectedAccountApi: AccountApi = {
  logout: accountUnavailable,
  getSecurity: accountUnavailable,
  reauthenticate: accountUnavailable,
  changePassword: accountUnavailable,
  requestEmailChange: accountUnavailable,
  revokeSession: accountUnavailable,
  revokeOtherSessions: accountUnavailable,
};

export const notConnectedStaffSecurityApi: StaffSecurityApi = {
  getStaffSecurity: accountUnavailable,
  verifyPasskey: () => Promise.resolve({ kind: 'failed' }),
  startEnrollment: unavailable,
  registerAuthenticator: () => Promise.resolve({ kind: 'failed' }),
  setEnrollmentPassword: accountUnavailable,
  completeEnrollment: accountUnavailable,
  removeAuthenticator: accountUnavailable,
  getRecoveryStatus: () => Promise.resolve(null),
};

/** No provider is chosen yet (O-6): the challenge fails closed. */
export const notConnectedHumanVerifier: HumanVerifierClient = {
  challenge: () => Promise.resolve({ kind: 'unavailable' }),
};

const moderationUnavailable = () =>
  Promise.resolve({ kind: 'error' as const, code: 'temporarily_unavailable' as const });

/** No staff data exists without the API. Step-ups never succeed. */
export const notConnectedModerationApi: ModerationApi = {
  getQueue: moderationUnavailable,
  getCase: moderationUnavailable,
  assign: moderationUnavailable,
  addNote: moderationUnavailable,
  verifyStepUp: () => Promise.resolve({ kind: 'failed' }),
  decide: moderationUnavailable,
  listRevisions: moderationUnavailable,
  approveRevision: moderationUnavailable,
  rejectRevision: moderationUnavailable,
  getAuditLog: moderationUnavailable,
  getProfileState: moderationUnavailable,
  listFindings: moderationUnavailable,
  suspendFinding: moderationUnavailable,
};

/** The administrator console needs the API (Phase 7+). Step-ups never succeed. */
export const notConnectedAdminApi: AdminApi = {
  verifyStepUp: () => Promise.resolve({ kind: 'failed' }),
  getOverview: moderationUnavailable,
  listStaff: moderationUnavailable,
  listInvitations: moderationUnavailable,
  createInvitation: moderationUnavailable,
  approveInvitation: moderationUnavailable,
  revokeInvitation: moderationUnavailable,
  listRoleRequests: moderationUnavailable,
  requestRoleChange: moderationUnavailable,
  approveRoleRequest: moderationUnavailable,
  cancelRoleRequest: moderationUnavailable,
  suspendStaff: moderationUnavailable,
  offboardStaff: moderationUnavailable,
  listRecoveries: moderationUnavailable,
  openRecovery: moderationUnavailable,
  verifyRecovery: moderationUnavailable,
  approveRecovery: moderationUnavailable,
  completeRecovery: moderationUnavailable,
  listMembers: moderationUnavailable,
  suspendMember: moderationUnavailable,
  restoreMember: moderationUnavailable,
  listLabels: moderationUnavailable,
  addLabel: moderationUnavailable,
  retireLabel: moderationUnavailable,
  listSuppressions: moderationUnavailable,
  suppressSignal: moderationUnavailable,
  liftSuppression: moderationUnavailable,
};

const memberUnavailable = () =>
  Promise.resolve({ kind: 'error' as const, code: 'temporarily_unavailable' as const });

/** Member submissions need the API (Phase 7+); nothing is stored without it. */
export const notConnectedMemberApi: MemberApi = {
  listSubmissions: memberUnavailable,
  getSubmission: memberUnavailable,
  submitReport: memberUnavailable,
  submitSuggestion: memberUnavailable,
  submitCorrection: memberUnavailable,
  submitAppeal: memberUnavailable,
  respond: memberUnavailable,
  withdraw: memberUnavailable,
  listNotices: memberUnavailable,
  getAppealTarget: memberUnavailable,
  getStandingChallenge: memberUnavailable,
  submitResponse: memberUnavailable,
  getResponseTarget: memberUnavailable,
  getResponseChallenge: memberUnavailable,
  getProfile: memberUnavailable,
  updateProfile: memberUnavailable,
};
