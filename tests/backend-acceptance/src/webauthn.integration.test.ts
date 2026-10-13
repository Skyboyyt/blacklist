import { randomBytes } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { chromium } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { startDatabase } from './database.js';
import { issueReset } from './delivery.js';
import { createMember, tokenFromLink } from './fixtures.js';
import { resetPassword } from './reset.js';
import { createGateServer } from './server.js';
import { resetChallenge, VerifiedStaffReset } from './webauthn.js';
import * as schema from './schema.js';

test('S16 staff path: real UV assertion; reset/challenge rollback together; wrong origin, token, expiry and replay fail', async () => {
  const h = await startDatabase();
  const secret = randomBytes(48).toString('base64url');
  const server = await createGateServer(h, secret);
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  try {
    const member = await createMember(h, secret);
    await h.db.update(schema.user).set({ accountKind: 'staff' }).where(eq(schema.user.id, member.userId));
    const page = await browser.newPage();
    await page.goto(`${server.origin}/probe`);
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    for (let index = 0; index < 2; index++) {
      const options = await generateRegistrationOptions({
        rpID: 'localhost',
        rpName: 'Blacklist acceptance',
        userName: member.email,
        userID: Buffer.from(member.userId),
        attestationType: 'none',
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      });
      const response = await page.evaluate(async (options) => {
        const decode = (value: string) =>
          Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
            .buffer;
        const encode = (value: ArrayBuffer) =>
          btoa(String.fromCharCode(...new Uint8Array(value)))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
        const result = (await navigator.credentials.create({
          publicKey: {
            rp: options.rp,
            pubKeyCredParams: options.pubKeyCredParams,
            authenticatorSelection: options.authenticatorSelection,
            attestation: 'none',
            timeout: options.timeout,
            extensions: { credProps: true },
            challenge: decode(options.challenge),
            user: { ...options.user, id: decode(options.user.id) },
            excludeCredentials: options.excludeCredentials?.map((credential) => ({
              type: 'public-key' as const,
              id: decode(credential.id),
            })),
          },
        })) as PublicKeyCredential | null;
        if (!result) throw new Error('credential creation failed');
        const attestation = result.response as AuthenticatorAttestationResponse;
        return {
          id: result.id,
          rawId: encode(result.rawId),
          type: 'public-key' as const,
          clientExtensionResults: result.getClientExtensionResults(),
          response: {
            clientDataJSON: encode(attestation.clientDataJSON),
            attestationObject: encode(attestation.attestationObject),
          },
        };
      }, options);
      const verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: options.challenge,
        expectedOrigin: server.origin,
        expectedRPID: 'localhost',
        requireUserVerification: true,
      });
      expect(verified.verified).toBe(true);
      if (!verified.verified) throw new Error('registration verification failed');
      await h.db.insert(schema.authenticators).values({
        userId: member.userId,
        credentialId: verified.registrationInfo.credential.id,
        publicKey: Buffer.from(verified.registrationInfo.credential.publicKey).toString('base64url'),
        signCount: verified.registrationInfo.credential.counter,
      });
    }
    let token = '';
    await issueReset(h, member.requestId, async ({ link }) => {
      token = tokenFromLink(link);
      return 'accepted_for_delivery';
    });
    const { options, challengeId } = await resetChallenge(h, token);
    const assertion = await page.evaluate(async (options) => {
      const decode = (value: string) =>
        Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
          .buffer;
      const encode = (value: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(value)))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replaceAll('=', '');
      const credential = (await navigator.credentials.get({
        publicKey: {
          rpId: options.rpId,
          userVerification: options.userVerification,
          timeout: options.timeout,
          challenge: decode(options.challenge),
          allowCredentials: options.allowCredentials?.map((item) => ({
            type: 'public-key' as const,
            id: decode(item.id),
          })),
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error('assertion failed');
      const response = credential.response as AuthenticatorAssertionResponse;
      return {
        id: credential.id,
        rawId: encode(credential.rawId),
        type: 'public-key' as const,
        clientExtensionResults: credential.getClientExtensionResults(),
        response: {
          clientDataJSON: encode(response.clientDataJSON),
          authenticatorData: encode(response.authenticatorData),
          signature: encode(response.signature),
          ...(response.userHandle ? { userHandle: encode(response.userHandle) } : {}),
        },
      };
    }, options);
    await expect(
      VerifiedStaffReset.verify(h, challengeId, assertion, 'https://wrong.example'),
    ).rejects.toBeDefined();
    const proof = await VerifiedStaffReset.verify(h, challengeId, assertion, server.origin);
    const other = await createMember(h, secret);
    let otherToken = '';
    await issueReset(h, other.requestId, async ({ link }) => {
      otherToken = tokenFromLink(link);
      return 'accepted_for_delivery';
    });
    await h.db.update(schema.user).set({ accountKind: 'staff' }).where(eq(schema.user.id, other.userId));
    await expect(
      resetPassword(h, otherToken, 'another long test passphrase', undefined, proof),
    ).rejects.toThrow('reset_link_invalid');
    for (let step = 1; step <= 7; step++) {
      await expect(resetPassword(h, token, 'another long test passphrase', step, proof)).rejects.toThrow(
        'injected_reset_crash',
      );
      const [challenge] = await h.db
        .select()
        .from(schema.challenges)
        .where(eq(schema.challenges.id, challengeId));
      expect(challenge?.consumedAt).toBeNull();
    }
    await h.db
      .update(schema.challenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.challenges.id, challengeId));
    await expect(resetPassword(h, token, 'another long test passphrase', undefined, proof)).rejects.toThrow(
      'reset_link_invalid',
    );
    await h.db
      .update(schema.challenges)
      .set({ expiresAt: new Date(Date.now() + 300_000) })
      .where(eq(schema.challenges.id, challengeId));
    await resetPassword(h, token, 'another long test passphrase', undefined, proof);
    await expect(VerifiedStaffReset.verify(h, challengeId, assertion, server.origin)).rejects.toThrow(
      'staff_assurance_required',
    );
    await expect(resetPassword(h, token, 'another long test passphrase', undefined, proof)).rejects.toThrow(
      'reset_link_invalid',
    );
  } finally {
    await browser.close();
    await server.app.close();
    await h.stop();
  }
});
