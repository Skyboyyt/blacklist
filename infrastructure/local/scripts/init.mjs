import { randomBytes } from 'node:crypto';
import { access, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const directory = fileURLToPath(new URL('../', import.meta.url));
await mkdir(directory, { recursive: true });
const file = resolve(directory, '.env');
try {
  await access(file);
  console.log('Existing local environment preserved.');
} catch {
  const secret = () => randomBytes(32).toString('hex');
  const admin = secret(),
    runtime = secret(),
    migrator = secret();
  const content = [
    `POSTGRES_PASSWORD=${admin}`,
    `BLACKLIST_RUNTIME_PASSWORD=${runtime}`,
    `BLACKLIST_MIGRATOR_PASSWORD=${migrator}`,
    'NODE_ENV=development',
    'APP_ORIGIN=http://localhost:3000',
    'API_HOST=127.0.0.1',
    'API_PORT=4000',
    `DATABASE_URL=postgresql://blacklist_app:${runtime}@127.0.0.1:5432/blacklist`,
    `DATABASE_MIGRATION_URL=postgresql://blacklist_migrator:${migrator}@127.0.0.1:5432/blacklist`,
    `BETTER_AUTH_SECRET=${secret()}`,
    `INTERNAL_API_TOKEN=${secret()}`,
    'API_INTERNAL_URL=http://127.0.0.1:4000',
    'TRUSTED_PROXY_CIDRS=127.0.0.1/32',
    'WEBAUTHN_RP_ID=localhost',
    'WEBAUTHN_RP_NAME=Blacklist',
    'BREAK_GLASS_ENABLED=false',
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=1025',
    'SMTP_SECURE=false',
    'EMAIL_FROM=security@example.test',
    '',
  ].join('\n');
  await writeFile(file, content, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored local configuration with separate generated credentials.');
}
