import 'server-only';

/**
 * The visitor's IP as the hosting edge reports it. Only meaningful where the edge
 * overwrites `x-real-ip` / `x-forwarded-for` (Vercel does); the API trusts it only
 * together with CLIENT_IP_FORWARDING_TOKEN or the internal token.
 */
const IP = /^[0-9A-Fa-f:.]{2,45}$/u;
const IP_HEADER = 'x-bl-client-ip';
const TOKEN_HEADER = 'x-bl-client-ip-token';
type Environment = Record<string, string | undefined>;

export function visitorIp(incoming: Headers): string | null {
  const candidate =
    incoming.get('x-real-ip')?.trim() ?? incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
  return candidate && IP.test(candidate) ? candidate : null;
}

/** Headers for a server-side call that already carries the internal token. */
export function ssrClientIpHeaders(incoming: Headers): Record<string, string> {
  const ip = visitorIp(incoming);
  return ip ? { [IP_HEADER]: ip } : {};
}

/**
 * Same-origin API requests: a browser can never choose these headers. The visitor's IP
 * is forwarded with an independent secret, and only on the public API path.
 */
export function clientIpGatewayHeaders(
  path: string,
  result: Headers,
  env: Environment = process.env,
): Headers {
  const token = env['CLIENT_IP_FORWARDING_TOKEN'];
  const ip = visitorIp(result);
  result.delete(IP_HEADER);
  result.delete(TOKEN_HEADER);
  if (!path.startsWith('/api/v1/') || !token) return result;
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) throw new Error('client_ip_forwarding_configuration_invalid');
  if (ip) {
    result.set(IP_HEADER, ip);
    result.set(TOKEN_HEADER, token);
  }
  return result;
}
