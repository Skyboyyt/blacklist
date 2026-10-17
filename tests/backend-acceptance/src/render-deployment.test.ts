import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { installStagingAccess } from '../../../apps/api/src/plugins/staging-access.ts';
import {
  processorRuntimeEnvironment,
  renderRuntimeEnvironment,
} from '../../../infrastructure/render/runtime.ts';
import { API_CONFIG_FIELDS, WORKER_CONFIG_FIELDS } from '@blacklist/config';

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
  it('keeps provider credentials API-only and research disabled until plan/key prerequisites pass', () => {
    const keys = {
      ALCHEMY_ETHEREUM_API_KEY: randomBytes(32).toString('hex'),
      HELIUS_RPC_API_KEY: randomBytes(32).toString('hex'),
    };
    expect(readApiConfig(env).RESEARCH_ENABLED).toBe('false');
    for (const missing of [{}, { RPC_PLAN_VERIFIED: 'true' }, { ...keys }])
      expect(() => readApiConfig({ ...env, ...missing, RESEARCH_ENABLED: 'true' })).toThrow(
        'Research requires',
      );
    expect(
      readApiConfig({ ...env, ...keys, RESEARCH_ENABLED: 'true', RPC_PLAN_VERIFIED: 'true' })
        .ALCHEMY_INDEXED_HISTORY_VERIFIED,
    ).toBe('false');
    const api = renderRuntimeEnvironment('api', { ...env, ...keys }),
      worker = renderRuntimeEnvironment('worker', { ...env, ...keys });
    for (const key of Object.keys(keys)) {
      expect(api).toHaveProperty(key);
      expect(worker).not.toHaveProperty(key);
    }
  });
  it('passes every setting each service reads, except those the wrapper sets itself', () => {
    // Regression: RISK_PUBLIC_BANDS, CLIENT_IP_FORWARDING_TOKEN, REGISTRATION_* and the RPC
    // budget window were read by the API but silently dropped on Render.
    const wrapperOwned = [
      'NODE_ENV',
      'DEPLOYMENT_ENV',
      'BREAK_GLASS_ENABLED',
      'API_HOST',
      'API_PORT',
      'WORKER_HEALTH_PORT',
    ];
    for (const [service, fields] of [
      ['api', API_CONFIG_FIELDS],
      ['worker', WORKER_CONFIG_FIELDS],
    ] as const) {
      const all = Object.fromEntries(fields.map((key) => [key, `value-${key}`]));
      const selected = renderRuntimeEnvironment(service, { ...all, ...env });
      for (const key of fields.filter((k) => !wrapperOwned.includes(k) && !(k in env)))
        expect(selected, `${service} drops ${key}`).toHaveProperty(key, `value-${key}`);
    }
    // The processor URL and storage keys never reach the web tier; provider keys stay off the worker.
    const worker = renderRuntimeEnvironment('worker', { ...env, ALCHEMY_ETHEREUM_API_KEY: 'x' });
    expect(worker).not.toHaveProperty('ALCHEMY_ETHEREUM_API_KEY');
  });
  it('starts the evidence processor with non-secret settings only, and refuses any credential', () => {
    const settings = {
      DEPLOYMENT_ENV: 'staging',
      PORT: '10000',
      EVIDENCE_STORAGE_ORIGIN: 'https://s3.example.test',
      S3_BUCKET_QUARANTINE: 'bl-quarantine',
      S3_BUCKET_DERIVATIVES: 'bl-derivatives',
      PATH: '/usr/bin',
    };
    expect(processorRuntimeEnvironment(settings)).toEqual({
      NODE_ENV: 'production',
      PORT: '10000',
      EVIDENCE_STORAGE_ORIGIN: 'https://s3.example.test',
      S3_BUCKET_QUARANTINE: 'bl-quarantine',
      S3_BUCKET_DERIVATIVES: 'bl-derivatives',
    });
    for (const key of [
      'DATABASE_URL',
      'S3_SECRET_ACCESS_KEY',
      'S3_ACCESS_KEY_ID',
      'BETTER_AUTH_SECRET',
      'INTERNAL_API_TOKEN',
      'RESEND_API_KEY',
      'SMTP_PASSWORD',
    ])
      expect(() => processorRuntimeEnvironment({ ...settings, [key]: 'x' })).toThrow(
        'processor_must_not_hold_secrets',
      );
    expect(() => processorRuntimeEnvironment({ ...settings, DEPLOYMENT_ENV: 'production' })).toThrow(
      'restricted_staging_only',
    );
  });
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
