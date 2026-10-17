/**
 * MEMBER-PRIVATE submission DTOs (PRD §5.11–§5.12, §5.18; moderation §6, §9–§10;
 * ADR 0010 Part A). Requests a signed-in member sends, and the views of their own
 * submissions returned only to them. These views never carry internal notes, internal
 * rationales, staff identities or other people's data.
 *
 * Evidence is image-only (PNG, JPEG, WebP; ≤ 10 MiB each; ≤ 10 per submission). The
 * browser sends file METADATA only in the frontend phases; real uploads go to the
 * isolated evidence pipeline (ADR 0004) once the backend exists.
 */
import { z } from './zod.ts';
import { chainSlugSchema, isoDateTimeSchema, type ChainSlugDto } from './common.ts';
import { reportCategorySchema } from './moderation.ts';
import { projectCategorySchema, projectSlugSchema } from './project.ts';

export const EVIDENCE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 10;

export const evidenceFileSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  type: z.enum(EVIDENCE_IMAGE_TYPES, { message: 'Only PNG, JPEG and WebP images are accepted.' }),
  size: z.number().int().min(1).max(EVIDENCE_MAX_BYTES, 'Each image can be at most 10 MiB.'),
});
export type EvidenceFile = z.infer<typeof evidenceFileSchema>;

export const evidenceFilesSchema = z
  .array(evidenceFileSchema)
  .max(EVIDENCE_MAX_FILES, `Attach at most ${EVIDENCE_MAX_FILES} images.`);

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX = /^0x[0-9a-fA-F]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Network-specific identifier rules. Format checks only; the API verifies on chain. */
export function isAddressFor(chain: ChainSlugDto, value: string): boolean {
  return chain === 'ethereum'
    ? EVM_ADDRESS.test(value)
    : BASE58.test(value) && value.length >= 32 && value.length <= 44;
}

export function isTxHashFor(chain: ChainSlugDto, value: string): boolean {
  return chain === 'ethereum'
    ? EVM_TX.test(value)
    : BASE58.test(value) && value.length >= 86 && value.length <= 88;
}

export const subjectRefSchema = z
  .strictObject({ chain: chainSlugSchema, address: z.string().trim().min(1, 'Enter an address.') })
  .refine((v) => isAddressFor(v.chain, v.address), {
    path: ['address'],
    message: 'This is not a valid address for the selected network.',
  });
export type SubjectRef = z.infer<typeof subjectRefSchema>;

export const txRefSchema = z
  .strictObject({ chain: chainSlugSchema, hash: z.string().trim().min(1, 'Enter a transaction hash.') })
  .refine((v) => isTxHashFor(v.chain, v.hash), {
    path: ['hash'],
    message: 'This is not a valid transaction hash for the selected network.',
  });

/** A URL kept as text. Blacklist never fetches it and shows it defanged. */
export const urlTextSchema = z
  .string()
  .trim()
  .max(500, 'Links can be at most 500 characters.')
  .regex(/^https?:\/\/\S+$/i, 'Enter a full link starting with http:// or https://.');

export const reportRequestSchema = z.strictObject({
  category: reportCategorySchema,
  title: z.string().trim().min(5, 'Use at least 5 characters.').max(140, 'Use at most 140 characters.'),
  subjects: z.array(subjectRefSchema).min(1, 'Add at least one address.').max(5),
  narrative: z
    .string()
    .trim()
    .min(20, 'Describe what happened in at least 20 characters.')
    .max(10000, 'Use at most 10,000 characters.'),
  incidentDate: z.iso.date({ message: 'Enter the date it happened.' }),
  lossAmount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Enter a number, for example 0.5.')
    .optional(),
  lossAsset: z.string().trim().max(20).optional(),
  txRefs: z.array(txRefSchema).max(10),
  urls: z.array(urlTextSchema).max(10),
  evidence: evidenceFilesSchema,
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

/** ADR 0010 Part A: a private suggestion. Submitting it proves nothing about ownership. */
export const suggestionRequestSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Use at least 2 characters.').max(80, 'Use at most 80 characters.'),
    category: projectCategorySchema,
    chain: chainSlugSchema,
    identifier: z.string().trim().min(1, 'Enter the contract or mint address.'),
    links: z.array(urlTextSchema).min(1, 'Add at least one official link.').max(5),
    description: z.string().trim().min(20, 'Use at least 20 characters.').max(2000),
    relationship: z
      .string()
      .trim()
      .min(10, 'Say how you are connected to the project, in at least 10 characters.')
      .max(1000),
    evidence: evidenceFilesSchema,
  })
  .refine((v) => isAddressFor(v.chain, v.identifier), {
    path: ['identifier'],
    message: 'This is not a valid contract or mint address for the selected network.',
  });
