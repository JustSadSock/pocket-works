import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const registry = JSON.parse(
  readFileSync(new URL('../../dist-site/apps.json', import.meta.url), 'utf8')
) as Array<{ slug: string; path: string }>;

test('launcher Sync updates only already-installed application workers', async ({ page }) => {
  await page.goto('/apps/screen-lab/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();

  await expect.poll(async () => page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.filter((registration) => new URL(registration.scope).pathname.includes('/apps/screen-lab/')).length;
  }), { timeout: 10_000 }).toBe(1);

  // The release guard reloads once when the installed worker takes control.
  // Finish that lifecycle before leaving the app, otherwise its navigation
  // can interrupt the return to the launcher.
  await expect(page).toHaveURL(/pw_controller=/, { timeout: 20_000 });
  await page.waitForLoadState('load');

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#deck-bottom-nav')).toBeVisible();
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#deck-view-title')).toHaveText('Library');
  await expect(page.locator('#app-list .app-entry')).toHaveCount(registry.length);

  const before = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations
      .map((registration) => new URL(registration.scope).pathname)
      .filter((pathname) => pathname.includes('/apps/'));
  });
  expect(before).toEqual(['/apps/screen-lab/']);

  const sync = page.locator('#update-installed-button');
  await sync.click();
  await expect(sync).toBeEnabled({ timeout: 35_000 });
  await expect(sync).toHaveText('Update apps');

  const after = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations
      .map((registration) => new URL(registration.scope).pathname)
      .filter((pathname) => pathname.includes('/apps/'));
  });

  expect(after).toEqual(['/apps/screen-lab/']);
  await expect(page.locator('#sync-status')).toContainText(/current|updated|checked|on-demand/);
});

test('launcher shell advertises the update-system release', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  await expect(page.locator('.shelf-heading .eyebrow')).toContainText(packageJson.version);
});
