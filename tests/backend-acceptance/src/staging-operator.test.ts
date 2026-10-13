import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseStagingOperatorConfig } from '../../../packages/config/src/staging-operator.ts';
import {
  operatorUrl,
  stagingTarget,
  validateOperatorTarget,
} from '../../../infrastructure/render/operator/target.ts';
import {
  operatorStatusServer,
  type OperatorReceipt,
} from '../../../infrastructure/render/operator/status.ts';

const commit = 'a'.repeat(40);
function config() {
  const url = new URL(`postgresql://${stagingTarget.host}/${stagingTarget.database}?sslmode=verify-full`);
  url.username = 'blacklist_provisioner';
  url.password = randomBytes(32).toString('hex');
  return {
    runId: randomUUID(),
    sourceCommit: commit,
    statusToken: randomBytes(32).toString('hex'),
    phase: 'provision' as const,
    adminUrl: url.toString(),
    runtimePassword: randomBytes(32).toString('hex'),
    migratorPassword: randomBytes(32).toString('hex'),
  };
}
describe('isolated staging operator boundaries', () => {
  it('accepts only exact direct staging target, verified TLS and operator role', () => {
    const settings = config();
    validateOperatorTarget(parseStagingOperatorConfig(settings), commit);
    for (const mutate of [
      (u: URL) => {
        u.hostname = u.hostname.replace('.c-7.', '-pooler.c-7.');
      },
      (u: URL) => {
        u.hostname = 'foreign.example.test';
      },
      (u: URL) => {
        u.pathname = '/production';
      },
      (u: URL) => {
        u.username = 'blacklist_app';
      },
      (u: URL) => {
        u.searchParams.set('sslmode', 'require');
      },
      (u: URL) => {
        u.searchParams.set('sslrootcert', 'override');
      },
      (u: URL) => {
        u.password = '';
      },
      (u: URL) => {
        u.port = '9999';
      },
    ]) {
      const url = new URL(settings.adminUrl);
      mutate(url);
      expect(() => operatorUrl(url.toString(), 'blacklist_provisioner')).toThrow();
    }
    expect(() => validateOperatorTarget(settings, 'b'.repeat(40))).toThrow('operator_source_mismatch');
    expect(() => validateOperatorTarget(settings, undefined)).toThrow('operator_source_mismatch');
  });
  it('rejects unknown fields and cross-phase credentials with sanitized errors', () => {
    const settings = config();
    for (const value of [
      { ...settings, apiKey: randomBytes(32).toString('hex') },
      { ...settings, migrationUrl: settings.adminUrl },
      { ...settings, phase: 'migrate' },
      { ...settings, runtimePassword: 'weak' },
      { ...settings, sourceCommit: 'main' },
    ])
      expect(() => parseStagingOperatorConfig(value)).toThrow('operator_configuration_invalid');
    expect(() =>
      parseStagingOperatorConfig({ ...settings, phase: 'migrate', adminUrl: settings.adminUrl }),
    ).toThrow();
  });
  it('exposes only liveness publicly and authenticated allowlisted status; HTTP cannot trigger work', async () => {
    const settings = config();
    const receipt: OperatorReceipt = {
      runId: settings.runId,
      sourceCommit: commit,
      phase: 'provision',
      state: 'failed',
      code: 'operator_failed',
      tlsVerified: false,
      rolesVerified: false,
      migrations: 0,
      tables: 0,
      queues: 0,
    };
    const server = operatorStatusServer(
      () => receipt,
      () => settings.statusToken,
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture_address_missing');
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ alive: true });
      for (const token of ['', 'short', 'f'.repeat(64), 'f'.repeat(65)])
        expect(
          (await fetch(`${base}/status`, { headers: { 'x-blacklist-operator-status': token } })).status,
        ).toBe(404);
      expect(
        (
          await fetch(`${base}/status`, {
            method: 'POST',
            headers: { 'x-blacklist-operator-status': settings.statusToken },
          })
        ).status,
      ).toBe(404);
      const result = await fetch(`${base}/status`, {
        headers: { 'x-blacklist-operator-status': settings.statusToken },
      });
      expect(result.status).toBe(200);
      expect(result.headers.get('cache-control')).toBe('no-store');
      const body = await result.text();
      expect(JSON.parse(body)).toEqual(receipt);
      expect(body).not.toContain(settings.adminUrl);
      expect(body).not.toContain(settings.runtimePassword);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
  it('keeps Docker credentials out of ARG/ENV/build mounts and excludes protected files', async () => {
    const docker = await readFile(
      new URL('../../../infrastructure/render/operator/Dockerfile', import.meta.url),
      'utf8',
    );
    const ignore = await readFile(new URL('../../../.dockerignore', import.meta.url), 'utf8');
    expect(docker).toContain('node:24.21.0-bookworm-slim@sha256:');
    expect(docker).toContain('USER node');
    expect(docker).not.toMatch(/DATABASE_|--mount=type=secret|TOKEN/);
    expect(docker.match(/^ARG .+$/gm)).toEqual(['ARG NODE_EXTRA_CA_CERTS']);
    expect(ignore).toContain('**/blacklist-staging-operator.json');
    expect(ignore).toContain('**/.env');
  });
});
