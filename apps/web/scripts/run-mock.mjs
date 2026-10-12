// Runs `next <command>` in mock mode (fictional data, no backend).
// Mock builds use a separate output directory so they never mix with production builds.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const args = process.argv.slice(2);

const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_API_MODE: 'mock', BLACKLIST_DIST_DIR: '.next-mock' },
});
child.on('exit', (code) => process.exit(code ?? 1));
