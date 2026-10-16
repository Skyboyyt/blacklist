/**
 * Staff review vocabulary. Status labels follow the data model exactly; nothing here
 * adds a status. Wording stays factual: no case or subject is ever labelled a "scam".
 */
import type {
  AuditEntry,
  CaseDecision,
  CaseType,
  EvidenceState,
  FindingSeverity,
  ReportCategory,
} from '@blacklist/contracts';

export const CASE_TYPE_LABEL: Readonly<Record<CaseType, string>> = {
  report_review: 'Report',
  appeal_review: 'Appeal',
  correction_request: 'Correction',
  project_suggestion: 'Project suggestion',
  subject_response: 'Response',
  suspension_review: 'Suspension review',
};

export const STATUS_LABEL: Readonly<Record<string, string>> = {
  submitted: 'Submitted',
  screening: 'Automated screening',
  queued: 'Queued',
  in_review: 'In review',
  needs_info: 'Waiting for information',
  accepted: 'Accepted',
  rejected: 'Rejected',
  rejected_abusive: 'Rejected as abusive',
  withdrawn: 'Withdrawn',
  upheld: 'Upheld',
  amended: 'Amended',
  reversed: 'Reversed',
  needs_information: 'Waiting for information',
  accepted_into_profile: 'Accepted into a profile',
  not_accepted: 'Not accepted',
  published: 'Published',
  open: 'Open',
  reinstated: 'Reinstated',
};

export const CATEGORY_LABEL: Readonly<Record<ReportCategory, string>> = {
  rug_pull: 'Rug pull',
  phishing: 'Phishing',
  fake_investment: 'Fake investment',
  impersonation: 'Impersonation',
  wallet_draining: 'Wallet draining',
  fake_token: 'Fake token',
  fraudulent_project: 'Fraudulent project',
  stolen_funds: 'Stolen funds',
  suspicious_contract: 'Suspicious contract',
  other: 'Other',
};

export const SEVERITY_LABEL: Readonly<Record<FindingSeverity, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  severe: 'Severe',
};

export { SUBMITTER_REASON_LABEL } from '@/lib/submissions/copy';

export const EVIDENCE_STATE_COPY: Readonly<Record<EvidenceState, { label: string; available: boolean }>> = {
  upload_pending: { label: 'Upload not finished', available: false },
  quarantined: { label: 'In quarantine', available: false },
  processing: { label: 'Being sanitized', available: false },
  available: { label: 'Available', available: true },
  rejected: { label: 'Rejected file', available: false },
  unpublished: { label: 'Unpublished', available: false },
  purge_requested: { label: 'Removal requested', available: false },
  purged: { label: 'Removed', available: false },
};

export const AUDIT_ACTION_LABEL: Readonly<Record<AuditEntry['action'], string>> = {
  case_created: 'Case created',
  case_assigned: 'Case assigned',
  case_unassigned: 'Case unassigned',
  case_note_added: 'Internal note added',
  case_status_changed: 'Status changed',
  info_requested: 'Information requested',
  finding_revision_submitted: 'Finding revision submitted',
  finding_approved: 'Finding revision approved',
  finding_rejected: 'Finding revision rejected',
  finding_became_public: 'Finding became public (system)',
  appeal_decided: 'Appeal decided',
  correction_decided: 'Correction decided',
  profile_revised: 'Project profile revised',
  standing_decided: 'Standing decided',
  response_decided: 'Response decided',
  finding_suspended: 'Finding suspended',
  finding_reinstated: 'Finding reinstated',
  finding_reversed: 'Finding reversed',
  admin_alert: 'Alert to all administrators',
  staff_invitation_created: 'Staff invitation created',
  staff_invitation_approved: 'Staff invitation approved',
  staff_invitation_revoked: 'Staff invitation revoked',
  staff_role_requested: 'Role change requested',
  staff_role_approved: 'Role change approved',
  staff_role_revoked: 'Role removed',
  staff_suspended: 'Staff account suspended',
  staff_offboarded: 'Staff account offboarded',
  staff_recovery_opened: 'Staff recovery opened',
  staff_recovery_verified: 'Staff identity verified',
  staff_recovery_approved: 'Staff recovery approved',
  staff_recovery_objected: 'Staff recovery objected',
  staff_recovery_withdrawn: 'Staff recovery objection withdrawn',
  staff_recovery_reopened: 'Staff recovery reopened as a new case',
  staff_recovery_completed: 'Staff recovery completed',
  user_suspended: 'Member suspended',
  user_restored: 'Member restored',
  label_added: 'Public label added',
  label_retired: 'Public label retired',
  signal_suppressed: 'Signal suppressed',
  suppression_lifted: 'Suppression lifted',
};

