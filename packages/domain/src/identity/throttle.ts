import { isIP } from 'node:net';
import { schema, eq, sql, type DatabaseRuntime } from '@blacklist/db';
import { digest } from '../shared/crypto.ts';
import { DomainError } from '../shared/errors.ts';

export interface HumanVerifier {
  verify(response: string, ipPrefix: string): Promise<'verified' | 'rejected' | 'unavailable'>;
}
export const unavailableHumanVerifier: HumanVerifier = { verify: async () => 'unavailable' };
export function ipPrefix(ip: string): string {
  if (isIP(ip) === 4) return `ip4:${ip}`;
  if (isIP(ip) !== 6) throw new Error('invalid_client_ip');
  // Canonical expansion; mapped IPv4 uses the same IPv4 bucket.
  const host = new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  const [left = '', right = ''] = host.split('::');
  const a = left ? left.split(':') : [];
  const b = right ? right.split(':') : [];
  const groups = host.includes('::') ? [...a, ...Array<string>(8 - a.length - b.length).fill('0'), ...b] : a;
  if (groups[0] === '0' && groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') {
    const n = parseInt(groups[6] ?? '0', 16),
      m = parseInt(groups[7] ?? '0', 16);
    return `ip4:${n >>> 8}.${n & 255}.${m >>> 8}.${m & 255}`;
  }
  return `ip6:${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}
export function createThrottle(runtime: DatabaseRuntime, human: HumanVerifier = unavailableHumanVerifier) {
  const keys = (email: string, prefix: string, userId?: string) =>
    ['global:login', `email:${digest(email)}`, prefix, ...(userId ? [`acct:${userId}`] : [])].sort();
  async function mutate(
    email: string,
    prefix: string,
    operation: 'attempt' | 'failure' | 'success',
    userId?: string,
  ) {
    return runtime.transaction(async (tx) => {
      let challenge = false,
        retry = 0;
      for (const key of keys(email, prefix, userId)) {
        await tx.insert(schema.throttle).values({ key }).onConflictDoNothing();
        const [r] = await tx.select().from(schema.throttle).where(eq(schema.throttle.key, key)).for('update');
        if (!r) throw new Error('throttle_state_missing');
        const fresh = Date.now() - r.windowStartedAt.getTime() < 900_000;
        let failures = fresh ? r.failures : 0;
        let attempts = fresh ? r.attempts : 0;
        const wait =
          fresh && r.nextAllowedAt
            ? Math.max(0, Math.ceil((r.nextAllowedAt.getTime() - Date.now()) / 1000))
            : 0;
        retry = Math.max(retry, wait);
        if (key === 'global:login') challenge ||= attempts >= 100 && failures / Math.max(1, attempts) >= 0.5;
        else challenge ||= failures >= 5;
        if (operation === 'attempt') attempts++;
        if (operation === 'failure') failures++;
        // A valid credential does not clear an attacker's IP/global failure history.
        if (operation === 'success' && key.startsWith('acct:')) failures = 0;
        const delay =
          key === 'global:login' ? 0 : failures >= 5 ? Math.min(900, 2 ** Math.min(10, failures - 5)) : 0;
        await tx
          .update(schema.throttle)
          .set({
            failures,
            attempts,
            windowStartedAt: fresh ? r.windowStartedAt : new Date(),
            challengeRequired: failures >= 5,
            nextAllowedAt:
              operation === 'failure' && delay
                ? new Date(Date.now() + delay * 1000)
                : fresh
                  ? r.nextAllowedAt
                  : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.throttle.key, key));
      }
      return { challenge, retry };
    });
  }
  return {
    async admit(email: string, prefix: string, response?: string, userId?: string) {
      const state = await mutate(email, prefix, 'attempt', userId);
      if (state.retry) throw new DomainError('rate_limited', state.retry);
      if (state.challenge) {
        if (!response) throw new DomainError('human_verification_required');
        const result = await human.verify(response, prefix);
        if (result === 'unavailable') throw new DomainError('temporarily_unavailable');
        if (result !== 'verified') throw new DomainError('human_verification_required');
      }
    },
    failure: (email: string, prefix: string, userId?: string) => mutate(email, prefix, 'failure', userId),
    success: (email: string, prefix: string, userId?: string) => mutate(email, prefix, 'success', userId),
    async requestLimit(
      tx: Parameters<Parameters<DatabaseRuntime['transaction']>[0]>[0],
      purpose: string,
      email: string,
      prefix: string,
      max = 5,
      seconds = 86400,
    ) {
      for (const key of [
        `request:${purpose}:email:${digest(email)}`,
        `request:${purpose}:${prefix}`,
      ].sort()) {
        await tx.insert(schema.throttle).values({ key }).onConflictDoNothing();
        const [r] = await tx.select().from(schema.throttle).where(eq(schema.throttle.key, key)).for('update');
        if (!r) throw new Error('throttle_state_missing');
        const fresh = Date.now() - r.windowStartedAt.getTime() < seconds * 1000;
        const count = fresh ? r.attempts : 0;
        const limit = key.includes(':email:') ? max : max * 10;
        if (count >= limit)
          throw new DomainError(
            'rate_limited',
            Math.ceil((r.windowStartedAt.getTime() + seconds * 1000 - Date.now()) / 1000),
          );
        await tx
          .update(schema.throttle)
          .set({
            attempts: count + 1,
            windowStartedAt: fresh ? r.windowStartedAt : new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.throttle.key, key));
      }
      await tx.execute(sql`select 1`);
    },
  };
}
