import type { Page } from '@playwright/test';

/**
 * Waits until the page has finished loading and rendering, so audits (axe) measure
 * the final styles rather than a frame where media emulation or late styles are
 * still being applied (observed intermittently in WebKit mobile).
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}
