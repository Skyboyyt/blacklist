import { timingSafeEqual } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';

export type OperatorReceipt = {
  runId: string;
  sourceCommit: string;
  phase: 'provision' | 'migrate';
  state: 'running' | 'succeeded' | 'failed';
  code: 'operator_running' | 'operator_verified' | 'operator_failed';
  tlsVerified: boolean;
  rolesVerified: boolean;
  migrations: number;
  tables: number;
  queues: number;
};
export function validStatusToken(input: string | string[] | undefined, expected: string) {
  return (
    typeof input === 'string' &&
    /^[a-f0-9]{64}$/.test(input) &&
    timingSafeEqual(Buffer.from(input), Buffer.from(expected))
  );
}
function respond(response: ServerResponse, status: number, body: string, head = false) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(head ? undefined : body);
}
export function operatorStatusServer(
  read: () => OperatorReceipt | undefined,
  token: () => string | undefined,
) {
  const server = createServer(
    { maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 },
    (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 404, '{}');
      if (req.url === '/healthz') return respond(res, 200, '{"alive":true}', req.method === 'HEAD');
      const expected = token();
      if (
        req.url !== '/status' ||
        !expected ||
        !validStatusToken(req.headers['x-blacklist-operator-status'], expected)
      )
        return respond(res, 404, '{}', req.method === 'HEAD');
      const receipt = read();
      return respond(
        res,
        receipt ? 200 : 503,
        receipt ? JSON.stringify(receipt) : '{}',
        req.method === 'HEAD',
      );
    },
  );
  server.maxConnections = 20;
  return server;
}
