import { Mesh, MeshBuilder, VertexData } from '@babylonjs/core';
import { clamp, hash2 } from './core.js';
import { mountainHeight } from './terrain.js';
import { snowSample, snowSurfaceHeight, snowSurfaceOffset, snowTint } from './snow.js';

export const CHUNK_SIZE = 56;

function buildSurfaceData(startX, startZ, size, segments, centered = false) {
  const step = size / segments;
  const originX = centered ? startX - size * 0.5 : startX;
  const originZ = centered ? startZ - size * 0.5 : startZ;
  const paddedRow = segments + 3;
  const base = new Float32Array(paddedRow * paddedRow);

  // One exact mountain sample per padded grid point. Normals then come from the
  // cached heightfield instead of evaluating the procedural massif four more times.
  for (let iz = -1; iz <= segments + 1; iz += 1) {
    for (let ix = -1; ix <= segments + 1; ix += 1) {
      const gx = originX + ix * step;
      const gz = originZ + iz * step;
      base[(iz + 1) * paddedRow + (ix + 1)] = mountainHeight(gx, gz);
    }
  }

  const verts = (segments + 1) * (segments + 1);
  const positions = new Array(verts * 3);
  const normals = new Array(verts * 3);
  const uvs = new Array(verts * 2);
  const colors = new Array(verts * 4);
  const indices = new Array(segments * segments * 6);
  let p = 0, uv = 0, c = 0;

  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const row = iz + 1, col = ix + 1;
      const h = base[row * paddedRow + col];
      let nx = -(base[row * paddedRow + col + 1] - base[row * paddedRow + col - 1]) / (step * 2);
      let ny = 1;
      let nz = -(base[(row + 1) * paddedRow + col] - base[(row - 1) * paddedRow + col]) / (step * 2);
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const n = { x: nx, y: ny, z: nz };
      const gx = originX + ix * step;
      const gz = originZ + iz * step;
      const sample = snowSample(gx, gz, n);
      const y = h + snowSurfaceOffset(gx, gz, sample);
      const tint = snowTint(sample);
      const slopeShade = clamp(1 - (1 - ny) * 0.33, 0.75, 1);
      const lx = centered ? ix * step - size * 0.5 : ix * step;
      const lz = centered ? iz * step - size * 0.5 : iz * step;

      positions[p] = lx; positions[p + 1] = y; positions[p + 2] = lz;
      normals[p] = nx; normals[p + 1] = ny; normals[p + 2] = nz; p += 3;
      uvs[uv] = gx * 0.036; uvs[uv + 1] = gz * 0.036; uv += 2;
      colors[c] = tint.r * slopeShade; colors[c + 1] = tint.g * slopeShade; colors[c + 2] = tint.b * slopeShade; colors[c + 3] = 1; c += 4;
    }
  }

  let q = 0;
  const row = segments + 1;
  for (let z = 0; z < segments; z += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
      indices[q++] = a; indices[q++] = d; indices[q++] = b;
      indices[q++] = b; indices[q++] = d; indices[q++] = e;
    }
  }
  return { positions, normals, uvs, colors, indices };
}

function applyData(mesh, data) {
  const vd = new VertexData();
  vd.positions = data.positions;
  vd.normals = data.normals;
  vd.uvs = data.uvs;
  vd.colors = data.colors;
  vd.indices = data.indices;
  vd.applyToMesh(mesh, true);
}

export class SnowWorld {
  constructor(scene, materials, quality) {
    this.scene = scene;
    this.materials = materials;
    this.quality = quality;
    this.active = new Map();
    this.pool = [];
    this.centerKey = '';
    this.pending = [];
    this.needed = new Set();
    this.offsetX = 0;
    this.offsetZ = 0;
    this.farMesh = new Mesh('firn-far-mountains', scene);
    this.farMesh.material = materials.far;
    this.farMesh.receiveShadows = false;
    this.farMesh.isPickable = false;
    this.farCenter = { cx: Number.NaN, cz: Number.NaN };

    this.rockBase = MeshBuilder.CreateIcoSphere('firn-rock-base', { radius: 1, subdivisions: 1, flat: true }, scene);
    this.rockBase.material = materials.rock;
    this.rockBase.position.y = -10000;
    this.rockBase.isPickable = false;
  }

  setQuality(quality) {
    if (this.quality.segments === quality.segments && this.quality.radius === quality.radius && this.quality.farSegments === quality.farSegments) {
      this.quality = quality;
      return;
    }
    this.quality = quality;
    for (const chunk of this.active.values()) this.disposeChunk(chunk);
    for (const chunk of this.pool) chunk.mesh.dispose();
    this.active.clear(); this.pool.length = 0; this.centerKey = '';
    this.pending.length = 0; this.needed.clear();
    this.farCenter.cx = Number.NaN;
  }

  disposeChunk(chunk) {
    for (const rock of chunk.rocks) rock.dispose();
    chunk.rocks.length = 0;
    chunk.mesh.dispose();
  }

  setOrigin(offsetX, offsetZ) {
    this.offsetX = offsetX; this.offsetZ = offsetZ;
    for (const chunk of this.active.values()) this.positionChunk(chunk);
    this.positionFar();
  }

  positionChunk(chunk) {
    chunk.mesh.position.x = chunk.cx * CHUNK_SIZE - this.offsetX;
    chunk.mesh.position.z = chunk.cz * CHUNK_SIZE - this.offsetZ;
    for (const rock of chunk.rocks) {
      const gx = rock.metadata.gx, gz = rock.metadata.gz;
      rock.position.x = gx - this.offsetX;
      rock.position.z = gz - this.offsetZ;
      rock.position.y = snowSurfaceHeight(gx, gz) - rock.metadata.bury;
    }
  }

