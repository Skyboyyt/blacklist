import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  uploadEvidenceImage,
  processPendingEvidence,
  purgeAbandonedUploads,
  createProcessorClient,
  type EvidenceProcessor,
  type UserActor,
} from '@blacklist/domain';
import { createProcessorServer } from '../../../apps/evidence-processor/src/server.ts';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { startFakeStorage, fakeEvidenceStorage, fakeBuckets, type FakeStorage } from './fake-storage.ts';

// Phase 9b slice 3: the worker's processing loop with the REAL isolated processor
// (apps/evidence-processor, sharp) against an in-memory object store.
const prefix = 'ip4:192.0.2.90';

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return actor as UserActor;
}

async function setup() {
  const f = await startApplicationFixture();
  const fake = await startFakeStorage();
  const storage = fakeEvidenceStorage(fake);
  const processorServer: Server = createProcessorServer({
    origin: fake.endpoint,
    quarantineBucket: fakeBuckets.quarantine,
    derivativesBucket: fakeBuckets.derivatives,
  });
  await new Promise<void>((resolve) => processorServer.listen(0, '127.0.0.1', resolve));
  const processor = createProcessorClient(
    `http://127.0.0.1:${(processorServer.address() as AddressInfo).port}`,
  );
  const actor = await member(f);
  const upload = async (bytes: Buffer, contentType = 'image/png') =>
    (await uploadEvidenceImage(f.ctx, storage, actor, { bytes: new Uint8Array(bytes), contentType }, prefix))
      .id;
  const item = async (id: string) => {
    const [row] = await f.ctx.runtime.db
      .select()
      .from(schema.evidenceItems)
      .where(eq(schema.evidenceItems.id, id));
    if (!row) throw new Error('item_missing');
    return row;
  };
  const custody = async (id: string) =>
    (
      await f.ctx.runtime.db
        .select()
        .from(schema.evidenceCustodyEvents)
        .where(eq(schema.evidenceCustodyEvents.evidenceItemId, id))
    ).map((e) => e.event);
  const close = async () => {
    await new Promise<void>((resolve) => processorServer.close(() => resolve()));
    await fake.close();
    await f.stop();
  };
  return { f, fake, storage, processor, actor, upload, item, custody, close };
}

const photo = () =>
  sharp({ create: { width: 48, height: 24, channels: 3, background: '#2050a0' } })
    .withExif({ IFD0: { Make: 'Phone' }, IFD3: { GPSLatitudeRef: 'N' } })
    .jpeg()
    .toBuffer();
const objectAt = (fake: FakeStorage, bucket: string, key: string) =>
  fake.objects.get(`/${bucket}/${key}`)?.body;

