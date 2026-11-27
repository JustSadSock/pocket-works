import { test, expect } from '@playwright/test';

test('mouse training, pause, resume and local history', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('/apps/flickyard/?qa=1');
  await expect(page.locator('#launchButton')).toBeVisible();
  await page.locator('[data-mode="flick"]').click();
  await page.locator('#launchButton').click();
  await expect(page.locator('#runHud')).toBeVisible();

  const snapshot = await page.evaluate(() => (window as any).__FLICKYARD_TEST__.snapshot());
  expect(snapshot.status).toBe('running');
  expect(snapshot.target).not.toBeNull();

  const x = snapshot.canvas.left + snapshot.target.x;
  const y = snapshot.canvas.top + snapshot.target.y;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await expect(page.locator('#hudHits')).toHaveText('1');

  await page.locator('#pauseButton').click();
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await page.locator('#resumeButton').click();
  await expect(page.locator('#runHud')).toBeVisible();

  await page.evaluate(() => (window as any).__FLICKYARD_TEST__.finish());
  await expect(page.locator('#resultsOverlay')).toBeVisible();
  await page.locator('#resultHomeButton').click();
  await expect(page.locator('#homeOverlay')).toBeVisible();

  await page.reload();
  await page.locator('#historyButton').click();
  await expect(page.locator('#historyList')).toContainText('Щелчок');
  expect(pageErrors).toEqual([]);
});
