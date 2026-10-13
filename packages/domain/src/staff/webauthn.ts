import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { schema, eq, and, isNull, executor, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { digest, randomToken, canonicalJson } from '../shared/crypto.ts';
import { DomainError } from '../shared/errors.ts';
import { lockActor } from '../identity/sessions.ts';
import type { IdentityContext } from '../identity/types.ts';
import { appendAudit } from '../audit/service.ts';

export interface StaffAction {
  action: string;
  targetType: string;
  targetId: string;
  parameters: unknown;
}
export const actionDigest = (action: StaffAction) => digest(canonicalJson(action));
interface AssertionBinding {
  userId: string;
  purpose: string;
  securityVersion: number;
  sessionId?: string;
  tokenId?: string;
  actionHash?: string;
}
export interface AssertionInput {
  challengeId: string;
  response: AuthenticationResponseJSON;
}
export async function authenticationChallenge(
  ctx: IdentityContext,
  actor: UserActor,
  purpose: 'login' | 'stepup',
  action?: StaffAction,
) {
  if (actor.accountKind !== 'staff') throw new DomainError('forbidden');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(
      tx,
      actor,
      purpose === 'login',
      purpose === 'login' || action?.action === 'staff.authenticator.register',
    );
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
    if (!keys.length) throw new DomainError('forbidden');
    if (purpose === 'stepup' && (!action || !actor.staffAssured)) throw new DomainError('forbidden');
    const raw = randomToken();
    const options = await generateAuthenticationOptions({
      rpID: ctx.settings.rpId,
      userVerification: 'required',
      challenge: raw,
      allowCredentials: keys.map((k) => ({ id: k.credentialId })),
    });
    const [challenge] = await tx
      .insert(schema.challenges)
      .values({
        userId: actor.userId,
        sessionId: actor.sessionId,
        purpose,
        actionHash: action ? actionDigest(action) : null,
        challengeHash: digest(options.challenge),
        expiresAt: new Date(Date.now() + 300_000),
      })
      .returning({ id: schema.challenges.id });
    if (!challenge) throw new Error('challenge_creation_failed');
    return { challengeId: challenge.id, options };
  });
}
// Construction is private; callers cannot fabricate a receipt with a UV boolean.
export class VerifiedAssertion {
  readonly challengeId: string;
  readonly userId: string;
  readonly keyId: string;
  readonly priorCounter: number;
  readonly nextCounter: number;
  readonly purpose: string;
  readonly sessionId: string | null;
  readonly tokenId: string | null;
  readonly actionHash: string | null;
  private constructor(
    c: typeof schema.challenges.$inferSelect,
    k: typeof schema.authenticators.$inferSelect,
    counter: number,
  ) {
    this.challengeId = c.id;
    this.userId = k.userId;
    this.keyId = k.id;
    this.priorCounter = k.signCount;
    this.nextCounter = counter;
    this.purpose = c.purpose;
    this.sessionId = c.sessionId;
    this.tokenId = c.tokenId;
    this.actionHash = c.actionHash;
    Object.freeze(this);
  }
  static async verify(
    ctx: IdentityContext,
    input: AssertionInput,
    binding: AssertionBinding,
  ): Promise<VerifiedAssertion> {
    const [c] = await ctx.runtime.db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, input.challengeId));
    const [key] = await ctx.runtime.db
      .select()
      .from(schema.authenticators)
      .where(eq(schema.authenticators.credentialId, input.response.id));
    if (
      !c ||
      c.userId !== binding.userId ||
      c.purpose !== binding.purpose ||
      (binding.sessionId && c.sessionId !== binding.sessionId) ||
      (binding.tokenId && c.tokenId !== binding.tokenId) ||
      (binding.actionHash && c.actionHash !== binding.actionHash) ||
      c.consumedAt ||
      c.expiresAt.getTime() <= Date.now() ||
      !key ||
      key.userId !== c.userId ||
      key.revokedAt ||
      key.flaggedAt
    )
      throw new DomainError('passkey_not_verified');
    try {
      const result = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: (raw) => digest(raw) === c.challengeHash,
        expectedOrigin: ctx.settings.origin,
        expectedRPID: ctx.settings.rpId,
        requireUserVerification: true,
        credential: {
          id: key.credentialId,
          publicKey: Buffer.from(key.publicKey, 'base64url'),
          counter: key.signCount,
        },
      });
      if (!result.verified) throw new Error('assertion_unverified');
      return new VerifiedAssertion(c, key, result.authenticationInfo.newCounter);
    } catch {
      // Prove the signature/UV/challenge first with counter enforcement disabled;
      // only a cryptographically valid regression can suspend permissions.
      if (key.signCount > 0) {
        let validRegression = false;
        try {
          const check = await verifyAuthenticationResponse({
            response: input.response,
            expectedChallenge: (raw) => digest(raw) === c.challengeHash,
            expectedOrigin: ctx.settings.origin,
            expectedRPID: ctx.settings.rpId,
            requireUserVerification: true,
            credential: {
              id: key.credentialId,
              publicKey: Buffer.from(key.publicKey, 'base64url'),
              counter: 0,
            },
          });
          validRegression = check.verified && check.authenticationInfo.newCounter <= key.signCount;
        } catch {
          /* invalid signatures never change state */
        }
        if (validRegression)
          await ctx.runtime.transaction(async (tx, client) => {
            const [state] = await tx
              .select()
              .from(schema.security)
              .where(eq(schema.security.userId, key.userId))
              .for('update');
            const [current] = await tx
              .select()
              .from(schema.authenticators)
              .where(eq(schema.authenticators.id, key.id))
              .for('update');
            const [challenge] = await tx
              .select()
              .from(schema.challenges)
              .where(eq(schema.challenges.id, c.id))
              .for('update');
            if (
              !state ||
              state.securityVersion !== binding.securityVersion ||
              !challenge ||
              challenge.consumedAt ||
              challenge.expiresAt.getTime() <= Date.now() ||
              !current ||
              current.revokedAt ||
              current.flaggedAt ||
              current.signCount !== key.signCount
            )
              return;
            await tx
              .update(schema.authenticators)
              .set({ flaggedAt: new Date() })
              .where(eq(schema.authenticators.id, key.id));
            await tx.delete(schema.session).where(eq(schema.session.userId, key.userId));
            await tx
              .update(schema.security)
              .set({ securityVersion: state.securityVersion + 1, staffRecoveryPending: true })
              .where(eq(schema.security.userId, key.userId));
            await appendAudit(
              tx,
              { kind: 'system', actorRef: 'staff.counter_check', jobKind: 'staff.counter_check' },
              'staff.authenticator.flagged',
              'authenticator',
              key.id,
              { reason: 'sign_count_regression' },
            );
            await ctx.runtime.boss.send(
              'identity.security_notice',
              { accountId: key.userId, kind: 'staff_authenticator_flagged' },
              { db: executor(client) },
            );
          });
      }
      throw new DomainError('passkey_not_verified');
    }
  }
}
export async function consumeAssertion(
  tx: Database,
  proof: VerifiedAssertion,
  binding: { userId: string; purpose: string; sessionId?: string; tokenId?: string; actionHash?: string },
) {
  if (
    !(proof instanceof VerifiedAssertion) ||
    proof.userId !== binding.userId ||
    proof.purpose !== binding.purpose ||
    (binding.sessionId && proof.sessionId !== binding.sessionId) ||
    (binding.tokenId && proof.tokenId !== binding.tokenId) ||
    (binding.actionHash && proof.actionHash !== binding.actionHash)
  )
    throw new DomainError('passkey_not_verified');
  const [c] = await tx
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, proof.challengeId))
    .for('update');
  const [key] = await tx
    .select()
    .from(schema.authenticators)
    .where(eq(schema.authenticators.id, proof.keyId))
    .for('update');
  if (
    !c ||
    c.consumedAt ||
    c.expiresAt.getTime() <= Date.now() ||
    c.userId !== binding.userId ||
    c.purpose !== binding.purpose ||
    c.sessionId !== proof.sessionId ||
    c.tokenId !== proof.tokenId ||
    c.actionHash !== proof.actionHash ||
    !key ||
    key.userId !== binding.userId ||
    key.revokedAt ||
    key.flaggedAt ||
    key.signCount !== proof.priorCounter
  )
    throw new DomainError('passkey_not_verified');
  await tx.update(schema.challenges).set({ consumedAt: new Date() }).where(eq(schema.challenges.id, c.id));
  await tx
    .update(schema.authenticators)
    .set({ signCount: proof.nextCounter, lastUsedAt: new Date() })
    .where(eq(schema.authenticators.id, key.id));
}
export async function assureSession(ctx: IdentityContext, actor: UserActor, input: AssertionInput) {
  const proof = await VerifiedAssertion.verify(ctx, input, {
    userId: actor.userId,
    purpose: 'login',
    sessionId: actor.sessionId,
    securityVersion: actor.securityVersion,
  });
  await ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor, true, true);
    await consumeAssertion(tx, proof, { userId: actor.userId, purpose: 'login', sessionId: actor.sessionId });
    await tx
      .insert(schema.assurance)
      .values({ sessionId: actor.sessionId, userId: actor.userId, authenticatorId: proof.keyId })
      .onConflictDoUpdate({
        target: schema.assurance.sessionId,
        set: { authenticatorId: proof.keyId, verifiedAt: new Date() },
      });
    await appendAudit(tx, actor, 'staff.assurance.succeeded', 'session', actor.sessionId);
  });
}
// Cryptographic acknowledgement for the existing two-stage UI. This neither
// consumes a challenge nor issues a grant/receipt. The action request must carry
// this raw assertion and reverify + consume + execute atomically in withStepup.
export async function previewStepup(ctx: IdentityContext, actor: UserActor, input: AssertionInput) {
  const proof = await VerifiedAssertion.verify(ctx, input, {
    userId: actor.userId,
    purpose: 'stepup',
    sessionId: actor.sessionId,
    securityVersion: actor.securityVersion,
  });
  await ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    if (
      proof.userId !== actor.userId ||
      proof.sessionId !== actor.sessionId ||
      proof.purpose !== 'stepup' ||
      !proof.actionHash
    )
      throw new DomainError('passkey_not_verified');
  });
}
export async function withStepup<T>(
  ctx: IdentityContext,
  actor: UserActor,
  action: StaffAction,
  input: AssertionInput,
  execute: (tx: Database, client: Parameters<Parameters<typeof ctx.runtime.transaction>[0]>[1]) => Promise<T>,
  options: { allowDeficit?: boolean } = {},
): Promise<T> {
  if (actor.accountKind !== 'staff' || !actor.staffAssured) throw new DomainError('forbidden');
  if (
    options.allowDeficit &&
    (action.action !== 'staff.authenticator.register' ||
      action.targetType !== 'account' ||
      action.targetId !== 'me')
  )
    throw new DomainError('forbidden');
  const proof = await VerifiedAssertion.verify(ctx, input, {
    userId: actor.userId,
    purpose: 'stepup',
    sessionId: actor.sessionId,
    actionHash: actionDigest(action),
    securityVersion: actor.securityVersion,
  });
  return ctx.runtime.transaction(async (tx, client) => {
    await lockActor(tx, actor, false, options.allowDeficit ?? false);
    await consumeAssertion(tx, proof, {
      userId: actor.userId,
      purpose: 'stepup',
      sessionId: actor.sessionId,
      actionHash: actionDigest(action),
    });
    const result = await execute(tx, client);
    const [currentSession] = await tx
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(and(eq(schema.session.id, actor.sessionId), eq(schema.session.userId, actor.userId)));
    if (currentSession)
      await tx
        .insert(schema.assurance)
        .values({ sessionId: actor.sessionId, userId: actor.userId, authenticatorId: proof.keyId })
        .onConflictDoUpdate({
          target: schema.assurance.sessionId,
          set: { authenticatorId: proof.keyId, verifiedAt: new Date() },
        });
    await appendAudit(tx, actor, 'staff.stepup.succeeded', action.targetType, action.targetId);
    return result;
  });
}
export async function resetChallenge(ctx: IdentityContext, rawToken: string) {
  const [token] = await ctx.runtime.db
    .select()
    .from(schema.tokens)
    .where(and(eq(schema.tokens.tokenHash, digest(rawToken)), eq(schema.tokens.purpose, 'password_reset')));
  if (!token || token.state !== 'active' || token.expiresAt.getTime() <= Date.now())
    throw new DomainError('token_invalid');
  return ctx.runtime.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, token.userId))
      .for('update');
    const [u] = await tx.select().from(schema.user).where(eq(schema.user.id, token.userId));
    if (
      u?.accountKind !== 'staff' ||
      u.status !== 'active' ||
      state?.securityVersion !== token.securityVersion ||
      state.lastResetGeneration !== token.generation
    )
      throw new DomainError('token_invalid');
    const keys = await tx
      .select()
      .from(schema.authenticators)
      .where(
        and(
          eq(schema.authenticators.userId, u.id),
          isNull(schema.authenticators.revokedAt),
          isNull(schema.authenticators.flaggedAt),
        ),
      );
    if (!keys.length) throw new DomainError('token_invalid');
    const options = await generateAuthenticationOptions({
      rpID: ctx.settings.rpId,
      userVerification: 'required',
      challenge: randomToken(),
      allowCredentials: keys.map((k) => ({ id: k.credentialId })),
    });
    const [c] = await tx
      .insert(schema.challenges)
      .values({
        userId: u.id,
        tokenId: token.id,
        purpose: 'reset',
        challengeHash: digest(options.challenge),
        expiresAt: new Date(Date.now() + 300_000),
      })
      .returning();
    if (!c) throw new Error('challenge_creation_failed');
    return { challengeId: c.id, options };
  });
}
