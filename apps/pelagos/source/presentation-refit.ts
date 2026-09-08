import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { ShipState, ShipTelemetry } from './core';
import { clamp } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

export function presentationCameraScale(length: number, mainHeightScale: number, jibHeightScale: number): number {
  const hull = clamp((length - 10.8) / (15.6 - 10.8), 0, 1);
  const rig = clamp((Math.max(mainHeightScale, jibHeightScale) - 0.86) / 0.30, 0, 1);
  return 1.052 + hull * 0.032 + rig * 0.018;
}

type PresentationMemory = {
  textureCount: number;
  tunedTextures: WeakSet<object>;
};

const memories = new WeakMap<OceanWorld, PresentationMemory>();
const COACHING_COPY: Array<[string, string]> = [
  ['Проведи большим пальцем по рулю слева', 'Руль: веди пальцем влево ↔ вправо.'],
  ['Потяни ползунок паруса справа', 'Парус: вверх/вниз · золотая риска — оптимум.'],
  ['Удерживай «ГРЕСТИ»', 'Грести: удерживай на малой скорости.'],
  ['Свайпни по самому морю', 'Обзор: свайп по морю · камера вернётся сама.']
];

function getMemory(world: OceanWorld): PresentationMemory {
  let memory = memories.get(world);
  if (!memory) {
    memory = { textureCount: -1, tunedTextures: new WeakSet<object>() };
    memories.set(world, memory);
  }
  return memory;
}

function gameplayVisible(): boolean {
  const controls = document.querySelector<HTMLElement>('#controls');
  const menu = document.querySelector<HTMLElement>('#menu');
  const shipyard = document.querySelector<HTMLElement>('#shipyard');
  return Boolean(
    controls && !controls.classList.contains('hidden')
    && (!menu || menu.classList.contains('hidden'))
    && (!shipyard || shipyard.classList.contains('hidden'))
  );
}

function compactOnboardingCopy(): void {
  const hint = document.querySelector<HTMLElement>('#hint');
  if (!hint || hint.classList.contains('hidden')) return;
  const current = hint.textContent?.trim() ?? '';
  for (const [prefix, compact] of COACHING_COPY) {
    if (current.startsWith(prefix)) {
      hint.textContent = compact;
      document.documentElement.dataset.pelagosCompactCoach = '1';
      break;
    }
  }
}

function tuneObliqueTextures(world: OceanWorld): void {
  const memory = getMemory(world);
  if (memory.textureCount === world.scene.textures.length) return;
  memory.textureCount = world.scene.textures.length;

  for (const base of world.scene.textures) {
    if (memory.tunedTextures.has(base)) continue;
    memory.tunedTextures.add(base);
    const texture = base as unknown as {
      name?: string;
      anisotropicFilteringLevel?: number;
      updateSamplingMode?: (mode: number) => void;
    };
    if (typeof texture.anisotropicFilteringLevel === 'number') {
      texture.anisotropicFilteringLevel = Math.max(texture.anisotropicFilteringLevel, 8);
    }
    const name = (texture.name ?? '').toLowerCase();
    if (typeof texture.updateSamplingMode === 'function' && /(deck|sail|cloth|wood|plank|hull)/.test(name)) {
      texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
    }
  }
  document.documentElement.dataset.pelagosTextureAnisotropy = '8';
}

function refineGameplayComposition(world: OceanWorld): void {
  if (!gameplayVisible()) {
    document.documentElement.dataset.pelagosFrameScale = '1.000';
    return;
  }

  const loadout = getActiveShipLoadout();
  const scale = presentationCameraScale(
    loadout.dimensions.length,
    loadout.sails.mainHeightScale,
    loadout.sails.jibHeightScale
  );
  const target = world.camera.getTarget();
  const offset = world.camera.position.subtract(target);
  if (offset.lengthSquared() > 0.001) {
    world.camera.position.copyFrom(target.add(offset.scale(scale)));
  }
  world.scene.getMeshByName('sky-dome')?.position.copyFrom(world.camera.position);
  document.documentElement.dataset.pelagosFrameScale = scale.toFixed(3);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosPresentationRefitV2?: boolean };
if (!prototype.__pelagosPresentationRefitV2) {
  prototype.__pelagosPresentationRefitV2 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function presentationRefitUpdate(
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
    compactOnboardingCopy();
    tuneObliqueTextures(this);
    refineGameplayComposition(this);
  };
}
