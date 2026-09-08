import { MeshBuilder, Quaternion, Vector3 } from '@babylonjs/core';

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

function quatAxisTo(axis, direction) {
  const dir = direction.normalizeToNew();
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(axis, dir)));
  if (dot > 0.999999) return Quaternion.Identity();
  if (dot < -0.999999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  const cross = Vector3.Cross(axis, dir).normalize();
  return Quaternion.RotationAxis(cross, Math.acos(dot));
}

function setSegment(mesh, a, b, axis = AXIS_Y) {
  const delta = b.subtract(a);
  const length = Math.max(0.001, delta.length());
  mesh.position.copyFrom(a.add(b).scale(0.5));
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

  meshes.handL = add(MeshBuilder.CreateSphere(`${warrior.id}:handL-detail`, { diameter: 0.12, segments: 8 }, scene));
  meshes.handR = add(MeshBuilder.CreateSphere(`${warrior.id}:handR-detail`, { diameter: 0.12, segments: 8 }, scene));
  meshes.handL.material = warrior.materials.leather;
  meshes.handR.material = warrior.materials.leather;

  meshes.bootL = add(MeshBuilder.CreateBox(`${warrior.id}:bootL-detail`, { width: 0.16, height: 0.10, depth: 0.30 }, scene));
  meshes.bootR = add(MeshBuilder.CreateBox(`${warrior.id}:bootR-detail`, { width: 0.16, height: 0.10, depth: 0.30 }, scene));
  meshes.bootL.material = warrior.materials.leather;
  meshes.bootR.material = warrior.materials.leather;

  meshes.pauldronL = add(MeshBuilder.CreateSphere(`${warrior.id}:pauldronL`, { diameter: 0.22, segments: 8 }, scene));
  meshes.pauldronR = add(MeshBuilder.CreateSphere(`${warrior.id}:pauldronR`, { diameter: 0.22, segments: 8 }, scene));
  meshes.pauldronL.material = warrior.materials.darkSteel;
  meshes.pauldronR.material = warrior.materials.darkSteel;
  meshes.pauldronL.scaling.set(1.25, 0.56, 1.0);
  meshes.pauldronR.scaling.set(1.25, 0.56, 1.0);

  meshes.pommel = add(MeshBuilder.CreateSphere(`${warrior.id}:pommel`, { diameter: 0.075, segments: 8 }, scene));
  meshes.pommel.material = warrior.materials.darkSteel;

  meshes.shieldHandle = add(MeshBuilder.CreateCylinder(`${warrior.id}:shield-handle`, { height: 1, diameter: 0.038, tessellation: 8 }, scene));
  meshes.shieldHandle.material = warrior.materials.darkSteel;
  meshes.shieldHandle.rotationQuaternion = Quaternion.Identity();

  if (!warrior.isPlayer) {
    meshes.cheekL = add(MeshBuilder.CreateBox(`${warrior.id}:cheekL`, { width: 0.055, height: 0.20, depth: 0.12 }, scene));
    meshes.cheekR = add(MeshBuilder.CreateBox(`${warrior.id}:cheekR`, { width: 0.055, height: 0.20, depth: 0.12 }, scene));
    meshes.cheekL.material = warrior.materials.darkSteel;
    meshes.cheekR.material = warrior.materials.darkSteel;
  }

  const update = () => {
    const handL = warrior.bones.handL.getAbsolutePosition();
    const handR = warrior.bones.handR.getAbsolutePosition();
    const shoulderL = warrior.bones.shoulderL.getAbsolutePosition();
    const shoulderR = warrior.bones.shoulderR.getAbsolutePosition();
    const footL = warrior.bones.footL.getAbsolutePosition();
    const footR = warrior.bones.footR.getAbsolutePosition();
    const forward = new Vector3(Math.sin(warrior.bodyYaw), 0, Math.cos(warrior.bodyYaw));
    const right = new Vector3(Math.cos(warrior.bodyYaw), 0, -Math.sin(warrior.bodyYaw));

    meshes.handL.position.copyFrom(handL);
    meshes.handR.position.copyFrom(handR);
    meshes.pauldronL.position.copyFrom(shoulderL.add(new Vector3(0, 0.025, 0)));
    meshes.pauldronR.position.copyFrom(shoulderR.add(new Vector3(0, 0.025, 0)));

    meshes.bootL.position.copyFrom(footL.add(forward.scale(0.07)).add(new Vector3(0, -0.025, 0)));
    meshes.bootR.position.copyFrom(footR.add(forward.scale(0.07)).add(new Vector3(0, -0.025, 0)));
    meshes.bootL.rotation.y = warrior.bodyYaw;
    meshes.bootR.rotation.y = warrior.bodyYaw;

    const swordDir = warrior.sword.tip.subtract(warrior.sword.base).normalize();
    meshes.pommel.position.copyFrom(warrior.sword.base.subtract(swordDir.scale(0.205)));

    let shieldRight = Vector3.Cross(Vector3.Up(), warrior.shield.normal);
    if (shieldRight.lengthSquared() < 1e-5) shieldRight = right;
    else shieldRight.normalize();
    const handleCenter = warrior.shield.center.subtract(warrior.shield.normal.scale(0.065));
    setSegment(meshes.shieldHandle, handleCenter.add(shieldRight.scale(-0.14)), handleCenter.add(shieldRight.scale(0.14)));

    if (!warrior.isPlayer && meshes.cheekL) {
      const head = warrior.bones.head.getAbsolutePosition();
      meshes.cheekL.position.copyFrom(head.add(right.scale(-0.12)).add(new Vector3(0, -0.035, 0)).add(forward.scale(0.01)));
      meshes.cheekR.position.copyFrom(head.add(right.scale(0.12)).add(new Vector3(0, -0.035, 0)).add(forward.scale(0.01)));
      meshes.cheekL.rotation.y = warrior.upperYaw;
      meshes.cheekR.rotation.y = warrior.upperYaw;
    }

    const brace = Math.min(1, Math.max(0, (100 - warrior.stability) / 55));
    meshes.pauldronL.scaling.y = 0.56 + brace * 0.12;
    meshes.pauldronR.scaling.y = 0.56 + brace * 0.12;
  };

  const dispose = () => Object.values(meshes).forEach((mesh) => mesh.dispose());
  return { update, dispose };
}

export function installVisualPolish(game) {
  const extras = [makeExtras(game, game.player), makeExtras(game, game.enemy)];
  const originalUpdate = game.update.bind(game);
  game.update = (dt, nowSeconds) => {
    originalUpdate(dt, nowSeconds);
    for (const extra of extras) extra.update();
  };
  return { dispose: () => extras.forEach((extra) => extra.dispose()) };
}
