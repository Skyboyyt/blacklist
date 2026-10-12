/**
 * Adapter used by every non-mock build until the live API client exists (Phase 7).
 * It never fabricates data: reads fail with ApiNotConnectedError, auth flows return
 * "temporarily unavailable", and no passkey ceremony ever succeeds.
 */
import {
  ApiNotConnectedError,
  type AccountApi,
  type AuthApi,
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
  completeEnrollment: accountUnavailable,
  removeAuthenticator: accountUnavailable,
  getRecoveryStatus: () => Promise.resolve(null),
};
