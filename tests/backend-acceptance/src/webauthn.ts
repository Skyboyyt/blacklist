import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import type { Harness } from './database.js';
import { digest } from './registration.js';
import * as schema from './schema.js';

export async function resetChallenge(h: Harness, rawToken: string) {
  const [token] = await h.db
    .select()
    .from(schema.tokens)
    .where(and(eq(schema.tokens.tokenHash, digest(rawToken)), eq(schema.tokens.purpose, 'password_reset')));
  if (!token || token.state !== 'active' || token.expiresAt.getTime() <= Date.now())
    throw new Error('reset_link_invalid');
  const [user] = await h.db.select().from(schema.user).where(eq(schema.user.id, token.userId));
  const authenticators = await h.db
    .select()
    .from(schema.authenticators)
    .where(eq(schema.authenticators.userId, token.userId));
  if (user?.accountKind !== 'staff' || authenticators.length < 2) throw new Error('staff_assurance_required');
  const options = await generateAuthenticationOptions({
    rpID: 'localhost',
    userVerification: 'required',
    allowCredentials: authenticators.map((item) => ({ id: item.credentialId })),
  });
  const [challenge] = await h.db
    .insert(schema.challenges)
    .values({
      userId: token.userId,
      tokenId: token.id,
      purpose: 'reset',
      challengeHash: digest(options.challenge),
      expiresAt: new Date(Date.now() + 300_000),
    })
    .returning();
  if (!challenge) throw new Error('challenge_creation_failed');
  return { options, challengeId: challenge.id };
}

// The receipt is created only after actual cryptographic verification; a JSON
// "verified" flag from a client cannot be used as staff assurance.
export class VerifiedStaffReset {
  readonly challengeId: string;
  readonly tokenId: string;
  readonly userId: string;
  readonly authenticatorId: string;
  readonly priorCounter: number;
  readonly nextCounter: number;
  private constructor(
    challengeId: string,
    tokenId: string,
    userId: string,
    authenticatorId: string,
    priorCounter: number,
    nextCounter: number,
  ) {
    this.challengeId = challengeId;
    this.tokenId = tokenId;
    this.userId = userId;
    this.authenticatorId = authenticatorId;
    this.priorCounter = priorCounter;
    this.nextCounter = nextCounter;
    Object.freeze(this);
  }
  static async verify(h: Harness, challengeId: string, response: AuthenticationResponseJSON, origin: string) {
    const [challenge] = await h.db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId));
    if (
      !challenge ||
      challenge.purpose !== 'reset' ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now()
    )
      throw new Error('staff_assurance_required');
    const [authenticator] = await h.db
      .select()
      .from(schema.authenticators)
      .where(
        and(
          eq(schema.authenticators.credentialId, response.id),
          eq(schema.authenticators.userId, challenge.userId),
        ),
      );
    if (!authenticator) throw new Error('staff_assurance_required');
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (value) => digest(value) === challenge.challengeHash,
      expectedOrigin: origin,
      expectedRPID: 'localhost',
      requireUserVerification: true,
      credential: {
        id: authenticator.credentialId,
        publicKey: Buffer.from(authenticator.publicKey, 'base64url'),
        counter: authenticator.signCount,
      },
    });
    if (!result.verified || !result.authenticationInfo.userVerified)
      throw new Error('staff_assurance_required');
    return new VerifiedStaffReset(
      challenge.id,
      challenge.tokenId,
      challenge.userId,
      authenticator.id,
      authenticator.signCount,
      result.authenticationInfo.newCounter,
    );
  }
}
