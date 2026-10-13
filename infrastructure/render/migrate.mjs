import { migrate } from '../../packages/db/src/migrate.ts';
import { verifiedDatabaseUrl } from './database-url.ts';

// Separate release/operator session only; neither application migrates on boot.
try {
  const url = verifiedDatabaseUrl(process.env.DATABASE_MIGRATION_URL, 'blacklist_migrator');
  await migrate(url.toString(), 'blacklist_app');
  process.stdout.write('Reviewed application migrations and queues provisioned.\n');
} catch {
  console.error('cloud_migration_failed');
  process.exitCode = 1;
}
