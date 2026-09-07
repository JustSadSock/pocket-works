import { Color3, DynamicTexture, MeshBuilder, StandardMaterial } from '@babylonjs/core';

function makeShadowTexture(scene) {
  const texture = new DynamicTexture('bedouin-contact-shadow-texture', { width: 128, height: 128 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  gradient.addColorStop(0.32, 'rgba(0,0,0,0.34)');
  gradient.addColorStop(0.72, 'rgba(0,0,0,0.11)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  texture.update();
  return texture;
}

export class CharacterContactShadow {
  constructor(scene, surface) {
    this.scene = scene;
    this.surface = surface;
    this.texture = makeShadowTexture(scene);
    this.material = new StandardMaterial('bedouin-contact-shadow-material', scene);
    this.material.diffuseTexture = this.texture;
    this.material.useAlphaFromDiffuseTexture = true;
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.emissiveColor = Color3.Black();
    this.material.disableLighting = true;
    this.material.alpha = 0.42;
    this.material.backFaceCulling = false;
    this.material.zOffset = -2;

    this.mesh = MeshBuilder.CreateGround('bedouin-contact-shadow', { width: 0.82, height: 1.22, subdivisions: 1 }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    this.mesh.renderingGroupId = 1;
  }

  update(controller) {
    const gx = controller.globalX;
    const gz = controller.globalZ;
    const y = this.surface.sampleHeight(gx, gz) + 0.010;
    this.mesh.position.set(controller.localPosition.x, y, controller.localPosition.z);
    this.mesh.rotation.y = controller.bodyYaw;
    const speed = Math.min(1, controller.speed / 3.0);
    this.mesh.scaling.x = 0.92 + speed * 0.12;
    this.mesh.scaling.z = 0.92 + speed * 0.18;
    this.material.alpha = 0.38 - speed * 0.06;
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
