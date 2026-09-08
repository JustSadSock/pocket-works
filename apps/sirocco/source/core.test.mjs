import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainHeight, terrainNormal, meshTerrainHeight } from './terrain.js';
import { SandPhysics } from './sand-physics.js';

for (const [x, z] of [[0, 0], [42, 0], [-42, 84], [123.456, -98.25]]) {
  assert.equal(terrainHeight(x, z), terrainHeight(x, z), 'terrain must be deterministic');
  const normal = terrainNormal(x, z);
  assert.ok(Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z));
  assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-5, 'terrain normal must stay normalized');
}

for (const segments of [18, 24, 30, 32, 42]) {
  for (let i = -4; i <= 4; i += 1) {
    const boundary = i * 42;
    const left = meshTerrainHeight(boundary - 1e-7, 17.25, segments, 42);
    const right = meshTerrainHeight(boundary + 1e-7, 17.25, segments, 42);
    assert.ok(Math.abs(left - right) < 1e-4, `mesh terrain must remain seamless at x=${boundary}, segments=${segments}`);
  }
}

const sand = new SandPhysics({ sampleBaseHeight: () => 0, downhill: () => ({ x: 0, z: 1 }) }, { cellSize: 0.12 });
sand.stampFoot({ globalX: 0, globalZ: 0, yaw: 0 }, { speed: 2.2, lastSlope: 0.2, sliding: 0 });
assert.ok(sand.activeCellCount > 8, 'foot impact must deform multiple sand cells');
assert.ok(sand.sampleOffset(0, 0) < -0.01, 'footprint centre must depress the sand surface');
let positiveMass = 0;
for (const cell of sand.cells.values()) if (cell.h > 0) positiveMass += cell.h;
assert.ok(positiveMass > 0.005, 'foot impact must push material into positive rims/deposits');

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
assert.ok(worldSource.includes('chunk.mesh.receiveShadows = false'), 'terrain must not receive unstable realtime character shadow maps');

const localSandSource = readFileSync(new URL('./sand-surface.js', import.meta.url), 'utf8');
assert.ok(localSandSource.includes('this.world.setLocalReplacement'), 'high-detail physical sand must replace, not overlay, coarse terrain');
const highSegments = Number(localSandSource.match(/preset\.id === 'high' \? (\d+)/)?.[1] || 0);
const highRadius = Number(localSandSource.match(/this\.radius = preset\.id === 'high' \? ([0-9.]+)/)?.[1] || 0);
assert.ok(highSegments >= 112 && highRadius > 0 && (highRadius * 2 / highSegments) <= 0.105, 'High physical sand must keep about 10 cm vertex spacing');
assert.ok(localSandSource.includes('this.mesh.receiveShadows = false'), 'local physical sand must not become a separate shadow island');
assert.ok(localSandSource.includes('sampleBaseNormal'), 'untouched replacement sand must preserve base-terrain shading');

const materialSource = readFileSync(new URL('./sand-material.js', import.meta.url), 'utf8');
assert.ok(materialSource.includes('makeSandMaterial'), 'near/far/local terrain materials must be constructed from one optical recipe');
assert.ok(!materialSource.includes("near.clone('sand-pbr-far-unified')"), 'RawTexture-backed terrain materials must not be cloned into URL-loading fallbacks');
assert.ok(materialSource.includes("makeSandMaterial(scene, 'sand-pbr-far'"), 'far terrain must explicitly share the same GPU texture recipe as near terrain');

const cameraSource = readFileSync(new URL('./camera.js', import.meta.url), 'utf8');
assert.ok(cameraSource.includes('const eyeForward = 0.50'), 'first-person eye must remain safely outside the imported head');
assert.ok(cameraSource.includes('viewForwardY'), 'camera offset must follow full 3D look direction, including pitch');
assert.ok(cameraSource.includes('camera.minZ = 0.18'), 'near clip must reject residual face/keffiyeh intersections');

const characterSource = readFileSync(new URL('./character.js', import.meta.url), 'utf8');
assert.ok(characterSource.includes('SceneLoader.ImportMeshAsync'), 'SIROCCO body must use the imported skinned humanoid');
assert.ok(characterSource.includes('setWeightForAllAnimatables'), 'walk/idle animation blending must stay enabled');

console.log('SIROCCO core regression checks passed');
