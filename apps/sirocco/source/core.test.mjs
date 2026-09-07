import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fbm2, hash2 } from './core.js';
import { TERRAIN_CHUNK_SIZE, meshTerrainHeight, terrainHeight, terrainNormal, terrainSlope } from './terrain.js';
import { babylonXZCellIndices } from './grid-winding.js';

const a = terrainHeight(123.456, -98.25);
assert.equal(a, terrainHeight(123.456, -98.25), 'terrain must be deterministic');
assert.notEqual(hash2(1, 2, 3), hash2(1, 2, 4), 'seed must affect hashes');
assert.ok(Number.isFinite(fbm2(1000, -3000, 9, 5)), 'fbm must remain finite far from origin');

for (let i = -7; i <= 7; i += 1) {
  const x = i * TERRAIN_CHUNK_SIZE;
  const left = terrainHeight(x - 1e-7, 17.25);
  const right = terrainHeight(x + 1e-7, 17.25);
  assert.ok(Math.abs(left - right) < 1e-4, 'chunk boundaries must be continuous');
  const n = terrainNormal(x, i * 11);
  assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-6, 'normal must be normalized');
  const slope = terrainSlope(x, i * 11);
  assert.ok(slope >= 0 && slope < Math.PI / 2, 'desert slopes must remain walkable');
}

// Babylon's built-in TiledGround uses [b,e,d, a,b,d] when rows increase
// toward +Z. The conventional RH cross product therefore has negative Y for
// both triangles. Reversing this order is exactly what caused SIROCCO 1.0.0-
// 1.0.3 to render the TOP of every dune as a culled back face.
const cell = {
  a: { x: 0, y: 0.1, z: 0 },
  b: { x: 1, y: 0.3, z: 0 },
  d: { x: 0, y: 0.2, z: 1 },
  e: { x: 1, y: 0.4, z: 1 }
};
const ids = babylonXZCellIndices(0, 1, 2, 3);
assert.deepEqual(ids, [1, 3, 2, 0, 1, 2], 'XZ grid must match Babylon TiledGround winding');
const verts = [cell.a, cell.b, cell.d, cell.e];
function crossY(i0, i1, i2) {
  const p0 = verts[i0], p1 = verts[i1], p2 = verts[i2];
  const ux = p1.x - p0.x, uz = p1.z - p0.z;
  const vx = p2.x - p0.x, vz = p2.z - p0.z;
  return uz * vx - ux * vz;
}
assert.ok(crossY(ids[0], ids[1], ids[2]) < 0, 'first triangle must be Babylon top/front winding');
assert.ok(crossY(ids[3], ids[4], ids[5]) < 0, 'second triangle must be Babylon top/front winding');

// The controller surface must remain exactly on the piecewise-linear mesh and
// never return NaN or large discontinuities while crossing chunk boundaries.
for (const segments of [24, 32, 42]) {
  for (let i = -20; i <= 20; i += 1) {
    const z = i * 3.137;
    const boundary = TERRAIN_CHUNK_SIZE;
    const h0 = meshTerrainHeight(boundary - 1e-6, z, segments);
    const h1 = meshTerrainHeight(boundary + 1e-6, z, segments);
    assert.ok(Number.isFinite(h0) && Number.isFinite(h1), 'mesh surface must stay finite');
    assert.ok(Math.abs(h0 - h1) < 1e-3, 'mesh surface must stay continuous at streamed chunk boundaries');
  }
}

// Static guard: all three custom XZ grids must use top-facing winding and the
// old reversed pattern must never return.
for (const file of ['world.js', 'deformation.js', 'slip-field.js']) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  assert.ok(!source.includes('indices.push(a, d, b, b, d, e)'), `${file} must not use the old underside winding`);
}

console.log('SIROCCO core tests: deterministic terrain, seamless mesh, normals and Babylon top-face winding OK');
