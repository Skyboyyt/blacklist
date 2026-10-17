import { createHash } from 'node:crypto';
import { z } from 'zod';
import { schema, eq, and, lte, inArray, sql, type Database, type DatabaseRuntime } from '@blacklist/db';
import type { EvidenceStorage } from './storage.ts';
import { MAX_IMAGE_BYTES } from './uploads.ts';

// Worker orchestration for image evidence (ARCHITECTURE §14.3). The worker never parses an
// image: it checks hashes and sizes, hands scoped presigned URLs to the isolated processor,
// and records the results. The evidence row is the job: `next_attempt_at` is both the
// retry time and a lease, so a crashed attempt is picked up again after it.

const ACTOR = 'system:evidence-processing';
const MAX_ATTEMPTS = 5;
const URL_SECONDS = 600;
const PROCESSOR_TIMEOUT_MS = 120_000;

const processorResult = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('processed'),
    format: z.enum(['png', 'jpeg', 'webp']),
    width: z.number().int().min(1).max(12000),
    height: z.number().int().min(1).max(12000),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(MAX_IMAGE_BYTES * 4),
    derivativeSha256: z.string().regex(/^[0-9a-f]{64}$/),
    processorVersion: z.string().min(1).max(40),
  }),
  z.strictObject({
    status: z.literal('rejected'),
    reason: z.enum([
      'too_large',
      'unsupported_type',
      'animated',
      'too_many_pixels',
      'decode_failed',
      'source_unavailable',
      'upload_failed',
    ]),
    processorVersion: z.string().min(1).max(40),
  }),
]);
export type ProcessorResult = z.infer<typeof processorResult>;

export interface EvidenceProcessor {
  process(job: { source: string; destination: string }): Promise<ProcessorResult>;
}

export class ProcessorUnavailable extends Error {}

