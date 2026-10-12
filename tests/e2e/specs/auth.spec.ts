import { expect, test } from '@playwright/test';

test.describe('auth pages (mock)', () => {
  test('login shows a generic failure and keeps the email', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('someone@example.test');
    await page.getByLabel('Password', { exact: true }).fill('not the right password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Email')).toHaveValue('someone@example.test');
  });

  test('login validates inline before sending anything', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
  });

  test('a successful mock sign-in follows only a safe next path', async ({ page }) => {
    await page.goto('/login?next=//evil.example/steal');
    await page.getByLabel('Email').fill('member@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a long enough passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('registration is email-first and does not reveal whether the account exists', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await page.getByLabel('Email').fill('member@example.test');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(/If this address can be used/)).toBeVisible();
  });

  test('token pages strip the token from the URL and send no referrer', async ({ page }) => {
    const response = await page.goto('/register/complete#token=demo-valid-token-0001');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(page.getByLabel('Handle')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    await page.getByLabel('Handle').fill('demo_user');
    await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
    await page.getByLabel('Confirm password').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Account created')).toBeVisible();
  });

  test('reset password shows expired and missing-token states', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText('This link is incomplete')).toBeVisible();
    // Email links open as a fresh page load, not a same-document hash change.
    await page.goto('/');
    await page.goto('/reset-password#token=expired-demo-token-0001');
    await page.getByLabel('New password', { exact: true }).fill('correct horse battery staple');
    await page.getByLabel('Confirm new password').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.getByText('This link has expired')).toBeVisible();
  });

  test('auth pages remind users that seed phrases are never requested', async ({ page }) => {
    for (const path of ['/login', '/register', '/forgot-password']) {
      await page.goto(path);
      await expect(
        page.getByText('Blacklist will never ask for your seed phrase or private key.'),
      ).toBeVisible();
    }
  });
});
