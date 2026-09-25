import {
  Color3,
  DynamicTexture,
  HemisphericLight,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import { makeRng } from './core.js';

export function hslColor(h, s = 0.72, l = 0.5) {
  h = ((h % 360) + 360) % 360 / 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return new Color3(l, l, l);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return new Color3(hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3));
}

function flat(mesh) {
  try { mesh.convertToFlatShadedMesh(); } catch {}
  return mesh;
}

function pixelMaterial(scene, name, hue, lightness, saturation = 0.35, emissive = 0) {
  const material = new StandardMaterial(name, scene);
  const texture = new DynamicTexture(name + '-px', { width: 16, height: 16 }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const ctx = texture.getContext();
  const rng = makeRng(Math.floor(hue * 103 + lightness * 1000 + name.length * 733));
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const grit = (rng() - 0.5) * 0.13 + (((x + y * 3) % 7 === 0) ? 0.06 : 0);
      const lum = Math.max(0.04, Math.min(0.82, lightness + grit));
      ctx.fillStyle = 'hsl(' + hue + ' ' + Math.round(saturation * 100) + '% ' + Math.round(lum * 100) + '%)';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 4;
  texture.vScale = 4;
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  if (emissive > 0) material.emissiveColor = hslColor(hue, 0.78, 0.42).scale(emissive);
  return material;
}

function simpleMaterial(scene, name, hue, saturation = 0.75, lightness = 0.5, emissive = 0) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = hslColor(hue, saturation, lightness);
  material.specularColor = Color3.Black();
  material.roughness = 1;
  if (emissive > 0) material.emissiveColor = hslColor(hue, Math.min(1, saturation + 0.12), Math.min(0.68, lightness + 0.06)).scale(emissive);
  return material;
}

function setSolid(mesh) {
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  mesh.metadata = { solid: true };
  return mesh;
}

export class CryptVisuals {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.root = null;
    this.materials = [];
    this.interactives = [];
    this.gate = null;
    this.floorHue = 285;
    this.weaponRecoil = 0;
    this.weaponKick = 0;
    this.roomCenters = new Map();
    this.ambientProps = [];
    this.decorMaterials = [];
    this.collisionBoxes = [];
    this.impactFx = [];
    this.weaponBlueprint = null;
    this.weaponPose = { swing: 0, charge: 0, skill: 0, combo: 0, heavy: false };

    this.hemi = new HemisphericLight('crypt-hemi', new Vector3(0.2, 1, 0.1), scene);
    this.hemi.intensity = 0.34;
    this.hemi.diffuse = new Color3(0.58, 0.48, 0.7);
    this.hemi.groundColor = new Color3(0.06, 0.03, 0.08);

    this.lantern = new PointLight('player-psyche', Vector3.Zero(), scene);
    this.lantern.parent = camera;
    this.lantern.position = new Vector3(0, 0.25, 0.2);
    this.lantern.intensity = 0.95;
    this.lantern.range = 10.5;

