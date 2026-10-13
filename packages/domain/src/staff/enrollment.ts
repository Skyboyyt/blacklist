import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { schema, eq, and, isNull, type Database, executor } from '@blacklist/db';
import { digest, randomToken, constantEqual } from '../shared/crypto.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { preparePassword } from '../identity/password-policy.ts';
import { createAuth } from '../identity/auth.ts';
import { appendAudit, actorReference } from '../audit/service.ts';

const draftKey = z.strictObject({
  credentialId: z.string(),
  publicKey: z.string(),
  signCount: z.number().int().min(0),
  transports: z.array(z.string()),
  aaguid: z.string(),
  backupEligible: z.boolean(),
  backupState: z.boolean(),
  label: z.string().max(60),
});
const draftKeys = z.array(draftKey).max(2);
async function lockFlow(tx: Database, flowToken: string) {
  // Invitation first, then flow: activation, revocation and replacement serialize.
  const [found] = await tx
    .select()
    .from(schema.enrollmentFlows)
    .where(eq(schema.enrollmentFlows.flowHash, digest(flowToken)));
  if (!found) throw new DomainError('token_invalid');
  const [invitation] = await tx
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.id, found.invitationId))
    .for('update');
  const [flow] = await tx
    .select()
    .from(schema.enrollmentFlows)
    .where(eq(schema.enrollmentFlows.id, found.id))
    .for('update');
  if (
    !invitation ||
    invitation.state !== 'issued' ||
    !invitation.deliveredAt ||
    invitation.expiresAt.getTime() <= Date.now() ||
    !flow ||
    flow.consumedAt ||
    flow.expiresAt.getTime() <= Date.now() ||
    invitation.generation !== flow.invitationGeneration
  )
    throw new DomainError('token_invalid');
  return { invitation, flow };
}
export async function startEnrollment(ctx: IdentityContext, rawToken: string, code: string) {
  const flowToken = randomToken();
  const result = await ctx.runtime.transaction(async (tx) => {
    const [i] = await tx
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, digest(rawToken)))
      .for('update');
    if (
      !i ||
      i.state !== 'issued' ||
      !i.deliveredAt ||
      i.expiresAt.getTime() <= Date.now() ||
      i.enrollmentCodeAttempts >= 5
    )
      return { kind: 'invalid' as const };
    if (!constantEqual(digest(code), i.enrollmentCodeHash)) {
      await tx
        .update(schema.invitations)
        .set({ enrollmentCodeAttempts: i.enrollmentCodeAttempts + 1 })
        .where(eq(schema.invitations.id, i.id));
      await appendAudit(
        tx,
        { kind: 'system', actorRef: 'staff.enrollment', jobKind: 'staff.enrollment' },
        'staff.enrollment.code_failed',
        'invitation',
        i.id,
      );
      return { kind: 'code_incorrect' as const, attemptsRemaining: 4 - i.enrollmentCodeAttempts };
    }
    await tx.insert(schema.enrollmentFlows).values({
      invitationId: i.id,
      flowHash: digest(flowToken),
      invitationGeneration: i.generation,
      expiresAt: new Date(Date.now() + 900_000),
    });
    await appendAudit(
      tx,
      { kind: 'system', actorRef: 'staff.enrollment', jobKind: 'staff.enrollment' },
      'staff.enrollment.started',
      'invitation',
      i.id,
    );
    return { kind: 'ok' as const, role: i.role, flowToken };
  });
  return result;
}
export async function setEnrollmentPassword(ctx: IdentityContext, flowToken: string, password: string) {
  await ctx.runtime.transaction((tx) => lockFlow(tx, flowToken));
  const stored = await preparePassword(password, ctx.breachCheck);
  await ctx.runtime.transaction(async (tx) => {
    const { flow } = await lockFlow(tx, flowToken);
    await tx
      .update(schema.enrollmentFlows)
      .set({ passwordHash: stored })
      .where(eq(schema.enrollmentFlows.id, flow.id));
  });
}
export async function enrollmentChallenge(ctx: IdentityContext, flowToken: string) {
  return ctx.runtime.transaction(async (tx) => {
    const { flow, invitation } = await lockFlow(tx, flowToken);
    const keys = draftKeys.parse(flow.authenticators);
    if (keys.length >= 2) throw new DomainError('conflict');
    const options = await generateRegistrationOptions({
      rpID: ctx.settings.rpId,
      rpName: ctx.settings.rpName,
      userID: Buffer.from(flow.id),
      userName: invitation.email,
      userDisplayName: 'Blacklist staff',
      attestationType: 'none',
      challenge: randomToken(),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      excludeCredentials: keys.map((k) => ({ id: k.credentialId })),
    });
    const [challenge] = await tx
      .insert(schema.challenges)
      .values({
        invitationId: invitation.id,
        flowId: flow.id,
        purpose: 'enroll',
        challengeHash: digest(options.challenge),
        expiresAt: new Date(Date.now() + 300_000),
      })
      .returning();
    if (!challenge) throw new Error('challenge_creation_failed');
    return { challengeId: challenge.id, options };
  });
}
export async function enrollAuthenticator(
  ctx: IdentityContext,
  flowToken: string,
  challengeId: string,
  response: RegistrationResponseJSON,
) {
  await ctx.runtime.transaction(async (tx) => {
    const { flow } = await lockFlow(tx, flowToken);
    const [c] = await tx
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId))
      .for('update');
    if (
      !c ||
      c.flowId !== flow.id ||
      c.purpose !== 'enroll' ||
      c.consumedAt ||
      c.expiresAt.getTime() <= Date.now()
    )
      throw new DomainError('passkey_not_verified');
    let result;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge: (raw) => digest(raw) === c.challengeHash,
        expectedOrigin: ctx.settings.origin,
        expectedRPID: ctx.settings.rpId,
        requireUserVerification: true,
      });
    } catch {
      throw new DomainError('passkey_not_verified');
    }
    if (!result.verified) throw new DomainError('passkey_not_verified');
    const keys = draftKeys.parse(flow.authenticators);
    const info = result.registrationInfo;
    if (keys.length >= 2 || keys.some((k) => k.credentialId === info.credential.id))
      throw new DomainError('conflict');
    const [taken] = await tx
      .select()
      .from(schema.authenticators)
      .where(eq(schema.authenticators.credentialId, info.credential.id));
    if (taken) throw new DomainError('conflict');
    keys.push({
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
      signCount: info.credential.counter,
      transports: info.credential.transports ?? [],
      aaguid: info.aaguid,
      backupEligible: info.credentialDeviceType === 'multiDevice',
      backupState: info.credentialBackedUp,
      label: `Authenticator ${keys.length + 1}`,
    });
    await tx
      .update(schema.enrollmentFlows)
      .set({ authenticators: keys })
      .where(eq(schema.enrollmentFlows.id, flow.id));
    await tx.update(schema.challenges).set({ consumedAt: new Date() }).where(eq(schema.challenges.id, c.id));
  });
}
export async function completeEnrollment(ctx: IdentityContext, flowToken: string) {
  await ctx.runtime.transaction(async (tx, client) => {
    const { invitation: i, flow } = await lockFlow(tx, flowToken);
    const keys = draftKeys.parse(flow.authenticators);
    if (!flow.passwordHash || keys.length !== 2) throw new DomainError('enrollment_incomplete');
    if (i.requiresSecondApproval && (!i.approvedByActor || i.approvedByActor === i.invitedByActor))
      throw new DomainError('forbidden');
    let userId = i.targetUserId;
    if (userId) {
      const [state] = await tx
        .select()
        .from(schema.security)
        .where(eq(schema.security.userId, userId))
        .for('update');
      const [recovery] = await tx
        .select()
        .from(schema.recoveries)
        .where(eq(schema.recoveries.invitationId, i.id))
        .for('update');
      if (!state || !state.staffRecoveryPending || recovery?.state !== 'fresh_enrollment')
        throw new DomainError('forbidden');
      await tx
        .update(schema.account)
        .set({ password: flow.passwordHash, updatedAt: new Date() })
        .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')));
      await tx
        .update(schema.user)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(schema.user.id, userId));
      await tx
        .update(schema.security)
        .set({
          securityVersion: state.securityVersion + 1,
          staffRecoveryPending: false,
          staffAuthenticatorDeficitSince: null,
          passwordChangedAt: new Date(),
        })
        .where(eq(schema.security.userId, userId));
      await tx
        .update(schema.recoveries)
        .set({ state: 'completed' })
        .where(eq(schema.recoveries.id, recovery.id));
    } else {
      const context = await createAuth(tx, ctx.settings.secret, ctx.settings.origin).$context;
      const handle = `staff_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const u = await context.adapter.create<{ id: string }>({
        model: 'user',
        data: {
          email: i.email,
          name: handle,
          emailVerified: true,
          accountKind: 'staff',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      userId = u.id;
      await context.adapter.create({
        model: 'account',
        data: {
          userId,
          accountId: userId,
          providerId: 'credential',
          password: flow.passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await tx.insert(schema.profiles).values({ userId, handle });
      await tx.insert(schema.security).values({ userId, passwordChangedAt: new Date() });
      await tx
        .insert(schema.roles)
        .values({ userId, role: i.role, grantedVia: 'invitation', sourceId: i.id });
    }
    for (const key of keys) await tx.insert(schema.authenticators).values({ ...key, userId });
    await tx.delete(schema.session).where(eq(schema.session.userId, userId));
    await tx
      .update(schema.invitations)
      .set({ state: 'accepted', tokenHash: null })
      .where(eq(schema.invitations.id, i.id));
    await tx
      .update(schema.enrollmentFlows)
      .set({ consumedAt: new Date(), passwordHash: null, authenticators: [] })
      .where(eq(schema.enrollmentFlows.id, flow.id));
    if (i.basis === 'bootstrap')
      await tx
        .update(schema.systemState)
        .set({ staffBootstrapCompletedAt: new Date() })
        .where(eq(schema.systemState.key, 1));
    await appendAudit(
      tx,
      { kind: 'system', actorRef: 'staff.enrollment', jobKind: 'staff.enrollment' },
      'staff.enrollment.completed',
      'account',
      await actorReference(tx, userId),
    );
    const admins = await tx
      .select({ userId: schema.roles.userId })
      .from(schema.roles)
      .where(and(eq(schema.roles.role, 'admin'), isNull(schema.roles.revokedAt)));
    for (const admin of admins)
      await ctx.runtime.boss.send(
        'identity.security_notice',
        { accountId: admin.userId, kind: 'staff_enrolled' },
        { db: executor(client) },
      );
  });
}
