import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { schema, eq } from '@blacklist/db';
import { signIn, resolveSession, type UserActor } from '@blacklist/domain';
import { createServer } from '../../../apps/api/src/server.ts';
import {
  startApplicationFixture,
  fixtureUrl,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';
import { startFakeStorage, fakeEvidenceStorage, fakeBuckets } from './fake-storage.ts';

// Phase 9b slice 2: image upload and linking (ARCHITECTURE §14.3, ADR 0004, ADR 0020).
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
const report = (evidence: unknown[]) => ({
  category: 'phishing',
  title: 'Fictional phishing report',
  subjects: [{ chain: 'ethereum', address: '0x' + 'ab'.repeat(20) }],
  narrative: 'A fictional narrative long enough to be accepted by validation.',
  incidentDate: '2026-10-01',
  txRefs: [],
  urls: [],
  evidence,
});
const file = (id: string) => ({ id, name: 'screenshot.png', type: 'image/png', size: png.length });

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return { user, actor: actor as UserActor, cookie };
}

async function setup(withStorage = true) {
  const f = await startApplicationFixture();
  const storage = await startFakeStorage();
  const app = createServer(
    f.ctx,
    readApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: fixtureUrl(f.h, 'runtime'),
      APP_ORIGIN: f.ctx.settings.origin,
      BETTER_AUTH_SECRET: f.ctx.settings.secret,
      INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
      WEBAUTHN_RP_ID: f.ctx.settings.rpId,
    }),
    false,
    undefined,
    withStorage ? fakeEvidenceStorage(storage) : null,
  );
  const upload = (body: Buffer | string, type: string, cookie?: string, origin = f.ctx.settings.origin) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/evidence/images',
      headers: { origin, 'content-type': type, ...(cookie ? { cookie } : {}) },
      payload: body,
    });
  const submit = (body: unknown, cookie: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { origin: f.ctx.settings.origin, 'content-type': 'application/json', cookie },
      payload: JSON.stringify(body),
    });
  const close = async () => {
    await app.close();
    await storage.close();
    await f.stop();
  };
  return { f, app, storage, upload, submit, close };
}

