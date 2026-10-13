import { readWorkerConfig } from '@blacklist/config';
import { createDelivery } from '@blacklist/domain';
import { startWorker } from './worker.ts';
import { smtpMailer } from './mail/smtp.ts';
import { resendMailer } from './mail/resend.ts';
import { startWorkerHealth, closeWorkerHealth } from './health.ts';
import type { Server } from 'node:http';
const config = readWorkerConfig();
const ctx = createDelivery(config.DATABASE_URL, config.APP_ORIGIN);
let health: Server | undefined;
try {
  await ctx.runtime.start();
  await startWorker(ctx, config.EMAIL_PROVIDER === 'resend' ? resendMailer(config) : smtpMailer(config));
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
