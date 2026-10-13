import type { StagingOperatorConfig } from '../../../packages/config/src/staging-operator.ts';
import { verifiedDatabaseUrl } from '../database-url.ts';

export const stagingTarget = {
  host: 'ep-twilight-bar-b9lxt63r.c-7.eu-central-1.aws.neon.tech',
  database: 'blacklist_staging',
} as const;

export function operatorUrl(input: string, role: string): string {
  const url = verifiedDatabaseUrl(input, role);
  if (
    url.hostname !== stagingTarget.host ||
    url.pathname !== `/${stagingTarget.database}` ||
    (url.port !== '' && url.port !== '5432') ||
    !url.password
  )
    throw new Error('operator_target_invalid');
  return url.toString();
}

export function validateOperatorTarget(config: StagingOperatorConfig, commit: string | undefined) {
  if (config.sourceCommit !== commit) throw new Error('operator_source_mismatch');
  if (config.phase === 'provision') operatorUrl(config.adminUrl, 'blacklist_provisioner');
  else {
    operatorUrl(config.migrationUrl, 'blacklist_migrator');
    operatorUrl(config.runtimeUrl, 'blacklist_app');
  }
}
