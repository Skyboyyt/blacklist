import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createEvidenceStorage } from '@blacklist/domain';

// An in-memory stand-in for S3-compatible storage. Docker Hub (MinIO) is not reachable
// from the test environment, so signature maths is checked against AWS's published
// example (evidence-signer.test.ts) and against real storage in the staging check.
// This server only checks that every request carries a presigned query for our key.

export interface FakeStorage {
  readonly endpoint: string;
  readonly objects: Map<string, { body: Buffer; type: string | undefined }>;
  readonly requests: string[];
  failNext(status: number): void;
  close(): Promise<void>;
}

export const fakeBuckets = {
  quarantine: 'bl-quarantine',
  evidence: 'bl-evidence',
  derivatives: 'bl-derivatives',
};
export const fakeCredentials = {
  region: 'us-east-1',
  accessKeyId: 'FAKEACCESSKEY01',
  secretAccessKey: 'fakeSecretAccessKeyForTestsOnly0',
};

export async function startFakeStorage(): Promise<FakeStorage> {
  const objects = new Map<string, { body: Buffer; type: string | undefined }>();
  const requests: string[] = [];
  let failure: number | undefined;
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://storage.invalid');
    requests.push(`${request.method} ${url.pathname}`);
    const signed =
      url.searchParams.get('X-Amz-Credential')?.startsWith(`${fakeCredentials.accessKeyId}/`) &&
      /^[0-9a-f]{64}$/.test(url.searchParams.get('X-Amz-Signature') ?? '');
    if (!signed) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (failure) {
      response.writeHead(failure);
      response.end();
      failure = undefined;
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (c: Buffer) => chunks.push(c));
    request.on('end', () => {
      if (request.method === 'PUT') {
        objects.set(url.pathname, { body: Buffer.concat(chunks), type: request.headers['content-type'] });
        response.writeHead(200, { 'x-amz-version-id': `v-${objects.size}` });
        response.end();
      } else if (request.method === 'GET') {
        const object = objects.get(url.pathname);
        response.writeHead(object ? 200 : 404);
        response.end(object?.body);
      } else if (request.method === 'DELETE') {
        objects.delete(url.pathname);
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(405);
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    objects,
    requests,
    failNext: (status) => {
      failure = status;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export const fakeEvidenceStorage = (fake: FakeStorage) =>
  createEvidenceStorage({ endpoint: fake.endpoint, ...fakeCredentials, buckets: fakeBuckets });
