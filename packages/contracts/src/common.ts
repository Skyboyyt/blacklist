/**
 * Shared schema building blocks (ARCHITECTURE.md §15, PRD §1.1).
 *
 * Public DTOs use strict objects: an unexpected field (for example a numeric
 * risk score, decision P-11) is rejected instead of being passed through.
 */
import { PROVENANCE_CATEGORIES } from '@blacklist/core';
import { z } from './zod.ts';

/** V1 chain registry slugs. Adding a chain is an ADR-level change. */
export const CHAIN_SLUGS = ['ethereum', 'solana'] as const;
export const chainSlugSchema = z.enum(CHAIN_SLUGS);
export type ChainSlugDto = z.infer<typeof chainSlugSchema>;

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const provenanceSchema = z.enum(PROVENANCE_CATEGORIES);

export const assessmentBandSchema = z.enum(['low', 'moderate', 'high', 'severe', 'not_assessed']);
export const riskConfidenceSchema = z.enum(['low', 'medium', 'high']);

/**
 * Public dispute state of a subject or finding. Filing an appeal never hides a
 * finding ("Disputed — under appeal"); only an emergency suspension removes it
 * from scoring ("Temporarily suspended pending review").
 */
export const disputeStateSchema = z.enum(['none', 'under_appeal', 'suspended_pending_review']);
export type DisputeState = z.infer<typeof disputeStateSchema>;

/** Relative weight wording for a factor. Never a number (ARCHITECTURE §15.6). */
export const factorWeightSchema = z.enum(['primary', 'contributing', 'minor']);

/** Edge/claim strength tiers used in transfer and relationship displays. */
export const evidenceTierSchema = z.enum(['observed', 'inferred', 'verified']);

/** Transfer evidence level (chain-data design §2). */
export const transferEvidenceLevelSchema = z.enum([
  'observed_log',
  'asset_contract_log',
  'balance_verified',
  'native_consensus',
]);

/** Who authorized a transfer. `unknown` must be shown as unknown, never as the subject. */
export const transferAuthorizationSchema = z.enum([
  'subject_signed_direct',
  'delegated',
  'protocol',
  'unknown',
]);

export const finalitySchema = z.enum(['pending', 'final', 'orphaned']);

/**
 * Public source reference for a fact or disclosure (review P1-05): a short, sanitized
 * label naming the kind of source, e.g. "Finalized Ethereum node read". Never a URL,
 * provider credential, internal receipt or private evidence reference.
 */
export const publicSourceSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((v) => !/:\/\/|www\./i.test(v), { message: 'A source reference is a label, not a link.' });

/** Untrusted, attacker-controllable text (token names, labels). Rendered as plain text only. */
export const untrustedTextSchema = z.string().max(200);
