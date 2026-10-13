import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { installMailWorkerWake } from '../../../apps/api/src/plugins/mail-worker-wake.ts';
import { renderRuntimeEnvironment } from '../../../infrastructure/render/runtime.ts';

const target = 'https://fixture-worker.onrender.com/healthz';
const env = {
  NODE_ENV: 'test',
  DEPLOYMENT_ENV: 'staging',
  DATABASE_URL: 'postgresql://blacklist_app@fixture.example.test/staging?sslmode=verify-full',
  APP_ORIGIN: 'https://fixture.example.test',
  WEBAUTHN_RP_ID: 'fixture.example.test',
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
  STAGING_ACCESS_TOKEN: randomBytes(32).toString('hex'),
  PORT: '10000',
};
function fixture(enabled = true) {
  const app = Fastify();
  installMailWorkerWake(
    app,
    readApiConfig({ ...env, ...(enabled ? { MAIL_WORKER_HEALTH_URL: target } : {}) }),
  );
  for (const path of ['/api/v1/auth/register/start', '/api/v1/auth/password/forgot', '/other']) {
    app.post(path, async (_request, reply) => reply.code(202).send({ kind: 'accepted' }));
    app.get(path, async (_request, reply) => reply.code(202).send({ kind: 'accepted' }));
  }
  app.post('/rejected', async (_request, reply) => reply.code(403).send({ code: 'origin_rejected' }));
  return app;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('approved request-triggered worker liveness', () => {
  it('is disabled by default and never runs for other paths/methods/rejected requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const enabled of [false, true]) {
      const app = fixture(enabled);
      try {
        const requests = enabled
          ? [
              { method: 'GET' as const, url: '/api/v1/auth/register/start' },
              { method: 'POST' as const, url: '/other' },
              { method: 'POST' as const, url: '/rejected' },
            ]
          : [{ method: 'POST' as const, url: '/api/v1/auth/register/start' }];
        for (const request of requests) await app.inject(request);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    }
  });
  it('returns normal202before the health response, sends no actor information and bounds one in-flight request', async () => {
    let complete: ((value: Response) => void) | undefined;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const app = fixture();
    try {
      const first = await app.inject({ method: 'POST', url: '/api/v1/auth/register/start' });
      expect(first.statusCode).toBe(202);
      expect(first.json()).toEqual({ kind: 'accepted' });
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot' })).statusCode).toBe(
        202,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(target);
      const options = fetch.mock.calls[0]?.[1];
      expect(Object.keys(options).sort()).toEqual(['method', 'redirect', 'signal']);
      expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      complete?.(new Response(null));
      await new Promise((resolve) => setImmediate(resolve));
      await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot' });
      expect(fetch).toHaveBeenCalledTimes(2);
      complete?.(new Response(null));
    } finally {
      await app.close();
    }
  });
  it('treats health failure as liveness failure only, logging a generic code without retry or identity success', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('sensitive provider content'));
    vi.stubGlobal('fetch', fetch);
    const app = fixture();
    const warn = vi.spyOn(app.log, 'warn');
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register/start' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(response.json()).toEqual({ kind: 'accepted' });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith({ code: 'mail_worker_wake_unavailable' }, 'mail_worker_wake');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive');
    } finally {
      await app.close();
    }
  });
  it('aborts at the configured90second bound without scheduling a retry', async () => {
    const deadline = new AbortController(),
      timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetch = vi
      .fn()
      .mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener('abort', () => reject(new Error('deadline'))),
          ),
      );
    vi.stubGlobal('fetch', fetch);
    const app = fixture();
    try {
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register/start' })).statusCode).toBe(202);
      expect(timeout).toHaveBeenCalledWith(90_000);
      deadline.abort();
      await new Promise((resolve) => setImmediate(resolve));
      expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it('aborts pending liveness during graceful shutdown', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
    vi.stubGlobal('fetch', fetch);
    const app = fixture();
    await app.inject({ method: 'POST', url: '/api/v1/auth/register/start' });
    const signal = fetch.mock.calls[0]?.[1].signal;
    expect(signal.aborted).toBe(false);
    await app.close();
    expect(signal.aborted).toBe(true);
  });
  it('rejects insecure/arbitrary targets and non-staging configuration without leaking configured values', () => {
    for (const value of [
      'invalid',
      'http://fixture-worker.onrender.com/healthz',
      'https://127.0.0.1/healthz',
      'https://foreign.example/healthz',
      target + '?token=fictional',
      target + '#token',
      'https://secret:secret@fixture-worker.onrender.com/healthz',
      'https://fixture-worker.onrender.com:123/healthz',
      'https://fixture-worker.onrender.com/actions',
    ]) {
      expect(() => readApiConfig({ ...env, MAIL_WORKER_HEALTH_URL: value })).toThrow(
        'MAIL_WORKER_HEALTH_URL',
      );
      try {
        readApiConfig({ ...env, MAIL_WORKER_HEALTH_URL: value });
      } catch (error) {
        expect(String(error)).not.toContain(value);
      }
    }
    expect(() =>
      readApiConfig({ ...env, DEPLOYMENT_ENV: 'production', MAIL_WORKER_HEALTH_URL: target }),
    ).toThrow('staging only');
  });
  it('passes only to the API runtime and excludes worker settings', () => {
    const settings = { ...env, MAIL_WORKER_HEALTH_URL: target };
    expect(renderRuntimeEnvironment('api', settings)['MAIL_WORKER_HEALTH_URL']).toBe(target);
    expect(renderRuntimeEnvironment('worker', settings)).not.toHaveProperty('MAIL_WORKER_HEALTH_URL');
  });
});
