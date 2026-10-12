/**
 * PUBLIC research DTOs (ARCHITECTURE.md §15.3, §15.6; ADR 0005; decision P-11).
 *
 * Everything here may be shown to anyone, so the schemas admit only data that is
 * approved for public presentation in V1 and reject everything else structurally:
 * - no numeric score or contribution (P-11);
 * - risk factors are a closed set of approved V1 factor codes; capability facts are
 *   separate `disclosures` with zero contribution and can never be a factor;
 * - findings are published moderator findings only: no unreviewed allegations,
 *   no AI observations (AI is deferred in V1);
 * - the public timeline has no report-receipt or other private/moderation events.
 * Private member data lives in member.ts; staff DTOs (numeric score, contributions,
 * internal references) are separate and are added with the staff UI.
 * Strict objects reject unknown fields.
 */
import { z } from './zod.ts';
import {
  assessmentBandSchema,
  chainSlugSchema,
  disputeStateSchema,
  evidenceTierSchema,
  factorWeightSchema,
  finalitySchema,
  isoDateTimeSchema,
  publicSourceSchema,
  riskConfidenceSchema,
  transferAuthorizationSchema,
  transferEvidenceLevelSchema,
  untrustedTextSchema,
} from './common.ts';

/**
 * Factors the approved V1 ruleset may use (ARCHITECTURE §15.3), with the only
 * provenance each may carry. Changing this list requires an ADR / owner sign-off (O-12).
 */
export const V1_RISK_FACTOR_PROVENANCE = {
  'finding.severe': 'moderator_finding',
  'finding.high': 'moderator_finding',
  'finding.medium': 'moderator_finding',
  'finding.low': 'moderator_finding',
  'token.symbol_impersonation': 'platform_analysis',
  'eoa.delegated_to_flagged': 'platform_analysis',
} as const;

export type V1RiskFactorCode = keyof typeof V1_RISK_FACTOR_PROVENANCE;
const V1_RISK_FACTOR_CODES = Object.keys(V1_RISK_FACTOR_PROVENANCE) as [
  V1RiskFactorCode,
  ...V1RiskFactorCode[],
];

export const riskFactorSchema = z
  .strictObject({
    id: z.string(),
    code: z.enum(V1_RISK_FACTOR_CODES),
    explanation: z.string(),
    provenance: z.enum(['moderator_finding', 'platform_analysis']),
    weight: factorWeightSchema,
    observedAt: isoDateTimeSchema,
  })
  .refine((f) => V1_RISK_FACTOR_PROVENANCE[f.code] === f.provenance, {
    path: ['provenance'],
    message: 'Provenance does not match the factor code.',
  });
export type RiskFactor = z.infer<typeof riskFactorSchema>;

/** Analysis factors an administrator may suppress (signal:suppress). Findings are suspended or reversed instead. */
export const SUPPRESSIBLE_FACTOR_CODES = ['token.symbol_impersonation', 'eoa.delegated_to_flagged'] as const;
export type SuppressibleFactorCode = (typeof SUPPRESSIBLE_FACTOR_CODES)[number];

/**
 * An audited signal suppression, shown publicly with its reason (PRD §5.14: suppressions
 * are audited and visible). The suppressed factor no longer contributes.
 */
export const publicSuppressionSchema = z.strictObject({
  factorCode: z.enum(SUPPRESSIBLE_FACTOR_CODES),
  publicReason: z.string().max(300),
  at: isoDateTimeSchema,
});
export type PublicSuppression = z.infer<typeof publicSuppressionSchema>;

/**
 * A staff-managed public label (label:manage). It identifies an address; it is not
 * a risk factor and contributes nothing to the band.
 */
export const publicLabelSchema = z.strictObject({
  id: z.string(),
  text: z.string().max(60),
  provenance: z.enum(['moderator_finding', 'external_source']),
  /** Named source for external labels; null for staff-verified labels. */
  sourceName: z.string().max(80).nullable(),
  addedAt: isoDateTimeSchema,
});
export type PublicLabel = z.infer<typeof publicLabelSchema>;

/**
 * A published right-of-reply response (moderation §9). Plain text, moderated for safety
 * only. It records time-bound control, not identity: "a party that proved control of
 * this address/domain on <standingProvenAt>".
 */
export const subjectResponseSchema = z.strictObject({
  id: z.string(),
  summary: z.string().max(5000),
  standing: z.enum(['wallet_signature', 'authority_signature', 'dns_txt', 'documentary']),
  standingProvenAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema,
});
export type SubjectResponse = z.infer<typeof subjectResponseSchema>;

/**
 * Capability facts shown as context with ZERO risk contribution in V1 (PRD glossary
 * "Disclosure"; ADR 0005 item 4). None of these codes is a risk factor code.
 */
export const DISCLOSURE_CODES = [
  'mint_authority',
  'freeze_authority',
  'permanent_delegate',
  'transfer_hook',
  'transfer_fee',
  'upgradeable_proxy',
  'pause_authority',
  'unverified_source',
] as const;

