import { Color3, Quaternion, SceneLoader, Vector3 } from '@babylonjs/core';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF';

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

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
    mat.environmentIntensity = .86;
    mat.directIntensity = 1.18;
    mat.specularIntensity = .82;
    if (/OxideRed/i.test(mat.name)) mat.albedoColor = faction;
    else if (/DarkSteel/i.test(mat.name)) {
      mat.albedoColor = Color3.FromHexString('#586267');
      mat.metallic = .55;
      mat.roughness = .40;
    } else if (/^Steel/i.test(mat.name)) {
      mat.albedoColor = Color3.FromHexString('#a3adb2');
      mat.metallic = warrior.isPlayer ? .42 : .52;
      mat.roughness = warrior.isPlayer ? .38 : .32;
    }
  }
}

function shadow(game, mesh) {
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  game.world?.shadowGenerator?.addShadowCaster(mesh);
}

function syncSegment(mesh, a, b, authoredLength, axis = AXIS_Y, widthScale = 1) {
  if (!mesh) return;
  const delta = b.subtract(a);
  const length = Math.max(.001, delta.length());
  mesh.position.copyFrom(a.add(b).scale(.5));
  mesh.rotationQuaternion = quatAxisTo(axis, delta);
  if (axis === AXIS_Z) mesh.scaling.set(widthScale, widthScale, length / authoredLength);
  else mesh.scaling.set(widthScale, length / authoredLength, widthScale);
}

function syncShieldPart(mesh, center, normal, scale, normalOffset = 0) {
  if (!mesh) return;
  mesh.position.copyFrom(center.add(normal.scale(normalOffset * scale)));
  mesh.rotationQuaternion = quatAxisTo(AXIS_Z, normal);
  mesh.scaling.setAll(scale);
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
    bootR: null,
    blade: find('Kit_Blade'),
    bladeRidge: find('Kit_Blade_Ridge'),
    guard: find('Kit_Guard'),
    grip: find('Kit_Grip'),
    pommel: find('Kit_Pommel'),
    shieldFace: find('Kit_ShieldFace'),
    shieldRim: find('Kit_ShieldRim'),
    shieldBoss: find('Kit_ShieldBoss'),
    shieldPaintRing: find('Kit_ShieldPaintRing'),
    shieldSlash: find('Kit_ShieldSlash')
  };

  if (parts.greaveL) parts.greaveR = parts.greaveL.clone(`${warrior.id}:blender-greave-r`);
  if (parts.bootL) parts.bootR = parts.bootL.clone(`${warrior.id}:blender-boot-r`);
  if (parts.greaveR) shadow(game, parts.greaveR);
  if (parts.bootR) shadow(game, parts.bootR);

  for (const mesh of result.meshes) if (mesh.name.startsWith('Kit_Color')) mesh.setEnabled(false);
  if (warrior.isPlayer && parts.bladeRidge) parts.bladeRidge.setEnabled(false);

  // First-person camera: chest/shoulder armor is physically close to the eye
  // and previously dominated the screen as giant black blobs. Keep Blender on
  // the player's weapon/shield and lower body, and reserve the full armor kit
  // for the opponent where its silhouette can actually be read.
  if (warrior.isPlayer) {
    for (const mesh of [parts.chest, parts.band, parts.tabard, parts.helmet, parts.helmetCone, parts.nasal, parts.crest, parts.pauldronL, parts.pauldronR]) {
      mesh?.setEnabled(false);
    }
  }

  if (parts.chest) warrior.meshes.chestPlate.setEnabled(false);
  if (parts.tabard) warrior.meshes.tabard.setEnabled(false);
  if (parts.helmet && !warrior.isPlayer) warrior.meshes.helmet.setEnabled(false);
  if (parts.blade) warrior.meshes.blade.setEnabled(false);
  if (parts.grip) warrior.meshes.grip.setEnabled(false);
  if (parts.guard) warrior.meshes.guard.setEnabled(false);
  if (parts.shieldFace) warrior.meshes.shield.setEnabled(false);
  if (parts.shieldRim) warrior.meshes.shieldRim.setEnabled(false);
  if (parts.shieldBoss) warrior.meshes.shieldBoss.setEnabled(false);

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

    if (!warrior.isPlayer) {
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

    if (parts.pauldronL && !warrior.isPlayer) {
      parts.pauldronL.position.copyFrom(shoulderL);
      parts.pauldronL.rotationQuaternion = upperQuat.clone();
    }
    if (parts.pauldronR && !warrior.isPlayer) {
      parts.pauldronR.position.copyFrom(shoulderR);
      parts.pauldronR.rotationQuaternion = upperQuat.clone();
    }

    syncSegment(parts.greaveL, kneeL, footL, .33, AXIS_Y, .95);
    syncSegment(parts.greaveR, kneeR, footR, .33, AXIS_Y, .95);
    if (parts.bootL) {
      parts.bootL.position.copyFrom(footL.add(new Vector3(0, .01, 0)));
      parts.bootL.rotationQuaternion = bodyQuat.clone();
    }
    if (parts.bootR) {
      parts.bootR.position.copyFrom(footR.add(new Vector3(0, .01, 0)));
      parts.bootR.rotationQuaternion = bodyQuat.clone();
    }

    const swordBase = warrior.sword.base;
    const swordTip = warrior.sword.tip;
    const swordDir = swordTip.subtract(swordBase).normalize();
    const bladeStart = swordBase.add(swordDir.scale(.10));
    const weaponWidth = warrior.isPlayer ? .36 : .82;
    syncSegment(parts.blade, bladeStart, swordTip, 1.0, AXIS_Z, weaponWidth);
    syncSegment(parts.bladeRidge, bladeStart.add(swordDir.scale(.04)), swordTip.subtract(swordDir.scale(.04)), .84, AXIS_Z, weaponWidth * .62);
    if (parts.guard) {
      parts.guard.position.copyFrom(swordBase.add(swordDir.scale(.015)));
      parts.guard.rotationQuaternion = quatAxisTo(AXIS_Z, swordDir);
      parts.guard.scaling.setAll(warrior.isPlayer ? .66 : .92);
    }
    syncSegment(parts.grip, swordBase.subtract(swordDir.scale(.18)), swordBase, 1.0, AXIS_Y, warrior.isPlayer ? .68 : .94);
    if (parts.pommel) {
      parts.pommel.position.copyFrom(swordBase.subtract(swordDir.scale(.205)));
      parts.pommel.scaling.setAll(warrior.isPlayer ? .68 : .94);
    }

    const shieldScale = warrior.shield.radius / .45;
    const shieldCenter = warrior.shield.center;
    const shieldNormal = warrior.shield.normal.normalizeToNew();
    syncShieldPart(parts.shieldFace, shieldCenter, shieldNormal, shieldScale, 0);
    syncShieldPart(parts.shieldRim, shieldCenter, shieldNormal, shieldScale, 0);
    syncShieldPart(parts.shieldBoss, shieldCenter, shieldNormal, shieldScale, .060);
    syncShieldPart(parts.shieldPaintRing, shieldCenter, shieldNormal, shieldScale, .038);
    syncShieldPart(parts.shieldSlash, shieldCenter, shieldNormal, shieldScale, .043);
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
