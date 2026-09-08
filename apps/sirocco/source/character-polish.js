import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, Texture } from '@babylonjs/core';

function makeWeaveTexture(scene, name, contrast = 0.10) {
  const texture = new DynamicTexture(name, { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = `rgba(70,55,38,${contrast})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 64; i += 4) {
    ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(64, i + 0.5); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(95,72,48,0.05)';
  for (let y = 1; y < 64; y += 8) {
    for (let x = 3; x < 64; x += 8) ctx.fillRect(x, y, 2, 1);
  }
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 5.5;
  texture.vScale = 5.5;
  return texture;
}

function makeLeatherTexture(scene) {
  const texture = new DynamicTexture('bedouin-leather-grain', { width: 48, height: 48 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#f5efe8';
  ctx.fillRect(0, 0, 48, 48);
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 17) % 48;
    const y = (i * 29) % 48;
    const alpha = 0.035 + ((i * 13) % 8) * 0.004;
    ctx.fillStyle = `rgba(55,35,20,${alpha})`;
    ctx.fillRect(x, y, 1 + (i % 2), 1);
  }
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 4;
  texture.vScale = 4;
  return texture;
}

function material(scene, name, color, roughness) {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color;
  mat.metallic = 0;
  mat.roughness = roughness;
  return mat;
}

function angleDelta(a, b) {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

export class BedouinVisualPolish {
  constructor(scene, rig) {
    this.scene = scene;
    this.rig = rig;
    this.meshes = [];
    this.materials = [];
    this.textures = [];
    this.time = 0;
    this.cosmeticsVisible = true;
  }

  init() {
    const linenWeave = makeWeaveTexture(this.scene, 'bedouin-linen-weave', 0.085);
    const sashWeave = makeWeaveTexture(this.scene, 'bedouin-sash-weave', 0.13);
    const leatherGrain = makeLeatherTexture(this.scene);
    this.textures.push(linenWeave, sashWeave, leatherGrain);

    // Upgrade the existing clothing instead of stacking another expensive skin.
    for (const mat of this.rig.materials || []) {
      if (!('albedoTexture' in mat)) continue;
      if (/linen|thobe/i.test(mat.name)) {
        mat.albedoTexture = linenWeave;
        if ('microSurface' in mat) mat.microSurface = 0.12;
      } else if (/sash/i.test(mat.name)) {
        mat.albedoTexture = sashWeave;
      } else if (/leather/i.test(mat.name)) {
        mat.albedoTexture = leatherGrain;
        mat.roughness = 0.88;
      }
    }

    const darkLeather = material(this.scene, 'bedouin-polish-leather', new Color3(0.115, 0.060, 0.028), 0.91);
    const clothShadow = material(this.scene, 'bedouin-polish-shadow-cloth', new Color3(0.48, 0.40, 0.31), 0.99);
    const brass = material(this.scene, 'bedouin-polish-aged-brass', new Color3(0.34, 0.22, 0.08), 0.72);
    brass.metallic = 0.35;
    darkLeather.albedoTexture = leatherGrain;
    clothShadow.albedoTexture = linenWeave;
    this.materials.push(darkLeather, clothShadow, brass);

    const add = (mesh, mat) => {
      mesh.parent = this.rig.root;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.meshes.push(mesh);
      return mesh;
    };

    this.strap = add(MeshBuilder.CreateBox('bedouin-crossbody-strap', {
      width: 0.052, height: 0.78, depth: 0.028
    }, this.scene), darkLeather);
    this.strap.position.set(0.035, 1.20, 0.265);
    this.strap.rotation.z = -0.43;

    this.pouch = add(MeshBuilder.CreateBox('bedouin-belt-pouch', {
      width: 0.19, height: 0.15, depth: 0.105
    }, this.scene), darkLeather);
    this.pouch.position.set(0.27, 0.91, 0.10);
    this.pouch.rotation.y = -0.16;

    const clasp = add(MeshBuilder.CreateCylinder('bedouin-pouch-clasp', {
      height: 0.018, diameter: 0.035, tessellation: 12
    }, this.scene), brass);
    clasp.position.set(0.27, 0.93, 0.158);
    clasp.rotation.x = Math.PI * 0.5;

    this.waterSkin = add(MeshBuilder.CreateSphere('bedouin-water-skin', { diameter: 0.19, segments: 12 }, this.scene), darkLeather);
    this.waterSkin.scaling.set(0.78, 1.28, 0.58);
    this.waterSkin.position.set(-0.28, 0.83, 0.02);

    this.gores = [];
    for (const side of [-1, 1]) {
      const gore = add(MeshBuilder.CreateBox(`bedouin-robe-gore-${side}`, {
        width: 0.13, height: 0.64, depth: 0.030
      }, this.scene), clothShadow);
      gore.position.set(side * 0.245, 0.58, 0.145);
      gore.rotation.z = side * 0.035;
      this.gores.push(gore);
    }

    this.shoulderDrape = add(MeshBuilder.CreateBox('bedouin-shoulder-drape', {
      width: 0.50, height: 0.19, depth: 0.035
    }, this.scene), clothShadow);
    this.shoulderDrape.position.set(0, 1.43, -0.245);
    this.shoulderDrape.rotation.x = -0.10;
  }

  setCosmeticsVisible(visible) {
    if (this.cosmeticsVisible === visible) return;
    this.cosmeticsVisible = visible;
    for (const mesh of this.meshes) mesh.setEnabled(visible);
  }

  update(controller, dt) {
    this.time += dt;

    // The animated body intentionally lags camera yaw for weight. During a very
    // fast turn + steep look-down that can put any rigid cosmetic attached to
    // the torso between the eye and the body for a few frames. Hide only this
    // cheap detail layer in that extreme pose; the skinned character remains.
    const yawDivergence = Math.abs(angleDelta(controller.yaw, controller.bodyYaw));
    const cameraSafe = yawDivergence < 0.72 && controller.pitch < 0.88;
    this.setCosmeticsVisible(cameraSafe);
    if (!cameraSafe) return;

    const speed = Math.min(1, controller.speed / 3);
    if (this.pouch) this.pouch.rotation.z = Math.sin(this.time * 3.2 + controller.gait) * 0.035 * speed;
    if (this.waterSkin) this.waterSkin.rotation.z = -0.08 + Math.sin(this.time * 2.4 + 0.7) * 0.045 * speed;
    for (let i = 0; i < this.gores.length; i += 1) {
      this.gores[i].rotation.x = Math.sin(controller.gait + i * Math.PI) * 0.025 * speed;
    }
  }

  dispose() {
    for (const mesh of this.meshes) mesh.dispose();
    for (const mat of this.materials) mat.dispose();
    for (const texture of this.textures) texture.dispose();
    this.meshes.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
