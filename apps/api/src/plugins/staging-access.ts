import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '@blacklist/config';

/** Supplemental staging ingress restriction. Session/Origin/domain policy still applies. */
export function installStagingAccess(app: FastifyInstance, config: ApiConfig) {
  if (config.DEPLOYMENT_ENV !== 'staging') return;
  const secret = config.STAGING_ACCESS_TOKEN;
  if (!secret) throw new Error('staging_access_configuration_invalid');
  app.addHook('onRequest', async (request, reply) => {
    // Render needs a public, read-only liveness probe. No account/DB data is returned.
    if ((request.method === 'GET' || request.method === 'HEAD') && request.url.split('?')[0] === '/healthz')
      return;
    const supplied = request.headers['x-blacklist-staging-access'];
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
    ) {
      reply.header('cache-control', 'no-store');
      reply.header('referrer-policy', 'no-referrer');
      return reply.code(404).send({ code: 'not_found' });
    }
  });
}
