/**
 * The service methods the mock RPC transport carries, shared by the browser client and
 * the server allowlist. The records are keyed by the interfaces, so adding a method to
 * `ModerationApi`, `MemberApi` or `AdminApi` without listing it here fails the type check.
 */
import type { AdminApi, MemberApi, ModerationApi } from '../types';

const MODERATION: Readonly<Record<keyof ModerationApi, true>> = {
  getQueue: true,
  getCase: true,
  assign: true,
  addNote: true,
  verifyStepUp: true,
  decide: true,
  listRevisions: true,
  approveRevision: true,
  rejectRevision: true,
  getAuditLog: true,
  getProfileState: true,
  listFindings: true,
  suspendFinding: true,
  getFindingHistory: true,
  proposeRevision: true,
  listRecoveryVerifications: true,
  verifyRecoveryIdentity: true,
};

const MEMBER: Readonly<Record<keyof MemberApi, true>> = {
  listSubmissions: true,
  getSubmission: true,
  submitReport: true,
  submitSuggestion: true,
  submitCorrection: true,
  submitAppeal: true,
  respond: true,
  withdraw: true,
  listNotices: true,
  getAppealTarget: true,
  getStandingChallenge: true,
  submitResponse: true,
  getResponseTarget: true,
  getResponseChallenge: true,
  getProfile: true,
  updateProfile: true,
};

const ADMIN: Readonly<Record<keyof AdminApi, true>> = {
  verifyStepUp: true,
  getOverview: true,
  listStaff: true,
  listInvitations: true,
  createInvitation: true,
  approveInvitation: true,
  revokeInvitation: true,
  listRoleRequests: true,
  requestRoleChange: true,
  approveRoleRequest: true,
  cancelRoleRequest: true,
  suspendStaff: true,
  offboardStaff: true,
  listRecoveries: true,
  openRecovery: true,
  verifyRecovery: true,
  approveRecovery: true,
  objectRecovery: true,
  withdrawRecoveryObjection: true,
  reopenRecovery: true,
  completeRecovery: true,
  listMembers: true,
  suspendMember: true,
  restoreMember: true,
  listLabels: true,
  addLabel: true,
  retireLabel: true,
  listSuppressions: true,
  suppressSignal: true,
  liftSuppression: true,
};

export const MODERATION_METHODS = Object.keys(MODERATION) as readonly (keyof ModerationApi)[];
export const MEMBER_METHODS = Object.keys(MEMBER) as readonly (keyof MemberApi)[];
export const ADMIN_METHODS = Object.keys(ADMIN) as readonly (keyof AdminApi)[];
