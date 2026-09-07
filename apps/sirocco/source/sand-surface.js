import { Mesh, VertexData } from '@babylonjs/core';
import { clamp } from './core.js';
import { appendBabylonGroundCell } from './world.js';

export class LocalSandSurface {
  constructor(scene, world, sand, material, preset) {
    this.scene = scene;
    this.world = world;
    this.sand = sand;
    this.material = material;
    this.mesh = new Mesh('local-physical-sand-replacement', scene);
    this.mesh.material = material;
    this.mesh.receiveShadows = false;
    this.mesh.isPickable = false;
    this.centerX = Number.NaN;
    this.centerZ = Number.NaN;
    this.lastBuildX = Number.NaN;
    this.lastBuildZ = Number.NaN;
    this.replacementRadius = Number.NaN;
    this.dirty = true;
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.radius = preset.id === 'high' ? 5.4 : preset.id === 'medium' ? 4.8 : 4.0;
    this.segments = preset.id === 'high' ? 96 : preset.id === 'medium' ? 72 : 52;
    this.snapStep = preset.id === 'high' ? 0.9 : preset.id === 'medium' ? 1.1 : 1.35;
    this.dirty = true;
  }

  markDirty() { this.dirty = true; }

  sampleHeight(x, z) {
    const base = this.world.sampleBaseHeight(x, z);
    return base + clamp(this.sand.sampleOffset(x, z), -0.095, 0.065);
  }

  sampleNormal(x, z) {
    const step = 0.075;
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
    const snappedX = Math.round(controller.globalX / this.snapStep) * this.snapStep;
    const snappedZ = Math.round(controller.globalZ / this.snapStep) * this.snapStep;
    const moved = !Number.isFinite(this.centerX) || snappedX !== this.centerX || snappedZ !== this.centerZ;
    const radiusChanged = !Number.isFinite(this.replacementRadius) || this.replacementRadius !== this.radius;
    if (moved || radiusChanged) {
      this.centerX = snappedX;
      this.centerZ = snappedZ;
      this.world.setLocalReplacement(this.centerX, this.centerZ, this.radius);
      this.replacementRadius = this.radius;
      this.dirty = true;
    }
    if (!force && !this.dirty) return false;
    this.rebuild();
    return true;
  }

  rebuild() {
    const segments = this.segments;
    const diameter = this.radius * 2;
    const step = diameter / segments;
    const positions = new Array((segments + 1) * (segments + 1) * 3);
    const normals = new Array((segments + 1) * (segments + 1) * 3).fill(0);
    const uvs = new Array((segments + 1) * (segments + 1) * 2);
    const indices = [];
    let p = 0, uv = 0;

    for (let iz = 0; iz <= segments; iz += 1) {
      const lz = -this.radius + iz * step;
      for (let ix = 0; ix <= segments; ix += 1) {
        const lx = -this.radius + ix * step;
        const gx = this.centerX + lx;
        const gz = this.centerZ + lz;
        const deformation = clamp(this.sand.sampleOffset(gx, gz), -0.095, 0.065);
        const edge = Math.max(Math.abs(lx), Math.abs(lz)) / this.radius;
        const edgeLift = edge > 0.82 ? ((edge - 0.82) / 0.18) * 0.0008 : 0;
        positions[p] = lx;
        positions[p + 1] = this.world.sampleBaseHeight(gx, gz) + deformation + edgeLift;
        positions[p + 2] = lz;
        p += 3;
        uvs[uv] = gx * 0.055;
        uvs[uv + 1] = gz * 0.055;
        uv += 2;
      }
    }

    const row = segments + 1;
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
        appendBabylonGroundCell(indices, a, b, d, e);
      }
    }

    VertexData.ComputeNormals(positions, indices, normals);
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.uvs = uvs;
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
