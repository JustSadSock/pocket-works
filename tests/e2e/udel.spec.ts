import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  assertNativeControlStyles,
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

const udelConfig = JSON.parse(
  readFileSync(new URL('../../apps/udel/app.config.json', import.meta.url), 'utf8')
) as { version: string };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('pocket-works:udel:state'));
});

async function startCampaign(page: Page) {
  await openStablePage(page, '/apps/udel/', '[data-action="setup"]');
  await page.locator('[data-action="setup"]').tap();
  await expect(page.locator('[data-action="begin"]')).toBeVisible();
  await page.locator('[data-action="begin"]').tap();
  await expect(page.locator('.realm-map')).toBeVisible();
  await expect(page.locator('.province-shape')).toHaveCount(20);
}

test('UDEL 2.5 keeps the strategic campaign readable and operable on mobile', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await startCampaign(page);

  await page.locator('[data-tab="war"]').tap();
  await expect(page.getByRole('heading', { name: 'Военный совет' })).toBeVisible();
  await expect(page.locator('.d25-military-overview')).toBeVisible();

  const declareWar = page.locator('[data-war="north"]');
  await declareWar.scrollIntoViewIfNeeded();
  await declareWar.tap();
  await expect(page.locator('.d25-target-card').first()).toBeVisible();

  const commander = page.locator('[data-select-commander]').first();
  await commander.tap();
  await expect(commander).toHaveAttribute('aria-pressed', 'true');

  const targetButton = page.locator('[data-campaign-target]').first();
  await targetButton.scrollIntoViewIfNeeded();
  await targetButton.tap();
  await expect(page.locator('.d25-active-campaign')).toBeVisible();
  await expect(page.locator('.d25-route')).toBeVisible();
  await expect(page.locator('[role="progressbar"]')).toHaveCount(2);

  const advance = page.locator('[data-campaign-action="advance"]');
  await advance.tap();
  await expect(page.locator('.d25-active-campaign')).toContainText(/Марш|Осада|сражению/);

  await page.locator('[data-tab="map"]').tap();
  await expect(page.locator('.d25-map-campaign')).toBeVisible();
  await page.locator('.province-shape.owner-player').first().tap();
  await expect(page.locator('#drawer')).toHaveClass(/open/);
  await expect(page.locator('#drawer .drawer-actions')).toBeVisible();

  await assertNativeControlStyles(page.locator('[data-tab="war"]'));
  await assertNoHorizontalOverflow(page);
  const snapshot = await page.evaluate(() => (window as typeof window & { __udelQualitySnapshot?: () => any }).__udelQualitySnapshot?.());
  expect(snapshot?.version).toBe(udelConfig.version);
  expect(snapshot?.horizontalOverflow).toBe(false);
  expect(snapshot?.clippedControls).toEqual([]);

  await attachCriticalScreenshot(page, testInfo, 'udel-campaign-map', { fullPage: false });
  monitor.assertClean();
});

test('all primary UDEL sections remain reachable without horizontal overflow', async ({ page }) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await startCampaign(page);

  const expectations: Array<[string, RegExp]> = [
    ['map', /из 20 областей/],
    ['court', /Династия/],
    ['state', /Государство/],
    ['tech', /Технологии/],
    ['war', /Военный совет/]
  ];

  for (const [tab, text] of expectations) {
    await page.locator(`[data-tab="${tab}"]`).tap();
    await expect(page.locator('.content')).toContainText(text);
    await assertNoHorizontalOverflow(page);
    const snapshot = await page.evaluate(() => (window as typeof window & { __udelQualitySnapshot?: () => any }).__udelQualitySnapshot?.());
    expect(snapshot?.clippedControls, `${tab} contains horizontally clipped controls`).toEqual([]);
    await expect(page.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-current', 'page');
  }

  monitor.assertClean();
});
