import AxeBuilder from '@axe-core/playwright';
import { settle } from './settle';
import { expect, test } from '@playwright/test';
import { EVM } from './fixtures';

const PAGES = [
  '/',
  `/search?q=${EVM.high}`,
  `/address/ethereum/${EVM.severeUnderAppeal}`,
  `/address/ethereum/${EVM.high}`,
  '/tx/ethereum/0xb1ac' + '0'.repeat(59) + '1',
  '/methodology',
  '/dashboard',
  '/reports',
  '/appeals/new',
  '/login',
  '/register',
  '/register/complete#token=demo-valid-token-0001',
  '/reset-password',
  '/forgot-password',
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    for (const path of PAGES) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await settle(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        ).toEqual([]);
      });
    }
  });
}

test.describe('security headers and CSP', () => {
  test('pages send a nonce-based CSP and baseline headers', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('prefetch-marked document requests still get CSP and token-page headers (P1-04)', async ({
    request,
  }) => {
    for (const headers of [
      { purpose: 'prefetch' },
      { 'next-router-prefetch': '1' },
      { 'sec-purpose': 'prefetch' },
    ]) {
      const response = await request.get('/reset-password', { headers });
      const h = response.headers();
      expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(h['referrer-policy']).toBe('no-referrer');
      expect(h['cache-control']).toContain('no-store');
    }
  });

  test('no CSP violations or console errors while browsing', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(msg.text());
    });
    page.on('pageerror', (err) => problems.push(err.message));
    for (const path of ['/', `/address/ethereum/${EVM.high}`, '/login', '/methodology']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(problems).toEqual([]);
  });

  test('reduced motion disables animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    await page.getByLabel('Email').fill('limited@example.test');
    await page.getByLabel('Password', { exact: true }).fill('x');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const spinner = page.locator('[aria-busy="true"] span[aria-hidden="true"]').first();
    await expect(spinner).toHaveCSS('animation-name', 'none');
  });
});