describe('Phase 9b: image evidence upload', () => {
  it('stores the untouched bytes in quarantine and records the item, object and custody event', async () => {
    const s = await setup();
    try {
      const m = await member(s.f);
      const response = await s.upload(png, 'image/png', m.cookie);
      expect(response.statusCode).toBe(200);
      const { id, state } = (response.json() as { data: { id: string; state: string } }).data;
      expect(state).toBe('processing');
      const db = s.f.ctx.runtime.db;
      const [item] = await db.select().from(schema.evidenceItems).where(eq(schema.evidenceItems.id, id));
      expect(item).toMatchObject({
        kind: 'image',
        state: 'quarantined',
        contentType: 'image/png',
        submittedByUserId: m.user.id,
        visibility: 'staff_only',
      });
      const [object] = await db
        .select()
        .from(schema.evidenceObjects)
        .where(eq(schema.evidenceObjects.evidenceItemId, id));
      expect(object).toMatchObject({
        role: 'quarantine',
        bucket: fakeBuckets.quarantine,
        sha256: createHash('sha256').update(png).digest('hex'),
        sizeBytes: png.length,
        objectVersionId: 'v-1',
      });
      expect(object?.storageKey).toMatch(new RegExp(`^quarantine/${id}/[0-9a-f-]{36}$`));
      expect(
        s.storage.objects.get(`/${fakeBuckets.quarantine}/${object?.storageKey}`)?.body.equals(png),
      ).toBe(true);
      const custody = await db
        .select()
        .from(schema.evidenceCustodyEvents)
        .where(eq(schema.evidenceCustodyEvents.evidenceItemId, id));
      expect(custody.map((c) => c.event)).toEqual(['submitted']);
      // Objects are history: never deleted, and only the purge columns can change, once.
      await expect(db.delete(schema.evidenceObjects)).rejects.toThrow();
      await expect(db.update(schema.evidenceObjects).set({ sha256: 'f'.repeat(64) })).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it('refuses anonymous, staff, wrong-origin, non-image, JSON and oversized uploads', async () => {
    const s = await setup();
    try {
      const m = await member(s.f);
      const moderator = await addAssuredStaff(s.f, 'moderator');
      expect((await s.upload(png, 'image/png')).statusCode).toBe(401);
      expect((await s.upload(png, 'image/png', moderator.headers.get('cookie') ?? '')).statusCode).toBe(403);
      expect((await s.upload(png, 'image/png', m.cookie, 'https://evil.example')).statusCode).toBe(403);
      for (const type of [
        'text/html',
        'image/svg+xml',
        'image/gif',
        'application/json',
        'application/octet-stream',
      ])
        expect((await s.upload(png, type, m.cookie)).statusCode).toBe(415);
      const big = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)]);
      expect((await s.upload(big, 'image/png', m.cookie)).statusCode).toBe(413);
      expect((await s.upload(Buffer.alloc(0), 'image/png', m.cookie)).statusCode).toBe(400);
      // JSON routes still refuse image bodies.
      expect((await s.submit(report([]), m.cookie)).statusCode).toBe(200);
      const asImage = await s.app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        headers: { origin: s.f.ctx.settings.origin, 'content-type': 'image/png', cookie: m.cookie },
        payload: png,
      });
      expect(asImage.statusCode).toBe(415);
      expect(s.storage.objects.size).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('is unavailable when image evidence is off, and stores nothing', async () => {
    const s = await setup(false);
    try {
      const m = await member(s.f);
      const response = await s.upload(png, 'image/png', m.cookie);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'evidence_unavailable' });
      const refused = await s.submit(report([file(randomUUID())]), m.cookie);
      expect(refused.json()).toMatchObject({ code: 'evidence_unavailable' });
      expect(s.storage.requests).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("links a member's own images once, and refuses other people's, unknown or reused ids alike", async () => {
    const s = await setup();
    try {
      const a = await member(s.f);
      const b = await member(s.f);
      const id = (await s.upload(png, 'image/png', a.cookie)).json().data.id as string;
      const other = (await s.upload(png, 'image/png', b.cookie)).json().data.id as string;
      const refusedBodies = [];
      for (const ids of [[other], [randomUUID()], [id, id]]) {
        const refused = await s.submit(report(ids.map(file)), a.cookie);
        expect(refused.statusCode).toBe(400);
        refusedBodies.push(refused.json().detail);
      }
      // Another member's upload is refused exactly like an unknown one.
      expect(refusedBodies[0]).toBe(refusedBodies[1]);
      const created = await s.submit(report([file(id)]), a.cookie);
      expect(created.statusCode).toBe(200);
      const links = await s.f.ctx.runtime.db
        .select()
        .from(schema.evidenceLinks)
        .where(eq(schema.evidenceLinks.evidenceItemId, id));
      expect(links).toHaveLength(1);
      expect((await s.submit(report([file(id)]), a.cookie)).statusCode).toBe(400);
      // A rejected image cannot be attached.
      const rejected = (await s.upload(png, 'image/png', a.cookie)).json().data.id as string;
      await s.f.ctx.runtime.db
        .update(schema.evidenceItems)
        .set({ state: 'rejected', rejectionReason: 'decode_failed' })
        .where(eq(schema.evidenceItems.id, rejected));
      expect((await s.submit(report([file(rejected)]), a.cookie)).statusCode).toBe(400);
    } finally {
      await s.close();
    }
  });

  it('reports a storage refusal as unavailable and logs only a fixed reason code', async () => {
    const s = await setup();
    const logged: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(...args);
    });
    try {
      const m = await member(s.f);
      s.storage.failNext(403, 'SignatureDoesNotMatch');
      const response = await s.upload(png, 'image/png', m.cookie);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'temporarily_unavailable' });
      expect(logged).toContain('storage_put_403_SignatureDoesNotMatch');
      // The error body echoed the access key id; it must never reach the logs.
      expect(JSON.stringify(logged)).not.toContain('X-Amz');
      expect(JSON.stringify(logged)).not.toContain('FAKEACCESSKEY01');
      s.storage.failNext(403);
      await s.upload(png, 'image/png', m.cookie);
      expect(logged).toContain('storage_put_403');
      const items = await s.f.ctx.runtime.db.select().from(schema.evidenceItems);
      expect(items.filter((i) => i.kind === 'image')).toHaveLength(0);
    } finally {
      spy.mockRestore();
      await s.close();
    }
  });

  it('caps unattached uploads per member', async () => {
    const s = await setup();
    try {
      const m = await member(s.f);
      for (let i = 0; i < 20; i += 1)
        expect((await s.upload(png, 'image/png', m.cookie)).statusCode).toBe(200);
      const over = await s.upload(png, 'image/png', m.cookie);
      expect(over.statusCode).toBe(429);
      expect(s.storage.objects.size).toBe(20);
    } finally {
      await s.close();
    }
  });
});
