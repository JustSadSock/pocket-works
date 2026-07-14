import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBall, strikeBall, stepBall } from '../apps/moss-marble/physics.js';
import { polygonArea, triangulatePolygon } from '../apps/moss-marble/render.js';
import { generateEndlessLevel, inspectEndlessLevel, formatRunCode } from '../apps/moss-marble/procedural.js';

const featureCounts = { water: 0, bridge: 0, slope: 0, rotor: 0, tunnel: 0, wall: 0 };

for (let seedIndex = 1; seedIndex <= 96; seedIndex += 1) {
  const seed = seedIndex * 7919;
  for (let depth = 0; depth < 32; depth += 1) {
    const first = generateEndlessLevel(seed, depth);
    const second = generateEndlessLevel(seed, depth);
    assert.deepEqual(first, second, `seed ${seed} depth ${depth} must be deterministic`);
    assert.equal(first.endless.code, formatRunCode(seed));
    assert.equal(first.section, depth + 1);
    assert.ok(first.par >= 3 && first.par <= 6);
    assert.ok(first.id !== generateEndlessLevel(seed, depth + 1).id, 'renderer id must change between sections');
    assert.equal(triangulatePolygon(first.outline).length, first.outline.length - 2, `section ${seed}/${depth} must triangulate`);
    assert.ok(Math.abs(polygonArea(first.outline)) > 100000, `section ${seed}/${depth} must have a meaningful area`);
    const report = inspectEndlessLevel(first);
    assert.equal(report.ok, true, `invalid endless section ${seed}/${depth}: ${report.issues.join(', ')}`);

    if (seedIndex <= 16) {
      const ball = createBall(first.start, first);
      const dx = first.hole.x - first.start.x;
      const dy = first.hole.y - first.start.y;
      const length = Math.hypot(dx, dy) || 1;
      strikeBall(ball, dx / length * 420, dy / length * 420);
      for (let step = 0; step < 24; step += 1) stepBall(ball, first, 1 / 60, step / 60);
      assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y) && Number.isFinite(ball.z), `section ${seed}/${depth} physics must remain finite`);
    }

    featureCounts.water += first.zones.some((zone) => zone.type === 'water') ? 1 : 0;
    featureCounts.bridge += first.zones.some((zone) => zone.type === 'bridge') ? 1 : 0;
    featureCounts.slope += first.zones.some((zone) => zone.type === 'slope') ? 1 : 0;
    featureCounts.rotor += first.rotors.length ? 1 : 0;
    featureCounts.tunnel += first.tunnels.length ? 1 : 0;
    featureCounts.wall += first.walls.length ? 1 : 0;
  }
}

for (const [feature, count] of Object.entries(featureCounts)) {
  assert.ok(count > 0, `${feature} must appear in the generated sample`);
}

const [app, index, worker] = await Promise.all([
  readFile(new URL('../apps/moss-marble/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/sw.js', import.meta.url), 'utf8')
]);

assert.match(app, /startEndless/);
assert.match(app, /generateEndlessLevel/);
assert.match(app, /endlessRun/);
assert.match(index, /id="endlessBtn"/);
assert.match(index, /id="holeLabel"/);
assert.match(worker, /\.\/procedural\.js/);
assert.match(worker, /moss-marble-v1\.4\.[01]/);

console.log(`Moss & Marble 1.3 endless audit passed across ${96 * 32} deterministic sections.`);
console.log(featureCounts);
