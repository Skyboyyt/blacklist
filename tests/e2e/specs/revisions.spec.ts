import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { EVM } from './fixtures';
import { settle } from './settle';

/**
 * Finding revisions and appeal amendments on the shared MOCK store (moderation §2, §8.1,
 * §9). Each browser context has its own demo session. Nothing is real.
 */
const ORIGIN = 'http://localhost:3100';
const ORIGINAL =
  'Reviewed evidence shows victims were directed to send funds to this address by an account impersonating project support.';
const EDITED = 'Reviewed evidence shows at least four people sent funds here after a fake support chat.';

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

async function propose(page: Page, findingId: string, fields: { severity?: string; summary: string }) {
  await page.goto(`/mod/findings/${findingId}`);
  await expect(page.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  if (fields.severity) await page.getByLabel('Severity', { exact: true }).selectOption(fields.severity);
  await page.getByLabel('Public summary').fill(fields.summary);
  await page.getByLabel('Internal rationale (staff only)').fill('Further reports confirmed the details.');
  await page.getByRole('button', { name: 'Propose revision' }).click();
}

async function approve(page: Page, card: string) {
  await page.goto('/mod/approvals');
  await page
    .getByRole('article')
    .filter({ hasText: card })
    .getByRole('button', { name: 'Approve this revision' })
    .click();
  await confirmWithSecurityKey(page);
}

test.describe('finding revisions (mock)', () => {
  test('a moderator proposes a new revision; the public text changes only after approval', async ({
    page,
    context,
  }) => {
    await as(context, 'moderator');
    await page.goto('/mod/findings');
    await page.getByRole('link', { name: 'Revisions of demo-finding-301' }).click();
    await expect(page).toHaveURL(/\/mod\/findings\/demo-finding-301$/);
    await expect(page.getByRole('heading', { name: 'Revision 1' })).toContainText('Published');
    await propose(page, 'demo-finding-301', { summary: EDITED });
    await expect(page.getByText('Revision 2 proposed')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revision 2' })).toContainText('Awaiting approval');
    await expect(page.getByRole('heading', { name: 'Revision 1' })).toContainText('Published');

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText(ORIGINAL).first()).toBeVisible();
    await expect(page.getByText(EDITED)).toHaveCount(0);

    await as(context, 'moderator');
    await approve(page, 'demo-finding-301 · revision 2');
    await expect(page.getByText('Revision approved')).toBeVisible();

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText(EDITED).first()).toBeVisible();
    await expect(page.getByText('Further reports confirmed the details.')).toHaveCount(0);
  });

  test('an edit made on an outdated screen is refused and asks to load the latest revision', async ({
    page,
    context,
  }) => {
    await as(context, 'moderator');
    await page.goto('/mod/findings/demo-finding-301');
    await expect(page.getByRole('heading', { name: 'Revision history' })).toBeVisible();
    const other = await context.newPage();
    await propose(other, 'demo-finding-301', { summary: EDITED });
    await expect(other.getByText('Revision 2 proposed')).toBeVisible();
    await other.close();

    await page.getByLabel('Public summary').fill('An edit based on revision 1 only.');
    await page.getByLabel('Internal rationale (staff only)').fill('Older screen, should be refused.');
    await page.getByRole('button', { name: 'Propose revision' }).click();
    await expect(page.getByText('This changed while you were working')).toBeVisible();
    await page.getByRole('button', { name: 'Load the latest revision' }).click();
    await expect(page.getByText(/Based on revision 2/)).toBeVisible();
  });

  test('replacing a severe finding needs an independent approver', async ({ page, context }) => {
    await as(context, 'moderator');
    await propose(page, 'demo-finding-401', {
      severity: 'high',
      summary: 'The contract moved approved balances to the deployer; the severity was overstated.',
    });
    await expect(page.getByText('Revision 2 proposed')).toBeVisible();
    await expect(page.getByText(/needs an independent approver/).first()).toBeVisible();
    await approve(page, 'demo-finding-401 · revision 2');
    await expect(page.getByText('You can’t take this decision')).toBeVisible();

    await as(context, 'admin');
    await approve(page, 'demo-finding-401 · revision 2');
    await expect(page.getByText('Revision approved')).toBeVisible();
  });

  test('an appeal amendment creates a revision that still needs approval', async ({ page, context }) => {
    const amended = 'Funds reached this address after a fake support chat; two reports were duplicates.';
    await as(context, 'appeal_reviewer');
    await page.goto('/mod/cases/APL-2002');
    await page
      .getByRole('group', { name: 'Available decisions' })
      .getByRole('button', { name: 'Amend finding' })
      .click();
    await page.getByLabel('Finding severity').selectOption('medium');
    await page.getByLabel('Amended public summary').fill(amended);
    await page.getByLabel('Internal rationale').fill('The appellant showed duplicate reports.');
    await page.getByRole('button', { name: 'Review and confirm' }).click();
    await confirmWithSecurityKey(page);

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText(ORIGINAL).first()).toBeVisible();
    await expect(page.getByText(amended)).toHaveCount(0);

    await as(context, 'moderator');
    await page.goto('/mod/findings/demo-finding-301');
    await expect(page.getByRole('heading', { name: 'Revision 2' })).toContainText('Awaiting approval');
    await expect(page.getByText('from case APL-2002')).toBeVisible();
    await approve(page, 'demo-finding-301 · revision 2');
    await expect(page.getByText('Revision approved')).toBeVisible();
    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText(amended).first()).toBeVisible();
  });

  test('the revision page has no WCAG 2.2 AA violations and no sideways scroll at 320 px', async ({
    page,
    context,
  }) => {
    await as(context, 'moderator');
    await page.goto('/mod/findings/demo-finding-401');
    await expect(page.getByRole('heading', { name: 'Revision history' })).toBeVisible();
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

  test('an unknown finding shows a not-found state and members are refused', async ({ page, context }) => {
    await as(context, 'moderator');
    await page.goto('/mod/findings/demo-finding-unknown');
    await expect(page.getByText('Finding not found')).toBeVisible();
    await as(context, 'member');
    await page.goto('/mod/findings/demo-finding-301');
    await expect(page.getByText('Revision history')).toHaveCount(0);
  });
});
