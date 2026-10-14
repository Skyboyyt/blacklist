import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { schema } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  authenticationChallenge,
  assureSession,
  type StaffRole,
  type StaffAction,
  type AssertionInput,
} from '@blacklist/domain';
import { syntheticPassword, type ApplicationFixture } from './application-fixture.ts';

/** Real ECDSA assertions on synthetic database identities; does not bypass verification. */
export async function addAssuredStaff(f: ApplicationFixture, role: StaffRole = 'admin') {
  const user = await f.addUser('staff');
  const keys = [];
  for (let i = 0; i < 2; i++) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      jwk = pair.publicKey.export({ format: 'jwk' });
    if (!jwk.x || !jwk.y) throw new Error('fixture_public_key_missing');
    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ]),
    );
    const credentialId = randomBytes(32).toString('base64url');
    const [key] = await f.ctx.runtime.db
      .insert(schema.authenticators)
      .values({
        userId: user.id,
        credentialId,
        publicKey: Buffer.from(cose).toString('base64url'),
        signCount: 0,
        transports: ['usb'],
        aaguid: '00000000-0000-0000-0000-000000000000',
        backupEligible: false,
        backupState: false,
        label: `Synthetic key ${i + 1}`,
      })
      .returning();
    if (!key) throw new Error('fixture_key_missing');
    keys.push({ key, privateKey: pair.privateKey });
  }
  await f.ctx.runtime.db
    .insert(schema.roles)
    .values({ userId: user.id, role, grantedVia: 'operator_cli', sourceId: randomUUID() });
  const first = keys[0];
  if (!first) throw new Error('fixture_key_missing');
  const primary = first;
  let counter = 0;
  function assertion(challenge: string): AssertionInput['response'] {
    const client = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin: f.ctx.settings.origin, crossOrigin: false }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++counter);
    const data = Buffer.concat([
      createHash('sha256').update(f.ctx.settings.rpId).digest(),
      Buffer.from([0x05]),
      count,
    ]);
    const signature = sign(
      'sha256',
      Buffer.concat([data, createHash('sha256').update(client).digest()]),
      primary.privateKey,
    );
    return {
      id: primary.key.credentialId,
      rawId: primary.key.credentialId,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: client.toString('base64url'),
        authenticatorData: data.toString('base64url'),
        signature: signature.toString('base64url'),
      },
    };
  }
  const login = await signIn(f.ctx, user.email, syntheticPassword),
    headers = new Headers({ cookie: login.cookies.map((c) => c.split(';')[0]).join('; ') });
  const pending = await resolveSession(f.ctx.runtime, f.ctx.auth, headers, true);
  if (!pending) throw new Error('fixture_session_missing');
  const challenge = await authenticationChallenge(f.ctx, pending, 'login');
  await assureSession(f.ctx, pending, {
    challengeId: challenge.challengeId,
    response: assertion(challenge.options.challenge),
  });
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, headers);
  if (!actor) throw new Error('fixture_assured_session_missing');
  return {
    user,
    actor,
    headers,
    keys: keys.map((k) => k.key),
    respond(challenge: { challengeId: string; options: { challenge: string } }): AssertionInput {
      return { challengeId: challenge.challengeId, response: assertion(challenge.options.challenge) };
    },
    async proof(action: StaffAction) {
      const challenge = await authenticationChallenge(f.ctx, actor, 'stepup', action);
      return { challengeId: challenge.challengeId, response: assertion(challenge.options.challenge) };
    },
  };
}
