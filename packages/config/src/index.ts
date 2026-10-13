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
});
const apiSchema = shared.extend({
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4107),
  INTERNAL_API_TOKEN: z.string().min(32),
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
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: z.enum(['true', 'false']).default('true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email(),
});
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
  if (config.NODE_ENV === 'production' && new URL(config.APP_ORIGIN).protocol !== 'https:')
    throw new Error('APP_ORIGIN requires HTTPS in production');
  if (new URL(config.APP_ORIGIN).hostname !== config.WEBAUTHN_RP_ID)
    throw new Error('WEBAUTHN_RP_ID must match APP_ORIGIN host');
  return config;
};
export const readWorkerConfig = (env = process.env) => {
  const config = parse(workerSchema, env);
  if (config.NODE_ENV === 'production' && config.SMTP_SECURE !== 'true')
    throw new Error('SMTP_SECURE required in production');
  return config;
};
export type ApiConfig = ReturnType<typeof readApiConfig>;
export type WorkerConfig = ReturnType<typeof readWorkerConfig>;
