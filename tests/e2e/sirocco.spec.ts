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
      landmarkInstances: game.landmarks?.instances?.length ?? 0,
      characterPolishMeshes: game.characterPolish?.meshes?.length ?? 0,
      camera: camera ? {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        pitch: camera.rotation.x, yaw: camera.rotation.y, minZ: camera.minZ
      } : null,
      player: controller ? {
        x: controller.globalX, y: controller.localPosition.y, z: controller.globalZ,
        yaw: controller.yaw, bodyYaw: controller.bodyYaw, pitch: controller.pitch, speed: controller.speed
      } : null,
      localSand: localSand ? {
        enabled: localSand.isEnabled(), vertices: localSand.getTotalVertices(), indices: localSand.getTotalIndices(),
        x: localSand.position.x, z: localSand.position.z
      } : null,
      meshes: game.scene?.meshes?.length,
      materials: game.scene?.materials?.map((material: any) => material.name)
    };
  });
}

test.describe('SIROCCO deterministic visual QA', () => {
  test('landscape walk, Blender landmarks, terrain LOD and physical sand stay coherent', async ({ page }, testInfo) => {
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
      game.controller.resetToSpawn?.();
      game.controller.yaw = 0.15;
      game.controller.bodyYaw = 0.15;
      game.controller.pitch = -0.05;
      game.sand.clear();
      game.sandSurface.markDirty();
      game.sandSurface.update(game.controller, true);
    });
    await page.waitForTimeout(650);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-forward', { fullPage: false });

    const initial = await qaState(page);
    expect(initial).not.toBeNull();
    expect(initial!.activeChunks).toBeGreaterThan(20);
    // 1.5 intentionally replaces the 14k-vertex square sand patch with a
    // circular ~4k-vertex patch. Guard both visual detail and the performance cap.
    expect(initial!.localSand?.vertices ?? 0).toBeGreaterThan(3_500);
    expect(initial!.localSand?.vertices ?? 99_999).toBeLessThan(5_000);
    expect(initial!.localSand?.indices ?? 0).toBeGreaterThan(15_000);
    expect(initial!.camera!.y - initial!.player!.y).toBeGreaterThan(1.45);
    expect(initial!.landmarkInstances).toBeGreaterThanOrEqual(5);
    expect(initial!.characterPolishMeshes).toBeGreaterThanOrEqual(7);

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const c = game.controller;
      c.worldOffsetX = 158;
      c.worldOffsetZ = 105;
      c.localPosition.set(0, c.sampleHeight(158, 105), 0);
      c.velocity.setAll(0);
      c.yaw = Math.atan2(169 - 158, 132 - 105);
      c.bodyYaw = c.yaw;
      c.pitch = -0.08;
      game.world.setOrigin(c.worldOffsetX, c.worldOffsetZ);
      game.landmarks.updateOrigin(c.worldOffsetX, c.worldOffsetZ);
      game.world.update(c.globalX, c.globalZ);
      game.sandSurface.syncOrigin?.();
      game.sandSurface.update(c, true);
      game.rig.update(c, 1 / 60);
      game.characterPolish?.update(c, 1 / 60);
      game.camera.update(c, 1 / 60);
    });
    await page.waitForTimeout(650);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-blender-landmark', { fullPage: false });

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const c = game.controller;
      c.resetToSpawn();
      c.yaw = 0.15;
      c.bodyYaw = 0.15;
      c.pitch = -0.05;
      game.world.setOrigin(c.worldOffsetX, c.worldOffsetZ);
      game.landmarks.updateOrigin(c.worldOffsetX, c.worldOffsetZ);
      game.world.update(c.globalX, c.globalZ);
      game.sand.clear();
      game.sandSurface.syncOrigin?.();
      game.sandSurface.markDirty();
      game.sandSurface.update(c, true);
    });
    await page.waitForTimeout(220);

    const impactBeforeWalk = (await qaState(page))!.sandImpacts ?? 0;
    const preWalk = await qaState(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2_800);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(250);
    const walked = await qaState(page);
    expect(walked!.player!.z).not.toBeCloseTo(preWalk!.player!.z, 1);
    expect(walked!.sandImpacts).toBeGreaterThan(impactBeforeWalk);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-after-real-walk', { fullPage: false });

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      game.controller.pitch = 1.05;
      game.controller.yaw += 1.35;
    });
    await page.waitForTimeout(140);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-look-down-yaw-diverged', { fullPage: false });

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const c = game.controller;
      c.yaw = 0.15;
      c.bodyYaw = 0.15;
      c.pitch = 0.52;
      const yaw = c.bodyYaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const steps = [0.9, 1.32, 1.74, 2.16, 2.58, 3.0];
      steps.forEach((forward, index) => {
        const side = index % 2 === 0 ? -0.13 : 0.13;
        game.sand.stampFoot({
          globalX: c.globalX + fx * forward + rx * side,
          globalZ: c.globalZ + fz * forward + rz * side,
          yaw
        }, { speed: 2.35, lastSlope: 0.20, sliding: 0.06 });
      });
      game.sand.relaxArea(c.globalX + fx * 1.9, c.globalZ + fz * 1.9, 2.5, 6);
      for (let i = 0; i < 5; i += 1) game.sand.update(0.21, c.globalX, c.globalZ);
      const dirty = game.sand.consumeDirtyBounds();
      if (dirty) game.world.refreshDeformation(dirty);
      game.sandSurface.markDirty();
      game.sandSurface.update(c, true);
    });
    await page.waitForTimeout(550);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-physical-sand', { fullPage: false });

    const deformed = await qaState(page);
    expect(deformed!.sandCells).toBeGreaterThan(80);
    expect(deformed!.sandImpacts).toBeGreaterThanOrEqual(6);
    expect(deformed!.camera!.minZ).toBeGreaterThanOrEqual(0.16);

    await testInfo.attach('sirocco-state.json', {
      body: Buffer.from(JSON.stringify({ initial, preWalk, walked, deformed }, null, 2)),
      contentType: 'application/json'
    });
    monitor.assertClean();
  });
});
