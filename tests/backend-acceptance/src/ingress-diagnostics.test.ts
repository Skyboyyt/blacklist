import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readApiConfig } from '@blacklist/config';
import { renderRuntimeEnvironment } from '../../../infrastructure/render/runtime.ts';
import { installIngressDiagnostics } from '../../../apps/api/src/plugins/ingress-diagnostics.ts';

const env = {
  DATABASE_URL: 'postgresql://blacklist_app@db.example.test/staging?sslmode=verify-full',
  APP_ORIGIN: 'https://staging.example.test',
  WEBAUTHN_RP_ID: 'staging.example.test',
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
  STAGING_ACCESS_TOKEN: randomBytes(32).toString('hex'),
  DEPLOYMENT_ENV: 'staging',
  PORT: '10000',
};
const diagnostic = {
  STAGING_INGRESS_DIAGNOSTIC_KEY: randomBytes(32).toString('hex'),
  STAGING_INGRESS_DIAGNOSTIC_UNTIL: new Date(Date.now() + 10 * 60_000).toISOString(),
};
const headers = {
  'x-bl-ingress-diagnostic': diagnostic.STAGING_INGRESS_DIAGNOSTIC_KEY,
  'x-bl-internal-token': env.INTERNAL_API_TOKEN,
  'x-blacklist-staging-access': env.STAGING_ACCESS_TOKEN,
};
const receipt = z.strictObject({
  peer: z.string(),
  forwardedIsSingleIp: z.boolean(),
  forwardedContainsProbe: z.boolean(),
  probeAcceptedAsClientIp: z.boolean(),
  internalPeers: z.array(z.string()).max(8),
  internalAccepted: z.number().int().nonnegative(),
  internalDenied: z.number().int().nonnegative(),
});
function fixture(extra: Record<string, string | undefined> = diagnostic) {
  const config = readApiConfig({ ...env, ...extra });
  const app = Fastify();
  // This unit fixture measures metadata only, never user authentication.
  app.decorateRequest('clientPrefix', 'ip4:127.0.0.1');
  installIngressDiagnostics(app, config);
  for (const url of ['/healthz', '/api/v1/viewer', '/other']) app.get(url, async () => ({ status: 'ok' }));
  app.post('/healthz', async () => ({ status: 'ok' }));
  return { app, config };
}
describe('bounded operator ingress diagnostics', () => {
  it('is disabled by default and expires at the fixed deadline across restarts', async () => {
    for (const extra of [
      {},
      { ...diagnostic, STAGING_INGRESS_DIAGNOSTIC_UNTIL: new Date(0).toISOString() },
    ]) {
      const { app } = fixture(extra);
      try {
        const r = await app.inject({ url: '/healthz', headers });
        expect(r.statusCode).toBe(200);
        expect(r.json()).toEqual({ status: 'ok' });
        expect(r.headers).not.toHaveProperty('x-bl-ingress-receipt');
      } finally {
        await app.close();
      }
    }
  });
  it('requires three independent complete credentials, rejecting missing, wrong and duplicated headers', async () => {
    const { app } = fixture();
    try {
      for (const name of Object.keys(headers)) {
        for (const bad of [undefined, 'wrong', ['duplicate', 'duplicate']]) {
          const supplied: Record<string, string | string[]> = { ...headers };
          if (bad === undefined) delete supplied[name];
          else supplied[name] = bad;
          const r = await app.inject({ url: '/healthz', headers: supplied });
          expect(r.headers).not.toHaveProperty('x-bl-ingress-receipt');
          expect(r.json()).toEqual({ status: 'ok' });
        }
      }
    } finally {
      await app.close();
    }
  });
  it('returns only private socket metadata on the fixed safe paths; no raw forwarding headers or secrets', async () => {
    const { app, config } = fixture();
    try {
      for (const peer of ['127.0.0.1', '10.111.7.1', '::1', '::ffff:10.111.7.1']) {
        const r = await app.inject({
          url: '/api/v1/viewer',
          remoteAddress: peer,
          headers: { ...headers, 'x-forwarded-for': '192.0.2.123' },
        });
        const encoded = r.headers['x-bl-ingress-receipt'];
        expect(typeof encoded).toBe('string');
        if (typeof encoded !== 'string') throw new Error('test_receipt_missing');
        const decoded = Buffer.from(encoded, 'base64url').toString();
        expect(receipt.parse(JSON.parse(decoded))).toEqual({
          peer,
          forwardedIsSingleIp: true,
          forwardedContainsProbe: true,
          probeAcceptedAsClientIp: false,
          internalPeers: [],
          internalAccepted: 0,
          internalDenied: 0,
        });
        for (const secret of Object.values(headers)) expect(decoded).not.toContain(secret);
        expect(decoded).not.toContain('192.0.2.123');
        expect(r.json()).toEqual({ status: 'ok' });
      }
      expect(config.TRUSTED_PROXY_CIDRS).toBe('');
    } finally {
      await app.close();
    }
  });
  it('never discloses a public socket IP or adds diagnostic headers to mutations/other routes', async () => {
    const { app } = fixture();
    try {
      for (const peer of ['192.0.2.5', '2001:db8::5', '::ffff:192.0.2.5']) {
        const r = await app.inject({ url: '/healthz', remoteAddress: peer, headers });
        expect(r.headers).not.toHaveProperty('x-bl-ingress-receipt');
      }
      for (const request of [{ url: '/other' }, { url: '/healthz', method: 'POST' as const }]) {
        const r = await app.inject({ ...request, headers });
        expect(r.headers).not.toHaveProperty('x-bl-ingress-receipt');
      }
    } finally {
      await app.close();
    }
  });
  it('rejects partial, reusable, non-staging and overlong-lived configuration without leaking values', () => {
    const invalid = [
      { STAGING_INGRESS_DIAGNOSTIC_KEY: diagnostic.STAGING_INGRESS_DIAGNOSTIC_KEY },
      { STAGING_INGRESS_DIAGNOSTIC_UNTIL: diagnostic.STAGING_INGRESS_DIAGNOSTIC_UNTIL },
      { ...diagnostic, DEPLOYMENT_ENV: 'production' },
      { ...diagnostic, STAGING_INGRESS_DIAGNOSTIC_UNTIL: new Date(Date.now() + 31 * 60_000).toISOString() },
      ...[env.BETTER_AUTH_SECRET, env.INTERNAL_API_TOKEN, env.STAGING_ACCESS_TOKEN].map((key) => ({
        ...diagnostic,
        STAGING_INGRESS_DIAGNOSTIC_KEY: key,
      })),
    ];
    for (const extra of invalid) {
      expect(() => readApiConfig({ ...env, ...extra })).toThrow('STAGING_INGRESS_DIAGNOSTIC');
      expect(() => readApiConfig({ ...env, ...extra })).not.toThrow(
        diagnostic.STAGING_INGRESS_DIAGNOSTIC_KEY,
      );
    }
  });
  it('withholds diagnostic credentials from worker runtime and keeps the API scope explicit', () => {
    const settings = { ...env, ...diagnostic };
    expect(renderRuntimeEnvironment('api', settings)['STAGING_INGRESS_DIAGNOSTIC_KEY']).toBe(
      diagnostic.STAGING_INGRESS_DIAGNOSTIC_KEY,
    );
    expect(renderRuntimeEnvironment('worker', settings)).not.toHaveProperty('STAGING_INGRESS_DIAGNOSTIC_KEY');
    expect(renderRuntimeEnvironment('worker', settings)).not.toHaveProperty(
      'STAGING_INGRESS_DIAGNOSTIC_UNTIL',
    );
  });
});
