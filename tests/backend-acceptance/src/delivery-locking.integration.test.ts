import { describe, it, expect } from 'vitest';
import { createDelivery, issueIdentityToken } from '@blacklist/domain';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { startDatabase } from './database.ts';

describe('application token delivery lock ordering', () => {
  it('does not issue reset authority to an old mailbox after a concurrent email transition', async () => {
    const h = await startDatabase();
    const urlFor = (pool: typeof h.runtime) => {
      const url = new URL(`postgresql://127.0.0.1:${h.port}/postgres`);
      url.username = pool.options.user ?? '';
      if (typeof pool.options.password !== 'string') throw new Error('test_password_missing');
      url.password = pool.options.password;
      return url.toString();
    };
    const ctx = createDelivery(urlFor(h.runtime), 'https://blacklist.example.invalid', { mode: 'open' });
    const blocker = await h.runtime.connect();
    let sending: Promise<unknown> | undefined;
    let sent = 0;
    try {
      await migrate(urlFor(h.migrator), 'gate_runtime');
      await ctx.runtime.start();
      const user = await h.runtime.query<{ id: string }>(`INSERT INTO blacklist.auth_users
        (name,email,email_verified) VALUES ('Mailbox fixture','old-mailbox@example.test',true) RETURNING id`);
      const id = user.rows[0]?.id;
      if (!id) throw new Error('test_user_missing');
      await h.runtime.query('INSERT INTO blacklist.account_security_state(user_id) VALUES ($1)', [id]);
      const request = await h.runtime.query<{ id: string }>(`INSERT INTO blacklist.password_reset_requests
        (email) VALUES ('old-mailbox@example.test') RETURNING id`);
      const requestId = request.rows[0]?.id;
      if (!requestId) throw new Error('test_request_missing');
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT user_id FROM blacklist.account_security_state WHERE user_id=$1 FOR UPDATE',
        [id],
      );
      sending = issueIdentityToken(ctx, 'password_reset', requestId, {
        async send() {
          sent++;
          return { outcome: 'accepted_for_delivery', providerMessageId: 'fixture-message' };
        },
      });
      await expect
        .poll(async () => {
          const waiting = await h.admin.query<{ count: string }>(`SELECT count(*) FROM pg_stat_activity
          WHERE usename='gate_runtime' AND wait_event_type='Lock'
          AND query LIKE '%account_security_state%'`);
          return Number(waiting.rows[0]?.count);
        })
        .toBeGreaterThan(0);
      await blocker.query("UPDATE blacklist.auth_users SET email='new-mailbox@example.test' WHERE id=$1", [
        id,
      ]);
      await blocker.query(
        'UPDATE blacklist.account_security_state SET security_version=security_version+1 WHERE user_id=$1',
        [id],
      );
      await blocker.query('COMMIT');
      await sending;
      expect(sent).toBe(0);
      expect(
        (await h.runtime.query('SELECT id FROM blacklist.identity_tokens WHERE user_id=$1', [id])).rows,
      ).toHaveLength(0);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await sending?.catch(() => undefined);
      await ctx.runtime.close();
      await h.stop();
    }
  });

  it('finalization waits for account transition without holding a token lock', async () => {
    const h = await startDatabase();
    const urlFor = (pool: typeof h.runtime) => {
      const url = new URL(`postgresql://127.0.0.1:${h.port}/postgres`);
      url.username = pool.options.user ?? '';
      if (typeof pool.options.password !== 'string') throw new Error('test_password_missing');
      url.password = pool.options.password;
      return url.toString();
    };
    const ctx = createDelivery(urlFor(h.runtime), 'https://blacklist.example.invalid', { mode: 'open' });
    const blocker = await h.runtime.connect();
    let releaseMail: (() => void) | undefined;
    let sending: Promise<unknown> | undefined;
    try {
      await migrate(urlFor(h.migrator), 'gate_runtime');
      await ctx.runtime.start();
      const user = await h.runtime.query<{ id: string }>(`INSERT INTO blacklist.auth_users
        (name,email,email_verified) VALUES ('Lock fixture','locking@example.test',true) RETURNING id`);
      const id = user.rows[0]?.id;
      if (!id) throw new Error('test_user_missing');
      await h.runtime.query('INSERT INTO blacklist.account_security_state(user_id) VALUES ($1)', [id]);
      const request = await h.runtime.query<{ id: string }>(`INSERT INTO blacklist.password_reset_requests
        (email) VALUES ('locking@example.test') RETURNING id`);
      const requestId = request.rows[0]?.id;
      if (!requestId) throw new Error('test_request_missing');
      let enteredMail = false;
      sending = issueIdentityToken(ctx, 'password_reset', requestId, {
        async send() {
          enteredMail = true;
          await new Promise<void>((resolve) => {
            releaseMail = resolve;
          });
          return { outcome: 'accepted_for_delivery', providerMessageId: 'fixture-message' };
        },
      });
      // Attach immediately: the old implementation can reject with a deadlock.
      const settled = sending.then(
        () => ({ ok: true }),
        () => ({ ok: false }),
      );
      await expect.poll(() => enteredMail).toBe(true);
      await blocker.query('BEGIN');
      await blocker.query('SET LOCAL lock_timeout=2000');
      await blocker.query(
        'SELECT user_id FROM blacklist.account_security_state WHERE user_id=$1 FOR UPDATE',
        [id],
      );
      releaseMail?.();
      await expect
        .poll(async () => {
          const waiting = await h.admin.query<{ count: string }>(`SELECT count(*) FROM pg_stat_activity
          WHERE usename='gate_runtime' AND wait_event_type='Lock'
          AND query LIKE '%account_security_state%'`);
          return Number(waiting.rows[0]?.count);
        })
        .toBeGreaterThan(0);
      // A security transition must be able to invalidate the token while the
      // delivery transaction waits on the account. Old token-first ordering
      // deadlocks (or times out) here rather than silently passing via a retry.
      await blocker.query(
        `UPDATE blacklist.identity_tokens SET state='invalidated',
        terminal_at=now(),invalidation_reason='security_transition' WHERE user_id=$1`,
        [id],
      );
      await blocker.query('COMMIT');
      expect(await settled).toEqual({ ok: true });
      const token = await h.runtime.query('SELECT state FROM blacklist.identity_tokens WHERE user_id=$1', [
        id,
      ]);
      expect(token.rows).toEqual([{ state: 'invalidated' }]);
    } finally {
      releaseMail?.();
      await blocker.query('ROLLBACK');
      blocker.release();
      await sending?.catch(() => undefined);
      await ctx.runtime.close();
      await h.stop();
    }
  });
});