describe('Phase 9b: evidence processing', () => {
  it('sanitizes an upload, keeps the original immutable copy and drops the quarantine copy', async () => {
    const s = await setup();
    try {
      const bytes = await photo();
      const id = await s.upload(bytes, 'image/jpeg');
      expect(await processPendingEvidence(s.f.ctx.runtime, s.storage, s.processor)).toBe(1);
      expect(await s.item(id)).toMatchObject({
        state: 'available',
        nextAttemptAt: null,
        processingAttempts: 1,
      });
      const objects = await s.f.ctx.runtime.db
        .select()
        .from(schema.evidenceObjects)
        .where(eq(schema.evidenceObjects.evidenceItemId, id));
      const quarantine = objects.find((o) => o.role === 'quarantine');
      const original = objects.find((o) => o.role === 'original');
      expect(quarantine).toMatchObject({ purgeReason: 'promoted_to_original' });
      expect(objectAt(s.fake, fakeBuckets.quarantine, quarantine?.storageKey ?? '')).toBeUndefined();
      expect(original).toMatchObject({ bucket: fakeBuckets.evidence, sha256: quarantine?.sha256 });
      expect(objectAt(s.fake, fakeBuckets.evidence, original?.storageKey ?? '')?.equals(bytes)).toBe(true);
      const [derivative] = await s.f.ctx.runtime.db
        .select()
        .from(schema.evidenceDerivatives)
        .where(eq(schema.evidenceDerivatives.evidenceItemId, id));
      expect(derivative).toMatchObject({ kind: 'sanitized_image', format: 'jpeg', width: 48, height: 24 });
      const stored = objectAt(s.fake, fakeBuckets.derivatives, derivative?.storageKey ?? '');
      expect(stored).toBeDefined();
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(await s.custody(id)).toEqual(['submitted', 'processed']);
      // Nothing left to do.
      expect(await processPendingEvidence(s.f.ctx.runtime, s.storage, s.processor)).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('rejects a file that is not really an image, with a reason and no derivative', async () => {
    const s = await setup();
    try {
      const id = await s.upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));
      await processPendingEvidence(s.f.ctx.runtime, s.storage, s.processor);
      expect(await s.item(id)).toMatchObject({ state: 'rejected', rejectionReason: 'unsupported_type' });
      expect(await s.custody(id)).toEqual(['submitted', 'rejected']);
      expect([...s.fake.objects.keys()].some((k) => k.startsWith(`/${fakeBuckets.derivatives}/`))).toBe(
        false,
      );
    } finally {
      await s.close();
    }
  });

  it('rejects a quarantine object whose bytes changed after upload', async () => {
    const s = await setup();
    try {
      const id = await s.upload(await photo(), 'image/jpeg');
      for (const value of s.fake.objects.values()) value.body = Buffer.concat([value.body, Buffer.from('x')]);
      await processPendingEvidence(s.f.ctx.runtime, s.storage, s.processor);
      expect(await s.item(id)).toMatchObject({ state: 'rejected', rejectionReason: 'integrity_failed' });
    } finally {
      await s.close();
    }
  });

  it('retries later when the processor is unreachable, and gives up after five attempts', async () => {
    const s = await setup();
    try {
      const id = await s.upload(await photo(), 'image/jpeg');
      const down = createProcessorClient('http://127.0.0.1:1');
      await processPendingEvidence(s.f.ctx.runtime, s.storage, down);
      const after = await s.item(id);
      expect(after).toMatchObject({ state: 'processing', processingAttempts: 1 });
      expect(after.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
      // Not due yet: nothing runs.
      expect(await processPendingEvidence(s.f.ctx.runtime, s.storage, down)).toBe(0);
      await s.f.ctx.runtime.db
        .update(schema.evidenceItems)
        .set({ processingAttempts: 5, nextAttemptAt: new Date(0) })
        .where(eq(schema.evidenceItems.id, id));
      await processPendingEvidence(s.f.ctx.runtime, s.storage, down);
      expect(await s.item(id)).toMatchObject({ state: 'rejected', rejectionReason: 'processing_failed' });
    } finally {
      await s.close();
    }
  });

  it('does not trust the processor: a wrong hash or format is rejected and the derivative removed', async () => {
    const s = await setup();
    try {
      const id = await s.upload(await photo(), 'image/jpeg');
      const liar: EvidenceProcessor = {
        async process(job) {
          const real = await s.processor.process(job);
          return real.status === 'processed' ? { ...real, derivativeSha256: '0'.repeat(64) } : real;
        },
      };
      await processPendingEvidence(s.f.ctx.runtime, s.storage, liar);
      expect(await s.item(id)).toMatchObject({ state: 'rejected', rejectionReason: 'derivative_mismatch' });
      expect([...s.fake.objects.keys()].some((k) => k.startsWith(`/${fakeBuckets.derivatives}/`))).toBe(
        false,
      );
      const formatLiar: EvidenceProcessor = {
        async process(job) {
          const real = await s.processor.process(job);
          return real.status === 'processed' ? { ...real, format: 'png' } : real;
        },
      };
      const second = await s.upload(await photo(), 'image/jpeg');
      await processPendingEvidence(s.f.ctx.runtime, s.storage, formatLiar);
      expect(await s.item(second)).toMatchObject({
        state: 'rejected',
        rejectionReason: 'derivative_mismatch',
      });
    } finally {
      await s.close();
    }
  });

  it('never resurrects an item whose state changed while it was being processed', async () => {
    const s = await setup();
    try {
      const id = await s.upload(await photo(), 'image/jpeg');
      const interrupted: EvidenceProcessor = {
        async process(job) {
          await s.f.ctx.runtime.db
            .update(schema.evidenceItems)
            .set({ state: 'purge_requested', nextAttemptAt: null })
            .where(eq(schema.evidenceItems.id, id));
          return s.processor.process(job);
        },
      };
      await processPendingEvidence(s.f.ctx.runtime, s.storage, interrupted);
      expect(await s.item(id)).toMatchObject({ state: 'purge_requested' });
      expect(await s.custody(id)).toEqual(['submitted']);
    } finally {
      await s.close();
    }
  });

  it('purges uploads never attached within seven days, but not attached or held ones', async () => {
    const s = await setup();
    try {
      const abandoned = await s.upload(await photo(), 'image/jpeg');
      const held = await s.upload(await photo(), 'image/jpeg');
      await processPendingEvidence(s.f.ctx.runtime, s.storage, s.processor);
      const db = s.f.ctx.runtime.db;
      const old = new Date(Date.now() - 8 * 86400_000);
      await db
        .update(schema.evidenceItems)
        .set({ submittedAt: old })
        .where(eq(schema.evidenceItems.id, abandoned));
      await db
        .update(schema.evidenceItems)
        .set({ submittedAt: old, legalHold: true })
        .where(eq(schema.evidenceItems.id, held));
      const before = s.fake.objects.size;
      expect(await purgeAbandonedUploads(s.f.ctx.runtime, s.storage)).toBe(1);
      expect(await s.item(abandoned)).toMatchObject({ state: 'purged' });
      expect(await s.item(held)).toMatchObject({ state: 'available' });
      expect(await s.custody(abandoned)).toEqual(['submitted', 'processed', 'purged']);
      // Original and derivative of the abandoned item are gone; the held item's remain.
      expect(s.fake.objects.size).toBe(before - 2);
      const derivatives = await db
        .select()
        .from(schema.evidenceDerivatives)
        .where(eq(schema.evidenceDerivatives.evidenceItemId, abandoned));
      expect(derivatives[0]?.purgedAt).not.toBeNull();
      expect(await purgeAbandonedUploads(s.f.ctx.runtime, s.storage)).toBe(0);
    } finally {
      await s.close();
    }
  });
});
