import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../runtime/v4/22-01.txt', import.meta.url), 'utf8');
function load() {
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context);
  return context.globalThis.CladaObservationCore;
}

test('damping approaches a target without snapping or overshoot', () => {
  const core = load();
  let value = 0;
  for (let i = 0; i < 10; i += 1) {
    const next = core.damp(value, 1, 1 / 60, .16);
    assert.ok(next > value && next < 1);
    value = next;
  }
  assert.ok(value > .5 && value < 1);
});

test('representative targets preserve every active deme under the budget', () => {
  const core = load();
  const demes = Array.from({ length: 16 }, (_, index) => ({ id: index + 1, abundance: index + 1 }));
  const targets = core.allocateTargets(demes, 70);
  assert.equal(targets.size, 16);
  assert.equal([...targets.values()].reduce((sum, value) => sum + value, 0), 70);
  for (const value of targets.values()) assert.ok(value >= 1 && value <= 12);
});

test('visual budget changes quality without changing metapopulation data', () => {
  const core = load();
  assert.ok(core.qualityBudget('high', 20, 500) > core.qualityBudget('balanced', 20, 500));
  assert.ok(core.qualityBudget('balanced', 20, 500) > core.qualityBudget('low', 20, 500));
  assert.equal(core.qualityBudget('low', 8, 1), 8);
});

test('migration route is smooth, bounded and ends exactly at destination', () => {
  const core = load();
  const journey = { sx: .1, sy: .2, tx: .9, ty: .7, arc: .08 };
  const start = core.routePoint(journey, 0);
  const middle = core.routePoint(journey, .5);
  const end = core.routePoint(journey, 1);
  assert.equal(start.x, .1); assert.equal(start.y, .2);
  assert.ok(middle.x > .1 && middle.x < .9);
  assert.ok(middle.y > .2 && middle.y < .82);
  assert.ok(Math.abs(end.x - .9) < 1e-9);
  assert.ok(Math.abs(end.y - .7) < 1e-9);
});

test('repeated nearby observation events are compacted', () => {
  const core = load();
  const events = Array.from({ length: 20 }, (_, index) => ({ generation: 10, type: 'feeding', actorId: 4, x: .5 + index * .0001, y: .5, life: 1 }));
  const compacted = core.compactEvents(events, 90, 10);
  assert.equal(compacted.length, 1);
  assert.ok(compacted[0].strength > 1);
});

test('interaction classifier distinguishes hunting, territory and social contact', () => {
  const core = load();
  const predator = { id: 1, speciesId: 1, genome: { diet: .9 } };
  const prey = { id: 2, speciesId: 2, genome: { diet: .1 } };
  assert.equal(core.classifyPair(predator, prey).type, 'hunt');
  const territorial = core.classifyPair({ id: 3, speciesId: 3, genome: { diet: .2, territory: .8 } }, { id: 4, speciesId: 4, genome: { diet: .2 } });
  assert.equal(territorial.type, 'territory');
  const social = core.classifyPair({ id: 5, speciesId: 5, genome: { diet: .2, cooperation: .8 } }, { id: 6, speciesId: 5, genome: { diet: .2, social: .6 } });
  assert.equal(social.type, 'social');
});

test('scatter is deterministic and remains inside requested radius', () => {
  const core = load();
  const a = core.scatter(42, .07);
  const b = core.scatter(42, .07);
  assert.equal(a.x, b.x); assert.equal(a.y, b.y);
  assert.ok(Math.hypot(a.x, a.y) <= .0700001);
});
