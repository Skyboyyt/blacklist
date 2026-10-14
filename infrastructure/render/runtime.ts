import { verifiedDatabaseUrl } from './database-url.ts';

type Service = 'api' | 'worker';
const common = ['DATABASE_URL', 'APP_ORIGIN', 'WEBAUTHN_RP_ID', 'WEBAUTHN_RP_NAME', 'NODE_EXTRA_CA_CERTS'];
const fields: Record<Service, string[]> = {
  api: [
    ...common,
    'BETTER_AUTH_SECRET',
    'INTERNAL_API_TOKEN',
    'TRUSTED_PROXY_CIDRS',
    'STAGING_ACCESS_TOKEN',
    'STAGING_INGRESS_DIAGNOSTIC_KEY',
    'STAGING_INGRESS_DIAGNOSTIC_UNTIL',
    'MAIL_WORKER_HEALTH_URL',
    'RESEARCH_ENABLED',
    'RPC_PLAN_VERIFIED',
    'ALCHEMY_INDEXED_HISTORY_VERIFIED',
    'ALCHEMY_TOKEN_BALANCES_VERIFIED',
    'ALCHEMY_ETHEREUM_API_KEY',
    'HELIUS_RPC_API_KEY',
    'RPC_API_REQUESTS_PER_MINUTE',
    'RPC_API_TOTAL_REQUEST_BUDGET',
  ],
  worker: [
    ...common,
    'EMAIL_PROVIDER',
    'RESEND_API_KEY',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_SECURE',
    'EMAIL_FROM',
  ],
};

export function renderRuntimeEnvironment(service: Service, env = process.env): Record<string, string> {
  if (env['DEPLOYMENT_ENV'] !== 'staging') throw new Error('restricted_staging_only');
  // Certificate validation remains enabled. Never use sslmode=require/no-verify here.
  verifiedDatabaseUrl(env['DATABASE_URL'], 'blacklist_app');
  const selected: Record<string, string> = {
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: 'staging',
    BREAK_GLASS_ENABLED: 'false',
  };
  for (const key of fields[service]) if (env[key] !== undefined) selected[key] = env[key];
  if (service === 'api' || env['WORKER_WEB_SERVICE'] === 'true') {
    const port = env['PORT'];
    if (!port || !/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535)
      throw new Error('PORT_invalid');
    if (service === 'api') {
      selected['API_HOST'] = '0.0.0.0';
      selected['API_PORT'] = port;
    } else selected['WORKER_HEALTH_PORT'] = port;
  }
  return selected;
}
