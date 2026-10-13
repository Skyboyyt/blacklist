import 'server-only';

const header = 'x-blacklist-staging-access';
type StagingEnvironment = Record<string, string | undefined>;

export function stagingAccessHeaders(env: StagingEnvironment = process.env): Record<string, string> {
  if (env['DEPLOYMENT_ENV'] !== 'staging') return {};
  const token = env['STAGING_ACCESS_TOKEN'];
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/u.test(token))
    throw new Error('staging_access_configuration_invalid');
  return { [header]: token };
}

/** Vercel Deployment Protection restricts visitors; this protects the Render ingress. */
export function stagingGatewayHeaders(
  path: string,
  incoming: Headers,
  env: StagingEnvironment = process.env,
): Headers {
  const result = new Headers(incoming);
  // A browser must never choose the shared server-to-server staging credential.
  result.delete(header);
  if (path.startsWith('/api/v1/')) {
    for (const [name, value] of Object.entries(stagingAccessHeaders(env))) result.set(name, value);
  }
  return result;
}
