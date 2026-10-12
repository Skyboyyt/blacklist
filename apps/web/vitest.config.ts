import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'blacklist-mock-api': fileURLToPath(new URL('./src/lib/api/mock/index.ts', import.meta.url)),
      // `server-only` throws outside React Server Components; tests import server modules directly.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    css: false,
    // jsdom + user-event typing is slow on modest machines under parallel load; assertions are unchanged.
    testTimeout: 20_000,
  },
});
