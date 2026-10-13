import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { schema, eq, and, isNull, ne, inArray, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { DomainError } from '../shared/errors.ts';
import { digest, randomToken } from '../shared/crypto.ts';
import { lockActor } from '../identity/sessions.ts';
import { appendAudit } from '../audit/service.ts';
import type { IdentityContext } from '../identity/types.ts';
import { withStepup, type AssertionInput } from './webauthn.ts';
import { notifyAdmins } from './lifecycle.ts';
async function factorTransition(tx: Database, actor: UserActor) {
  const [state] = await tx
    .select()
    .from(schema.security)
    .where(eq(schema.security.userId, actor.userId))
    .for('update');
  if (!state || state.securityVersion !== actor.securityVersion) throw new DomainError('session_expired');
  await tx
    .delete(schema.session)
    .where(and(eq(schema.session.userId, actor.userId), ne(schema.session.id, actor.sessionId)));
  await tx
    .update(schema.tokens)
    .set({ state: 'invalidated', terminalAt: new Date(), invalidationReason: 'security_transition' })
    .where(
      and(
        eq(schema.tokens.userId, actor.userId),
        inArray(schema.tokens.state, ['pending_delivery', 'active']),
      ),
    );
  await tx
    .update(schema.security)
    .set({ securityVersion: state.securityVersion + 1 })
    .where(eq(schema.security.userId, actor.userId));
  await tx
    .update(schema.policy)
    .set({ securityVersion: state.securityVersion + 1 })
    .where(eq(schema.policy.sessionId, actor.sessionId));
  await tx
    .update(schema.challenges)
    .set({ expiresAt: new Date() })
    .where(and(eq(schema.challenges.userId, actor.userId), isNull(schema.challenges.consumedAt)));
}
export function removeAuthenticator(
  ctx: IdentityContext,
  actor: UserActor,
  keyId: string,
  assertion: AssertionInput,
) {
  if (actor.accountKind !== 'staff' || !actor.staffAssured) throw new DomainError('forbidden');
  return withStepup(
    ctx,
    actor,
    { action: 'staff.authenticator.remove', targetType: 'authenticator', targetId: keyId, parameters: {} },
    assertion,
    async (tx, client) => {
      const { state } = await lockActor(tx, actor);
      const keys = await tx
        .select()
        .from(schema.authenticators)
        .where(
          and(
            eq(schema.authenticators.userId, actor.userId),
            isNull(schema.authenticators.revokedAt),
            isNull(schema.authenticators.flaggedAt),
          ),
        );
      const key = keys.find((k) => k.id === keyId);
      if (!key || keys.length < 2 || key.credentialId === assertion.response.id)
        throw new DomainError('forbidden');
      await tx
        .update(schema.authenticators)
        .set({ revokedAt: new Date(), revokeReason: 'lost' })
        .where(eq(schema.authenticators.id, keyId));
      if (keys.length === 2)
        await tx
          .update(schema.security)
          .set({ staffAuthenticatorDeficitSince: state.staffAuthenticatorDeficitSince ?? new Date() })
          .where(eq(schema.security.userId, actor.userId));
      // Assurances made with the removed key cease to authorize immediately.
      await factorTransition(tx, actor);
      await tx.delete(schema.assurance).where(eq(schema.assurance.authenticatorId, keyId));
      await appendAudit(tx, actor, 'staff.authenticator.removed', 'authenticator', keyId);
      await notifyAdmins(ctx, tx, client, 'staff_authenticator_removed');
    },
  );
}
export async function replacementChallenge(ctx: IdentityContext, actor: UserActor) {
  if (actor.accountKind !== 'staff' || !actor.staffAssured) throw new DomainError('forbidden');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor, false, true);
    const keys = await tx
      .select()
      .from(schema.authenticators)
      .where(and(eq(schema.authenticators.userId, actor.userId), isNull(schema.authenticators.revokedAt)));
    if (keys.length >= 10) throw new DomainError('rate_limited', 300);
    const options = await generateRegistrationOptions({
      rpID: ctx.settings.rpId,
      rpName: ctx.settings.rpName,
      userID: Buffer.from(actor.userId),
      userName: actor.actorRef,
      attestationType: 'none',
      challenge: randomToken(),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      excludeCredentials: keys.map((k) => ({ id: k.credentialId })),
    });
    const [c] = await tx
      .insert(schema.challenges)
      .values({
        userId: actor.userId,
        sessionId: actor.sessionId,
        purpose: 'enroll',
        challengeHash: digest(options.challenge),
        expiresAt: new Date(Date.now() + 300_000),
      })
      .returning();
    if (!c) throw new Error('challenge_creation_failed');
    return { challengeId: c.id, options };
  });
}
export async function registerReplacement(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  response: RegistrationResponseJSON,
  assertion: AssertionInput,
) {
  if (actor.accountKind !== 'staff' || !actor.staffAssured) throw new DomainError('forbidden');
  await withStepup(
    ctx,
    actor,
    {
      action: 'staff.authenticator.register',
      targetType: 'account',
      targetId: 'me',
      parameters: { challengeId: id, credentialId: response.id },
    },
    assertion,
    async (tx, client) => {
      await lockActor(tx, actor, false, true);
      const [c] = await tx.select().from(schema.challenges).where(eq(schema.challenges.id, id)).for('update');
      if (
        !c ||
        c.userId !== actor.userId ||
        c.sessionId !== actor.sessionId ||
        c.purpose !== 'enroll' ||
        c.flowId ||
        c.consumedAt ||
        c.expiresAt.getTime() <= Date.now()
      )
        throw new DomainError('passkey_not_verified');
      let result;
      try {
        result = await verifyRegistrationResponse({
          response,
          expectedChallenge: (v) => digest(v) === c.challengeHash,
          expectedOrigin: ctx.settings.origin,
          expectedRPID: ctx.settings.rpId,
          requireUserVerification: true,
        });
      } catch {
        throw new DomainError('passkey_not_verified');
      }
      if (!result.verified) throw new DomainError('passkey_not_verified');
      const info = result.registrationInfo;
      const keys = await tx
        .select()
        .from(schema.authenticators)
        .where(
          and(
            eq(schema.authenticators.userId, actor.userId),
            isNull(schema.authenticators.revokedAt),
            isNull(schema.authenticators.flaggedAt),
          ),
        );
      if (keys.length >= 10) throw new DomainError('rate_limited', 300);
      const [key] = await tx
        .insert(schema.authenticators)
        .values({
          userId: actor.userId,
          credentialId: info.credential.id,
          publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
          signCount: info.credential.counter,
          transports: info.credential.transports ?? [],
          aaguid: info.aaguid,
          backupEligible: info.credentialDeviceType === 'multiDevice',
          backupState: info.credentialBackedUp,
          label: 'Replacement authenticator',
        })
        .returning();
      if (!key) throw new Error('authenticator_creation_failed');
      await tx.update(schema.challenges).set({ consumedAt: new Date() }).where(eq(schema.challenges.id, id));
      if (keys.length >= 1)
        await tx
          .update(schema.security)
          .set({ staffAuthenticatorDeficitSince: null })
          .where(eq(schema.security.userId, actor.userId));
      await factorTransition(tx, actor);
      await appendAudit(tx, actor, 'staff.authenticator.registered', 'authenticator', key.id);
      await notifyAdmins(ctx, tx, client, 'staff_authenticator_registered');
    },
    { allowDeficit: true },
  );
}
