import { Mesh, MeshBuilder, VertexData } from '@babylonjs/core';
import { clamp, lerp } from './core.js';
import { snowSample, snowSurfaceHeight, snowTint } from './snow.js';
import { terrainNormal } from './terrain.js';
import { appendBabylonGroundCell } from './mesh.js';

function bilerp(a, b, c, d, tx, tz) {
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export class SnowDeformationPatch {
  constructor(scene, materials, quality) {
    this.scene = scene;
    this.material = materials.near;
    this.trackMaterial = materials.track;
    this.mesh = new Mesh('firn-local-deformation', scene);
    this.mesh.material = materials.near;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = false;
    this.entries = [];
    this.marks = [];
    this.offsetX = 0; this.offsetZ = 0;
    this.centerGX = 0; this.centerGZ = 0;
    this.dirty = true;
    this.markBase = MeshBuilder.CreateGround('firn-footprint-source', { width: 0.3, height: 0.66, subdivisions: 1 }, scene);
    this.markBase.material = materials.track;
    this.markBase.position.y = -10000;
    this.markBase.isPickable = false;
    this.setQuality(quality);
  }

  setQuality(quality) {
    this.size = quality.key === 'high' ? 12.5 : quality.key === 'medium' ? 11.5 : 10.5;
    this.segments = quality.key === 'high' ? 58 : quality.key === 'medium' ? 48 : 40;
    this.coarseSegments = quality.key === 'high' ? 11 : quality.key === 'medium' ? 9 : 8;
    this.limit = quality.trackLimit;
    while (this.entries.length > this.limit) this.removeOldest();
    this.dirty = true;
  }

  setOrigin(offsetX, offsetZ) {
    this.offsetX = offsetX; this.offsetZ = offsetZ;
    for (const mark of this.marks) this.positionMark(mark);
    this.dirty = true;
  }

  positionMark(mark) {
    const n = terrainNormal(mark.entry.x, mark.entry.z, 0.65);
    mark.mesh.position.x = mark.entry.x - this.offsetX;
    mark.mesh.position.z = mark.entry.z - this.offsetZ;
    mark.mesh.position.y = snowSurfaceHeight(mark.entry.x, mark.entry.z) - Math.min(0.025, mark.entry.depth * 0.2);
    mark.mesh.rotation.x = Math.atan2(n.z, n.y);
    mark.mesh.rotation.y = mark.entry.yaw;
    mark.mesh.rotation.z = -Math.atan2(n.x, n.y);
  }

  removeOldest() {
    const entry = this.entries.shift();
    if (!entry) return;
    if (entry.mark) {
      const idx = this.marks.indexOf(entry.mark);
      if (idx >= 0) this.marks.splice(idx, 1);
      entry.mark.mesh.dispose();
    }
  }

  addFootprint(landing) {
    const sinkDepth = Number.isFinite(landing.sinkDepth) ? landing.sinkDepth : landing.sink * 0.28;
    const depth = clamp(0.025 + sinkDepth * 0.58 + landing.powder * 0.018, 0.025, 0.19);
    const entry = {
      type: 'foot', x: landing.globalX, z: landing.globalZ, yaw: landing.yaw,
      rx: 0.16 + landing.sink * 0.025,
      rz: 0.33 + landing.sink * 0.12,
      depth, mark: null
    };
    const mesh = this.markBase.createInstance(`firn-step-${this.entries.length}-${Date.now() % 100000}`);
    mesh.isPickable = false;
    mesh.scaling.x = 0.92 + landing.sink * 0.22;
    mesh.scaling.z = 0.92 + landing.sink * 0.3;
    const mark = { mesh, entry };
    entry.mark = mark;
    this.entries.push(entry);
    this.marks.push(mark);
    this.positionMark(mark);
    while (this.entries.length > this.limit) this.removeOldest();
    this.dirty = true;
  }

  addScar(globalX, globalZ, yaw, strength = 1) {
    const entry = {
      type: 'scar', x: globalX, z: globalZ, yaw,
      rx: 0.36 + strength * 0.22,
      rz: 1.0 + strength * 0.9,
      depth: 0.035 + strength * 0.045,
      mark: null
    };
    this.entries.push(entry);
    while (this.entries.length > this.limit) this.removeOldest();
    this.dirty = true;
  }

  deformationAt(gx, gz) {
    let depression = 0, compression = 0;
    for (const e of this.entries) {
      const bound = e.rz * 1.4;
      if (Math.abs(gx - e.x) > bound || Math.abs(gz - e.z) > bound) continue;
      const dx = gx - e.x, dz = gz - e.z;
      const c = Math.cos(e.yaw), s = Math.sin(e.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const d = (lx * lx) / (e.rx * e.rx) + (lz * lz) / (e.rz * e.rz);
      if (d >= 1) continue;
      const w = (1 - d) ** 2;
      depression += e.depth * w;
      compression = Math.max(compression, w);
    }
    return { depression: clamp(depression, 0, 0.22), compression };
  }

  buildCoarseField() {
    const seg = this.coarseSegments;
    const row = seg + 1;
    const count = row * row;
    const heights = new Float32Array(count);
    const nx = new Float32Array(count), ny = new Float32Array(count), nz = new Float32Array(count);
    const tr = new Float32Array(count), tg = new Float32Array(count), tb = new Float32Array(count);
    for (let iz = 0; iz <= seg; iz += 1) {
      for (let ix = 0; ix <= seg; ix += 1) {
        const gx = this.centerGX + (ix / seg - 0.5) * this.size;
        const gz = this.centerGZ + (iz / seg - 0.5) * this.size;
        const n = terrainNormal(gx, gz, 0.55);
        const sample = snowSample(gx, gz, n);
        const tint = snowTint(sample);
        const i = iz * row + ix;
        heights[i] = snowSurfaceHeight(gx, gz, sample);
        nx[i] = n.x; ny[i] = n.y; nz[i] = n.z;
        tr[i] = tint.r; tg[i] = tint.g; tb[i] = tint.b;
      }
    }
    return { seg, row, heights, nx, ny, nz, tr, tg, tb };
  }

  sampleCoarse(field, vx, vz) {
    const fx = clamp(vx, 0, 1) * field.seg;
    const fz = clamp(vz, 0, 1) * field.seg;
    const x0 = Math.min(field.seg - 1, Math.floor(fx));
    const z0 = Math.min(field.seg - 1, Math.floor(fz));
    const tx = fx - x0, tz = fz - z0;
    const a = z0 * field.row + x0, b = a + 1, c = a + field.row, d = c + 1;
    let nx = bilerp(field.nx[a], field.nx[b], field.nx[c], field.nx[d], tx, tz);
    let ny = bilerp(field.ny[a], field.ny[b], field.ny[c], field.ny[d], tx, tz);
    let nz = bilerp(field.nz[a], field.nz[b], field.nz[c], field.nz[d], tx, tz);
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    return {
      y: bilerp(field.heights[a], field.heights[b], field.heights[c], field.heights[d], tx, tz),
      nx, ny, nz,
      r: bilerp(field.tr[a], field.tr[b], field.tr[c], field.tr[d], tx, tz),
      g: bilerp(field.tg[a], field.tg[b], field.tg[c], field.tg[d], tx, tz),
      b: bilerp(field.tb[a], field.tb[b], field.tb[c], field.tb[d], tx, tz)
    };
  }

  update(_dt, globalX, globalZ) {
    const moved = Math.hypot(globalX - this.centerGX, globalZ - this.centerGZ) > 0.64;
    if (!this.dirty && !moved) return;
    this.centerGX = globalX; this.centerGZ = globalZ; this.dirty = false;
    this.rebuild();
  }

  rebuild() {
    const seg = this.segments, size = this.size, half = size * 0.5;
    const field = this.buildCoarseField();
    const positions = [], normals = [], uvs = [], colors = [], indices = [];
    for (let iz = 0; iz <= seg; iz += 1) {
      const vz = iz / seg;
      for (let ix = 0; ix <= seg; ix += 1) {
        const vx = ix / seg;
        const lx = (vx - 0.5) * size, lz = (vz - 0.5) * size;
        const gx = this.centerGX + lx, gz = this.centerGZ + lz;
        const edgeDistance = Math.min(half - Math.abs(lx), half - Math.abs(lz));
        const edge = clamp(edgeDistance / 1.15, 0, 1);
        const lift = 0.004 + edge * 0.003;
        const base = this.sampleCoarse(field, vx, vz);
        const def = this.deformationAt(gx, gz);
        const dark = 1 - def.compression * 0.2;
        positions.push(lx, base.y + lift - def.depression, lz);
        normals.push(base.nx, base.ny, base.nz);
        uvs.push(gx * 0.04, gz * 0.04);
        colors.push(base.r * dark, base.g * dark, base.b * dark, 1);
      }
    }
    const row = seg + 1;
    for (let z = 0; z < seg; z += 1) for (let x = 0; x < seg; x += 1) {
      const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
      appendBabylonGroundCell(indices, a, b, d, e);
    }
    const vd = new VertexData();
    vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.colors = colors; vd.indices = indices;
    vd.applyToMesh(this.mesh, true);
    this.mesh.position.set(this.centerGX - this.offsetX, 0, this.centerGZ - this.offsetZ);
  }

  dispose() {
    for (const mark of this.marks) mark.mesh.dispose();
    this.marks.length = 0;
    this.entries.length = 0;
    this.markBase.dispose();
    this.mesh.dispose();
  }
}
