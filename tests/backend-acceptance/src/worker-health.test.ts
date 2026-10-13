import { describe, expect, it, vi } from 'vitest';
import { startWorkerHealth, closeWorkerHealth } from '../../../apps/worker/src/health.ts';
import { renderRuntimeEnvironment } from '../../../infrastructure/render/runtime.ts';

describe('separate free-web worker health boundary', () => {
  it('probes the actual supplied database check and exposes no private data or mutation route', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const server = await startWorkerHealth(probe, 0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_listener_missing');
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ status: 'ok' });
      expect(probe).toHaveBeenCalledTimes(1);
      const head = await fetch(`${base}/healthz`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      for (const [route, method] of [
        ['/healthz', 'POST'],
        ['/api/v1/auth/login', 'GET'],
      ]) {
        const denied = await fetch(`${base}${route}`, { method });
        expect(denied.status).toBe(404);
      }
      expect(probe).toHaveBeenCalledTimes(2);
    } finally {
      await closeWorkerHealth(server);
    }
  });
  it('reports database outage as sanitized 503 and closes cleanly', async () => {
    const server = await startWorkerHealth(async () => {
      throw new Error('private driver payload');
    }, 0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_listener_missing');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('{"status":"unavailable"}');
      expect(response.headers.get('cache-control')).toBe('no-store');
    } finally {
      await closeWorkerHealth(server);
    }
    await closeWorkerHealth(undefined);
  });
  it('fails port conflicts safely and never passes API/signer/operator credentials to a web worker', async () => {
    const server = await startWorkerHealth(async () => {}, 0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_listener_missing');
    try {
      await expect(startWorkerHealth(async () => {}, address.port)).rejects.toThrow(
        'worker_health_start_failed',
      );
    } finally {
      await closeWorkerHealth(server);
    }
    const result = renderRuntimeEnvironment('worker', {
      DEPLOYMENT_ENV: 'staging',
      WORKER_WEB_SERVICE: 'true',
      PORT: '10000',
      DATABASE_URL: 'postgresql://blacklist_app@db.neon.tech/staging?sslmode=verify-full',
      BETTER_AUTH_SECRET: 'must-not-pass',
      STAGING_ACCESS_TOKEN: 'must-not-pass',
      DATABASE_ADMIN_URL: 'must-not-pass',
    });
    expect(result['WORKER_HEALTH_PORT']).toBe('10000');
    for (const key of ['API_PORT', 'BETTER_AUTH_SECRET', 'STAGING_ACCESS_TOKEN', 'DATABASE_ADMIN_URL'])
      expect(result).not.toHaveProperty(key);
  });
});
