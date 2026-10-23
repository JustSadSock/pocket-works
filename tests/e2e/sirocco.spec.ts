import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

declare global {
  interface Window {
    __SIROCCO_QA_READY__?: boolean;
    __SIROCCO_QA__?: any;
    __SIROCCO_PRESENCE__?: any;
  }
}

async function qaState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const game = window.__SIROCCO_QA__;
    if (!game) return null;
    const camera = game.camera?.camera;
    const controller = game.controller;
    const localSand = game.sandSurface?.mesh;
    let maxLoose = 0;
    let maxCompaction = 0;
    for (const cell of game.sand?.cells?.values?.() || []) {
      maxLoose = Math.max(maxLoose, cell.loose || 0);
      maxCompaction = Math.max(maxCompaction, cell.compaction || 0);
    }
    return {
      running: game.running,
      paused: game.paused,
      fps: game.engine?.getFps?.(),
      quality: game.quality?.preset?.id,
      activeChunks: game.world?.activeChunkCount,
      sandCells: game.sand?.activeCellCount,
      sandImpacts: game.sand?.totalImpacts,
      sandWorkMs: game.sand?.lastWorkMs,
      sandMaintenanceMs: game.sand?.lastMaintenanceMs,
      sandBudgetScale: game.sand?.adaptiveBudgetScale,
      sandTransfers: game.sand?.lastTransferCount,
      maxLoose,
      maxCompaction,
      landmarkInstances: game.landmarks?.instances?.length ?? 0,
      characterPolishMeshes: game.characterPolish?.meshes?.length ?? 0,
      camera: camera ? {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        pitch: camera.rotation.x, yaw: camera.rotation.y, minZ: camera.minZ
      } : null,
      player: controller ? {
        x: controller.globalX, y: controller.localPosition.y, z: controller.globalZ,
        yaw: controller.yaw, bodyYaw: controller.bodyYaw, pitch: controller.pitch, speed: controller.speed,
        softness: controller.softness
      } : null,
      localSand: localSand ? {
        enabled: localSand.isEnabled(), vertices: localSand.getTotalVertices(), indices: localSand.getTotalIndices(),
        x: localSand.position.x, z: localSand.position.z
      } : null,
      meshes: game.scene?.meshes?.length,
      materials: game.scene?.materials?.map((material: any) => material.name),
      textures: game.scene?.textures?.map((texture: any) => texture.name)
    };
  });
}

