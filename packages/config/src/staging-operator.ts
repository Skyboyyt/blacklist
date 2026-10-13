import { z } from 'zod';

const credential = z.string().min(32).max(4096);
const common = {
  runId: z.string().uuid(),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  statusToken: z.string().regex(/^[a-f0-9]{64}$/),
};
const schema = z.discriminatedUnion('phase', [
  z.strictObject({
    ...common,
    phase: z.literal('provision'),
    adminUrl: credential,
    runtimePassword: z.string().regex(/^[a-f0-9]{64}$/),
    migratorPassword: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    ...common,
    phase: z.literal('migrate'),
    migrationUrl: credential,
    runtimeUrl: credential,
  }),
]);

export type StagingOperatorConfig = z.infer<typeof schema>;
export function stagingOperatorMode(input: unknown): 'inspect' | 'execute' {
  const result = z.enum(['true', 'false']).optional().safeParse(input);
  if (!result.success) throw new Error('operator_configuration_invalid');
  return result.data === 'true' ? 'inspect' : 'execute';
}
export function parseStagingOperatorConfig(input: unknown): StagingOperatorConfig {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('operator_configuration_invalid');
  return result.data;
}
