import { readOperatorConfig } from './config.ts';
import { executeOperatorPhase } from './phases.ts';
import { operatorStatusServer, type OperatorReceipt } from './status.ts';

let receipt: OperatorReceipt | undefined;
let token: string | undefined;
const server = operatorStatusServer(
  () => receipt,
  () => token,
);
const port = Number(process.env.PORT ?? '10000');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('operator_port_invalid');
server.listen(port, '0.0.0.0');
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
// A cold dormant build proves source/image identity before protected runtime activation.
if (process.env.OPERATOR_ENABLED === 'true') {
  try {
    const config = await readOperatorConfig();
    token = config.statusToken;
    receipt = {
      runId: config.runId,
      sourceCommit: config.sourceCommit,
      phase: config.phase,
      state: 'running',
      code: 'operator_running',
      tlsVerified: false,
      rolesVerified: false,
      migrations: 0,
      tables: 0,
      queues: 0,
    };
    const counts = await executeOperatorPhase(config);
    receipt = {
      ...receipt,
      ...counts,
      state: 'succeeded',
      code: 'operator_verified',
      tlsVerified: true,
      rolesVerified: true,
    };
    process.stdout.write('operator_verified\n');
  } catch {
    if (receipt) receipt = { ...receipt, state: 'failed', code: 'operator_failed' };
    console.error('operator_failed');
  }
}
// Hard cap on container lifetime; controller suspends/removes it well before this cap.
setTimeout(
  () => {
    server.close();
    process.exit(0);
  },
  20 * 60 * 1000,
).unref();
