import { expect, test } from '@playwright/test';

// Target the launcher shell directly. Legacy per-app smoke cases live separately:
// individual apps may reload during Service Worker release-guard activation.
async function openShelf(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app-entry').first()).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/is-launcher-ui-ready/);
  // The root worker may take over the first tab after its first install.
  await page.waitForTimeout(700);
  await expect(page.locator('.app-entry').first()).toBeVisible();
}

test('mobile library preserves visible card nodes on sort and search', async ({ page }) => {
  await openShelf(page);
  const screenLab = page.locator('.app-entry[data-slug="screen-lab"]');
  await expect(screenLab).toBeVisible();
  await screenLab.evaluate(element => { (window as any).__stableScreenLab = element; });

  await page.locator('#sort-button').click();
  await expect.poll(() => screenLab.evaluate(element => element === (window as any).__stableScreenLab))
    .toBe(true);

  await page.locator('#app-search').fill('screen lab');
  await expect(screenLab).toBeVisible();
  await expect.poll(() => screenLab.evaluate(element => element === (window as any).__stableScreenLab))
    .toBe(true);
  await expect(page.locator('#app-list .app-entry')).toHaveCount(1);

  await page.locator('#app-search').fill('');
  await expect.poll(() => screenLab.evaluate(element => element === (window as any).__stableScreenLab))
    .toBe(true);
  await expect(screenLab.locator('.app-entry__meta')).not.toContainText(/T\d{2}:/);
});

test('mobile Sync refreshes the registry without installing unrelated apps', async ({ page }) => {
  await openShelf(page);
  const before = await page.locator('#app-list .app-entry').count();
  expect(before).toBeGreaterThan(20);
  await page.locator('#refresh-button').click();
  await expect(page.locator('#refresh-button')).toHaveText('Sync', { timeout: 35_000 });
  await expect(page.locator('#sync-status')).toContainText(/on-demand|current|checked|updated/);
  await expect(page.locator('#app-list .app-entry')).toHaveCount(before);

  const unwanted = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.filter(reg => new URL(reg.scope).pathname.startsWith('/apps/')).length;
  });
  expect(unwanted).toBe(0);
});
