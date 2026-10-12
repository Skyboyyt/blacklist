/**
 * Universal search contract. Input classification in the browser is a UX hint
 * only; the API classifies and validates again.
 */
import { z } from './zod.ts';
import { assessmentBandSchema, chainSlugSchema } from './common.ts';

export const SEARCH_QUERY_MAX_LENGTH = 200;

export const searchRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH),
  chain: chainSlugSchema.optional(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchHitSchema = z.strictObject({
  kind: z.enum(['address', 'transaction']),
  chain: chainSlugSchema,
  /** Canonical identifier used in the result URL. */
  id: z.string(),
  displayId: z.string(),
  band: assessmentBandSchema.nullable(),
  summary: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const networkCandidateSchema = z.strictObject({
  chain: chainSlugSchema,
  /** The identifier as it would be interpreted on this network. */
  interpretedAs: z.string(),
  note: z.string(),
});
export type NetworkCandidate = z.infer<typeof networkCandidateSchema>;

export const searchResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('results'), hits: z.array(searchHitSchema).min(1) }),
  z.strictObject({ kind: z.literal('choose_network'), candidates: z.array(networkCandidateSchema).min(2) }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('invalid_identifier'), reason: z.string() }),
  z.strictObject({ kind: z.literal('unsupported_network'), network: z.string() }),
  z.strictObject({ kind: z.literal('provider_unavailable'), retryAfterSeconds: z.number().int().positive() }),
]);
export type SearchResponse = z.infer<typeof searchResponseSchema>;
