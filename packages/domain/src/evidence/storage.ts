import { randomUUID } from 'node:crypto';
import type { EvidenceStorageConfig } from '@blacklist/config';
import { presign } from './signer.ts';

// S3-compatible object storage for evidence (ARCHITECTURE §14.3, §30). A thin client
// with no evidence rules: presigned requests over fetch, path-style URLs, bounded reads.

export type BucketRole = 'quarantine' | 'evidence' | 'derivatives';
const TIMEOUT_MS = 30_000;

export interface EvidenceStorage {
  readonly endpoint: string;
  bucket(role: BucketRole): string;
  /** A new key under `prefix/<itemId>/<random>`, the shape the processor accepts. */
  newKey(prefix: 'quarantine' | 'original' | 'derivative', itemId: string): string;
  presign(
    method: 'GET' | 'PUT' | 'DELETE',
    role: BucketRole,
    key: string,
    expiresSeconds: number,
    query?: Readonly<Record<string, string>>,
  ): string;
  put(
    role: BucketRole,
    key: string,
    bytes: Uint8Array<ArrayBuffer>,
    contentType: string,
  ): Promise<{ versionId: string | null }>;
  /** The object's bytes, or null if it is missing or larger than `maxBytes`. */
  get(role: BucketRole, key: string, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null>;
  remove(role: BucketRole, key: string): Promise<void>;
}

export class StorageError extends Error {}

/**
 * A failed storage response as a fixed code, e.g. `storage_put_403_SignatureDoesNotMatch`.
 * Only the S3 `<Code>` word is kept: error bodies can also echo the canonical request,
 * which names the access key id, so nothing else from the body is ever used.
 */
async function failure(operation: string, response: Response) {
  const body = await response.text().catch(() => '');
  const code = /<Code>([A-Za-z]{1,64})<\/Code>/.exec(body.slice(0, 4096))?.[1];
  return new StorageError(`storage_${operation}_${response.status}${code ? `_${code}` : ''}`);
}

export function createEvidenceStorage(
  config: EvidenceStorageConfig,
  clock = () => new Date(),
): EvidenceStorage {
  const bucket = (role: BucketRole) => config.buckets[role];
  const sign: EvidenceStorage['presign'] = (method, role, key, expiresSeconds, query) =>
    presign(config, {
      method,
      url: `${config.endpoint}/${bucket(role)}/${key}`,
      expiresSeconds,
      now: clock(),
      ...(query ? { query } : {}),
    });
  const call = async (url: string, init: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {
      throw new StorageError('storage_unreachable');
    });
    return response;
  };
  return {
    endpoint: config.endpoint,
    bucket,
    newKey: (prefix, itemId) => `${prefix}/${itemId}/${randomUUID()}`,
    presign: sign,
    async put(role, key, bytes, contentType) {
      const response = await call(sign('PUT', role, key, 300), {
        method: 'PUT',
        body: bytes,
        headers: { 'content-type': contentType },
      });
      if (!response.ok) throw await failure('put', response);
      await response.body?.cancel();
      return { versionId: response.headers.get('x-amz-version-id') };
    },
    async get(role, key, maxBytes) {
      const response = await call(sign('GET', role, key, 300), { method: 'GET' });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok || !response.body) throw await failure('get', response);
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > maxBytes) {
          await response.body.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(chunk);
      }
      const out = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
      }
      return out;
    },
    async remove(role, key) {
      const response = await call(sign('DELETE', role, key, 300), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw await failure('delete', response);
      await response.body?.cancel();
    },
  };
}
