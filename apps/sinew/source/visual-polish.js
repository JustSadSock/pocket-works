import { MeshBuilder, Quaternion, Vector3 } from '@babylonjs/core';

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

function setSegment(mesh, a, b, axis = AXIS_Y) {
  const delta = b.subtract(a);
  const length = Math.max(.001, delta.length());
  mesh.position.copyFrom(a.add(b).scale(.5));
  mesh.rotationQuaternion = quatAxisTo(axis, delta);
  if (axis === AXIS_Y) mesh.scaling.set(1, length, 1);
  else mesh.scaling.set(1, 1, length);
}

function makeExtras(game, warrior) {
  const scene = game.scene;
  const meshes = {};
  const add = (mesh) => {
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    game.world?.shadowGenerator?.addShadowCaster(mesh);
    return mesh;
  };

  meshes.handL = add(MeshBuilder.CreateSphere(`${warrior.id}:handL-detail`, { diameter: .12, segments: 8 }, scene));
  meshes.handR = add(MeshBuilder.CreateSphere(`${warrior.id}:handR-detail`, { diameter: .12, segments: 8 }, scene));
  meshes.handL.material = warrior.materials.leather;
  meshes.handR.material = warrior.materials.leather;
  meshes.belt = add(MeshBuilder.CreateTorus(`${warrior.id}:belt`, { diameter: .42, thickness: .045, tessellation: 16 }, scene));
  meshes.belt.material = warrior.materials.leather;
  meshes.belt.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
  meshes.shieldHandle = add(MeshBuilder.CreateCylinder(`${warrior.id}:shield-handle`, { height: 1, diameter: .038, tessellation: 8 }, scene));
  meshes.shieldHandle.material = warrior.materials.darkSteel;
  meshes.shieldHandle.rotationQuaternion = Quaternion.Identity();

  meshes.bootL = add(MeshBuilder.CreateBox(`${warrior.id}:bootL-detail`, { width: .16, height: .10, depth: .30 }, scene));
  meshes.bootR = add(MeshBuilder.CreateBox(`${warrior.id}:bootR-detail`, { width: .16, height: .10, depth: .30 }, scene));
  meshes.bootL.material = warrior.materials.leather;
  meshes.bootR.material = warrior.materials.leather;
  meshes.pauldronL = add(MeshBuilder.CreateSphere(`${warrior.id}:pauldronL`, { diameter: .22, segments: 8 }, scene));
  meshes.pauldronR = add(MeshBuilder.CreateSphere(`${warrior.id}:pauldronR`, { diameter: .22, segments: 8 }, scene));
  meshes.pauldronL.material = warrior.materials.darkSteel;
  meshes.pauldronR.material = warrior.materials.darkSteel;
  meshes.pauldronL.scaling.set(1.25, .56, 1);
  meshes.pauldronR.scaling.set(1.25, .56, 1);
  meshes.pommel = add(MeshBuilder.CreateSphere(`${warrior.id}:pommel`, { diameter: .075, segments: 8 }, scene));
  meshes.pommel.material = warrior.materials.darkSteel;
  meshes.shieldPaint = add(MeshBuilder.CreateCylinder(`${warrior.id}:shield-painted-field`, { diameter: .70, height: .008, tessellation: 24 }, scene));
  meshes.shieldPaint.material = warrior.materials.accent;
  meshes.shieldPaint.rotationQuaternion = Quaternion.Identity();

  if (!warrior.isPlayer) {
    meshes.cheekL = add(MeshBuilder.CreateBox(`${warrior.id}:cheekL`, { width: .055, height: .20, depth: .12 }, scene));
    meshes.cheekR = add(MeshBuilder.CreateBox(`${warrior.id}:cheekR`, { width: .055, height: .20, depth: .12 }, scene));
    meshes.cheekL.material = warrior.materials.darkSteel;
    meshes.cheekR.material = warrior.materials.darkSteel;
  }

  const fallbackOnly = [
    meshes.bootL, meshes.bootR, meshes.pauldronL, meshes.pauldronR,
    meshes.pommel, meshes.shieldPaint, meshes.cheekL, meshes.cheekR
  ].filter(Boolean);

  const setBlenderKitActive = (active) => {
    for (const mesh of fallbackOnly) mesh.setEnabled(!active);
  };

  const update = () => {
    const handL = warrior.bones.handL.getAbsolutePosition();
    const handR = warrior.bones.handR.getAbsolutePosition();
    const shoulderL = warrior.bones.shoulderL.getAbsolutePosition();
    const shoulderR = warrior.bones.shoulderR.getAbsolutePosition();
    const footL = warrior.bones.footL.getAbsolutePosition();
    const footR = warrior.bones.footR.getAbsolutePosition();
    const pelvis = warrior.bones.pelvis.getAbsolutePosition();
    const forward = new Vector3(Math.sin(warrior.bodyYaw), 0, Math.cos(warrior.bodyYaw));
    const right = new Vector3(Math.cos(warrior.bodyYaw), 0, -Math.sin(warrior.bodyYaw));

    meshes.handL.position.copyFrom(handL);
    meshes.handR.position.copyFrom(handR);
    meshes.belt.position.copyFrom(pelvis.add(new Vector3(0, .08, 0)));
    meshes.belt.rotation.z = -warrior.bodyYaw;

    if (meshes.pauldronL.isEnabled()) meshes.pauldronL.position.copyFrom(shoulderL.add(new Vector3(0, .025, 0)));
    if (meshes.pauldronR.isEnabled()) meshes.pauldronR.position.copyFrom(shoulderR.add(new Vector3(0, .025, 0)));
    if (meshes.bootL.isEnabled()) {
      meshes.bootL.position.copyFrom(footL.add(forward.scale(.07)).add(new Vector3(0, -.025, 0)));
      meshes.bootL.rotation.y = warrior.bodyYaw;
    }
    if (meshes.bootR.isEnabled()) {
      meshes.bootR.position.copyFrom(footR.add(forward.scale(.07)).add(new Vector3(0, -.025, 0)));
      meshes.bootR.rotation.y = warrior.bodyYaw;
    }

    const swordDir = warrior.sword.tip.subtract(warrior.sword.base).normalize();
    if (meshes.pommel.isEnabled()) meshes.pommel.position.copyFrom(warrior.sword.base.subtract(swordDir.scale(.205)));

    let shieldRight = Vector3.Cross(Vector3.Up(), warrior.shield.normal);
    if (shieldRight.lengthSquared() < 1e-5) shieldRight = right;
    else shieldRight.normalize();
    const handleCenter = warrior.shield.center.subtract(warrior.shield.normal.scale(.065));
    setSegment(meshes.shieldHandle, handleCenter.add(shieldRight.scale(-.14)), handleCenter.add(shieldRight.scale(.14)));

    if (meshes.shieldPaint.isEnabled()) {
      const shieldRot = quatAxisTo(AXIS_Y, warrior.shield.normal);
      meshes.shieldPaint.position.copyFrom(warrior.shield.center.add(warrior.shield.normal.scale(.080)));
      meshes.shieldPaint.rotationQuaternion = shieldRot;
    }

    if (meshes.cheekL?.isEnabled()) {
      const head = warrior.bones.head.getAbsolutePosition();
      meshes.cheekL.position.copyFrom(head.add(right.scale(-.12)).add(new Vector3(0, -.035, 0)).add(forward.scale(.01)));
      meshes.cheekR.position.copyFrom(head.add(right.scale(.12)).add(new Vector3(0, -.035, 0)).add(forward.scale(.01)));
      meshes.cheekL.rotation.y = warrior.upperYaw;
      meshes.cheekR.rotation.y = warrior.upperYaw;
    }

    const brace = Math.min(1, Math.max(0, (100 - warrior.stability) / 55));
    if (meshes.pauldronL.isEnabled()) meshes.pauldronL.scaling.y = .56 + brace * .12;
    if (meshes.pauldronR.isEnabled()) meshes.pauldronR.scaling.y = .56 + brace * .12;
  };

  return {
    update,
    setBlenderKitActive,
    dispose: () => Object.values(meshes).forEach((mesh) => mesh.dispose())
  };
}

function applyFirstPersonSilhouette(player) {
  // The rig solver rewrites segment length every frame, so apply radial scale
  // afterwards. This keeps believable arm length while preventing near-camera
  // capsules from reading as oversized pipes across the phone display.
  for (const mesh of [player.meshes.upperArmL, player.meshes.upperArmR]) {
    if (!mesh) continue;
    mesh.scaling.x = .58;
    mesh.scaling.z = .58;
  }
  for (const mesh of [player.meshes.forearmL, player.meshes.forearmR]) {
    if (!mesh) continue;
    mesh.scaling.x = .62;
    mesh.scaling.z = .62;
  }
}

export function installVisualPolish(game) {
  const extras = [makeExtras(game, game.player), makeExtras(game, game.enemy)];
  const originalUpdate = game.update.bind(game);
  game.update = (dt, nowSeconds) => {
    originalUpdate(dt, nowSeconds);
    for (const extra of extras) extra.update();
    applyFirstPersonSilhouette(game.player);
  };
  return {
    setBlenderKitActive(active) { for (const extra of extras) extra.setBlenderKitActive(active); },
    dispose: () => extras.forEach((extra) => extra.dispose())
  };
}
