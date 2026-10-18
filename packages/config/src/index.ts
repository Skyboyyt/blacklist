import { z } from 'zod';
import { BlockList, isIP } from 'node:net';

const databaseUrl = z
  .string()
  .url()
  .refine((v) => {
    try {
      return ['postgres:', 'postgresql:'].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  });
const appOrigin = z
  .string()
  .url()
  .refine((v) => {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return false;
    }
    return (
      u.origin === v &&
      !u.username &&
      !u.password &&
      (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost'))
    );
  });
const shared = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: databaseUrl,
  APP_ORIGIN: appOrigin,
  BETTER_AUTH_SECRET: z.string().min(32),
  BREAK_GLASS_ENABLED: z.enum(['true', 'false']).default('false'),
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().min(1).default('Blacklist'),
  /** Member sign-up is public by default; `invite` is an opt-in gate (ADR 0019, superseded 2026-10-16). */
  REGISTRATION_MODE: z.enum(['open', 'invite']).optional(),
  /** Comma-separated SHA-256 hex digests of invited emails (trimmed, lower-cased). */
  REGISTRATION_INVITE_EMAILS_SHA256: z
    .string()
    .default('')
    .refine((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .every((item) => item === '' || /^[a-f0-9]{64}$/u.test(item)),
    ),
});
const bucket = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u)
  .optional();
const httpsOrLocal = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return (url.protocol === 'https:' || local) && !url.username && !url.password && url.pathname === '/';
  })
  .transform((value) => new URL(value).origin)
  .optional();
