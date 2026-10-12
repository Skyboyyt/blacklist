/**
 * PUBLIC project DTOs (PRD §5.10, §5.17; ARCHITECTURE §12 D-014; ADR 0005).
 *
 * V1 projects are staff-created profiles: description, category, official addresses
 * and domains with their attribution basis, published findings, responses and change
 * history. Rules carried by these schemas:
 * - no numeric score anywhere (P-11) and no combined project rating: project aggregate
 *   assessments are Post-V1, so each official address carries its OWN assessment;
 * - an attribution says why staff list an address or domain as official, at a time.
 *   It is not an ownership verdict and is never proof of control;
 * - capability disclosures stay separate from assessment factors;
 * - there is no submission, verification or rejection state: self-service projects and
 *   project verification are not V1 (PRD §4.4, §5.16; Proposed ADR 0010);
 * - a project is always identified by its slug and official identifiers, never by
 *   its name alone.
 * Strict objects reject unknown fields.
 */
import { z } from './zod.ts';
import { assessmentBandSchema, chainSlugSchema, disputeStateSchema, isoDateTimeSchema } from './common.ts';
import {
  disclosureSchema,
  findingSummarySchema,
  publicAssessmentSchema,
  subjectResponseSchema,
} from './research.ts';

export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const projectSlugSchema = z.string().min(2).max(64).regex(PROJECT_SLUG_PATTERN);

/** Descriptive categories for browsing. Not a risk signal. Interim list; the owner may revise it. */
export const PROJECT_CATEGORIES = [
  'defi',
  'exchange',
  'wallet',
  'token',
  'nft',
  'infrastructure',
  'dao',
  'other',
] as const;
export const projectCategorySchema = z.enum(PROJECT_CATEGORIES);
export type ProjectCategory = z.infer<typeof projectCategorySchema>;

/**
 * Why staff list an address or domain as official (data-model §4: `basis` with time and
 * evidence). None of these proves ownership or control.
 */
export const attributionBasisSchema = z.enum([
  'official_announcement',
  'deployment_record',
  'authority_signature',
  'staff_documentary_review',
]);
export type AttributionBasis = z.infer<typeof attributionBasisSchema>;

export const officialAddressRoleSchema = z.enum([
  'token',
  'contract',
  'program',
  'treasury',
  'deployer',
  'other',
]);

export const officialAddressSchema = z.strictObject({
  chain: chainSlugSchema,
  /** Canonical form: lowercase hex for EVM; case-preserved base58 for Solana. */
  address: z.string(),
  displayAddress: z.string(),
  role: officialAddressRoleSchema,
  basis: attributionBasisSchema,
  basisNote: z.string().max(300),
  attributedAt: isoDateTimeSchema,
  /**
   * The address's own public assessment. `null` means it could not be loaded right
   * now (unavailable), which is different from `not_assessed`.
   */
  assessment: publicAssessmentSchema.nullable(),
  /** Capability context with zero contribution. Never part of `assessment.factors`. */
  disclosures: z.array(disclosureSchema),
});
export type OfficialAddress = z.infer<typeof officialAddressSchema>;

export const officialDomainSchema = z.strictObject({
  /** Lowercase punycode hostname. Shown as text; Blacklist never fetches it. */
  hostname: z
    .string()
    .max(253)
    .regex(/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/),
  basis: attributionBasisSchema,
  basisNote: z.string().max(300),
  attributedAt: isoDateTimeSchema,
});
export type OfficialDomain = z.infer<typeof officialDomainSchema>;

/** A published response from the subject, with the standing mechanism that admitted it (moderation §6). */
export const projectResponseSchema = subjectResponseSchema;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

/** Public project history (PRD §5.17). Reports, drafts and moderation-internal events have no kind. */
export const projectHistoryEventSchema = z.strictObject({
  id: z.string(),
  kind: z.enum([
    'profile_created',
    'profile_revised',
    'official_address_added',
    'official_address_retired',
    'domain_added',
    'domain_retired',
    'finding_published',
    'finding_superseded',
    'finding_suspended',
    'appeal_filed',
    'appeal_decided',
    'response_published',
  ]),
  label: z.string(),
  at: isoDateTimeSchema,
  actor: z.enum(['system', 'moderator', 'subject']),
});
export type ProjectHistoryEvent = z.infer<typeof projectHistoryEventSchema>;

/** How current the profile data is. `note` explains partial or stale data in plain language. */
export const projectFreshnessSchema = z.strictObject({
  state: z.enum(['current', 'partial', 'stale']),
  note: z.string().max(300).nullable(),
});

