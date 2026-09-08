import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShipState, ShipTelemetry } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const SAIL_MESHES = ['physical-main-sail', 'physical-jib-sail'] as const;

function tuneSailLighting(world: OceanWorld): void {
  const sailColor = Color3.FromHexString(getActiveShipLoadout().palette.sail);
  const material = world.scene.getMaterialByName('salted-canvas')
    ?? world.scene.getMaterialByName('physical-sail-cloth');

  if (material instanceof StandardMaterial) {
    // Mobile WebKit can turn a dynamic two-sided cloth mesh almost black when the camera sees the
    // shaded side while that same mesh is also receiving its own shadow map. Real canvas is never
    // optically black from the leeward side: skylight and transmitted sun keep it readable.
    material.diffuseColor.copyFrom(sailColor);
    material.emissiveColor.copyFrom(sailColor.scale(0.105));
    material.specularColor.set(0.045, 0.038, 0.026);
    material.specularPower = 12;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
  }

  for (const name of SAIL_MESHES) {
    const mesh = world.scene.getMeshByName(name);
    if (!mesh) continue;
    // Keep the sail casting a useful shadow onto the deck, but do not sample the shadow map on the
    // deforming sail itself. This removes the WebKit self-shadow precision failure without making
    // the cloth flat or unlit.
    mesh.receiveShadows = false;
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSailLightingV1?: boolean };
if (!prototype.__pelagosSailLightingV1) {
  prototype.__pelagosSailLightingV1 = true;
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