/** Image evidence (Phase 9b; ADR 0004, ADR 0020). Off unless every storage field is set. */
const evidence = {
  EVIDENCE_ENABLED: z.enum(['true', 'false']).default('false'),
  S3_ENDPOINT: httpsOrLocal,
  S3_REGION: z
    .string()
    .regex(/^[a-z0-9-]{2,32}$/u)
    .optional(),
  S3_ACCESS_KEY_ID: z
    .string()
    .regex(/^[A-Za-z0-9]{8,128}$/u)
    .optional(),
  S3_SECRET_ACCESS_KEY: z
    .string()
    .regex(/^[A-Za-z0-9/+=]{16,128}$/u)
    .optional(),
  S3_BUCKET_QUARANTINE: bucket,
  S3_BUCKET_EVIDENCE: bucket,
  S3_BUCKET_DERIVATIVES: bucket,
};
const apiSchema = shared.extend({
  ...evidence,
  DEPLOYMENT_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  STAGING_ACCESS_TOKEN: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4107),
  INTERNAL_API_TOKEN: z.string().min(32),
  /**
   * Shared with the web tier only. The web proxy sends the visitor's IP with this secret
   * so per-client throttles do not collapse into the gateway's one address.
   */
  CLIENT_IP_FORWARDING_TOKEN: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/u)
    .optional(),
  RESEARCH_ENABLED: z.enum(['true', 'false']).default('false'),
  /** Public risk bands stay off until the owner signs the V1 calibration (O-12; Phase 10 plan). */
  RISK_PUBLIC_BANDS: z.enum(['true', 'false']).default('false'),
  RPC_PLAN_VERIFIED: z.enum(['true', 'false']).default('false'),
  ALCHEMY_INDEXED_HISTORY_VERIFIED: z.enum(['true', 'false']).default('false'),
  ALCHEMY_TOKEN_BALANCES_VERIFIED: z.enum(['true', 'false']).default('false'),
  ALCHEMY_ETHEREUM_API_KEY: z
    .string()
    .min(8)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  HELIUS_RPC_API_KEY: z
    .string()
    .min(8)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  /** Optional second Ethereum provider: confirms facts behind automatic scoring (ADR 0021). */
  INFURA_ETHEREUM_API_KEY: z
    .string()
    .min(8)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  RPC_API_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(30),
  RPC_API_TOTAL_REQUEST_BUDGET: z.coerce.number().int().min(1).max(10000).default(100),
  /** The total budget is spent per window and then restored (default one day). */
  RPC_API_BUDGET_WINDOW_HOURS: z.coerce.number().int().min(1).max(744).default(24),
  MAIL_WORKER_HEALTH_URL: z
    .string()
    .url()
    .refine((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      return (
        url.protocol === 'https:' &&
        /^[a-z0-9-]+\.onrender\.com$/u.test(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port &&
        url.pathname === '/healthz' &&
        !url.search &&
        !url.hash
      );
    })
    .optional(),
  STAGING_INGRESS_DIAGNOSTIC_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/u)
    .optional(),
  STAGING_INGRESS_DIAGNOSTIC_UNTIL: z.iso.datetime().optional(),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .default('')
    .refine((value) => {
      try {
        for (const cidr of value.split(',').filter(Boolean)) {
          const [ip, prefix] = cidr.split('/');
          if (!ip || !prefix || !isIP(ip)) return false;
          new BlockList().addSubnet(ip, Number(prefix), isIP(ip) === 4 ? 'ipv4' : 'ipv6');
        }
        return true;
      } catch {
        return false;
      }
    }),
});
const workerSchema = shared.omit({ BETTER_AUTH_SECRET: true }).extend({
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  RESEND_API_KEY: z
    .string()
    .min(16)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email(),
  ...evidence,
  /** The isolated processor's address (ADR 0020: its public HTTPS address on staging). */
  EVIDENCE_PROCESSOR_URL: httpsOrLocal,
});
export interface EvidenceStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly buckets: { readonly quarantine: string; readonly evidence: string; readonly derivatives: string };
}
/** The storage settings when image evidence is on; throws if it is on but incomplete. */
export function resolveEvidenceStorage(config: {
  readonly EVIDENCE_ENABLED: 'true' | 'false';
  readonly S3_ENDPOINT?: string | undefined;
  readonly S3_REGION?: string | undefined;
  readonly S3_ACCESS_KEY_ID?: string | undefined;
  readonly S3_SECRET_ACCESS_KEY?: string | undefined;
  readonly S3_BUCKET_QUARANTINE?: string | undefined;
  readonly S3_BUCKET_EVIDENCE?: string | undefined;
  readonly S3_BUCKET_DERIVATIVES?: string | undefined;
}): EvidenceStorageConfig | null {
  if (config.EVIDENCE_ENABLED !== 'true') return null;
  const {
    S3_ENDPOINT: endpoint,
    S3_REGION: region,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_BUCKET_QUARANTINE: quarantine,
    S3_BUCKET_EVIDENCE: evidenceBucket,
    S3_BUCKET_DERIVATIVES: derivatives,
  } = config;
  if (
    !endpoint ||
    !region ||
    !accessKeyId ||
    !secretAccessKey ||
    !quarantine ||
    !evidenceBucket ||
    !derivatives
  )
    throw new Error('EVIDENCE_ENABLED requires every S3_* field');
  if (new Set([quarantine, evidenceBucket, derivatives]).size !== 3)
    throw new Error('Evidence buckets must be three different buckets');
  return Object.freeze({
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    buckets: Object.freeze({ quarantine, evidence: evidenceBucket, derivatives }),
  });
}
export type RegistrationAccess =
  { readonly mode: 'open' } | { readonly mode: 'invite'; readonly emailDigests: ReadonlySet<string> };
