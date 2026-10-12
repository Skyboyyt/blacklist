import { expect, test } from '@playwright/test';
import { AMBIGUOUS, EVM, SOLANA_TOKEN } from './fixtures';

test.describe('universal search and research', () => {
  test('search from the home page to a research result', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('searchbox', { name: 'Address or transaction hash' });
    await box.fill(EVM.severeUnderAppeal);
    await expect(page.getByText('Ethereum address detected')).toBeVisible();
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    const result = page.getByRole('link', { name: /drains token approvals/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(new RegExp(`/address/ethereum/${EVM.severeUnderAppeal}$`));
    await expect(page.getByText('Severe risk').first()).toBeVisible();
    await expect(page.getByText('Disputed — under appeal').first()).toBeVisible();
    await expect(page.getByText('Moderator finding').first()).toBeVisible();
    await expect(page.getByText('High confidence')).toBeVisible();
  });

  test('research pages never show a numeric risk score', async ({ page }) => {
    for (const address of [EVM.low, EVM.high, EVM.severeUnderAppeal]) {
      await page.goto(`/address/ethereum/${address}`);
      const text = (await page.locator('main').innerText()).toLowerCase();
      expect(text).not.toContain('score');
      expect(text).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
    }
  });

  test('ambiguous input asks for a network', async ({ page }) => {
    await page.goto(`/search?q=${AMBIGUOUS}`);
    await expect(page.getByRole('heading', { name: 'Address detected — choose network' })).toBeVisible();
    await page.getByRole('link', { name: /Search on Solana/ }).click();
    await expect(page).toHaveURL(/chain=solana/);
    await expect(page.getByText('No records found')).toBeVisible();
  });

  test('not found, invalid, unsupported and provider-unavailable states', async ({ page }) => {
    await page.goto(`/search?q=${EVM.unknown}`);
    await expect(page.getByText('This is not a sign that it is safe.')).toBeVisible();
    await page.goto('/search?q=0x12345');
    await expect(page.getByText(/doesn’t look like a supported address/)).toBeVisible();
    await page.goto('/search?q=example.eth');
    await expect(page.getByText('Network not supported')).toBeVisible();
    await page.goto(`/search?q=${EVM.providerUnavailable}`);
    await expect(page.getByText('Blockchain data is temporarily unavailable')).toBeVisible();
    await page.goto('/address/bitcoin/abc');
    await expect(page.getByRole('heading', { level: 1, name: 'Network not supported' })).toBeVisible();
  });

  test('unexpected errors show the error boundary without internals', async ({ page }) => {
    await page.goto(`/search?q=${EVM.error}`);
    await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toBeVisible();
    await expect(page.getByText(/Mock failure/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('suspended and not-assessed states use neutral wording', async ({ page }) => {
    await page.goto(`/address/ethereum/${EVM.suspended}`);
    await expect(page.getByText('Temporarily suspended pending review').first()).toBeVisible();
    await expect(page.getByText(/not an indication of safety/)).toBeVisible();
  });

  test('untrusted token names are marked as unverified', async ({ page }) => {
    await page.goto(`/address/solana/${SOLANA_TOKEN}`);
    await expect(page.getByText('Self-reported name — unverified')).toBeVisible();
  });

  test('transfers explain authorization and avoid guilt by association', async ({ page }) => {
    await page.goto(`/address/ethereum/${EVM.high}`);
    await page.getByRole('tab', { name: /Transfers/ }).click();
    await expect(page.getByText(/does not mean wrongdoing/)).toBeVisible();
    await expect(page.getByText('Who authorized this transfer is unknown.')).toBeVisible();
  });

  test('capability disclosures are shown neutrally and do not raise the band (P1-01)', async ({ page }) => {
    await page.goto(`/address/ethereum/${EVM.contractWithDisclosures}`);
    const disclosures = page.getByRole('region', { name: 'Disclosures' });
    await expect(disclosures.getByText('Upgrade authority present')).toBeVisible();
    await expect(disclosures.getByText('Pause authority present')).toBeVisible();
    await expect(disclosures.getByText('Source code not verified')).toBeVisible();
    const assessment = page.getByRole('region', { name: 'Risk assessment' });
    await expect(assessment.getByText('Low risk')).toBeVisible();
    await expect(assessment.getByText('Upgrade authority present')).toHaveCount(0);
  });

  test('an explicitly selected network is never silently replaced (P1-06)', async ({ page }) => {
    await page.goto(`/search?q=${EVM.low}&chain=solana`);
    await expect(page.getByText('This is not a valid Solana address.')).toBeVisible();
    await page.goto(`/search?q=${EVM.low}&chain=bitcoin`);
    await expect(page.getByText('Network not supported')).toBeVisible();
  });

  test('public research shows no report-receipt activity (P1-02)', async ({ page }) => {
    await page.goto(`/address/ethereum/${EVM.high}`);
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText('Finding published after approval')).toBeVisible();
    await expect(page.getByText(/report received/i)).toHaveCount(0);
  });

  test('malformed URLs are rejected with 400, not a server error', async ({ request }) => {
    const response = await request.get('/address/ethereum/%E0%A4%A');
    expect(response.status()).toBe(400);
  });
});
