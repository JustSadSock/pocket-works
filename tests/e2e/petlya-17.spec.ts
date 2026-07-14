import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('ПЕТЛЯ 17 starts a readable cockpit race with an active Velocity Core', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('portrait'), 'ПЕТЛЯ 17 is intentionally landscape-only.');

  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/petlya-17/', '#practice');

  await page.locator('#practice').click();
  await expect(page.locator('#menu')).toHaveClass(/hidden/);
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect(page.locator('#race')).toBeVisible();
  await expect(page.locator('.velocity-core-layer')).toBeVisible();

  await page.waitForTimeout(4200);
  await page.keyboard.down('KeyW');
  await expect.poll(
    async () => page.evaluate(() => (window as any).__petlyaVelocityCore?.getState().speedFeel || 0),
    { timeout: 8_000 }
  ).toBeGreaterThan(0.22);

  const velocity = await page.evaluate(() => (window as any).__petlyaVelocityCore?.getState());
  expect(velocity.active).toBe(true);
  expect(velocity.estimatedSpeed).toBeGreaterThan(80);
  expect(velocity.speedFeel).toBeGreaterThan(0.22);
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
  expect(scene.unique).toBeGreaterThan(55);
  expect(scene.dataLength).toBeGreaterThan(22_000);

  const brake = await page.locator('#brake').boundingBox();
  const gas = await page.locator('#gas').boundingBox();
  expect(brake).not.toBeNull();
  expect(gas).not.toBeNull();
  expect(brake!.x + brake!.width).toBeLessThan(gas!.x);
  expect(brake!.width).toBeLessThan(180);
  expect(gas!.width).toBeLessThan(180);
  expect(brake!.height).toBeLessThan(130);
  expect(gas!.height).toBeLessThan(130);

  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'petlya-17-velocity-core', { fullPage: false });
  monitor.assertClean();
});
