import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { schema, eq } from '@blacklist/db';
import {
  prepareStaffPasswordChange,
  changeStaffPassword,
  requestStaffEmailChange,
  signIn,
  type StaffAction,
} from '@blacklist/domain';
import { verifyPassword } from '../../../packages/domain/src/identity/password.ts';
import {
  startApplicationFixture,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
const replacement = 'new synthetic staff passphrase';
const prefix = 'ip4:192.0.2.71';
describe('staff credential intents and mandatory action-bound assertions', () => {
  it('rejects unassured actors, incorrect current credentials and absent credential hashes', async () => {
    const staff = await addAssuredStaff(f);
    await expect(
      prepareStaffPasswordChange(
        f.ctx,
        { ...staff.actor, staffAssured: false },
        syntheticPassword,
        replacement,
        prefix,
      ),
    ).rejects.toThrow('forbidden');
    await expect(
      prepareStaffPasswordChange(
        f.ctx,
        { ...staff.actor, accountKind: 'member' },
        syntheticPassword,
        replacement,
        prefix,
      ),
    ).rejects.toThrow('forbidden');
    await expect(
      prepareStaffPasswordChange(f.ctx, staff.actor, 'incorrect current passphrase', replacement, prefix),
    ).rejects.toThrow('invalid_credentials');
    await f.ctx.runtime.db
      .update(schema.account)
      .set({ password: null })
      .where(eq(schema.account.userId, staff.user.id));
    await expect(
      prepareStaffPasswordChange(f.ctx, staff.actor, syntheticPassword, replacement, prefix),
    ).rejects.toThrow('invalid_credentials');
  });
  for (const failure of ['missing', 'owner', 'session', 'revision', 'consumed', 'expired'] as const) {
    it(`rejects ${failure} password intents without consuming account authority`, async () => {
      const staff = await addAssuredStaff(f),
        prepared = await prepareStaffPasswordChange(
          f.ctx,
          staff.actor,
          syntheticPassword,
          replacement,
          prefix,
        );
      let id = prepared.intentId;
      if (failure === 'missing') id = randomUUID();
      if (failure === 'owner')
        await f.ctx.runtime.db
          .update(schema.credentialIntents)
          .set({ userId: (await f.addUser('staff')).id })
          .where(eq(schema.credentialIntents.id, id));
      if (failure === 'session') {
        await signIn(f.ctx, staff.user.email, syntheticPassword);
        const sessions = await f.ctx.runtime.db
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, staff.user.id));
        const other = sessions.find((s) => s.id !== staff.actor.sessionId);
        if (!other) throw new Error('fixture_session_missing');
        await f.ctx.runtime.db
          .update(schema.credentialIntents)
          .set({ sessionId: other.id })
          .where(eq(schema.credentialIntents.id, id));
      }
      if (failure === 'revision')
        await f.ctx.runtime.db
          .update(schema.credentialIntents)
          .set({ securityVersion: 2 })
          .where(eq(schema.credentialIntents.id, id));
      if (failure === 'consumed')
        await f.ctx.runtime.db
          .update(schema.credentialIntents)
          .set({ consumedAt: new Date() })
          .where(eq(schema.credentialIntents.id, id));
      if (failure === 'expired')
        await f.ctx.runtime.db
          .update(schema.credentialIntents)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.credentialIntents.id, id));
      const action: StaffAction = {
        action: 'account.password_changed',
        targetType: 'account',
        targetId: 'me',
        parameters: { intentId: id },
      };
      await expect(changeStaffPassword(f.ctx, staff.actor, id, await staff.proof(action))).rejects.toThrow(
        'forbidden',
      );
      const [credential] = await f.ctx.runtime.db
        .select()
        .from(schema.account)
        .where(eq(schema.account.userId, staff.user.id));
      if (!credential?.password) throw new Error('fixture_password_missing');
      expect(await verifyPassword({ hash: credential.password, password: syntheticPassword })).toBe(true);
    });
  }
  it('applies a signed prepared password intent atomically, retains the current session and refuses assertion replay', async () => {
    const staff = await addAssuredStaff(f);
    await signIn(f.ctx, staff.user.email, syntheticPassword);
    const prepared = await prepareStaffPasswordChange(
      f.ctx,
      staff.actor,
      syntheticPassword,
      replacement,
      prefix,
    );
    const proof = await staff.proof(prepared.action);
    await changeStaffPassword(f.ctx, staff.actor, prepared.intentId, proof);
    const [credential] = await f.ctx.runtime.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, staff.user.id));
    if (!credential?.password) throw new Error('fixture_password_missing');
    expect(await verifyPassword({ hash: credential.password, password: replacement })).toBe(true);
    expect(await verifyPassword({ hash: credential.password, password: syntheticPassword })).toBe(false);
    const sessions = await f.ctx.runtime.db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(eq(schema.session.userId, staff.user.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(staff.actor.sessionId);
    const [policy] = await f.ctx.runtime.db
      .select()
      .from(schema.policy)
      .where(eq(schema.policy.sessionId, staff.actor.sessionId));
    expect(policy?.securityVersion).toBe(2);
    expect(
      await f.ctx.runtime.db
        .select()
        .from(schema.credentialIntents)
        .where(eq(schema.credentialIntents.userId, staff.user.id)),
    ).toHaveLength(0);
    await expect(changeStaffPassword(f.ctx, staff.actor, prepared.intentId, proof)).rejects.toThrow(
      'passkey_not_verified',
    );
  });
  it('staff email-change parameters are signed, cooling is enforced, and successful requests contain no bearer proof', async () => {
    const staff = await addAssuredStaff(f),
      email = `staff-change-${randomUUID()}@example.test`;
    const action = {
      action: 'account.email_change',
      targetType: 'account',
      targetId: 'me',
      parameters: { newEmail: email },
    };
    const wrong = await staff.proof({ ...action, parameters: { newEmail: 'other@example.test' } });
    await expect(requestStaffEmailChange(f.ctx, staff.actor, email, 'ip4:192.0.2.41', wrong)).rejects.toThrow(
      'passkey_not_verified',
    );
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: new Date(Date.now() + 3600_000) })
      .where(eq(schema.security.userId, staff.user.id));
    await expect(
      requestStaffEmailChange(f.ctx, staff.actor, email, 'ip4:192.0.2.41', await staff.proof(action)),
    ).rejects.toThrow('cooling_period');
    await f.ctx.runtime.db
      .update(schema.security)
      .set({ sensitiveActionsLockedUntil: null })
      .where(eq(schema.security.userId, staff.user.id));
    await requestStaffEmailChange(f.ctx, staff.actor, email, 'ip4:192.0.2.41', await staff.proof(action));
    const requests = await f.ctx.runtime.db
      .select()
      .from(schema.emailRequests)
      .where(eq(schema.emailRequests.userId, staff.user.id));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.newEmail).toBe(email);
    expect(requests[0]?.oldEmail).toBe(staff.user.email);
    expect(requests[0]).not.toHaveProperty('token');
  });
});
