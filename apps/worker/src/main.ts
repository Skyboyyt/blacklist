import { readWorkerConfig, resolveEvidenceStorage, resolveRegistrationAccess } from '@blacklist/config';
import { createDelivery, createEvidenceStorage, createProcessorClient } from '@blacklist/domain';
import { startWorker } from './worker.ts';
import { smtpMailer } from './mail/smtp.ts';
import { resendMailer } from './mail/resend.ts';
import { startWorkerHealth, closeWorkerHealth } from './health.ts';
import type { Server } from 'node:http';
const config = readWorkerConfig();
const ctx = createDelivery(config.DATABASE_URL, config.APP_ORIGIN, resolveRegistrationAccess(config));
let health: Server | undefined;
try {
  await ctx.runtime.start();
  const storage = resolveEvidenceStorage(config);
  await startWorker(
    ctx,
    config.EMAIL_PROVIDER === 'resend' ? resendMailer(config) : smtpMailer(config),
    2,
    storage && config.EVIDENCE_PROCESSOR_URL
      ? {
          storage: createEvidenceStorage(storage),
          processor: createProcessorClient(config.EVIDENCE_PROCESSOR_URL),
        }
      : undefined,
  );
  if (config.WORKER_HEALTH_PORT !== undefined)
    health = await startWorkerHealth(() => ctx.runtime.checkConnection(), config.WORKER_HEALTH_PORT);
} catch {
  console.error('worker_startup_failed');
  await closeWorkerHealth(health);
  await ctx.runtime.close();
  process.exitCode = 1;
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void closeWorkerHealth(health)
      .then(() => ctx.runtime.close())
      .catch(() => {
        console.error('worker_shutdown_failed');
        process.exitCode = 1;
      });
  });
