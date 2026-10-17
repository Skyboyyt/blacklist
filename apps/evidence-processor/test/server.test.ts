import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProcessorServer } from '../src/server.ts';
import type { StorageTarget } from '../src/urls.ts';

// A fake object store: GET serves `source`, PUT records what was uploaded.
let storage: Server;
let processor: Server;
let target: StorageTarget;
let base: string;
let source: Uint8Array;
let uploads: { path: string; type: string | undefined; body: Buffer }[];
let requests: string[];

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );

beforeAll(async () => {
  storage = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.method === 'GET') {
      response.writeHead(200);
      response.end(source);
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (c: Buffer) => chunks.push(c));
    request.on('end', () => {
      uploads.push({
        path: request.url?.split('?')[0] ?? '',
        type: request.headers['content-type'],
        body: Buffer.concat(chunks),
      });
      response.writeHead(200);
      response.end();
    });
  });
  const origin = await listen(storage);
  target = { origin, quarantineBucket: 'bl-quarantine', derivativesBucket: 'bl-derivatives' };
  processor = createProcessorServer(target);
  base = await listen(processor);
});

afterAll(() => {
  storage.close();
  processor.close();
});

beforeEach(() => {
  uploads = [];
  requests = [];
});

const signed = '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300&X-Amz-Signature=abc';
const item = randomUUID();
const job = (overrides: Partial<{ source: string; destination: string }> = {}) => ({
  source: `${target.origin}/bl-quarantine/quarantine/${item}/${randomUUID()}${signed}`,
  destination: `${target.origin}/bl-derivatives/derivative/${item}/${randomUUID()}${signed}`,
  ...overrides,
});
const post = (body: unknown, type = 'application/json') =>
  fetch(`${base}/v1/process`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: JSON.stringify(body),
  });

describe('evidence processor server', () => {
  it('downloads, sanitizes and uploads, returning the derivative hash', async () => {
    source = await sharp({ create: { width: 30, height: 10, channels: 3, background: '#000' } })
      .withExif({ IFD0: { Make: 'Phone' } })
      .jpeg()
      .toBuffer();
    const response = await post(job());
    expect(response.status).toBe(200);
    const result = (await response.json()) as Record<string, unknown>;
    expect(result).toMatchObject({ status: 'processed', format: 'jpeg', width: 30, height: 10 });
    expect(uploads).toHaveLength(1);
    const [upload] = uploads;
    expect(upload?.type).toBe('image/jpeg');
    expect(upload?.path).toMatch(/^\/bl-derivatives\/derivative\//);
    expect(result['derivativeSha256']).toBe(
      createHash('sha256')
        .update(upload?.body ?? '')
        .digest('hex'),
    );
    expect((await sharp(upload?.body).metadata()).exif).toBeUndefined();
  });

  it('reports a rejection and uploads nothing for a non-image', async () => {
    source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const response = await post(job());
    expect(await response.json()).toMatchObject({ status: 'rejected', reason: 'unsupported_type' });
    expect(uploads).toHaveLength(0);
  });

  it.each([
    ['another host', { source: `https://evil.example/bl-quarantine/quarantine/${item}/${item}${signed}` }],
    ['the wrong bucket', { source: `${'ORIGIN'}/bl-derivatives/derivative/${item}/${item}${signed}` }],
    ['an unsigned URL', { source: `${'ORIGIN'}/bl-quarantine/quarantine/${item}/${item}` }],
    ['a path outside the prefix', { source: `${'ORIGIN'}/bl-quarantine/../other/${item}/${item}${signed}` }],
    [
      'a destination in quarantine',
      { destination: `${'ORIGIN'}/bl-quarantine/quarantine/${item}/${item}${signed}` },
    ],
    [
      'credentials in the URL',
      { destination: `${'ORIGIN'}/bl-derivatives/derivative/${item}/${item}${signed}` },
    ],
  ])('refuses %s without contacting anything', async (label, overrides) => {
    const patched = Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [
        k,
        label === 'credentials in the URL'
          ? v.replace('ORIGIN', target.origin.replace('http://', 'http://user:pass@'))
          : v.replace('ORIGIN', target.origin),
      ]),
    );
    const response = await post(job(patched));
    expect(response.status).toBe(403);
    expect(requests).toHaveLength(0);
  });

  it('rejects malformed requests', async () => {
    expect((await post({ source: 'x' })).status).toBe(400);
    expect((await post({ ...job(), extra: 1 })).status).toBe(400);
    expect((await post(job(), 'text/plain')).status).toBe(415);
    expect((await post({ source: 'x'.repeat(9000), destination: 'y' })).status).toBe(413);
    expect((await fetch(`${base}/v1/other`, { method: 'POST' })).status).toBe(404);
  });

  it('answers health checks without touching storage', async () => {
    const response = await fetch(`${base}/healthz`);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(requests).toHaveLength(0);
  });
});
