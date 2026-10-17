import { createServer, type IncomingMessage, type Server } from 'node:http';
import { z } from 'zod';
import { processJob } from './process.ts';
import type { StorageTarget } from './urls.ts';

const MAX_BODY_BYTES = 8 * 1024;
const jobSchema = z.strictObject({ source: z.string().max(4096), destination: z.string().max(4096) });

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Two routes: `GET /healthz` and `POST /v1/process`. One job at a time. */
export function createProcessorServer(target: StorageTarget): Server {
  let busy = false;
  return createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    const path = request.url?.split('?')[0];
    if ((request.method === 'GET' || request.method === 'HEAD') && path === '/healthz')
      return send(200, { status: 'ok' });
    if (request.method !== 'POST' || path !== '/v1/process') return send(404, { error: 'not_found' });
    if (!request.headers['content-type']?.startsWith('application/json'))
      return send(415, { error: 'unsupported_media_type' });
    if (busy) return send(503, { error: 'busy' });
    busy = true;
    void (async () => {
      try {
        const raw = await readBody(request);
        if (raw === null) return send(413, { error: 'too_large' });
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return send(400, { error: 'invalid_request' });
        }
        const job = jobSchema.safeParse(parsed);
        if (!job.success) return send(400, { error: 'invalid_request' });
        const result = await processJob(job.data, target);
        if (result === 'forbidden') return send(403, { error: 'forbidden' });
        return send(200, result);
      } catch {
        return send(500, { error: 'internal' });
      } finally {
        busy = false;
      }
    })();
  });
}
