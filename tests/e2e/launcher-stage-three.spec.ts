import { expect, test } from '@playwright/test';

async function openShelf(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/is-launcher-ui-ready/);
}

test('iPhone launcher shows separate catalog and installed-app actions', async ({ page }) => {
  await openShelf(page);
  await expect(page.locator('#refresh-button')).toBeVisible();
  await expect(page.locator('#update-installed-button')).toBeVisible();
  await expect(page.locator('#shelf-tools-button')).toBeVisible();

  const initial = await page.locator('#app-list .app-entry').count();
  await page.locator('#update-installed-button').click();
  await expect(page.locator('#update-installed-button')).toHaveText('Update apps', { timeout: 40_000 });
  await expect(page.locator('#sync-status')).toContainText(/on-demand|current|checked|updated|failed/);
  await expect(page.locator('#app-list .app-entry')).toHaveCount(initial);
  const appWorkers = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).filter(reg =>
      new URL(reg.scope).pathname.includes('/apps/')).length);
  expect(appWorkers).toBe(0);
});

test('iPhone shelf tools show diagnostics and export a valid backup', async ({ page }) => {
  await openShelf(page);
  await page.locator('#shelf-tools-button').click();
  await expect(page.locator('#shelf-tools')).toBeVisible();
  await expect(page.locator('#tools-facts')).toContainText('Launcher version');
  await expect(page.locator('#tools-facts')).toContainText('App workers');
  await expect(page.locator('#tools-facts')).toContainText('Personal shelf');

  await page.locator('#tools-recheck').click();
  await expect(page.locator('#tools-facts')).toContainText('Browser caches');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#tools-export').click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/^pocket-works-shelf-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#tools-status')).toContainText('exported');
  await page.locator('#tools-close').click();
  await expect(page.locator('#shelf-tools')).not.toBeVisible();
});
