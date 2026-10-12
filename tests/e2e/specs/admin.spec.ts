import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { EVM, SOLANA_TOKEN } from './fixtures';
import { settle } from './settle';

/**
 * Remaining approved requirements and the administrator console, on the shared MOCK
 * store (each browser context has its own demo session). Nothing is real.
 */
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

async function decide(page: Page, action: string, fields: Record<string, string>) {
  await page
    .getByRole('group', { name: 'Available decisions' })
    .getByRole('button', { name: action })
    .click();
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label).fill(value);
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  await confirmWithSecurityKey(page);
}

test.describe('responses and emergency suspension (mock)', () => {
  test('a contract owner responds with a simulated authority signature; staff publish it', async ({
    page,
    context,
  }) => {
    await as(context, 'member');
    await page.goto(`/address/ethereum/${EVM.contractWithDisclosures}`);
    await page.getByRole('link', { name: 'Respond as the subject' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Respond as the subject' })).toBeVisible();
    await page
      .getByLabel('Your response')
      .fill('The owner role moved to a timelock contract on 1 September.');
    await page.getByLabel('Sign with the on-chain authority').check();
    await page.getByLabel('Which authority will sign?').selectOption('owner');
    await page.getByRole('button', { name: 'Show the message to sign' }).click();
    await expect(page.getByText(/does not authorize any transaction/)).toBeVisible();
    await page.getByRole('button', { name: 'Simulate signing (demo only)' }).click();
    await page.getByRole('button', { name: 'Send response for review' }).click();
    await expect(page).toHaveURL(/\/responses\/RSP-\d+$/);
    const id = new URL(page.url()).pathname.split('/').pop() ?? '';

    await as(context, 'moderator');
    await page.goto(`/mod/cases/${id}`);
    await expect(page.getByText('The owner role moved to a timelock contract on 1 September.')).toBeVisible();
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText('Assigned to you')).toBeVisible();
    await decide(page, 'Publish response', { 'Internal rationale': 'No personal data, abuse or links.' });

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.contractWithDisclosures}`);
    await page.getByRole('tab', { name: /Responses/ }).click();
    await expect(page.getByText('The owner role moved to a timelock contract on 1 September.')).toBeVisible();
    await expect(page.getByText(/proved control of this address/)).toBeVisible();
    await expect(page.getByText(/No personal data, abuse or links/)).toHaveCount(0);
  });

  test('a moderator suspends a finding; a non-participant reinstates it', async ({ page, context }) => {
    await as(context, 'moderator');
    await page.goto('/mod/findings');
    await page.getByRole('button', { name: 'Suspend demo-finding-301' }).click();
    await page.getByLabel('Internal reason (staff only)').fill('Personal data appeared in the summary.');
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Finding suspended')).toBeVisible();

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText('Temporarily suspended pending review').first()).toBeVisible();
    await expect(page.getByText(/Personal data appeared/)).toHaveCount(0);

    await as(context, 'moderator_b');
    await page.goto('/mod/findings');
    await page.getByRole('link', { name: 'Open suspension review' }).click();
    await expect(page.getByText('Why it was suspended')).toBeVisible();

    await as(context, 'admin');
    await page.reload();
    await page.getByRole('button', { name: 'Assign to me' }).click();
    await expect(page.getByText('Assigned to you')).toBeVisible();
    await decide(page, 'Reinstate finding', {
      'Public explanation': 'The summary was corrected and the finding stands.',
      'Internal rationale': 'Checked the corrected text.',
    });

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText('Temporarily suspended pending review')).toHaveCount(0);
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText(/Finding reinstated after review/)).toBeVisible();
  });
});

test.describe('administrator console (mock)', () => {
  test('moderators cannot open the console', async ({ page, context }) => {
    await as(context, 'moderator');
    await page.goto('/admin/staff');
    await expect(page.getByText('Access denied')).toBeVisible();
  });

  test('an admin invitation needs a second administrator', async ({ page, context }) => {
    await as(context, 'admin');
    await page.goto('/admin/staff');
    await page.getByLabel('Email').fill('new.admin@example.test');
    await page.getByLabel('Role', { exact: true }).first().selectOption('admin');
    await page.getByRole('button', { name: 'Create invitation' }).click();
    await confirmWithSecurityKey(page);
    await expect(page.getByText('One-time enrollment code (demo)')).toBeVisible();
    const invitation = page
      .getByRole('listitem')
      .filter({ hasText: 'Waiting for a second administrator' })
      .first();
    await invitation.getByRole('button', { name: /^Approve/ }).click();
    await confirmWithSecurityKey(page);
    await expect(
      page
        .getByText('You can’t take this decision')
        .or(page.getByText(/second, different administrator/))
        .first(),
    ).toBeVisible();

    await as(context, 'admin_b');
    await page.reload();
    const pending = page
      .getByRole('listitem')
      .filter({ hasText: 'n•••@example.test' })
      .filter({ hasText: 'Waiting' })
      .first();
    await pending.getByRole('button', { name: /^Approve/ }).click();
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Invitation approved')).toBeVisible();
  });

  test('a suspended member cannot submit', async ({ page, context }) => {
    await as(context, 'admin');
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Suspend demo_member' }).click();
    await page.getByLabel('Internal reason (staff only)').fill('Repeated abusive reports after warnings.');
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Member suspended')).toBeVisible();

    await as(context, 'member');
    await page.goto('/projects/suggest');
    await page.getByLabel('Project name').fill('Demo Lending Hub');
    await page.getByLabel('Contract or mint address').fill(`0xb1ac${'7'.repeat(36)}`);
    await page.getByLabel('Official link 1').fill('https://lending-hub.example');
    await page.getByLabel('Description').fill('A fictional lending market used to demonstrate suggestions.');
    await page.getByLabel('Your connection to the project').fill('I am a fictional community member.');
    await page.getByRole('button', { name: 'Send suggestion' }).click();
    await expect(page.getByText('Your account is suspended')).toBeVisible();
  });

  test('labels and suppressions show on public pages; labels never change the band', async ({
    page,
    context,
  }) => {
    await as(context, 'admin');
    await page.goto('/admin/labels');
    await page.getByLabel('Address', { exact: true }).fill(EVM.low);
    await page.getByLabel('Label text').fill('Demo exchange deposit wallet');
    await page.getByLabel('Basis (staff only)').fill('Matched to the fictional exchange registry.');
    await page.getByRole('button', { name: 'Add label' }).click();
    await expect(page.getByText('Label added')).toBeVisible();

    await page.goto('/admin/signals');
    await page.getByLabel('Address', { exact: true }).fill(SOLANA_TOKEN);
    await page.getByLabel('Public reason').fill('The issuer showed this is an officially bridged version.');
    await page.getByLabel('Internal rationale').fill('INTERNAL-ONLY reviewed the bridge documentation.');
    await page.getByRole('button', { name: 'Review and suppress' }).click();
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Indicator suppressed')).toBeVisible();

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.low}`);
    await expect(page.getByText('Demo exchange deposit wallet')).toBeVisible();
    await expect(page.getByText(/Matched to the fictional exchange registry/)).toHaveCount(0);
    await page.goto(`/address/solana/${SOLANA_TOKEN}`);
    await expect(page.getByText('Suppressed indicators')).toBeVisible();
    await expect(page.getByText(/officially bridged version/)).toBeVisible();
    await expect(page.getByText(/INTERNAL-ONLY/)).toHaveCount(0);
  });

  test('a member edits their private display name', async ({ page, context }) => {
    await as(context, 'member');
    await page.goto('/settings/profile');
    await page.getByLabel('Display name (optional)').fill('Dee');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Display name (optional)')).toHaveValue('Dee');
  });
});

test.describe('console and new pages: accessibility and layout', () => {
  const pages: readonly [string, string][] = [
    ['/admin', 'admin'],
    ['/admin/staff', 'admin'],
    ['/admin/users', 'admin'],
    ['/admin/labels', 'admin'],
    ['/admin/signals', 'admin'],
    ['/mod/findings', 'moderator'],
    [`/responses/new?chain=ethereum&address=${EVM.contractWithDisclosures}`, 'member'],
    ['/responses/new?project=demoswap', 'member'],
    ['/settings/profile', 'member'],
  ];
  for (const [path, viewer] of pages) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page, context }) => {
      await as(context, viewer);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await settle(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
    });
  }

  test('they do not scroll sideways on a small screen', async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const [path, viewer] of pages) {
      await as(context, viewer);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
