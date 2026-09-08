import { Color3, DynamicTexture, MeshBuilder, StandardMaterial } from '@babylonjs/core';

function makeShadowTexture(scene) {
  const texture = new DynamicTexture('bedouin-contact-shadow-texture', { width: 160, height: 160 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(80, 80, 7, 80, 80, 77);
  gradient.addColorStop(0, 'rgba(0,0,0,0.82)');
  gradient.addColorStop(0.22, 'rgba(0,0,0,0.56)');
  gradient.addColorStop(0.52, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(0.80, 'rgba(0,0,0,0.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.clearRect(0, 0, 160, 160);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 160);
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
    this.material.alpha = 0.54;
    this.material.backFaceCulling = false;
    this.material.zOffset = -2;

    this.mesh = MeshBuilder.CreateGround('bedouin-contact-shadow', { width: 0.86, height: 1.28, subdivisions: 1 }, scene);
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
    this.mesh.scaling.x = 0.94 + speed * 0.10;
    this.mesh.scaling.z = 0.94 + speed * 0.16;
    this.material.alpha = 0.52 - speed * 0.07;
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
