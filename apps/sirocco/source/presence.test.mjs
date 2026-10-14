import assert from 'node:assert/strict';
import { SandPhysics } from './sand-physics.js';
import { DesertWind } from './wind.js';
import { WindErosion } from './wind-erosion.js';

const wind = new DesertWind();
for (let i = 0; i < 1200; i += 1) {
  const state = wind.update(1 / 60, 12, -8);
  assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z));
  assert.ok(state.strength >= 0.18 && state.strength <= 0.95);
  assert.ok(state.gust >= 0 && state.gust <= 1);
  assert.ok(Math.abs(Math.hypot(state.x, state.z) - 1) < 1e-6, 'wind direction must stay normalized');
}

const world = { sampleBaseHeight: () => 0, downhill: () => ({ x: 1, z: 0 }) };
const sand = new SandPhysics(world, { cellSize: 0.12 });
sand.setQuality({ id: 'high' });
sand.addCell(0, 0, 0.025, 0.8, 0);
sand.addCell(-2, 0, -0.035, 0.05, 0.7);
const erosion = new WindErosion(sand);
erosion.setQuality({ id: 'high' });
const sourceBefore = sand.getCell(0, 0);
const targetBefore = sand.getCell(1, 0);
const cavityBefore = sand.getCell(-2, 0);
let changed = false;
for (let i = 0; i < 8; i += 1) {
  changed = erosion.update(0.5, 0, 0, { x: 1, z: 0, strength: 0.9, gust: 0.9 }) || changed;
}
assert.ok(changed, 'strong wind must affect nearby fresh sand');
assert.ok(sand.getCell(0, 0) < sourceBefore, 'loose positive rim must lose material to wind');
assert.ok(sand.getCell(1, 0) > targetBefore, 'wind must transport loose material downwind');
assert.ok(sand.getCell(-2, 0) > cavityBefore, 'windblown grains must slowly soften old compact cavities');
assert.ok(erosion.lastMoved > 0);

const weakSand = new SandPhysics(world, { cellSize: 0.12 });
weakSand.addCell(0, 0, 0.02, 0.8, 0);
const weakErosion = new WindErosion(weakSand);
const weakBefore = weakSand.getCell(0, 0);
for (let i = 0; i < 5; i += 1) weakErosion.update(0.5, 0, 0, { x: 1, z: 0, strength: 0.2, gust: 0.2 });
assert.equal(weakSand.getCell(0, 0), weakBefore, 'calm air must not erase footprints');

console.log('SIROCCO presence regression checks passed');
