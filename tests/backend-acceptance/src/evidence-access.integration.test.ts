import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { schema, eq } from '@blacklist/db';
import { signIn, processPendingEvidence, createProcessorClient } from '@blacklist/domain';
import { createServer } from '../../../apps/api/src/server.ts';
import { createProcessorServer } from '../../../apps/evidence-processor/src/server.ts';
import { startApplicationFixture, fixtureUrl, syntheticPassword } from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';
import { startFakeStorage, fakeEvidenceStorage, fakeBuckets } from './fake-storage.ts';

// Phase 9b slice 4: staff see images only as sanitized derivatives, by short-lived
// download links whose issuance is recorded (ARCHITECTURE §14.4, ADR 0004 §6).
describe('Phase 9b: evidence access', () => {
  it('end to end: upload, attach, process, then a moderator downloads only the cleaned copy', async () => {
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
      storage,
    );
    const call = (
      method: 'GET' | 'POST',
      url: string,
      cookie: string,
      body?: unknown,
      type = 'application/json',
    ) =>
      app.inject({
        method,
        url,
        headers: {
          origin: f.ctx.settings.origin,
          cookie,
          ...(body === undefined ? {} : { 'content-type': type }),
        },
        ...(body === undefined
          ? {}
          : { payload: type === 'application/json' ? JSON.stringify(body) : (body as Buffer) }),
      });
    try {
      const user = await f.addUser();
      const login = await signIn(f.ctx, user.email, syntheticPassword);
      const member = login.cookies.map((c) => c.split(';')[0]).join('; ');
      const moderator = (await addAssuredStaff(f, 'moderator')).headers.get('cookie') ?? '';
      const reviewer = (await addAssuredStaff(f, 'appeal_reviewer')).headers.get('cookie') ?? '';

      const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#808080' } })
        .withExif({ IFD3: { GPSLatitudeRef: 'N' } })
        .jpeg()
        .toBuffer();
      const imageId = (await call('POST', '/api/v1/evidence/images', member, jpeg, 'image/jpeg')).json().data
        .id as string;
      const created = await call('POST', '/api/v1/reports', member, {
        category: 'phishing',
        title: 'Fictional phishing report',
        subjects: [{ chain: 'ethereum', address: '0x' + 'ab'.repeat(20) }],
        narrative: 'A fictional narrative long enough to be accepted by validation.',
        incidentDate: '2026-10-01',
        txRefs: [],
        urls: [],
        evidence: [{ id: imageId, name: 'shot.jpg', type: 'image/jpeg', size: jpeg.length }],
      });
      const caseId = created.json().data.id as string;

      // Before processing: staff see it as being checked, with no derivative and no link.
      let detail = (await call('GET', `/api/v1/mod/cases/${caseId}`, moderator)).json().data;
      expect(detail.evidence).toContainEqual(
        expect.objectContaining({ id: imageId, kind: 'image', state: 'quarantined', derivative: null }),
      );
      expect((await call('POST', `/api/v1/mod/evidence/${imageId}/link`, moderator, {})).statusCode).toBe(
        404,
      );

      await processPendingEvidence(f.ctx.runtime, storage, processor);
      detail = (await call('GET', `/api/v1/mod/cases/${caseId}`, moderator)).json().data;
      expect(detail.evidence).toContainEqual(
        expect.objectContaining({
          id: imageId,
          kind: 'image',
          state: 'available',
          stateNote: null,
          derivative: { width: 40, height: 30 },
        }),
      );
      const own = (await call('GET', `/api/v1/me/submissions/${caseId}`, member)).json().data;
      expect(own.evidenceNames).toEqual(['Image 1: received']);

      const issued = await call('POST', `/api/v1/mod/evidence/${imageId}/link`, moderator, {});
      expect(issued.statusCode).toBe(200);
      const { url, expiresAt } = issued.json().data as { url: string; expiresAt: string };
      const link = new URL(url);
      expect(link.origin).toBe(fake.endpoint);
      expect(link.pathname.startsWith(`/${fakeBuckets.derivatives}/derivative/${imageId}/`)).toBe(true);
      expect(link.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(link.searchParams.get('response-content-disposition')).toBe(
        `attachment; filename="evidence-${imageId}.jpg"`,
      );
      expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(300_000);
      // The link serves the cleaned copy: no metadata.
      const downloaded = Buffer.from(await (await fetch(url)).arrayBuffer());
      expect((await sharp(downloaded).metadata()).exif).toBeUndefined();
      const custody = await f.ctx.runtime.db
        .select()
        .from(schema.evidenceCustodyEvents)
        .where(eq(schema.evidenceCustodyEvents.evidenceItemId, imageId));
      expect(custody.map((c) => c.event)).toEqual(['submitted', 'processed', 'derivative_link_issued']);

      // Members, appeal reviewers, unknown ids and other origins get nothing.
      expect((await call('POST', `/api/v1/mod/evidence/${imageId}/link`, member, {})).statusCode).toBe(403);
      expect((await call('POST', `/api/v1/mod/evidence/${imageId}/link`, reviewer, {})).statusCode).toBe(404);
      expect(
        (await call('POST', `/api/v1/mod/evidence/${randomUUID()}/link`, moderator, {})).statusCode,
      ).toBe(404);
      const crossSite = await app.inject({
        method: 'POST',
        url: `/api/v1/mod/evidence/${imageId}/link`,
        headers: { origin: 'https://evil.example', cookie: moderator, 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(crossSite.statusCode).toBe(403);
      // An image never attached to a report has no staff link either.
      const loose = (await call('POST', '/api/v1/evidence/images', member, jpeg, 'image/jpeg')).json().data
        .id as string;
      await processPendingEvidence(f.ctx.runtime, storage, processor);
      expect((await call('POST', `/api/v1/mod/evidence/${loose}/link`, moderator, {})).statusCode).toBe(404);
    } finally {
      await app.close();
      await new Promise<void>((resolve) => processorServer.close(() => resolve()));
      await fake.close();
      await f.stop();
    }
  });
});
