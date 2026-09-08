import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF';
import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const loadState = new WeakMap<OceanWorld, Promise<void>>();

const PROCEDURAL_STRUCTURE = [
  'refit-unified-hull',
  'refit-cambered-deck',
  'refit-skeg',
  'refit-cockpit-floor',
  'refit-companionway'
] as const;

function hideProceduralStructure(world: OceanWorld): void {
  for (const exact of PROCEDURAL_STRUCTURE) world.scene.getMeshByName(exact)?.setEnabled(false);
  for (const mesh of world.scene.meshes) {
    if (
      mesh.name.startsWith('refit-caprail-')
      || mesh.name.startsWith('refit-rubbing-strake-')
      || mesh.name.startsWith('refit-cockpit-coaming-')
    ) mesh.setEnabled(false);
  }
}

function registerShadowCaster(world: OceanWorld, mesh: AbstractMesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as {
    getShadowGenerator?: () => { addShadowCaster: (mesh: AbstractMesh, includeDescendants?: boolean) => void } | null;
  } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

export function ensureBlenderShip(world: OceanWorld): Promise<void> {
  const existing = loadState.get(world);
  if (existing) return existing;

  const promise = SceneLoader.ImportMeshAsync('', './models/', 'pelagos-cutter.glb', world.scene)
    .then((result) => {
      const assetRoot = new TransformNode('pelagos-blender-cutter-root', world.scene);
      assetRoot.parent = world.shipRoot;
      // Blender's +Y longitudinal axis is exported opposite PELAGOS' +Z forward axis.
      // One authored orientation node fixes it without touching glTF's internal coordinate transform.
      assetRoot.rotation.y = Math.PI;

      const imported = new Set<AbstractMesh>(result.meshes);
      const roots = result.meshes.filter((mesh) => !mesh.parent || !imported.has(mesh.parent as AbstractMesh));
      for (const root of roots) {
        root.parent = assetRoot;
        root.position.set(0, 0, 0);
      }

      for (const mesh of result.meshes) {
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        registerShadowCaster(world, mesh);
        const material = mesh.material;
        if (material instanceof PBRMaterial) {
          material.environmentIntensity = 0.42;
          material.directIntensity = 0.96;
          material.specularIntensity = 0.62;
        }
      }

      hideProceduralStructure(world);
      document.documentElement.dataset.pelagosShipAsset = 'blender';
    })
    .catch((error: unknown) => {
      // The procedural hull intentionally remains enabled as an offline/failure fallback.
      console.warn('[PELAGOS] Blender cutter unavailable; using procedural hull fallback.', error);
      document.documentElement.dataset.pelagosShipAsset = 'fallback';
    });

  loadState.set(world, promise);
  return promise;
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosBlenderShipV1?: boolean };
if (!prototype.__pelagosBlenderShipV1) {
  prototype.__pelagosBlenderShipV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function blenderShipUpdate(
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
    void ensureBlenderShip(this);
  };
}
