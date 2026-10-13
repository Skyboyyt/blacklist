import { migrate } from '../src/migrate.ts';
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error('DATABASE_MIGRATION_URL required');
try {
  await migrate(url, process.env.BLACKLIST_RUNTIME_ROLE ?? 'blacklist_app');
  console.log('Reviewed migrations and queue provisioning complete.');
} catch {
  console.error('Migration failed; inspect database state without exporting credentials.');
  process.exitCode = 1;
}
