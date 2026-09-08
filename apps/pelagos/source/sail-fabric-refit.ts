import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const textures = new WeakMap<OceanWorld, DynamicTexture>();

function fabricTexture(world: OceanWorld): DynamicTexture {
  const existing = textures.get(world);
  if (existing) return existing;

  const texture = new DynamicTexture('pelagos-neutral-sail-weave', { width: 256, height: 256 }, world.scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#f3f1e8';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 256; i += 4) {
    ctx.strokeStyle = i % 8 === 0 ? 'rgba(57,52,43,0.055)' : 'rgba(57,52,43,0.032)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  for (let seam = 28; seam < 256; seam += 48) {
    ctx.strokeStyle = 'rgba(69,59,43,0.11)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(seam, 0);
    ctx.lineTo(seam, 256);
    ctx.stroke();
  }

  texture.update(false);
  texture.uScale = 2.35;
  texture.vScale = 2.35;
  textures.set(world, texture);
  return texture;
}

function applyNeutralFabric(world: OceanWorld): void {
  const material = world.scene.getMaterialByName('salted-canvas')
    ?? world.scene.getMaterialByName('physical-sail-cloth');
  if (!(material instanceof StandardMaterial)) return;
  const texture = fabricTexture(world);
  if (material.diffuseTexture !== texture) material.diffuseTexture = texture;
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosNeutralFabricV1?: boolean };
if (!prototype.__pelagosNeutralFabricV1) {
  prototype.__pelagosNeutralFabricV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function neutralFabricUpdate(
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
    applyNeutralFabric(this);
  };
}
