import { readWorkerConfig } from '@blacklist/config';
import { createDelivery } from '@blacklist/domain';
import { startWorker } from './worker.ts';
import { smtpMailer } from './mail/smtp.ts';
const config = readWorkerConfig();
const ctx = createDelivery(config.DATABASE_URL, config.APP_ORIGIN);
try {
  await ctx.runtime.start();
  await startWorker(ctx, smtpMailer(config));
} catch {
  console.error('worker_startup_failed');
  await ctx.runtime.close();
  process.exitCode = 1;
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void ctx.runtime.close().catch(() => {
      console.error('worker_shutdown_failed');
      process.exitCode = 1;
    });
  });
