import { randomUUID, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  resolveSession,
  hasPermission,
  isPermission,
  ipPrefix,
  type IdentityContext,
  type UserActor,
  type Permission,
} from '@blacklist/domain';
import type { ApiConfig } from '@blacklist/config';

export type RouteSecurity = {
  auth: 'public' | 'authenticated' | 'member' | 'staff_pending' | 'staff' | 'internal';
  permission?: Permission;
  mutation: boolean;
};
declare module 'fastify' {
  interface FastifyInstance {
    authorizationMatrix: readonly { method: string; path: string; policy: RouteSecurity }[];
  }
  interface FastifyContextConfig {
    security?: RouteSecurity;
  }
  interface FastifyRequest {
    actor: UserActor | null;
    clientPrefix: string;
  }
}
const safe = new Set(['GET', 'HEAD', 'OPTIONS']);
export function requestHeaders(request: FastifyRequest) {
  const headers = new Headers();
  // The only client auth input forwarded to Better Auth is its signed cookie.
  if (request.headers.cookie) headers.set('cookie', request.headers.cookie);
  return headers;
}
const equalSecret = (value: unknown, secret: string) =>
  typeof value === 'string' &&
  Buffer.byteLength(value) === Buffer.byteLength(secret) &&
  timingSafeEqual(Buffer.from(value), Buffer.from(secret));
export function installSecurity(app: FastifyInstance, ctx: IdentityContext, config: ApiConfig) {
  const matrix: Array<{ method: string; path: string; policy: RouteSecurity }> = [];
  app.decorate('authorizationMatrix', matrix);
  const proxies = new BlockList();
  for (const cidr of config.TRUSTED_PROXY_CIDRS.split(',').filter(Boolean)) {
    const [ip, bits] = cidr.split('/');
    if (ip && bits) proxies.addSubnet(ip, Number(bits), isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  }
  app.decorateRequest('actor', null);
  app.decorateRequest('clientPrefix', '');
  app.addHook('onRoute', (route) => {
    const policy = route.config?.security;
    if (!policy) throw new Error('route_missing_authorization_policy');
    if (!['public', 'authenticated', 'member', 'staff_pending', 'staff', 'internal'].includes(policy.auth))
      throw new Error('route_unknown_authorization_level');
    if (policy.permission && !isPermission(policy.permission)) throw new Error('route_unknown_permission');
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) matrix.push({ method, path: route.url, policy: { ...policy } });
    if (methods.some((method) => safe.has(method) === policy.mutation))
      throw new Error('unsafe_method_policy');
    if (policy.auth === 'internal' && methods.some((m) => m !== 'GET' && m !== 'HEAD'))
      throw new Error('internal_mutation_forbidden');
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id || randomUUID());
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    if (!safe.has(req.method)) {
      if (req.headers.origin !== config.APP_ORIGIN)
        return reply.code(403).type('application/problem+json').send({
          type: 'about:blank',
          title: 'Request rejected',
          status: 403,
          code: 'origin_rejected',
          requestId: req.id,
        });
      if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
        return reply.code(415).send({ code: 'json_required' });
    }
    const raw = req.raw.socket.remoteAddress ?? '';
    const family = isIP(raw);
    const trusted = !!family && proxies.check(raw, family === 4 ? 'ipv4' : 'ipv6');
    const policy = req.routeOptions.config.security;
    const internal = equalSecret(req.headers['x-bl-internal-token'], config.INTERNAL_API_TOKEN);
    if (policy?.auth === 'internal' && (!trusted || !internal))
      return reply.code(404).send({ code: 'not_found' });
    // Ordinary requests never trust client-injected forwarding headers.
    // A configured proxy supplies one canonical IP; multi-hop lists are rejected.
    const forwarded = trusted ? req.headers['x-forwarded-for'] : undefined;
    const ssr = policy?.auth === 'internal' && internal ? req.headers['x-bl-client-ip'] : undefined;
    const candidate = ssr ?? forwarded;
    const address = typeof candidate === 'string' && isIP(candidate) ? candidate : raw;
    req.clientPrefix = ipPrefix(address);
    if (!policy) return reply.code(404).send({ code: 'not_found' });
    req.actor = await resolveSession(
      ctx.runtime,
      ctx.auth,
      requestHeaders(req),
      policy.auth === 'staff_pending',
    );
    if (policy.auth === 'public' || policy.auth === 'internal') return;
    if (!req.actor) return reply.code(401).send({ code: 'session_expired' });
    if (
      (policy.auth === 'member' && req.actor.accountKind !== 'member') ||
      (policy.auth === 'staff_pending' && req.actor.accountKind !== 'staff') ||
      (policy.auth === 'staff' && (!req.actor.staffAssured || req.actor.accountKind !== 'staff')) ||
      (policy.permission && !hasPermission(req.actor, policy.permission))
    )
      return reply.code(403).send({ code: 'forbidden' });
  });
}
