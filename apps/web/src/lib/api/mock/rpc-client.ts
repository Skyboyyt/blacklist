/**
 * Browser side of the mock RPC transport (development and tests only). Each method
 * posts to the mock-only route and returns the same typed result the in-process mock
 * would. A failed request throws, so pages show their error states.
 */
import type { AdminApi, MemberApi, ModerationApi } from '../types';
import { ADMIN_METHODS, MEMBER_METHODS, MODERATION_METHODS } from './rpc-methods';

const ENDPOINT = '/api/mock/rpc';

async function call(service: string, method: string, args: readonly unknown[]): Promise<unknown> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, method, args }),
  });
  if (!response.ok) throw new Error(`Mock request failed (${response.status}).`);
  const body = (await response.json()) as { result?: unknown };
  return body.result;
}

/**
 * A plain object with one function per listed method. (Not a Proxy: a Proxy that answers
 * every property also answers `then`, and awaiting it would never resolve.)
 */
function client<T>(service: string, methods: readonly string[]): T {
  return Object.fromEntries(
    methods.map((method) => [method, (...args: unknown[]) => call(service, method, args)]),
  ) as T;
}

export const mockModerationApi = client<ModerationApi>('moderation', MODERATION_METHODS);
export const mockMemberApi = client<MemberApi>('member', MEMBER_METHODS);
export const mockAdminApi = client<AdminApi>('admin', ADMIN_METHODS);

/** Restarts this browser's demo session from the fixtures. */
export async function resetMockSession(): Promise<void> {
  await call('session', 'reset', []);
}
