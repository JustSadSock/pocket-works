import { Color4, Mesh, MeshBuilder, Vector3, VertexData } from '@babylonjs/core';
import { terrainHeight, terrainNormal, sandVariation } from './terrain.js';
import { clamp } from './core.js';

const CHUNK_SIZE = 42;

function buildChunkData(cx, cz, segments) {
  const verts = (segments + 1) * (segments + 1);
  const positions = new Array(verts * 3);
  const normals = new Array(verts * 3);
  const uvs = new Array(verts * 2);
  const colors = new Array(verts * 4);
  const indices = new Array(segments * segments * 6);
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
      const y = terrainHeight(gx, gz);
      const n = terrainNormal(gx, gz, 0.42);
      const variation = sandVariation(gx, gz);
      const slope = 1 - n.y;
      const brightness = clamp(0.94 + variation * 0.045 - slope * 0.16, 0.82, 1.06);

      positions[p] = lx; positions[p + 1] = y; positions[p + 2] = lz;
      normals[p] = n.x; normals[p + 1] = n.y; normals[p + 2] = n.z;
      p += 3;
      uvs[uv] = gx * 0.027; uvs[uv + 1] = gz * 0.027; uv += 2;
      colors[c] = brightness; colors[c + 1] = brightness * 0.99; colors[c + 2] = brightness * 0.96; colors[c + 3] = 1; c += 4;
    }
  }

  let q = 0;
  const row = segments + 1;
  for (let z = 0; z < segments; z += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = z * row + x;
      const b = a + 1;
      const d = a + row;
      const e = d + 1;
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

function createBoundary(scene) {
  return MeshBuilder.CreateLines('chunk-boundary', {
    points: [
      new Vector3(0, 0, 0), new Vector3(CHUNK_SIZE, 0, 0),
      new Vector3(CHUNK_SIZE, 0, CHUNK_SIZE), new Vector3(0, 0, CHUNK_SIZE), new Vector3(0, 0, 0)
    ],
    updatable: false
  }, scene);
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
    this.farMesh = new Mesh('far-desert', scene);
    this.farMesh.material = materials.far;
    this.farMesh.receiveShadows = true;
    this.farCenter = { cx: Number.NaN, cz: Number.NaN };
  }

  get activeChunkCount() { return this.active.size; }

  setQuality(quality) {
    if (this.quality.segments === quality.segments && this.quality.radius === quality.radius && this.quality.farSegments === quality.farSegments) {
      this.quality = quality;
      return;
    }
    this.quality = quality;
    for (const chunk of this.active.values()) chunk.mesh.dispose();
    for (const chunk of this.pool) chunk.mesh.dispose();
    for (const line of this.boundaries.values()) line.dispose();
    this.active.clear(); this.pool.length = 0; this.boundaries.clear();
    this.centerKey = '';
    this.farCenter.cx = Number.NaN;
  }

  setOrigin(offsetX, offsetZ) {
    this.offsetX = offsetX;
    this.offsetZ = offsetZ;
    for (const chunk of this.active.values()) this.positionChunk(chunk);
    for (const [key, line] of this.boundaries) {
      const [cx, cz] = key.split(',').map(Number);
      line.position.set(cx * CHUNK_SIZE - offsetX, terrainHeight(cx * CHUNK_SIZE, cz * CHUNK_SIZE) + 0.16, cz * CHUNK_SIZE - offsetZ);
    }
    this.positionFar();
  }

  positionChunk(chunk) {
    chunk.mesh.position.x = chunk.cx * CHUNK_SIZE - this.offsetX;
    chunk.mesh.position.z = chunk.cz * CHUNK_SIZE - this.offsetZ;
  }

  positionFar() {
    if (!Number.isFinite(this.farCenter.cx)) return;
    this.farMesh.position.x = this.farCenter.cx * CHUNK_SIZE - this.offsetX;
    this.farMesh.position.z = this.farCenter.cz * CHUNK_SIZE - this.offsetZ;
  }

  acquire(cx, cz) {
    const reused = this.pool.pop();
    const chunk = reused || { mesh: new Mesh('dune-chunk', this.scene), cx, cz };
    chunk.cx = cx; chunk.cz = cz;
    chunk.mesh.name = `dune-${cx}-${cz}`;
    chunk.mesh.setEnabled(true);
    chunk.mesh.material = this.materials.near;
    chunk.mesh.receiveShadows = true;
    applyData(chunk.mesh, buildChunkData(cx, cz, this.quality.segments));
    this.positionChunk(chunk);
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
    const cx = Math.floor(globalX / CHUNK_SIZE);
    const cz = Math.floor(globalZ / CHUNK_SIZE);
    const key = `${cx},${cz},${this.quality.radius},${this.quality.segments}`;
    if (key === this.centerKey) return false;
    this.centerKey = key;

    const needed = new Set();
    const radius = this.quality.radius;
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

  rebuildFar(cx, cz) {
    if (Math.abs(cx - this.farCenter.cx) < 2 && Math.abs(cz - this.farCenter.cz) < 2) return;
    this.farCenter = { cx, cz };
    const size = this.quality.farSize;
    const segments = this.quality.farSegments;
    const centerGX = cx * CHUNK_SIZE;
    const centerGZ = cz * CHUNK_SIZE;
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    for (let iz = 0; iz <= segments; iz += 1) {
      const vz = iz / segments;
      for (let ix = 0; ix <= segments; ix += 1) {
        const vx = ix / segments;
        const lx = (vx - 0.5) * size;
        const lz = (vz - 0.5) * size;
        const gx = centerGX + lx;
        const gz = centerGZ + lz;
        const y = terrainHeight(gx, gz) - 0.1;
        const n = terrainNormal(gx, gz, 1.4);
        positions.push(lx, y, lz);
        normals.push(n.x, n.y, n.z);
        uvs.push(gx * 0.027, gz * 0.027);
        const v = 0.95 + sandVariation(gx, gz) * 0.025;
        colors.push(v, v * 0.99, v * 0.96, 1);
      }
    }
    const row = segments + 1;
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
        indices.push(a, d, b, b, d, e);
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
      line.position.set(chunk.cx * CHUNK_SIZE - this.offsetX, terrainHeight(chunk.cx * CHUNK_SIZE, chunk.cz * CHUNK_SIZE) + 0.16, chunk.cz * CHUNK_SIZE - this.offsetZ);
      line.isPickable = false;
      this.boundaries.set(key, line);
    }
  }

  setDebugBoundaries(enabled) {
    this.showBoundaries = enabled;
    this.rebuildBoundaries();
  }

  setDebugLod(enabled) {
    this.showLod = enabled;
    this.farMesh.visibility = enabled ? 0.78 : 1;
  }

  sampleHeight(globalX, globalZ) { return terrainHeight(globalX, globalZ); }
  sampleNormal(globalX, globalZ) { return terrainNormal(globalX, globalZ); }

  dispose() {
    for (const chunk of this.active.values()) chunk.mesh.dispose();
    for (const chunk of this.pool) chunk.mesh.dispose();
    for (const line of this.boundaries.values()) line.dispose();
    this.farMesh.dispose();
  }
}

export { CHUNK_SIZE };
