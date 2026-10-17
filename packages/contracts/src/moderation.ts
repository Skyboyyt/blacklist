/**
 * STAFF moderation DTOs (moderation design §2–§10; data-model §5–§6; ARCHITECTURE §9.2,
 * §15.6). Returned only to staff in a WebAuthn-assured session. None of these schemas
 * is ever part of a public response: public research DTOs live in research.ts and
 * project.ts and stay structurally unable to carry internal notes, reporter data,
 * numeric scores or private evidence.
 *
 * Statuses come from the data model. Correction-request and subject-response statuses
 * are not specified there; `correctionStatusSchema` and `responseStatusSchema` are
 * interim sets recorded as documentation gaps.
 */
import { z } from './zod.ts';
import { assessmentBandSchema, chainSlugSchema, isoDateTimeSchema } from './common.ts';
import { disclosureSchema, V1_RISK_FACTOR_PROVENANCE, type V1RiskFactorCode } from './research.ts';

export const STAFF_ROLES = ['moderator', 'admin', 'appeal_reviewer'] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** A staff member as other staff see them: an opaque id and a handle. No email. */
export const staffRefSchema = z.strictObject({ id: z.string(), handle: z.string() });
export type StaffRef = z.infer<typeof staffRefSchema>;

/** Case types built in the staff UI (data-model `moderation_cases.case_type`, subset). */
export const caseTypeSchema = z.enum([
  'report_review',
  'appeal_review',
  'correction_request',
  'project_suggestion',
  'subject_response',
  'suspension_review',
]);
export type CaseType = z.infer<typeof caseTypeSchema>;

/** Report lifecycle (moderation §10). `draft` is never visible to staff. */
export const reportCaseStatusSchema = z.enum([
  'submitted',
  'screening',
  'queued',
  'in_review',
  'needs_info',
  'accepted',
  'rejected',
  'rejected_abusive',
  'withdrawn',
]);
export type ReportCaseStatus = z.infer<typeof reportCaseStatusSchema>;

/** Appeal lifecycle (data-model `appeals.status`). */
export const appealStatusSchema = z.enum([
  'submitted',
  'in_review',
  'upheld',
  'amended',
  'reversed',
  'withdrawn',
]);
export type AppealStatus = z.infer<typeof appealStatusSchema>;

/** INTERIM: `correction_requests.status` is unspecified in the data model (documentation gap). */
export const correctionStatusSchema = z.enum(['submitted', 'in_review', 'accepted', 'rejected']);
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;

/** ADR 0010 Part A suggestion lifecycle. */
export const suggestionStatusSchema = z.enum([
  'submitted',
  'needs_information',
  'accepted_into_profile',
  'not_accepted',
]);
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

/** INTERIM: `subject_responses.status` is unspecified in the data model (documentation gap). */
export const responseStatusSchema = z.enum(['submitted', 'in_review', 'published', 'rejected', 'withdrawn']);
export type ResponseStatus = z.infer<typeof responseStatusSchema>;

/**
 * Review of an emergency suspension (moderation §8.3): a non-participant reinstates or
 * reverses the finding within 72 hours.
 */
export const suspensionReviewStatusSchema = z.enum(['open', 'reinstated', 'reversed']);
export type SuspensionReviewStatus = z.infer<typeof suspensionReviewStatusSchema>;

/** PRD §5.11 report categories. */
export const reportCategorySchema = z.enum([
  'rug_pull',
  'phishing',
  'fake_investment',
  'impersonation',
  'wallet_draining',
  'fake_token',
  'fraudulent_project',
  'stolen_funds',
  'suspicious_contract',
  'other',
]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

export const findingSeveritySchema = z.enum(['low', 'medium', 'high', 'severe']);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const caseSubjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('address'),
    chain: chainSlugSchema,
    address: z.string(),
    displayAddress: z.string(),
  }),
  z.strictObject({ kind: z.literal('project'), slug: z.string(), name: z.string() }),
]);
export type CaseSubject = z.infer<typeof caseSubjectSchema>;

