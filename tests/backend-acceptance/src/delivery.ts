import { randomBytes } from 'node:crypto';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Harness } from './database.js';
import { digest } from './registration.js';
import * as schema from './schema.js';

export type DeliveryOutcome = 'accepted_for_delivery' | 'retryable_failure' | 'permanent_failure';
export type Mailer = (message: { recipient: string; link: string }) => Promise<DeliveryOutcome>;
export class RetryableDeliveryError extends Error {
  constructor() {
    super('security_delivery_retryable');
  }
}

async function send(
  mailer: Mailer,
  message: Parameters<Mailer>[0],
  timeoutMs: number,
): Promise<DeliveryOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      mailer(message).catch(() => 'retryable_failure' as const),
      new Promise<DeliveryOutcome>((resolve) => {
        timer = setTimeout(() => resolve('retryable_failure'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function issueReset(
  h: Harness,
  requestId: string,
  mailer: Mailer,
  timeoutMs = 20_000,
  crashAfterAcceptance = false,
) {
  const [request] = await h.db
    .select()
    .from(schema.resetRequests)
    .where(eq(schema.resetRequests.id, requestId));
  if (!request || Date.now() - request.requestedAt.getTime() > 900_000) return 'skipped_stale';
  const [user] = await h.db.select().from(schema.user).where(eq(schema.user.email, request.email));
  if (!user || user.status !== 'active') return 'ignored';
  const rawToken = randomBytes(32).toString('base64url');
  const issued = await h.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, user.id))
      .for('update');
    const [current] = await tx.select().from(schema.user).where(eq(schema.user.id, user.id));
    if (!state || current?.status !== 'active' || current.email !== request.email) return undefined;
    const previous = await tx
      .select()
      .from(schema.tokens)
      .where(
        and(
          eq(schema.tokens.userId, user.id),
          eq(schema.tokens.purpose, 'password_reset'),
          gte(schema.tokens.issuedAt, new Date(Date.now() - 3600_000)),
        ),
      );
    if (previous.length >= 3) throw new RetryableDeliveryError();
    await tx
      .update(schema.tokens)
      .set({ state: 'invalidated' })
      .where(
        and(
          eq(schema.tokens.userId, user.id),
          eq(schema.tokens.purpose, 'password_reset'),
          inArray(schema.tokens.state, ['pending_delivery', 'active']),
        ),
      );
    const generation = state.lastResetGeneration + 1;
    await tx
      .update(schema.security)
      .set({ lastResetGeneration: generation })
      .where(eq(schema.security.userId, user.id));
    const [token] = await tx
      .insert(schema.tokens)
      .values({
        userId: user.id,
        purpose: 'password_reset',
        requestId,
        state: 'pending_delivery',
        tokenHash: digest(rawToken),
        generation,
        securityVersion: state.securityVersion,
        expiresAt: new Date(Date.now() + 1800_000),
      })
      .returning();
    return token;
  });
  if (!issued) return 'ignored';
  const outcome = await send(
    mailer,
    { recipient: user.email, link: `https://blacklist.example.invalid/reset-password#token=${rawToken}` },
    timeoutMs,
  );
  if (crashAfterAcceptance) throw new RetryableDeliveryError();
  await h.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, user.id))
      .for('share');
    const [token] = await tx
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.id, issued.id))
      .for('update');
    if (
      token?.state === 'pending_delivery' &&
      state?.lastResetGeneration === token.generation &&
      state.securityVersion === token.securityVersion
    ) {
      await tx
        .update(schema.tokens)
        .set({ state: outcome === 'accepted_for_delivery' ? 'active' : 'invalidated' })
        .where(eq(schema.tokens.id, token.id));
    }
    await tx
      .insert(schema.deliveries)
      .values({ entityId: issued.id, generation: issued.generation, outcome });
  });
  if (outcome === 'retryable_failure') throw new RetryableDeliveryError();
  return outcome;
}

export async function startResetWorker(h: Harness, mailer: Mailer, timeoutMs?: number) {
  return h.boss.work('identity.password_reset.issue', { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) {
      const { requestId } = z.object({ requestId: z.uuid() }).strict().parse(job.data);
      // The only error allowed into pg-boss output/DLQ is a fixed sanitized code.
      try {
        await issueReset(h, requestId, mailer, timeoutMs);
      } catch {
        throw new RetryableDeliveryError();
      }
    }
  });
}
export async function cleanupPending(h: Harness) {
  await h.db
    .update(schema.tokens)
    .set({ state: 'invalidated' })
    .where(
      and(
        eq(schema.tokens.state, 'pending_delivery'),
        sql`${schema.tokens.issuedAt} < now() - interval '15 minutes'`,
      ),
    );
}
