import { expect, test, type BrowserContext } from '@playwright/test';

const ORIGIN = 'http://localhost:3100';
const SOLANA_WALLET = 'DemoWa11etBLackListFixture22222222222222222';

async function viewer(context: BrowserContext, value: 'anonymous' | 'member') {
  await context.addCookies([{ name: 'bl_mock_viewer', value, url: ORIGIN }]);
}

test.describe('project directory (mock)', () => {
  test('filters by network and keeps every result on that network', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await page.getByLabel('Network').selectOption('solana');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/\/projects\?.*chain=solana/);
    const cards = page.getByRole('article');
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all())
      await expect(card.getByText('Solana', { exact: true })).toBeVisible();
  });

  test('paginates with links and keeps the position announced', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByText('Page 1 of 3')).toBeVisible();
    await page.getByRole('link', { name: /Next page/ }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Showing 7–12 of 14 projects/ })).toBeVisible();
  });

  test('an address search needs a network and is never matched across networks', async ({ page }) => {
    await page.goto(`/projects?q=${SOLANA_WALLET}`);
    await expect(page.getByText('Choose a network for this address')).toBeVisible();
    await page.goto(`/projects?q=${SOLANA_WALLET}&chain=ethereum`);
    await expect(page.getByText('This is not a valid Ethereum address.')).toBeVisible();
    await page.goto(`/projects?q=${SOLANA_WALLET}&chain=solana`);
    await expect(page.getByRole('link', { name: 'Demo Wallet App' })).toBeVisible();
  });

  test('an unknown network is reported, not replaced', async ({ page }) => {
    await page.goto('/projects?chain=polygon');
    await expect(page.getByRole('heading', { name: 'Network not supported' })).toBeVisible();
  });

  test('no-results and unavailable states', async ({ page }) => {
    await page.goto('/projects?q=nothing-matches-this');
    await expect(page.getByText('No projects match')).toBeVisible();
    await page.goto('/projects?q=provider-down-demo');
    await expect(page.getByText('Project data is temporarily unavailable')).toBeVisible();
  });

  test('universal search points name searches to the project directory', async ({ page }) => {
    await page.goto('/search?q=Demo%20Exchange');
    await page.getByRole('link', { name: 'Search project profiles' }).click();
    await expect(page).toHaveURL(/\/projects\?q=Demo/);
    await expect(page.getByRole('link', { name: 'Demo Exchange' })).toBeVisible();
  });
});

test.describe('project detail (mock)', () => {
  test('opens from the directory and links to address research', async ({ page }) => {
    await page.goto('/projects?q=yield');
    await page.getByRole('link', { name: 'Demo Yield Vault' }).click();
    await expect(page).toHaveURL(/\/project\/demo-yield-vault$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Demo Yield Vault' })).toBeVisible();
    await expect(page.getByText(/do not guarantee safety or investment returns/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/score/i);
    await page.getByRole('link', { name: 'Open full address research' }).click();
    await expect(page).toHaveURL(/\/address\/ethereum\/0xb1ac/);
  });

  test('not found and invalid profile links', async ({ page }) => {
    await page.goto('/project/no-such-project');
    await expect(page.getByRole('heading', { name: 'No records for this project' })).toBeVisible();
    await page.goto('/project/Not_A_Slug');
    await expect(page.getByText('This is not a valid project profile link.')).toBeVisible();
    await page.goto('/project/demo-provider-down');
    await expect(page.getByRole('heading', { name: /temporarily unavailable/ })).toBeVisible();
  });

  test('signed-out viewers are sent to sign in and back', async ({ page, context }) => {
    await viewer(context, 'anonymous');
    await page.goto('/project/demoswap');
    await page.getByRole('link', { name: 'Sign in to respond, correct or appeal' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fproject%2Fdemoswap/);
    await page.getByLabel('Email').fill('member@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a long enough passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/project\/demoswap$/);
    await expect(page.getByRole('link', { name: 'Respond, correct or appeal' })).toBeVisible();
  });

  test('has no horizontal page overflow on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ['/projects', '/project/demo-wallet-app']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
