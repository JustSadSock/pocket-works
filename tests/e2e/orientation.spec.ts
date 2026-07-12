import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('Screen Lab matches the project orientation without viewport overflow', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '#orientation');

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const expectedOrientation = viewport!.width > viewport!.height ? 'landscape' : 'portrait';

  await expect(page.locator('#orientation')).toHaveText(expectedOrientation);
  await expect(page.locator('#viewport')).toHaveText(`${viewport!.width} × ${viewport!.height}`);
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, `orientation-${expectedOrientation}`, {
    fullPage: false,
    mask: [page.locator('#field'), page.locator('#fps'), page.locator('#clock')]
  });
  monitor.assertClean();
});

test('launcher remains usable in the project orientation', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  const screenLabEntry = page.locator('.app-entry[data-slug="screen-lab"]');
  await openStablePage(page, '/', screenLabEntry);

  await expect(page.locator('#app-search')).toBeVisible();
  await expect(screenLabEntry.locator('.app-entry__select')).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const viewport = page.viewportSize();
  const orientation = viewport && viewport.width > viewport.height ? 'landscape' : 'portrait';
  await attachCriticalScreenshot(page, testInfo, `launcher-${orientation}`, {
    fullPage: false,
    mask: [page.locator('#network-status')]
  });
  monitor.assertClean();
});
