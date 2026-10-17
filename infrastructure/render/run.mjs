import { spawn } from 'node:child_process';
import { processorRuntimeEnvironment, renderRuntimeEnvironment } from './runtime.ts';

const service = process.argv[2];
if (!['api', 'worker', 'processor'].includes(service)) throw new Error('Choose api, worker or processor');
if (process.versions.node !== '24.21.0') throw new Error('Pinned Node 24.21.0 required');
const selected = service === 'processor' ? processorRuntimeEnvironment() : renderRuntimeEnvironment(service);
const app = service === 'processor' ? 'evidence-processor' : service;
// Keep the established workspace symlinks: Node 24 does not strip TS copied into node_modules.
const child = spawn(process.execPath, [`apps/${app}/src/main.ts`], {
  cwd: new URL('../../', import.meta.url),
  env: { PATH: process.env.PATH, ...selected },
  stdio: 'inherit',
});
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    stopping = true;
    child.kill(signal);
  });
child.on('error', () => {
  console.error('render_runtime_start_failed');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (stopping && signal ? 0 : 1);
});
