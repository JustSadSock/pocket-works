import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  assertNativeControlStyles,
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

const registry = JSON.parse(
  readFileSync(new URL('../../apps.json', import.meta.url), 'utf8')
) as Array<{ slug: string; version: string }>;
const screenLabVersion = registry.find((app) => app.slug === 'screen-lab')?.version;
const echoesVersion = registry.find((app) => app.slug === 'echoes')?.version;
if (!screenLabVersion) throw new Error('Screen Lab is missing from apps.json');
if (!echoesVersion) throw new Error('ECHOES is missing from apps.json');

test('launcher shelf supports search, real icons, details, favorites and keyboard focus', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/', 'h1');

  await expect(page.locator('h1')).toContainText('Pocket');
  await expect(page.locator('.app-entry')).toHaveCount(registry.length);
  await expect(page.locator('#app-count')).toHaveText(String(registry.length));

  const echoesPreview = page.locator('.app-entry[data-slug="echoes"] .app-preview');
  await expect(echoesPreview).toHaveClass(/has-app-icon/);
  await expect.poll(() => echoesPreview.evaluate((element) => element.style.getPropertyValue('--app-icon-image')))
    .toContain(`/apps/echoes/icons/icon.svg?v=${echoesVersion}`);

  const search = page.locator('#app-search');
  await search.fill('screen');
  await expect(page.locator('.app-entry[data-slug="screen-lab"] .app-entry__name')).toHaveText('Screen Lab');

  await search.fill('missing object');
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#clear-search').click();
  await expect(page.locator('.app-entry')).toHaveCount(registry.length);

  const screenLabEntry = page.locator('.app-entry[data-slug="screen-lab"]');
  await screenLabEntry.locator('.app-entry__select').click();
  await expect(page.locator('#detail-panel')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#detail-name')).toHaveText('Screen Lab');
  await expect(page.locator('#detail-version')).toHaveText(`v${screenLabVersion}`);
  await expect(page.locator('#detail-open')).toHaveAttribute('href', './apps/screen-lab/');
  await expect(page.locator('#detail-preview')).toHaveClass(/has-app-icon/);

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
  const screenLabEntry = page.locator('.app-entry[data-slug="screen-lab"]');
  await openStablePage(page, '/', screenLabEntry);

  await screenLabEntry.locator('.app-entry__favorite').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app-entry[data-slug="screen-lab"] .app-entry__favorite')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-filter="favorites"]').click();
  await expect(page.locator('.app-entry[data-slug="screen-lab"] .app-entry__name')).toHaveText('Screen Lab');
  await assertNoHorizontalOverflow(page);
  monitor.assertClean();
});