const caseCommon = {
  id: z.string(),
  subject: caseSubjectSchema,
  /** Network of the subject, for filtering. `null` for project subjects spanning networks. */
  chain: chainSlugSchema.nullable(),
  title: z.string().max(140),
  assignedTo: staffRefSchema.nullable(),
  submittedAt: isoDateTimeSchema,
  lastActivityAt: isoDateTimeSchema,
  slaDueAt: isoDateTimeSchema,
  /** Optimistic-concurrency version. Every change increments it; actions must send the version they saw. */
  version: z.number().int().positive(),
};

export const caseSummarySchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...caseCommon,
    type: z.literal('report_review'),
    status: reportCaseStatusSchema,
    category: reportCategorySchema,
  }),
  z.strictObject({ ...caseCommon, type: z.literal('appeal_review'), status: appealStatusSchema }),
  z.strictObject({ ...caseCommon, type: z.literal('correction_request'), status: correctionStatusSchema }),
  z.strictObject({ ...caseCommon, type: z.literal('project_suggestion'), status: suggestionStatusSchema }),
  z.strictObject({ ...caseCommon, type: z.literal('subject_response'), status: responseStatusSchema }),
  z.strictObject({
    ...caseCommon,
    type: z.literal('suspension_review'),
    status: suspensionReviewStatusSchema,
  }),
]);
export type CaseSummary = z.infer<typeof caseSummarySchema>;

/** Evidence state (data-model `evidence_items.state`). */
export const evidenceStateSchema = z.enum([
  'upload_pending',
  'quarantined',
  'processing',
  'available',
  'rejected',
  'unpublished',
  'purge_requested',
  'purged',
]);
export type EvidenceState = z.infer<typeof evidenceStateSchema>;

const evidenceCommon = {
  id: z.string(),
  description: z.string().max(300),
  /** The submitting party's role in the case, never their identity. */
  submittedBy: z.enum(['reporter', 'appellant', 'requester', 'responder', 'staff']),
  submittedAt: isoDateTimeSchema,
  state: evidenceStateSchema,
  visibility: z.enum(['staff_only', 'published']),
  /** Plain-language reason when the item is not available (e.g. rejected file type). */
  stateNote: z.string().max(300).nullable(),
};

/**
 * Staff view of evidence. Images are only ever shown as sanitized derivatives;
 * originals are never rendered (PRD §5.12). URLs are defanged text; statements are
 * plain text. Nothing here is rendered as markup.
 */
export const staffEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...evidenceCommon,
    kind: z.literal('image'),
    /** Sanitized derivative metadata, present only when `state` is `available`. */
    derivative: z
      .strictObject({ width: z.number().int().positive(), height: z.number().int().positive() })
      .nullable(),
  }),
  z.strictObject({
    ...evidenceCommon,
    kind: z.literal('transaction_ref'),
    chain: chainSlugSchema,
    txHash: z.string(),
    verification: z.enum(['verified_final', 'pending', 'not_found']),
  }),
  z.strictObject({ ...evidenceCommon, kind: z.literal('url'), defangedUrl: z.string().max(500) }),
  z.strictObject({ ...evidenceCommon, kind: z.literal('statement'), text: z.string().max(5000) }),
]);
export type StaffEvidence = z.infer<typeof staffEvidenceSchema>;

/**
 * A five-minute download link for the sanitized copy of an image (ARCHITECTURE §14.4).
 * It points at the storage domain and downloads as an attachment; originals have no link.
 */
export const evidenceLinkSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  expiresAt: isoDateTimeSchema,
});
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;

const V1_FACTOR_CODES = Object.keys(V1_RISK_FACTOR_PROVENANCE) as [V1RiskFactorCode, ...V1RiskFactorCode[]];

/**
 * Staff assessment (ARCHITECTURE §15.6 staff DTO). The numeric score and contributions
 * follow the §15.3 contribution table, which is a CALIBRATION PROPOSAL awaiting owner
 * sign-off (O-12); `calibration` says so on every scored result.
 */
