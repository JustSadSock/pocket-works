import { LEVELS } from './levels.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { generateEndlessLevel, inspectEndlessLevel } from './procedural.js';

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const wallDistanceToPoint = (wall, point) => {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - wall.ax) * dx + (point.y - wall.ay) * dy) / lengthSq)) : 0;
  const x = wall.ax + dx * t;
  const y = wall.ay + dy * t;
  return Math.hypot(point.x - x, point.y - y) - Number(wall.thickness || 0) * .5;
};

for (const source of LEVELS) {
  const level = compileCourse19(source);
  const report = inspectCourse19(level);
  assert(report.ok, `campaign ${source.id}: ${report.issues.join(', ')}`);
  assert(level.__course19 === true, `campaign ${source.id}: compiler marker`);
  assert(level.course18?.triangleCount >= 0 && level.course18.triangleCount <= 12000, `campaign ${source.id}: triangle budget`);
  assert(level.course18?.field?.surfaceAt, `campaign ${source.id}: field contract`);
}

for (const seed of [1, 2, 3, 5, 8, 13, 17, 21, 34, 55, 89, 144, 233, 50291, 0xDEADBEEF]) {
  for (let depth = 0; depth < 28; depth += 1) {
    const rawA = generateEndlessLevel(seed, depth);
    const rawB = generateEndlessLevel(seed, depth);
    const rawReport = inspectEndlessLevel(rawA);
    assert(rawReport.ok, `endless ${seed}/${depth}: ${rawReport.issues.join(', ')}`);
    assert(JSON.stringify(rawA.course19Blueprint) === JSON.stringify(rawB.course19Blueprint), `endless ${seed}/${depth}: nondeterministic scenario`);
    const level = compileCourse19(rawA);
    const report = inspectCourse19(level);
    assert(report.ok, `compiled ${seed}/${depth}: ${report.issues.join(', ')}`);
    assert(level.course18?.triangleCount === 1932, `compiled ${seed}/${depth}: unexpected mesh budget`);
    const holeClearance = Math.max(72, Number(level.hole?.r || 31) * 2.25);
    for (const wall of level.walls || []) {
      assert(wallDistanceToPoint(wall, level.hole) >= holeClearance, `compiled ${seed}/${depth}: wall blocks hole approach`);
    }
    if (level.tunnels?.length) {
      const tunnel = level.tunnels[0];
      assert(Number.isFinite(tunnel.entry.axisX) && Number.isFinite(tunnel.exit.axisY), `tunnel ${seed}/${depth}: invalid axis`);
      assert(tunnel.entry.r > 0 && tunnel.exit.r > 0, `tunnel ${seed}/${depth}: invalid trigger`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Moss & Marble 1.9.1 audit passed');
