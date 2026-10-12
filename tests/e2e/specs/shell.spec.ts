import { expect, test } from '@playwright/test';

test.describe('application shell', () => {
  test('desktop shows the sidebar; mobile shows the menu button and tab bar', async ({ page, isMobile }) => {
    await page.goto('/');
    const sidebarNav = page.getByRole('complementary').getByRole('navigation', { name: 'Main' });
    if (isMobile) {
      await expect(sidebarNav).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Quick links' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
    } else {
      await expect(sidebarNav).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Quick links' })).toBeHidden();
      for (const label of ['Research', 'Dashboard', 'Reports', 'Appeals & responses', 'Settings']) {
        await expect(sidebarNav.getByRole('link', { name: label })).toBeVisible();
      }
    }
  });

  test('mobile menu is a dialog: opens, traps focus, closes on Escape and returns focus', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Reports' })).toBeVisible();
    // Focus stays inside the dialog in both directions (more presses than there are controls).
    const focusInDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInDialog()).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInDialog()).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('navigating via the menu closes it and marks the current page', async ({ page, isMobile }) => {
    await page.goto('/');
    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await page.getByRole('dialog').getByRole('link', { name: 'Reports' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    } else {
      await page.getByRole('complementary').getByRole('link', { name: 'Reports' }).click();
    }
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My reports' })).toBeVisible();
  });

  test('skip link moves focus to the main content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard flow checked on desktop');
    await page.goto('/methodology');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('staff navigation is structural: hidden for members, shown for staff; staff pages hold no data', async ({
    page,
    context,
  }) => {
    await page.goto('/mod');
    await expect(page.getByRole('heading', { level: 1, name: 'Staff access required' })).toBeVisible();
    await context.addCookies([{ name: 'bl_mock_viewer', value: 'moderator', url: 'http://localhost:3100' }]);
    await page.goto('/mod');
    await expect(page.getByRole('heading', { level: 1, name: 'Moderation queue' })).toBeVisible();
    await expect(page.getByText('This page holds no case data.')).toBeVisible();
  });

  test('signed-in pages ask anonymous viewers to sign in', async ({ page, context }) => {
    await context.addCookies([{ name: 'bl_mock_viewer', value: 'anonymous', url: 'http://localhost:3100' }]);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeVisible();
  });
});
