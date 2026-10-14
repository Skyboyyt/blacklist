import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { startDatabase } from './database.ts';

describe('disposable database fixture storage', () => {
  it('runs unchanged PostgreSQL gates on bounded temporary storage without retaining a data volume', async () => {
    const h = await startDatabase();
    try {
      const mounts = z.array(z.object({ Type: z.string(), Destination: z.string() })).parse(
        JSON.parse(
          execFileSync('docker', ['inspect', '--format', '{{json .Mounts}}', h.container], {
            encoding: 'utf8',
          }),
        ),
      );
      expect(
        execFileSync('docker', ['exec', h.container, 'stat', '-f', '-c', '%T', '/var/lib/postgresql'], {
          encoding: 'utf8',
        }).trim(),
      ).toBe('tmpfs');
      const temporary = z.record(z.string(), z.string()).parse(
        JSON.parse(
          execFileSync('docker', ['inspect', '--format', '{{json .HostConfig.Tmpfs}}', h.container], {
            encoding: 'utf8',
          }),
        ),
      );
      expect(temporary['/var/lib/postgresql']).toContain('size=536870912');
      expect(mounts.some((m) => m.Type === 'volume')).toBe(false);
      expect((await h.runtime.query('SELECT current_user AS role')).rows[0]?.role).toBe('gate_runtime');
      await expect(h.runtime.query('CREATE TABLE gate.forbidden(id int)')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await h.stop();
    }
    expect(() => execFileSync('docker', ['inspect', h.container], { stdio: 'ignore' })).toThrow();
  });
});
