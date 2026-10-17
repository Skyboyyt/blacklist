import { schema, eq, and, isNull, desc, inArray, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import type { EvidenceStorage } from './storage.ts';

// Evidence access (ARCHITECTURE §14.4, ADR 0004 §6). Staff only ever receive the sanitized
// derivative, as a download from the storage domain: a presigned link valid for five
// minutes, served as an attachment. Issuing a link is recorded in the custody history;
// revocation is bounded by that lifetime. Originals have no link at all.

const LINK_SECONDS = 300;
const EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

/** Plain-language state notes for images (contracts `stateNote`). */
export const IMAGE_REJECTION_NOTE: Readonly<Record<string, string>> = {
  unsupported_type: 'Not a PNG, JPEG or WebP image.',
  animated: 'Animated images are not accepted.',
  too_many_pixels: 'The image is larger than 40 megapixels or 12,000 pixels on a side.',
  too_large: 'The file is larger than 10 MiB.',
  decode_failed: 'The file is damaged or not a valid image.',
  integrity_failed: 'The stored file changed after upload, so it was not used.',
  derivative_mismatch: 'The cleaned copy could not be verified, so it was not used.',
  processing_failed: 'The image could not be processed after several attempts.',
  source_unavailable: 'The uploaded file could not be found.',
};

/** Current, unpurged derivatives of image items, newest first per item. */
export async function currentDerivatives(db: Database, itemIds: readonly string[]) {
  if (!itemIds.length) return new Map<string, typeof schema.evidenceDerivatives.$inferSelect>();
  const rows = await db
    .select()
    .from(schema.evidenceDerivatives)
    .where(
      and(
        inArray(schema.evidenceDerivatives.evidenceItemId, itemIds),
        isNull(schema.evidenceDerivatives.purgedAt),
      ),
    )
    .orderBy(desc(schema.evidenceDerivatives.createdAt));
  const byItem = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!byItem.has(row.evidenceItemId)) byItem.set(row.evidenceItemId, row);
  return byItem;
}

/**
 * A five-minute download link for the sanitized copy of an image on a report case the
 * staff member can see. Anything else is refused as not found.
 */
export async function issueDerivativeLink(
  ctx: IdentityContext,
  storage: EvidenceStorage | null,
  actor: UserActor,
  evidenceId: string,
) {
  requirePermission(actor, 'moderation:case:read');
  if (!storage) throw refuse('evidence_unavailable', 'Image evidence is not available on this server.');
  // Report cases are visible to moderators and administrators only (cases.ts visibleTypes).
  if (!actor.roles.some((r) => r === 'moderator' || r === 'admin')) throw new DomainError('not_found');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const [row] = await tx
      .select({ item: schema.evidenceItems })
      .from(schema.evidenceItems)
      .innerJoin(schema.evidenceLinks, eq(schema.evidenceLinks.evidenceItemId, schema.evidenceItems.id))
      .innerJoin(schema.moderationCases, eq(schema.moderationCases.reportId, schema.evidenceLinks.reportId))
      .where(
        and(
          eq(schema.evidenceItems.id, evidenceId),
          eq(schema.evidenceItems.kind, 'image'),
          eq(schema.evidenceItems.state, 'available'),
          isNull(schema.evidenceLinks.unlinkedAt),
        ),
      );
    if (!row) throw new DomainError('not_found');
    const derivative = (await currentDerivatives(tx, [evidenceId])).get(evidenceId);
    if (!derivative) throw new DomainError('not_found');
    const format = derivative.format as keyof typeof EXTENSION;
    const url = storage.presign('GET', 'derivatives', derivative.storageKey, LINK_SECONDS, {
      'response-content-disposition': `attachment; filename="evidence-${evidenceId}.${EXTENSION[format]}"`,
      'response-content-type': MIME[format],
    });
    const expiresAt = new Date(Date.now() + LINK_SECONDS * 1000).toISOString();
    await tx.insert(schema.evidenceCustodyEvents).values({
      evidenceItemId: evidenceId,
      event: 'derivative_link_issued',
      actorRef: actor.actorRef,
      details: { derivativeId: derivative.id, expiresAt },
    });
    return { url, expiresAt };
  });
}
