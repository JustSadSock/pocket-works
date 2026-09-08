import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

test.describe('PELAGOS deterministic mobile QA', () => {
  test('shipyard keeps the vessel visible, applies modules live and supports orbit inspection', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('portrait'), 'PELAGOS is portrait-first.');
    const monitor = monitorUnexpectedBrowserOutput(page);

    await page.goto('/apps/pelagos/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#menu')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#shipyardButton')).toBeVisible();

    await page.locator('#shipyardButton').click();
    const shipyard = page.locator('#shipyard');
    const dock = page.locator('.shipyard-dock');
    await expect(shipyard).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('.shipyard-preview-hint')).toContainText('ОСМОТР');

    const viewport = page.viewportSize();
    const dockBox = await dock.boundingBox();
    expect(viewport).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(dockBox!.height / viewport!.height).toBeLessThan(0.43);

    await page.getByRole('button', { name: /Highboard Cruiser/i }).click();
    await expect(page.locator('#shipyardSummary')).toContainText('15.6 м');
    await expect(page.locator('#shipyardSummary')).toContainText('4.6 м');

    const shipyardBox = await shipyard.boundingBox();
    expect(shipyardBox).not.toBeNull();
    const y = shipyardBox!.y + Math.min(shipyardBox!.height * 0.34, dockBox!.y - shipyardBox!.y - 24);
    const startX = shipyardBox!.x + shipyardBox!.width * 0.72;
    const endX = shipyardBox!.x + shipyardBox!.width * 0.30;
    const beforeOrbit = await page.evaluate(() => Number(document.documentElement.dataset.shipyardOrbit));
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 8 });
    await page.mouse.up();
    const afterOrbit = await page.evaluate(() => Number(document.documentElement.dataset.shipyardOrbit));
    expect(Number.isFinite(beforeOrbit)).toBe(true);
    expect(Number.isFinite(afterOrbit)).toBe(true);
    expect(Math.abs(afterOrbit - beforeOrbit)).toBeGreaterThan(0.25);
    await expect(shipyard).toHaveClass(/preview-touched/);

    await attachCriticalScreenshot(page, testInfo, 'pelagos-shipyard-highboard-orbit', { fullPage: false });

    await page.locator('[data-shipyard-slot="palette"]').click();
    await page.getByRole('button', { name: /Midnight Navy/i }).click();
    await expect(page.locator('[data-module-id="navy"]')).toHaveAttribute('data-selected', 'true');
    await attachCriticalScreenshot(page, testInfo, 'pelagos-shipyard-navy', { fullPage: false });

    await page.locator('#closeShipyard').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#startButton').click();
    await expect(page.locator('#controls')).toBeVisible();
    await expect(page.locator('#hud')).toBeVisible();
    await page.waitForTimeout(1_200);
    await attachCriticalScreenshot(page, testInfo, 'pelagos-gameplay-scale', { fullPage: false });

    monitor.assertClean();
  });
});
