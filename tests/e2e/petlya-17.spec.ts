import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('ПЕТЛЯ 17 starts a readable cockpit race with live opponents', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('portrait'), 'ПЕТЛЯ 17 is intentionally landscape-only.');

  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/petlya-17/', '#practice');

  await page.locator('#practice').click();
  await expect(page.locator('#menu')).toHaveClass(/hidden/);
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect(page.locator('#race')).toBeVisible();

  await page.waitForTimeout(4200);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyW');

  const scene = await page.locator('#race').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return { width: 0, height: 0, unique: 0, dataLength: 0 };
    const sample = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    const step = Math.max(4, Math.floor(sample.length / 900));
    for (let index = 0; index < sample.length; index += step * 4) {
      colors.add(`${sample[index]},${sample[index + 1]},${sample[index + 2]}`);
    }
    return {
      width: canvas.width,
      height: canvas.height,
      unique: colors.size,
      dataLength: canvas.toDataURL('image/png').length
    };
  });

  expect(scene.width).toBeGreaterThan(600);
  expect(scene.height).toBeGreaterThan(250);
  expect(scene.unique).toBeGreaterThan(45);
  expect(scene.dataLength).toBeGreaterThan(20_000);

  const brake = await page.locator('#brake').boundingBox();
  const gas = await page.locator('#gas').boundingBox();
  expect(brake).not.toBeNull();
  expect(gas).not.toBeNull();
  expect(brake!.x + brake!.width).toBeLessThan(gas!.x);

  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'petlya-17-cockpit', { fullPage: false });
  monitor.assertClean();
});
