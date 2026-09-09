import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

test.describe('PELAGOS deterministic mobile QA', () => {
  test('shipyard keeps the vessel visible, applies modules live and supports two-axis inspection', async ({ page }, testInfo) => {
    test.setTimeout(70_000);
    test.skip(!testInfo.project.name.includes('portrait'), 'PELAGOS is portrait-first.');
    const monitor = monitorUnexpectedBrowserOutput(page);

    await page.goto('/apps/pelagos/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#menu')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#shipyardButton')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosOceanPatch)).toBe('1');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosRigging)).toBe('living');
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.pelagosRiggingLines))).toBe(8);

    await page.locator('#shipyardButton').click();
    const shipyard = page.locator('#shipyard');
    const dock = page.locator('.shipyard-dock');
    await expect(shipyard).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('.shipyard-preview-hint')).toContainText('ПОВОРОТ');

    const viewport = page.viewportSize();
    const dockBox = await dock.boundingBox();
    expect(viewport).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(dockBox!.height / viewport!.height).toBeLessThan(0.43);

    await page.getByRole('button', { name: /Highboard Cruiser/i }).click();
    await expect(page.locator('#shipyardSummary')).toContainText('15.6 м');
    await expect(page.locator('#shipyardSummary')).toContainText('4.6 м');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosOceanHull)).toBe('15.6x4.6');
    await expect(page.locator('#shipyardPerformance')).toContainText('ХОД');
    await expect(page.locator('#shipyardPerformance')).toContainText('МОРЕ');

    const shipyardBox = await shipyard.boundingBox();
    expect(shipyardBox).not.toBeNull();
    const startY = shipyardBox!.y + Math.min(shipyardBox!.height * 0.35, dockBox!.y - shipyardBox!.y - 28);
    const endY = Math.max(shipyardBox!.y + 140, startY - 92);
    const startX = shipyardBox!.x + shipyardBox!.width * 0.72;
    const endX = shipyardBox!.x + shipyardBox!.width * 0.30;
    const beforePose = await page.evaluate(() => ({
      orbit: Number(document.documentElement.dataset.shipyardOrbit),
      pitch: Number(document.documentElement.dataset.shipyardPitch)
    }));
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
    const afterPose = await page.evaluate(() => ({
      orbit: Number(document.documentElement.dataset.shipyardOrbit),
      pitch: Number(document.documentElement.dataset.shipyardPitch)
    }));
    expect(Number.isFinite(beforePose.orbit)).toBe(true);
    expect(Number.isFinite(beforePose.pitch)).toBe(true);
    expect(Number.isFinite(afterPose.orbit)).toBe(true);
    expect(Number.isFinite(afterPose.pitch)).toBe(true);
    expect(Math.abs(afterPose.orbit - beforePose.orbit)).toBeGreaterThan(0.25);
    expect(Math.abs(afterPose.pitch - beforePose.pitch)).toBeGreaterThan(0.06);
    await expect(shipyard).toHaveClass(/preview-touched/);

    await attachCriticalScreenshot(page, testInfo, 'pelagos-shipyard-highboard-orbit', { fullPage: false });

    await page.locator('[data-shipyard-slot="palette"]').click();
    await page.getByRole('button', { name: /Midnight Navy/i }).click();
    await expect(page.locator('[data-module-id="navy"]')).toHaveAttribute('data-selected', 'true');

    await page.locator('[data-shipyard-slot="sails"]').click();
    await page.getByRole('button', { name: /Merchant Rig/i }).click();
    await expect(page.locator('[data-module-id="merchant-gaff"]')).toHaveAttribute('data-selected', 'true');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosRigging)).toBe('living');
    await attachCriticalScreenshot(page, testInfo, 'pelagos-shipyard-navy', { fullPage: false });

    await page.locator('#closeShipyard').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#startButton').click();
    await expect(page.locator('#controls')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#hud')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.pelagosFrameScale))).toBeGreaterThanOrEqual(1.05);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosTextureAnisotropy)).toBe('8');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosCompactCoach)).toBe('1');
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.pelagosSheetLoad))).toBeGreaterThanOrEqual(0);
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.pelagosSeaLoad))).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(800);

    const rowButton = page.locator('#rowButton');
    await rowButton.focus();
    await page.keyboard.down('Space');
    await expect(rowButton).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosRowInput)).toBe('1');
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.pelagosOarDeploy)), { timeout: 2_500 }).toBeGreaterThan(0.78);
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.pelagosVisibleOars))).toBeGreaterThanOrEqual(10);
    await page.waitForTimeout(420);
    await attachCriticalScreenshot(page, testInfo, 'pelagos-rowing-visible-oars', { fullPage: false });
    await page.keyboard.up('Space');
    await expect(rowButton).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pelagosRowInput)).toBe('0');

    const frameScale = await page.evaluate(() => Number(document.documentElement.dataset.pelagosFrameScale));
    expect(frameScale).toBeLessThanOrEqual(1.105);
    const sheetLoad = await page.evaluate(() => Number(document.documentElement.dataset.pelagosSheetLoad));
    expect(Number.isFinite(sheetLoad)).toBe(true);
    expect(sheetLoad).toBeLessThanOrEqual(1);
    const encounterRate = await page.evaluate(() => Number(document.documentElement.dataset.pelagosEncounterRate));
    const seaLoad = await page.evaluate(() => Number(document.documentElement.dataset.pelagosSeaLoad));
    const waveDrag = await page.evaluate(() => Number(document.documentElement.dataset.pelagosWaveDrag));
    const contactGain = await page.evaluate(() => Number(document.documentElement.dataset.pelagosContactGain));
    expect(Number.isFinite(encounterRate)).toBe(true);
    expect(Number.isFinite(seaLoad)).toBe(true);
    expect(Number.isFinite(waveDrag)).toBe(true);
    expect(Number.isFinite(contactGain)).toBe(true);
    expect(waveDrag).toBeGreaterThanOrEqual(0);
    expect(contactGain).toBeGreaterThan(0.5);

    const hint = page.locator('#hint');
    if (await hint.isVisible()) {
      const hintBox = await hint.boundingBox();
      expect(hintBox).not.toBeNull();
      expect(hintBox!.width).toBeLessThan(270);
      expect(hintBox!.height).toBeLessThan(60);
    }
    await attachCriticalScreenshot(page, testInfo, 'pelagos-gameplay-scale', { fullPage: false });

    monitor.assertClean();
  });
});
