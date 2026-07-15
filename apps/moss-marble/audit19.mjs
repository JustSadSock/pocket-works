import { LEVELS } from './levels.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { generateEndlessLevel, inspectEndlessLevel } from './procedural.js';

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

for (const source of LEVELS) {
  const level = compileCourse19(source);
  const report = inspectCourse19(level);
  assert(report.ok, `campaign ${source.id}: ${report.issues.join(', ')}`);
  assert(level.__course19 === true, `campaign ${source.id}: compiler marker`);
  assert(level.course18?.triangleCount >= 0 && level.course18.triangleCount <= 12000, `campaign ${source.id}: triangle budget`);
  assert(level.course18?.field?.surfaceAt, `campaign ${source.id}: field contract`);
}

for (const seed of [1, 17, 50291, 0xDEADBEEF]) {
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
console.log('Moss & Marble 1.9 audit passed');
