import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Coverage includes workspace sources outside this package. Vitest's uncovered-file
  // transformer only handles files under its root; otherwise raw TS reaches the JS parser.
  root: fileURLToPath(new URL('../../', import.meta.url)),
  test: {
    include: ['tests/backend-acceptance/src/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      allowExternal: true,
      include: [
        'packages/domain/src/**/*.ts',
        'packages/config/src/**/*.ts',
        'packages/db/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/worker/src/**/*.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 75,
        'packages/domain/src/identity/**': { branches: 90 },
        'packages/domain/src/access/**': { branches: 90 },
        'packages/domain/src/audit/**': { branches: 90 },
        'packages/domain/src/staff/**': { branches: 75 },
        'packages/domain/src/shared/**': { branches: 75 },
        'packages/config/src/**': { branches: 75 },
        'packages/db/src/**': { branches: 75 },
        'apps/api/src/**': { branches: 75 },
        'apps/worker/src/**': { branches: 75 },
      },
    },
  },
});
