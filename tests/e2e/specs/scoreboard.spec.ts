import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { EVM } from './fixtures';
import { settle } from './settle';

/** Band ranking of reviewed projects (ADR 0012, band-only), on the shared MOCK store. */
const ORIGIN = 'http://localhost:3100';

async function as(context: BrowserContext, viewer: string) {
  await context.addCookies([
    { name: 'bl_mock_viewer', value: viewer, url: ORIGIN },
    { name: 'bl_mock_passkey', value: 'verified', url: ORIGIN },
  ]);
}

async function confirmWithSecurityKey(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Continue to security key' }).click();
  await page
    .getByRole('dialog', { name: 'Verify with your security key' })
    .getByRole('button', { name: 'Verify and continue' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const ranked = (page: Page) => page.getByRole('region', { name: /Ranked projects/ }).getByRole('listitem');

test.describe('project risk ranking (mock)', () => {
  test('ranks by band without numbers, shares tied ranks and lists unranked projects with a reason', async ({
    page,
  }) => {
    await page.goto('/projects');
    await page.getByRole('link', { name: 'Risk ranking' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Project risk ranking' })).toBeVisible();
    await expect(ranked(page).first()).toContainText('Demo Rewards Hub');
    await expect(ranked(page).first()).toContainText('Severe risk');
    await expect(ranked(page).filter({ hasText: 'DemoSwap' })).toContainText('4=');
    await expect(page.getByText(/no score/i).first()).toBeVisible();
    await expect(page.getByText(/\b\d{1,3}\s*(\/|of)\s*100\b/)).toHaveCount(0);
    const notRanked = page.getByRole('region', { name: /Not ranked/ });
    await expect(notRanked.getByText('Demo Dormant Protocol')).toBeVisible();
    await expect(notRanked.getByText(/not re-reviewed recently/)).toBeVisible();
    await expect(notRanked.getByText(/temporarily suspended pending review/)).toBeVisible();
  });

  test('filters by network and keeps the network in the URL', async ({ page }) => {
    await page.goto('/scoreboard');
    await page.getByLabel('Network').selectOption('solana');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/chain=solana/);
    await expect(ranked(page).first()).toContainText('Lookalike Stable (demo)');
    await expect(ranked(page)).toHaveCount(4);
    await page.goto('/scoreboard?chain=bitcoin');
    await expect(page.getByText(/not supported/i).first()).toBeVisible();
  });

  test('an approved finding on an official address moves the project up the ranking', async ({
    page,
    context,
  }) => {
    await as(context, 'member');
    await page.goto('/reports/new');
    await page.getByLabel('Short title').fill('Fake support desk for Demo Wallet App');
    await page.getByLabel('Address 1').fill(EVM.low);
    await page.getByLabel('When did it happen?').fill('2026-09-01');
    await page
      .getByLabel('What happened?')
      .fill('A fake support desk collected payments for Demo Wallet App users.');
    await page.getByRole('button', { name: 'Send private report' }).click();
    await expect(page).toHaveURL(/\/reports\/RPT-\d+$/);
    const id = new URL(page.url()).pathname.split('/').pop() ?? '';

    await as(context, 'moderator');
    await page.goto(`/mod/cases/${id}`);
    await page.getByRole('button', { name: 'Start review' }).click();
    await page.getByRole('button', { name: 'Accept and draft finding' }).click();
    await page.getByLabel('Finding severity').selectOption('high');
    await page
      .getByLabel('Public explanation')
      .fill('This address collected payments through a fake support desk.');
    await page.getByLabel('Internal rationale').fill('Payment evidence matched the report.');
    await page.getByRole('button', { name: 'Review and confirm' }).click();
    await confirmWithSecurityKey(page);
    await as(context, 'moderator_b');
    await page.goto('/mod/approvals');
    await page
      .getByRole('article')
      .filter({ hasText: 'fake support desk' })
      .getByRole('button', { name: 'Approve this revision' })
      .click();
    await confirmWithSecurityKey(page);

    await as(context, 'anonymous');
    await page.goto('/scoreboard');
    const wallet = ranked(page).filter({ hasText: 'Demo Wallet App' });
    await expect(wallet).toContainText('High risk');
    await expect(wallet).toContainText('2=');
    await expect(ranked(page).filter({ hasText: 'High risk' })).toHaveCount(2);
  });
});

test.describe('risk ranking accessibility and layout', () => {
  test('has no WCAG 2.2 AA violations and no sideways scroll on a small screen', async ({ page }) => {
    await page.goto('/scoreboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload();
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