export const projectDetailSchema = z.strictObject({
  slug: projectSlugSchema,
  /** Staff-entered name. Names can be imitated; identifiers identify the project. */
  name: z.string().min(1).max(80),
  category: projectCategorySchema,
  description: z.string().max(2000),
  officialAddresses: z.array(officialAddressSchema),
  domains: z.array(officialDomainSchema),
  findings: z.array(findingSummarySchema),
  responses: z.array(projectResponseSchema),
  history: z.array(projectHistoryEventSchema),
  /** Current staff profile revision (append-only revisions, data-model §4). */
  profileRevision: z.number().int().positive(),
  /** When staff last published a revision of this profile. */
  lastReviewedAt: isoDateTimeSchema,
  /** When any public part of this page last changed. */
  updatedAt: isoDateTimeSchema,
  freshness: projectFreshnessSchema,
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const projectIdentifierSchema = z.strictObject({
  chain: chainSlugSchema,
  address: z.string(),
  displayAddress: z.string(),
});

/** Directory card. No band, no score: there is no combined project rating in V1. */
export const projectSummarySchema = z.strictObject({
  slug: projectSlugSchema,
  name: z.string().min(1).max(80),
  category: projectCategorySchema,
  networks: z.array(chainSlugSchema),
  /**
   * An official identifier for recognition: on the selected network when the directory
   * is filtered by one. `null` when the profile lists none yet.
   */
  primaryIdentifier: projectIdentifierSchema.nullable(),
  officialAddressCount: z.number().int().min(0),
  publishedFindingCount: z.number().int().min(0),
  /** Strongest public dispute state among the project's published findings. */
  disputeState: disputeStateSchema,
  lastReviewedAt: isoDateTimeSchema,
  freshness: projectFreshnessSchema.shape.state,
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const PROJECT_DIRECTORY_PAGE_SIZE = 6;
export const PROJECT_QUERY_MAX_LENGTH = 100;

/** Published-findings filter: the V1 public status of a project profile. */
export const projectFindingsFilterSchema = z.enum([
  'any',
  'with_findings',
  'without_findings',
  /** At least one published finding is under appeal or suspended pending review. */
  'disputed',
]);
export type ProjectFindingsFilter = z.infer<typeof projectFindingsFilterSchema>;

export const projectSortSchema = z.enum(['name', 'recently_reviewed', 'most_findings']);
export type ProjectSort = z.infer<typeof projectSortSchema>;

/**
 * Directory query. A text query matches names and official domains; an address query
 * matches official addresses ON THE SELECTED NETWORK ONLY and needs `chain`.
 */
export const projectDirectoryRequestSchema = z.strictObject({
  query: z.string().trim().max(PROJECT_QUERY_MAX_LENGTH).optional(),
  chain: chainSlugSchema.optional(),
  category: projectCategorySchema.optional(),
  findings: projectFindingsFilterSchema.default('any'),
  sort: projectSortSchema.default('name'),
  page: z.number().int().min(1).max(1000).default(1),
});
export type ProjectDirectoryRequest = z.input<typeof projectDirectoryRequestSchema>;
export type ProjectDirectoryQuery = z.output<typeof projectDirectoryRequestSchema>;

export const projectDirectoryResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('results'),
    items: z.array(projectSummarySchema).min(1),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalItems: z.number().int().min(1),
    totalPages: z.number().int().min(1),
  }),
  /** The query or filters matched nothing (which says nothing about safety). */
  z.strictObject({ kind: z.literal('no_results') }),
  /** No project profiles are published yet. */
  z.strictObject({ kind: z.literal('empty_directory') }),
  /** An address query needs an explicit network; it is never matched across networks. */
  z.strictObject({ kind: z.literal('choose_network') }),
  z.strictObject({ kind: z.literal('invalid_query'), reason: z.string() }),
  z.strictObject({ kind: z.literal('provider_unavailable'), retryAfterSeconds: z.number().int().positive() }),
]);
export type ProjectDirectoryResponse = z.infer<typeof projectDirectoryResponseSchema>;

/**
 * Band ranking of reviewed projects (ADR 0012, accepted band-only). There is no numeric
 * score anywhere (P-11): a project's band is the highest band among its official
 * addresses (on the selected network, when one is chosen). Projects in the same band
 * share a rank and are listed A–Z. Missing, stale or unreliable data is never ranked as
 * low risk: such projects are listed separately as not ranked, with the reason.
 */
export const scoreboardRequestSchema = z.strictObject({ chain: chainSlugSchema.optional() });
export type ScoreboardRequest = z.infer<typeof scoreboardRequestSchema>;

export const scoreboardEntrySchema = z.strictObject({
  /** 1 + the number of ranked projects in higher bands. Shared by every project in the band. */
  rank: z.number().int().min(1),
  /** Another project shares this rank (shown as "2="). */
  tied: z.boolean(),
  slug: projectSlugSchema,
  name: z.string().min(1).max(80),
  category: projectCategorySchema,
  networks: z.array(chainSlugSchema).min(1),
  band: assessmentBandSchema.exclude(['not_assessed']),
  /** The official address whose assessment sets the band. */
  decidingAddress: z.strictObject({
    chain: chainSlugSchema,
    address: z.string(),
    displayAddress: z.string(),
  }),
  /** How many of the considered official addresses are assessed. */
  basedOn: z.strictObject({ assessed: z.number().int().min(1), total: z.number().int().min(1) }),
  disputeState: disputeStateSchema,
  freshness: z.enum(['current', 'partial']),
  lastReviewedAt: isoDateTimeSchema,
});
export type ScoreboardEntry = z.infer<typeof scoreboardEntrySchema>;

export const scoreboardNotRankedReasonSchema = z.enum([
  'stale_profile',
  'assessment_unavailable',
  'suspended_finding',
  'not_assessed',
  'low_confidence',
  'no_official_addresses',
]);
export type ScoreboardNotRankedReason = z.infer<typeof scoreboardNotRankedReasonSchema>;

export const scoreboardResponseSchema = z.strictObject({
  /** The most recent assessment time among the ranked projects ("as of"). */
  asOf: isoDateTimeSchema.nullable(),
  ranked: z.array(scoreboardEntrySchema),
  notRanked: z.array(
    z.strictObject({ slug: projectSlugSchema, name: z.string(), reason: scoreboardNotRankedReasonSchema }),
  ),
});
export type ScoreboardResponse = z.infer<typeof scoreboardResponseSchema>;
