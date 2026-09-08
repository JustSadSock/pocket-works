import '@babylonjs/loaders/glTF';
import { Color3, DynamicTexture, MeshBuilder, SceneLoader, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

const PLACEMENTS = Object.freeze([
  { x: 169, z: 132, scale: 1.02, yaw: -0.24 },
  { x: 88, z: 188, scale: 1.38, yaw: 1.18 },
  { x: 246, z: 226, scale: 1.62, yaw: -1.02 },
  { x: 314, z: 112, scale: 0.92, yaw: 2.18 },
  { x: 12, z: 298, scale: 1.74, yaw: 0.46 }
]);

function makeRockShadowTexture(scene) {
  const texture = new DynamicTexture('sirocco-rock-contact-shadow-texture', { width: 192, height: 128 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 192, 128);
  const gradient = ctx.createRadialGradient(96, 64, 7, 96, 64, 88);
  gradient.addColorStop(0, 'rgba(32,17,8,0.72)');
  gradient.addColorStop(0.28, 'rgba(32,17,8,0.46)');
  gradient.addColorStop(0.62, 'rgba(32,17,8,0.18)');
  gradient.addColorStop(1, 'rgba(32,17,8,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 192, 128);
  texture.update(false);
  return texture;
}

export class DesertLandmarks {
  constructor(scene, surface) {
    this.scene = scene;
    this.surface = surface;
    this.template = null;
    this.instances = [];
    this.offsetX = 0;
    this.offsetZ = 0;
    this.shadowTexture = makeRockShadowTexture(scene);
    this.shadowMaterial = new StandardMaterial('sirocco-rock-contact-shadow-material', scene);
    this.shadowMaterial.diffuseTexture = this.shadowTexture;
    this.shadowMaterial.useAlphaFromDiffuseTexture = true;
    this.shadowMaterial.diffuseColor = Color3.Black();
    this.shadowMaterial.emissiveColor = Color3.Black();
    this.shadowMaterial.specularColor = Color3.Black();
    this.shadowMaterial.disableLighting = true;
    this.shadowMaterial.alpha = 0.46;
    this.shadowMaterial.backFaceCulling = false;
    this.shadowMaterial.zOffset = -2;
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
        const mat = mesh.material;
        if (mat) {
          if ('metallic' in mat) mat.metallic = 0;
          if ('roughness' in mat) mat.roughness = Math.max(0.90, mat.roughness ?? 0.95);
          if ('environmentIntensity' in mat) mat.environmentIntensity = 0.34;
        }
      }
      this.template.setEnabled(false);

      for (let index = 0; index < PLACEMENTS.length; index += 1) {
        const placement = PLACEMENTS[index];
        const instance = this.template.clone(`sirocco-landmark-${index}`, null, false);
        instance.setEnabled(true);
        for (const child of instance.getChildMeshes(false)) {
          child.setEnabled(true);
          child.isPickable = false;
          child.receiveShadows = false;
        }
        instance.scaling.setAll(placement.scale);
        instance.rotation.y = placement.yaw;

        const shadow = MeshBuilder.CreateGround(`sirocco-landmark-shadow-${index}`, {
          width: 11.5 * placement.scale,
          height: 7.4 * placement.scale,
          subdivisions: 1
        }, this.scene);
        shadow.material = this.shadowMaterial;
        shadow.isPickable = false;
        shadow.receiveShadows = false;
        shadow.renderingGroupId = 1;
        shadow.rotation.y = placement.yaw - 0.34;

        this.instances.push({ root: instance, shadow, placement });
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
      const { placement, root, shadow } = entry;
      const ground = this.surface?.sampleBaseHeight?.(placement.x, placement.z)
        ?? this.surface?.sampleHeight?.(placement.x, placement.z)
        ?? 0;
      const localX = placement.x - offsetX;
      const localZ = placement.z - offsetZ;
      root.position.copyFrom(new Vector3(localX, ground - 0.12 * placement.scale, localZ));
      shadow.position.set(localX + 0.42 * placement.scale, ground + 0.012, localZ - 0.16 * placement.scale);
    }
  }

  dispose() {
    for (const entry of this.instances) {
      entry.root.dispose();
      entry.shadow.dispose();
    }
    this.instances.length = 0;
    this.template?.dispose();
    this.template = null;
    this.shadowMaterial.dispose();
    this.shadowTexture.dispose();
  }
}
