import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the web app in MOCK mode only (fictional data, no
 * backend). Build it first: `pnpm --filter @blacklist/web build:mock`.
 *
 * Chromium (desktop + mobile) runs everything. Set E2E_ALL_BROWSERS=1 to also run the
 * auth and account journeys in Firefox and WebKit (desktop and iPhone viewport).
 */
const ALL_BROWSERS = process.env['E2E_ALL_BROWSERS'] === '1';
const CROSS_BROWSER_SPECS = /(auth|account)\.spec\.ts$/;
const PORT = 3100;

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    ...(ALL_BROWSERS
      ? [
          {
            name: 'firefox',
            testMatch: CROSS_BROWSER_SPECS,
            timeout: 90_000,
            expect: { timeout: 15_000 },
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            testMatch: CROSS_BROWSER_SPECS,
            timeout: 90_000,
            expect: { timeout: 15_000 },
            use: { ...devices['Desktop Safari'] },
          },
          {
            name: 'webkit-mobile',
            testMatch: CROSS_BROWSER_SPECS,
            timeout: 90_000,
            expect: { timeout: 15_000 },
            use: { ...devices['iPhone 14'] },
          },
        ]
      : []),
  ],
  webServer: {
    command: `pnpm --filter @blacklist/web start:mock -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
