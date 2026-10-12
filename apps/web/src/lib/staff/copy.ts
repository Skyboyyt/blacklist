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
  SubmitterReason,
} from '@blacklist/contracts';

export const CASE_TYPE_LABEL: Readonly<Record<CaseType, string>> = {
  report_review: 'Report',
  appeal_review: 'Appeal',
  correction_request: 'Correction',
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

/** Shown to the submitter only, never on a public page. */
export const SUBMITTER_REASON_LABEL: Readonly<Record<SubmitterReason, string>> = {
  insufficient_evidence: 'There was not enough evidence to act on.',
  out_of_scope: 'The request is outside what Blacklist reviews.',
  duplicate: 'This duplicates a case that is already being handled.',
  not_reproducible: 'Staff could not confirm the problem described.',
  already_corrected: 'The information has already been corrected.',
};

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
    consequence: 'The reporter is asked for more information. The case waits until they reply.',
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
      'The appeal is decided as amended. A new revision must then be approved before anything public changes.',
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
};

export const MOCK_AUDIT_NOTICE =
  'Mock history for the demo. It lives in this browser tab and resets on reload. Production audit records are append-only, server-side and tamper-evident (ADR 0006).';
