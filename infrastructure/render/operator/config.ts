import { readFile, stat } from 'node:fs/promises';
import { parseStagingOperatorConfig } from '../../../packages/config/src/staging-operator.ts';
import { validateOperatorTarget } from './target.ts';

export const operatorSecretFile = '/etc/secrets/blacklist-staging-operator.json';
export async function readOperatorConfig() {
  const info = await stat(operatorSecretFile);
  if (!info.isFile() || info.size > 16384) throw new Error('operator_secret_file_invalid');
  return parseStagingOperatorConfig(JSON.parse(await readFile(operatorSecretFile, 'utf8')));
}
export async function validateOperatorConfiguration(config: ReturnType<typeof parseStagingOperatorConfig>) {
  const info = await stat(operatorSecretFile);
  if ((info.mode & 0o022) !== 0) throw new Error('operator_secret_file_invalid');
  validateOperatorTarget(config, process.env['RENDER_GIT_COMMIT']);
  if (
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] === '0' ||
    process.env['NODE_OPTIONS'] ||
    process.env['PGSSLMODE']
  )
    throw new Error('operator_environment_invalid');
}
