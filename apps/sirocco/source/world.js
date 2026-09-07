import { Mesh, MeshBuilder, Vector3, VertexData } from '@babylonjs/core';
import { TERRAIN_CHUNK_SIZE, meshTerrainHeight, terrainHeight, terrainNormal, sandVariation } from './terrain.js';
import { clamp } from './core.js';

const CHUNK_SIZE = TERRAIN_CHUNK_SIZE;

export function appendBabylonGroundCell(indices, a, b, d, e) {
  indices.push(b, e, d, a, b, d);
}

function buildChunkData(cx, cz, segments, deformation = null) {
  const verts = (segments + 1) * (segments + 1);
  const positions = new Array(verts * 3);
  const normals = new Array(verts * 3).fill(0);
  const uvs = new Array(verts * 2);
  const colors = new Array(verts * 4);
  const indices = [];
  let p = 0, uv = 0, c = 0;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let iz = 0; iz <= segments; iz += 1) {
    const vz = iz / segments;
    for (let ix = 0; ix <= segments; ix += 1) {
      const vx = ix / segments;
      const lx = vx * CHUNK_SIZE;
      const lz = vz * CHUNK_SIZE;
      const gx = baseX + lx;
      const gz = baseZ + lz;
      const y = terrainHeight(gx, gz) + (deformation?.sampleOffset?.(gx, gz) ?? 0);
      const n = terrainNormal(gx, gz, 0.42);
      const variation = sandVariation(gx, gz);
      const slope = 1 - n.y;
      const brightness = clamp(0.96 + variation * 0.035 - slope * 0.13, 0.84, 1.05);
      positions[p] = lx; positions[p + 1] = y; positions[p + 2] = lz; p += 3;
      uvs[uv] = gx * 0.055; uvs[uv + 1] = gz * 0.055; uv += 2;
      colors[c] = brightness; colors[c + 1] = brightness * 0.995; colors[c + 2] = brightness * 0.975; colors[c + 3] = 1; c += 4;
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
  mesh.refreshBoundingInfo();
}

function createBoundary(scene) {
  return MeshBuilder.CreateLines('chunk-boundary', { points: [
    new Vector3(0, 0, 0), new Vector3(CHUNK_SIZE, 0, 0), new Vector3(CHUNK_SIZE, 0, CHUNK_SIZE),
    new Vector3(0, 0, CHUNK_SIZE), new Vector3(0, 0, 0)
  ], updatable: false }, scene);
}

export class DesertWorld {
  constructor(scene, materials, quality) {
    this.scene = scene;
    this.materials = materials;
    this.quality = quality;
    this.active = new Map();
    this.pool = [];
    this.boundaries = new Map();
    this.showBoundaries = false;
    this.showLod = false;
    this.centerKey = '';
    this.offsetX = 0;
    this.offsetZ = 0;
    this.sandPhysics = null;
    this.farMesh = new Mesh('far-desert', scene);
    this.farMesh.material = materials.far;
    this.farMesh.receiveShadows = true;
    this.farMesh.isPickable = false;
    this.farCenter = { cx: Number.NaN, cz: Number.NaN };
  }

  get activeChunkCount() { return this.active.size; }

  setSandPhysics(physics) {
    this.sandPhysics = physics;
  }

  setQuality(quality) {
    if (this.quality.segments === quality.segments && this.quality.radius === quality.radius && this.quality.farSegments === quality.farSegments) {
      this.quality = quality;
      return;
    }
    this.quality = quality;
    for (const chunk of this.active.values()) chunk.mesh.dispose();
    for (const chunk of this.pool) chunk.mesh.dispose();
    for (const line of this.boundaries.values()) line.dispose();
    this.active.clear();
    this.pool.length = 0;
    this.boundaries.clear();
    this.centerKey = '';
    this.farCenter.cx = Number.NaN;
  }

  setOrigin(offsetX, offsetZ) {
    this.offsetX = offsetX;
    this.offsetZ = offsetZ;
    for (const chunk of this.active.values()) this.positionChunk(chunk);
    for (const [key, line] of this.boundaries) {
      const [cx, cz] = key.split(',').map(Number);
      line.position.set(cx * CHUNK_SIZE - offsetX, this.sampleHeight(cx * CHUNK_SIZE, cz * CHUNK_SIZE) + 0.16, cz * CHUNK_SIZE - offsetZ);
    }
    this.positionFar();
  }

  positionChunk(chunk) {
    chunk.mesh.position.x = chunk.cx * CHUNK_SIZE - this.offsetX;
    chunk.mesh.position.z = chunk.cz * CHUNK_SIZE - this.offsetZ;
  }

  positionFar() {
    if (!Number.isFinite(this.farCenter.cx)) return;
    this.farMesh.position.x = (this.farCenter.cx + 0.5) * CHUNK_SIZE - this.offsetX;
    this.farMesh.position.z = (this.farCenter.cz + 0.5) * CHUNK_SIZE - this.offsetZ;
  }

  rebuildChunk(chunk) {
    applyData(chunk.mesh, buildChunkData(chunk.cx, chunk.cz, this.quality.segments, this.sandPhysics));
    this.positionChunk(chunk);
  }

  acquire(cx, cz) {
    const reused = this.pool.pop();
    const chunk = reused || { mesh: new Mesh('dune-chunk', this.scene), cx, cz };
    chunk.cx = cx;
    chunk.cz = cz;
    chunk.mesh.name = `dune-${cx}-${cz}`;
    chunk.mesh.setEnabled(true);
    chunk.mesh.material = this.materials.near;
    chunk.mesh.receiveShadows = true;
    chunk.mesh.isPickable = false;
    this.rebuildChunk(chunk);
    return chunk;
  }

  release(key, chunk) {
    chunk.mesh.setEnabled(false);
    this.active.delete(key);
    this.pool.push(chunk);
    const line = this.boundaries.get(key);
    if (line) { line.dispose(); this.boundaries.delete(key); }
  }

  update(globalX, globalZ) {
    const cx = Math.floor(globalX / CHUNK_SIZE), cz = Math.floor(globalZ / CHUNK_SIZE);
    const key = `${cx},${cz},${this.quality.radius},${this.quality.segments}`;
    if (key === this.centerKey) return false;
    this.centerKey = key;
    const needed = new Set(), radius = this.quality.radius;
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const k = `${cx + dx},${cz + dz}`;
        needed.add(k);
        if (!this.active.has(k)) this.active.set(k, this.acquire(cx + dx, cz + dz));
      }
    }
    for (const [k, chunk] of [...this.active]) if (!needed.has(k)) this.release(k, chunk);
    if (this.showBoundaries) this.rebuildBoundaries();
    this.rebuildFar(cx, cz);
    return true;
  }

  refreshDeformation(bounds) {
    if (!bounds) return 0;
    const minCx = Math.floor(bounds.minX / CHUNK_SIZE);
    const maxCx = Math.floor(bounds.maxX / CHUNK_SIZE);
    const minCz = Math.floor(bounds.minZ / CHUNK_SIZE);
    const maxCz = Math.floor(bounds.maxZ / CHUNK_SIZE);
    let rebuilt = 0;
    for (let cz = minCz; cz <= maxCz; cz += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const chunk = this.active.get(`${cx},${cz}`);
        if (!chunk) continue;
        this.rebuildChunk(chunk);
        rebuilt += 1;
      }
    }
    return rebuilt;
  }

  rebuildFar(cx, cz) {
    if (Math.abs(cx - this.farCenter.cx) < 2 && Math.abs(cz - this.farCenter.cz) < 2) return;
    this.farCenter = { cx, cz };
    const size = this.quality.farSize, segments = this.quality.farSegments;
    const centerGX = (cx + 0.5) * CHUNK_SIZE, centerGZ = (cz + 0.5) * CHUNK_SIZE;
    const nearHoleHalfExtent = this.quality.radius * CHUNK_SIZE;
    const positions = [], normals = [], uvs = [], colors = [], indices = [];
    for (let iz = 0; iz <= segments; iz += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        const vx = ix / segments, vz = iz / segments;
        const lx = (vx - 0.5) * size, lz = (vz - 0.5) * size;
        const gx = centerGX + lx, gz = centerGZ + lz;
        const y = terrainHeight(gx, gz) - 0.22;
        const n = terrainNormal(gx, gz, 1.4);
        positions.push(lx, y, lz);
        normals.push(n.x, n.y, n.z);
        uvs.push(gx * 0.055, gz * 0.055);
        const v = 0.97 + sandVariation(gx, gz) * 0.02;
        colors.push(v, v * 0.995, v * 0.98, 1);
      }
    }
    const row = segments + 1;
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const midX = (((x + 0.5) / segments) - 0.5) * size;
        const midZ = (((z + 0.5) / segments) - 0.5) * size;
        if (Math.abs(midX) < nearHoleHalfExtent && Math.abs(midZ) < nearHoleHalfExtent) continue;
        const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
        appendBabylonGroundCell(indices, a, b, d, e);
      }
    }
    applyData(this.farMesh, { positions, normals, uvs, colors, indices });
    this.positionFar();
  }

  rebuildBoundaries() {
    for (const line of this.boundaries.values()) line.dispose();
    this.boundaries.clear();
    if (!this.showBoundaries) return;
    for (const [key, chunk] of this.active) {
      const line = createBoundary(this.scene);
      line.color.set(0.15, 0.8, 1.0);
      line.position.set(chunk.cx * CHUNK_SIZE - this.offsetX, this.sampleHeight(chunk.cx * CHUNK_SIZE, chunk.cz * CHUNK_SIZE) + 0.16, chunk.cz * CHUNK_SIZE - this.offsetZ);
      line.isPickable = false;
      this.boundaries.set(key, line);
    }
  }

  setDebugBoundaries(enabled) { this.showBoundaries = enabled; this.rebuildBoundaries(); }
  setDebugLod(enabled) { this.showLod = enabled; this.farMesh.visibility = enabled ? 0.78 : 1; }

  sampleBaseHeight(globalX, globalZ) {
    return meshTerrainHeight(globalX, globalZ, this.quality.segments, CHUNK_SIZE);
  }

  sampleHeight(globalX, globalZ) {
    return this.sampleBaseHeight(globalX, globalZ) + (this.sandPhysics?.sampleOffset?.(globalX, globalZ) ?? 0);
  }

  sampleNormal(globalX, globalZ) {
    const step = Math.max(0.12, CHUNK_SIZE / this.quality.segments * 0.16);
    const hx0 = this.sampleHeight(globalX - step, globalZ);
    const hx1 = this.sampleHeight(globalX + step, globalZ);
    const hz0 = this.sampleHeight(globalX, globalZ - step);
    const hz1 = this.sampleHeight(globalX, globalZ + step);
    let nx = -(hx1 - hx0) / (step * 2), ny = 1, nz = -(hz1 - hz0) / (step * 2);
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    return { x: nx, y: ny, z: nz };
  }

  downhill(globalX, globalZ) {
    const n = this.sampleNormal(globalX, globalZ);
    const len = Math.hypot(n.x, n.z) || 1;
    return { x: n.x / len, z: n.z / len };
  }

  dispose() {
    for (const chunk of this.active.values()) chunk.mesh.dispose();
    for (const chunk of this.pool) chunk.mesh.dispose();
    for (const line of this.boundaries.values()) line.dispose();
    this.farMesh.dispose();
  }
}

export { CHUNK_SIZE };
