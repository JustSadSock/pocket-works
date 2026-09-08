import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

declare global {
  interface Window {
    __SINEW_QA__?: any;
    __POCKET_WORKS_TEST_STATE__?: any;
  }
}

async function bridge(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__POCKET_WORKS_TEST_STATE__ ?? null);
}

async function setPose(page: import('@playwright/test').Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => {
    const game = window.__SINEW_QA__;
    if (!game?.input) throw new Error('SINEW QA game handle is unavailable');
    game.input.pose.x = x;
    game.input.pose.y = y;
    game.input.lookAccum.x = 0;
    game.input.lookAccum.y = 0;
  }, { x, y });
}

test.describe('SINEW deterministic rig QA', () => {
  test('neutral, high and low guards preserve a readable first-person corridor', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('landscape'), 'SINEW is landscape-first.');
    const monitor = monitorUnexpectedBrowserOutput(page);

    await page.goto('/apps/sinew/?qa=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__POCKET_WORKS_TEST_STATE__?.booted === true, null, { timeout: 25_000 });
    await expect(page.locator('#enter-button')).toBeVisible();
    await page.locator('#enter-button').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await page.waitForFunction(() => window.__POCKET_WORKS_TEST_STATE__?.entered === true, null, { timeout: 5_000 });
    await page.waitForTimeout(800);

    const neutral = await bridge(page);
    expect(neutral?.version).toBe('1.8.0');
    expect(neutral?.blender).toBe('ready');
    expect(neutral?.symmetricConstraints).toBe(true);
    expect(neutral?.anatomicalEnvelope).toBe(true);
    expect(neutral?.viewSafety).not.toBeNull();
    expect(neutral.viewSafety.swordBaseLocalX).toBeGreaterThanOrEqual(.12);
    expect(neutral.viewSafety.shieldLocalX).toBeLessThanOrEqual(-.33);
    expect(neutral.viewSafety.shieldLocalZ).toBeGreaterThanOrEqual(.80);
    await attachCriticalScreenshot(page, testInfo, 'sinew-neutral-guard', { fullPage: false });

    await setPose(page, 0, 1);
    await page.waitForTimeout(650);
    const high = await bridge(page);
    expect(high.swordTipHeight).toBeGreaterThan(neutral.swordTipHeight + .35);
    expect(high.shieldHeight).toBeGreaterThan(neutral.shieldHeight + .18);
    expect(high.viewSafety.shieldLocalX).toBeLessThanOrEqual(-.33);
    expect(high.viewSafety.shieldLocalZ).toBeGreaterThanOrEqual(.80);
    await attachCriticalScreenshot(page, testInfo, 'sinew-high-guard', { fullPage: false });

    await setPose(page, 0, -1);
    await page.waitForTimeout(650);
    const low = await bridge(page);
    expect(low.swordTipHeight).toBeLessThan(neutral.swordTipHeight - .35);
    expect(low.shieldHeight).toBeLessThan(neutral.shieldHeight - .18);
    expect(low.viewSafety.shieldLocalX).toBeLessThanOrEqual(-.33);
    expect(low.viewSafety.shieldLocalZ).toBeGreaterThanOrEqual(.80);
    await attachCriticalScreenshot(page, testInfo, 'sinew-low-guard', { fullPage: false });

    await setPose(page, 1, 0);
    await page.waitForTimeout(500);
    await attachCriticalScreenshot(page, testInfo, 'sinew-right-workspace', { fullPage: false });

    await setPose(page, -1, 0);
    await page.waitForTimeout(500);
    await attachCriticalScreenshot(page, testInfo, 'sinew-left-workspace', { fullPage: false });

    await setPose(page, 0, 0);
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const width = viewport!.width;
    const height = viewport!.height;
    await page.mouse.move(width * .80, height * .60);
    await page.mouse.down();
    await page.mouse.move(width * .62, height * .42, { steps: 3 });
    await page.mouse.move(width * .86, height * .52, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(160);
    await attachCriticalScreenshot(page, testInfo, 'sinew-fast-strike', { fullPage: false });

    const finalState = await bridge(page);
    expect(Number.isFinite(finalState.swordSpeed)).toBe(true);
    expect(Number.isFinite(finalState.playerStability)).toBe(true);
    expect(finalState.viewSafety.shieldLocalZ).toBeGreaterThanOrEqual(.80);

    await testInfo.attach('sinew-rig-state.json', {
      body: Buffer.from(JSON.stringify({ neutral, high, low, finalState }, null, 2)),
      contentType: 'application/json'
    });
    monitor.assertClean();
  });
});
