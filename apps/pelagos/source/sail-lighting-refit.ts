import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShipState, ShipTelemetry } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const SAIL_MESHES = [
  { name: 'physical-main-sail', rows: 15, cols: 11 },
  { name: 'physical-jib-sail', rows: 14, cols: 8 }
] as const;

function ensureSailUvs(world: OceanWorld): void {
  for (const spec of SAIL_MESHES) {
    const mesh = world.scene.getMeshByName(spec.name);
    if (!mesh || mesh.isVerticesDataPresent(VertexBuffer.UVKind)) continue;

    // The physical cloth was originally created from positions/indices/normals only, while the
    // later presence pass attached a woven DynamicTexture. Chromium tolerates a missing UV buffer;
    // WebKit does not and can sample the cloth as solid black. Give every cloth node stable UVs
    // derived from the solver grid, independent of the continuously deforming positions.
    const uvs: number[] = [];
    for (let row = 0; row < spec.rows; row += 1) {
      const v = 1 - row / Math.max(1, spec.rows - 1);
      for (let col = 0; col < spec.cols; col += 1) {
        const u = col / Math.max(1, spec.cols - 1);
        uvs.push(u, v);
      }
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uvs, false, 2);
  }
}

function tuneSailLighting(world: OceanWorld): void {
  ensureSailUvs(world);
  const sailColor = Color3.FromHexString(getActiveShipLoadout().palette.sail);
  const material = world.scene.getMaterialByName('salted-canvas')
    ?? world.scene.getMaterialByName('physical-sail-cloth');

  if (material instanceof StandardMaterial) {
    // Canvas remains readable from either side: soft skylight/transmitted light prevents the
    // leeward face from collapsing to black while the real normals still provide cloth shading.
    material.diffuseColor.copyFrom(sailColor);
    material.emissiveColor.copyFrom(sailColor.scale(0.085));
    material.specularColor.set(0.045, 0.038, 0.026);
    material.specularPower = 12;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
  }

  for (const spec of SAIL_MESHES) {
    const mesh = world.scene.getMeshByName(spec.name);
    if (!mesh) continue;
    // Dynamic cloth still casts onto the deck, but does not receive its own shadow map. This avoids
    // precision acne on thin two-sided geometry on mobile GPUs without flattening its lighting.
    mesh.receiveShadows = false;
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSailLightingV2?: boolean };
if (!prototype.__pelagosSailLightingV2) {
  prototype.__pelagosSailLightingV2 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function sailLightingUpdate(
    state: ShipState,
    telemetry: ShipTelemetry,
    environment: EnvironmentFrame,
    time: number,
    dt: number,
    originX: number,
    originZ: number,
    lookYaw: number,
    lookPitch: number,
    rowing: number
  ): void {
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    tuneSailLighting(this);
  };
}
