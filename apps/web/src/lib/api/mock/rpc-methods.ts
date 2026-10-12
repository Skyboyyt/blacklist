/**
 * The service methods the mock RPC transport carries, shared by the browser client and
 * the server allowlist. The records are keyed by the interfaces, so adding a method to
 * `ModerationApi` or `MemberApi` without listing it here fails the type check.
 */
import type { MemberApi, ModerationApi } from '../types';

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
};

export const MODERATION_METHODS = Object.keys(MODERATION) as readonly (keyof ModerationApi)[];
export const MEMBER_METHODS = Object.keys(MEMBER) as readonly (keyof MemberApi)[];
