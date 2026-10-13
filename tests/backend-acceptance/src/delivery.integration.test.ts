import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createAuth } from './auth.js';
import { startDatabase, type Harness } from './database.js';
import { cleanupPending, issueReset, startResetWorker, type DeliveryOutcome } from './delivery.js';
import { createMember, tokenFromLink } from './fixtures.js';
import { digest } from './registration.js';
import { resetPassword } from './reset.js';
import * as schema from './schema.js';

let h: Harness;
const secret = randomBytes(48).toString('base64url');
beforeAll(async () => {
  h = await startDatabase();
});
afterAll(async () => {
  if (h) await h.stop();
});

async function active(userId: string) {
  return h.db
    .select()
    .from(schema.tokens)
    .where(
      and(eq(schema.tokens.userId, userId), inArray(schema.tokens.state, ['pending_delivery', 'active'])),
    );
}

test('S13: concurrent issuers serialize generations; only the accepted latest link can be active', async () => {
  const member = await createMember(h, secret);
  const links: string[] = [];
  await Promise.all(
    Array.from({ length: 3 }, () =>
      issueReset(h, member.requestId, async ({ link }) => {
        links.push(link);
        await new Promise((resolve) => setTimeout(resolve, 40));
        return 'accepted_for_delivery';
      }),
    ),
  );
  const open = await active(member.userId);
  expect(open).toHaveLength(1);
  expect(open[0]?.state).toBe('active');
  expect(open[0]?.generation).toBe(3);
  const working = links.filter((link) => digest(tokenFromLink(link)) === open[0]?.tokenHash);
  expect(working).toHaveLength(1);
  await expect(issueReset(h, member.requestId, async () => 'accepted_for_delivery')).rejects.toThrow(
    'security_delivery_retryable',
  );
  expect(await active(member.userId)).toHaveLength(1);
});
test('S13: tokens remain pending before provider acceptance; stale requests and cleanup fail closed', async () => {
  const member = await createMember(h, secret);
  let pendingLink = '';
  let finish: ((value: DeliveryOutcome) => void) | undefined;
  const sending = issueReset(h, member.requestId, async ({ link }) => {
    pendingLink = link;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await expect.poll(() => !!finish).toBe(true);
  const open = await active(member.userId);
  expect(open[0]?.state).toBe('pending_delivery');
  await expect(resetPassword(h, tokenFromLink(pendingLink), 'a new long gate passphrase')).rejects.toThrow(
    'reset_link_invalid',
  );
  finish?.('accepted_for_delivery');
  await sending;
  await h.db
    .update(schema.resetRequests)
    .set({ requestedAt: new Date(Date.now() - 901_000) })
    .where(eq(schema.resetRequests.id, member.requestId));
  let called = false;
  expect(
    await issueReset(h, member.requestId, async () => {
      called = true;
      return 'accepted_for_delivery';
    }),
  ).toBe('skipped_stale');
  expect(called).toBe(false);
  await h.db
    .update(schema.tokens)
    .set({ state: 'pending_delivery', issuedAt: new Date(Date.now() - 901_000) })
    .where(eq(schema.tokens.userId, member.userId));
  await cleanupPending(h);
  expect(await active(member.userId)).toHaveLength(0);
});
test('S14: real pg-boss failure and retry produce new generations, latest-only acceptance, no token in jobs/logs', async () => {
  const member = await createMember(h, secret);
  const links: string[] = [];
  const logs: string[] = [];
  const logSpies = ['error', 'warn', 'info', 'debug', 'log'].map((method) =>
    vi.spyOn(console, method as 'error').mockImplementation((...args: unknown[]) => {
      logs.push(JSON.stringify(args));
    }),
  );
  await startResetWorker(
    h,
    async ({ link }) => {
      links.push(link);
      if (links.length === 1) throw new Error(`provider error includes ${link}`);
      if (links.length === 2)
        return new Promise(() => {
          /* deliberately times out */
        });
      return 'accepted_for_delivery';
    },
    30,
  );
  const jobId = await h.boss.send(
    'identity.password_reset.issue',
    { requestId: member.requestId },
    { singletonKey: member.requestId },
  );
  try {
    await expect
      .poll(
        async () => {
          const result = await h.runtime.query('SELECT state FROM pgboss.job WHERE id = $1', [jobId]);
          return result.rows[0]?.state;
        },
        { timeout: 20_000, interval: 200 },
      )
      .toBe('completed');
    expect(links).toHaveLength(3);
    const open = await active(member.userId);
    expect(open).toHaveLength(1);
    expect(open[0]?.state).toBe('active');
    expect(links.filter((link) => digest(tokenFromLink(link)) === open[0]?.tokenHash)).toHaveLength(1);
    for (const link of links.slice(0, -1))
      await expect(resetPassword(h, tokenFromLink(link), 'another long test passphrase')).rejects.toThrow(
        'reset_link_invalid',
      );
    await resetPassword(h, tokenFromLink(links.at(-1) ?? ''), 'another long test passphrase');
    const rows = await h.runtime.query('SELECT to_jsonb(j) AS row FROM pgboss.job j');
    const stored = JSON.stringify(rows.rows) + JSON.stringify(logs);
    for (const link of links) {
      expect(stored.includes(link)).toBe(false);
      expect(stored.includes(tokenFromLink(link))).toBe(false);
    }
    const deliveries = await h.db.select().from(schema.deliveries).where(eq(schema.deliveries.generation, 3));
    expect(deliveries.some((entry) => entry.outcome === 'accepted_for_delivery')).toBe(true);
  } finally {
    await h.boss.offWork('identity.password_reset.issue');
    for (const spy of logSpies) spy.mockRestore();
  }
});
test('S14: permanent failure completes without retry; acceptance followed by crash is not redeemable', async () => {
  const permanent = await createMember(h, secret);
  let calls = 0;
  await startResetWorker(h, async () => {
    calls++;
    return 'permanent_failure';
  });
  const jobId = await h.boss.send('identity.password_reset.issue', { requestId: permanent.requestId });
  try {
    await expect
      .poll(
        async () =>
          (await h.runtime.query('SELECT state FROM pgboss.job WHERE id = $1', [jobId])).rows[0]?.state,
        { timeout: 10_000 },
      )
      .toBe('completed');
    expect(calls).toBe(1);
    expect(await active(permanent.userId)).toHaveLength(0);
  } finally {
    await h.boss.offWork('identity.password_reset.issue');
  }
  const crashed = await createMember(h, secret);
  const links: string[] = [];
  const capture = async ({ link }: { link: string }) => {
    links.push(link);
    return 'accepted_for_delivery' as const;
  };
  await expect(issueReset(h, crashed.requestId, capture, 20_000, true)).rejects.toThrow(
    'security_delivery_retryable',
  );
  expect((await active(crashed.userId))[0]?.state).toBe('pending_delivery');
  await issueReset(h, crashed.requestId, capture);
  const open = await active(crashed.userId);
  expect(links.filter((link) => digest(tokenFromLink(link)) === open[0]?.tokenHash)).toHaveLength(1);
  expect(open[0]?.generation).toBe(2);
  expect(await h.db.select().from(schema.verification)).toHaveLength(0);
  // Library initialization/normal flow continues without a verification-token path.
  await createAuth(h.db, secret).$context;
});
test('S14: exhausted real jobs reach a DLQ containing identifiers and sanitized errors only', async () => {
  const member = await createMember(h, secret);
  const links: string[] = [];
  await startResetWorker(h, async ({ link }) => {
    links.push(link);
    return 'retryable_failure';
  });
  const jobId = await h.boss.send(
    'identity.password_reset.issue',
    { requestId: member.requestId },
    { retryDelay: 1, retryBackoff: false },
  );
  try {
    await expect
      .poll(
        async () =>
          (await h.runtime.query('SELECT state FROM pgboss.job WHERE id = $1', [jobId])).rows[0]?.state,
        { timeout: 20_000, interval: 200 },
      )
      .toBe('failed');
    const dlq = await h.runtime.query(
      "SELECT to_jsonb(j) AS row FROM pgboss.job j WHERE name = 'identity.password_reset.dead'",
    );
    expect(dlq.rows.length).toBeGreaterThan(0);
    const stored = JSON.stringify(dlq.rows);
    for (const link of links) {
      expect(stored.includes(link)).toBe(false);
      expect(stored.includes(tokenFromLink(link))).toBe(false);
    }
    expect(await active(member.userId)).toHaveLength(0);
  } finally {
    await h.boss.offWork('identity.password_reset.issue');
  }
});
