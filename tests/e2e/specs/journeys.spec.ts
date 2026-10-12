import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { EVM } from './fixtures';
import { settle } from './settle';

/**
 * Phase 5 end-to-end journeys across member and staff roles. They run against the
 * shared MOCK store: each browser context gets its own demo session, so switching the
 * preview viewer keeps the same data while each test starts from the fixtures.
 * Nothing here is processed by a real backend.
 */
const ORIGIN = 'http://localhost:3100';
const PNG = { name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from('demo-image') };

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
}

async function decide(page: Page, action: string, fields: Record<string, string>, stepUp: boolean) {
  await page
    .getByRole('group', { name: 'Available decisions' })
    .getByRole('button', { name: action })
    .click();
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label).fill(value);
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  if (stepUp) await confirmWithSecurityKey(page);
  else await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

function caseIdFrom(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').pop();
  if (!id) throw new Error('No submission id in the URL');
  return id;
}

test.describe('member to staff journeys (mock)', () => {
  test('report → information request → reply → accepted → approved → public finding', async ({
    page,
    context,
  }) => {
    await as(context, 'member');
    await page.goto('/reports/new');
    await page.getByLabel('Short title').fill('Fake airdrop claim page');
    await page.getByLabel('Address 1').fill(EVM.low);
    await page.getByLabel('When did it happen?').fill('2026-09-01');
    await page.getByLabel('What happened?').fill('A fake airdrop page asked me to approve a token spender.');
    await page.getByRole('button', { name: 'Send private report' }).click();
    await expect(page).toHaveURL(/\/reports\/RPT-\d+$/);
    const id = caseIdFrom(page);
    await expect(page.getByText('Waiting for review')).toBeVisible();

    await as(context, 'moderator');
    await page.goto(`/mod/cases/${id}`);
    await page.getByRole('button', { name: 'Start review' }).click();
    await decide(
      page,
      'Request information',
      { 'Message to the submitter': 'Please add the transaction hash of the approval.' },
      false,
    );

    await as(context, 'member');
    await page.goto(`/reports/${id}`);
    await expect(page.getByText('Please add the transaction hash of the approval.')).toBeVisible();
    await page.getByLabel('Your reply').fill('I no longer have the hash, but the page is still online.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('In review', { exact: true })).toBeVisible();

    await as(context, 'moderator');
    await page.goto(`/mod/cases/${id}`);
    await expect(page.getByText('I no longer have the hash, but the page is still online.')).toBeVisible();
    await page.getByRole('button', { name: 'Accept and draft finding' }).click();
    await page.getByLabel('Finding severity').selectOption('high');
    await page
      .getByLabel('Public explanation')
      .fill('This address collected approvals through a fake airdrop page.');
    await page.getByLabel('Internal rationale').fill('INTERNAL-ONLY reporter evidence matched the page.');
    await page.getByRole('button', { name: 'Review and confirm' }).click();
    await confirmWithSecurityKey(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await as(context, 'moderator_b');
    await page.goto('/mod/approvals');
    const card = page
      .getByRole('article')
      .filter({ hasText: 'collected approvals through a fake airdrop page' });
    await card.getByRole('button', { name: 'Approve this revision' }).click();
    await confirmWithSecurityKey(page);
    await expect(page.getByText('Revision approved')).toBeVisible();

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.low}`);
    await expect(
      page.getByText('This address collected approvals through a fake airdrop page.').first(),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText('A finding was published after approval')).toBeVisible();
    await expect(page.getByText(/INTERNAL-ONLY/)).toHaveCount(0);
    await expect(page.getByText(/Please add the transaction hash/)).toHaveCount(0);
  });

  test('project suggestion → administrator accepts with a security key → public profile', async ({
    page,
    context,
  }) => {
    await as(context, 'member');
    await page.goto('/projects');
    await page.getByRole('link', { name: 'Suggest a project' }).click();
    await expect(page).toHaveURL(/\/projects\/suggest$/);
    await page.getByLabel('Project name').fill('Demo Lending Hub');
    await page.getByLabel('Contract or mint address').fill(`0xb1ac${'7'.repeat(36)}`);
    await page.getByLabel('Official link 1').fill('https://lending-hub.example');
    await page
      .getByLabel('Description')
      .fill('A fictional lending market used to demonstrate project suggestions.');
    await page.getByLabel('Your connection to the project').fill('I am a fictional community member.');
    await page.getByRole('button', { name: 'Send suggestion' }).click();
    await expect(page).toHaveURL(/\/projects\/suggestions\/SUG-\d+$/);
    const id = caseIdFrom(page);
    await expect(page.getByRole('main').getByText('Submitted', { exact: true }).first()).toBeVisible();

    await as(context, 'moderator');
    await page.goto(`/mod/cases/${id}`);
    await expect(page.getByRole('button', { name: 'Accept and publish profile' })).toHaveCount(0);

    await as(context, 'admin');
    await page.goto(`/mod/cases/${id}`);
    await page.getByRole('button', { name: 'Assign to me' }).click();
    await expect(page.getByText('Assigned to you')).toBeVisible();
    await decide(
      page,
      'Accept and publish profile',
      {
        'Public explanation': 'Profile created from a checked suggestion.',
        'Internal rationale': 'Official link and contract matched.',
      },
      true,
    );

    await as(context, 'member');
    await page.goto(`/projects/suggestions/${id}`);
    await expect(page.getByText('Accepted: profile published').first()).toBeVisible();
    await page.getByRole('link', { name: 'See the public page' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Demo Lending Hub' })).toBeVisible();
    await expect(page.getByText(/fictional community member/)).toHaveCount(0);

    await page.goto('/projects?q=Lending');
    await expect(page.getByRole('link', { name: /Demo Lending Hub/ })).toBeVisible();
  });

  test('profile correction → administrator accepts → the public profile changes', async ({
    page,
    context,
  }) => {
    await as(context, 'member');
    await page.goto('/project/demoswap');
    await page.getByRole('link', { name: 'Propose a correction' }).click();
    await expect(page).toHaveURL(/\/corrections\/new\?project=demoswap$/);
    await page
      .getByLabel('New description (optional)')
      .fill('DemoSwap is a fictional exchange with a new governance portal.');
    await page
      .getByLabel('Why is this correct?')
      .fill('The official announcement describes the governance portal.');
    await page.getByRole('button', { name: 'Send correction request' }).click();
    await expect(page).toHaveURL(/\/corrections\/COR-\d+$/);
    const id = caseIdFrom(page);

    await as(context, 'admin');
    await page.goto(`/mod/cases/${id}`);
    await page.getByRole('button', { name: 'Start review' }).click();
    await decide(
      page,
      'Accept correction',
      { 'Public explanation': 'Description updated.', 'Internal rationale': 'Announcement confirms it.' },
      true,
    );

    await as(context, 'anonymous');
    await page.goto('/project/demoswap');
    await expect(
      page.getByText('DemoSwap is a fictional exchange with a new governance portal.').first(),
    ).toBeVisible();
    await expect(page.getByText('Profile revised after a correction request')).toBeVisible();
  });

  test('appeal with documents → standing granted → reversed → finding removed', async ({ page, context }) => {
    await as(context, 'member');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await page
      .getByRole('link', { name: /^Appeal this finding/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/appeals\/new\?finding=demo-finding-301$/);
    await page
      .getByLabel('Why is the finding wrong?')
      .fill('The payments were refunds from a support desk I operate.');
    await page.getByLabel('Documents reviewed by staff').check();
    await page.getByLabel('What do the documents show?').fill('Refund records for each payment.');
    await page.getByLabel('Choose images').setInputFiles(PNG);
    await expect(page.getByText('Ready (demo)')).toBeVisible();
    await page.getByRole('button', { name: 'Send appeal' }).click();
    await expect(page).toHaveURL(/\/appeals\/APL-\d+$/);
    const id = caseIdFrom(page);

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByText('Disputed — under appeal').first()).toBeVisible();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText('An appeal was filed').first()).toBeVisible();

    await as(context, 'moderator_b');
    await page.goto(`/mod/cases/${id}`);
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'You took part in the decision under appeal' }),
    ).toBeVisible();

    await as(context, 'moderator');
    await page.goto(`/mod/cases/${id}`);
    await expect(page.getByRole('button', { name: 'Grant standing' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText('Assigned to you')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reverse finding' })).toHaveCount(0);
    await decide(
      page,
      'Grant standing',
      { 'Internal rationale': 'Refund records match the payments.' },
      false,
    );
    await decide(
      page,
      'Reverse finding',
      { 'Public explanation': 'The payments were refunds.', 'Internal rationale': 'Records verified.' },
      true,
    );

    await as(context, 'member');
    await page.goto(`/appeals/${id}`);
    await expect(page.getByText('Decided: finding reversed').first()).toBeVisible();

    await as(context, 'anonymous');
    await page.goto(`/address/ethereum/${EVM.high}`);
    await expect(page.getByRole('link', { name: /^Appeal this finding/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText(/Finding reversed on appeal/)).toBeVisible();
  });

  test('a stale reply is reported, and the latest status can be loaded', async ({ page, context }) => {
    await as(context, 'member');
    await page.goto('/reports/RPT-1003');
    await expect(page.getByText('Information requested').first()).toBeVisible();
    // A second tab withdraws the report while this one still shows the reply form.
    const other = await context.newPage();
    await other.goto('/reports/RPT-1003');
    await other.getByRole('button', { name: 'Withdraw' }).click();
    await other.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
    await expect(other.getByText('Withdrawn', { exact: true })).toBeVisible();
    await page.getByLabel('Your reply').fill('Here is more information for you.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('button', { name: 'Load the latest status' })).toBeVisible();
    await page.getByRole('button', { name: 'Load the latest status' }).click();
    await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible();
  });

  test('demo reset restores the fixtures for this browser only', async ({ page, context }) => {
    await as(context, 'member');
    await page.goto('/reports/RPT-1003');
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await expect(page.getByText('Demo data reset.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Information requested').first()).toBeVisible();
  });
});

test.describe('member boundaries (mock)', () => {
  test('signed-out visitors are asked to sign in before submitting', async ({ page, context }) => {
    await as(context, 'anonymous');
    for (const path of ['/reports/new', '/projects/suggest', '/appeals/new?finding=demo-finding-301']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: /sign in/i }).first(), path).toBeVisible();
    }
  });

  test("another member cannot open someone else's submission", async ({ page, context }) => {
    await as(context, 'member');
    await page.goto('/reports/RPT-1001');
    await expect(page.getByText(/couldn’t find|not found|doesn’t exist/i).first()).toBeVisible();
    await expect(page.getByLabel('Your reply')).toHaveCount(0);
  });

  test('the mock RPC refuses cross-origin calls and unknown methods', async ({ request }) => {
    const cross = await request.post('/api/mock/rpc', {
      headers: { origin: 'http://evil.example' },
      data: { service: 'member', method: 'listSubmissions', args: [] },
    });
    expect(cross.status()).toBe(403);
    const unknown = await request.post('/api/mock/rpc', {
      headers: { origin: ORIGIN },
      data: { service: 'member', method: 'constructor', args: [] },
    });
    expect(unknown.status()).toBe(400);
  });
});

test.describe('member pages accessibility and layout', () => {
  const paths = [
    '/reports/new',
    '/reports/RPT-1003',
    '/projects/suggest',
    '/corrections/new?project=demoswap',
    '/appeals/new?finding=demo-finding-301',
    '/notifications',
    '/dashboard',
  ];
  for (const path of paths) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page, context }) => {
      await as(context, 'member');
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

  test('member pages do not scroll sideways on a small screen', async ({ page, context }) => {
    await as(context, 'member');
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('transparency pages', () => {
  for (const [path, heading] of [
    ['/privacy', 'Privacy'],
    ['/security', 'Security'],
    ['/terms', 'Terms'],
    ['/methodology', 'Methodology'],
  ] as const) {
    test(`${path} is reachable from the footer, marked as a draft where needed, and accessible`, async ({
      page,
    }) => {
      await page.goto('/');
      await page
        .getByRole('navigation', { name: 'Transparency' })
        .getByRole('link', { name: heading })
        .click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (path !== '/methodology') await expect(page.getByText('Draft pending legal review')).toBeVisible();
      await settle(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