export type SuggestionRequest = z.infer<typeof suggestionRequestSchema>;

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/, 'Enter a domain such as example.org, without https://.');

/** A correction to a staff-created project profile (moderation §6.2 mechanism 5: no standing needed). */
export const correctionRequestSchema = z
  .strictObject({
    projectSlug: projectSlugSchema,
    statement: z.string().trim().min(10, 'Explain the correction in at least 10 characters.').max(5000),
    description: z.string().trim().min(20, 'Use at least 20 characters.').max(2000).optional(),
    addDomain: hostnameSchema.optional(),
    retireDomain: hostnameSchema.optional(),
    evidence: evidenceFilesSchema,
  })
  .refine((v) => v.description !== undefined || v.addDomain !== undefined || v.retireDomain !== undefined, {
    path: ['description'],
    message: 'Propose at least one change.',
  });
export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;

/** On-chain authority roles for authority-signature standing (moderation §6.2 #2). */
export const AUTHORITY_ROLES = ['owner', 'admin', 'upgrade_authority', 'mint_authority', 'deployer'] as const;
export const authorityRoleSchema = z.enum(AUTHORITY_ROLES);
export type AuthorityRole = z.infer<typeof authorityRoleSchema>;

/**
 * Standing proof for an appeal or response (moderation §6.2). Signature-based proofs carry
 * the server-issued challenge ID and the wallet's signature over that challenge's exact
 * text; the frontend mock may still send `simulated: true` instead, which the API refuses.
 * Documentary standing goes to a staff standing reviewer; until image uploads exist
 * (Phase 9b) it may be supported by transaction references and links.
 */
const signedProof = {
  simulated: z.literal(true).optional(),
  challengeId: z.uuid().optional(),
  /** EVM: 0x-hex `personal_sign` signature. Solana: base58 Ed25519 signature. */
  signature: z
    .string()
    .trim()
    .max(200)
    .regex(/^(0x[0-9a-fA-F]{130}|[1-9A-HJ-NP-Za-km-z]{64,90})$/, 'This is not a valid signature.')
    .optional(),
};
const oneProofForm = (v: {
  simulated?: true | undefined;
  challengeId?: string | undefined;
  signature?: string | undefined;
}) =>
  (v.simulated === true) !== (v.challengeId !== undefined && v.signature !== undefined) &&
  (v.challengeId === undefined) === (v.signature === undefined);
const proofMessage = {
  message: 'Sign the challenge with the wallet that controls the address.',
  path: ['signature'],
};
export const standingProofSchema = z.discriminatedUnion('mechanism', [
  z.strictObject({ mechanism: z.literal('signature'), ...signedProof }).refine(oneProofForm, proofMessage),
  z
    .strictObject({
      mechanism: z.literal('authority_signature'),
      authorityRole: authorityRoleSchema,
      ...signedProof,
    })
    .refine(oneProofForm, proofMessage),
  z
    .strictObject({
      mechanism: z.literal('dns_txt'),
      domain: hostnameSchema,
      simulated: z.literal(true).optional(),
      challengeId: z.uuid().optional(),
    })
    .refine((v) => (v.simulated === true) !== (v.challengeId !== undefined), {
      message: 'Publish the TXT record, then check it.',
      path: ['domain'],
    }),
  z
    .strictObject({
      mechanism: z.literal('documentary'),
      explanation: z
        .string()
        .trim()
        .min(10, 'Explain what the documents show, in at least 10 characters.')
        .max(2000),
      evidence: evidenceFilesSchema,
      txRefs: z.array(txRefSchema).max(10).optional(),
      urls: z.array(urlTextSchema).max(10).optional(),
    })
    .refine((v) => v.evidence.length + (v.txRefs?.length ?? 0) + (v.urls?.length ?? 0) > 0, {
      message: 'Attach a document image, a link or a transaction.',
      path: ['evidence'],
    }),
]);
export type StandingProof = z.infer<typeof standingProofSchema>;

/**
 * A server-built standing challenge (moderation §6.4): the exact text to sign with
 * `personal_sign` (EVM) or a Solana message signature. Single use, 10 minutes.
 */
export const standingChallengeSchema = z.strictObject({
  challengeId: z.uuid(),
  message: z.string().max(2000),
  expiresAt: isoDateTimeSchema,
});
export type StandingChallenge = z.infer<typeof standingChallengeSchema>;

export const appealRequestSchema = z.strictObject({
  findingId: z.string().min(1).max(64),
  grounds: z.string().trim().min(20, 'Explain your grounds in at least 20 characters.').max(5000),
  standing: standingProofSchema,
});
export type AppealRequest = z.infer<typeof appealRequestSchema>;

