import { test, expect } from '@playwright/test';

test('start, pause, graphics, resume, save and restore a real run', async ({ page, isMobile }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/apps/meat-exe/');
  await expect(page.locator('#startBtn')).toBeVisible();
  await page.locator('#qualityMenu').click();
  await expect(page.locator('#qualityMenu')).toContainText('СКОРОСТЬ');
  await page.locator('#startBtn').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().mode)).toBe('playing');
  await expect(page.locator('#healthValue')).not.toBeEmpty();
  if (isMobile) {
    await page.locator('#pauseBtn').click();
  } else {
    // Before capture, the native pause button must respond to an actual click.
    await expect(page.locator('#pauseBtn')).toBeVisible();
    await page.locator('#pauseBtn').click();
  }
  await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#qualityPause').click();
  await expect(page.locator('#qualityPause')).toContainText('ДЕТАЛИ');
  await page.locator('#resumeBtn').click();
  await expect(page.locator('#hud')).toBeVisible();
  // Pausing serializes current state and the menu exposes a saved run.
  if (isMobile) await page.locator('#pauseBtn').click();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#menuPause').click();
  await expect(page.locator('#resumeSaved')).toBeVisible();
  await page.reload();
  await expect(page.locator('#resumeSaved')).toBeVisible();
  await expect(page.locator('#qualityMenu')).toContainText('ДЕТАЛИ');
  await page.locator('#resumeSaved').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().mode)).toBe('playing');
  expect(errors).toEqual([]);
});

test('protected restart can be cancelled without destroying progress', async ({page}) => {
  await page.goto('/apps/meat-exe/');
  await page.locator('#startBtn').click();
  await page.locator('#pauseBtn').click();
  await page.locator('#restartPause').click();
  await expect(page.locator('#confirmRestart')).toBeVisible();
  await page.locator('#confirmNo').click();
  await expect(page.locator('#confirmRestart')).toBeHidden();
  await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#menuPause').click();
  await expect(page.locator('#resumeSaved')).toBeVisible();
});
