/**
 * Deterministic short content hash for demo revisions (not cryptographic). The real
 * service hashes the canonical JSON of every revision field with SHA-256 (moderation §2).
 */
export function demoHash(text: string): string {
  let h = 0xcbf29ce4;
  let g = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    g = Math.imul(g ^ text.charCodeAt(i), 0x0100019b) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
}

/** Hash over every field a revision asserts, so any change gives a new hash. */
export function revisionHash(fields: {
  readonly findingId: string;
  readonly revisionNumber: number;
  readonly subject: unknown;
  readonly severity: string;
  readonly publicSummary: string;
  readonly internalRationale: string;
  readonly evidenceIds: readonly string[];
}): string {
  return demoHash(
    JSON.stringify([
      fields.findingId,
      fields.revisionNumber,
      fields.subject,
      fields.severity,
      fields.publicSummary,
      fields.internalRationale,
      fields.evidenceIds,
    ]),
  );
}
