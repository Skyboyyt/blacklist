import { spawn } from 'node:child_process';
import type { StagingOperatorConfig } from '../../../packages/config/src/staging-operator.ts';
import {
  verifyFreshOperatorTarget,
  operatorTargetInventory,
  verifyOperatorRoles,
  verifyOperatorMigrations,
  verifyOperatorRuntime,
  withVerifiedOperatorConnection,
} from '../../../packages/db/src/staging-operator.ts';
import { stagingTarget } from './target.ts';

/** Failure investigation only: no scripts, DDL, DML or credential rotation. */
export async function inspectOperatorTarget(config: StagingOperatorConfig) {
  if (config.phase !== 'provision') throw new Error('operator_configuration_invalid');
  return withVerifiedOperatorConnection(
    config.adminUrl,
    'blacklist_provisioner',
    stagingTarget.database,
    async (client, transport) => {
      const inventory = await operatorTargetInventory(client);
      let rolesVerified = false;
      if (inventory.targetRoles === 2) {
        await verifyOperatorRoles(client);
        rolesVerified = true;
      }
      return { ...inventory, ...transport, rolesVerified };
    },
  );
}

/** No inherited secret environment, no child output forwarded, no automatic retries. */
async function script(name: 'provision' | 'migrate', env: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [`infrastructure/render/${name}.mjs`], {
      env: { PATH: process.env['PATH'], NODE_ENV: 'production', ...env },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 120000);
    child.once('error', () => {
      clearTimeout(timeout);
      reject(new Error('operator_child_failed'));
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error('operator_child_failed'));
    });
  });
}
export async function executeOperatorPhase(config: StagingOperatorConfig) {
  const database = stagingTarget.database;
  if (config.phase === 'provision') {
    const transport = await withVerifiedOperatorConnection(
      config.adminUrl,
      'blacklist_provisioner',
      database,
      async (client, transport) => {
        await verifyFreshOperatorTarget(client);
        return transport;
      },
    );
    await script('provision', {
      DATABASE_ADMIN_URL: config.adminUrl,
      BLACKLIST_RUNTIME_PASSWORD: config.runtimePassword,
      BLACKLIST_MIGRATOR_PASSWORD: config.migratorPassword,
    });
    await withVerifiedOperatorConnection(
      config.adminUrl,
      'blacklist_provisioner',
      database,
      verifyOperatorRoles,
    );
    return { migrations: 0, tables: 0, queues: 0, ...transport };
  }
  await withVerifiedOperatorConnection(
    config.migrationUrl,
    'blacklist_migrator',
    database,
    verifyOperatorRoles,
  );
  await script('migrate', { DATABASE_MIGRATION_URL: config.migrationUrl });
  await script('migrate', { DATABASE_MIGRATION_URL: config.migrationUrl });
  const counts = await withVerifiedOperatorConnection(
    config.migrationUrl,
    'blacklist_migrator',
    database,
    verifyOperatorMigrations,
  );
  const transport = await withVerifiedOperatorConnection(
    config.runtimeUrl,
    'blacklist_app',
    database,
    async (client, transport) => {
      await verifyOperatorRuntime(client);
      return transport;
    },
  );
  return { ...counts, ...transport };
}
