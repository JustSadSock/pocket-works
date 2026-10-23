import assert from 'node:assert/strict';
import { makeStoneRimProfile, ringArea } from './curb-profile.js';
import { compileCourse19, inspectCourse19, organicSandRadius } from './course19.js';
import { generateEndlessLevel } from './procedural.js';
import { LEVELS } from './levels.js';

const square = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
assert.equal(Math.round(ringArea(square)), 40000);
const circle = makeStoneRimProfile(square, () => 4);
assert.equal(circle.length, 4);
for (const corner of circle) {
  assert.equal(corner.inner[2], 16, 'curb references the sampled playing surface');
  assert.ok(corner.cap[2] > corner.heel[2]);
  assert.ok(corner.cap.every(Number.isFinite));
}
assert.deepEqual(makeStoneRimProfile([...square].reverse(), () => 4).length, circle.length);

const bank = { x: 150, y: 160, length: 260, width: 150, angle: 0, cos: 1, sin: 0 };
const edges = [];
for (let i = 0; i < 32; i++) {
  const phi = Math.PI * 2 * i / 32;
  const dx = Math.cos(phi) * bank.length * .5;
  const dy = Math.sin(phi) * bank.width * .5;
  edges.push(organicSandRadius(bank.x + dx, bank.y + dy, bank));
  assert.ok(edges[i] > .87 && edges[i] < 1.17, 'smooth sand bank is bounded');
  assert.ok(organicSandRadius(bank.x + dx * .7, bank.y + dy * .7, bank)
    < edges[i], 'the sand bank is radial and monotonic');
}
assert.ok(Math.max(...edges) - Math.min(...edges) > .10,
  'natural sand banks must not be perfect ellipses');

let checked = 0;
for (const raw of [
  ...LEVELS,
  ...Array.from({ length: 240 }, (_, index) => generateEndlessLevel((index * 197 + 1234) >>> 0, index % 30))
]) {
  const level = compileCourse19(raw);
  const report = inspectCourse19(level);
  assert.equal(report.ok, true, `invalid course ${level.id}: ${report.issues.join(',')}`);
  const field = level.course18.field;
  const points = makeStoneRimProfile(level.outline, field.heightAt);
  assert.ok(points.length >= 3, 'rim must encircle the entire course');
  for (const vertex of points) {
    for (const name of ['inner', 'crown', 'cap', 'bevel', 'heel']) {
      assert.equal(vertex[name].length, 3);
      assert.ok(vertex[name].every(Number.isFinite), `${level.id} ${name}: bad rim coordinates`);
    }
    assert.ok(Math.hypot(vertex.cap[0] - vertex.inner[0], vertex.cap[1] - vertex.inner[1]) < 70);
    const [r, g, b, a] = field.colorAt(vertex.inner[0], vertex.inner[1], vertex.ground, [0, 0, 1]);
    assert.ok([r,g,b,a].every(x => Number.isFinite(x) && x >= 0 && x <= 1));
  }
  // No hard per-triangle sand/moss material switches: pigment handles both.
  const mesh = level.course18.surfaceMesh?.data;
  // The three Course18-legacy holes retain their original distinct
  // materials for save/render compatibility. Only newly authored Course19
  // and endless fields use the continuous terrain material contract.
  if (mesh && ![1, 6, 8].includes(Number(level.id))) for (let index = 10; index < mesh.length; index += 11) {
    assert.ok(mesh[index] === 1 || mesh[index] === 6,
      'each terrain triangle must use continuous grass or physically wet water shading');
  }
  if (level.endless) {
    for (const basin of field.landforms.filter(f => f.sandBasin)) {
      const mask = field.masks.find(m => m.type === 'sand'
        && Math.hypot(m.x - basin.x, m.y - basin.y) < 1);
      assert.ok(mask && Math.abs(mask.angle - basin.angle) < 1e-6,
        'sand, friction and physical bowl must share a contour');
      assert.ok(basin.height >= 10 && basin.height < 25,
        'bunker depth remains within playable bounds');
    }
  }
  if (level.endless) {
    const hills = field.landforms.filter(feature => feature.roundedHill);
    assert.ok(hills.every(feature => feature.height > 0 && feature.height <= 44),
      'sculpted hill height stays bounded');
    assert.ok(hills.every(feature => feature.kind === 'mound' || feature.kind === 'ridge'),
      'ramps never receive artificial rounded hill profiles');
  }
  const p = level.start;
  const base = field.colorAt(p.x, p.y, field.heightAt(p.x,p.y), field.normalAt(p.x,p.y));
  const nearby = field.colorAt(p.x + 2, p.y + 2, field.heightAt(p.x+2,p.y+2), field.normalAt(p.x+2,p.y+2));
  assert.ok(base.every((x, i) => Math.abs(x - nearby[i]) < .18), 'surface pigment must not jump in nearby pixels');
  checked++;
}
console.log('Moss & Marble terrain material and continuous rim audit passed:', checked, 'courses');