/** The processor's one route. A cold free instance can take a minute to answer. */
export function createProcessorClient(baseUrl: string): EvidenceProcessor {
  return {
    async process(job) {
      const response = await fetch(`${baseUrl}/v1/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(job),
        redirect: 'error',
        signal: AbortSignal.timeout(PROCESSOR_TIMEOUT_MS),
      }).catch(() => {
        throw new ProcessorUnavailable('processor_unreachable');
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProcessorUnavailable(`processor_${response.status}`);
      }
      return processorResult.parse(await response.json());
    },
  };
}

// Magic bytes only; the worker checks the derivative is the format the processor claims.
const MAGIC: Record<'png' | 'jpeg' | 'webp', (b: Uint8Array) => boolean> = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) =>
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
};
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const backoffMs = (attempt: number) => Math.min(60 * 60_000, 2 * 60_000 * 2 ** (attempt - 1));

type Item = typeof schema.evidenceItems.$inferSelect;

/** Claim the next due image, leasing it until its retry time. */
async function claim(runtime: DatabaseRuntime, now: Date): Promise<Item | null> {
  return runtime.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(schema.evidenceItems)
      .where(
        and(
          eq(schema.evidenceItems.kind, 'image'),
          inArray(schema.evidenceItems.state, ['quarantined', 'processing']),
          lte(schema.evidenceItems.nextAttemptAt, now),
        ),
      )
      .orderBy(schema.evidenceItems.nextAttemptAt)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!item) return null;
    const attempts = item.processingAttempts + 1;
    const [claimed] = await tx
      .update(schema.evidenceItems)
      .set({
        state: 'processing',
        processingAttempts: attempts,
        nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
      })
      .where(eq(schema.evidenceItems.id, item.id))
      .returning();
    return claimed ?? null;
  });
}

/** Finish an attempt, only if the item is still the one this attempt claimed. */
async function finish(
  runtime: DatabaseRuntime,
  item: Item,
  write: (tx: Database) => Promise<void>,
): Promise<boolean> {
  return runtime.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.evidenceItems)
      .where(eq(schema.evidenceItems.id, item.id))
      .for('update');
    // A later attempt, a purge or a legal hold changed the item: do nothing (no resurrection).
    if (!current || current.state !== 'processing' || current.processingAttempts !== item.processingAttempts)
      return false;
    await write(tx);
    return true;
  });
}

async function reject(runtime: DatabaseRuntime, item: Item, reason: string) {
  await finish(runtime, item, async (tx) => {
    await tx
      .update(schema.evidenceItems)
      .set({ state: 'rejected', rejectionReason: reason, nextAttemptAt: null })
      .where(eq(schema.evidenceItems.id, item.id));
    await tx
      .insert(schema.evidenceCustodyEvents)
      .values({ evidenceItemId: item.id, event: 'rejected', actorRef: ACTOR, details: { reason } });
  });
}

/** One attempt on one item. Transient failures leave it for the next attempt. */
async function attempt(
  runtime: DatabaseRuntime,
  storage: EvidenceStorage,
  processor: EvidenceProcessor,
  item: Item,
) {
  if (item.processingAttempts > MAX_ATTEMPTS) return reject(runtime, item, 'processing_failed');
  const [quarantine] = await runtime.db
    .select()
    .from(schema.evidenceObjects)
    .where(
      and(eq(schema.evidenceObjects.evidenceItemId, item.id), eq(schema.evidenceObjects.role, 'quarantine')),
    );
  if (!quarantine || quarantine.purgedAt) return reject(runtime, item, 'source_unavailable');
  const original = await storage.get('quarantine', quarantine.storageKey, MAX_IMAGE_BYTES);
  if (!original) return reject(runtime, item, 'source_unavailable');
  if (original.length !== quarantine.sizeBytes || sha256(original) !== quarantine.sha256)
    return reject(runtime, item, 'integrity_failed');
  const derivativeKey = storage.newKey('derivative', item.id);
  const result = await processor.process({
    source: storage.presign('GET', 'quarantine', quarantine.storageKey, URL_SECONDS),
    destination: storage.presign('PUT', 'derivatives', derivativeKey, URL_SECONDS),
  });
  if (result.status === 'rejected') {
    if (result.reason === 'source_unavailable' || result.reason === 'upload_failed')
      throw new ProcessorUnavailable(result.reason);
    return reject(runtime, item, result.reason);
  }
  // The processor is untrusted output too: re-check what it stored against what it claims.
  const derivative = await storage.get('derivatives', derivativeKey, MAX_IMAGE_BYTES * 4);
  if (
    !derivative ||
    derivative.length !== result.sizeBytes ||
    sha256(derivative) !== result.derivativeSha256 ||
    !MAGIC[result.format](derivative)
  ) {
    await storage.remove('derivatives', derivativeKey).catch(() => undefined);
    return reject(runtime, item, 'derivative_mismatch');
  }
  const originalKey = storage.newKey('original', item.id);
  const { versionId } = await storage.put(
    'evidence',
    originalKey,
    original,
    item.contentType ?? 'application/octet-stream',
  );
  const done = await finish(runtime, item, async (tx) => {
    await tx.insert(schema.evidenceObjects).values({
      evidenceItemId: item.id,
      role: 'original',
      bucket: storage.bucket('evidence'),
      storageKey: originalKey,
      objectVersionId: versionId,
      sha256: quarantine.sha256,
      sizeBytes: quarantine.sizeBytes,
    });
    await tx.insert(schema.evidenceDerivatives).values({
      evidenceItemId: item.id,
      kind: 'sanitized_image',
      bucket: storage.bucket('derivatives'),
      storageKey: derivativeKey,
      sha256: result.derivativeSha256,
      sizeBytes: result.sizeBytes,
      format: result.format,
      width: result.width,
      height: result.height,
      processorVersion: result.processorVersion,
      createdByRef: ACTOR,
    });
    await tx
      .update(schema.evidenceObjects)
      .set({ purgedAt: new Date(), purgeReason: 'promoted_to_original' })
      .where(eq(schema.evidenceObjects.id, quarantine.id));
    await tx
      .update(schema.evidenceItems)
      .set({ state: 'available', nextAttemptAt: null })
      .where(eq(schema.evidenceItems.id, item.id));
    await tx.insert(schema.evidenceCustodyEvents).values({
      evidenceItemId: item.id,
      event: 'processed',
      actorRef: ACTOR,
      details: { processorVersion: result.processorVersion, derivativeSha256: result.derivativeSha256 },
    });
  });
  // The quarantine copy goes once the original is recorded. If this delete fails, the
  // quarantine bucket's lifecycle rule removes it; the row already says it is gone.
  if (done) await storage.remove('quarantine', quarantine.storageKey).catch(() => undefined);
}

/**
 * Process due images, up to `limit` per call. Returns how many attempts ran. Unexpected
 * errors leave the item leased until its retry time and are reported by name only.
 */
export async function processPendingEvidence(
  runtime: DatabaseRuntime,
  storage: EvidenceStorage,
  processor: EvidenceProcessor,
  options: { now?: () => Date; limit?: number } = {},
) {
  const now = options.now ?? (() => new Date());
  let ran = 0;
  for (; ran < (options.limit ?? 5); ran += 1) {
    const item = await claim(runtime, now());
    if (!item) break;
    await attempt(runtime, storage, processor, item).catch((error: unknown) => {
      console.error(error instanceof ProcessorUnavailable ? error.message : 'evidence_processing_failed');
    });
  }
  return ran;
}

/**
 * Daily reconciliation (ARCHITECTURE §14.5): images uploaded but never attached within
 * seven days are removed from storage and marked purged. Held items are never touched.
 * The item is first marked `purge_requested`, which also stops it being attached, then its
 * bytes are deleted, then the purge is recorded; a failure part-way is resumed next run.
 */
export async function purgeAbandonedUploads(
  runtime: DatabaseRuntime,
  storage: EvidenceStorage,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 7 * 86400_000);
  const unlinked = sql`not exists (select 1 from ${schema.evidenceLinks} l where l.evidence_item_id = ${schema.evidenceItems.id})`;
  const candidates = await runtime.db
    .select({ id: schema.evidenceItems.id })
    .from(schema.evidenceItems)
    .where(
      and(
        eq(schema.evidenceItems.kind, 'image'),
        eq(schema.evidenceItems.legalHold, false),
        inArray(schema.evidenceItems.state, ['available', 'rejected', 'purge_requested']),
        lte(schema.evidenceItems.submittedAt, cutoff),
        unlinked,
      ),
    )
    .limit(100);
  let purged = 0;
  for (const { id } of candidates) {
    const requested = await runtime.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(schema.evidenceItems)
        .where(and(eq(schema.evidenceItems.id, id), unlinked))
        .for('update');
      if (!item || item.legalHold || !['available', 'rejected', 'purge_requested'].includes(item.state))
        return false;
      await tx
        .update(schema.evidenceItems)
        .set({ state: 'purge_requested', rejectionReason: null, nextAttemptAt: null })
        .where(eq(schema.evidenceItems.id, id));
      return true;
    });
    if (!requested) continue;
    const objects = await runtime.db
      .select()
      .from(schema.evidenceObjects)
      .where(eq(schema.evidenceObjects.evidenceItemId, id));
    const derivatives = await runtime.db
      .select()
      .from(schema.evidenceDerivatives)
      .where(eq(schema.evidenceDerivatives.evidenceItemId, id));
    try {
      for (const o of objects.filter((o) => !o.purgedAt))
        await storage.remove(o.role === 'original' ? 'evidence' : 'quarantine', o.storageKey);
      for (const d of derivatives.filter((d) => !d.purgedAt))
        await storage.remove('derivatives', d.storageKey);
    } catch {
      console.error('evidence_purge_failed');
      continue;
    }
    await runtime.transaction(async (tx) => {
      const at = new Date();
      for (const o of objects.filter((o) => !o.purgedAt))
        await tx
          .update(schema.evidenceObjects)
          .set({ purgedAt: at, purgeReason: 'abandoned_upload' })
          .where(eq(schema.evidenceObjects.id, o.id));
      for (const d of derivatives.filter((d) => !d.purgedAt))
        await tx
          .update(schema.evidenceDerivatives)
          .set({ purgedAt: at })
          .where(eq(schema.evidenceDerivatives.id, d.id));
      await tx.update(schema.evidenceItems).set({ state: 'purged' }).where(eq(schema.evidenceItems.id, id));
      await tx.insert(schema.evidenceCustodyEvents).values({
        evidenceItemId: id,
        event: 'purged',
        actorRef: ACTOR,
        details: { reason: 'abandoned_upload' },
      });
      purged += 1;
    });
  }
  return purged;
}
