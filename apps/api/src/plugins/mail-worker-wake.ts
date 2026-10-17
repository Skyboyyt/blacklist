import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '@blacklist/config';

/**
 * A bounded liveness request; queued work and the worker's delivery protocol remain
 * authoritative. Sent after accepted registration and reset requests (ADR 0017) and after
 * an accepted evidence upload, which the worker processes (ADR 0020).
 */
const WAKE_ROUTES: Readonly<Record<string, number>> = {
  '/api/v1/auth/register/start': 202,
  '/api/v1/auth/password/forgot': 202,
  '/api/v1/evidence/images': 200,
};
export function installMailWorkerWake(app: FastifyInstance, config: ApiConfig) {
  const target = config.MAIL_WORKER_HEALTH_URL;
  if (!target) return;
  let pending: AbortController | undefined;
  app.addHook('onResponse', (request, reply, done) => {
    if (
      pending ||
      request.method !== 'POST' ||
      reply.statusCode !== WAKE_ROUTES[request.routeOptions.url ?? '']
    ) {
      done();
      return;
    }
    const controller = new AbortController();
    pending = controller;
    void fetch(target, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
    })
      .then(async (response) => {
        await response.body?.cancel();
        if (!response.ok) app.log.warn({ code: 'mail_worker_wake_unavailable' }, 'mail_worker_wake');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          app.log.warn({ code: 'mail_worker_wake_unavailable' }, 'mail_worker_wake');
      })
      .finally(() => {
        if (pending === controller) pending = undefined;
      });
    // Response is already sent; never delay the generic acceptance on worker availability.
    done();
  });
  app.addHook('onClose', async () => {
    pending?.abort();
  });
}
