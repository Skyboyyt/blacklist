import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { EVM, SOLANA_TOKEN } from './fixtures';
import { settle } from './settle';

/**
 * Phase 6 frontend quality audit on the MOCK app: every route, as the viewer that can see
 * it, at phone, tablet, laptop and desktop widths, in portrait and landscape, light and
 * dark, with WCAG 1.4.12 text spacing. It sets its own viewports, so it runs once (desktop
 * project). These are automated checks; the manual checks are recorded in AI_HANDOFF.md.
 */
const ORIGIN = 'http://localhost:3100';

const ROUTES: readonly { readonly path: string; readonly viewer: string }[] = [
  { path: '/', viewer: 'anonymous' },
  { path: `/search?q=${EVM.high}`, viewer: 'anonymous' },
  { path: `/address/ethereum/${EVM.severeUnderAppeal}`, viewer: 'anonymous' },
  { path: `/address/ethereum/${EVM.contractWithDisclosures}`, viewer: 'anonymous' },
  { path: `/address/ethereum/${EVM.suspended}`, viewer: 'anonymous' },
  { path: `/address/solana/${SOLANA_TOKEN}`, viewer: 'anonymous' },
  { path: '/tx/ethereum/0xb1ac' + '0'.repeat(59) + '1', viewer: 'anonymous' },
  { path: '/projects', viewer: 'anonymous' },
  { path: '/project/demoswap', viewer: 'member' },
  { path: '/scoreboard', viewer: 'anonymous' },
  { path: '/methodology', viewer: 'anonymous' },
  { path: '/privacy', viewer: 'anonymous' },
  { path: '/login', viewer: 'anonymous' },
  { path: '/register', viewer: 'anonymous' },
  { path: '/forgot-password', viewer: 'anonymous' },
  { path: '/dashboard', viewer: 'member' },
  { path: '/reports', viewer: 'member' },
  { path: '/reports/new', viewer: 'member' },
  { path: '/projects/suggest', viewer: 'member' },
  { path: '/corrections/new?project=demoswap', viewer: 'member' },
  { path: '/appeals/new?finding=demo-finding-301', viewer: 'member' },
  { path: `/responses/new?chain=ethereum&address=${EVM.high}`, viewer: 'member' },
  { path: '/notifications', viewer: 'member' },
  { path: '/settings/profile', viewer: 'member' },
  { path: '/settings/security', viewer: 'member' },
  { path: '/settings/security/sessions', viewer: 'member' },
  { path: '/mod', viewer: 'moderator' },
  { path: '/mod/cases/RPT-1001', viewer: 'moderator' },
  { path: '/mod/cases/APL-2002', viewer: 'appeal_reviewer' },
  { path: '/mod/approvals', viewer: 'moderator' },
  { path: '/mod/findings', viewer: 'moderator' },
  { path: '/mod/findings/demo-finding-401', viewer: 'moderator' },
  { path: '/mod/recovery', viewer: 'moderator' },
  { path: '/admin', viewer: 'admin' },
  { path: '/admin/staff', viewer: 'admin' },
  { path: '/admin/users', viewer: 'admin' },
  { path: '/admin/labels', viewer: 'admin' },
  { path: '/admin/signals', viewer: 'admin' },
  { path: '/admin/audit', viewer: 'admin' },
];

const VIEWPORTS = [
  { name: '320 portrait', width: 320, height: 640 },
  { name: 'phone portrait', width: 375, height: 812 },
  { name: 'phone landscape', width: 740, height: 360 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/**
 * WCAG 1.4.12 text spacing (bookmarklet values), applied through the CSSOM because the
 * page's CSP correctly refuses injected style elements.
 */
async function applyTextSpacing(page: Page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      el.style.setProperty('line-height', '1.5', 'important');
      el.style.setProperty('letter-spacing', '0.12em', 'important');
      el.style.setProperty('word-spacing', '0.16em', 'important');
      if (el.tagName === 'P') el.style.setProperty('margin-bottom', '2em', 'important');
    }
  });
}

async function as(context: BrowserContext, viewer: string) {
  await context.clearCookies();
  await context.addCookies([
    { name: 'bl_mock_viewer', value: viewer, url: ORIGIN },
    { name: 'bl_mock_passkey', value: 'verified', url: ORIGIN },
  ]);
}

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
}

/** Elements wider than the viewport or pushing the page sideways. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const page = document.documentElement.scrollWidth - width;
    const wide = [...document.querySelectorAll<HTMLElement>('main *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Content inside a horizontally scrollable region (tables) is allowed to be wider.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return false;
        }
        return r.right > width + 1;
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`);
    return { page, wide };
  });
}

/** WCAG 2.5.8: controls are at least 24×24 CSS px (inline text links are exempt). */
async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, [role=tab], [role=switch]',
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.closest('.sr-only')) return false;
        return r.width < 24 || r.height < 24;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`),
  );
}

test.describe('frontend quality audit (mock)', () => {
  test.skip(({ isMobile }) => isMobile, 'sets its own viewports, so it runs in the desktop project only');

  for (const route of ROUTES) {
    test(`${route.path} (${route.viewer}) reflows at every width and orientation`, async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await as(context, route.viewer);
      const problems: string[] = [];
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await ready(page, route.path);
        const o = await overflow(page);
        if (o.page > 0 || o.wide.length > 0)
          problems.push(`${vp.name}: page +${o.page}px ${o.wide.join(', ')}`);
        const small = await smallTargets(page);
        if (small.length > 0) problems.push(`${vp.name}: small targets ${small.join(', ')}`);
      }
      await page.setViewportSize({ width: 320, height: 640 });
      await ready(page, route.path);
      await applyTextSpacing(page);
      const spaced = await overflow(page);
      if (spaced.page > 0 || spaced.wide.length > 0)
        problems.push(`text spacing at 320: page +${spaced.page}px ${spaced.wide.join(', ')}`);
      expect(problems).toEqual([]);
    });

    test(`${route.path} (${route.viewer}) has no WCAG 2.2 AA violations in dark theme`, async ({
      page,
      context,
    }) => {
      test.setTimeout(90_000);
      await as(context, route.viewer);
      await page.emulateMedia({ colorScheme: 'dark' });
      await ready(page, route.path);
      await settle(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
    });
  }

  test('every focusable element on key pages shows a visible focus indicator', async ({ page, context }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    for (const route of [
      { path: '/', viewer: 'anonymous' },
      { path: `/address/ethereum/${EVM.high}`, viewer: 'anonymous' },
      { path: '/reports/new', viewer: 'member' },
      { path: '/mod/cases/RPT-1001', viewer: 'moderator' },
      { path: '/admin/staff', viewer: 'admin' },
    ]) {
      await as(context, route.viewer);
      await ready(page, route.path);
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const state = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const visible =
            (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
            (s.boxShadow !== 'none' && s.boxShadow !== '') ||
            el.matches(':focus-visible') === false;
          return {
            visible,
            name: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
          };
        });
        if (state && !state.visible) problems.push(`${route.path}: ${state.name}`);
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  test('a confirmation dialog traps focus, closes on Escape and returns focus to its trigger', async ({
    page,
    context,
  }) => {
    await as(context, 'moderator');
    await ready(page, '/mod/findings');
    const trigger = page.getByRole('button', { name: 'Suspend demo-finding-301' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
