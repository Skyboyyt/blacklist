import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { installStagingAccess } from '../../../apps/api/src/plugins/staging-access.ts';
import { renderRuntimeEnvironment } from '../../../infrastructure/render/runtime.ts';

const token = randomBytes(32).toString('base64url');
const env = {
  DATABASE_URL: 'postgresql://blacklist_app@db.example.test/blacklist_staging?sslmode=verify-full',
  APP_ORIGIN: 'https://staging.example.test',
  WEBAUTHN_RP_ID: 'staging.example.test',
  BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
  INTERNAL_API_TOKEN: randomBytes(32).toString('base64url'),
  STAGING_ACCESS_TOKEN: token,
  DEPLOYMENT_ENV: 'staging',
  PORT: '10000',
};
describe('Render deployment security boundaries', () => {
  it('maps the Render port and withholds operator credentials and unrelated environment', () => {
    const api = renderRuntimeEnvironment('api', {
      ...env,
      DATABASE_ADMIN_URL: 'must-not-inherit',
      DATABASE_MIGRATION_URL: 'must-not-inherit',
      BLACKLIST_RUNTIME_PASSWORD: 'must-not-inherit',
      SMTP_PASSWORD: 'worker-only',
      NEXT_PUBLIC_API_MODE: 'mock',
      BREAK_GLASS_ENABLED: 'true',
    });
    expect(api).toMatchObject({ API_HOST: '0.0.0.0', API_PORT: '10000', NODE_ENV: 'production' });
    expect(api['BREAK_GLASS_ENABLED']).toBe('false');
    for (const key of [
      'DATABASE_ADMIN_URL',
      'DATABASE_MIGRATION_URL',
      'BLACKLIST_RUNTIME_PASSWORD',
      'SMTP_PASSWORD',
      'NEXT_PUBLIC_API_MODE',
    ])
      expect(api).not.toHaveProperty(key);
    const worker = renderRuntimeEnvironment('worker', { ...env, SMTP_PASSWORD: 'worker-only' });
    expect(worker['SMTP_PASSWORD']).toBe('worker-only');
    for (const key of ['BETTER_AUTH_SECRET', 'INTERNAL_API_TOKEN', 'STAGING_ACCESS_TOKEN', 'API_PORT'])
      expect(worker).not.toHaveProperty(key);
  });
  it('rejects wrong role, unverifiable TLS, invalid port and production activation', () => {
    for (const url of [
      'sensitive-malformed-connection',
      'postgresql://blacklist_provisioner@db.example.test/staging?sslmode=verify-full',
      'postgresql://blacklist_app@db.example.test/staging?sslmode=require',
      'postgresql://blacklist_app@db.example.test/staging?sslmode=disable',
      'postgresql://blacklist_app@db.example.test/staging?sslmode=verify-full&sslmode=disable',
      'postgresql://blacklist_app@db.example.test/staging?sslmode=verify-full&user=blacklist_migrator',
      'postgresql://blacklist_app@db.example.test/staging?sslmode=verify-full&host=external.example',
      'postgresql://blacklist_app@ep-example-pooler.eu-central-1.aws.neon.tech/staging?sslmode=verify-full',
    ])
      expect(() => renderRuntimeEnvironment('api', { ...env, DATABASE_URL: url })).toThrow(
        'runtime_database_configuration_invalid',
      );
    for (const port of ['', '0', '65536', '10000bad'])
      expect(() => renderRuntimeEnvironment('api', { ...env, PORT: port })).toThrow('PORT_invalid');
    expect(() => renderRuntimeEnvironment('api', { ...env, DEPLOYMENT_ENV: 'production' })).toThrow(
      'restricted_staging_only',
    );
  });
  it('requires an independent staging secret while retaining HTTPS and exact RP configuration', () => {
    expect(readApiConfig({ ...env, NODE_ENV: 'production' }).DEPLOYMENT_ENV).toBe('staging');
    for (const value of [undefined, env.BETTER_AUTH_SECRET, env.INTERNAL_API_TOKEN])
      expect(() => readApiConfig({ ...env, STAGING_ACCESS_TOKEN: value })).toThrow('STAGING_ACCESS_TOKEN');
    expect(() => readApiConfig({ ...env, STAGING_ACCESS_TOKEN: 'injected\r\nheader' })).toThrow(
      'STAGING_ACCESS_TOKEN',
    );
    expect(() =>
      readApiConfig({ ...env, NODE_ENV: 'production', APP_ORIGIN: 'http://localhost:3000' }),
    ).toThrow('HTTPS');
  });
  it('denies direct/forged API access; only safe liveness probes bypass the staging gate', async () => {
    const app = Fastify();
    installStagingAccess(app, readApiConfig(env));
    app.get('/healthz', async () => ({ status: 'ok' }));
    app.get('/api/v1/private', async () => ({ reached: true }));
    app.post('/healthz', async () => ({ reached: true }));
    try {
      for (const supplied of [undefined, 'wrong', `${token}extra`, [token, token]]) {
        const response = await app.inject({
          url: '/api/v1/private',
          headers: supplied ? { 'x-blacklist-staging-access': supplied } : {},
        });
        expect(response.statusCode).toBe(404);
        expect(response.body).not.toContain(token);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      expect((await app.inject('/healthz')).statusCode).toBe(200);
      expect((await app.inject({ method: 'HEAD', url: '/healthz' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/healthz' })).statusCode).toBe(404);
      expect(
        (await app.inject({ url: '/api/v1/private', headers: { 'x-blacklist-staging-access': token } }))
          .statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
});
