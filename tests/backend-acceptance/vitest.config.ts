import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const domain = fileURLToPath(new URL('../../packages/domain/src/', import.meta.url));
const source = (path: string) => `${fileURLToPath(new URL(`../../${path}/src/`, import.meta.url))}**/*.ts`;

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      allowExternal: true,
      include: [
        `${domain}**/*.ts`,
        source('packages/config'),
        source('packages/db'),
        source('apps/api'),
        source('apps/worker'),
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 75,
        '../../packages/domain/src/identity/**': { branches: 90 },
        '../../packages/domain/src/access/**': { branches: 90 },
        '../../packages/domain/src/audit/**': { branches: 90 },
        '../../packages/domain/src/staff/**': { branches: 75 },
        '../../packages/domain/src/shared/**': { branches: 75 },
        '../../packages/config/src/**': { branches: 75 },
        '../../packages/db/src/**': { branches: 75 },
        '../../apps/api/src/**': { branches: 75 },
        '../../apps/worker/src/**': { branches: 75 },
      },
    },
  },
});
