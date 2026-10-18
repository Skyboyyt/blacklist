import { createHash, randomUUID } from 'node:crypto';
import { schema, eq, and, isNull, inArray, sql, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { StorageError, type EvidenceStorage } from './storage.ts';

// Image upload (ARCHITECTURE §14.3, ADR 0004, ADR 0020). The API never parses the file:
// it checks the declared type and size, stores the bytes untouched in quarantine and
// records the item, which the worker then sends to the isolated processor.

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PER_REPORT = 10;
const MAX_UNLINKED = 20;
const UPLOADS_PER_DAY = 40;

const unavailable = () =>
  refuse(
    'evidence_unavailable',
    'Image evidence is not available yet. Submit without images; you can describe them in the narrative.',
  );

export const isImageType = (value: string | undefined): value is ImageType =>
  (IMAGE_TYPES as readonly string[]).includes(value ?? '');

/** Unlinked image items a member uploaded and has not yet attached to anything. */
function unlinkedImages(db: Database, userId: string) {
  return db
    .select({ id: schema.evidenceItems.id, state: schema.evidenceItems.state })
    .from(schema.evidenceItems)
    .where(
      and(
        eq(schema.evidenceItems.kind, 'image'),
        eq(schema.evidenceItems.submittedByUserId, userId),
        sql`not exists (select 1 from ${schema.evidenceLinks} l where l.evidence_item_id = ${schema.evidenceItems.id})`,
      ),
    );
}

export async function uploadEvidenceImage(
  ctx: IdentityContext,
  storage: EvidenceStorage | null,
  actor: UserActor,
  input: { bytes: Uint8Array<ArrayBuffer>; contentType: string | undefined },
  prefix: string,
) {
  requirePermission(actor, 'report:create');
  if (!storage) throw unavailable();
  const { bytes, contentType } = input;
  if (!isImageType(contentType))
    throw refuse('invalid_request', 'Only PNG, JPEG and WebP images are accepted.');
  if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES)
    throw refuse('invalid_request', 'Each image can be at most 10 MiB.');
  await ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    if ((await unlinkedImages(tx, actor.userId)).length >= MAX_UNLINKED)
      throw refuse('rate_limited', 'Attach or discard your earlier uploads before adding more images.');
    await ctx.throttle.requestLimit(tx, 'evidence.upload', actor.userId, prefix, UPLOADS_PER_DAY, 86400);
  });
  const id = randomUUID();
  const key = storage.newKey('quarantine', id);
  // A crash after this put leaves an object with no row; the quarantine bucket's
  // lifecycle rule removes it (runbook). It is never reachable without a row.
  const { versionId } = await storage.put('quarantine', key, bytes, contentType).catch((error: unknown) => {
    // The reason is a fixed code such as `storage_put_403`; never a URL, key or file content.
    console.error(error instanceof StorageError ? error.message : 'storage_put_failed');
    throw new DomainError('temporarily_unavailable');
  });
  return ctx.runtime.transaction(async (tx) => {
    await tx.insert(schema.evidenceItems).values({
      id,
      kind: 'image',
      submittedByUserId: actor.userId,
      submittedByRef: actor.actorRef,
      state: 'quarantined',
      contentType,
      nextAttemptAt: new Date(),
    });
    await tx.insert(schema.evidenceObjects).values({
      evidenceItemId: id,
      role: 'quarantine',
      bucket: storage.bucket('quarantine'),
      storageKey: key,
      objectVersionId: versionId,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
    });
    await tx
      .insert(schema.evidenceCustodyEvents)
      .values({ evidenceItemId: id, event: 'submitted', actorRef: actor.actorRef });
    return { id, state: 'processing' as const };
  });
}

/**
 * Attach a member's own uploaded images to a new report, inside its transaction. Each
 * image must be theirs, unattached and not rejected or purged; anything else is refused
 * the same way, so ids reveal nothing about other people's uploads.
 */
export async function linkImagesToReport(
  tx: Database,
  actor: UserActor,
  reportId: string,
  ids: readonly string[],
  enabled: boolean,
) {
  if (!ids.length) return;
  if (!enabled) throw unavailable();
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length || unique.length > MAX_PER_REPORT)
    throw refuse('invalid_request', `Attach at most ${MAX_PER_REPORT} different images.`);
  const rows = await tx
    .select({ id: schema.evidenceItems.id, state: schema.evidenceItems.state })
    .from(schema.evidenceItems)
    .where(
      and(
        inArray(schema.evidenceItems.id, unique),
        eq(schema.evidenceItems.kind, 'image'),
        eq(schema.evidenceItems.submittedByUserId, actor.userId),
      ),
    )
    .for('update');
  const linked = await tx
    .select({ id: schema.evidenceLinks.evidenceItemId })
    .from(schema.evidenceLinks)
    .where(
      and(inArray(schema.evidenceLinks.evidenceItemId, unique), isNull(schema.evidenceLinks.unlinkedAt)),
    );
  if (
    rows.length !== unique.length ||
    linked.length ||
    rows.some((r) => !['quarantined', 'processing', 'available'].includes(r.state))
  )
    throw refuse(
      'invalid_request',
      'One of the images is not available. Remove it, upload it again if needed, and resubmit.',
    );
  for (const id of unique)
    await tx
      .insert(schema.evidenceLinks)
      .values({ evidenceItemId: id, reportId, linkedByRef: actor.actorRef });
}
