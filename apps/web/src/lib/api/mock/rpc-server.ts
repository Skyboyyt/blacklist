/**
 * Mock RPC endpoint handler (development and tests only; never in production builds:
 * the route returns 404 outside mock mode and this module is replaced by a stub).
 *
 * Browser components call the shared demo store through here, so their actions and the
 * server-rendered public pages see the same data. It accepts only same-origin JSON
 * requests naming an allowlisted service method. It is NOT an API: there is no real
 * authentication, and the role comes from the demo viewer cookie.
 */
import { createMockMemberApi } from './member-api';
import { createMockModerationApi } from './moderation-api';
import { MEMBER_METHODS, MODERATION_METHODS } from './rpc-methods';
import { resetStore, sessionIdFrom, storeFor } from './store';

type RpcCall =
  | { readonly service: 'moderation' | 'member'; readonly method: string; readonly args: readonly unknown[] }
  | { readonly service: 'session'; readonly method: 'reset'; readonly args: readonly unknown[] };

const ALLOWED: Readonly<Partial<Record<string, readonly string[]>>> = {
  moderation: MODERATION_METHODS,
  member: MEMBER_METHODS,
  session: ['reset'],
};

/** Accepts only `{ service, method, args }` naming an allowlisted method, with at most 4 arguments. */
function parseCall(body: unknown): RpcCall | null {
  if (typeof body !== 'object' || body === null) return null;
  const { service, method, args } = body as Record<string, unknown>;
  if (typeof service !== 'string' || typeof method !== 'string' || !Array.isArray(args) || args.length > 4)
    return null;
  if (!ALLOWED[service]?.includes(method)) return null;
  if (Object.keys(body).length !== 3) return null;
  return service === 'session'
    ? { service, method: 'reset', args }
    : { service: service as 'moderation' | 'member', method, args };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

type Callable = (...args: unknown[]) => Promise<unknown>;

export async function handleMockRpc(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin) return json({ error: 'cross_origin' }, 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const call = parseCall(body);
  if (!call) return json({ error: 'invalid_request' }, 400);
  const cookieHeader = request.headers.get('cookie') ?? '';
  const sessionId = sessionIdFrom(cookieHeader);
  if (call.service === 'session') {
    resetStore(sessionId);
    return json({ result: null });
  }
  const store = storeFor(sessionId);
  const options = { cookies: () => cookieHeader, store };
  const service =
    call.service === 'moderation' ? createMockModerationApi(options) : createMockMemberApi(options);
  try {
    const method = (service as unknown as Record<string, Callable>)[call.method];
    if (!method) return json({ error: 'unknown_method' }, 400);
    return json({ result: await method(...call.args) });
  } catch {
    return json({ error: 'mock_failure' }, 500);
  }
}
