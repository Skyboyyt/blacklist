import { randomBytes } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { provisionCloudRoles } from '../../../packages/db/src/provision.ts';

describe('operator input rejection before database access', () => {
  it('rejects unsafe runtime identifiers before a connection or SQL can be attempted', async () => {
    const connect = vi.spyOn(Pool.prototype, 'connect');
    try {
      for (const role of ['UPPER', 'app;DROP SCHEMA blacklist', 'a'.repeat(64), ''])
        await expect(migrate('postgresql://127.0.0.1:1/postgres', role)).rejects.toThrow(
          'invalid_runtime_role',
        );
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });
  it('requires sufficient password entropy material for both roles before provisioning', async () => {
    const connect = vi.spyOn(Pool.prototype, 'connect'),
      adequate = randomBytes(32).toString('hex');
    try {
      for (const passwords of [
        { runtime: 'short', migrator: adequate },
        { runtime: adequate, migrator: 'short' },
      ])
        await expect(provisionCloudRoles('postgresql://127.0.0.1:1/postgres', passwords)).rejects.toThrow(
          'provisioning_password_configuration_invalid',
        );
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });
});
