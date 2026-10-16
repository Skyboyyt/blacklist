import type { FastifyInstance } from 'fastify';
import { DomainError } from '@blacklist/domain';
import { ZodError } from 'zod';
export function installErrors(app: FastifyInstance) {
  app.setErrorHandler((error, req, reply) => {
    let status = 503,
      code = 'temporarily_unavailable',
      extra: { detail?: string; currentVersion?: number } = {};
    if (error instanceof ZodError) {
      status = 400;
      code = 'invalid_request';
    } else if (error instanceof DomainError) {
      code = error.code;
      status = ['forbidden', 'not_eligible', 'stepup_required'].includes(code)
        ? 403
        : code === 'not_found'
          ? 404
          : ['conflict', 'invalid_transition', 'evidence_unavailable'].includes(code)
            ? 409
            : code === 'rate_limited'
              ? 429
              : ['invalid_credentials', 'session_expired'].includes(code)
                ? 401
                : code === 'temporarily_unavailable'
                  ? 503
                  : 400;
      if (error.retryAfterSeconds) reply.header('retry-after', error.retryAfterSeconds);
      if (error.detail !== undefined) extra = { ...extra, detail: error.detail };
      if (error.currentVersion !== undefined) extra = { ...extra, currentVersion: error.currentVersion };
    } else if (error instanceof Error && 'statusCode' in error && Number(error.statusCode) === 413) {
      status = 413;
      code = 'payload_too_large';
    }
    // Never serialize errors/causes/request objects: driver errors may contain
    // connection credentials, SQL values or provider links.
    if (status >= 500) req.log.error({ code, requestId: req.id }, 'request_failed');
    return reply
      .code(status)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: 'Request could not be completed',
        status,
        code,
        ...extra,
        requestId: req.id,
      });
  });
}