/** Public unless `REGISTRATION_MODE=invite` is set explicitly (owner decision 2026-10-16; ADR 0019). */
export function resolveRegistrationAccess(config: {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly REGISTRATION_MODE?: 'open' | 'invite' | undefined;
  readonly REGISTRATION_INVITE_EMAILS_SHA256: string;
}): RegistrationAccess {
  const mode = config.REGISTRATION_MODE ?? 'open';
  if (mode === 'open') return Object.freeze({ mode });
  const emailDigests = new Set(
    config.REGISTRATION_INVITE_EMAILS_SHA256.split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return Object.freeze({ mode, emailDigests });
}
function parse<S extends z.ZodType>(
  schema: S,
  env: Record<string, string | undefined>,
): Readonly<z.output<S>> {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Only field names reach logs. Zod input and connection strings must never do so.
    throw new Error(
      `Invalid configuration fields: ${[...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')}`,
    );
  }
  return Object.freeze(result.data);
}
export const readApiConfig = (env = process.env) => {
  const config = parse(apiSchema, env);
  if (
    config.RESEARCH_ENABLED === 'true' &&
    (config.RPC_PLAN_VERIFIED !== 'true' || !config.ALCHEMY_ETHEREUM_API_KEY || !config.HELIUS_RPC_API_KEY)
  )
    throw new Error('Research requires verified provider plans and both RPC credential fields');
  if (config.MAIL_WORKER_HEALTH_URL && config.DEPLOYMENT_ENV !== 'staging')
    throw new Error('MAIL_WORKER_HEALTH_URL staging only');
  if (
    Boolean(config.STAGING_INGRESS_DIAGNOSTIC_KEY) !== Boolean(config.STAGING_INGRESS_DIAGNOSTIC_UNTIL) ||
    (config.STAGING_INGRESS_DIAGNOSTIC_KEY &&
      (config.DEPLOYMENT_ENV !== 'staging' ||
        [config.BETTER_AUTH_SECRET, config.INTERNAL_API_TOKEN, config.STAGING_ACCESS_TOKEN].includes(
          config.STAGING_INGRESS_DIAGNOSTIC_KEY,
        ) ||
        Date.parse(config.STAGING_INGRESS_DIAGNOSTIC_UNTIL ?? '') > Date.now() + 30 * 60_000))
  )
    throw new Error('STAGING_INGRESS_DIAGNOSTIC configuration invalid');
  if (
    config.DEPLOYMENT_ENV === 'staging' &&
    (!config.STAGING_ACCESS_TOKEN ||
      config.STAGING_ACCESS_TOKEN === config.BETTER_AUTH_SECRET ||
      config.STAGING_ACCESS_TOKEN === config.INTERNAL_API_TOKEN)
  )
    throw new Error('STAGING_ACCESS_TOKEN requires an independent staging secret');
  if (
    config.CLIENT_IP_FORWARDING_TOKEN &&
    [config.BETTER_AUTH_SECRET, config.INTERNAL_API_TOKEN, config.STAGING_ACCESS_TOKEN].includes(
      config.CLIENT_IP_FORWARDING_TOKEN,
    )
  )
    throw new Error('CLIENT_IP_FORWARDING_TOKEN requires an independent secret');
  if (config.NODE_ENV === 'production' && new URL(config.APP_ORIGIN).protocol !== 'https:')
    throw new Error('APP_ORIGIN requires HTTPS in production');
  if (new URL(config.APP_ORIGIN).hostname !== config.WEBAUTHN_RP_ID)
    throw new Error('WEBAUTHN_RP_ID must match APP_ORIGIN host');
  resolveEvidenceStorage(config);
  return config;
};
export const readWorkerConfig = (env = process.env) => {
  const config = parse(workerSchema, env);
  if (config.EMAIL_PROVIDER === 'resend' && !config.RESEND_API_KEY)
    throw new Error('RESEND_API_KEY required for Resend');
  if (config.EMAIL_PROVIDER === 'smtp' && (!config.SMTP_HOST || !config.SMTP_PORT))
    throw new Error('SMTP_HOST and SMTP_PORT required for SMTP');
  if (config.EMAIL_PROVIDER === 'smtp' && config.NODE_ENV === 'production' && config.SMTP_SECURE !== 'true')
    throw new Error('SMTP_SECURE required in production');
  if (config.NODE_ENV === 'production' && new URL(config.APP_ORIGIN).protocol !== 'https:')
    throw new Error('APP_ORIGIN requires HTTPS in production');
  if (resolveEvidenceStorage(config) && !config.EVIDENCE_PROCESSOR_URL)
    throw new Error('EVIDENCE_ENABLED requires EVIDENCE_PROCESSOR_URL on the worker');
  return config;
};
/** Every setting each service reads; deployment wrappers must pass these through. */
export const API_CONFIG_FIELDS: readonly string[] = Object.keys(apiSchema.shape);
export const WORKER_CONFIG_FIELDS: readonly string[] = Object.keys(workerSchema.shape);
export type ApiConfig = ReturnType<typeof readApiConfig>;
export type WorkerConfig = ReturnType<typeof readWorkerConfig>;