export const staffAssessmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('scored'),
    band: assessmentBandSchema.exclude(['not_assessed']),
    score: z.number().int().min(0).max(100),
    /** 100 only with a published severe finding, otherwise 74 (§15.2). */
    ceiling: z.union([z.literal(74), z.literal(100)]),
    calibration: z.literal('proposal_not_signed_off'),
    rulesetVersion: z.string(),
    contributions: z.array(
      z.strictObject({
        factorCode: z.enum(V1_FACTOR_CODES),
        contribution: z.number().int().min(0).max(100),
        explanation: z.string(),
        /** IDs of the findings or evidence supporting this factor. */
        evidenceRefs: z.array(z.string()).min(1),
      }),
    ),
    disclosures: z.array(disclosureSchema),
  }),
  z.strictObject({
    kind: z.literal('unscored'),
    /** Why no score exists. Never shown or treated as 0. */
    reason: z.string(),
    disclosures: z.array(disclosureSchema),
  }),
]);
export type StaffAssessment = z.infer<typeof staffAssessmentSchema>;

export const internalNoteSchema = z.strictObject({
  id: z.string(),
  author: staffRefSchema,
  at: isoDateTimeSchema,
  text: z.string().min(1).max(2000),
});
export type InternalNote = z.infer<typeof internalNoteSchema>;

