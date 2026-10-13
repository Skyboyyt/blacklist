import { provisionCloudRoles } from '../../packages/db/src/provision.ts';
import { verifiedDatabaseUrl } from './database-url.ts';

// Separate operator session only. Do not add these variables to API/worker services.
const required = ['DATABASE_ADMIN_URL', 'BLACKLIST_RUNTIME_PASSWORD', 'BLACKLIST_MIGRATOR_PASSWORD'];
if (required.some((name) => !process.env[name])) throw new Error('Missing cloud provisioning fields');
try {
  verifiedDatabaseUrl(process.env.DATABASE_ADMIN_URL);
  await provisionCloudRoles(process.env.DATABASE_ADMIN_URL, {
    runtime: process.env.BLACKLIST_RUNTIME_PASSWORD,
    migrator: process.env.BLACKLIST_MIGRATOR_PASSWORD,
  });
  process.stdout.write('Cloud DDL/DML roles provisioned; existing credentials preserved.\n');
} catch {
  console.error('cloud_provisioning_failed');
  process.exitCode = 1;
}