    this.createWeapon();
  }

  createWeapon() {
    const root = new TransformNode('modular-melee-weapon', this.scene);
    root.parent = this.camera;
    root.position = new Vector3(0.38, -0.34, 0.63);
    root.rotation = new Vector3(-0.16, 0.08, -0.08);
    this.weaponRoot = root;
    this.weaponMaterials = [];
  }

  setPlayerWeapon(weapon) {
    this.weaponBlueprint = weapon || null;
    if (!this.weaponRoot) this.createWeapon();
    for (const child of this.weaponRoot.getChildren()) child.dispose(false, true);
    this.weaponMaterials.forEach((material) => material.dispose(true, true));
    this.weaponMaterials.length = 0;
    if (!weapon) return;

    const dark = simpleMaterial(this.scene, 'player-weapon-dark-' + weapon.seed, 355, 0.32, 0.13);
    const blood = simpleMaterial(this.scene, 'player-weapon-red-' + weapon.seed, 2, 0.78, 0.34, 0.08);
    const bone = simpleMaterial(this.scene, 'player-weapon-bone-' + weapon.seed, 38, 0.22, 0.64);
    const glow = simpleMaterial(this.scene, 'player-weapon-glow-' + weapon.seed, 8, 0.92, 0.48, 0.7);
    this.weaponMaterials.push(dark, blood, bone, glow);

    const length = weapon.handleSpec?.visualLength || 1;
    const shaft = flat(MeshBuilder.CreateCylinder('weapon-shaft', {
      height: 0.62 * length, diameterTop: 0.075, diameterBottom: 0.095, tessellation: 6
    }, this.scene));
    shaft.parent = this.weaponRoot;
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.14 + length * 0.15;
    shaft.material = weapon.core === 'claws' ? bone : dark;
    shaft.isPickable = false;

    const headZ = 0.44 + length * 0.31;
    const visual = weapon.headSpec?.visual || 'crescent';
    const add = (mesh, material = blood) => {
      mesh.parent = this.weaponRoot;
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };

    if (visual === 'hammer' || visual === 'slab' || visual === 'bell') {
      const head = add(flat(MeshBuilder.CreateBox('weapon-heavy-head', {
        width: visual === 'slab' ? 0.46 : 0.38,
        height: visual === 'bell' ? 0.38 : 0.25,
        depth: visual === 'slab' ? 0.18 : 0.28
      }, this.scene)), visual === 'bell' ? bone : blood);
      head.position.set(0, 0.02, headZ);
      if (visual === 'bell') head.scaling.y = 1.25;
    } else if (visual === 'spear' || visual === 'fork') {
      const point = add(flat(MeshBuilder.CreateCylinder('weapon-point', {
        height: visual === 'fork' ? 0.42 : 0.52, diameterTop: 0, diameterBottom: 0.18, tessellation: 5
      }, this.scene)), bone);
      point.rotation.x = Math.PI / 2;
      point.position.z = headZ + 0.12;
      if (visual === 'fork') {
        for (const side of [-1, 1]) {
          const tine = add(flat(MeshBuilder.CreateCylinder('weapon-fork-tine-' + side, {
            height: 0.34, diameterTop: 0, diameterBottom: 0.075, tessellation: 5
          }, this.scene)), blood);
          tine.rotation.x = Math.PI / 2;
          tine.position.set(side * 0.11, 0, headZ + 0.18);
        }
      }
    } else if (visual === 'fangs') {
      for (const side of [-1, 1]) {
        const fang = add(flat(MeshBuilder.CreateCylinder('weapon-fang-' + side, {
          height: 0.34, diameterTop: 0, diameterBottom: 0.1, tessellation: 5
        }, this.scene)), bone);
        fang.rotation.x = Math.PI / 2;
        fang.position.set(side * 0.1, side * 0.035, headZ + 0.12);
      }
    } else {
      const blade = add(flat(MeshBuilder.CreateBox('weapon-blade-' + visual, {
        width: visual === 'axe' ? 0.34 : 0.22,
        height: visual === 'saw' ? 0.28 : 0.34,
        depth: 0.075
      }, this.scene)), blood);
      blade.position.set(visual === 'hook' ? 0.08 : 0, 0.04, headZ);
      blade.rotation.z = visual === 'crescent' ? -0.36 : visual === 'hook' ? -0.62 : 0;
      if (visual === 'saw') {
        for (let i=0;i<4;i+=1) {
          const tooth=add(flat(MeshBuilder.CreateCylinder('weapon-saw-tooth-'+i,{
            height:0.11,diameterTop:0,diameterBottom:0.055,tessellation:4
          },this.scene)),bone);
          tooth.position.set((i-1.5)*0.07,0.19,headZ);
          tooth.rotation.z=Math.PI;
        }
      }
    }

    if (weapon.secondary === 'core') {
      const core = add(flat(MeshBuilder.CreateIcoSphere('weapon-core', { radius: 0.095, subdivisions: 1 }, this.scene)), glow);
      core.position.set(0, 0.02, 0.36);
    } else if (weapon.secondary === 'ring') {
      const ring = add(MeshBuilder.CreateTorus('weapon-ring', { diameter: 0.25, thickness: 0.035, tessellation: 10 }, this.scene), glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = 0.35;
    } else if (weapon.secondary === 'guard') {
      const guard = add(flat(MeshBuilder.CreateBox('weapon-guard', { width: 0.36, height: 0.07, depth: 0.08 }, this.scene)), bone);
      guard.position.z = 0.28;
    } else if (weapon.secondary === 'hook') {
      const hook = add(MeshBuilder.CreateTorus('weapon-rear-hook', { diameter: 0.22, thickness: 0.045, tessellation: 8 }, this.scene), blood);
      hook.rotation.x = Math.PI / 2;
      hook.position.set(0.1, -0.08, 0.3);
      hook.scaling.x = 0.65;
    } else if (weapon.secondary === 'counterweight') {
      const weight = add(flat(MeshBuilder.CreateIcoSphere('weapon-counterweight', { radius: 0.11, subdivisions: 1 }, this.scene)), dark);
      weight.position.z = -0.16;
    }

    if (weapon.core === 'twin' || weapon.core === 'claws') {
      const off = add(flat(MeshBuilder.CreateBox('weapon-offhand-hint',{width:0.12,height:0.34,depth:0.07},this.scene)),blood);
      off.position.set(-0.26,-0.04,0.42);
      off.rotation.z=0.18;
    }
  }

  setWeaponPose({ swing = 0, charge = 0, skill = 0, combo = 0, heavy = false } = {}) {
    this.weaponPose = { swing, charge, skill, combo, heavy };
  }

  clearDungeon() {
    if (this.root) this.root.dispose(false, true);
    for (const material of this.materials) material.dispose(true, true);
    this.materials.length = 0;
    this.interactives.length = 0;
    this.ambientProps.length = 0;
    this.decorMaterials.length = 0;
    this.collisionBoxes.length = 0;
    this.roomCenters.clear();
    this.gate = null;
  }

  registerCollisionBox(x, y, z, width, height, depth) {
    this.collisionBoxes.push({
      minX: x - width / 2, maxX: x + width / 2,
      minY: y - height / 2, maxY: y + height / 2,
      minZ: z - depth / 2, maxZ: z + depth / 2
    });
  }

  buildDungeon(dungeon, floor) {
    this.clearDungeon();
    this.floorHue = 354;
    const root = new TransformNode('dungeon-floor-' + floor, this.scene);
    this.root = root;
    const wall = pixelMaterial(this.scene, 'wall-' + floor, 352, 0.145, 0.34);
    const floorMat = pixelMaterial(this.scene, 'floor-' + floor, 4, 0.085, 0.28);
    const ceilingMat = pixelMaterial(this.scene, 'ceiling-' + floor, 348, 0.065, 0.22);
    const trim = simpleMaterial(this.scene, 'trim-' + floor, 8, 0.58, 0.28, 0.08);
    const crystalA = simpleMaterial(this.scene, 'crystal-a-' + floor, 2, 0.9, 0.44, 0.72);
    const crystalB = simpleMaterial(this.scene, 'crystal-b-' + floor, 22, 0.74, 0.44, 0.45);
    const decorA = simpleMaterial(this.scene, 'decor-a-' + floor, 346, 0.68, 0.32, 0.16);
    const decorB = simpleMaterial(this.scene, 'decor-b-' + floor, 12, 0.76, 0.36, 0.2);
    const bone = simpleMaterial(this.scene, 'decor-bone-' + floor, 38, 0.18, 0.62, 0.02);
    this.materials.push(wall, floorMat, ceilingMat, trim, crystalA, crystalB, decorA, decorB, bone);
    this.decorMaterials = [crystalA, crystalB, decorA, decorB, bone];

    const spacing = dungeon.spacing;
    for (const room of dungeon.rooms) {
      const x = room.gx * spacing;
      const z = room.gz * spacing;
      this.roomCenters.set(room.id, new Vector3(x, 0, z));
      this.buildRoom(root, room, x, z, wall, floorMat, ceilingMat, trim, crystalA, crystalB, floor);
    }
    this.buildConnectors(root, dungeon, floorMat, trim);

    const start = dungeon.rooms[dungeon.startId];
    this.camera.position.set(start.gx * spacing, 1.58, start.gz * spacing);
    this.camera.rotation.set(0, 0, 0);
  }

  buildRoom(root, room, x, z, wallMat, floorMat, ceilingMat, trimMat, crystalA, crystalB, floor) {
    const floorMesh = MeshBuilder.CreateBox('room-floor-' + room.id, { width: room.sizeX, height: 0.35, depth: room.sizeZ }, this.scene);
    floorMesh.parent = root; floorMesh.position.set(x, -0.23, z); floorMesh.material = floorMat; floorMesh.isPickable = false; floorMesh.checkCollisions = false;
    const ceiling = MeshBuilder.CreateBox('room-ceiling-' + room.id, { width: room.sizeX, height: 0.28, depth: room.sizeZ }, this.scene);
    ceiling.parent = root; ceiling.position.set(x, 4.28, z); ceiling.material = ceilingMat; ceiling.isPickable = false; ceiling.checkCollisions = false;

    const gap = 4.6;
    const thickness = 0.42;
    const connectedThickness = 0.22;
    const height = 4.25;
    const wallY = 1.98;

    const wallPair = (side, connected) => {
      const northSouth = side === 'n' || side === 's';
      const length = northSouth ? room.sizeX : room.sizeZ;
      const axisPos = northSouth ? room.sizeZ / 2 : room.sizeX / 2;
      const sign = side === 'n' || side === 'w' ? -1 : 1;
      if (!connected) {
        const mesh = setSolid(MeshBuilder.CreateBox('wall-' + room.id + '-' + side, northSouth
          ? { width: length, height, depth: thickness }
          : { width: thickness, height, depth: length }, this.scene));
        mesh.parent = root;
        mesh.position.set(x + (northSouth ? 0 : sign * axisPos), wallY, z + (northSouth ? sign * axisPos : 0));
        mesh.material = wallMat;
        this.registerCollisionBox(mesh.position.x, wallY, mesh.position.z,
          northSouth ? length : thickness, height, northSouth ? thickness : length);
      } else {
        const segment = Math.max(0.8, (length - gap) / 2);
        for (const offsetSign of [-1, 1]) {
          const mesh = setSolid(MeshBuilder.CreateBox('wall-' + room.id + '-' + side + '-' + offsetSign, northSouth
            ? { width: segment, height, depth: connectedThickness }
            : { width: connectedThickness, height, depth: segment }, this.scene));
          mesh.parent = root;
          if (northSouth) mesh.position.set(x + offsetSign * (gap / 2 + segment / 2), wallY, z + sign * axisPos);
          else mesh.position.set(x + sign * axisPos, wallY, z + offsetSign * (gap / 2 + segment / 2));
          mesh.material = wallMat;
          this.registerCollisionBox(mesh.position.x, wallY, mesh.position.z,
            northSouth ? segment : connectedThickness, height, northSouth ? connectedThickness : segment);
        }
        const lintel = MeshBuilder.CreateBox('lintel-' + room.id + '-' + side, northSouth
          ? { width: gap, height: 0.72, depth: connectedThickness + 0.08 }
          : { width: connectedThickness + 0.08, height: 0.72, depth: gap }, this.scene);
        lintel.parent = root;
        lintel.position.set(x + (northSouth ? 0 : sign * axisPos), 3.89, z + (northSouth ? sign * axisPos : 0));
        lintel.material = trimMat;
        lintel.isPickable = false;
        lintel.checkCollisions = false;
      }
    };
    wallPair('n', room.links.n !== null);
    wallPair('e', room.links.e !== null);
    wallPair('s', room.links.s !== null);
    wallPair('w', room.links.w !== null);

    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        const pillar = flat(MeshBuilder.CreateCylinder('rib-' + room.id + '-' + cx + '-' + cz, { height: 4.15, diameter: 0.32, tessellation: 6 }, this.scene));
        pillar.parent = root;
        pillar.position.set(x + cx * (room.sizeX / 2 - 0.36), 1.92, z + cz * (room.sizeZ / 2 - 0.36));
        pillar.material = trimMat;
        pillar.isPickable = false;
      }
    }

    const rng = makeRng((room.id + 1) * 8741 + floor * 9127);
    const crystalCount = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < crystalCount; i += 1) {
      const edgeX = rng() < 0.5;
      const px = edgeX ? x + (rng() < 0.5 ? -1 : 1) * (room.sizeX / 2 - 0.72) : x + (rng() - 0.5) * (room.sizeX - 2);
      const pz = edgeX ? z + (rng() - 0.5) * (room.sizeZ - 2) : z + (rng() < 0.5 ? -1 : 1) * (room.sizeZ / 2 - 0.72);
      const crystal = flat(MeshBuilder.CreateCylinder('crystal-' + room.id + '-' + i, {
        height: 0.55 + rng() * 0.95, diameterTop: 0, diameterBottom: 0.18 + rng() * 0.22, tessellation: 5
      }, this.scene));
      crystal.parent = root;
      crystal.position.set(px, 0.28 + crystal.getBoundingInfo().boundingBox.extendSize.y, pz);
      crystal.rotation.z = (rng() - 0.5) * 0.45;
      crystal.rotation.x = (rng() - 0.5) * 0.22;
      crystal.material = rng() < 0.5 ? crystalA : crystalB;
      crystal.isPickable = false;
    }

    this.createRoomDecor(root, room, x, z, floor);
    if (room.role === 'chest') this.createChest(root, room, x, z, trimMat, crystalA);
    if (room.role === 'shrine') this.createShrine(root, room, x, z, trimMat, crystalB);
    if (room.role === 'gate') this.createGate(root, room, x, z, floor);
  }

  buildConnectors(root, dungeon, floorMat, trimMat) {
    const spacing = dungeon.spacing;
    const corridorWidth = 4.35;
    for (const room of dungeon.rooms) {
      const x = room.gx * spacing;
      const z = room.gz * spacing;
      for (const side of ['e', 's']) {
        const nextId = room.links[side];
        if (nextId === null) continue;
        const next = dungeon.rooms[nextId];
        const nx = next.gx * spacing;
        const nz = next.gz * spacing;
        const eastWest = side === 'e';
        const bridge = MeshBuilder.CreateBox('bridge-' + room.id + '-' + side, eastWest
          ? { width: Math.abs(nx - x) + 0.8, height: 0.18, depth: corridorWidth }
          : { width: corridorWidth, height: 0.18, depth: Math.abs(nz - z) + 0.8 }, this.scene);
        bridge.parent = root;
        bridge.position.set((x + nx) * 0.5, -0.16, (z + nz) * 0.5);
        bridge.material = floorMat;
        bridge.isPickable = false;
        bridge.checkCollisions = false;

        const marker = MeshBuilder.CreateBox('threshold-' + room.id + '-' + side, eastWest
          ? { width: 0.12, height: 0.025, depth: corridorWidth * 0.72 }
          : { width: corridorWidth * 0.72, height: 0.025, depth: 0.12 }, this.scene);
        marker.parent = root;
        marker.position.set((x + nx) * 0.5, -0.045, (z + nz) * 0.5);
        marker.material = trimMat;
        marker.isPickable = false;
      }
    }
  }

  createRoomDecor(root, room, x, z, floor) {
    const rng = makeRng((room.id + 19) * 104729 ^ floor * 65537);
    const [crystalA, crystalB, decorA, decorB, bone] = this.decorMaterials;
    const count = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i += 1) {
      let px = x + (rng() - 0.5) * (room.sizeX - 2.2);
      let pz = z + (rng() - 0.5) * (room.sizeZ - 2.2);
      if (Math.hypot(px - x, pz - z) < 2.1) {
        const angle = rng() * Math.PI * 2;
        px = x + Math.cos(angle) * (2.4 + rng() * 1.4);
        pz = z + Math.sin(angle) * (2.4 + rng() * 1.4);
      }
      const node = new TransformNode('decor-' + room.id + '-' + i, this.scene);
      node.parent = root;
      node.position.set(px, 0, pz);
      const kind = rng();

      if (kind < 0.3) {
        const stem = flat(MeshBuilder.CreateCylinder('fungus-stem', { height: 0.32 + rng() * 0.45, diameterTop: 0.08, diameterBottom: 0.14, tessellation: 5 }, this.scene));
        stem.parent = node; stem.position.y = 0.18; stem.material = bone; stem.isPickable = false;
        const cap = flat(MeshBuilder.CreateIcoSphere('fungus-cap', { radius: 0.18 + rng() * 0.13, subdivisions: 1 }, this.scene));
        cap.parent = node; cap.position.y = 0.48 + rng() * 0.18; cap.scaling.y = 0.45; cap.material = rng() < 0.5 ? decorA : decorB; cap.isPickable = false;
        this.ambientProps.push({ node, kind: 'bob', phase: rng() * Math.PI * 2, baseY: 0, speed: 0.7 + rng() });
      } else if (kind < 0.56) {
        const plinth = flat(MeshBuilder.CreateCylinder('rune-plinth', { height: 0.18, diameter: 0.72 + rng() * 0.35, tessellation: 7 }, this.scene));
        plinth.parent = node; plinth.position.y = 0.05; plinth.material = bone; plinth.isPickable = false;
        const ring = MeshBuilder.CreateTorus('rune-ring', { diameter: 0.58 + rng() * 0.2, thickness: 0.035, tessellation: 10 }, this.scene);
        ring.parent = node; ring.position.y = 0.16; ring.rotation.x = Math.PI / 2; ring.material = rng() < 0.5 ? crystalA : crystalB; ring.isPickable = false;
        this.ambientProps.push({ node, ring, kind: 'spin', phase: rng() * Math.PI * 2, baseY: 0, speed: 0.45 + rng() * 0.7 });
      } else if (kind < 0.78) {
        for (let b = 0; b < 3; b += 1) {
          const shard = flat(MeshBuilder.CreateCylinder('bone-shard', { height: 0.45 + rng() * 0.35, diameter: 0.07 + rng() * 0.04, tessellation: 5 }, this.scene));
          shard.parent = node; shard.position.set((rng() - 0.5) * 0.45, 0.09, (rng() - 0.5) * 0.45);
          shard.rotation.z = (rng() - 0.5) * 2.4; shard.rotation.x = (rng() - 0.5) * 1.2; shard.material = bone; shard.isPickable = false;
        }
      } else {
        const obelisk = flat(MeshBuilder.CreateCylinder('small-obelisk', { height: 0.9 + rng() * 0.8, diameterTop: 0.05, diameterBottom: 0.26 + rng() * 0.18, tessellation: 5 }, this.scene));
        obelisk.parent = node; obelisk.position.y = 0.45; obelisk.rotation.z = (rng() - 0.5) * 0.14; obelisk.material = rng() < 0.5 ? decorA : decorB; obelisk.isPickable = false;
        const eye = flat(MeshBuilder.CreateIcoSphere('obelisk-eye', { radius: 0.085, subdivisions: 1 }, this.scene));
        eye.parent = node; eye.position.set(0, 0.7, 0.15); eye.material = rng() < 0.5 ? crystalA : crystalB; eye.isPickable = false;
        this.ambientProps.push({ node, kind: 'tilt', phase: rng() * Math.PI * 2, baseY: 0, speed: 0.35 + rng() * 0.45 });
      }
    }
  }

  createChest(root, room, x, z, dark, glow) {
    const node = new TransformNode('chest-node-' + room.id, this.scene);
    node.parent = root; node.position.set(x, 0, z);
    const base = flat(MeshBuilder.CreateBox('chest-' + room.id, { width: 1.15, height: 0.58, depth: 0.7 }, this.scene));
    base.parent = node; base.position.y = 0.31; base.material = dark; base.isPickable = false;
    const lid = flat(MeshBuilder.CreateCylinder('chest-lid-' + room.id, { height: 1.15, diameter: 0.72, tessellation: 6 }, this.scene));
    lid.parent = node; lid.rotation.z = Math.PI / 2; lid.position.y = 0.67; lid.scaling.z = 0.52; lid.material = dark; lid.isPickable = false;
    const lock = flat(MeshBuilder.CreateIcoSphere('chest-lock-' + room.id, { radius: 0.11, subdivisions: 1 }, this.scene));
    lock.parent = node; lock.position.set(0, 0.52, 0.39); lock.material = glow; lock.isPickable = false;
    this.interactives.push({ type: 'chest', roomId: room.id, node, position: new Vector3(x, 0, z), used: false, lock });
  }

  createShrine(root, room, x, z, dark, glow) {
    const node = new TransformNode('shrine-node-' + room.id, this.scene);
    node.parent = root; node.position.set(x, 0, z);
    const base = flat(MeshBuilder.CreateCylinder('shrine-base-' + room.id, { height: 0.65, diameterBottom: 1.35, diameterTop: 0.9, tessellation: 7 }, this.scene));
    base.parent = node; base.position.y = 0.33; base.material = dark; base.isPickable = false;
    const eye = flat(MeshBuilder.CreateIcoSphere('shrine-eye-' + room.id, { radius: 0.35, subdivisions: 1 }, this.scene));
    eye.parent = node; eye.position.y = 1.14; eye.scaling.y = 0.55; eye.material = glow; eye.isPickable = false;
    const stalk = flat(MeshBuilder.CreateCylinder('shrine-stalk-' + room.id, { height: 0.72, diameterTop: 0.14, diameterBottom: 0.28, tessellation: 5 }, this.scene));
    stalk.parent = node; stalk.position.y = 0.76; stalk.material = dark; stalk.isPickable = false;
    this.interactives.push({ type: 'shrine', roomId: room.id, node, position: new Vector3(x, 0, z), used: false, eye });
  }

  createGate(root, room, x, z, floor) {
    const node = new TransformNode('gate-node', this.scene);
    node.parent = root; node.position.set(x, 0, z);
    const frameMat = simpleMaterial(this.scene, 'gate-frame-' + floor, (this.floorHue + 30) % 360, 0.42, 0.21);
    const glowMat = simpleMaterial(this.scene, 'gate-glow-' + floor, 340, 0.88, 0.48, 0.72);
    this.materials.push(frameMat, glowMat);
    const ring = MeshBuilder.CreateTorus('descent-ring', { diameter: 2.45, thickness: 0.22, tessellation: 16 }, this.scene);
    ring.parent = node; ring.position.y = 1.45; ring.rotation.x = Math.PI / 2; ring.material = frameMat; ring.isPickable = false;
    const inner = flat(MeshBuilder.CreateCylinder('descent-core', { height: 0.09, diameter: 1.82, tessellation: 18 }, this.scene));
    inner.parent = node; inner.position.y = 0.08; inner.material = glowMat; inner.isPickable = false;
    const spires = [];
    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      const spire = flat(MeshBuilder.CreateCylinder('gate-spire-' + i, { height: 1.25, diameterTop: 0, diameterBottom: 0.23, tessellation: 5 }, this.scene));
      spire.parent = node;
      spire.position.set(Math.cos(angle) * 1.35, 0.62, Math.sin(angle) * 1.35);
      spire.material = glowMat; spire.isPickable = false;
      spires.push(spire);
    }
    this.gate = { type: 'gate', roomId: room.id, node, position: new Vector3(x, 0, z), used: false, ring, inner, spires, glowMat, unlocked: false };
    this.interactives.push(this.gate);
  }

  setGateUnlocked(value) {
    if (!this.gate || this.gate.unlocked === Boolean(value)) return;
    this.gate.unlocked = Boolean(value);
    const hue = value ? 82 : 340;
    this.gate.glowMat.diffuseColor = hslColor(hue, 0.9, 0.54);
    this.gate.glowMat.emissiveColor = hslColor(hue, 0.95, 0.5).scale(value ? 1.05 : 0.72);
  }

  setInteractiveUsed(target) {
    target.used = true;
    if (target.type === 'chest' && target.lock) {
      target.lock.scaling.setAll(0.01);
      target.node.rotation.y += 0.12;
    }
    if (target.type === 'shrine' && target.eye) target.eye.scaling.scaleInPlace(1.45);
  }

  createMonsterVisual(genome, position) {
    const root = new TransformNode('monster-' + genome.seed, this.scene);
    root.position.copyFrom(position);
    const bodyMat = simpleMaterial(this.scene, 'monster-body-' + genome.seed, genome.hue, 0.72, genome.elite ? 0.48 : 0.38, genome.elite ? 0.22 : 0.04);
    const accentMat = simpleMaterial(this.scene, 'monster-accent-' + genome.seed, genome.accentHue, 0.9, 0.52, 0.66);
    const eyeMat = simpleMaterial(this.scene, 'monster-eye-' + genome.seed, (genome.accentHue + 80) % 360, 0.95, 0.63, 1);
    const materials = [bodyMat, accentMat, eyeMat];
    const parts = [];
    const bodyPart = (mesh, material = bodyMat) => { mesh.parent = root; mesh.material = material; mesh.isPickable = true; parts.push(mesh); return mesh; };

    let headY = 1.05;
    let frontZ = 0.55;
    if (genome.body === 'crawler') {
      const torso = bodyPart(flat(MeshBuilder.CreateIcoSphere('crawler-body', { radius: 0.7, subdivisions: 1 }, this.scene)));
      torso.position.y = 0.56; torso.scaling.set(1.05, 0.56, 1.25);
      const head = bodyPart(flat(MeshBuilder.CreateIcoSphere('crawler-head', { radius: 0.43, subdivisions: 1 }, this.scene)), accentMat);
      head.position.set(0, 0.61, 0.72); head.scaling.y = 0.76; headY = 0.61; frontZ = 1.08;
      const legs = Math.max(4, genome.limbs);
      for (let i = 0; i < legs; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const leg = bodyPart(flat(MeshBuilder.CreateCylinder('crawler-leg-' + i, { height: 0.72, diameter: 0.11, tessellation: 5 }, this.scene)));
        leg.position.set(side * (0.55 + row * 0.05), 0.34, 0.48 - row * 0.46);
        leg.rotation.z = side * 1.08;
        leg.rotation.x = (row - 1) * 0.22;
      }
    } else if (genome.body === 'brute') {
      const torso = bodyPart(flat(MeshBuilder.CreateIcoSphere('brute-body', { radius: 0.76, subdivisions: 1 }, this.scene)));
      torso.position.y = 1.05; torso.scaling.set(0.92, 1.25, 0.72);
      const head = bodyPart(flat(MeshBuilder.CreateIcoSphere('brute-head', { radius: 0.5, subdivisions: 1 }, this.scene)), accentMat);
      head.position.set(0, 2.02, 0.08); head.scaling.set(1.1, 0.82, 0.92); headY = 2.02; frontZ = 0.47;
      for (const side of [-1, 1]) {
        const leg = bodyPart(flat(MeshBuilder.CreateCylinder('brute-leg-' + side, { height: 0.9, diameterTop: 0.23, diameterBottom: 0.3, tessellation: 6 }, this.scene)));
        leg.position.set(side * 0.34, 0.43, 0); leg.material = bodyMat;
        const arm = bodyPart(flat(MeshBuilder.CreateCylinder('brute-arm-' + side, { height: 1.05, diameterTop: 0.2, diameterBottom: 0.27, tessellation: 6 }, this.scene)), accentMat);
        arm.position.set(side * 0.8, 1.12, 0); arm.rotation.z = side * 0.22;
      }
    } else if (genome.body === 'orb') {
      const orb = bodyPart(flat(MeshBuilder.CreateIcoSphere('orb-body', { radius: 0.78, subdivisions: 2 }, this.scene)));
      orb.position.y = 1.2; orb.scaling.y = 0.86; headY = 1.2; frontZ = 0.72;
      const ringA = bodyPart(MeshBuilder.CreateTorus('orb-ring-a', { diameter: 1.82, thickness: 0.08, tessellation: 12 }, this.scene), accentMat);
      ringA.position.y = 1.2; ringA.rotation.x = 0.78;
      const ringB = bodyPart(MeshBuilder.CreateTorus('orb-ring-b', { diameter: 1.58, thickness: 0.055, tessellation: 10 }, this.scene), accentMat);
      ringB.position.y = 1.2; ringB.rotation.z = 1.08;
    } else if (genome.body === 'bishop') {
      const robe = bodyPart(flat(MeshBuilder.CreateCylinder('bishop-robe', { height: 1.75, diameterTop: 0.48, diameterBottom: 1.35, tessellation: 7 }, this.scene)));
      robe.position.y = 0.88;
      const head = bodyPart(flat(MeshBuilder.CreateIcoSphere('bishop-head', { radius: 0.48, subdivisions: 1 }, this.scene)), accentMat);
      head.position.y = 1.92; head.scaling.y = 1.15; headY = 1.92; frontZ = 0.43;
      const halo = bodyPart(MeshBuilder.CreateTorus('bishop-halo', { diameter: 1.12, thickness: 0.07, tessellation: 12 }, this.scene), eyeMat);
      halo.position.y = 2.55; halo.rotation.x = Math.PI / 2;
    } else if (genome.body === 'serpent') {
      for (let i = 0; i < 5; i += 1) {
        const segment = bodyPart(flat(MeshBuilder.CreateIcoSphere('serpent-segment-' + i, { radius: 0.46 - i * 0.035, subdivisions: 1 }, this.scene)), i === 0 ? accentMat : bodyMat);
        segment.position.set(0, 0.72 + Math.sin(i * 0.9) * 0.12, 0.65 - i * 0.42);
      }
      headY = 0.76; frontZ = 1.05;
    } else if (genome.body === 'tripod') {
      const core = bodyPart(flat(MeshBuilder.CreateIcoSphere('tripod-core', { radius: 0.58, subdivisions: 1 }, this.scene)));
      core.position.y = 1.05; core.scaling.set(0.9, 1.15, 0.82);
      for (let i = 0; i < 3; i += 1) {
        const angle = i / 3 * Math.PI * 2;
        const leg = bodyPart(flat(MeshBuilder.CreateCylinder('tripod-leg-' + i, { height: 1.25, diameterTop: 0.12, diameterBottom: 0.2, tessellation: 5 }, this.scene)), i === 0 ? accentMat : bodyMat);
        leg.position.set(Math.cos(angle) * 0.5, 0.48, Math.sin(angle) * 0.5);
        leg.rotation.z = Math.cos(angle) * 0.55;
        leg.rotation.x = -Math.sin(angle) * 0.55;
      }
      headY = 1.12; frontZ = 0.58;
    } else if (genome.body === 'lantern') {
      const bell = bodyPart(flat(MeshBuilder.CreateCylinder('lantern-bell', { height: 1.05, diameterTop: 0.58, diameterBottom: 1.18, tessellation: 7 }, this.scene)));
      bell.position.y = 1.25; bell.scaling.y = 0.82;
      const crown = bodyPart(flat(MeshBuilder.CreateIcoSphere('lantern-crown', { radius: 0.42, subdivisions: 1 }, this.scene)), accentMat);
      crown.position.y = 1.95; crown.scaling.y = 0.62;
      for (let i = 0; i < 4; i += 1) {
        const tendril = bodyPart(flat(MeshBuilder.CreateCylinder('lantern-tendril-' + i, { height: 0.74, diameterTop: 0.06, diameterBottom: 0.11, tessellation: 5 }, this.scene)));
        const angle = i / 4 * Math.PI * 2;
        tendril.position.set(Math.cos(angle) * 0.36, 0.48, Math.sin(angle) * 0.36);
        tendril.rotation.z = Math.cos(angle) * 0.38;
        tendril.rotation.x = -Math.sin(angle) * 0.38;
      }
      headY = 1.7; frontZ = 0.58;
    } else {
      const skull = bodyPart(flat(MeshBuilder.CreateIcoSphere('jaw-skull', { radius: 0.72, subdivisions: 1 }, this.scene)));
      skull.position.y = 1.02; skull.scaling.set(1.15, 0.72, 0.82);
      const lower = bodyPart(flat(MeshBuilder.CreateBox('jaw-lower', { width: 1.0, height: 0.18, depth: 0.62 }, this.scene)), accentMat);
      lower.position.set(0, 0.58, 0.38); lower.rotation.x = -0.16;
      for (let i = 0; i < 5; i += 1) {
        const tooth = bodyPart(flat(MeshBuilder.CreateCylinder('jaw-tooth-' + i, { height: 0.22, diameterTop: 0, diameterBottom: 0.08, tessellation: 5 }, this.scene)), eyeMat);
        tooth.position.set((i - 2) * 0.18, 0.72, 0.72); tooth.rotation.x = Math.PI;
      }
      headY = 1.08; frontZ = 0.76;
    }

    const eyeSpread = Math.min(0.34, 0.1 + genome.eyes * 0.035);
    for (let i = 0; i < genome.eyes; i += 1) {
      const eye = bodyPart(flat(MeshBuilder.CreateIcoSphere('eye-' + i, { radius: genome.eyes > 3 ? 0.075 : 0.095, subdivisions: 1 }, this.scene)), eyeMat);
      const t = genome.eyes === 1 ? 0 : i / (genome.eyes - 1) - 0.5;
      eye.position.set(t * eyeSpread * 2, headY + Math.sin(i * 2.1) * 0.08, frontZ);
    }

    for (let i = 0; i < genome.horns; i += 1) {
      const horn = bodyPart(flat(MeshBuilder.CreateCylinder('horn-' + i, { height: 0.48 + (i % 2) * 0.12, diameterTop: 0, diameterBottom: 0.15, tessellation: 5 }, this.scene)), accentMat);
      const t = genome.horns === 1 ? 0 : i / (genome.horns - 1) - 0.5;
      horn.position.set(t * 0.72, headY + 0.48, 0.02);
      horn.rotation.z = t * 0.46;
    }
    for (let i = 0; i < genome.crest; i += 1) {
      const plate = bodyPart(flat(MeshBuilder.CreateCylinder('crest-' + i, { height: 0.3 + i * 0.05, diameterTop: 0, diameterBottom: 0.16, tessellation: 4 }, this.scene)), eyeMat);
      plate.position.set(0, headY + 0.18 + i * 0.15, -0.2 - i * 0.08);
      plate.rotation.x = -0.52;
    }
    if (genome.halo) {
      const halo = bodyPart(MeshBuilder.CreateTorus('mutation-halo', { diameter: 1.05 + genome.size * 0.2, thickness: 0.045, tessellation: 12 }, this.scene), eyeMat);
      halo.position.y = headY + 0.62;
      halo.rotation.x = Math.PI / 2;
    }

    let aura = null;
    if (genome.elite || genome.ability === 'blink' || genome.ability === 'burst') {
      aura = bodyPart(MeshBuilder.CreateTorus('monster-aura', { diameter: 2.0, thickness: genome.elite ? 0.07 : 0.045, tessellation: 14 }, this.scene), accentMat);
      aura.position.y = 0.12; aura.rotation.x = Math.PI / 2;
    }

    root.scaling.setAll(genome.size);
    return { root, parts, materials, aura, baseY: position.y, phase: genome.phase };
  }

  tagEnemy(visual, enemy) {
    for (const mesh of visual.parts) mesh.metadata = { enemy };
  }

  disposeMonsterVisual(visual) {
    visual.root.dispose(false, true);
    visual.materials.forEach((material) => material.dispose(true, true));
  }

  createProjectile(hue, radius = 0.13) {
    const mesh = flat(MeshBuilder.CreateIcoSphere('enemy-projectile', { radius, subdivisions: 1 }, this.scene));
    const mat = simpleMaterial(this.scene, 'projectile-' + Math.random(), hue, 0.95, 0.55, 1);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.metadata = { disposableMaterial: mat };
    return mesh;
  }

  createLootVisual(loot, position, seed) {
    const node = new TransformNode('loot-' + seed, this.scene);
    node.position.copyFrom(position);
    const hue = loot.type === 'relic' ? 76 : (315 + seed % 80) % 360;
    const mat = simpleMaterial(this.scene, 'loot-mat-' + seed, hue, 0.9, 0.56, 0.95);
    let mesh;
    if (loot.type === 'relic') {
      mesh = flat(MeshBuilder.CreateIcoSphere('relic-drop', { radius: 0.25, subdivisions: 1 }, this.scene));
      const ring = MeshBuilder.CreateTorus('relic-ring', { diameter: 0.72, thickness: 0.045, tessellation: 10 }, this.scene);
      ring.parent = node; ring.position.y = 0.42; ring.material = mat; ring.isPickable = false;
    } else {
      mesh = flat(MeshBuilder.CreateCylinder('potion-drop', { height: 0.48, diameterTop: 0.17, diameterBottom: 0.27, tessellation: 6 }, this.scene));
    }
    mesh.parent = node; mesh.position.y = 0.42; mesh.material = mat; mesh.isPickable = false;
    return { node, material: mat, mesh };
  }

  createTracer(start, end, hue = 316) {
    const delta = end.subtract(start);
    const distance = delta.length();
    if (distance <= 0.01) return;
    const mesh = MeshBuilder.CreateBox('shot-tracer', { width: 0.018, height: 0.018, depth: distance }, this.scene);
    const mat = simpleMaterial(this.scene, 'tracer-mat-' + Math.random(), hue, 0.95, 0.62, 1);
    mesh.material = mat;
    mesh.position.copyFrom(start.add(end).scale(0.5));
    mesh.lookAt(end);
    mesh.isPickable = false;
    setTimeout(() => { mesh.dispose(); mat.dispose(); }, 58);
  }

  setWeaponRecoil(value) {
    this.weaponRecoil = Math.max(this.weaponRecoil, value);
  }

  update(time, psyche = 0) {
    const hue = (this.floorHue + time * 5.5 + psyche * 120) % 360;
    this.lantern.diffuse = hslColor(hue, 0.74, 0.53);
    this.hemi.diffuse = hslColor((hue + 250) % 360, 0.32, 0.58);
    if (this.gate) {
      this.gate.ring.rotation.z = time * 0.22;
      this.gate.inner.rotation.y = -time * 0.7;
      this.gate.spires.forEach((spire, index) => { spire.rotation.y = time * (0.4 + index * 0.04); });
    }
    this.interactives.forEach((target, index) => {
      if (target.type === 'shrine' && !target.used) target.eye.rotation.y = time * 0.8 + index;
      if (target.type === 'chest' && !target.used) target.lock.rotation.y = -time * 1.2;
    });
    this.ambientProps.forEach((prop) => {
      if (prop.kind === 'spin' && prop.ring) prop.ring.rotation.z = time * prop.speed + prop.phase;
      else if (prop.kind === 'bob') prop.node.position.y = prop.baseY + Math.sin(time * prop.speed * 2 + prop.phase) * 0.035;
      else if (prop.kind === 'tilt') prop.node.rotation.z = Math.sin(time * prop.speed + prop.phase) * 0.045;
    });
    this.weaponRecoil += (0 - this.weaponRecoil) * 0.2;
    this.weaponKick += (this.weaponRecoil - this.weaponKick) * 0.45;
    this.weaponRoot.position.z = 0.72 - this.weaponKick * 0.11;
    this.weaponRoot.position.y = -0.31 - this.weaponKick * 0.025;
    this.weaponRoot.rotation.z = -0.03 + Math.sin(time * 2.6) * 0.006;
  }

  dispose() {
    this.clearDungeon();
    this.weaponRoot?.dispose(false, true);
    this.weaponMaterials?.forEach((material) => material.dispose(true, true));
    this.lantern?.dispose();
    this.hemi?.dispose();
  }
}
