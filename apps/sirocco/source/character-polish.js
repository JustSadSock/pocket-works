import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, Texture } from '@babylonjs/core';

function makeWeaveTexture(scene, name, contrast = 0.10, patterned = false, base = '#f6f0e7') {
  const texture = new DynamicTexture(name, { width: 96, height: 96 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 96, 96);
  ctx.strokeStyle = `rgba(70,55,38,${contrast})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 96; i += 4) {
    ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, 96); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(96, i + 0.5); ctx.stroke();
  }
  const fade = ctx.createLinearGradient(0, 0, 96, 96);
  fade.addColorStop(0, 'rgba(255,244,220,0.08)');
  fade.addColorStop(0.55, 'rgba(120,86,51,0.02)');
  fade.addColorStop(1, 'rgba(102,71,43,0.10)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 96, 96);
  for (let i = 0; i < 120; i += 1) {
    const x = (i * 37) % 96, y = (i * 61) % 96;
    ctx.fillStyle = `rgba(92,65,39,${0.018 + (i % 5) * 0.005})`;
    ctx.fillRect(x, y, 1 + (i % 3 === 0 ? 1 : 0), 1);
  }
  if (patterned) {
    ctx.strokeStyle = 'rgba(72,28,20,0.30)';
    ctx.lineWidth = 2;
    for (let y = 8; y < 96; y += 16) {
      ctx.beginPath();
      for (let x = 0; x <= 96; x += 8) {
        const yy = y + ((x / 8) % 2 === 0 ? -3 : 3);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = patterned ? 3.4 : 5.2;
  texture.vScale = patterned ? 3.4 : 5.2;
  return texture;
}

function makeSkinTexture(scene) {
  const texture = new DynamicTexture('bedouin-skin-detail', { width: 96, height: 96 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#f1d6c1';
  ctx.fillRect(0, 0, 96, 96);
  const warmth = ctx.createRadialGradient(48, 42, 8, 48, 48, 64);
  warmth.addColorStop(0, 'rgba(255,225,205,0.12)');
  warmth.addColorStop(0.55, 'rgba(183,105,67,0.035)');
  warmth.addColorStop(1, 'rgba(104,62,42,0.09)');
  ctx.fillStyle = warmth;
  ctx.fillRect(0, 0, 96, 96);
  for (let i = 0; i < 180; i += 1) {
    const x = (i * 43 + 11) % 96;
    const y = (i * 67 + 7) % 96;
    const alpha = 0.012 + (i % 7) * 0.003;
    ctx.fillStyle = i % 3 === 0 ? `rgba(91,51,34,${alpha})` : `rgba(255,228,207,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 2.2;
  texture.vScale = 2.2;
  return texture;
}

function makeLeatherTexture(scene) {
  const texture = new DynamicTexture('bedouin-leather-grain', { width: 64, height: 64 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#f0e8dc';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 150; i += 1) {
    const x = (i * 17) % 64, y = (i * 29) % 64;
    const alpha = 0.030 + ((i * 13) % 8) * 0.005;
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
    this.firstPersonMeshes = [];
    this.rigUnsafeGarments = [];
    this.materials = [];
    this.textures = [];
    this.time = 0;
    this.cosmeticsVisible = true;
    this.skinVisible = true;
    this.rigGarmentsVisible = true;
  }

  init() {
    const linenWeave = makeWeaveTexture(this.scene, 'bedouin-linen-weave', 0.075, false, '#f5eee1');
    const sashWeave = makeWeaveTexture(this.scene, 'bedouin-sash-weave', 0.11, true, '#ead6c8');
    const keffiyehWeave = makeWeaveTexture(this.scene, 'bedouin-keffiyeh-weave', 0.09, true, '#f2e8dd');
    const leatherGrain = makeLeatherTexture(this.scene);
    const skinDetail = makeSkinTexture(this.scene);
    this.textures.push(linenWeave, sashWeave, keffiyehWeave, leatherGrain, skinDetail);

    for (const mat of this.rig.materials || []) {
      if (!('albedoTexture' in mat)) continue;
      if (/skin/i.test(mat.name)) {
        mat.albedoTexture = skinDetail;
        mat.roughness = 0.86;
      } else if (/linen|thobe/i.test(mat.name)) {
        mat.albedoTexture = linenWeave;
        mat.roughness = 0.985;
        if ('microSurface' in mat) mat.microSurface = 0.10;
      } else if (/sash/i.test(mat.name)) {
        mat.albedoTexture = sashWeave;
        mat.roughness = 0.96;
      } else if (/leather/i.test(mat.name)) {
        mat.albedoTexture = leatherGrain;
        mat.roughness = 0.88;
      }
    }

    const darkLeather = material(this.scene, 'bedouin-polish-leather', new Color3(0.115, 0.060, 0.028), 0.91);
    const clothShadow = material(this.scene, 'bedouin-polish-shadow-cloth', new Color3(0.48, 0.40, 0.31), 0.99);
    const redCloth = material(this.scene, 'bedouin-polish-patterned-red', new Color3(0.44, 0.075, 0.045), 0.97);
    const headCloth = material(this.scene, 'bedouin-polish-keffiyeh', new Color3(0.82, 0.72, 0.62), 0.985);
    const firstPersonLinen = material(this.scene, 'bedouin-first-person-linen', new Color3(0.88, 0.82, 0.70), 0.99);
    const firstPersonSash = material(this.scene, 'bedouin-first-person-sash', new Color3(0.40, 0.065, 0.040), 0.97);
    const brass = material(this.scene, 'bedouin-polish-aged-brass', new Color3(0.34, 0.22, 0.08), 0.72);
    brass.metallic = 0.35;
    darkLeather.albedoTexture = leatherGrain;
    clothShadow.albedoTexture = linenWeave;
    redCloth.albedoTexture = sashWeave;
    headCloth.albedoTexture = keffiyehWeave;
    firstPersonLinen.albedoTexture = linenWeave;
    firstPersonSash.albedoTexture = sashWeave;
    firstPersonLinen.backFaceCulling = false;
    firstPersonSash.backFaceCulling = false;
    this.materials.push(darkLeather, clothShadow, redCloth, headCloth, firstPersonLinen, firstPersonSash, brass);

    const add = (mesh, mat) => {
      mesh.parent = this.rig.root;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.meshes.push(mesh);
      return mesh;
    };
    const addFirstPerson = (mesh, mat) => {
      mesh.parent = this.rig.root;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.setEnabled(false);
      this.firstPersonMeshes.push(mesh);
      return mesh;
    };

    this.strap = add(MeshBuilder.CreateBox('bedouin-crossbody-strap', { width: 0.052, height: 0.78, depth: 0.028 }, this.scene), darkLeather);
    this.strap.position.set(0.035, 1.20, 0.265);
    this.strap.rotation.z = -0.43;

    this.pouch = add(MeshBuilder.CreateBox('bedouin-belt-pouch', { width: 0.19, height: 0.15, depth: 0.105 }, this.scene), darkLeather);
    this.pouch.position.set(0.27, 0.91, 0.10);
    this.pouch.rotation.y = -0.16;

    const clasp = add(MeshBuilder.CreateCylinder('bedouin-pouch-clasp', { height: 0.018, diameter: 0.035, tessellation: 12 }, this.scene), brass);
    clasp.position.set(0.27, 0.93, 0.158);
    clasp.rotation.x = Math.PI * 0.5;

    this.waterSkin = add(MeshBuilder.CreateSphere('bedouin-water-skin', { diameter: 0.19, segments: 12 }, this.scene), darkLeather);
    this.waterSkin.scaling.set(0.78, 1.28, 0.58);
    this.waterSkin.position.set(-0.28, 0.83, 0.02);

    this.gores = [];
    for (const side of [-1, 1]) {
      const gore = add(MeshBuilder.CreateBox(`bedouin-robe-gore-${side}`, { width: 0.13, height: 0.64, depth: 0.030 }, this.scene), clothShadow);
      gore.position.set(side * 0.245, 0.58, 0.145);
      gore.rotation.z = side * 0.035;
      this.gores.push(gore);
    }

    this.shoulderDrape = add(MeshBuilder.CreateBox('bedouin-shoulder-drape', { width: 0.50, height: 0.19, depth: 0.035 }, this.scene), headCloth);
    this.shoulderDrape.position.set(0, 1.43, -0.245);
    this.shoulderDrape.rotation.x = -0.10;

    this.scarfLayer = add(MeshBuilder.CreateBox('bedouin-patterned-scarf-layer', { width: 0.36, height: 0.38, depth: 0.024 }, this.scene), redCloth);
    this.scarfLayer.position.set(-0.08, 1.34, -0.262);
    this.scarfLayer.rotation.z = 0.10;

    this.beltWrap = add(MeshBuilder.CreateTorus('bedouin-layered-sash-wrap', { diameter: 0.53, thickness: 0.022, tessellation: 24 }, this.scene), redCloth);
    this.beltWrap.position.y = 0.90;

    this.firstPersonChest = addFirstPerson(MeshBuilder.CreatePlane('bedouin-first-person-thobe-front', {
      width: 0.46, height: 0.54
    }, this.scene), firstPersonLinen);
    this.firstPersonChest.position.set(0, 1.12, 0.305);
    this.firstPersonChest.rotation.x = -0.18;

    this.firstPersonSash = addFirstPerson(MeshBuilder.CreatePlane('bedouin-first-person-sash-front', {
      width: 0.41, height: 0.07
    }, this.scene), firstPersonSash);
    this.firstPersonSash.position.set(0, 0.91, 0.310);
    this.firstPersonSash.rotation.x = -0.18;

    this.rigUnsafeGarments = (this.rig.garments || []).filter((mesh) =>
      /thobe-upper|thobe-lower|thobe-front-fold|waist-sash|keffiyeh-collar|keffiyeh-headband|keffiyeh-tail/i.test(mesh.name)
    );
  }

  setCosmeticsVisible(visible) {
    if (this.cosmeticsVisible === visible) return;
    this.cosmeticsVisible = visible;
    for (const mesh of this.meshes) mesh.setEnabled(visible);
  }

  setFirstPersonVisible(visible) {
    for (const mesh of this.firstPersonMeshes) mesh.setEnabled(visible);
  }

  setSkinVisible(visible) {
    if (this.skinVisible === visible) return;
    this.skinVisible = visible;
    for (const mesh of this.rig.meshes || []) mesh.setEnabled(visible);
  }

  setRigGarmentsVisible(visible) {
    if (this.rigGarmentsVisible === visible) return;
    this.rigGarmentsVisible = visible;
    for (const mesh of this.rigUnsafeGarments) mesh.setEnabled(visible);
  }

  update(controller, dt) {
    this.time += dt;
    const yawDivergence = Math.abs(angleDelta(controller.yaw, controller.bodyYaw));
    const cameraSafe = yawDivergence < 0.56 && controller.pitch < 0.40;
    this.setCosmeticsVisible(cameraSafe);

    const firstPersonSafe = yawDivergence < 0.72 && controller.pitch >= 0.38 && controller.pitch < 0.90;
    this.setFirstPersonVisible(firstPersonSafe);
    this.setRigGarmentsVisible(controller.pitch < 0.38 && yawDivergence < 0.56);

    const skinSafe = controller.pitch < 0.88 && yawDivergence < 0.95;
    this.setSkinVisible(skinSafe);

    if (firstPersonSafe) {
      const speed = Math.min(1, controller.speed / 3);
      this.firstPersonChest.position.y = 1.12 + Math.sin(controller.gait * 2) * 0.004 * speed;
      this.firstPersonChest.rotation.z = Math.sin(controller.gait) * 0.010 * speed;
      this.firstPersonSash.rotation.z = this.firstPersonChest.rotation.z * 0.75;
    }

    if (!cameraSafe) return;
    const speed = Math.min(1, controller.speed / 3);
    const softness = controller.softness ?? 0.48;
    const looseSway = 0.80 + softness * 0.45;
    if (this.pouch) this.pouch.rotation.z = Math.sin(this.time * 3.2 + controller.gait) * 0.032 * speed * looseSway;
    if (this.waterSkin) this.waterSkin.rotation.z = -0.08 + Math.sin(this.time * 2.4 + 0.7) * 0.042 * speed * looseSway;
    for (let i = 0; i < this.gores.length; i += 1) this.gores[i].rotation.x = Math.sin(controller.gait + i * Math.PI) * 0.023 * speed * looseSway;
    if (this.scarfLayer) this.scarfLayer.rotation.x = -0.02 + Math.sin(this.time * 2.0 + controller.gait * 0.35) * 0.018 * speed;
  }

  dispose() {
    for (const mesh of this.meshes) mesh.dispose();
    for (const mesh of this.firstPersonMeshes) mesh.dispose();
    for (const mat of this.materials) mat.dispose();
    for (const texture of this.textures) texture.dispose();
    this.meshes.length = 0;
    this.firstPersonMeshes.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
