import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  reauthenticate,
  changePassword,
  requestEmailChange,
  revokeSessions,
  revokeAllSessions,
  accountSecurity,
  login,
} from '@blacklist/domain';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';
import { verifyPassword } from '../../../packages/domain/src/identity/password.ts';
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
async function member() {
  const user = await f.addUser(),
    result = await signIn(f.ctx, user.email, syntheticPassword),
    headers = new Headers({ cookie: result.cookies.map((c) => c.split(';')[0]).join('; ') });
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, headers);
  if (!actor) throw new Error('fixture_session_missing');
  return {
    user,
    actor,
    async refresh() {
      const current = await resolveSession(f.ctx.runtime, f.ctx.auth, headers);
      if (!current) throw new Error('fixture_session_missing');
      return current;
    },
  };
}
describe('member account transitions preserve reauthentication, ownership and current session revision', () => {
  it('rejects invalid current credentials and required reauthentication before sensitive changes', async () => {
    const m = await member();
    await expect(
      changePassword(f.ctx, m.actor, syntheticPassword, 'another synthetic phrase'),
    ).rejects.toThrow('reauth_required');
    await expect(
      requestEmailChange(f.ctx, m.actor, 'synthetic-next@example.test', 'ip4:192.0.2.60'),
    ).rejects.toThrow('reauth_required');
    await expect(revokeAllSessions(f.ctx, m.actor)).rejects.toThrow('reauth_required');
    await expect(reauthenticate(f.ctx, m.actor, 'wrong synthetic phrase')).rejects.toThrow(
      'invalid_credentials',
    );
    await f.ctx.runtime.db
      .update(schema.account)
      .set({ password: 'malformed-fixture-hash' })
      .where(eq(schema.account.userId, m.user.id));
    await expect(reauthenticate(f.ctx, m.actor, syntheticPassword)).rejects.toThrow('invalid_credentials');
    await f.ctx.runtime.db
      .update(schema.account)
      .set({ password: null })
      .where(eq(schema.account.userId, m.user.id));
    await expect(reauthenticate(f.ctx, m.actor, syntheticPassword)).rejects.toThrow('invalid_credentials');
  });
  it('changes password only with current proof, updates the surviving session version and enforces email cooling', async () => {
    const m = await member();
    await signIn(f.ctx, m.user.email, syntheticPassword);
    const initial = await accountSecurity(f.ctx, m.actor);
    expect(initial.passwordChangedAt).toBeNull();
    expect(initial.reauthValidUntil).toBeNull();
    await reauthenticate(f.ctx, m.actor, syntheticPassword);
    await expect(
      changePassword(f.ctx, m.actor, 'wrong synthetic phrase', 'new synthetic member password'),
    ).rejects.toThrow('invalid_credentials');
    await changePassword(f.ctx, m.actor, syntheticPassword, 'new synthetic member password');
    const [credential] = await f.ctx.runtime.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, m.user.id));
    if (!credential?.password) throw new Error('fixture_password_missing');
    expect(
      await verifyPassword({ hash: credential.password, password: 'new synthetic member password' }),
    ).toBe(true);
    expect(await verifyPassword({ hash: credential.password, password: syntheticPassword })).toBe(false);
    const current = await m.refresh();
    expect(current.securityVersion).toBe(2);
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, m.user.id)),
    ).toHaveLength(1);
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: new Date(Date.now() + 3600_000) })
      .where(eq(schema.security.userId, m.user.id));
    expect((await accountSecurity(f.ctx, current)).cooling?.reason).toBe('password_reset');
    await expect(
      requestEmailChange(f.ctx, current, 'synthetic-next@example.test', 'ip4:192.0.2.61'),
    ).rejects.toThrow('cooling_period');
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.security.userId, m.user.id));
    await requestEmailChange(f.ctx, current, 'synthetic-next@example.test', 'ip4:192.0.2.61');
    const requests = await f.ctx.runtime.db
      .select()
      .from(schema.emailRequests)
      .where(eq(schema.emailRequests.userId, m.user.id));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.securityVersion).toBe(2);
    const security = await accountSecurity(f.ctx, current);
    expect(security.cooling).toBeNull();
    expect(security.reauthValidUntil).not.toBeNull();
    expect(security.recentEvents.map((e) => e.kind)).toContain('password_changed');
  });
  it('specific session revocation is owner-bound and cannot revoke the current session', async () => {
    const m = await member(),
      other = await member();
    await expect(revokeSessions(f.ctx, m.actor, m.actor.sessionId)).rejects.toThrow('conflict');
    await expect(revokeSessions(f.ctx, m.actor, other.actor.sessionId)).rejects.toThrow('not_found');
    await signIn(f.ctx, m.user.email, syntheticPassword);
    const sessions = await f.ctx.runtime.db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(eq(schema.session.userId, m.user.id));
    const target = sessions.find((s) => s.id !== m.actor.sessionId);
    if (!target) throw new Error('fixture_session_missing');
    await revokeSessions(f.ctx, m.actor, target.id);
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.id, target.id)),
    ).toHaveLength(0);
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.id, other.actor.sessionId)),
    ).toHaveLength(1);
    await reauthenticate(f.ctx, m.actor, syntheticPassword);
    await revokeSessions(f.ctx, m.actor, 'others');
    await revokeAllSessions(f.ctx, m.actor);
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, m.user.id)),
    ).toHaveLength(0);
  });
  it('staff sensitive changes and bulk revocation require signed passkey proof, never member password proof', async () => {
    const staff = await addAssuredStaff(f);
    await expect(reauthenticate(f.ctx, staff.actor, syntheticPassword)).rejects.toThrow('passkey_required');
    await expect(
      changePassword(f.ctx, staff.actor, syntheticPassword, 'another synthetic password'),
    ).rejects.toThrow('passkey_required');
    await expect(
      requestEmailChange(f.ctx, staff.actor, 'staff-next@example.test', 'ip4:192.0.2.62'),
    ).rejects.toThrow('passkey_required');
    await expect(revokeAllSessions(f.ctx, staff.actor)).rejects.toThrow('passkey_required');
    const action = {
      action: 'account.sessions_revoke_all',
      targetType: 'account',
      targetId: 'me',
      parameters: {},
    };
    await revokeAllSessions(f.ctx, staff.actor, await staff.proof(action));
    expect(
      await f.ctx.runtime.db
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, staff.user.id)),
    ).toHaveLength(0);
  });
  it('profile absence fails safely and inactive/recovering accounts receive no usable login session', async () => {
    const m = await member();
    await f.ctx.runtime.db.delete(schema.profiles).where(eq(schema.profiles.userId, m.user.id));
    await expect(accountSecurity(f.ctx, m.actor)).rejects.toThrow('not_found');
    for (const blocked of ['inactive', 'recovery', 'missing_state'] as const) {
      const user = await f.addUser();
      if (blocked === 'inactive')
        await f.ctx.runtime.db
          .update(schema.user)
          .set({ status: 'suspended' })
          .where(eq(schema.user.id, user.id));
      if (blocked === 'recovery')
        await f.ctx.runtime.db
          .update(schema.security)
          .set({ staffRecoveryPending: true })
          .where(eq(schema.security.userId, user.id));
      if (blocked === 'missing_state')
        await f.ctx.runtime.db.delete(schema.security).where(eq(schema.security.userId, user.id));
      await expect(signIn(f.ctx, user.email, syntheticPassword)).rejects.toThrow('invalid_credentials');
      expect(
        await f.ctx.runtime.db
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, user.id)),
      ).toHaveLength(0);
    }
    await expect(login(f.ctx, 'absent@example.test', 'invalid\u0000input', 'ip4:192.0.2.63')).rejects.toThrow(
      'invalid_credentials',
    );
    await expect(login(f.ctx, 'absent@example.test', syntheticPassword, 'ip4:192.0.2.64')).rejects.toThrow(
      'invalid_credentials',
    );
  });
});
