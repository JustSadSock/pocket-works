import { Color3, DynamicTexture, MeshBuilder, Quaternion, StandardMaterial, Vector3 } from '@babylonjs/core';

const UP = new Vector3(0, 1, 0);

function makeShadowTexture(scene) {
  const texture = new DynamicTexture('bedouin-contact-shadow-texture', { width: 160, height: 160 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(80, 80, 7, 80, 80, 77);
  gradient.addColorStop(0, 'rgba(0,0,0,0.80)');
  gradient.addColorStop(0.22, 'rgba(0,0,0,0.54)');
  gradient.addColorStop(0.52, 'rgba(0,0,0,0.24)');
  gradient.addColorStop(0.80, 'rgba(0,0,0,0.07)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.clearRect(0, 0, 160, 160);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 160);
  texture.update();
  return texture;
}

function slopeQuaternion(normal, yaw) {
  const n = new Vector3(normal.x, normal.y, normal.z).normalize();
  const axis = Vector3.Cross(UP, n);
  const axisLength = axis.length();
  const tilt = axisLength < 1e-5
    ? Quaternion.Identity()
    : Quaternion.RotationAxis(axis.scale(1 / axisLength), Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(UP, n)))));
  const localYaw = Quaternion.RotationAxis(UP, yaw);
  return tilt.multiply(localYaw);
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
    this.material.alpha = 0.50;
    this.material.backFaceCulling = false;
    this.material.zOffset = -3;

    this.mesh = MeshBuilder.CreateGround('bedouin-contact-shadow', { width: 0.82, height: 1.18, subdivisions: 1 }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    this.mesh.renderingGroupId = 1;
    this.mesh.rotationQuaternion = Quaternion.Identity();
  }

  update(controller) {
    const lead = 0.10;
    const fx = Math.sin(controller.bodyYaw);
    const fz = Math.cos(controller.bodyYaw);
    const gx = controller.globalX + fx * lead;
    const gz = controller.globalZ + fz * lead;
    const normal = this.surface.sampleNormal(gx, gz);
    const y = this.surface.sampleHeight(gx, gz) + 0.022;
    this.mesh.position.set(
      controller.localPosition.x + fx * lead,
      y,
      controller.localPosition.z + fz * lead
    );
    this.mesh.rotationQuaternion = slopeQuaternion(normal, controller.bodyYaw);
    const speed = Math.min(1, controller.speed / 3.0);
    this.mesh.scaling.x = 0.94 + speed * 0.08;
    this.mesh.scaling.z = 0.94 + speed * 0.14;
    this.material.alpha = 0.50 - speed * 0.06;
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
