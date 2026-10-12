import AxeBuilder from '@axe-core/playwright';
import { settle } from './settle';
import { expect, test, type BrowserContext } from '@playwright/test';

const ORIGIN = 'http://localhost:3100';

async function preview(context: BrowserContext, values: Record<string, string>) {
  await context.addCookies(Object.entries(values).map(([name, value]) => ({ name, value, url: ORIGIN })));
}

test.describe('account security (mock)', () => {
  test('security overview, password change and sessions', async ({ page }) => {
    await page.goto('/settings/security');
    await expect(page.getByRole('heading', { level: 2, name: 'Security' })).toBeVisible();
    await expect(page.getByText('member@example.test')).toBeVisible();

    await page.getByRole('link', { name: 'Manage' }).first().click();
    await expect(page).toHaveURL(/\/settings\/security\/sessions$/);
    await page.getByRole('button', { name: 'Sign out Safari on iPhone' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign out this session?' });
    await dialog.getByRole('button', { name: 'Sign out session' }).click();
    await expect(page.getByText('Safari on iPhone was signed out.')).toBeVisible();
  });

  test('email change needs re-authentication and answers generically', async ({ page }) => {
    await page.goto('/settings/security/email');
    await page.getByLabel('New email address').fill('new@example.test');
    await page.getByRole('button', { name: 'Send confirmation link' }).click();
    const reauth = page.getByRole('dialog', { name: 'Confirm it’s you' });
    await reauth.getByLabel('Password', { exact: true }).fill('my current passphrase');
    await reauth.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Check your new inbox')).toBeVisible();
    await expect(page.getByText(/If new@example\.test can be used/)).toBeVisible();
  });

  test('cooling period blocks email change with a calm explanation', async ({ page, context }) => {
    await preview(context, { bl_mock_scenario: 'cooling_period' });
    await page.goto('/settings/security/email');
    await expect(page.getByText('Some changes are paused after a password reset')).toBeVisible();
    await expect(page.getByLabel('New email address')).toHaveCount(0);
  });

  test('an expired session shows the session-ended page with a safe return path', async ({
    page,
    context,
  }) => {
    await preview(context, { bl_mock_scenario: 'session_expired' });
    await page.goto('/settings/security/sessions');
    await expect(page.getByRole('heading', { name: 'Your session has ended' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign in again' }).click();
    await expect(page).toHaveURL(/\/login\?reason=session_expired&next=%2Fsettings%2Fsecurity%2Fsessions/);
    await expect(page.getByRole('status').filter({ hasText: 'Your session has ended' })).toBeVisible();
  });

  test('sign out returns to the public home and the account area then asks to sign in', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/dashboard');
    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
    } else {
      await page.getByRole('complementary').getByRole('button', { name: 'Sign out' }).click();
    }
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeVisible();
  });

  test('staff security area is presentation only and needs a staff viewer', async ({ page, context }) => {
    await page.goto('/settings/security/staff');
    await expect(page.getByRole('heading', { level: 1, name: 'Staff access required' })).toBeVisible();
    await preview(context, { bl_mock_viewer: 'moderator' });
    await page.goto('/settings/security/staff');
    await expect(page.getByRole('button', { name: 'Remove Hardware security key' })).toBeVisible();
  });
});

test.describe('staff passkey flows (mock)', () => {
  test('staff sign-in: password, then passkey; cancellation offers a retry', async ({ page, context }) => {
    await preview(context, { bl_mock_passkey: 'cancelled' });
    await page.goto('/login');
    await page.getByLabel('Email').fill('staff@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a long staff passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/staff\/verify$/);
    await page.getByRole('button', { name: 'Use security key or passkey' }).click();
    await expect(page.getByText('Verification was cancelled')).toBeVisible();
    await preview(context, { bl_mock_passkey: 'verified' });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/\/mod$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Moderation queue' })).toBeVisible();
  });

  test('staff enrollment requires the code and two authenticators; token leaves the URL', async ({
    page,
  }) => {
    const response = await page.goto('/staff/enroll#token=demo-invite-token-0001');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    expect(response?.headers()['cache-control']).toContain('no-store');
    await expect(page.getByLabel('Enrollment code')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    await page.getByLabel('Enrollment code').fill('DEMO2026AB');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Password', { exact: true }).fill('a long staff passphrase');
    await page.getByLabel('Confirm password').fill('a long staff passphrase');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Register first authenticator' }).click();
    await page.getByRole('button', { name: 'Register second authenticator' }).click();
    await expect(page.getByText('Your staff account is ready')).toBeVisible();
    const stored = await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    );
    expect(stored).not.toContain('demo-invite-token-0001');
  });

  test('staff recovery page shows progress without any bypass', async ({ page, context }) => {
    await preview(context, { bl_mock_scenario: 'staff_recovery' });
    await page.goto('/staff/recovery');
    await expect(page.getByText('A recovery case is open for your account')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recovery progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: /break|bypass|skip/i })).toHaveCount(0);
  });
});

test.describe('account headers and accessibility', () => {
  test('account pages are never cached, including prefetches', async ({ request }) => {
    for (const path of ['/settings/security', '/settings/security/sessions', '/login', '/staff/verify']) {
      for (const headers of [{}, { purpose: 'prefetch' }]) {
        const response = await request.get(path, { headers });
        expect(response.headers()['cache-control']).toContain('no-store');
        expect(response.headers()['content-security-policy']).toMatch(/style-src 'self' 'nonce-/);
      }
    }
  });

  test('dialogs work under the nonce style policy without CSP errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(msg.text());
    });
    await page.goto('/settings/security/sessions');
    // Keyboard activation: focus return matters for keyboard users (Safari does not focus
    // buttons on mouse click, so there is no focused opener to return to after a click).
    const opener = page.getByRole('button', { name: 'Sign out Safari on iPhone' });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sign out Safari on iPhone' })).toBeFocused();
    expect(problems).toEqual([]);
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const path of [
      '/settings/security',
      '/settings/security/password',
      '/settings/security/email',
      '/settings/security/sessions',
      '/staff/enroll#token=demo-invite-token-0001',
      '/staff/verify',
      '/staff/recovery',
    ]) {
      test(`${path} (${scheme}) has no WCAG 2.2 AA violations`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await settle(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map(
            (v) =>
              `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${n.any[0]?.message ?? ''})`).join(', ')}`,
          ),
        ).toEqual([]);
      });
    }
  }
});
