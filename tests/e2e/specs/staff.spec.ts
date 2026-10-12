import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { settle } from './settle';

const ORIGIN = 'http://localhost:3100';

async function as(context: BrowserContext, viewer: string, passkey = 'verified') {
  await context.addCookies([
    { name: 'bl_mock_viewer', value: viewer, url: ORIGIN },
    { name: 'bl_mock_passkey', value: passkey, url: ORIGIN },
  ]);
}

async function confirmWithSecurityKey(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Continue to security key' }).click();
  await page
    .getByRole('dialog', { name: 'Verify with your security key' })
    .getByRole('button', { name: 'Verify and continue' })
    .click();
}

test.describe('staff access (mock)', () => {
  test('members see the staff boundary, not staff data', async ({ page, context }) => {
    await as(context, 'member');
    await page.goto('/mod');
    await expect(page.getByRole('heading', { name: 'Staff access required' })).toBeVisible();
  });

  test('appeal reviewers cannot open approvals; moderators cannot open the audit history', async ({
    page,
    context,
  }) => {
    await as(context, 'appeal_reviewer');
    await page.goto('/mod/approvals');
    await expect(page.getByText('Access denied')).toBeVisible();
    await as(context, 'moderator');
    await page.goto('/admin/audit');
    await expect(page.getByText('The audit history is available to administrators only.')).toBeVisible();
  });

  test('administrators see the audit history, labelled as mock', async ({ page, context }) => {
    await as(context, 'admin');
    await page.goto('/admin/audit');
    await expect(page.getByText('Mock audit history')).toBeVisible();
  });
});

test.describe('review flows (mock)', () => {
  test('dashboard filters to appeals and opens a case', async ({ page, context }) => {
    await as(context, 'moderator');
    await page.goto('/mod');
    await expect(page.getByText('Open reports')).toBeVisible();
    await page.getByLabel('Case type').selectOption('appeal_review');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('heading', { name: '2 cases' })).toBeVisible();
    await page.getByRole('link', { name: /Appeal against the severe finding/ }).click();
    await expect(page).toHaveURL(/\/mod\/cases\/APL-2001$/);
    await expect(page.getByText('Original decision')).toBeVisible();
  });

  test('start review, then reject with confirmation and a security key', async ({ page, context }) => {
    await as(context, 'moderator');
    await page.goto('/mod/cases/RPT-1001');
    await page.getByRole('button', { name: 'Start review' }).click();
    await page.getByRole('button', { name: 'Reject report' }).click();
    await page.getByLabel('Internal rationale').fill('No payment evidence could be verified.');
    await page.getByRole('button', { name: 'Review and confirm' }).click();
    await expect(page.getByRole('dialog', { name: 'Reject report?' })).toContainText('Submitter sees:');
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Shown to the submitter only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject report' })).toHaveCount(0);
  });

  test('a conflicting change by another reviewer is reported, not overwritten', async ({ page, context }) => {
    await as(context, 'moderator_b');
    await page.goto('/mod/cases/RPT-1007');
    await page.getByLabel('Add an internal note').fill('My working note.');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('This changed while you were working')).toBeVisible();
    await page.getByRole('button', { name: 'Load the latest version' }).click();
    await expect(page.getByText('Added evidence context while you had this case open.')).toBeVisible();
  });

  test('an administrator accepts a profile correction and the profile revision changes', async ({
    page,
    context,
  }) => {
    await as(context, 'admin');
    await page.goto('/mod/cases/COR-3001');
    await expect(page.getByText(/Current public profile: revision 2/)).toBeVisible();
    await page.getByRole('button', { name: 'Start review' }).click();
    await page.getByRole('button', { name: 'Accept correction' }).click();
    await page.getByLabel('Public explanation').fill('Description and documentation domain updated.');
    await page.getByLabel('Internal rationale').fill('Announcement on the official domain confirms it.');
    await page.getByRole('button', { name: 'Review and confirm' }).click();
    await confirmWithSecurityKey(page);
    await expect(
      page.getByText(
        /Current public profile: revision 3. Official domains: demoswap.example, docs.demoswap.example/,
      ),
    ).toBeVisible();
  });

  test('an independent moderator approves a severe revision', async ({ page, context }) => {
    await as(context, 'moderator_b');
    await page.goto('/mod/approvals');
    const card = page.getByRole('article').filter({ hasText: 'demo-finding-502 · revision 1' });
    await card.getByRole('button', { name: 'Approve this revision' }).click();
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Revision approved')).toBeVisible();
  });
});

test.describe('staff accessibility and layout', () => {
  for (const path of ['/mod', '/mod/cases/RPT-1003', '/mod/cases/COR-3001', '/mod/approvals']) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page, context }) => {
      await as(context, 'moderator');
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

  test('staff pages do not scroll sideways on a small screen', async ({ page, context }) => {
    await as(context, 'moderator');
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ['/mod', '/mod/cases/RPT-1001', '/mod/cases/COR-3001']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
