import { readApiConfig } from '@blacklist/config';
import { createIdentity } from '@blacklist/domain';
import { createServer } from './server.ts';
const config = readApiConfig();
const ctx = createIdentity(config.DATABASE_URL, {
  secret: config.BETTER_AUTH_SECRET,
  origin: config.APP_ORIGIN,
  rpId: config.WEBAUTHN_RP_ID,
  rpName: config.WEBAUTHN_RP_NAME,
  breakGlassEnabled: config.BREAK_GLASS_ENABLED === 'true',
});
const server = createServer(ctx, config);
try {
  await ctx.runtime.start();
  await server.listen({ host: config.API_HOST, port: config.API_PORT });
} catch {
  console.error('api_startup_failed');
  await server.close();
  await ctx.runtime.close();
  process.exitCode = 1;
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void server
      .close()
      .then(() => ctx.runtime.close())
      .catch(() => {
        console.error('api_shutdown_failed');
        process.exitCode = 1;
      });
  });
