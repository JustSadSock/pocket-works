import { Mesh, VertexData } from '@babylonjs/core';
import { clamp } from './core.js';
import { appendBabylonGroundCell } from './world.js';

export class LocalSandSurface {
  constructor(scene, world, sand, material, preset) {
    this.scene = scene;
    this.world = world;
    this.sand = sand;
    this.material = material;
    this.mesh = new Mesh('local-physical-sand', scene);
    this.mesh.material = material;
    // This mesh is not a second terrain layer anymore. It only contains cells
    // around actual deformation, so it must not create its own shadow island.
    this.mesh.receiveShadows = false;
    this.mesh.isPickable = false;
    this.centerX = Number.NaN;
    this.centerZ = Number.NaN;
    this.localCenterX = 0;
    this.localCenterZ = 0;
    this.lastBuildX = Number.NaN;
    this.lastBuildZ = Number.NaN;
    this.dirty = true;
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.radius = preset.id === 'high' ? 5.6 : preset.id === 'medium' ? 5.0 : 4.2;
    this.segments = preset.id === 'high' ? 50 : preset.id === 'medium' ? 42 : 32;
    this.rebuildDistance = preset.id === 'high' ? 0.52 : preset.id === 'medium' ? 0.68 : 0.85;
    this.dirty = true;
  }

  markDirty() { this.dirty = true; }

  sampleHeight(x, z) {
    const base = this.world.sampleBaseHeight(x, z);
    return base + clamp(this.sand.sampleOffset(x, z), -0.065, 0.045);
  }

  sampleNormal(x, z) {
    const step = 0.09;
    const hx0 = this.sampleHeight(x - step, z), hx1 = this.sampleHeight(x + step, z);
    const hz0 = this.sampleHeight(x, z - step), hz1 = this.sampleHeight(x, z + step);
    let nx = -(hx1 - hx0) / (step * 2), ny = 1, nz = -(hz1 - hz0) / (step * 2);
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    return { x: nx, y: ny, z: nz };
  }

  downhill(x, z) {
    const n = this.sampleNormal(x, z);
    const len = Math.hypot(n.x, n.z) || 1;
    return { x: n.x / len, z: n.z / len };
  }

  update(controller, force = false) {
    this.centerX = controller.globalX;
    this.centerZ = controller.globalZ;
    this.localCenterX = controller.localPosition.x;
    this.localCenterZ = controller.localPosition.z;
    const moved = !Number.isFinite(this.lastBuildX) || Math.hypot(this.centerX - this.lastBuildX, this.centerZ - this.lastBuildZ) >= this.rebuildDistance;
    if (!force && !this.dirty && !moved) return false;
    this.rebuild();
    return true;
  }

  deformationNear(x, z, step) {
    let strongest = 0;
    for (let oz = -1; oz <= 1; oz += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        strongest = Math.max(strongest, Math.abs(this.sand.sampleOffset(x + ox * step, z + oz * step)));
      }
    }
    return strongest;
  }

  rebuild() {
    const segments = this.segments;
    const diameter = this.radius * 2;
    const step = diameter / segments;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const colors = [];

    // Build independent quads only where sand has actually moved. The previous
    // full disc duplicated the terrain under the player and therefore produced
    // the persistent dark circular region the user was seeing.
    for (let iz = 0; iz < segments; iz += 1) {
      const z0 = -this.radius + iz * step;
      const z1 = z0 + step;
      for (let ix = 0; ix < segments; ix += 1) {
        const x0 = -this.radius + ix * step;
        const x1 = x0 + step;
        const cx = this.centerX + (x0 + x1) * 0.5;
        const cz = this.centerZ + (z0 + z1) * 0.5;
        if (Math.hypot((x0 + x1) * 0.5, (z0 + z1) * 0.5) > this.radius) continue;
        if (this.deformationNear(cx, cz, step) < 0.00045) continue;

        const local = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
        const baseIndex = positions.length / 3;
        for (const [lx, lz] of local) {
          const gx = this.centerX + lx;
          const gz = this.centerZ + lz;
          const deformation = clamp(this.sand.sampleOffset(gx, gz), -0.065, 0.045);
          // A tiny local lift avoids z-fighting against the coarse terrain, but
          // unlike the old 5 cm disc this exists only around moved sand.
          const y = this.world.sampleBaseHeight(gx, gz) + deformation + 0.0015;
          positions.push(lx, y, lz);
          normals.push(0, 1, 0);
          uvs.push(gx * 0.055, gz * 0.055);
          colors.push(1, 1, 1, 1);
        }
        appendBabylonGroundCell(indices, baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3);
      }
    }

    if (positions.length > 0) VertexData.ComputeNormals(positions, indices, normals);
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.colors = colors;
    vd.indices = indices;
    vd.applyToMesh(this.mesh, true);
    this.mesh.position.x = this.centerX - this.world.offsetX;
    this.mesh.position.z = this.centerZ - this.world.offsetZ;
    this.mesh.refreshBoundingInfo();
    this.lastBuildX = this.centerX;
    this.lastBuildZ = this.centerZ;
    this.dirty = false;
  }

  syncOrigin() {
    if (!Number.isFinite(this.centerX)) return;
    this.mesh.position.x = this.centerX - this.world.offsetX;
    this.mesh.position.z = this.centerZ - this.world.offsetZ;
  }

  dispose() { this.mesh.dispose(); }
}
