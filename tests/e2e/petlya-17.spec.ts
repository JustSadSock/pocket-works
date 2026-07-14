import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('ПЕТЛЯ 17 loads WebGL, accelerates and exposes live handling state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('portrait'), 'ПЕТЛЯ 17 is intentionally landscape-only.');

  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/petlya-17/', '#practice');
  await expect(page.locator('#loading')).toHaveClass(/hidden/, { timeout: 25_000 });
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
    { timeout: 12_000 }
  ).toBeGreaterThan(110);

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');

  const handling = await page.locator('html').evaluate((root) => ({
    state: root.dataset.handlingState || '',
    grip: Number(root.dataset.grip),
    slip: Number(root.dataset.slip)
  }));
  expect(['grip', 'limit', 'sliding']).toContain(handling.state);
  expect(handling.grip).toBeGreaterThanOrEqual(0);
  expect(handling.grip).toBeLessThanOrEqual(1);
  expect(Number.isFinite(handling.slip)).toBe(true);
  expect(Math.abs(handling.slip)).toBeGreaterThan(0.001);

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
  await attachCriticalScreenshot(page, testInfo, 'petlya-17-handling-31', { fullPage: false });
  monitor.assertClean();
});
