import type { Page } from '@playwright/test';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';

export function browserRegistration(page: Page, options: PublicKeyCredentialCreationOptionsJSON) {
  return page.evaluate(async (options) => {
    const decode = (v: string) =>
      Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)).buffer;
    const encode = (v: ArrayBuffer) =>
      btoa(String.fromCharCode(...new Uint8Array(v)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
    const credential = await navigator.credentials.create({
      publicKey: {
        rp: options.rp,
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        attestation: 'none',
        challenge: decode(options.challenge),
        user: { ...options.user, id: decode(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((c) => ({
          type: 'public-key',
          id: decode(c.id),
        })),
      },
    });
    if (
      !(credential instanceof PublicKeyCredential) ||
      !(credential.response instanceof AuthenticatorAttestationResponse)
    )
      throw new Error('test_registration_failed');
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      type: 'public-key' as const,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: encode(credential.response.clientDataJSON),
        attestationObject: encode(credential.response.attestationObject),
        transports: credential.response.getTransports() as Array<'usb'>,
      },
    };
  }, options);
}
export function browserAssertion(page: Page, options: PublicKeyCredentialRequestOptionsJSON) {
  return page.evaluate(async (options) => {
    const decode = (v: string) =>
      Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)).buffer;
    const encode = (v: ArrayBuffer) =>
      btoa(String.fromCharCode(...new Uint8Array(v)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
    const credential = await navigator.credentials.get({
      publicKey: {
        rpId: options.rpId,
        userVerification: 'required',
        challenge: decode(options.challenge),
        allowCredentials: options.allowCredentials?.map((c) => ({ type: 'public-key', id: decode(c.id) })),
      },
    });
    if (
      !(credential instanceof PublicKeyCredential) ||
      !(credential.response instanceof AuthenticatorAssertionResponse)
    )
      throw new Error('test_assertion_failed');
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      type: 'public-key' as const,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: encode(credential.response.clientDataJSON),
        authenticatorData: encode(credential.response.authenticatorData),
        signature: encode(credential.response.signature),
        ...(credential.response.userHandle ? { userHandle: encode(credential.response.userHandle) } : {}),
      },
    };
  }, options);
}
