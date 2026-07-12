import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

declare global {
  interface Window {
    __DOCTRINA__?: {
      state: {
        seed: string;
        countryName: string;
        turn: number;
        pendingEvent: unknown;
      };
      newGame(seed?: string): unknown;
    };
  }
}

async function resolvePendingEvent(page: import('@playwright/test').Page) {
  const choice = page.locator('[data-action="event-choice"]').first();
  if (await choice.isVisible().catch(() => false)) await choice.click();
}

test('DOCTRINA runs a deterministic quarter and persists it inside Pocket Works', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/doctrina/', '.game-shell');

  await expect(page.locator('.shell-back')).toHaveAttribute('href', '../../');
  await expect(page.locator('.bottom-nav button')).toHaveCount(5);
  await expect(page.locator('.command-title strong')).not.toBeEmpty();

  const initial = await page.evaluate(() => ({
    seed: window.__DOCTRINA__!.state.seed,
    countryName: window.__DOCTRINA__!.state.countryName
  }));
  await page.evaluate((seed) => window.__DOCTRINA__!.newGame(seed), initial.seed);
  await expect.poll(() => page.evaluate(() => window.__DOCTRINA__!.state.countryName)).toBe(initial.countryName);

  await resolvePendingEvent(page);
  await page.locator('[data-action="tab"][data-id="laws"]').click();
  const reform = page.locator('[data-action="enact-law"]:not(:disabled)').first();
  await expect(reform).toBeVisible();
  await reform.click();

  await page.locator('[data-action="tab"][data-id="state"]').click();
  await resolvePendingEvent(page);
  const turnBefore = await page.evaluate(() => window.__DOCTRINA__!.state.turn);
  await page.locator('[data-action="end-turn"]:not(:disabled)').click();
  await expect.poll(() => page.evaluate(() => window.__DOCTRINA__!.state.turn)).toBe(turnBefore + 1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__DOCTRINA__?.state.turn ?? -1)).toBe(turnBefore + 1);
  await expect.poll(() => page.evaluate(() => window.__DOCTRINA__?.state.seed ?? '')).toBe(initial.seed);

  await page.locator('[data-action="open-menu"]').click();
  await page.getByRole('button', { name: 'Workshop Mode' }).click();
  await expect(page.locator('.workshop-mode')).toHaveClass(/is-open/);
  await page.locator('[data-workshop-close]').first().click();

  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'doctrina-state', { fullPage: false });
  monitor.assertClean();
});
