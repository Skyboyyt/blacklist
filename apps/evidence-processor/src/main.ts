import { z } from 'zod';
import { createProcessorServer } from './server.ts';

// Only non-secret settings. This service must never receive database, auth, mail,
// provider or storage credentials (ADR 0004, ADR 0020).
const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    EVIDENCE_STORAGE_ORIGIN: z.url({ protocol: /^https?$/ }).transform((v) => new URL(v).origin),
    S3_BUCKET_QUARANTINE: z.string().min(3).max(63),
    S3_BUCKET_DERIVATIVES: z.string().min(3).max(63),
  })
  .parse(process.env);

const server = createProcessorServer({
  origin: env.EVIDENCE_STORAGE_ORIGIN,
  quarantineBucket: env.S3_BUCKET_QUARANTINE,
  derivativesBucket: env.S3_BUCKET_DERIVATIVES,
});
server.requestTimeout = 90_000;
server.listen(env.PORT, '0.0.0.0');
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
