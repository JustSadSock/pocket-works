import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShipState, ShipTelemetry } from './core';
import { clamp } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type FinishKind = 'hull' | 'deck' | 'sail' | null;

function finishKind(name: string): FinishKind {
  const n = name.toLowerCase();
  if (n.includes('sail') || n.includes('canvas')) return 'sail';
  if (n.includes('deck') || n.includes('plank')) return 'deck';
  if (
    n.includes('hull')
    || n.includes('oxblood')
    || n.includes('sea-green')
    || n.includes('sea_green')
    || n.includes('paint')
    || n.includes('sheerclosure')
  ) return 'hull';
  return null;
}

function applyRoughness(material: PBRMaterial | StandardMaterial, roughness: number): void {
  const value = clamp(roughness, 0.18, 0.96);
  if (material instanceof PBRMaterial) {
    material.roughness = value;
    material.microSurface = clamp(1 - value * 0.72, 0.25, 0.90);
    return;
  }

  // StandardMaterial has no roughness input. Map perceptual roughness to highlight width while
  // preserving the authored specular tint. This assignment is absolute, so repeated runtime
  // application cannot gradually darken a material over many frames.
  material.specularPower = 7 + Math.pow(1 - value, 2.2) * 118;
}

function applyFinishes(world: OceanWorld): void {
  const palette = getActiveShipLoadout().palette;
  for (const material of world.scene.materials) {
    if (!(material instanceof PBRMaterial) && !(material instanceof StandardMaterial)) continue;
    const kind = finishKind(material.name);
    if (kind === 'hull') applyRoughness(material, palette.hullRoughness);
    else if (kind === 'deck') applyRoughness(material, palette.deckRoughness);
    else if (kind === 'sail') applyRoughness(material, palette.sailRoughness);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosMaterialFinishV1?: boolean };
if (!prototype.__pelagosMaterialFinishV1) {
  prototype.__pelagosMaterialFinishV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function materialFinishUpdate(
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
    applyFinishes(this);
  };
}
