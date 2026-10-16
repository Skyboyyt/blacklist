import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { schema, eq, and } from '@blacklist/db';
import {
  completeRegistration,
  issueIdentityToken,
  issueRegistration,
  sendNotice,
  sendEmailChangeNotices,
  type DeliveryOutcome,
  type SecurityMailer,
} from '@blacklist/domain';
import { claimNotice } from '../../../packages/domain/src/identity/mail-records.ts';
import { digest } from '../../../packages/domain/src/shared/crypto.ts';
import { startApplicationFixture, type ApplicationFixture } from './application-fixture.ts';

let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
const accepted = {
  outcome: 'accepted_for_delivery',
  providerMessageId: 'synthetic-provider-message',
} as const;
function capture(outcome: DeliveryOutcome = accepted, during?: () => Promise<void>) {
  const messages: Array<Parameters<SecurityMailer['send']>[0]> = [];
  const mailer: SecurityMailer = {
    async send(message) {
      messages.push(message);
      await during?.();
      return outcome;
    },
  };
  return { messages, mailer };
}
async function request(purpose: 'password_reset' | 'email_change', user: typeof schema.user.$inferSelect) {
  if (purpose === 'password_reset') {
    const [r] = await f.ctx.runtime.db.insert(schema.resetRequests).values({ email: user.email }).returning();
    if (!r) throw new Error('fixture_request_missing');
    return r;
  }
  const [r] = await f.ctx.runtime.db
    .insert(schema.emailRequests)
    .values({
      userId: user.id,
      oldEmail: user.email,
      newEmail: `change-${randomUUID()}@example.test`,
      securityVersion: 1,
    })
    .returning();
  if (!r) throw new Error('fixture_request_missing');
  return r;
}

