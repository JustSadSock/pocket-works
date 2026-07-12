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
) as Array<{ slug: string; version: string; updatedAt: string }>;
const screenLabVersion = registry.find((app) => app.slug === 'screen-lab')?.version;
const echoesVersion = registry.find((app) => app.slug === 'echoes')?.version;
const newestApp = [...registry].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
if (!screenLabVersion) throw new Error('Screen Lab is missing from apps.json');
if (!echoesVersion) throw new Error('ECHOES is missing from apps.json');
if (!newestApp) throw new Error('apps.json is empty');

test('launcher shelf supports precise updated sorting, search, details and favorites', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/', 'h1');

  await expect(page.locator('h1')).toContainText('Pocket');
  await expect(page.locator('html')).toHaveClass(/has-launcher-list-motion/);
  await expect(page.locator('.app-entry')).toHaveCount(registry.length);
  await expect(page.locator('#app-count')).toHaveText(String(registry.length));
  await expect(page.locator('.app-entry').first()).toHaveAttribute('data-slug', newestApp.slug);
  await expect(page.locator('.app-entry').first().locator('.app-entry__meta')).not.toContainText(/T\d{2}:/);

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

test('shared runtime blocks game text selection while preserving explicit selectable content', async ({ page }) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '#hero-title');

  await expect.poll(() => page.locator('#hero-title').evaluate((element) => getComputedStyle(element).userSelect)).toBe('none');
  await expect.poll(() => page.locator('.selectable-content').evaluate((element) => getComputedStyle(element).userSelect)).toBe('text');

  const selectionPrevented = await page.locator('#hero-title').evaluate((element) => {
    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(selectionPrevented).toBe(true);
  monitor.assertClean();
});

test('KROMKA exit controls use native links and return to the Pocket Works launcher', async ({ page }) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/kromka/', '#startScreen');

  const exits = page.locator('[data-shell-exit]');
  await expect(exits).toHaveCount(3);
  for (const exit of await exits.all()) {
    await expect(exit).toHaveAttribute('href', '../../');
  }

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    exits.first().click()
  ]);
  await expect(page.locator('h1')).toContainText('Pocket');
  monitor.assertClean();
});
