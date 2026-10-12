/**
 * Which decisions the UI offers for a case type and status (moderation §9–§10). This
 * only chooses what to show; the service re-checks every rule and refuses anything else.
 */
import type { CaseDecision, CaseDetail, CaseType, StaffRole } from '@blacklist/contracts';
import { hasPermission } from './permissions';

type Action = CaseDecision['action'];

export const DECISIONS_BY_STATE: Readonly<Record<CaseType, Readonly<Record<string, readonly Action[]>>>> = {
  report_review: {
    queued: ['start_review'],
    in_review: ['request_info', 'accept_report', 'reject_report', 'reject_abusive'],
  },
  appeal_review: { submitted: ['start_review'], in_review: ['uphold', 'amend', 'reverse'] },
  correction_request: { submitted: ['start_review'], in_review: ['accept_correction', 'reject_correction'] },
  project_suggestion: { submitted: ['request_info', 'accept_suggestion', 'reject_suggestion'] },
  subject_response: { submitted: ['start_review'], in_review: ['publish_response', 'reject_response'] },
  suspension_review: { open: ['reinstate_finding', 'reverse_finding'] },
};

/** Decisions that need a fresh action-bound passkey step-up (identity §10.7). */
export const STEP_UP_DECISIONS: ReadonlySet<Action> = new Set([
  'accept_report',
  'reject_report',
  'reject_abusive',
  'uphold',
  'amend',
  'reverse',
  'accept_correction',
  'reject_correction',
  'accept_suggestion',
  'reject_suggestion',
  'publish_response',
  'reject_response',
  'reinstate_finding',
  'reverse_finding',
]);

export function decisionsFor(type: CaseType, status: string): readonly Action[] {
  return DECISIONS_BY_STATE[type][status] ?? [];
}

/**
 * Decisions for a loaded case. Once an appeal or response is in review, a pending
 * documentary standing is decided first; the case itself can only be decided after
 * standing is granted.
 */
export function decisionsForCase(c: CaseDetail): readonly Action[] {
  const base = decisionsFor(c.type, c.status);
  if ((c.type !== 'appeal_review' && c.type !== 'subject_response') || c.status !== 'in_review') return base;
  if (c.standing.outcome === 'pending') return ['grant_standing', 'deny_standing'];
  return c.standing.outcome === 'granted' ? base : [];
}

/** A hint for the UI only: why this role is expected to be refused. */
export function roleLimitFor(role: StaffRole, action: Action): string | null {
  if (
    (action === 'accept_correction' || action === 'accept_suggestion') &&
    !hasPermission(role, 'project:manage')
  ) {
    return 'Changing or creating a project profile is limited to administrators. The service will refuse it for your role.';
  }
  if (
    (action === 'grant_standing' || action === 'deny_standing') &&
    !hasPermission(role, 'standing:decide')
  ) {
    return 'Standing decisions are made by moderators or administrators. The service will refuse it for your role.';
  }
  if (
    (action === 'publish_response' || action === 'reject_response') &&
    !hasPermission(role, 'response:moderate')
  ) {
    return 'Responses are moderated by moderators or administrators. The service will refuse it for your role.';
  }
  return null;
}
