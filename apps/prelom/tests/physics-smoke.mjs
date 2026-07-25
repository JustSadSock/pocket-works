import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = mkdtempSync(join(tmpdir(), 'prelom-physics-'));
const compiled = spawnSync('tsc', [
  resolve(root, 'source/runtime-generated.ts'), '--target', 'ES2023', '--module', 'ESNext',
  '--moduleResolution', 'Bundler', '--lib', 'ES2023,DOM', '--skipLibCheck', '--outDir', output
], { encoding: 'utf8' });
if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout || 'TypeScript compile failed');
const runtime = await import(`${pathToFileURL(join(output, 'runtime-generated.js')).href}?t=${Date.now()}`);
const { cauchyIor, EXPERIMENTS, reflect, refract, simulate, TASKS, validateScene, V } = runtime;

const reflected = reflect(V.norm({ x: 1, y: -1 }), { x: 0, y: 1 });
assert.ok(Math.abs(reflected.x - Math.SQRT1_2) < 1e-6);
assert.ok(Math.abs(reflected.y - Math.SQRT1_2) < 1e-6);
const incidence = Math.PI / 6;
const transmitted = refract({ x: Math.sin(incidence), y: -Math.cos(incidence) }, { x: 0, y: 1 }, 1, 1.5);
assert.ok(transmitted);
assert.ok(Math.abs(Math.asin(Math.abs(transmitted.x)) - Math.asin(Math.sin(incidence) / 1.5)) < 1e-6);
assert.equal(refract({ x: Math.sin(50 * Math.PI / 180), y: Math.cos(50 * Math.PI / 180) }, { x: 0, y: -1 }, 1.5, 1), null);
assert.ok(cauchyIor(1.5, 0.005, 420) > cauchyIor(1.5, 0.005, 680));

assert.equal(EXPERIMENTS.length, 12);
assert.equal(TASKS.length, 15);
for (const item of EXPERIMENTS) {
  const scene = validateScene(item.scene());
  const metrics = simulate(scene, { now: () => 0 });
  assert.ok(metrics.segments.length > 0, `${item.id} emits no light`);
  assert.ok(metrics.processedRays <= scene.settings.maxRays, `${item.id} exceeded ray budget`);
}
const radians = (degrees) => degrees * Math.PI / 180;
const solveTask = (id, scene) => {
  const lenses = () => scene.objects.filter((object) => object.type.includes('lens'));
  const mirrors = () => scene.objects.filter((object) => object.type.includes('mirror'));
  if (id === 'aim-target') scene.objects[0].rotation = Math.atan2(-190, 540);
  if (id === 'focus-sensor') { lenses()[0].y = 0; lenses()[0].focalLength = 290; }
  if (id === 'build-telescope') { lenses()[1].x = 150; lenses()[1].y = 0; lenses()[1].focalLength = 65; }
  if (id === 'unknown-ior') scene.objects.find((object) => object.metadata?.role === 'unknown').ior = 1.52;
  if (id === 'aberration-min') { const mirror = scene.objects.find((object) => object.metadata?.role === 'primary'); mirror.type = 'mirror-parabolic'; mirror.focalLength = 115; }
  if (id === 'magnification') lenses()[1].focalLength = 60;
  if (id === 'mirror-maze') [64.329904127, -91.263058456, 91.012082113].forEach((angle, index) => { mirrors()[index].rotation = radians(angle); });
  if (id === 'periscope-align') mirrors().forEach((mirror) => { mirror.rotation = radians(45); });
  if (id === 'tir-route') scene.objects[0].rotation = radians(8);
  if (id === 'spectrum-spread') { const prism = scene.objects.find((object) => object.type === 'medium-prism'); prism.dispersion = 0.01; prism.rotation = radians(60); }
  if (id === 'projector-focus') scene.objects.find((object) => object.type === 'lens-thick').x = -65;
  if (id === 'aperture-control') scene.objects.find((object) => object.metadata?.role === 'aperture').aperture = 20;
  if (id === 'fiber-couple') { scene.objects[0].rotation = 0; scene.objects[0].beamWidth = 46; }
  if (id === 'parallel-output') { lenses()[0].x = -100; lenses()[0].y = 0; lenses()[0].focalLength = 150; }
  if (id === 'three-lens-focus') lenses()[1].y = 0;
};
for (const task of TASKS) {
  const taskScene = validateScene(task.scene());
  assert.equal(task.check(simulate(taskScene, { now: () => 0 }), taskScene).ok, false, `${task.id} must start unsolved`);
  solveTask(task.id, taskScene);
  const solved = task.check(simulate(taskScene, { now: () => 0 }), taskScene);
  assert.equal(solved.ok, true, `${task.id} known solution was rejected: ${solved.message}`);
}
rmSync(output, { recursive: true, force: true });
console.log('ПРЕЛОМ physics smoke: OK');
