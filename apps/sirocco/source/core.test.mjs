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
sand.setQuality({ id: 'high' });
sand.stampFoot({ globalX: 0, globalZ: 0, yaw: 0 }, { speed: 2.2, lastSlope: 0.2, sliding: 0 });
assert.ok(sand.activeCellCount > 8);
assert.ok(sand.sampleOffset(0, 0) < -0.01, 'foot centre must depress');
let positiveMass = 0, maxLoose = 0, maxCompaction = 0;
for (const cell of sand.cells.values()) {
  if (cell.h > 0) positiveMass += cell.h;
  maxLoose = Math.max(maxLoose, cell.loose ?? 0);
  maxCompaction = Math.max(maxCompaction, cell.compaction ?? 0);
}
assert.ok(positiveMass > 0.005, 'foot impact must create displaced rim mass');
assert.ok(maxLoose > 0.10, 'fresh displaced material must become loose');
assert.ok(maxCompaction > 0.10, 'footprint cavity must compact');
const firstSoftness = sand.sampleSoftness(0, 0);
sand.stampFoot({ globalX: 0, globalZ: 0, yaw: 0 }, { speed: 1.4, lastSlope: 0.1, sliding: 0 });
assert.ok(sand.sampleSoftness(0, 0) <= firstSoftness + 1e-6, 'repeat step must firm the track');

const avalancheSand = new SandPhysics({ sampleBaseHeight: (x) => -x, downhill: () => ({ x: 1, z: 0 }) }, { cellSize: 0.12 });
avalancheSand.setQuality({ id: 'high' });
avalancheSand.setCell(0, 0, 0.03);
avalancheSand.update(0.23, 0, 0);
assert.ok(avalancheSand.getCell(1, 0) > 0, 'loose sand must transfer downhill');
assert.ok(Number.isFinite(avalancheSand.lastWorkMs));

for (const file of ['world.js', 'deformation.js', 'slip-field.js']) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  assert.ok(!source.includes('indices.push(a, d, b, b, d, e)'), `${file} must not use old winding`);
}

const worldSource = readFileSync(new URL('./world.js', import.meta.url), 'utf8');
assert.ok(worldSource.includes('setLocalReplacement'));
assert.ok(worldSource.includes('replacementIntersectsChunk'));
assert.ok(worldSource.includes('dx * dx + dz * dz < safeRadius * safeRadius'));
assert.ok(worldSource.includes('chunk.mesh.receiveShadows = false'));
assert.ok(!worldSource.includes('nearHoleHalfExtent'));
assert.ok(worldSource.includes('updateReplacementIndices'), 'moving local sand must update only coarse index buffers');
assert.ok(worldSource.includes('chunk.mesh.setIndices'), 'replacement movement must not rebuild static coarse vertex data');
assert.ok(
  worldSource.includes('buildChunkData(chunk.cx, chunk.cz, this.quality.segments, null, this.localReplacement)'),
  'coarse terrain rebuilds must never sample the 12 cm physical footprint field'
);

const localSandSource = readFileSync(new URL('./sand-surface.js', import.meta.url), 'utf8');
const highSegments = Number(localSandSource.match(/nextSegments = preset\.id === 'high' \? (\d+)/)?.[1] || 0);
const highRadius = Number(localSandSource.match(/nextRadius = preset\.id === 'high' \? ([0-9.]+)/)?.[1] || 0);
const uniformSpacing = highRadius * 2 / highSegments;
const centreSpacing = uniformSpacing * 0.62;
assert.ok(highSegments >= 64 && highSegments <= 72, 'High local sand must stay below the 5k-vertex budget');
assert.ok(centreSpacing <= 0.072, 'adaptive High grid must provide roughly 7 cm detail around the player');
assert.ok(localSandSource.includes('warpLocalAxis'), 'local sand must concentrate samples near the player');
assert.ok(localSandSource.includes('this.holeRatio = 0.90'), 'replacement hole must suppress seam z-fighting');
assert.ok(localSandSource.includes('meshTerrainShadingNormal'), 'untouched local sand must inherit coarse shading normals');
assert.ok(localSandSource.includes('const physicalActivity ='), 'disturbed normals must activate only where physical sand moved');
assert.ok(localSandSource.includes('const disturbed = this.sampleNormal'), 'disturbed sand must use heightfield normals instead of coarse triangle normals');
assert.ok(!localSandSource.includes('VertexData.ComputeNormals'), 'local sand must not recompute the full normal field every visual tick');
assert.ok(localSandSource.includes('new Float32Array'), 'physical sand must reuse typed buffers instead of allocating JS arrays every tick');
assert.ok(localSandSource.includes('allocateBuffers()'), 'physical sand topology must be cached per quality preset');
assert.ok(localSandSource.includes('updateVerticesData'), 'physical sand must update existing GPU buffers after first upload');
assert.ok(localSandSource.includes('this.lastRebuildMs'), 'sand surface rebuild cost must remain observable for QA');
assert.ok(!localSandSource.includes('const coarseBrightness ='), 'untouched physical patch must remain neutral while near terrain ignores vertex colors');
assert.ok(localSandSource.includes('this.mesh.receiveShadows = false'));
assert.ok(!localSandSource.includes('directionalShade'));

