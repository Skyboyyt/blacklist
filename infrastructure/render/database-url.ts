/** Cloud connection URLs have one explicit TLS policy and no driver option overrides. */
export function verifiedDatabaseUrl(input: string | undefined, role?: string): URL {
  try {
    const url = new URL(input ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.hostname.includes('-pooler.') ||
      !url.username ||
      url.pathname.length < 2 ||
      url.hash ||
      (role !== undefined && url.username !== role) ||
      url.searchParams.size !== 1 ||
      url.searchParams.get('sslmode') !== 'verify-full'
    )
      throw new Error('invalid');
    return url;
  } catch {
    throw new Error('runtime_database_configuration_invalid');
  }
}
