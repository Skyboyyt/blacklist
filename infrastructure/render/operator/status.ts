import { timingSafeEqual } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';

const failureCodes = [
  'operator_source_mismatch',
  'operator_environment_invalid',
  'operator_secret_file_invalid',
  'operator_target_invalid',
  'runtime_database_configuration_invalid',
  'operator_tls_not_verified',
  'operator_server_tls_not_verified',
  'operator_database_identity_invalid',
  'operator_target_not_fresh',
  'operator_roles_unsafe',
  'operator_grants_unsafe',
  'operator_runtime_owns_schema',
  'operator_migration_hash_mismatch',
  'operator_schema_invalid',
  'operator_queues_invalid',
  'operator_runtime_grants_unsafe',
  'operator_runtime_permissions_missing',
  'operator_negative_check_failed',
  'operator_child_failed',
  'operator_database_authentication_failed',
  'operator_database_permission_denied',
  'operator_database_object_missing',
  'operator_database_unreachable',
  'operator_certificate_verification_failed',
  'operator_inspection_only',
] as const;
type FailureCode = (typeof failureCodes)[number] | 'operator_failed';
const driverFailures: Record<string, FailureCode> = {
  '28P01': 'operator_database_authentication_failed',
  '42501': 'operator_database_permission_denied',
  '42P01': 'operator_database_object_missing',
  ECONNREFUSED: 'operator_database_unreachable',
  ETIMEDOUT: 'operator_database_unreachable',
  ENETUNREACH: 'operator_database_unreachable',
  ERR_TLS_CERT_ALTNAME_INVALID: 'operator_certificate_verification_failed',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'operator_certificate_verification_failed',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'operator_certificate_verification_failed',
  CERT_HAS_EXPIRED: 'operator_certificate_verification_failed',
};
export function safeOperatorFailure(error: unknown): FailureCode {
  if (error instanceof Error) {
    const known = failureCodes.find((code) => error.message === code);
    if (known) return known;
    if ('code' in error && typeof error.code === 'string')
      return driverFailures[error.code] ?? 'operator_failed';
  }
  return 'operator_failed';
}
export type OperatorReceipt = {
  runId: string;
  sourceCommit: string;
  phase: 'provision' | 'migrate';
  state: 'running' | 'succeeded' | 'failed';
  code: 'operator_running' | 'operator_verified' | FailureCode;
  tlsVerified: boolean;
  rolesVerified: boolean;
  migrations: number;
  tables: number;
  queues: number;
  targetRoles: number;
  targetObjects: number;
  serverReportsTls: boolean;
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
