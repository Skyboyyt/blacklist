import { expect, test } from '@playwright/test';

const DARK_BG = 'rgb(11, 15, 21)';
const LIGHT_BG = 'rgb(247, 248, 250)';

test.describe('theme', () => {
  test('a stored dark choice is applied before first paint (no flash)', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('bl-theme', 'dark'));
    // Record the theme attribute at the very first DOMContentLoaded, before React hydrates.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl =
          document.documentElement.getAttribute('data-theme');
      });
    });
    await page.goto('/');
    expect(
      await page.evaluate(() => (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl),
    ).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
  });

  test('system preference is followed when no choice is stored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('body')).toHaveCSS('background-color', LIGHT_BG);
  });

  test('the toggle switches theme and persists it across reloads', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/methodology');
    await page.getByRole('button', { name: 'Dark theme' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Dark theme' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
