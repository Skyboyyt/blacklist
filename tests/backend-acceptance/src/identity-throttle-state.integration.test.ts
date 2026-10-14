import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { schema, eq, inArray } from '@blacklist/db';
import { createThrottle } from '@blacklist/domain';
import { digest } from '../../../packages/domain/src/shared/crypto.ts';
import { startApplicationFixture, type ApplicationFixture } from './application-fixture.ts';
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
async function bucket(key: string, failures = 0, attempts = 0, nextAllowedAt: Date | null = null) {
  const values = { failures, attempts, nextAllowedAt, windowStartedAt: new Date() };
  await f.ctx.runtime.db
    .insert(schema.throttle)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: schema.throttle.key, set: values });
}
describe('identity abuse thresholds, human-provider failure and transactional request quotas', () => {
  for (const result of ['verified', 'rejected', 'unavailable'] as const) {
    it(`requires human verification after failures and handles provider ${result} without authentication authority`, async () => {
      const user = await f.addUser(),
        prefix = `ip4:192.0.2.${result === 'verified' ? 70 : result === 'rejected' ? 71 : 72}`;
      await bucket('global:login');
      await bucket(`email:${digest(user.email)}`, 5, 5);
      let checks = 0;
      const throttle = createThrottle(f.ctx.runtime, {
        async verify(response, ip) {
          expect(response === 'synthetic-human-response').toBe(true);
          expect(ip).toBe(prefix);
          checks++;
          return result;
        },
      });
      await expect(throttle.admit(user.email, prefix, undefined, user.id)).rejects.toThrow(
        'human_verification_required',
      );
      const admission = throttle.admit(user.email, prefix, 'synthetic-human-response', user.id);
      if (result === 'verified') await admission;
      else
        await expect(admission).rejects.toThrow(
          result === 'unavailable' ? 'temporarily_unavailable' : 'human_verification_required',
        );
      expect(checks).toBe(1);
      expect(
        await f.ctx.runtime.db
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, user.id)),
      ).toHaveLength(0);
    });
  }
  it('global distributed failures trigger challenge while stale windows reset counters without bypassing active backoff', async () => {
    const user = await f.addUser(),
      prefix = 'ip4:192.0.2.73',
      throttle = createThrottle(f.ctx.runtime);
    await bucket('global:login', 70, 100);
    await expect(throttle.admit(user.email, prefix)).rejects.toThrow('human_verification_required');
    await bucket('global:login', 10, 100);
    await throttle.admit(user.email, prefix);
    await bucket(prefix, 6, 6, new Date(Date.now() + 60_000));
    await expect(throttle.admit(user.email, prefix)).rejects.toThrow('rate_limited');
    await f.ctx.runtime.db
      .update(schema.throttle)
      .set({ windowStartedAt: new Date(Date.now() - 901_000) })
      .where(inArray(schema.throttle.key, ['global:login', prefix]));
    await throttle.admit(user.email, prefix);
    const [fresh] = await f.ctx.runtime.db
      .select()
      .from(schema.throttle)
      .where(eq(schema.throttle.key, prefix));
    expect(fresh?.failures).toBe(0);
    expect(fresh?.attempts).toBe(1);
    expect(fresh?.nextAllowedAt).toBeNull();
  });
  it('valid credentials clear only the account failure bucket, never the IP/global attack history', async () => {
    const user = await f.addUser(),
      prefix = 'ip4:192.0.2.74',
      key = `acct:${user.id}`,
      throttle = createThrottle(f.ctx.runtime);
    await bucket('global:login', 80, 200);
    await bucket(prefix, 5, 5);
    await bucket(key, 5, 5);
    await throttle.success(user.email, prefix, user.id);
    const rows = await f.ctx.runtime.db
      .select()
      .from(schema.throttle)
      .where(inArray(schema.throttle.key, ['global:login', prefix, key]));
    expect(rows.find((r) => r.key === key)?.failures).toBe(0);
    expect(rows.find((r) => r.key === prefix)?.failures).toBe(5);
    expect(rows.find((r) => r.key === 'global:login')?.failures).toBe(80);
    await throttle.failure(user.email, prefix, user.id);
    const [ip] = await f.ctx.runtime.db.select().from(schema.throttle).where(eq(schema.throttle.key, prefix));
    expect(ip?.nextAllowedAt).toBeInstanceOf(Date);
  });
  it('email and IP request limits fail atomically and reopen only after their window expires', async () => {
    const throttle = createThrottle(f.ctx.runtime),
      prefix = 'ip4:192.0.2.75',
      email = 'synthetic-quota@example.test',
      purpose = 'synthetic_quota';
    const run = (mailbox: string, ip = prefix) =>
      f.ctx.runtime.transaction((tx) => throttle.requestLimit(tx, purpose, mailbox, ip, 1, 60));
    await run(email);
    await expect(run(email, 'ip4:192.0.2.76')).rejects.toThrow('rate_limited');
    for (let i = 1; i < 10; i++) await run(`quota-${i}@example.test`);
    await expect(run('quota-denied@example.test')).rejects.toThrow('rate_limited');
    const deniedKey = `request:${purpose}:email:${digest('quota-denied@example.test')}`;
    expect(
      await f.ctx.runtime.db.select().from(schema.throttle).where(eq(schema.throttle.key, deniedKey)),
    ).toHaveLength(0);
    const keys = [`request:${purpose}:email:${digest(email)}`, `request:${purpose}:${prefix}`];
    await f.ctx.runtime.db
      .update(schema.throttle)
      .set({ windowStartedAt: new Date(Date.now() - 61_000) })
      .where(inArray(schema.throttle.key, keys));
    await run(email);
    const rows = await f.ctx.runtime.db
      .select()
      .from(schema.throttle)
      .where(inArray(schema.throttle.key, keys));
    expect(rows.map((r) => r.attempts)).toEqual([1, 1]);
  });
});
