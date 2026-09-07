import { Mesh, VertexData } from '@babylonjs/core';
import { clamp, smoothstep } from './core.js';
import { appendBabylonGroundCell } from './world.js';

export class LocalSandSurface {
  constructor(scene, world, sand, material, preset) {
    this.scene = scene;
    this.world = world;
    this.sand = sand;
    this.material = material;
    this.mesh = new Mesh('local-physical-sand', scene);
    this.mesh.material = material;
    this.mesh.receiveShadows = true;
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
    this.radius = preset.id === 'high' ? 5.4 : preset.id === 'medium' ? 4.8 : 4.0;
    this.segments = preset.id === 'high' ? 46 : preset.id === 'medium' ? 38 : 28;
    this.rebuildDistance = preset.id === 'high' ? 0.62 : preset.id === 'medium' ? 0.78 : 0.95;
    this.dirty = true;
  }

  markDirty() { this.dirty = true; }

  fadeAt(x, z) {
    if (!Number.isFinite(this.centerX)) return 0;
    const d = Math.hypot(x - this.centerX, z - this.centerZ);
    return 1 - smoothstep(this.radius * 0.68, this.radius, d);
  }

  sampleHeight(x, z) {
    const fade = this.fadeAt(x, z);
    if (fade <= 0.001) return this.world.sampleHeight(x, z);
    const base = this.world.sampleBaseHeight(x, z);
    const deformation = clamp(this.sand.sampleOffset(x, z), -0.042, 0.038);
    // Keep the local physical sheet just above the coarse base mesh so deep
    // footprints never reveal/intersect the underlying low-resolution terrain.
    const lift = 0.006 + 0.044 * fade;
    return base + lift + deformation * fade;
  }

  sampleNormal(x, z) {
    const step = 0.105;
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

  rebuild() {
    const segments = this.segments;
    const diameter = this.radius * 2;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const colors = [];

    for (let iz = 0; iz <= segments; iz += 1) {
      const vz = iz / segments;
      const lz = (vz - 0.5) * diameter;
      for (let ix = 0; ix <= segments; ix += 1) {
        const vx = ix / segments;
        const lx = (vx - 0.5) * diameter;
        const gx = this.centerX + lx;
        const gz = this.centerZ + lz;
        const d = Math.hypot(lx, lz);
        const fade = 1 - smoothstep(this.radius * 0.68, this.radius, d);
        const base = this.world.sampleBaseHeight(gx, gz);
        const deformation = clamp(this.sand.sampleOffset(gx, gz), -0.042, 0.038);
        const y = base + 0.006 + 0.044 * fade + deformation * fade;
        positions.push(lx, y, lz);
        normals.push(0, 1, 0);
        uvs.push(gx * 0.055, gz * 0.055);
        const edge = 0.985 + fade * 0.015;
        colors.push(edge, edge, edge * 0.99, 1);
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
