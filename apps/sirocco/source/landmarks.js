import '@babylonjs/loaders/glTF';
import { SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';

const PLACEMENTS = Object.freeze([
  { x: 169, z: 132, scale: 1.02, yaw: -0.24 },
  { x: 88, z: 188, scale: 1.38, yaw: 1.18 },
  { x: 246, z: 226, scale: 1.62, yaw: -1.02 },
  { x: 314, z: 112, scale: 0.92, yaw: 2.18 },
  { x: 12, z: 298, scale: 1.74, yaw: 0.46 }
]);

export class DesertLandmarks {
  constructor(scene, surface) {
    this.scene = scene;
    this.surface = surface;
    this.template = null;
    this.instances = [];
    this.offsetX = 0;
    this.offsetZ = 0;
  }

  async init() {
    try {
      const imported = await SceneLoader.ImportMeshAsync('', './models/', 'sirocco-landmarks.glb', this.scene);
      const importedSet = new Set(imported.meshes);
      const roots = imported.meshes.filter((mesh) => !mesh.parent || !importedSet.has(mesh.parent));
      this.template = new TransformNode('sirocco-landmark-template', this.scene);
      for (const root of roots) root.parent = this.template;
      for (const mesh of imported.meshes) {
        mesh.isPickable = false;
        mesh.receiveShadows = false;
      }
      this.template.setEnabled(false);

      for (let index = 0; index < PLACEMENTS.length; index += 1) {
        const placement = PLACEMENTS[index];
        // TransformNode.clone's third parameter means doNotCloneChildren.
        // Leaving it false is essential: otherwise CI sees five empty roots
        // while none of the Blender-authored geometry actually reaches the scene.
        const instance = this.template.clone(`sirocco-landmark-${index}`, null, false);
        instance.setEnabled(true);
        for (const child of instance.getChildMeshes(false)) {
          child.setEnabled(true);
          child.isPickable = false;
          child.receiveShadows = false;
        }
        instance.scaling.setAll(placement.scale);
        instance.rotation.y = placement.yaw;
        this.instances.push({ root: instance, placement });
      }
      this.updateOrigin(this.offsetX, this.offsetZ);
      return true;
    } catch (error) {
      console.warn('[SIROCCO] Blender landmark asset unavailable; continuing with dunes only.', error);
      return false;
    }
  }

  updateOrigin(offsetX, offsetZ) {
    this.offsetX = offsetX;
    this.offsetZ = offsetZ;
    for (const entry of this.instances) {
      const { placement, root } = entry;
      const ground = this.surface?.sampleBaseHeight?.(placement.x, placement.z)
        ?? this.surface?.sampleHeight?.(placement.x, placement.z)
        ?? 0;
      root.position.copyFrom(new Vector3(
        placement.x - offsetX,
        ground - 0.12 * placement.scale,
        placement.z - offsetZ
      ));
    }
  }

  dispose() {
    for (const entry of this.instances) entry.root.dispose();
    this.instances.length = 0;
    this.template?.dispose();
    this.template = null;
  }
}
