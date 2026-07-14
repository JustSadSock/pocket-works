import { LEVELS } from './levels.js';
import { compileCourse18, inspectCourse18 } from './course18.js';

const TARGETS = new Set([1, 6, 8]);
let failed = false;
for (const raw of LEVELS.filter((level) => TARGETS.has(level.id))) {
  const level = compileCourse18(raw);
  const report = inspectCourse18(level);
  const field = level.course18?.field;
  const samples = [];
  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const pointIndex = Math.min(level.centerline.length - 2, Math.floor(t * (level.centerline.length - 1)));
    const local = t * (level.centerline.length - 1) - pointIndex;
    const a = level.centerline[pointIndex];
    const b = level.centerline[pointIndex + 1];
    const x = a.x + (b.x - a.x) * local;
    const y = a.y + (b.y - a.y) * local;
    samples.push(field.heightAt(x, y), field.gradientAt(x, y).x, field.gradientAt(x, y).y);
  }
  if (!samples.every(Number.isFinite)) report.issues.push('non-finite-route-sample');
  if (level.id === 8) {
    const tunnel = level.tunnels?.[0];
    if (!tunnel?.entry || !tunnel?.exit || !Number.isFinite(tunnel.entry.angle)) report.issues.push('tunnel-contract');
  }
  report.ok = report.issues.length === 0;
  console.log(`Moss & Marble 1.8 / hole ${level.id}:`, report);
  if (!report.ok) failed = true;
}
if (failed) process.exitCode = 1;
