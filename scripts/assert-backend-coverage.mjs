import { readFile } from 'node:fs/promises';

// Vitest can otherwise exit successfully for an empty coverage map. These formerly
// omitted TS files must be measured, even if their covered count is zero.
const summary = JSON.parse(
  await readFile(new URL('../coverage/coverage-summary.json', import.meta.url), 'utf8'),
);
const required = [
  'packages/config/src/staging-operator.ts',
  'packages/db/src/staging-operator.ts',
  'apps/api/src/main.ts',
  'apps/worker/src/main.ts',
  'apps/api/src/cli/staff.ts',
];
if (
  !(summary.total?.branches?.total > 0) ||
  required.some(
    (file) =>
      !Object.entries(summary).some(
        ([name, value]) => name.replaceAll('\\', '/').endsWith('/' + file) && value.lines?.total > 0,
      ),
  )
) {
  console.error('backend_coverage_incomplete');
  process.exitCode = 1;
}
