import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('ПЕТЛЯ 17 loads a real WebGL cockpit and accelerates through the 3D scene', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('portrait'), 'ПЕТЛЯ 17 is intentionally landscape-only.');

  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/petlya-17/', '#practice');
  await expect(page.locator('#loading')).toHaveClass(/hidden/, { timeout: 20_000 });
  await expect(page.locator('#menu')).toBeVisible();

  const renderer = await page.locator('#renderCanvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      width: canvas.width,
      height: canvas.height,
      webgl: Boolean(gl),
      version: gl ? String(gl.getParameter(gl.VERSION)) : ''
    };
  });

  expect(renderer.webgl).toBe(true);
  expect(renderer.width).toBeGreaterThan(600);
  expect(renderer.height).toBeGreaterThan(250);
  expect(renderer.version).toContain('WebGL');

  await page.locator('#practice').click();
  await expect(page.locator('#menu')).toHaveClass(/hidden/);
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect(page.locator('#renderCanvas')).toBeVisible();

  await page.waitForTimeout(4200);
  await page.keyboard.down('KeyW');
  await expect.poll(
    async () => Number(await page.locator('#speed').textContent()),
    { timeout: 10_000 }
  ).toBeGreaterThan(80);
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');

  await expect(page.locator('#gear')).not.toHaveText('1');
  await expect(page.locator('#rpmBar')).toHaveAttribute('style', /width:/);

  const brake = await page.locator('#brake').boundingBox();
  const gas = await page.locator('#gas').boundingBox();
  expect(brake).not.toBeNull();
  expect(gas).not.toBeNull();
  expect(brake!.x + brake!.width).toBeLessThan(gas!.x);
  expect(brake!.width).toBeLessThan(190);
  expect(gas!.width).toBeLessThan(190);

  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'petlya-17-real-3d-cockpit', { fullPage: false });
  monitor.assertClean();
});
