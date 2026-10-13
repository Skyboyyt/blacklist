/** Fictional grants mirror actor/session and exact-parameter binding; never real WebAuthn. */
import type { MockStore } from './store';
import { currentScenario, currentViewerKey } from './scenario';
import { sessionIdFrom } from './store';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`;
}

function key(actorId: string, cookies: string, action: string, target: string): string {
  return canonical([actorId, sessionIdFrom(cookies), currentViewerKey(cookies), action, target]);
}

export function issueGrant(
  store: MockStore,
  actorId: string,
  cookies: string,
  action: string,
  target: string,
  parameters: readonly unknown[],
  expires: number,
): void {
  store.grants.set(key(actorId, cookies, action, target), { parameters: canonical(parameters), expires });
}

export function consumeGrant(
  store: MockStore,
  actorId: string,
  cookies: string,
  action: string,
  target: string,
  parameters: readonly unknown[],
  now: number,
): boolean {
  const id = key(actorId, cookies, action, target);
  const grant = store.grants.get(id);
  store.grants.delete(id);
  return (
    currentScenario(cookies) !== 'session_expired' &&
    grant !== undefined &&
    grant.expires > now &&
    grant.parameters === canonical(parameters)
  );
}