  positionFar() {
    if (!Number.isFinite(this.farCenter.cx)) return;
    this.farMesh.position.x = (this.farCenter.cx + 0.5) * CHUNK_SIZE - this.offsetX;
    this.farMesh.position.z = (this.farCenter.cz + 0.5) * CHUNK_SIZE - this.offsetZ;
  }

  makeRocks(cx, cz) {
    const rocks = [];
    const count = hash2(cx, cz, 401) > 0.38 ? 1 + Math.floor(hash2(cx, cz, 403) * 3) : 0;
    for (let i = 0; i < count; i += 1) {
      const gx = (cx + 0.14 + hash2(cx * 17 + i, cz * 13, 407) * 0.72) * CHUNK_SIZE;
      const gz = (cz + 0.14 + hash2(cx * 11 + i, cz * 19, 409) * 0.72) * CHUNK_SIZE;
      const s = snowSample(gx, gz);
      if (s.depth > 0.56 && s.exposure < 0.32) continue;
      const rock = this.rockBase.createInstance(`rock-${cx}-${cz}-${i}`);
      const size = 0.55 + hash2(cx + i, cz - i, 419) * 1.45;
      rock.scaling.set(size * (0.7 + hash2(i, cx, 421) * 0.65), size * (0.55 + hash2(i, cz, 423) * 0.65), size);
      rock.rotation.set(hash2(i, cx, 425) * 0.7, hash2(i, cz, 427) * 6.28, hash2(cx, cz + i, 429) * 0.45);
      rock.metadata = { gx, gz, bury: 0.32 + s.depth * 0.22 };
      rock.receiveShadows = true;
      rock.isPickable = false;
      rocks.push(rock);
    }
    return rocks;
  }

  acquire(cx, cz) {
    const reused = this.pool.pop();
    const chunk = reused || { mesh: new Mesh('firn-chunk', this.scene), rocks: [], cx, cz };
    chunk.cx = cx; chunk.cz = cz;
    chunk.mesh.name = `firn-${cx}-${cz}`;
    chunk.mesh.setEnabled(true);
    chunk.mesh.material = this.materials.near;
    chunk.mesh.receiveShadows = true;
    applyData(chunk.mesh, buildSurfaceData(cx * CHUNK_SIZE, cz * CHUNK_SIZE, CHUNK_SIZE, this.quality.segments, false));
    chunk.rocks = this.makeRocks(cx, cz);
    this.positionChunk(chunk);
    return chunk;
  }

  release(key, chunk) {
    chunk.mesh.setEnabled(false);
    for (const rock of chunk.rocks) rock.dispose();
    chunk.rocks.length = 0;
    this.active.delete(key);
    this.pool.push(chunk);
  }

  get pendingCount() { return this.pending.length; }

  schedule(cx, cz) {
    this.needed.clear();
    const radius = this.quality.radius;
    const pending = [];
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tx = cx + dx, tz = cz + dz, key = `${tx},${tz}`;
        this.needed.add(key);
        if (!this.active.has(key)) pending.push({ cx: tx, cz: tz, key, distance: dx * dx + dz * dz });
      }
    }
    pending.sort((a, b) => a.distance - b.distance);
    this.pending = pending;
    for (const [key, chunk] of [...this.active]) if (!this.needed.has(key)) this.release(key, chunk);
  }

  update(globalX, globalZ, budget = 1) {
    const cx = Math.floor(globalX / CHUNK_SIZE), cz = Math.floor(globalZ / CHUNK_SIZE);
    const key = `${cx},${cz},${this.quality.radius},${this.quality.segments}`;
    let changed = false;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.schedule(cx, cz);
      this.rebuildFar(cx, cz);
      changed = true;
    }
    for (let i = 0; i < budget && this.pending.length; i += 1) {
      const next = this.pending.shift();
      if (!next || !this.needed.has(next.key) || this.active.has(next.key)) continue;
      this.active.set(next.key, this.acquire(next.cx, next.cz));
      changed = true;
    }
    return changed;
  }

  rebuildFar(cx, cz) {
    if (Math.abs(cx - this.farCenter.cx) < 2 && Math.abs(cz - this.farCenter.cz) < 2) return;
    this.farCenter = { cx, cz };
    const size = this.quality.farSize, segments = this.quality.farSegments;
    const centerGX = (cx + 0.5) * CHUNK_SIZE, centerGZ = (cz + 0.5) * CHUNK_SIZE;
    const data = buildSurfaceData(centerGX, centerGZ, size, segments, true);
    const nearHoleHalfExtent = Math.max(0.65, this.quality.radius - 0.18) * CHUNK_SIZE;
    const filtered = [];
    const row = segments + 1;
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const midX = (((x + 0.5) / segments) - 0.5) * size;
        const midZ = (((z + 0.5) / segments) - 0.5) * size;
        if (Math.abs(midX) < nearHoleHalfExtent && Math.abs(midZ) < nearHoleHalfExtent) continue;
        const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
        filtered.push(a, d, b, b, d, e);
      }
    }
    data.indices = filtered;
    applyData(this.farMesh, data);
    this.positionFar();
  }

  sampleHeight(globalX, globalZ) { return snowSurfaceHeight(globalX, globalZ); }
  sampleSnow(globalX, globalZ) { return snowSample(globalX, globalZ); }

  dispose() {
    for (const chunk of this.active.values()) this.disposeChunk(chunk);
    for (const chunk of this.pool) chunk.mesh.dispose();
    this.farMesh.dispose();
    this.rockBase.dispose();
  }
}
