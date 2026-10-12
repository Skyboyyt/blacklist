import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core on rendered markup. jsdom has no layout, so colour contrast is
 * checked by the Playwright + axe suite in a real browser instead.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}
