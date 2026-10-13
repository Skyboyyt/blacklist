import Fastify from 'fastify';
import { z } from 'zod';
import type { Harness } from './database.js';
import { createAuth, validSession } from './auth.js';
import { login } from './login.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    authLevel?: 'public' | 'session';
  }
}

export async function createGateServer(h: Harness, secret: string) {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  let origin = 'http://localhost:4107';
  let auth = createAuth(h.db, secret, origin);
  const policies = new Map<string, 'public' | 'session'>();
  app.addHook('onRoute', (route) => {
    const policy: unknown = route.config?.authLevel;
    if (policy !== 'public' && policy !== 'session') throw new Error('route_policy_missing');
    for (const method of typeof route.method === 'string' ? [route.method] : route.method)
      policies.set(`${method} ${route.url}`, policy);
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== origin) {
      return reply.code(403).send({ code: 'origin_rejected' });
    }
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
  });
  app.setErrorHandler((_error, _request, reply) => reply.code(401).send({ code: 'sign_in_rejected' }));
  app.get('/probe', { config: { authLevel: 'public' } }, async () => ({ status: 'acceptance_fixture' }));
  app.post('/api/v1/auth/login', { config: { authLevel: 'public' } }, async (request, reply) => {
    const { email, password } = z.object({ email: z.email(), password: z.string() }).parse(request.body);
    const result = await login(h, auth, secret, email, password, origin);
    reply.header('Set-Cookie', result.headers.getSetCookie());
    return { status: 'signed_in' };
  });
  app.get('/api/v1/auth/session', { config: { authLevel: 'session' } }, async (request, reply) => {
    const actor = await validSession(h.db, auth, new Headers({ cookie: request.headers.cookie ?? '' }));
    if (!actor) return reply.code(401).send({ code: 'sign_in_required' });
    return { authenticated: true };
  });
  const listener = await app.listen({ host: '127.0.0.1', port: 0 });
  origin = listener.replace('127.0.0.1', 'localhost');
  auth = createAuth(h.db, secret, origin);
  return { app, auth, origin, policies };
}