const materialSource = readFileSync(new URL('./sand-material.js', import.meta.url), 'utf8');
assert.ok(materialSource.includes('makeSandMaterial'));
assert.ok(!materialSource.includes("near.clone('sand-pbr-far-unified')"));
assert.ok(materialSource.includes("makeSandMaterial(scene, 'sand-pbr-far'"));
assert.ok(materialSource.includes("makeSandMaterial(scene, 'sand-pbr-near', albedo, normal, false)"));
assert.ok(materialSource.includes("makeSandMaterial(scene, 'sand-pbr-physical-local', albedo, normal, true)"));
assert.ok(materialSource.includes('local.zOffset = -1'), 'local sand must win the narrow overlap ring through depth bias, never physical lift');

const lightingSource = readFileSync(new URL('./lighting.js', import.meta.url), 'utf8');
assert.ok(lightingSource.includes('this.fill.intensity'));
assert.ok(lightingSource.includes('this.sun.intensity'));
assert.ok(!lightingSource.includes('ShadowGenerator'), 'terrain shadow-map regressions must stay disabled');

const contactShadowSource = readFileSync(new URL('./contact-shadow.js', import.meta.url), 'utf8');
assert.ok(contactShadowSource.includes('slopeQuaternion'), 'contact shadow must conform to dune normal');
assert.ok(contactShadowSource.includes('this.surface.sampleNormal'), 'contact shadow orientation must sample physical surface normal');
assert.ok(contactShadowSource.includes('+ 0.022'), 'contact shadow must stay slightly above the dune to avoid clipped triangles');
assert.ok(!contactShadowSource.includes('ShadowGenerator'));

const cameraSource = readFileSync(new URL('./camera.js', import.meta.url), 'utf8');
const eyeForward = Number(cameraSource.match(/const eyeForward = ([0-9.]+)/)?.[1] || 999);
const nearClip = Number(cameraSource.match(/camera\.minZ = ([0-9.]+)/)?.[1] || 0);
assert.ok(eyeForward >= 0.08 && eyeForward <= 0.20, 'first-person eye must remain close enough to the body for natural look-down framing');
assert.ok(nearClip >= 0.24, 'near clip must reject skull/keffiyeh intersections instead of pushing the eye far forward');
assert.ok(cameraSource.includes('verticalClearance = viewForwardY * 0.035'));

const movementSource = readFileSync(new URL('./movement.js', import.meta.url), 'utf8');
assert.ok(movementSource.includes('sampleSoftness'));
assert.ok(movementSource.includes('looseDrag'));

const characterSource = readFileSync(new URL('./character.js', import.meta.url), 'utf8');
assert.ok(characterSource.includes('SceneLoader.ImportMeshAsync'));
assert.ok(characterSource.includes('setWeightForAllAnimatables'));
assert.ok(characterSource.includes('FIRST_PERSON_BODY_LEAD'), 'animated body must be authored separately from camera placement');

const polishSource = readFileSync(new URL('./character-polish.js', import.meta.url), 'utf8');
assert.ok(polishSource.includes('bedouin-crossbody-strap'));
assert.ok(polishSource.includes('bedouin-linen-weave'));
assert.ok(polishSource.includes('bedouin-patterned-scarf-layer'));
assert.ok(polishSource.includes('bedouin-skin-detail'), 'visible skin must have authored microdetail instead of flat RGB');
assert.ok(polishSource.includes('bedouin-keffiyeh-weave'), 'head cloth must use a separate textile treatment');
assert.ok(polishSource.includes('bedouin-first-person-thobe-front'), 'look-down view must have a dedicated safe torso surface');
assert.ok(polishSource.includes('setSkinVisible'), 'extreme pitch must be able to cull the imported skin mesh without affecting bones');
assert.ok(polishSource.includes('setRigGarmentsVisible'), 'large core garments must have a dedicated first-person cull path');
assert.ok(polishSource.includes('controller.pitch < 0.40'), 'large external accessories must disappear before they fill the first-person view');
assert.ok(polishSource.includes('controller.pitch >= 0.38'), 'safe first-person torso must replace external garments before the sand inspection angle');
assert.ok(polishSource.includes('CreatePlane'), 'first-person cloth must be a thin surface rather than a screen-sized box');

const landmarkSource = readFileSync(new URL('./landmarks.js', import.meta.url), 'utf8');
assert.ok(landmarkSource.includes('sirocco-rock-contact-shadow-material'), 'Blender landmarks must have stable mobile-safe contact grounding');
assert.ok(landmarkSource.includes('environmentIntensity'), 'authored sandstone must stay matte and sun-baked');
assert.ok(landmarkSource.includes('sampleNormal'), 'landmark contact shadows must conform to the dune surface');

const gameSource = readFileSync(new URL('./game.js', import.meta.url), 'utf8');
assert.ok(gameSource.includes('this.sandVisualClock >= 0.10'), 'local sand rebuilds must stay throttled');
assert.ok(!gameSource.includes('world.refreshDeformation(this.pendingSandBounds)'), 'fine footprint data must never be baked into metre-scale coarse terrain');
assert.ok(gameSource.includes('Persistent\n      // sand state stays in the sparse field'), 'game must document persistent local-only fine sand rendering');

console.log('SIROCCO core regression checks passed');