/** The subject a right-of-reply response is about (moderation §9 "Responses"). */
export const responseTargetRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('address'), chain: chainSlugSchema, address: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal('project'), slug: projectSlugSchema }),
]);
export type ResponseTargetRef = z.infer<typeof responseTargetRefSchema>;

export const responseRequestSchema = z.strictObject({
  target: responseTargetRefSchema,
  body: z.string().trim().min(20, 'Write at least 20 characters.').max(5000, 'Use at most 5,000 characters.'),
  standing: standingProofSchema,
});
export type ResponseRequest = z.infer<typeof responseRequestSchema>;

export const infoResponseSchema = z.strictObject({
  message: z.string().trim().min(10, 'Write at least 10 characters.').max(5000),
  evidence: evidenceFilesSchema,
});
export type InfoResponse = z.infer<typeof infoResponseSchema>;

export const submissionKindSchema = z.enum([
  'report',
  'project_suggestion',
  'correction',
  'appeal',
  'response',
]);
export type SubmissionKind = z.infer<typeof submissionKindSchema>;

/** The member's own submission, as they see it. */
export const memberSubmissionSummarySchema = z.strictObject({
  id: z.string(),
  kind: submissionKindSchema,
  title: z.string(),
  status: z.string(),
  submittedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Staff asked for information and are waiting for the member. */
  needsAction: z.boolean(),
});
export type MemberSubmissionSummary = z.infer<typeof memberSubmissionSummarySchema>;

export const memberSubmissionDetailSchema = z.strictObject({
  ...memberSubmissionSummarySchema.shape,
  version: z.number().int().positive(),
  /** What the member submitted, as label/value pairs (plain text). */
  details: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  /** Names of the images the member attached (the demo keeps names only). */
  evidenceNames: z.array(z.string()),
  /** Member-visible history: no staff identities, no internal notes. */
  timeline: z.array(z.strictObject({ at: isoDateTimeSchema, label: z.string() })),
  infoRequest: z.string().nullable(),
  /** Fixed-list reason shown after a rejection (code; the UI maps it to text). */
  submitterReason: z.string().nullable(),
  /** Public text published with the outcome, if any. */
  publicOutcome: z.string().nullable(),
  /** Where the public result can be seen (a project or address page), once there is one. */
  publicLink: z.string().nullable(),
  canRespond: z.boolean(),
  canWithdraw: z.boolean(),
});
export type MemberSubmissionDetail = z.infer<typeof memberSubmissionDetailSchema>;

export const memberNoticeSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  at: isoDateTimeSchema,
  href: z.string().nullable(),
});
export type MemberNotice = z.infer<typeof memberNoticeSchema>;

/** Errors a member submission call can return. Nothing was saved in any of these cases. */
export const memberErrorSchema = z.discriminatedUnion('code', [
  z.strictObject({ code: z.literal('sign_in_required') }),
  z.strictObject({ code: z.literal('not_found') }),
  /** Field-level validation errors, keyed by field path (e.g. `subjects.0.address`). */
  z.strictObject({ code: z.literal('invalid'), fieldErrors: z.record(z.string(), z.string()) }),
  z.strictObject({ code: z.literal('conflict'), detail: z.string() }),
  z.strictObject({ code: z.literal('invalid_transition'), detail: z.string() }),
  z.strictObject({ code: z.literal('temporarily_unavailable') }),
  /** An administrator suspended the account; nothing can be submitted. */
  z.strictObject({ code: z.literal('account_suspended') }),
]);
export type MemberError = z.infer<typeof memberErrorSchema>;

/** The finding an appeal would target, as the appellant sees it. */
export const appealTargetSchema = z.strictObject({
  findingId: z.string(),
  title: z.string(),
  summary: z.string(),
  subject: z.strictObject({ chain: chainSlugSchema, address: z.string() }),
  /** Decides which standing mechanisms fit (authority signatures are for contracts and tokens). */
  subjectKind: z.enum(['wallet', 'contract', 'token', 'unknown']),
  disputeState: z.enum(['none', 'under_appeal', 'suspended_pending_review']),
  /** The signed-in member already has an open appeal against it. */
  alreadyAppealed: z.boolean(),
});
export type AppealTarget = z.infer<typeof appealTargetSchema>;

/** What a responder sees before writing a response. */
export const responseTargetSchema = z.strictObject({
  target: responseTargetRefSchema,
  title: z.string(),
  subjectKind: z.enum(['wallet', 'contract', 'token', 'unknown', 'project']),
  /** Official domains, for DNS standing on project subjects. */
  domains: z.array(z.string()),
  /** The signed-in member already has a response under review for this subject. */
  alreadyResponding: z.boolean(),
});
export type ResponseTarget = z.infer<typeof responseTargetSchema>;

/** The ID of a newly created submission (its case). */
export const createdIdSchema = z.strictObject({ id: z.string() });
