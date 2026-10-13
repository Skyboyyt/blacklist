import { readOperatorConfig, validateOperatorConfiguration } from './config.ts';
import { stagingOperatorMode } from '../../../packages/config/src/staging-operator.ts';
import { executeOperatorPhase, inspectOperatorTarget } from './phases.ts';
import { operatorStatusServer, safeOperatorFailure, type OperatorReceipt } from './status.ts';

let receipt: OperatorReceipt | undefined;
let token: string | undefined;
const server = operatorStatusServer(
  () => receipt,
  () => token,
);
const port = Number(process.env['PORT'] ?? '10000');
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
// Hard cap on container lifetime; controller suspends/removes it well before this cap.
setTimeout(
  () => {
    server.close();
    process.exit(0);
  },
  20 * 60 * 1000,
).unref();

// A cold dormant build proves source/image identity before protected runtime activation.
if (process.env['OPERATOR_ENABLED'] === 'true') {
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
      targetRoles: 0,
      targetObjects: 0,
    };
    await validateOperatorConfiguration(config);
    if (stagingOperatorMode(process.env['OPERATOR_INSPECT_ONLY']) === 'inspect') {
      const inventory = await inspectOperatorTarget(config);
      receipt = {
        ...receipt,
        ...inventory,
        state: 'failed',
        code: 'operator_inspection_only',
        tlsVerified: true,
      };
    } else {
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
    }
  } catch (error) {
    const code = safeOperatorFailure(error);
    if (receipt) receipt = { ...receipt, state: 'failed', code };
    console.error('operator_failed');
  }
}
