import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
const mode = process.argv[2];
const common = ['NODE_ENV', 'DATABASE_URL', 'APP_ORIGIN', 'WEBAUTHN_RP_ID', 'WEBAUTHN_RP_NAME'];
const fields = {
  api: [
    ...common,
    'BETTER_AUTH_SECRET',
    'API_HOST',
    'API_PORT',
    'INTERNAL_API_TOKEN',
    'TRUSTED_PROXY_CIDRS',
    'BREAK_GLASS_ENABLED',
  ],
  worker: [...common, 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_SECURE', 'EMAIL_FROM'],
};
if (!Object.hasOwn(fields, mode ?? '')) throw new Error('Choose api or worker');
const values = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const selected = Object.fromEntries(
  fields[mode]
    .filter((key) => values[key] !== undefined)
    .map((key) => [key, process.env[key] ?? values[key]]),
);
// Runtime processes receive neither the bootstrap database password nor the
// migrator connection. Worker receives no cookie-signing secret.
const child = spawn(process.execPath, [`apps/${mode}/src/main.ts`], {
  env: { PATH: process.env.PATH, ...selected },
  stdio: 'inherit',
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