/** One audit entry (moderation §4.4 event names plus case events). MOCK history in the demo. */
export const auditEntrySchema = z.strictObject({
  id: z.string(),
  at: isoDateTimeSchema,
  /** `system` for automatic transitions such as publication after an approval. */
  actor: z.union([staffRefSchema, z.literal('system')]),
  action: z.enum([
    'case_created',
    'case_assigned',
    'case_unassigned',
    'case_note_added',
    'case_status_changed',
    'info_requested',
    'finding_revision_submitted',
    'finding_approved',
    'finding_rejected',
    'finding_became_public',
    'appeal_decided',
    'correction_decided',
    'profile_revised',
    'standing_decided',
    'response_decided',
    'finding_suspended',
    'finding_reinstated',
    'finding_reversed',
    'admin_alert',
    'staff_invitation_created',
    'staff_invitation_approved',
    'staff_invitation_revoked',
    'staff_role_requested',
    'staff_role_approved',
    'staff_role_revoked',
    'staff_suspended',
    'staff_offboarded',
    'staff_recovery_opened',
    'staff_recovery_verified',
    'staff_recovery_approved',
    'staff_recovery_objected',
    'staff_recovery_withdrawn',
    'staff_recovery_reopened',
    'staff_recovery_completed',
    'user_suspended',
    'user_restored',
    'label_added',
    'label_retired',
    'signal_suppressed',
    'suppression_lifted',
  ]),
  caseId: z.string().nullable(),
  /** Internal reason recorded with the action (staff-only). */
  reason: z.string().max(2000).nullable(),
  changes: z.array(
    z.strictObject({ field: z.string(), from: z.string().nullable(), to: z.string().nullable() }),
  ),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** A finding revision (moderation §2) as staff see it. */
export const findingRevisionSchema = z.strictObject({
  findingId: z.string(),
  revisionNumber: z.number().int().positive(),
  subject: caseSubjectSchema,
  severity: findingSeveritySchema,
  /** The text that becomes public if approved. */
  publicSummary: z.string().min(1).max(1000),
  /** Staff-only rationale. Never published. */
  internalRationale: z.string().min(1).max(2000),
  evidenceIds: z.array(z.string()),
  author: staffRefSchema,
  createdAt: isoDateTimeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{16,64}$/),
  status: z.enum(['proposed', 'pending_second_approval', 'published', 'rejected', 'superseded']),
  /** Only the latest revision of a finding can be approved (§4.2 check 1). */
  isLatest: z.boolean(),
  sourceCaseId: z.string().nullable(),
});
export type FindingRevision = z.infer<typeof findingRevisionSchema>;

/** The decision an appeal is about (data-model `appeals.appealed_revision_id`). */
export const appealedDecisionSchema = z.strictObject({
  findingId: z.string(),
  revisionNumber: z.number().int().positive(),
  severity: findingSeveritySchema,
  publicSummary: z.string(),
  author: staffRefSchema,
  approver: staffRefSchema,
  publishedAt: isoDateTimeSchema,
});

export const standingRecordSchema = z.strictObject({
  mechanism: z.enum(['signature', 'authority_signature', 'dns_txt', 'documentary']),
  /** `pending` until a standing reviewer decides documentary standing (moderation §6.2 #4). */
  outcome: z.enum(['granted', 'denied', 'pending']),
  /** What was and was not established (moderation §6.3). */
  scopeStatement: z.string(),
  decidedAt: isoDateTimeSchema,
});
export type StandingRecord = z.infer<typeof standingRecordSchema>;

/** One field of a proposed project-profile correction, shown as current vs proposed. */
export const profileChangeSchema = z.strictObject({
  field: z.enum(['description', 'domain_added', 'domain_retired']),
  label: z.string(),
  current: z.string().nullable(),
  proposed: z.string().nullable(),
});
export type ProfileChange = z.infer<typeof profileChangeSchema>;

const detailCommon = {
  evidence: z.array(staffEvidenceSchema),
  notes: z.array(internalNoteSchema),
  history: z.array(auditEntrySchema),
  assessment: staffAssessmentSchema.nullable(),
  /** Reason shown to the submitter after a rejection (fixed list), when decided. */
  submitterReason: z.string().nullable(),
  /** Public text published with the decision, when one applies. */
  publicSummary: z.string().nullable(),
  /** The latest request for information sent to the submitter, if any. */
  infoRequest: z.string().nullable(),
  /** Replies from the submitter (plain text), oldest first. */
  submitterMessages: z.array(z.strictObject({ at: isoDateTimeSchema, text: z.string().max(5000) })),
};

export const caseDetailSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...caseCommon,
    ...detailCommon,
    type: z.literal('report_review'),
    status: reportCaseStatusSchema,
    category: reportCategorySchema,
    /** Pseudonymous reference; reporter identity is never shown in the case view. */
    reporterRef: z.string(),
    narrative: z.string().max(10000),
  }),
  z.strictObject({
    ...caseCommon,
    ...detailCommon,
    type: z.literal('appeal_review'),
    status: appealStatusSchema,
    appellantRef: z.string(),
    appealedDecision: appealedDecisionSchema,
    grounds: z.string().max(5000),
    standing: standingRecordSchema,
  }),
  z.strictObject({
    ...caseCommon,
    ...detailCommon,
    type: z.literal('correction_request'),
    status: correctionStatusSchema,
    requesterRef: z.string(),
    statement: z.string().max(5000),
    currentRevision: z.number().int().positive(),
    changes: z.array(profileChangeSchema).min(1),
  }),
  z.strictObject({
    ...caseCommon,
    ...detailCommon,
    type: z.literal('project_suggestion'),
    status: suggestionStatusSchema,
    submitterRef: z.string(),
    proposal: z.strictObject({
      name: z.string(),
      category: z.string(),
      chain: chainSlugSchema,
      identifier: z.string(),
      /** Defanged link text; never fetched. */
      links: z.array(z.string()),
      description: z.string(),
      relationship: z.string(),
    }),
    /** Slug of the profile created on acceptance. */
    resultingSlug: z.string().nullable(),
  }),
  z.strictObject({
    ...caseCommon,
    ...detailCommon,
    type: z.literal('subject_response'),
    status: responseStatusSchema,
    responderRef: z.string(),
    /** The response text, shown and published as plain text only. */
    body: z.string().max(5000),
    standing: standingRecordSchema,
  }),
  z.strictObject({
    ...caseCommon,
    ...detailCommon,
    type: z.literal('suspension_review'),
    status: suspensionReviewStatusSchema,
    suspendedFinding: appealedDecisionSchema,
    suspendedBy: staffRefSchema,
    /** Internal reason given when suspending. */
    suspensionReason: z.string().max(2000),
  }),
]);
export type CaseDetail = z.infer<typeof caseDetailSchema>;