export const disclosureSchema = z.strictObject({
  id: z.string(),
  code: z.enum(DISCLOSURE_CODES),
  label: z.string(),
  explanation: z.string(),
  /** On-chain capability (chain_fact) or third-party source verification status (external_source). */
  provenance: z.enum(['chain_fact', 'external_source']),
  /** Where the capability fact or verification status came from (P1-05). */
  source: publicSourceSchema,
  observedAt: isoDateTimeSchema,
});
export type Disclosure = z.infer<typeof disclosureSchema>;

export const publicAssessmentSchema = z.strictObject({
  band: assessmentBandSchema,
  explanation: z.string(),
  factors: z.array(riskFactorSchema),
  confidence: riskConfidenceSchema,
  /** Plain-language description of what data was and was not available. */
  coverage: z.string(),
  /** Freshness: the time the assessment was computed ("as of"). */
  asOf: isoDateTimeSchema,
  rulesetVersion: z.string(),
  disputeState: disputeStateSchema,
  /** Audited suppressions affecting this assessment, with their public reason. */
  suppressions: z.array(publicSuppressionSchema),
});
export type PublicAssessment = z.infer<typeof publicAssessmentSchema>;

export const chainFactSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  provenance: z.literal('chain_fact'),
  finality: finalitySchema,
  /** Where this fact was read (P1-05). */
  source: publicSourceSchema,
  observedAt: isoDateTimeSchema,
});
export type ChainFact = z.infer<typeof chainFactSchema>;

/** A published moderator finding. Unreviewed reports and AI output are never public findings. */
export const findingSummarySchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  provenance: z.literal('moderator_finding'),
  publishedAt: isoDateTimeSchema,
  disputeState: disputeStateSchema,
});
export type FindingSummary = z.infer<typeof findingSummarySchema>;

export const transferSchema = z.strictObject({
  id: z.string(),
  direction: z.enum(['in', 'out']),
  counterparty: z.string(),
  amount: z.string(),
  /** Token symbols/names are attacker-controlled. */
  assetSymbol: untrustedTextSchema,
  assetVerified: z.boolean(),
  evidenceLevel: transferEvidenceLevelSchema,
  /** Authorization of the movement, relative to its sending (`from`) side (chain-data §2.3). */
  authorization: transferAuthorizationSchema,
  tier: evidenceTierSchema,
  txHash: z.string(),
  at: isoDateTimeSchema,
});
export type Transfer = z.infer<typeof transferSchema>;

export const evidenceItemSchema = z.strictObject({
  id: z.string(),
  kind: z.literal('image'),
  caption: z.string(),
  status: z.enum(['processing', 'available', 'redacted', 'removed']),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/**
 * Public status history of published findings. Report receipt, drafts, queue and
 * moderation-internal events are private and have no public event kind.
 */
export const timelineEventSchema = z.strictObject({
  id: z.string(),
  kind: z.enum([
    'finding_published',
    'finding_superseded',
    'appeal_filed',
    'finding_suspended',
    'finding_reinstated',
    'finding_reversed',
    'appeal_decided',
    'response_published',
    'signal_suppressed',
    'suppression_lifted',
  ]),
  label: z.string(),
  at: isoDateTimeSchema,
  actor: z.enum(['system', 'moderator', 'subject']),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const addressResearchSchema = z.strictObject({
  chain: chainSlugSchema,
  /** Canonical form: lowercase hex for EVM; case-preserved base58 for Solana. */
  address: z.string(),
  /** Display form: EIP-55 checksum for EVM; unchanged for Solana. */
  displayAddress: z.string(),
  kind: z.enum(['wallet', 'contract', 'token', 'unknown']),
  /** Untrusted self-description, e.g. an on-chain token name. */
  untrustedLabel: untrustedTextSchema.nullable(),
  assessment: publicAssessmentSchema,
  facts: z.array(chainFactSchema),
  /** Capability context. Never part of `assessment.factors`. */
  disclosures: z.array(disclosureSchema),
  /** Staff-managed identification labels (never risk factors). */
  labels: z.array(publicLabelSchema),
  findings: z.array(findingSummarySchema),
  /** Published right-of-reply responses from parties with standing. */
  responses: z.array(subjectResponseSchema),
  transfers: z.array(transferSchema),
  evidence: z.array(evidenceItemSchema),
  timeline: z.array(timelineEventSchema),
});
export type AddressResearch = z.infer<typeof addressResearchSchema>;

export const transactionResearchSchema = z.strictObject({
  chain: chainSlugSchema,
  hash: z.string(),
  finality: finalitySchema,
  blockOrSlot: z.string(),
  at: isoDateTimeSchema,
  from: z.string(),
  to: z.string().nullable(),
  feePaid: z.string(),
  status: z.enum(['success', 'failed']),
  transfers: z.array(transferSchema),
  facts: z.array(chainFactSchema),
});
export type TransactionResearch = z.infer<typeof transactionResearchSchema>;
