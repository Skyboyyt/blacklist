import { createServer, type Server } from 'node:http';

/** Optional status-only listener for a separate staging web-hosted worker. */
export async function startWorkerHealth(probe: () => Promise<void>, port: number): Promise<Server> {
  const server = createServer({ requestTimeout: 15000, headersTimeout: 5000 }, (request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    if (
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      request.url?.split('?')[0] !== '/healthz'
    ) {
      response.statusCode = 404;
      response.end('{"code":"not_found"}');
      return;
    }
    void probe().then(
      () => {
        response.statusCode = 200;
        response.end(request.method === 'HEAD' ? undefined : '{"status":"ok"}');
      },
      () => {
        response.statusCode = 503;
        response.end(request.method === 'HEAD' ? undefined : '{"status":"unavailable"}');
      },
    );
  });
  await new Promise<void>((resolve, reject) => {
    const failure = () => reject(new Error('worker_health_start_failed'));
    server.once('error', failure);
    server.listen({ host: '0.0.0.0', port }, () => {
      server.off('error', failure);
      resolve();
    });
  });
  server.on('error', () => console.error('worker_health_failed'));
  return server;
}

export async function closeWorkerHealth(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(new Error('worker_health_shutdown_failed')) : resolve()));
  });
}
