import assert from 'node:assert/strict';
import { makeStoneRimProfile, ringArea } from './curb-profile.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
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
  const p = level.start;
  const base = field.colorAt(p.x, p.y, field.heightAt(p.x,p.y), field.normalAt(p.x,p.y));
  const nearby = field.colorAt(p.x + 2, p.y + 2, field.heightAt(p.x+2,p.y+2), field.normalAt(p.x+2,p.y+2));
  assert.ok(base.every((x, i) => Math.abs(x - nearby[i]) < .18), 'surface pigment must not jump in nearby pixels');
  checked++;
}
console.log('Moss & Marble terrain material and continuous rim audit passed:', checked, 'courses');