describe('identity delivery terminal states and stale authority', () => {
  for (const purpose of ['password_reset', 'email_change'] as const) {
    for (const outcome of [
      accepted,
      { outcome: 'permanent_failure', code: 'rejected', providerStatus: 550 },
      { outcome: 'retryable_failure', code: 'timeout' },
    ] satisfies DeliveryOutcome[]) {
      it(`${purpose} becomes redeemable only after ${outcome.outcome}`, async () => {
        const user = await f.addUser(),
          r = await request(purpose, user),
          m = capture(outcome);
        const running = issueIdentityToken(f.ctx, purpose, r.id, m.mailer);
        if (outcome.outcome === 'retryable_failure')
          await expect(running).rejects.toThrow('security_delivery_retryable');
        else await running;
        expect(m.messages.length).toBe(1);
        const [token] = await f.ctx.runtime.db
          .select()
          .from(schema.tokens)
          .where(and(eq(schema.tokens.userId, user.id), eq(schema.tokens.purpose, purpose)));
        const [delivery] = await f.ctx.runtime.db
          .select()
          .from(schema.deliveries)
          .where(eq(schema.deliveries.entityId, token?.id ?? randomUUID()));
        expect(token?.state).toBe(outcome.outcome === 'accepted_for_delivery' ? 'active' : 'invalidated');
        expect(token?.activatedAt !== null).toBe(outcome.outcome === 'accepted_for_delivery');
        expect(delivery?.outcome).toBe(outcome.outcome);
        expect(delivery?.providerMessageId).toBe(
          outcome.outcome === 'accepted_for_delivery' ? outcome.providerMessageId : null,
        );
        expect(JSON.stringify(delivery).includes(m.messages[0]?.text ?? 'missing-message')).toBe(false);
      });
    }
    it(`${purpose} suppresses expired, unknown and inactive requests`, async () => {
      const user = await f.addUser(),
        r = await request(purpose, user),
        m = capture();
      const table = purpose === 'password_reset' ? schema.resetRequests : schema.emailRequests;
      await f.ctx.runtime.db
        .update(table)
        .set({ requestedAt: new Date(Date.now() - 901_000) })
        .where(eq(table.id, r.id));
      await issueIdentityToken(f.ctx, purpose, r.id, m.mailer);
      await issueIdentityToken(f.ctx, purpose, randomUUID(), m.mailer);
      await f.ctx.runtime.db.update(table).set({ requestedAt: new Date() }).where(eq(table.id, r.id));
      await f.ctx.runtime.db
        .update(schema.user)
        .set({ status: 'suspended' })
        .where(eq(schema.user.id, user.id));
      await issueIdentityToken(f.ctx, purpose, r.id, m.mailer);
      expect(m.messages.length).toBe(0);
      expect(
        await f.ctx.runtime.db.select().from(schema.tokens).where(eq(schema.tokens.userId, user.id)),
      ).toHaveLength(0);
    });
    it(`${purpose} cannot activate a delivered token after a concurrent security transition`, async () => {
      const user = await f.addUser(),
        r = await request(purpose, user);
      const m = capture(accepted, async () => {
        await f.ctx.runtime.db
          .update(schema.security)
          .set({ securityVersion: 2 })
          .where(eq(schema.security.userId, user.id));
      });
      await issueIdentityToken(f.ctx, purpose, r.id, m.mailer);
      const [token] = await f.ctx.runtime.db
        .select()
        .from(schema.tokens)
        .where(eq(schema.tokens.userId, user.id));
      expect(token?.state).toBe('pending_delivery');
      expect(token?.activatedAt).toBeNull();
    });
  }
  it('does not reveal unknown reset mailboxes or stale email-change security versions', async () => {
    const [r] = await f.ctx.runtime.db
      .insert(schema.resetRequests)
      .values({ email: `absent-${randomUUID()}@example.test` })
      .returning();
    if (!r) throw new Error('fixture_request_missing');
    const m = capture();
    await issueIdentityToken(f.ctx, 'password_reset', r.id, m.mailer);
    const user = await f.addUser(),
      change = await request('email_change', user);
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ securityVersion: 2 })
      .where(eq(schema.security.userId, user.id));
    await issueIdentityToken(f.ctx, 'email_change', change.id, m.mailer);
    expect(m.messages.length).toBe(0);
  });
  it('enforces reset issuance budgets and supersedes older generations', async () => {
    const user = await f.addUser(),
      m = capture();
    for (let i = 0; i < 3; i++) {
      const r = await request('password_reset', user);
      await issueIdentityToken(f.ctx, 'password_reset', r.id, m.mailer);
    }
    const r = await request('password_reset', user);
    await expect(issueIdentityToken(f.ctx, 'password_reset', r.id, m.mailer)).rejects.toThrow(
      'security_delivery_retryable',
    );
    expect(m.messages.length).toBe(3);
    const tokens = await f.ctx.runtime.db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.userId, user.id));
    expect(tokens.filter((t) => t.state === 'active')).toHaveLength(1);
    expect(tokens.filter((t) => t.state === 'invalidated')).toHaveLength(2);
    expect(Math.max(...tokens.map((t) => t.generation))).toBe(3);
  });
  it('cooling prevents email issuance; a taken mailbox gets only one throttled notice', async () => {
    const user = await f.addUser(),
      occupied = await f.addUser(),
      r = await request('email_change', user),
      m = capture();
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: new Date(Date.now() + 3600_000) })
      .where(eq(schema.security.userId, user.id));
    await issueIdentityToken(f.ctx, 'email_change', r.id, m.mailer);
    expect(m.messages.length).toBe(0);
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: null })
      .where(eq(schema.security.userId, user.id));
    await f.ctx.runtime.db
      .update(schema.emailRequests)
      .set({ newEmail: occupied.email })
      .where(eq(schema.emailRequests.id, r.id));
    await issueIdentityToken(f.ctx, 'email_change', r.id, m.mailer);
    await issueIdentityToken(f.ctx, 'email_change', r.id, m.mailer);
    expect(m.messages.length).toBe(1);
    expect(m.messages[0]?.recipient).toBe(occupied.email);
    expect(m.messages[0]?.text.includes('#token=')).toBe(false);
    expect(
      await f.ctx.runtime.db.select().from(schema.tokens).where(eq(schema.tokens.userId, user.id)),
    ).toHaveLength(0);
  });
  it('notices reopen only after the daily limit, and retries are explicit', async () => {
    const user = await f.addUser();
    expect(await claimNotice(f.ctx, user.email)).toBe(true);
    expect(await claimNotice(f.ctx, user.email)).toBe(false);
    await f.ctx.runtime.db
      .update(schema.throttle)
      .set({ windowStartedAt: new Date(Date.now() - 86401_000) })
      .where(eq(schema.throttle.key, `notice:${digest(user.email)}`));
    expect(await claimNotice(f.ctx, user.email)).toBe(true);
    const m = capture({ outcome: 'retryable_failure', code: 'transport' });
    await sendNotice(f.ctx, randomUUID(), 'fixture', m.mailer);
    expect(m.messages.length).toBe(0);
    await expect(sendNotice(f.ctx, user.id, 'fixture', m.mailer)).rejects.toThrow(
      'security_delivery_retryable',
    );
    const r = await request('email_change', user);
    await sendEmailChangeNotices(f.ctx, r.id, m.mailer);
    await sendEmailChangeNotices(f.ctx, randomUUID(), m.mailer);
    await f.ctx.runtime.db
      .update(schema.emailRequests)
      .set({ outcome: 'confirmed' })
      .where(eq(schema.emailRequests.id, r.id));
    await expect(sendEmailChangeNotices(f.ctx, r.id, m.mailer)).rejects.toThrow(
      'security_delivery_retryable',
    );
    const ok = capture();
    await sendEmailChangeNotices(f.ctx, r.id, ok.mailer);
    expect(ok.messages.length).toBe(2);
    const permanent = capture({ outcome: 'permanent_failure', code: 'rejected' });
    await sendNotice(f.ctx, user.id, 'fixture', permanent.mailer);
    expect(permanent.messages.length).toBe(1);
  });
  it('registration notice suppresses account enumeration and respects stale intent states', async () => {
    const user = await f.addUser(),
      m = capture();
    for (let i = 0; i < 2; i++) {
      const [r] = await f.ctx.runtime.db
        .insert(schema.intents)
        .values({ email: user.email, state: 'requested' })
        .returning();
      if (!r) throw new Error('fixture_intent_missing');
      await issueRegistration(f.ctx, r.id, m.mailer);
      const [done] = await f.ctx.runtime.db.select().from(schema.intents).where(eq(schema.intents.id, r.id));
      expect(done?.state).toBe('superseded');
      expect(done?.tokenHash).toBeNull();
    }
    expect(m.messages.length).toBe(1);
    expect(m.messages[0]?.text.includes('#token=')).toBe(false);
    await issueRegistration(f.ctx, randomUUID(), m.mailer);
    const [stale] = await f.ctx.runtime.db
      .insert(schema.intents)
      .values({
        email: `stale-${randomUUID()}@example.test`,
        state: 'requested',
        createdAt: new Date(Date.now() - 901_000),
      })
      .returning();
    if (!stale) throw new Error('fixture_intent_missing');
    await issueRegistration(f.ctx, stale.id, m.mailer);
    await f.ctx.runtime.db
      .update(schema.intents)
      .set({ state: 'completed', createdAt: new Date() })
      .where(eq(schema.intents.id, stale.id));
    await issueRegistration(f.ctx, stale.id, m.mailer);
    expect(m.messages.length).toBe(1);
  });
  it('invite-only registration closes uninvited intents silently and re-checks at completion (ADR 0019)', async () => {
    const invited = `invited-${randomUUID()}@example.test`,
      outsider = `outsider-${randomUUID()}@example.test`;
    const invite = (emails: string[]) => ({
      ...f.ctx,
      settings: {
        ...f.ctx.settings,
        registration: { mode: 'invite' as const, emailDigests: new Set(emails.map((e) => digest(e))) },
      },
    });
    const gated = invite([invited]),
      m = capture();
    const intent = async (email: string) => {
      const [r] = await f.ctx.runtime.db
        .insert(schema.intents)
        .values({ email, state: 'requested' })
        .returning();
      if (!r) throw new Error('fixture_intent_missing');
      return r;
    };
    const uninvited = await intent(outsider);
    await issueRegistration(gated, uninvited.id, m.mailer);
    const [closed] = await f.ctx.runtime.db
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.id, uninvited.id));
    expect(closed).toMatchObject({ state: 'superseded', closeReason: 'not_invited', tokenHash: null });
    expect(m.messages).toHaveLength(0);

    const allowed = await intent(invited);
    await issueRegistration(gated, allowed.id, m.mailer);
    expect(m.messages).toHaveLength(1);
    const token = /#token=([^\s]+)/u.exec(m.messages[0]?.text ?? '')?.[1];
    if (!token) throw new Error('fixture_token_missing');
    // Removing the email from the list also stops a link already sent.
    await expect(
      completeRegistration(
        invite([]),
        token,
        'invite_gate_user',
        'fictional invited phrase',
        'ip4:192.0.2.61',
      ),
    ).rejects.toThrow('token_invalid');
    const [stillIssued] = await f.ctx.runtime.db
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.id, allowed.id));
    expect(stillIssued?.state).toBe('issued');
    const [users] = await f.ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, invited));
    expect(users).toBeUndefined();
  });
});