test.describe('SIROCCO deterministic visual QA', () => {
  test('landscape walk, Blender landmarks, terrain LOD, physical sand and wind stay coherent', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('landscape'), 'SIROCCO is landscape-first.');
    const monitor = monitorUnexpectedBrowserOutput(page);

    await page.goto('/apps/sirocco/?qa=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SIROCCO_QA_READY__ === true, null, { timeout: 25_000 });
    await expect(page.locator('#enter-button')).toBeVisible();
    await page.locator('#enter-button').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await page.waitForTimeout(750);

    const presenceReady = await page.evaluate(() => Boolean(window.__SIROCCO_PRESENCE__));
    expect(presenceReady).toBe(true);

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
    expect(initial!.localSand?.vertices ?? 0).toBeGreaterThan(3_500);
    expect(initial!.localSand?.vertices ?? 99_999).toBeLessThan(5_000);
    expect(initial!.localSand?.indices ?? 0).toBeGreaterThan(15_000);
    expect(initial!.camera!.y - initial!.player!.y).toBeGreaterThan(1.45);
    expect(initial!.camera!.minZ).toBeGreaterThanOrEqual(0.20);
    expect(initial!.landmarkInstances).toBeGreaterThanOrEqual(5);
    expect(initial!.characterPolishMeshes).toBeGreaterThanOrEqual(9);
    expect(initial!.textures).toContain('bedouin-skin-detail');
    expect(initial!.textures).toContain('bedouin-keffiyeh-weave');
    expect(initial!.player!.softness).toBeGreaterThan(0.2);
    expect(initial!.player!.softness).toBeLessThan(0.9);

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
      game.updateFirstPersonGarmentVisibility?.();
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
    expect(walked!.maxLoose).toBeGreaterThan(0.08);
    expect(walked!.maxCompaction).toBeGreaterThan(0.08);
    expect(walked!.sandWorkMs).toBeLessThan(12);
    expect(walked!.sandBudgetScale).toBeGreaterThanOrEqual(0.34);
    expect(walked!.sandBudgetScale).toBeLessThanOrEqual(1);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-after-real-walk', { fullPage: false });

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      game.controller.bodyYaw = game.controller.yaw;
      game.controller.pitch = 0.68;
      game.rig.update(game.controller, 1 / 60);
      game.characterPolish?.update(game.controller, 1 / 60);
      game.updateFirstPersonGarmentVisibility?.();
      game.camera.update(game.controller, 1 / 60);
    });
    await page.waitForTimeout(180);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-body-look-down', { fullPage: false });

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      game.controller.pitch = 1.05;
      game.controller.yaw += 1.35;
      game.rig.update(game.controller, 1 / 60);
      game.characterPolish?.update(game.controller, 1 / 60);
      game.updateFirstPersonGarmentVisibility?.();
      game.camera.update(game.controller, 1 / 60);
    });
    await page.waitForTimeout(140);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-look-down-yaw-diverged', { fullPage: false });

    await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const c = game.controller;
      c.yaw = 0.15;
      c.bodyYaw = 0.15;
      c.pitch = 0.52;
      game.rig.update(c, 1 / 60);
      game.characterPolish?.update(c, 1 / 60);
      game.updateFirstPersonGarmentVisibility?.();
      game.camera.update(c, 1 / 60);
      const yaw = c.bodyYaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const steps = [0.75, 1.1, 1.45, 1.80, 2.15, 2.50];
      steps.forEach((forward, index) => {
        const side = index % 2 === 0 ? -0.13 : 0.13;
        game.sand.stampFoot({
          globalX: c.globalX + fx * forward + rx * side,
          globalZ: c.globalZ + fz * forward + rz * side,
          yaw
        }, { speed: 2.35, lastSlope: 0.20, sliding: 0.06 });
      });
      const repeatX = c.globalX + fx * 0.75 - rx * 0.13;
      const repeatZ = c.globalZ + fz * 0.75 - rz * 0.13;
      game.sand.stampFoot({ globalX: repeatX, globalZ: repeatZ, yaw }, { speed: 1.5, lastSlope: 0.12, sliding: 0 });
      game.sand.relaxArea(c.globalX + fx * 1.6, c.globalZ + fz * 1.6, 2.15, 4);
      for (let i = 0; i < 4; i += 1) game.sand.update(0.23, c.globalX, c.globalZ);
      game.sand.consumeDirtyBounds();
      game.sandSurface.markDirty();
      game.sandSurface.update(c, true);
    });
    await page.waitForTimeout(550);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-physical-sand-v2', { fullPage: false });

    const deformed = await qaState(page);
    expect(deformed!.sandCells).toBeGreaterThan(60);
    expect(deformed!.sandImpacts).toBeGreaterThanOrEqual(7);
    expect(deformed!.maxLoose).toBeGreaterThan(0.12);
    expect(deformed!.maxCompaction).toBeGreaterThan(0.12);
    expect(deformed!.sandWorkMs).toBeLessThan(12);
    expect(deformed!.sandBudgetScale).toBeGreaterThanOrEqual(0.34);
    expect(deformed!.camera!.minZ).toBeGreaterThanOrEqual(0.20);

    const windResult = await page.evaluate(() => {
      const game = window.__SIROCCO_QA__;
      const presence = window.__SIROCCO_PRESENCE__;
      const c = game.controller;
      game.sand.clear();
      const cellSize = game.sand.cellSize;
      const ix = Math.round(c.globalX / cellSize);
      const iz = Math.round(c.globalZ / cellSize);
      game.sand.addCell(ix, iz, 0.030, 0.90, 0);
      game.sand.addCell(ix - 2, iz, -0.032, 0.04, 0.72);
      const sourceBefore = game.sand.getCell(ix, iz);
      const targetBefore = game.sand.getCell(ix + 1, iz);
      const cavityBefore = game.sand.getCell(ix - 2, iz);
      let moved = false;
      const forcedWind = { x: 1, z: 0, strength: 0.92, gust: 0.94, pulse: 0.8 };
      for (let i = 0; i < 8; i += 1) moved = presence.erosion.update(0.50, c.globalX, c.globalZ, forcedWind) || moved;
      presence.wind.nextPulse = 0;
      const wind = presence.wind.update(1 / 60, c.globalX, c.globalZ);
      game.sandSurface.markDirty();
      game.sandSurface.update(c, true);
      for (let i = 0; i < 4; i += 1) {
        game.particles.wind(0.5, c.localPosition, forcedWind, (localX, localZ) => {
          const gx = localX + c.worldOffsetX;
          const gz = localZ + c.worldOffsetZ;
          return game.sandSurface.sampleHeight(gx, gz);
        });
      }
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
    expect(windResult.moved).toBe(true);
    expect(windResult.sourceAfter).toBeLessThan(windResult.sourceBefore);
    expect(windResult.targetAfter).toBeGreaterThan(windResult.targetBefore);
    expect(windResult.cavityAfter).toBeGreaterThan(windResult.cavityBefore);
    expect(windResult.wind.strength).toBeGreaterThan(0.2);
    expect(windResult.wind.gust).toBeGreaterThanOrEqual(0);
    expect(windResult.driftCapacity).toBeGreaterThanOrEqual(100);
    expect(windResult.erosionBudget).toBeLessThanOrEqual(50);
    await page.waitForTimeout(650);
    await attachCriticalScreenshot(page, testInfo, 'sirocco-wind-presence', { fullPage: false });

    await testInfo.attach('sirocco-state.json', {
      body: Buffer.from(JSON.stringify({ initial, preWalk, walked, deformed, windResult }, null, 2)),
      contentType: 'application/json'
    });
    monitor.assertClean();
  });
});
