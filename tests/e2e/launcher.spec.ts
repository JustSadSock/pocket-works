import { expect, test } from '@playwright/test';
import {
  assertNativeControlStyles,
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('launcher shelf supports search, details, favorites and keyboard focus', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/', 'h1');

  await expect(page.locator('h1')).toContainText('Pocket');
  await expect(page.locator('.app-entry')).toHaveCount(1);
  await expect(page.locator('#app-count')).toHaveText('1');

  const search = page.locator('#app-search');
  await search.fill('screen');
  await expect(page.locator('.app-entry__name')).toHaveText('Screen Lab');

  await search.fill('missing object');
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#clear-search').click();
  await expect(page.locator('.app-entry')).toHaveCount(1);

  const entry = page.locator('.app-entry');
  const previewTrigger = page.locator('[data-preview-trigger]');
  const entryBox = await entry.boundingBox();
  const triggerBox = await previewTrigger.boundingBox();
  expect(entryBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.width).toBeLessThan(entryBox!.width * 0.5);

  await page.locator('.app-entry__body').click();
  await expect(page.locator('#detail-panel')).toHaveAttribute('aria-hidden', 'true');

  await previewTrigger.click();
  await expect(page.locator('#detail-panel')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#detail-name')).toHaveText('Screen Lab');
  await expect(page.locator('#detail-version')).toHaveText('v1.3.1');
  await expect(page.locator('#detail-open')).toHaveAttribute('href', './apps/screen-lab/');

  const favorite = page.locator('#detail-favorite');
  await favorite.click();
  await expect(favorite).toHaveText('Remove from saved');
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#detail-close').click();
  await expect(page.locator('#detail-panel')).toHaveAttribute('aria-hidden', 'true');

  await page.locator('[data-filter="favorites"]').click();
  await expect(page.locator('.app-entry')).toHaveCount(1);
  await expect(page.locator('[data-filter="favorites"]')).toHaveAttribute('aria-pressed', 'true');

  await search.evaluate((element: HTMLInputElement) => element.blur());
  await page.keyboard.press('/');
  await expect(search).toBeFocused();

  await assertNativeControlStyles(page.locator('[data-filter="all"]'));
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'launcher-shelf', {
    mask: [page.locator('#network-status')]
  });
  monitor.assertClean();
});

test('launcher retains personal shelf state after reload', async ({ page }) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/', '.app-entry');

  await page.locator('.app-entry__favorite').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app-entry__favorite')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-filter="favorites"]').click();
  await expect(page.locator('.app-entry__name')).toHaveText('Screen Lab');
  await assertNoHorizontalOverflow(page);
  monitor.assertClean();
});