import { createHash } from 'node:crypto';
import { MAX_INPUT_BYTES, PROCESSOR_VERSION, TRANSFER_TIMEOUT_MS, type RejectionReason } from './limits.ts';
import { sanitize } from './sanitize.ts';
import { allowedDestination, allowedSource, type StorageTarget } from './urls.ts';

export type ProcessResult =
  | {
      status: 'processed';
      format: 'png' | 'jpeg' | 'webp';
      width: number;
      height: number;
      sizeBytes: number;
      derivativeSha256: string;
      processorVersion: string;
    }
  | { status: 'rejected'; reason: RejectionReason; processorVersion: string };

const CONTENT_TYPE = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

async function download(url: string): Promise<Uint8Array | 'too_large' | null> {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok || !response.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > MAX_INPUT_BYTES) {
        await response.body.cancel().catch(() => undefined);
        return 'too_large';
      }
      chunks.push(chunk);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

/** One job: our quarantine object in, a sanitized derivative out. Callers validate shape. */
export async function processJob(
  job: { source: string; destination: string },
  target: StorageTarget,
): Promise<ProcessResult | 'forbidden'> {
  if (!allowedSource(job.source, target) || !allowedDestination(job.destination, target)) return 'forbidden';
  const reject = (reason: RejectionReason) =>
    ({ status: 'rejected', reason, processorVersion: PROCESSOR_VERSION }) as const;
  const input = await download(job.source);
  if (input === null) return reject('source_unavailable');
  if (input === 'too_large') return reject('too_large');
  const result = await sanitize(input);
  if (!result.ok) return reject(result.reason);
  const uploaded = await fetch(job.destination, {
    method: 'PUT',
    body: result.bytes,
    headers: { 'content-type': CONTENT_TYPE[result.format] },
    redirect: 'error',
    signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
  }).catch(() => null);
  if (!uploaded?.ok) return reject('upload_failed');
  return {
    status: 'processed',
    format: result.format,
    width: result.width,
    height: result.height,
    sizeBytes: result.bytes.length,
    derivativeSha256: createHash('sha256').update(result.bytes).digest('hex'),
    processorVersion: PROCESSOR_VERSION,
  };
}
