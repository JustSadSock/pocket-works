import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fbm2, hash2 } from './core.js';
import { TERRAIN_CHUNK_SIZE, meshTerrainHeight, terrainHeight, terrainNormal, terrainSlope } from './terrain.js';
import { babylonXZCellIndices } from './grid-winding.js';
import { SandPhysics } from './sand-physics.js';

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

const ids = babylonXZCellIndices(0, 1, 2, 3);
assert.deepEqual(ids, [1, 3, 2, 0, 1, 2], 'XZ grid must match Babylon TiledGround winding');
const verts = [
  { x: 0, y: 0.1, z: 0 }, { x: 1, y: 0.3, z: 0 },
  { x: 0, y: 0.2, z: 1 }, { x: 1, y: 0.4, z: 1 }
];
function crossY(i0, i1, i2) {
  const p0 = verts[i0], p1 = verts[i1], p2 = verts[i2];
  const ux = p1.x - p0.x, uz = p1.z - p0.z;
  const vx = p2.x - p0.x, vz = p2.z - p0.z;
  return uz * vx - ux * vz;
}
assert.ok(crossY(ids[0], ids[1], ids[2]) < 0, 'first triangle must be Babylon top/front winding');
assert.ok(crossY(ids[3], ids[4], ids[5]) < 0, 'second triangle must be Babylon top/front winding');

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

const sand = new SandPhysics({ downhill: () => ({ x: 0.35, z: 0.94 }) }, { cellSize: 0.12 });
sand.stampFoot(
  { globalX: 1.2, globalZ: -0.8, yaw: 0.4 },
  { speed: 2.4, lastSlope: 0.18, sliding: 0.0 }
);
assert.ok(sand.activeCellCount > 10, 'foot impact must modify multiple heightfield cells');
assert.ok(sand.sampleOffset(1.2, -0.8) < -0.002, 'foot centre must be physically depressed');
assert.ok([...sand.cells.values()].some((cell) => cell.h > 0.001), 'displaced sand must create a positive rim/deposit');
const dirty = sand.consumeDirtyBounds();
assert.ok(dirty && dirty.minX < 1.2 && dirty.maxX > 1.2, 'sand impact must mark terrain geometry dirty');
const remembered = sand.sampleOffset(1.2, -0.8);
sand.update(1, 1.2, -0.8);
const settled = sand.sampleOffset(1.2, -0.8);
assert.ok(settled < -0.001, 'nearby track depression must persist after local relaxation');
assert.ok(Math.abs(settled - remembered) < 0.018, 'angle-of-repose relaxation must not erase a footprint in one update');

const avalancheSand = new SandPhysics({ sampleBaseHeight: (x) => -x, downhill: () => ({ x: 1, z: 0 }) }, { cellSize: 0.12 });
avalancheSand.setCell(0, 0, 0.03);
avalancheSand.update(0.2, 0, 0);
assert.ok(avalancheSand.getCell(1, 0) > 0, 'displaced sand must transfer downhill when slope exceeds angle of repose');

for (const file of ['world.js', 'deformation.js', 'slip-field.js']) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  assert.ok(!source.includes('indices.push(a, d, b, b, d, e)'), `${file} must not use the old underside winding`);
}

const worldSource = readFileSync(new URL('./world.js', import.meta.url), 'utf8');
assert.ok(worldSource.includes('setLocalReplacement'), 'coarse terrain must expose a local replacement hole for physical sand');
assert.ok(worldSource.includes('chunk.mesh.receiveShadows = false'), 'terrain must not receive the unstable realtime character shadow map');

const localSandSource = readFileSync(new URL('./sand-surface.js', import.meta.url), 'utf8');
assert.ok(localSandSource.includes('this.world.setLocalReplacement'), 'high-detail physical sand must replace, not overlay, coarse terrain');
assert.ok(localSandSource.includes("segments = preset.id === 'high' ? 96"), 'High physical sand must keep approximately 10 cm vertex spacing');
assert.ok(localSandSource.includes('this.mesh.receiveShadows = false'), 'local physical sand must not become a separate shadow island');

const materialSource = readFileSync(new URL('./sand-material.js', import.meta.url), 'utf8');
assert.ok(materialSource.includes('near.useVertexColors = false'), 'near/far LOD must not diverge through per-vertex tinting');
assert.ok(materialSource.includes("near.clone('sand-pbr-far-unified')"), 'far terrain must share the same optical PBR response as near terrain');

const cameraSource = readFileSync(new URL('./camera.js', import.meta.url), 'utf8');
assert.ok(cameraSource.includes('const eyeForward = 0.34'), 'first-person eye must remain safely outside the imported head');
assert.ok(cameraSource.includes('viewForwardX'), 'camera offset must follow view yaw instead of lagging body yaw');

const characterSource = readFileSync(new URL('./character.js', import.meta.url), 'utf8');
assert.ok(characterSource.includes('SceneLoader.ImportMeshAsync'), 'SIROCCO body must use the imported skinned humanoid');
assert.ok(characterSource.includes('setWeightForAllAnimatables'), 'walk/idle animation blending must stay enabled');
assert.ok(!characterSource.includes("this.bone('legL'"), 'old procedural stretch-leg rig must not return');

console.log('SIROCCO core tests: terrain, winding, replacement sand, avalanche relaxation, LOD lighting and animated body guards OK');
