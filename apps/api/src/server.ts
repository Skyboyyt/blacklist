import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { ApiConfig } from '@blacklist/config';
import type { IdentityContext, ResearchContext } from '@blacklist/domain';
import { installSecurity } from './plugins/security.ts';
import { installStagingAccess } from './plugins/staging-access.ts';
import { installErrors } from './plugins/errors.ts';
import { installIngressDiagnostics } from './plugins/ingress-diagnostics.ts';
import { installMailWorkerWake } from './plugins/mail-worker-wake.ts';
import { authRoutes } from './routes/auth.ts';
import { accountRoutes } from './routes/account.ts';
import { staffRoutes } from './routes/staff.ts';
import { researchRoutes } from './routes/research.ts';
import { moderationRoutes } from './routes/moderation.ts';
import { findingRoutes } from './routes/findings.ts';
export function createServer(
  ctx: IdentityContext,
  config: ApiConfig,
  logging = true,
  research?: ResearchContext,
) {
  const app = Fastify({
    bodyLimit: 65536,
    requestTimeout: 30000,
    connectionTimeout: 10000,
    trustProxy: false,
    genReqId: () => randomUUID(),
    disableRequestLogging: true,
    logger: logging
      ? {
          level: 'info',
          serializers: {
            req: () => ({}),
            res: () => ({}),
            err: () => ({ type: 'Error', message: 'internal_error', stack: '' }),
          },
          redact: ['req.headers', 'req.body', 'req.query', 'res.headers'],
        }
      : false,
  });
  installErrors(app);
  installStagingAccess(app, config);
  installSecurity(app, ctx, config);
  installIngressDiagnostics(app, config);
  installMailWorkerWake(app, config);
  authRoutes(app, ctx);
  accountRoutes(app, ctx);
  staffRoutes(app, ctx);
  moderationRoutes(app, ctx);
  findingRoutes(app, ctx);
  researchRoutes(app, research);
  app.get('/healthz', { config: { security: { auth: 'public', mutation: false } } }, async () => {
    await ctx.runtime.checkConnection();
    return { status: 'ok' };
  });
  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      { requestId: req.id, method: req.method, route: req.routeOptions.url, status: reply.statusCode },
      'request_completed',
    );
  });
  return app;
}
