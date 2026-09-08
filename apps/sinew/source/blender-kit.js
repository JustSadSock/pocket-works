import { Color3, Quaternion, SceneLoader, Vector3 } from '@babylonjs/core';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF';

const AXIS_Y = new Vector3(0, 1, 0);

function quatAxisTo(axis, direction) {
  const dir = direction.normalizeToNew();
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(axis, dir)));
  if (dot > .999999) return Quaternion.Identity();
  if (dot < -.999999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  const cross = Vector3.Cross(axis, dir);
  if (cross.lengthSquared() < 1e-8) return Quaternion.Identity();
  cross.normalize();
  return Quaternion.RotationAxis(cross, Math.acos(dot));
}

function detachImported(result) {
  for (const mesh of result.meshes) {
    if (mesh.name === '__root__') continue;
    mesh.setParent(null, true);
  }
  for (const node of result.transformNodes || []) {
    if (node.name === '__root__') continue;
    node.setParent(null, true);
  }
  result.meshes.find((mesh) => mesh.name === '__root__')?.dispose(false, true);
}

function tintFaction(result, warrior) {
  const faction = warrior.isPlayer ? Color3.FromHexString('#315f9d') : Color3.FromHexString('#8f3427');
  for (const mesh of result.meshes) {
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial)) continue;
    mat.environmentIntensity = .58;
    mat.directIntensity = 1.05;
    mat.specularIntensity = .62;
    if (/OxideRed/i.test(mat.name)) mat.albedoColor = faction;
  }
}

function shadow(game, mesh) {
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  game.world?.shadowGenerator?.addShadowCaster(mesh);
}

function syncRigid(mesh, target, scale = 1) {
  if (!mesh || !target) return;
  mesh.position.copyFrom(target.position);
  if (target.rotationQuaternion) mesh.rotationQuaternion = target.rotationQuaternion.clone();
  else mesh.rotationQuaternion = Quaternion.FromEulerAngles(target.rotation.x, target.rotation.y, target.rotation.z);
  mesh.scaling.setAll(scale);
}

function syncSegment(mesh, a, b, authoredLength, widthScale = 1) {
  if (!mesh) return;
  const delta = b.subtract(a);
  const length = Math.max(.001, delta.length());
  mesh.position.copyFrom(a.add(b).scale(.5));
  mesh.rotationQuaternion = quatAxisTo(AXIS_Y, delta);
  mesh.scaling.set(widthScale, length / authoredLength, widthScale);
}

