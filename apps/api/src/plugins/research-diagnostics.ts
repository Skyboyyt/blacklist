import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '@blacklist/domain';

// Research failures are otherwise invisible: request logging is off because research
// activity is private. These lines record only the route pattern, the chain slug and the
// failure class: never the identifier, query, client address or any provider response.
const isResearch = (req: FastifyRequest) => {
  const url = req.routeOptions.url ?? '';
  return url.includes('/search') || url.includes('/addresses/') || url.includes('/transactions/');
};
const where = (req: FastifyRequest) => {
  const params = req.params as { chain?: unknown } | undefined;
  return {
    route: req.routeOptions.url,
    chain: typeof params?.chain === 'string' && /^[a-z]{1,20}$/u.test(params.chain) ? params.chain : null,
  };
};

export function installResearchDiagnostics(app: FastifyInstance) {
  app.addHook('onError', async (req, _reply, error) => {
    if (!isResearch(req)) return;
    const failure =
      error instanceof ZodError
        ? { type: 'validation', paths: error.issues.slice(0, 5).map((i) => i.path.join('.').slice(0, 80)) }
        : error instanceof DomainError
          ? { type: 'domain', code: error.code }
          : {
              type: error instanceof Error ? error.constructor.name.slice(0, 40) : 'unknown',
              sqlState:
                typeof (error as { code?: unknown }).code === 'string' &&
                /^[0-9A-Z]{5}$/u.test((error as { code: string }).code)
                  ? (error as { code: string }).code
                  : null,
            };
    req.log.warn({ ...where(req), failure }, 'research_failed');
  });
  app.addHook('onSend', async (req, _reply, payload) => {
    if (isResearch(req) && typeof payload === 'string' && payload.includes('"provider_unavailable"')) {
      const reason = /"reason":"([a-z_]{1,30})"/u.exec(payload)?.[1] ?? null;
      req.log.warn({ ...where(req), reason }, 'research_unavailable');
    }
    return payload;
  });
}
