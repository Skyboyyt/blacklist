import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { settle } from './settle';

/**
 * Staff recovery identity verification (identity §10.11 step 2) on the shared MOCK
 * store. Each browser context has its own demo session. Nothing is real.
 */
const ORIGIN = 'http://localhost:3100';

async function as(context: BrowserContext, viewer: string) {
  await context.addCookies([
    { name: 'bl_mock_viewer', value: viewer, url: ORIGIN },
    { name: 'bl_mock_passkey', value: 'verified', url: ORIGIN },
  ]);
}

async function openRecovery(page: Page, handle: string) {
  await page.goto('/admin/staff');
  await page.getByRole('button', { name: `Open recovery for ${handle}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continue to security key' }).click();
  await page
    .getByRole('dialog', { name: 'Verify with your security key' })
    .getByRole('button', { name: 'Verify and continue' })
    .click();
  await expect(page.getByText('Recovery case opened')).toBeVisible();
}

async function verify(page: Page, method: string) {
  await page.goto('/mod/recovery');
  await page.getByLabel('How did you verify identity?').fill(method);
  await page
    .getByLabel('Why are you confident it is them?')
    .fill('Matched the staff photo and the known phone number.');
  await page.getByRole('button', { name: /^Record verification/ }).click();
}

test.describe('staff recovery verification (mock)', () => {
  test('a moderator and an administrator verify; two moderators alone are refused', async ({
    page,
    context,
  }) => {
    await as(context, 'admin');
    await openRecovery(page, 'demo_moderator_c');

    await as(context, 'moderator');
    await page.goto('/mod/recovery');
    await expect(page.getByRole('heading', { level: 1, name: 'Recovery verification' })).toBeVisible();
    await expect(page.getByText(/recovery for demo_moderator_c/)).toBeVisible();
    await expect(page.getByText(/Never use the account email/)).toBeVisible();
    await page.getByRole('button', { name: /^Record verification/ }).click();
    await expect(page.getByText(/at least 5 characters/)).toBeVisible();
    await verify(page, 'Video call; matched the staff photo.');
    await expect(page.getByText('Verification recorded')).toBeVisible();
    await expect(page.getByText('1 of 2 verifications', { exact: false })).toBeVisible();

    await as(context, 'moderator_b');
    await verify(page, 'Call-back to the number on file.');
    await expect(page.getByText('At least one of the two verifiers must be an administrator.')).toBeVisible();

    await as(context, 'admin_b');
    await verify(page, 'Call-back to the number on file.');
    await expect(page.getByText(/Both verifications are in/)).toBeVisible();
    await expect(page.getByText('No recovery case is waiting for identity verification.')).toBeVisible();

    await as(context, 'admin');
    await page.goto('/admin/staff');
    await expect(page.getByText(/demo_moderator_c · Waiting for a different administrator/)).toBeVisible();
  });

  test('appeal reviewers have no recovery screen and the page is accessible at 320 px', async ({
    page,
    context,
  }) => {
    await as(context, 'appeal_reviewer');
    await page.goto('/mod/recovery');
    await expect(
      page.getByText('Recovery verification needs a moderator or administrator role.'),
    ).toBeVisible();

    await as(context, 'admin');
    await openRecovery(page, 'demo_moderator_c');
    await as(context, 'moderator');
    await page.goto('/mod/recovery');
    await expect(page.getByText(/recovery for demo_moderator_c/)).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
    await page.setViewportSize({ width: 320, height: 720 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
