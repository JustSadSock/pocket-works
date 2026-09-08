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

for (const segments of [18, 22, 24, 30, 32, 40, 42]) {
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
avalancheSand.setQuality({ id: 'high' });
avalancheSand.setCell(0, 0, 0.03);
avalancheSand.update(0.21, 0, 0);
assert.ok(avalancheSand.getCell(1, 0) > 0, 'displaced sand must transfer downhill when slope exceeds angle of repose');

for (const file of ['world.js', 'deformation.js', 'slip-field.js']) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  assert.ok(!source.includes('indices.push(a, d, b, b, d, e)'), `${file} must not use the old underside winding`);
}

const worldSource = readFileSync(new URL('./world.js', import.meta.url), 'utf8');
assert.ok(worldSource.includes('setLocalReplacement'), 'coarse terrain must expose a local replacement hole for physical sand');
assert.ok(worldSource.includes('replacementIntersectsChunk'), 'local replacement updates must use radial chunk intersection');
assert.ok(worldSource.includes('dx * dx + dz * dz < safeRadius * safeRadius'), 'coarse replacement hole must be circular');
assert.ok(worldSource.includes('chunk.mesh.receiveShadows = false'), 'terrain must not receive unstable realtime character shadow maps');
assert.ok(!worldSource.includes('nearHoleHalfExtent'), 'far terrain must remain continuous under near chunks instead of exposing a square LOD hole');

const localSandSource = readFileSync(new URL('./sand-surface.js', import.meta.url), 'utf8');
assert.ok(localSandSource.includes('this.world.setLocalReplacement'), 'high-detail physical sand must replace, not overlay, coarse terrain');
const highSegments = Number(localSandSource.match(/this\.segments\s*=\s*preset\.id === 'high' \? (\d+)/)?.[1] || 0);
const highRadius = Number(localSandSource.match(/this\.radius\s*=\s*preset\.id === 'high' \? ([0-9.]+)/)?.[1] || 0);
const spacing = highRadius * 2 / highSegments;
assert.ok(highSegments >= 60 && highSegments <= 72 && spacing <= 0.165, 'High physical sand must keep foot-readable detail without the 14k-vertex performance spike');
assert.ok(localSandSource.includes('Math.hypot(cellX, cellZ)'), 'local physical sand topology must be radial rather than a visible square');
assert.ok(localSandSource.includes('smoothstep(0.68, 0.86, r)'), 'physical deformation must fade before the local patch edge');
assert.ok(localSandSource.includes('this.mesh.receiveShadows = false'), 'local physical sand must not become a separate shadow island');
assert.ok(localSandSource.includes('directionalShade'), 'physical footprints must include stable directional self-shading');
assert.ok(localSandSource.includes('const cavity ='), 'footprint depressions must include local cavity darkening');
assert.ok(localSandSource.includes('LIGHT_TO_SURFACE'), 'footprint shading must stay aligned with the desert sun direction');

const materialSource = readFileSync(new URL('./sand-material.js', import.meta.url), 'utf8');
assert.ok(materialSource.includes('makeSandMaterial'), 'near/far/local terrain materials must be constructed from one optical recipe');
assert.ok(!materialSource.includes("near.clone('sand-pbr-far-unified')"), 'RawTexture-backed terrain materials must not be cloned into URL-loading fallbacks');
assert.ok(materialSource.includes("makeSandMaterial(scene, 'sand-pbr-far'"), 'far terrain must explicitly share the same GPU texture recipe as near terrain');

const lightingSource = readFileSync(new URL('./lighting.js', import.meta.url), 'utf8');
assert.ok(lightingSource.includes('this.fill.intensity = 0.62'), 'sky fill must leave enough directional contrast for dune and footprint relief');
assert.ok(lightingSource.includes('this.sun.intensity = 3.15'), 'directional sun must remain strong enough to read sand form');

const contactShadowSource = readFileSync(new URL('./contact-shadow.js', import.meta.url), 'utf8');
assert.ok(contactShadowSource.includes('this.material.alpha = 0.54'), 'character contact shadow must remain visibly grounded at rest');
assert.ok(!contactShadowSource.includes('ShadowGenerator'), 'contact shadow must stay stable and independent of mobile shadow maps');

const cameraSource = readFileSync(new URL('./camera.js', import.meta.url), 'utf8');
assert.ok(cameraSource.includes('const eyeForward = 0.50'), 'first-person eye must remain safely outside the imported head');
assert.ok(cameraSource.includes('viewForwardY'), 'camera offset must follow full 3D look direction, including pitch');
assert.ok(cameraSource.includes('camera.minZ = 0.18'), 'near clip must reject residual face/keffiyeh intersections');

const characterSource = readFileSync(new URL('./character.js', import.meta.url), 'utf8');
assert.ok(characterSource.includes('SceneLoader.ImportMeshAsync'), 'SIROCCO body must use the imported skinned humanoid');
assert.ok(characterSource.includes('setWeightForAllAnimatables'), 'walk/idle animation blending must stay enabled');
const polishSource = readFileSync(new URL('./character-polish.js', import.meta.url), 'utf8');
assert.ok(polishSource.includes('bedouin-crossbody-strap'), 'Bedouin silhouette must include travel gear beyond the base humanoid');
assert.ok(polishSource.includes('bedouin-linen-weave'), 'robe materials must contain visible textile microdetail');

const gameSource = readFileSync(new URL('./game.js', import.meta.url), 'utf8');
assert.ok(gameSource.includes('this.sandVisualClock >= 0.10'), 'local sand rebuilds must be throttled on mobile');
assert.ok(gameSource.includes('this.coarseSandClock >= 0.50'), 'coarse terrain deformation must not rebuild every avalanche frame');

console.log('SIROCCO core regression checks passed');