async function loadWarriorKit(game, warrior) {
  const result = await SceneLoader.ImportMeshAsync('', './models/', 'sinew-combat-kit.glb', game.scene);
  detachImported(result);
  tintFaction(result, warrior);
  result.meshes.forEach((mesh) => shadow(game, mesh));

  const find = (name) => result.meshes.find((mesh) => mesh.name === name) || null;
  const parts = {
    chest: find('Kit_ChestPlate'),
    band: find('Kit_ChestBand'),
    tabard: find('Kit_Tabard'),
    helmet: find('Kit_Helmet'),
    helmetCone: find('Kit_HelmetCone'),
    nasal: find('Kit_Nasal'),
    crest: find('Kit_Crest'),
    pauldronL: find('Kit_PauldronL'),
    pauldronR: find('Kit_PauldronR'),
    greaveL: find('Kit_Greave'),
    greaveR: null,
    bootL: find('Kit_Boot'),
    bootR: null
  };

  if (parts.greaveL) parts.greaveR = parts.greaveL.clone(`${warrior.id}:blender-greave-r`);
  if (parts.bootL) parts.bootR = parts.bootL.clone(`${warrior.id}:blender-boot-r`);
  if (parts.greaveR) shadow(game, parts.greaveR);
  if (parts.bootR) shadow(game, parts.bootR);

  // Decorative source chips and weapon/shield prototypes stay disabled until a future
  // physical-visual calibration pass; armor is already production Blender geometry.
  for (const mesh of result.meshes) {
    if (mesh.name.startsWith('Kit_Color') || mesh.name.startsWith('Kit_Blade') || mesh.name === 'Kit_Guard' || mesh.name === 'Kit_Grip' || mesh.name === 'Kit_Pommel' || mesh.name.startsWith('Kit_Shield')) mesh.setEnabled(false);
  }

  warrior.meshes.chestPlate.setEnabled(false);
  if (!warrior.isPlayer) warrior.meshes.helmet.setEnabled(false);

  const update = () => {
    const chest = warrior.bones.chest.getAbsolutePosition();
    const head = warrior.bones.head.getAbsolutePosition();
    const shoulderL = warrior.bones.shoulderL.getAbsolutePosition();
    const shoulderR = warrior.bones.shoulderR.getAbsolutePosition();
    const kneeL = warrior.bones.kneeL.getAbsolutePosition();
    const kneeR = warrior.bones.kneeR.getAbsolutePosition();
    const footL = warrior.bones.footL.getAbsolutePosition();
    const footR = warrior.bones.footR.getAbsolutePosition();
    const upperQuat = Quaternion.RotationAxis(AXIS_Y, warrior.upperYaw);
    const bodyQuat = Quaternion.RotationAxis(AXIS_Y, warrior.bodyYaw);

    for (const mesh of [parts.chest, parts.band, parts.tabard]) {
      if (!mesh) continue;
      mesh.position.copyFrom(chest);
      mesh.rotationQuaternion = upperQuat.clone();
      mesh.scaling.setAll(1);
    }
    if (parts.band) parts.band.position.y -= .18;
    if (parts.tabard) {
      parts.tabard.position.y -= .18;
      const forward = new Vector3(Math.sin(warrior.upperYaw), 0, Math.cos(warrior.upperYaw));
      parts.tabard.position.addInPlace(forward.scale(.11));
    }

    for (const mesh of [parts.helmet, parts.helmetCone, parts.nasal, parts.crest]) {
      if (!mesh) continue;
      mesh.position.copyFrom(head);
      mesh.rotationQuaternion = upperQuat.clone();
      mesh.scaling.setAll(1);
      mesh.setEnabled(!warrior.isPlayer);
    }
    if (parts.helmet) parts.helmet.position.y += .06;
    if (parts.helmetCone) parts.helmetCone.position.y += .23;
    if (parts.nasal) {
      const forward = new Vector3(Math.sin(warrior.upperYaw), 0, Math.cos(warrior.upperYaw));
      parts.nasal.position.addInPlace(forward.scale(.13));
      parts.nasal.position.y -= .035;
    }
    if (parts.crest) parts.crest.position.y += .27;

    if (parts.pauldronL) {
      parts.pauldronL.position.copyFrom(shoulderL);
      parts.pauldronL.rotationQuaternion = upperQuat.clone();
    }
    if (parts.pauldronR) {
      parts.pauldronR.position.copyFrom(shoulderR);
      parts.pauldronR.rotationQuaternion = upperQuat.clone();
    }

    syncSegment(parts.greaveL, kneeL, footL, .33, .95);
    syncSegment(parts.greaveR, kneeR, footR, .33, .95);
    if (parts.bootL) {
      parts.bootL.position.copyFrom(footL.add(new Vector3(0, .01, 0)));
      parts.bootL.rotationQuaternion = bodyQuat.clone();
    }
    if (parts.bootR) {
      parts.bootR.position.copyFrom(footR.add(new Vector3(0, .01, 0)));
      parts.bootR.rotationQuaternion = bodyQuat.clone();
    }
  };

  update();
  return { update, dispose: () => result.meshes.forEach((mesh) => mesh.dispose()) };
}

export async function installBlenderCombatKit(game) {
  document.documentElement.dataset.sinewBlender = 'loading';
  try {
    const kits = await Promise.all([loadWarriorKit(game, game.player), loadWarriorKit(game, game.enemy)]);
    const originalUpdate = game.update.bind(game);
    game.update = (dt, nowSeconds) => {
      originalUpdate(dt, nowSeconds);
      for (const kit of kits) kit.update();
    };
    document.documentElement.dataset.sinewBlender = 'ready';
    return { dispose: () => kits.forEach((kit) => kit.dispose()) };
  } catch (error) {
    console.warn('[SINEW] Blender combat kit unavailable; keeping procedural fallback.', error);
    document.documentElement.dataset.sinewBlender = 'fallback';
    return null;
  }
}
