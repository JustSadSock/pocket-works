import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot } from './helpers';

type FormicaState = {
  version: string;
  phase: 'menu' | 'running' | 'paused' | 'ended';
  speed: number;
  view: string;
  saveStatus: string;
  saveBytes: number;
  saveError: string;
  stats: { day: number; workers: number; brood: number; food: number } | null;
  diagnostics: { antsInSolid: number; broodInSolid: number; queenInSolid: number; nestFood: number } | null;
  camera: { x: number; y: number; zoom: number };
};

async function state(page: any): Promise<FormicaState> {
  return page.evaluate(() => (window as any).__FORMICA_TEST_STATE__ as FormicaState);
}

test.describe('FORMICA colony mobile journey', () => {
  test('launches, simulates, saves, observes and restores on a phone', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      const marker = '__formica_qa_storage_reset__';
      if (sessionStorage.getItem(marker)) return;
      localStorage.removeItem('pocket-works:formica-colony:save');
      localStorage.removeItem('pocket-works:formica-colony:settings');
      sessionStorage.setItem(marker, '1');
    });

    const response = await page.goto('/apps/formica-colony/', { waitUntil: 'load' });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('#newButton')).toBeVisible();
    await page.locator('#newButton').click();
    await expect(page.locator('#topbar')).toBeVisible();
    await page.waitForFunction(() => (window as any).__FORMICA_TEST_STATE__?.phase === 'running');

    let s = await state(page);
    expect(s.version).toBe('1.1.0');
    expect(s.saveStatus, s.saveError).toBe('ok');
    expect(s.saveBytes).toBeGreaterThan(10_000);
    expect(s.saveBytes).toBeLessThan(300_000);
    expect(s.stats?.workers).toBe(9);
    expect(s.diagnostics?.antsInSolid).toBe(0);
    expect(s.diagnostics?.broodInSolid).toBe(0);
    expect(s.diagnostics?.queenInSolid).toBe(0);

    const initialCamera = s.camera;
    const box = await page.locator('#worldCanvas').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.52, box!.y + box!.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.38, box!.y + box!.height * 0.52, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    s = await state(page);
    expect(Math.abs(s.camera.x - initialCamera.x) + Math.abs(s.camera.y - initialCamera.y)).toBeGreaterThan(8);

    await page.locator('[data-speed="4"]').click();
    await page.waitForTimeout(1700);
    s = await state(page);
    expect(s.speed).toBe(4);
    expect(s.stats?.workers ?? 0).toBeGreaterThan(0);
    expect(s.stats?.food ?? 0).toBeLessThan(35);
    expect(s.diagnostics?.antsInSolid).toBe(0);

    await page.locator('#viewButton').click();
    s = await state(page);
    expect(s.view).toBe('pheromone');
    await page.locator('#viewButton').click();
    s = await state(page);
    expect(s.view).toBe('moisture');

    await page.locator('#historyButton').click();
    await expect(page.locator('#historyLayer')).toBeVisible();
    await expect(page.locator('.history-entry').first()).toBeVisible();
    await page.locator('#historyClose').click();

    await page.locator('#pauseButton').click();
    await expect(page.locator('#pauseLayer')).toBeVisible();
    s = await state(page);
    expect(s.phase).toBe('paused');
    expect(s.saveStatus, s.saveError).toBe('ok');
    expect(s.saveBytes).toBeLessThan(300_000);
    const dayBeforeReload = s.stats?.day ?? 1;

    await attachCriticalScreenshot(page, testInfo, 'formica-paused-polished', { fullPage: false });

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#continueButton')).toBeVisible();
    await page.locator('#continueButton').click();
    await page.waitForFunction(() => (window as any).__FORMICA_TEST_STATE__?.phase === 'running');
    s = await state(page);
    expect(s.saveStatus, s.saveError).toBe('ok');
    expect(s.stats?.day ?? 0).toBeGreaterThanOrEqual(dayBeforeReload);
    expect(s.diagnostics?.antsInSolid).toBe(0);
    expect(s.diagnostics?.broodInSolid).toBe(0);
    expect(s.diagnostics?.queenInSolid).toBe(0);

    await attachCriticalScreenshot(page, testInfo, 'formica-restored-running', { fullPage: false });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((line) => !/favicon/i.test(line))).toEqual([]);
  });
});
