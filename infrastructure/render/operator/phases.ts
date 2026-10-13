import { spawn } from 'node:child_process';
import type { StagingOperatorConfig } from '../../../packages/config/src/staging-operator.ts';
import {
  verifyFreshOperatorTarget,
  verifyOperatorRoles,
  verifyOperatorMigrations,
  verifyOperatorRuntime,
  withVerifiedOperatorConnection,
} from '../../../packages/db/src/staging-operator.ts';
import { stagingTarget } from './target.ts';

/** No inherited secret environment, no child output forwarded, no automatic retries. */
async function script(name: 'provision' | 'migrate', env: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [`infrastructure/render/${name}.mjs`], {
      env: { PATH: process.env.PATH, NODE_ENV: 'production', ...env },
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
    await withVerifiedOperatorConnection(
      config.adminUrl,
      'blacklist_provisioner',
      database,
      verifyFreshOperatorTarget,
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
    return { migrations: 0, tables: 0, queues: 0 };
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
  await withVerifiedOperatorConnection(config.runtimeUrl, 'blacklist_app', database, verifyOperatorRuntime);
  return counts;
}
