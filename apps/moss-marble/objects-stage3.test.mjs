import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { generateEndlessLevel } from './procedural.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { buildCourse18Geometry } from './terrain18.js';

let checked = 0;
const counts = { rocks: 0, stumps: 0, tunnels: 0, stoneWalls: 0, woodWalls: 0 };
for (const original of [
  ...LEVELS,
  ...Array.from({ length: 96 }, (_, i) => generateEndlessLevel((2197 + i * 61) >>> 0, i % 30))
]) {
  const level = compileCourse19(original);
  const snapshot = {
    obstacles: JSON.stringify(level.obstacles),
    barriers: JSON.stringify(level.walls),
    tunnel: JSON.stringify(level.tunnels),
    cup: JSON.stringify(level.hole),
    start: JSON.stringify(level.start)
  };
  assert.equal(inspectCourse19(level).ok, true, 'compiled course must be playable');
  const geometry = buildCourse18Geometry(level);
  assert.ok(geometry.opaque instanceof Float32Array);
  for (const [name, array] of Object.entries(geometry)) {
    assert.equal(array.length % 11, 0, `${name}: wrong vertex stride`);
    assert.ok(array.every(Number.isFinite), `${name}: invalid position/normal/color`);
    assert.ok(array.length < 430000, `${name}: runaway model complexity`);
  }
  assert.ok(geometry.opaque.length > level.course18.surfaceMesh.data.length,
    'the cup and models must actually contribute triangles');
  for (const prop of level.course18.props) {
    if (prop.kind === 'stump') counts.stumps++;
    else counts.rocks++;
    if (prop.kind === 'rockCluster') {
      assert.ok(prop.parts.every(p => p.r > 0), 'cluster parts must keep independent physical radii');
    }
  }
  for (const wall of level.course18.barriers) counts[wall.material === 'stone' ? 'stoneWalls' : 'woodWalls']++;
  counts.tunnels += level.course18.tunnelVisuals.length;
  assert.deepEqual({
    obstacles: JSON.stringify(level.obstacles),
    barriers: JSON.stringify(level.walls),
    tunnel: JSON.stringify(level.tunnels),
    cup: JSON.stringify(level.hole),
    start: JSON.stringify(level.start)
  }, snapshot, 'visual mesh generation must never modify game physics');
  checked++;
}
assert.ok(counts.rocks > 0 && counts.stumps > 0 && counts.tunnels > 0 && counts.woodWalls > 0 && counts.stoneWalls > 0);
console.log('Moss & Marble object vocabulary:', checked, 'courses verified;', counts);
