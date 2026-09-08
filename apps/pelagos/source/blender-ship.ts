import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF';
import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import { ACTIVE_SHIP } from './ship-config';

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

function tuneImportedMaterial(material: PBRMaterial): void {
  // The authored Blender palette should stay readable on WebKit without flattening the varnish,
  // metal and rope into the same response. Small fittings need brighter indirect light than the
  // hull mass because they occupy only a few mobile pixels at the default chase distance.
  material.environmentIntensity = 0.58;
  material.directIntensity = 1.10;
  material.specularIntensity = 0.54;
  material.microSurface = Math.min(material.microSurface, 0.84);

  const name = material.name.toLowerCase();
  if (name.includes('deck')) {
    material.environmentIntensity = 0.66;
    material.directIntensity = 1.14;
    material.specularIntensity = 0.34;
    material.microSurface = Math.min(material.microSurface, 0.72);
  } else if (name.includes('oxblood') || name.includes('mahogany')) {
    material.environmentIntensity = 0.60;
    material.specularIntensity = 0.58;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.24;
    material.clearCoat.roughness = 0.40;
  } else if (name.includes('sea green')) {
    material.environmentIntensity = 0.62;
    material.specularIntensity = 0.44;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.16;
    material.clearCoat.roughness = 0.48;
  } else if (name.includes('brass')) {
    material.environmentIntensity = 0.72;
    material.directIntensity = 1.18;
    material.specularIntensity = 0.84;
    material.microSurface = Math.min(material.microSurface, 0.90);
  } else if (name.includes('iron')) {
    material.environmentIntensity = 0.56;
    material.specularIntensity = 0.66;
  } else if (name.includes('rope')) {
    material.specularIntensity = 0.14;
    material.environmentIntensity = 0.50;
    material.microSurface = Math.min(material.microSurface, 0.58);
  } else if (name.includes('ivory')) {
    material.environmentIntensity = 0.68;
    material.specularIntensity = 0.30;
  } else if (name.includes('lantern glow')) {
    material.environmentIntensity = 0.18;
    material.directIntensity = 0.42;
    material.specularIntensity = 0.20;
    material.emissiveColor.set(0.95, 0.20, 0.025);
  }
}

export function ensureBlenderShip(world: OceanWorld): Promise<void> {
  const existing = loadState.get(world);
  if (existing) return existing;

  const promise = SceneLoader.ImportMeshAsync('', './models/', ACTIVE_SHIP.definition.hullAsset, world.scene)
    .then((result) => {
      const assetRoot = new TransformNode(`pelagos-${ACTIVE_SHIP.definition.id}-root`, world.scene);
      assetRoot.parent = world.shipRoot;
      // Blender's +Y longitudinal axis is exported opposite PELAGOS' +Z forward axis.
      // One authored orientation node fixes it without touching glTF's internal coordinate transform.
      assetRoot.rotation.y = Math.PI;

      // Preserve authored empties and parent/child relationships. The previous loader only tracked
      // meshes, so a mesh parented to a Blender empty was mistaken for a root and detached. That
      // made proper swinging lanterns, blocks and other articulated fittings impossible.
      const importedNodes = new Set<TransformNode | AbstractMesh>([
        ...result.transformNodes,
        ...result.meshes
      ]);
      const roots: Array<TransformNode | AbstractMesh> = [];
      for (const node of importedNodes) {
        const parent = node.parent as TransformNode | AbstractMesh | null;
        if (!parent || !importedNodes.has(parent)) roots.push(node);
      }
      for (const root of roots) root.parent = assetRoot;

      for (const mesh of result.meshes) {
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        registerShadowCaster(world, mesh);
        const material = mesh.material;
        if (material instanceof PBRMaterial) tuneImportedMaterial(material);
      }

      hideProceduralStructure(world);
      document.documentElement.dataset.pelagosShipAsset = 'blender';
      document.documentElement.dataset.pelagosShipClass = ACTIVE_SHIP.definition.id;
    })
    .catch((error: unknown) => {
      // The procedural hull intentionally remains enabled as an offline/failure fallback.
      console.warn('[PELAGOS] Blender cutter unavailable; using procedural hull fallback.', error);
      document.documentElement.dataset.pelagosShipAsset = 'fallback';
    });

  loadState.set(world, promise);
  return promise;
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosBlenderShipV4?: boolean };
if (!prototype.__pelagosBlenderShipV4) {
  prototype.__pelagosBlenderShipV4 = true;
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
