import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

declare global {
  interface Window {
    __SIROCCO_QA_READY__?: boolean;
    __SIROCCO_QA__?: any;
    __SIROCCO_PRESENCE__?: any;
  }
}

test.describe('SIROCCO wind presence QA', () => {
  test('gusts stay coherent with airborne sand and slowly erode fresh tracks', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('landscape'), 'SIROCCO is landscape-first.');
    const monitor = monitorUnexpectedBrowserOutput(page);
    await page.goto('/apps/sirocco/?qa=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SIROCCO_QA_READY__ === true, null, { timeout: 25_000 });
    await page.locator('#enter-button').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await page.waitForTimeout(350);

    const result = await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const presence = window.__SIROCCO_PRESENCE__;
      if (!game || !presence) return null;
      game.quality.setMode('high');
      game.applyQuality(game.quality.preset);
      game.sand.clear();
      const c = game.controller;
      const ix = Math.round(c.globalX / game.sand.cellSize);
      const iz = Math.round(c.globalZ / game.sand.cellSize);
      game.sand.addCell(ix, iz, 0.030, 0.90, 0);
      game.sand.addCell(ix - 2, iz, -0.032, 0.04, 0.72);
      const sourceBefore = game.sand.getCell(ix, iz);
      const targetBefore = game.sand.getCell(ix + 1, iz);
      const cavityBefore = game.sand.getCell(ix - 2, iz);
      let moved = false;
      for (let i = 0; i < 8; i += 1) {
        moved = presence.erosion.update(0.50, c.globalX, c.globalZ, { x: 1, z: 0, strength: 0.92, gust: 0.94 }) || moved;
      }
      presence.wind.nextPulse = 0;
      const wind = presence.wind.update(1 / 60, c.globalX, c.globalZ);
      game.sandSurface.markDirty();
      game.sandSurface.update(c, true);
      return {
        moved,
        sourceBefore,
        sourceAfter: game.sand.getCell(ix, iz),
        targetBefore,
        targetAfter: game.sand.getCell(ix + 1, iz),
        cavityBefore,
        cavityAfter: game.sand.getCell(ix - 2, iz),
        wind,
        driftCapacity: game.particles?.drift?.getCapacity?.() ?? 0,
        erosionBudget: presence.erosion.budget
      };
    });

    expect(result).not.toBeNull();
    expect(result!.moved).toBe(true);
    expect(result!.sourceAfter).toBeLessThan(result!.sourceBefore);
    expect(result!.targetAfter).toBeGreaterThan(result!.targetBefore);
    expect(result!.cavityAfter).toBeGreaterThan(result!.cavityBefore);
    expect(result!.wind.strength).toBeGreaterThan(0.2);
    expect(result!.wind.gust).toBeGreaterThanOrEqual(0);
    expect(result!.driftCapacity).toBeGreaterThanOrEqual(100);
    expect(result!.erosionBudget).toBeLessThanOrEqual(50);

    await page.waitForTimeout(900);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-wind-presence', { fullPage: false });
    monitor.assertClean();
  });
});
