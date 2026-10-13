import { timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '@blacklist/config';
import { ipPrefix } from '@blacklist/domain';

const privatePeers = new BlockList();
for (const [ip, bits] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const)
  privatePeers.addSubnet(ip, bits, 'ipv4');
privatePeers.addSubnet('::1', 128, 'ipv6');
privatePeers.addSubnet('fc00::', 7, 'ipv6');

const matches = (value: unknown, secret: string | undefined) =>
  typeof value === 'string' &&
  typeof secret === 'string' &&
  Buffer.byteLength(value) === Buffer.byteLength(secret) &&
  timingSafeEqual(Buffer.from(value), Buffer.from(secret));
const privatePeer = (peer: string) => {
  const family = isIP(peer);
  return !!family && privatePeers.check(peer, family === 4 ? 'ipv4' : 'ipv6');
};

/** Operator-only, expiring metadata; it never learns or grants proxy trust. */
export function installIngressDiagnostics(app: FastifyInstance, config: ApiConfig) {
  const internalPeers = new Set<string>();
  let internalAccepted = 0,
    internalDenied = 0;
  const active = () =>
    config.DEPLOYMENT_ENV === 'staging' &&
    !!config.STAGING_INGRESS_DIAGNOSTIC_KEY &&
    !!config.STAGING_INGRESS_DIAGNOSTIC_UNTIL &&
    Date.now() < Date.parse(config.STAGING_INGRESS_DIAGNOSTIC_UNTIL);
  app.addHook('onResponse', async (request, reply) => {
    if (
      !active() ||
      request.routeOptions.url !== '/api/internal/v1/viewer' ||
      !['GET', 'HEAD'].includes(request.method) ||
      !matches(request.headers['x-bl-internal-token'], config.INTERNAL_API_TOKEN) ||
      !matches(request.headers['x-blacklist-staging-access'], config.STAGING_ACCESS_TOKEN)
    )
      return;
    const peer = request.raw.socket.remoteAddress ?? '';
    if (privatePeer(peer) && internalPeers.size < 8) internalPeers.add(peer);
    if (reply.statusCode === 200) internalAccepted++;
    else if (reply.statusCode === 404) internalDenied++;
  });
  app.addHook('preHandler', async (request, reply) => {
    if (
      !active() ||
      !['GET', 'HEAD'].includes(request.method) ||
      !['/healthz', '/api/v1/viewer'].includes(request.routeOptions.url ?? '') ||
      !matches(request.headers['x-bl-ingress-diagnostic'], config.STAGING_INGRESS_DIAGNOSTIC_KEY) ||
      !matches(request.headers['x-bl-internal-token'], config.INTERNAL_API_TOKEN) ||
      !matches(request.headers['x-blacklist-staging-access'], config.STAGING_ACCESS_TOKEN)
    )
      return;
    const peer = request.raw.socket.remoteAddress ?? '';
    if (!privatePeer(peer)) return;
    const forwarded = request.headers['x-forwarded-for'];
    const probe = '192.0.2.123';
    const receipt = {
      peer,
      forwardedIsSingleIp: typeof forwarded === 'string' && isIP(forwarded) !== 0,
      forwardedContainsProbe: typeof forwarded === 'string' && forwarded.includes(probe),
      probeAcceptedAsClientIp: request.clientPrefix === ipPrefix(probe),
      internalPeers: [...internalPeers],
      internalAccepted,
      internalDenied,
    };
    // Never return cookies, tokens, raw forwarding headers or public client IPs.
    reply.header('x-bl-ingress-receipt', Buffer.from(JSON.stringify(receipt)).toString('base64url'));
  });
}
