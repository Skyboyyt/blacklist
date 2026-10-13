import { spawnSync } from 'node:child_process';

const service = process.argv[2];
if (service !== 'api' && service !== 'worker') throw new Error('Choose api or worker');
if (process.versions.node !== '24.21.0') throw new Error('Pinned Node 24.21.0 required');
const installed = spawnSync('pnpm', ['--version'], { encoding: 'utf8' });
const command = installed.status === 0 && installed.stdout.trim() === '12.7.0' ? 'pnpm' : 'npm';
const prefix = command === 'pnpm' ? [] : ['exec', '--yes', '--package=pnpm@12.7.0', '--', 'pnpm'];
const buildEnvironment = { NODE_ENV: 'development' };
for (const key of [
  'PATH',
  'HOME',
  'CI',
  'TMPDIR',
  'npm_config_cache',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
])
  if (process.env[key] !== undefined) buildEnvironment[key] = process.env[key];
function run(args) {
  const result = spawnSync(command, [...prefix, ...args], { env: buildEnvironment, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['install', '--frozen-lockfile']);
run(['build:backend']);
