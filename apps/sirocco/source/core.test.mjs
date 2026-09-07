import assert from 'node:assert/strict';
import { fbm2, hash2 } from './core.js';
import { TERRAIN_CHUNK_SIZE, meshTerrainHeight, meshTerrainNormal, terrainHeight, terrainNormal, terrainSlope } from './terrain.js';

const a = terrainHeight(123.456, -98.25);
assert.equal(a, terrainHeight(123.456, -98.25), 'terrain must be deterministic');
assert.notEqual(hash2(1, 2, 3), hash2(1, 2, 4), 'seed must affect hashes');
assert.ok(Number.isFinite(fbm2(1000, -3000, 9, 5)), 'fbm must remain finite far from origin');

for (let i = -7; i <= 7; i += 1) {
  const x = i * TERRAIN_CHUNK_SIZE;
  const left = terrainHeight(x - 1e-7, 17.25);
  const right = terrainHeight(x + 1e-7, 17.25);
  assert.ok(Math.abs(left - right) < 1e-4, 'analytical chunk boundaries must be continuous');
  const meshLeft = meshTerrainHeight(x - 1e-7, 17.25, 42);
  const meshRight = meshTerrainHeight(x + 1e-7, 17.25, 42);
  assert.ok(Math.abs(meshLeft - meshRight) < 1e-4, 'rendered chunk boundaries must be continuous');
  const vertexHeight = meshTerrainHeight(x, i * TERRAIN_CHUNK_SIZE, 42);
  assert.ok(Math.abs(vertexHeight - terrainHeight(x, i * TERRAIN_CHUNK_SIZE)) < 1e-8, 'rendered sampler must match terrain vertices exactly');
  const n = terrainNormal(x, i * 11);
  assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-6, 'normal must be normalized');
  const meshN = meshTerrainNormal(x + 0.31, i * 11 + 0.27, 42);
  assert.ok(Math.abs(Math.hypot(meshN.x, meshN.y, meshN.z) - 1) < 1e-6, 'rendered normal must be normalized');
  const slope = terrainSlope(x, i * 11);
  assert.ok(slope >= 0 && slope < Math.PI / 2, 'desert slopes must remain walkable');
}

console.log('SIROCCO core tests: deterministic terrain, rendered-surface continuity and normals OK');