/** Decision button labels and what each does in plain words (shown on the confirmation screen). */
export const DECISION_COPY: Readonly<
  Record<CaseDecision['action'], { label: string; consequence: string; tone: 'default' | 'danger' }>
> = {
  start_review: {
    label: 'Start review',
    consequence: 'The case moves to “In review” and is assigned to you.',
    tone: 'default',
  },
  request_info: {
    label: 'Request information',
    consequence: 'The submitter is asked for more information. The case waits until they reply.',
    tone: 'default',
  },
  accept_report: {
    label: 'Accept and draft finding',
    consequence:
      'The report is accepted and a finding revision is created for approval. Nothing becomes public until an eligible approver approves that exact revision.',
    tone: 'default',
  },
  reject_report: {
    label: 'Reject report',
    consequence: 'The report is closed. The reporter sees the selected reason. Nothing is published.',
    tone: 'danger',
  },
  reject_abusive: {
    label: 'Reject as abusive',
    consequence:
      'The report is closed as abusive and counts toward the reporter’s abuse record. Nothing is published.',
    tone: 'danger',
  },
  uphold: {
    label: 'Uphold finding',
    consequence:
      'The finding stays and is marked “appeal reviewed”. Your public summary is shown with the outcome.',
    tone: 'default',
  },
  amend: {
    label: 'Amend finding',
    consequence:
      'The appeal is decided as amended and a new revision of the finding is created from your severity and summary. Nothing public changes until that exact revision is approved; an independent approver is needed when either version is severe.',
    tone: 'default',
  },
  reverse: {
    label: 'Reverse finding',
    consequence:
      'The finding is reversed. A public correction notice is shown for 90 days and the history keeps the entry.',
    tone: 'danger',
  },
  accept_correction: {
    label: 'Accept correction',
    consequence:
      'The project profile gets a new staff revision with the proposed changes. The history records it.',
    tone: 'default',
  },
  reject_correction: {
    label: 'Reject correction',
    consequence: 'The profile stays as it is. The requester sees the selected reason.',
    tone: 'danger',
  },
  accept_suggestion: {
    label: 'Accept and publish profile',
    consequence:
      'Staff create a public project profile from this suggestion (ADR 0010 Part A). The submitter is told; their identity is never shown on the profile.',
    tone: 'default',
  },
  reject_suggestion: {
    label: 'Do not accept',
    consequence: 'Nothing is published. The submitter sees the selected reason.',
    tone: 'danger',
  },
  grant_standing: {
    label: 'Grant standing',
    consequence:
      'Record that the documents establish standing for this appeal. State in the rationale what was and was not established.',
    tone: 'default',
  },
  deny_standing: {
    label: 'Deny standing',
    consequence:
      'The case cannot be decided until standing is established. The submitter can reply with more documents.',
    tone: 'danger',
  },
  publish_response: {
    label: 'Publish response',
    consequence:
      'The response is published as plain text, shown as coming from a party that proved control on the standing date. It was checked for safety (personal data, abuse, malicious links), not viewpoint.',
    tone: 'default',
  },
  reject_response: {
    label: 'Do not publish',
    consequence: 'Nothing is published. The responder sees the selected reason.',
    tone: 'danger',
  },
  reinstate_finding: {
    label: 'Reinstate finding',
    consequence:
      'The suspension ends and the finding counts again. A severe finding needs a reviewer who did not author it.',
    tone: 'default',
  },
  reverse_finding: {
    label: 'Reverse finding',
    consequence:
      'The finding is reversed and removed from scoring. A public correction notice is shown and the history keeps the entry. A severe finding cannot be reversed by the person who suspended it.',
    tone: 'danger',
  },
};

export const MOCK_AUDIT_NOTICE =
  'Mock history for the demo. It lives in this browser tab and resets on reload. Production audit records are append-only, server-side and tamper-evident (ADR 0006).';

/** Revision statuses (moderation §2–§4). */
export const REVISION_STATUS_LABEL = {
  proposed: 'Awaiting approval',
  pending_second_approval: 'Awaiting an independent approver',
  published: 'Published',
  rejected: 'Rejected',
  superseded: 'Superseded by a newer revision',
} as const;
