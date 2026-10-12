/**
 * Which decisions the UI offers for a case type and status (moderation §9–§10). This
 * only chooses what to show; the service re-checks every rule and refuses anything else.
 */
import type { CaseDecision, CaseType, StaffRole } from '@blacklist/contracts';
import { hasPermission } from './permissions';

type Action = CaseDecision['action'];

export const DECISIONS_BY_STATE: Readonly<Record<CaseType, Readonly<Record<string, readonly Action[]>>>> = {
  report_review: {
    queued: ['start_review'],
    in_review: ['request_info', 'accept_report', 'reject_report', 'reject_abusive'],
  },
  appeal_review: { submitted: ['start_review'], in_review: ['uphold', 'amend', 'reverse'] },
  correction_request: { submitted: ['start_review'], in_review: ['accept_correction', 'reject_correction'] },
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
]);

export function decisionsFor(type: CaseType, status: string): readonly Action[] {
  return DECISIONS_BY_STATE[type][status] ?? [];
}

/** A hint for the UI only: why this role is expected to be refused. */
export function roleLimitFor(role: StaffRole, action: Action): string | null {
  if (action === 'accept_correction' && !hasPermission(role, 'project:manage')) {
    return 'Changing a project profile is limited to administrators. The service will refuse it for your role.';
  }
  return null;
}
