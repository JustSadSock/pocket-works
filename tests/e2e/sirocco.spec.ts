import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

declare global {
  interface Window {
    __SIROCCO_QA_READY__?: boolean;
    __SIROCCO_QA__?: any;
  }
}

async function qaState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = window.__SIROCCO_QA__;
    if (!game) return null;
    const camera = game.camera?.camera;
    const controller = game.controller;
    const localSand = game.sandSurface?.mesh;
    return {
      running: game.running,
      paused: game.paused,
      fps: game.engine?.getFps?.(),
      quality: game.quality?.preset?.id,
      activeChunks: game.world?.activeChunkCount,
      sandCells: game.sand?.activeCellCount,
      sandImpacts: game.sand?.totalImpacts,
      camera: camera ? {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        pitch: camera.rotation.x,
        yaw: camera.rotation.y,
        minZ: camera.minZ
      } : null,
      player: controller ? {
        x: controller.globalX,
        y: controller.localPosition.y,
        z: controller.globalZ,
        yaw: controller.yaw,
        bodyYaw: controller.bodyYaw,
        pitch: controller.pitch,
        speed: controller.speed
      } : null,
      localSand: localSand ? {
        enabled: localSand.isEnabled(),
        vertices: localSand.getTotalVertices(),
        indices: localSand.getTotalIndices(),
        x: localSand.position.x,
        z: localSand.position.z
      } : null,
      meshes: game.scene?.meshes?.length,
      materials: game.scene?.materials?.map((material: any) => material.name)
    };
  });
}

test.describe('SIROCCO deterministic visual QA', () => {
  test('landscape walk, body awareness, terrain LOD and physical sand stay coherent', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('landscape'), 'SIROCCO is landscape-first.');
    const monitor = monitorUnexpectedBrowserOutput(page);

    await page.goto('/apps/sirocco/?qa=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SIROCCO_QA_READY__ === true, null, { timeout: 25_000 });
    await expect(page.locator('#enter-button')).toBeVisible();
    await page.locator('#enter-button').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await page.waitForTimeout(750);

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      game.quality.setMode('high');
      game.applyQuality(game.quality.preset);
      game.controller.yaw = 0.15;
      game.controller.bodyYaw = 0.15;
      game.controller.pitch = -0.05;
    });
    await page.waitForTimeout(600);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-forward', { fullPage: false });

    const initial = await qaState(page);
    expect(initial).not.toBeNull();
    expect(initial!.activeChunks).toBeGreaterThan(20);
    expect(initial!.localSand?.vertices ?? 0).toBeGreaterThan(4_000);
    expect(initial!.camera!.y - initial!.player!.y).toBeGreaterThan(1.55);

    // Stress the old head-intersection failure: look steeply down, then rotate
    // the view far away from the body's smoothed yaw before it can catch up.
    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      game.controller.pitch = 1.08;
      game.controller.yaw += 1.35;
    });
    await page.waitForTimeout(120);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-look-down-yaw-diverged', { fullPage: false });

    // Create a deterministic footprint field around the current player so the
    // screenshot proves that negative displacement, positive rims and local
    // relaxation are actually visible in the rendered replacement surface.
    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const c = game.controller;
      const offsets = [
        [-0.18, 0.25, -0.06], [0.18, 0.55, 0.05], [-0.18, 0.85, -0.04],
        [0.18, 1.15, 0.08], [-0.18, 1.45, -0.03], [0.18, 1.75, 0.06]
      ];
      for (const [side, forward, lateral] of offsets) {
        const yaw = c.bodyYaw;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        game.sand.stampFoot({
          globalX: c.globalX + fx * forward + rx * lateral + rx * side,
          globalZ: c.globalZ + fz * forward + rz * lateral + rz * side,
          yaw
        }, { speed: 2.2, lastSlope: 0.24, sliding: 0.08 });
      }
      game.sand.relaxArea(c.globalX, c.globalZ + 0.9, 2.2, 5);
      const dirty = game.sand.consumeDirtyBounds();
      if (dirty) game.world.refreshDeformation(dirty);
      game.sandSurface.markDirty();
      game.sandSurface.update(c, true);
      c.pitch = 0.92;
      c.yaw = c.bodyYaw;
    });
    await page.waitForTimeout(500);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-physical-sand', { fullPage: false });

    const deformed = await qaState(page);
    expect(deformed!.sandCells).toBeGreaterThan(80);
    expect(deformed!.sandImpacts).toBeGreaterThanOrEqual(6);
    expect(deformed!.camera!.minZ).toBeGreaterThanOrEqual(0.12);

    await testInfo.attach('sirocco-state.json', {
      body: Buffer.from(JSON.stringify({ initial, deformed }, null, 2)),
      contentType: 'application/json'
    });
    monitor.assertClean();
  });
});