/** Reasons a submitter may see after a rejection: a fixed list, never free text about others. */
export const SUBMITTER_REASONS = [
  'insufficient_evidence',
  'out_of_scope',
  'duplicate',
  'not_reproducible',
  'already_corrected',
] as const;
export const submitterReasonSchema = z.enum(SUBMITTER_REASONS);
export type SubmitterReason = z.infer<typeof submitterReasonSchema>;

const rationale = z.string().trim().min(10, 'Write at least 10 characters.').max(2000);
const publicText = z.string().trim().min(10, 'Write at least 10 characters.').max(1000);

/** Decisions the staff UI can request. Which ones apply depends on case type and status. */
export const caseDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('start_review') }),
  z.strictObject({ action: z.literal('request_info'), messageToSubmitter: publicText }),
  z.strictObject({
    action: z.literal('accept_report'),
    severity: findingSeveritySchema,
    publicSummary: publicText,
    internalRationale: rationale,
  }),
  z.strictObject({
    action: z.literal('reject_report'),
    reason: submitterReasonSchema,
    internalRationale: rationale,
  }),
  z.strictObject({ action: z.literal('reject_abusive'), internalRationale: rationale }),
  z.strictObject({
    action: z.enum(['uphold', 'reverse']),
    publicSummary: publicText,
    internalRationale: rationale,
  }),
  /**
   * An amendment is a new revision (moderation §8.1, §9): the appeal reviewer states the
   * amended severity and public text; the revision then needs fresh approval (independent
   * when either the new or the currently public revision is severe).
   */
  z.strictObject({
    action: z.literal('amend'),
    severity: findingSeveritySchema,
    publicSummary: publicText,
    internalRationale: rationale,
  }),
  z.strictObject({
    action: z.literal('accept_correction'),
    publicSummary: publicText,
    internalRationale: rationale,
  }),
  z.strictObject({
    action: z.literal('reject_correction'),
    reason: submitterReasonSchema,
    internalRationale: rationale,
  }),
  z.strictObject({
    action: z.literal('accept_suggestion'),
    publicSummary: publicText,
    internalRationale: rationale,
  }),
  z.strictObject({
    action: z.literal('reject_suggestion'),
    reason: submitterReasonSchema,
    internalRationale: rationale,
  }),
  z.strictObject({ action: z.enum(['grant_standing', 'deny_standing']), internalRationale: rationale }),
  z.strictObject({ action: z.literal('publish_response'), internalRationale: rationale }),
  z.strictObject({
    action: z.literal('reject_response'),
    reason: submitterReasonSchema,
    internalRationale: rationale,
  }),
  z.strictObject({
    action: z.enum(['reinstate_finding', 'reverse_finding']),
    publicSummary: publicText,
    internalRationale: rationale,
  }),
]);
export type CaseDecision = z.infer<typeof caseDecisionSchema>;

export const noteRequestSchema = z.strictObject({ text: internalNoteSchema.shape.text });

/** Errors every staff action can return. Mock and live adapters share them. */
export const moderationErrorSchema = z.discriminatedUnion('code', [
  z.strictObject({ code: z.literal('forbidden'), detail: z.string() }),
  z.strictObject({ code: z.literal('not_found') }),
  /** The record changed since it was loaded; nothing was applied. */
  z.strictObject({
    code: z.literal('conflict'),
    detail: z.string(),
    currentVersion: z.number().int().positive(),
  }),
  z.strictObject({ code: z.literal('invalid_transition'), detail: z.string() }),
  /** Independence or conflict-of-interest rule (moderation §4.1, §7, §9). */
  z.strictObject({ code: z.literal('not_eligible'), detail: z.string() }),
  z.strictObject({ code: z.literal('stepup_required') }),
  z.strictObject({ code: z.literal('evidence_unavailable'), detail: z.string() }),
  z.strictObject({ code: z.literal('temporarily_unavailable') }),
]);
export type ModerationError = z.infer<typeof moderationErrorSchema>;

