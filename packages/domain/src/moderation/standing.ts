import { randomBytes } from 'node:crypto';
import { schema, eq, type Database } from '@blacklist/db';
import { verifyEvmMessage, verifySolanaMessage } from '@blacklist/chains';
import type { UserActor } from '../access/types.ts';
import { DomainError, refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { addressOf } from './subjects.ts';

// Standing (moderation §6): decided per case, recording what was proven and when. Control
// of an address proves authority at a point in time, never identity or innocence.

const CHALLENGE_TTL_MS = 10 * 60_000;
type Purpose = 'appeal' | 'response';

export type StandingProofInput =
  | {
      mechanism: 'signature';
      simulated?: true | undefined;
      challengeId?: string | undefined;
      signature?: string | undefined;
    }
  | {
      mechanism: 'authority_signature';
      authorityRole: string;
      simulated?: true | undefined;
      challengeId?: string | undefined;
      signature?: string | undefined;
    }
  | { mechanism: 'dns_txt'; domain: string; simulated?: true | undefined; challengeId?: string | undefined }
  | {
      mechanism: 'documentary';
      explanation: string;
      evidence: readonly unknown[];
      txRefs?: readonly { chain: string; hash: string }[] | undefined;
      urls?: readonly string[] | undefined;
    };

/** EIP-4361 / SIWS-style text built entirely by the server (moderation §6.4). */
function challengeText(input: {
  origin: string;
  address: string;
  chainId: string;
  purpose: Purpose;
  findingId: string | null;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  challengeId: string;
}) {
  const what =
    input.purpose === 'appeal'
      ? `an appeal against Blacklist finding ${input.findingId ?? ''}`
      : 'a response about this address on Blacklist';
  return [
    `${new URL(input.origin).host} wants you to prove control of:`,
    input.address,
    '',
    `Prove control of this address for ${what}. This signature does not authorize any transaction or token approval and costs nothing.`,
    '',
    `URI: ${input.origin}`,
    `Network: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
    `Request ID: ${input.challengeId}`,
  ].join('\n');
}

export async function issueChallenge(
  ctx: IdentityContext,
  tx: Database,
  actor: UserActor,
  purpose: Purpose,
  target: { subjectId: string; findingId: string | null },
) {
  const subject = await addressOf(tx, target.subjectId);
  if (!subject) throw new DomainError('not_found');
  const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.slug, subject.chain));
  if (!network) throw new DomainError('not_found');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const challengeId = crypto.randomUUID();
  const nonce = randomBytes(16).toString('hex');
  const message = challengeText({
    origin: ctx.settings.origin,
    address: subject.address,
    chainId: network.chainId,
    purpose,
    findingId: target.findingId,
    nonce,
    issuedAt,
    expiresAt,
    challengeId,
  });
  await tx.insert(schema.standingChallenges).values({
    id: challengeId,
    userId: actor.userId,
    sessionId: actor.sessionId,
    purpose,
    findingId: target.findingId,
    subjectId: target.subjectId,
    mechanism: 'signature',
    chainId: network.chainId,
    address: subject.address,
    nonce,
    message,
    expiresAt,
  });
  return { challengeId, message, expiresAt: expiresAt.toISOString() };
}

/**
 * Turns a proof into a standing claim. Signatures are checked against the stored challenge
 * text (a client-supplied message is never used) and consumed; documentary standing waits
 * for a standing reviewer.
 */
export async function claimStanding(
  tx: Database,
  actor: UserActor,
  purpose: Purpose,
  target: { subjectId: string; findingId: string | null },
  proof: StandingProofInput,
) {
  if (proof.mechanism === 'documentary') {
    if (proof.evidence.length)
      throw refuse(
        'evidence_unavailable',
        'Document images are not available yet. Add transactions or links instead.',
      );
    const [claim] = await tx
      .insert(schema.standingClaims)
      .values({
        claimantUserId: actor.userId,
        mechanism: 'documentary',
        proofRefs: { explanation: proof.explanation, txRefs: proof.txRefs ?? [], urls: proof.urls ?? [] },
        outcome: 'pending',
        scopeStatement: 'Documentary standing awaits a standing reviewer.',
      })
      .returning();
    if (!claim) throw new Error('claim_creation_failed');
    return claim;
  }
  if (proof.mechanism === 'dns_txt')
    throw refuse(
      'invalid_transition',
      'DNS standing applies to project domains, which arrive with project profiles.',
    );
  if (proof.mechanism === 'authority_signature')
    throw refuse(
      'temporarily_unavailable',
      'Authority checks need verified chain data, which is not enabled yet. Use documentary standing instead.',
    );
  if (proof.simulated || !proof.challengeId || !proof.signature)
    throw refuse('invalid_transition', 'Sign the challenge with the wallet that controls the address.');
  const [challenge] = await tx
    .select()
    .from(schema.standingChallenges)
    .where(eq(schema.standingChallenges.id, proof.challengeId))
    .for('update');
  // Bound to member, session, purpose and target; single use; ten minutes.
  if (
    !challenge ||
    challenge.userId !== actor.userId ||
    challenge.sessionId !== actor.sessionId ||
    challenge.purpose !== purpose ||
    challenge.subjectId !== target.subjectId ||
    challenge.findingId !== target.findingId ||
    challenge.consumedAt ||
    challenge.expiresAt.getTime() <= Date.now()
  )
    throw refuse(
      'invalid_transition',
      'This challenge is not valid for this request. Get a new one and sign it.',
    );
  const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.chainId, challenge.chainId));
  const valid =
    network?.family === 'evm'
      ? await verifyEvmMessage(challenge.address, challenge.message, proof.signature)
      : network?.family === 'solana'
        ? verifySolanaMessage(challenge.address, challenge.message, proof.signature)
        : false;
  await tx
    .update(schema.standingChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(schema.standingChallenges.id, challenge.id));
  if (!valid) throw refuse('invalid_transition', 'The signature does not match this address and challenge.');
  const now = new Date();
  const [claim] = await tx
    .insert(schema.standingClaims)
    .values({
      claimantUserId: actor.userId,
      mechanism: 'signature',
      proofRefs: { challengeId: challenge.id, signature: proof.signature },
      outcome: 'granted',
      scopeStatement: `Proved control of ${challenge.address} at ${now.toISOString()}. This shows authority at that time only, not identity, innocence or authorship of past conduct.`,
      decidedAt: now,
    })
    .returning();
  if (!claim) throw new Error('claim_creation_failed');
  return claim;
}

export function standingView(claim: typeof schema.standingClaims.$inferSelect) {
  return {
    mechanism: claim.mechanism as 'signature' | 'authority_signature' | 'dns_txt' | 'documentary',
    outcome: claim.outcome as 'granted' | 'denied' | 'pending',
    scopeStatement: claim.scopeStatement,
    decidedAt: (claim.decidedAt ?? claim.createdAt).toISOString(),
  };
}
