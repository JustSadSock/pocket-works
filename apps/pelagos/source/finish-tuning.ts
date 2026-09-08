import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShipState, ShipTelemetry } from './core';
import { getActiveShipLoadout, getShipLoadoutRevision } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type FinishStamp = { revision: number; materialCount: number };
const stamps = new WeakMap<OceanWorld, FinishStamp>();

function roughnessFor(name: string): number | null {
  const palette = getActiveShipLoadout().palette;
  if (name.includes('sail') || name.includes('canvas')) return palette.sailRoughness;
  if (name.includes('deck') || name.includes('plank') || name.includes('grating')) return palette.deckRoughness;
  if (
    name.includes('hull')
    || name.includes('paint')
    || name.includes('oxblood')
    || name.includes('sea-green')
    || name.includes('sea_green')
    || name.includes('ivory')
    || name.includes('trim')
  ) return palette.hullRoughness;
  return null;
}

function applyFinish(world: OceanWorld): void {
  const revision = getShipLoadoutRevision();
  const materialCount = world.scene.materials.length;
  const previous = stamps.get(world);
  if (previous?.revision === revision && previous.materialCount === materialCount) return;

  for (const material of world.scene.materials) {
    const roughness = roughnessFor(material.name.toLowerCase());
    if (roughness == null) continue;
    if (material instanceof PBRMaterial) {
      material.roughness = roughness;
      material.microSurface = Math.min(material.microSurface, 1 - roughness * 0.42);
    } else if (material instanceof StandardMaterial) {
      material.specularPower = 12 + (1 - roughness) * 84;
    }
  }
  stamps.set(world, { revision, materialCount });
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosFinishTuningV1?: boolean };
if (!prototype.__pelagosFinishTuningV1) {
  prototype.__pelagosFinishTuningV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function finishTuningUpdate(
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
    applyFinish(this);
  };
}