export const QUEUE_PAGE_SIZE = 8;

export const queueRequestSchema = z.strictObject({
  query: z.string().trim().max(100).optional(),
  type: caseTypeSchema.optional(),
  /** A status valid for the chosen type (or any type when none is chosen). */
  status: z.string().max(40).optional(),
  chain: chainSlugSchema.optional(),
  assignment: z.enum(['any', 'mine', 'unassigned']).default('any'),
  sort: z.enum(['sla_due', 'newest', 'last_activity']).default('sla_due'),
  page: z.number().int().min(1).max(1000).default(1),
});
export type QueueRequest = z.input<typeof queueRequestSchema>;
export type QueueQuery = z.output<typeof queueRequestSchema>;

export const queueCountsSchema = z.strictObject({
  openReports: z.number().int().min(0),
  needsInfo: z.number().int().min(0),
  openAppeals: z.number().int().min(0),
  openCorrections: z.number().int().min(0),
  openSuggestions: z.number().int().min(0),
  openResponses: z.number().int().min(0),
  openSuspensionReviews: z.number().int().min(0),
  unassigned: z.number().int().min(0),
  pendingApprovals: z.number().int().min(0),
});
export type QueueCounts = z.infer<typeof queueCountsSchema>;

export const queueResponseSchema = z.strictObject({
  counts: queueCountsSchema,
  items: z.array(caseSummarySchema),
  page: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(1),
});
export type QueueResponse = z.infer<typeof queueResponseSchema>;

/** Statuses each case type can have, for filters and transition checks. */
export const STATUSES_BY_TYPE = {
  report_review: reportCaseStatusSchema.options,
  appeal_review: appealStatusSchema.options,
  correction_request: correctionStatusSchema.options,
  project_suggestion: suggestionStatusSchema.options,
  subject_response: responseStatusSchema.options,
  suspension_review: suspensionReviewStatusSchema.options,
} as const;

/** A published or suspended finding, as staff see it for emergency suspension (moderation §8.3). */
export const staffFindingSchema = z.strictObject({
  findingId: z.string(),
  title: z.string(),
  severity: findingSeveritySchema,
  subject: caseSubjectSchema,
  author: staffRefSchema,
  approver: staffRefSchema,
  publishedAt: isoDateTimeSchema,
  status: z.enum(['published', 'suspended']),
  /** Open suspension review, when suspended. */
  reviewCaseId: z.string().nullable(),
});
export type StaffFinding = z.infer<typeof staffFindingSchema>;

export const suspensionRequestSchema = z.strictObject({
  reason: rationale,
});
export type SuspensionRequest = z.infer<typeof suspensionRequestSchema>;

/**
 * A new revision of an existing finding (moderation §2): every change creates a new
 * immutable revision with a new content hash, based on the latest revision the editor saw.
 */
export const revisionDraftSchema = z.strictObject({
  severity: findingSeveritySchema,
  publicSummary: publicText,
  internalRationale: rationale,
});
export type RevisionDraft = z.infer<typeof revisionDraftSchema>;

/** The revision the editor started from; a different latest revision is a conflict. */
export const revisionBaseSchema = z.strictObject({
  revisionNumber: z.number().int().positive(),
  contentHash: findingRevisionSchema.shape.contentHash,
});
export type RevisionBase = z.infer<typeof revisionBaseSchema>;

/** A finding's immutable revision history, oldest first, with what the public sees now. */
export const findingHistorySchema = z.strictObject({
  finding: staffFindingSchema,
  revisions: z.array(findingRevisionSchema),
  /** The public summary currently shown; null while suspended (the public sees only the suspension notice). */
  publicText: z.string().nullable(),
  /** Why approval is blocked right now, if it is (e.g. an open suspension review). */
  approvalBlockedReason: z.string().nullable(),
});
export type FindingHistory = z.infer<typeof findingHistorySchema>;
