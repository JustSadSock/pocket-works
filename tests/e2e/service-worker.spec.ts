import { expect, test } from '@playwright/test';
import { waitForActiveServiceWorker } from './helpers';

test.describe('Service Worker quality gate', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Playwright exposes Service Worker inspection only in Chromium.');

  for (const target of [
    { path: '/', scope: '/', heading: 'Pocket Works' },
    { path: '/apps/screen-lab/', scope: '/apps/screen-lab/', heading: 'Screen Lab' }
  ]) {
    test(`${target.heading} installs and reloads offline`, async ({ page, context }) => {
      await page.goto(target.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toContainText(target.heading.split(' ')[0]);
      await waitForActiveServiceWorker(page, target.scope);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toBeVisible();
      await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toContainText(target.heading.split(' ')[0]);

      const manifest = await page.evaluate(async () => {
        const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (!link) return null;
        const response = await fetch(link.href);
        return response.ok ? response.json() : null;
      });
      expect(manifest?.display).toBe('standalone');
      expect(manifest?.start_url).toBe('./');

      await context.setOffline(false);
    });
  }
});
