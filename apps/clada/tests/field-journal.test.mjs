import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ globalThis: {} });
vm.runInContext(fs.readFileSync(new URL('../runtime/v4/18-field-journal-core.js', import.meta.url), 'utf8'), context);
const FIELD = context.globalThis.CladaFieldJournalCore;

function community() {
  return {
    species: [{ id: 1, abundance: 19, guild: 'grazer' }],
    demes: [
      { id: 1, speciesId: 1, abundance: 14, trend: -2.2, carryingCapacity: 13, foodRatio: .42, compatibility: .82, predationLoss: .35, geneFlow: .08, isolation: .61, isolationAge: 24, ecologicalDivergence: .12, divergence: .07 },
      { id: 2, speciesId: 1, abundance: 5, trend: -.8, carryingCapacity: 10, foodRatio: .65, compatibility: .91, predationLoss: .08, geneFlow: .06, isolation: .72, isolationAge: 30, ecologicalDivergence: .16, divergence: .09 }
    ]
  };
}

test('pressure report identifies decline and limiting factors', () => {
  const result = FIELD.pressureBreakdown(community(), 1);
  assert.equal(result.direction, 'declining');
  assert.match(result.headline, /сокращается/);
  assert.ok(result.factors.length >= 3);
  assert.ok(result.factors.slice(0, 2).some((entry) => entry.label === 'Недостаток пищи'));
  assert.ok(result.factors.reduce((sum, entry) => sum + entry.percent, 0) >= 95);
});

test('divergence stages progress only with isolation and viability', () => {
  const early = FIELD.divergenceStage({ abundance: 12, age: 4, isolationAge: 2, geneFlow: .52, isolation: .08 });
  const late = FIELD.divergenceStage({ abundance: 9, age: 42, isolationAge: 35, geneFlow: .04, isolation: .84, ecologicalDivergence: .19, divergence: .1 });
  assert.ok(early.index <= 1);
  assert.equal(late.index, 4);
  assert.equal(late.ready, true);
});

test('small or connected demes explain why speciation is blocked', () => {
  const stage = FIELD.divergenceStage({ abundance: 3, age: 40, isolationAge: 30, geneFlow: .31, isolation: .7, ecologicalDivergence: .2, divergence: .09 });
  assert.ok(stage.blockers.includes('слишком малая численность'));
  assert.ok(stage.blockers.includes('высокий поток генов'));
});

test('replay bundle is deterministic, compact and sorted', () => {
  const bundle = FIELD.buildReplayBundle({
    seed: 'garden', originMode: 'mature', createdGeneration: 250,
    commands: [
      { g: 190, type: 'cataclysm', value: 'ice', ignored: 'x' },
      { g: 164, type: 'world-created', seed: 'garden', originMode: 'mature' },
      { g: 170, type: 'environment', key: 'food', value: .8 }
    ]
  });
  assert.equal(bundle.schema, 'clada-replay-v1');
  assert.deepEqual(bundle.commands.map((entry) => entry.g), [170, 190]);
  assert.equal(bundle.commands[0].ignored, undefined);
  assert.ok(JSON.stringify(bundle).length < 1000);
});

test('series compaction preserves the latest point', () => {
  const series = Array.from({ length: 500 }, (_, index) => ({ g: index, n: index % 30 }));
  const compact = FIELD.compactSeries(series, 80);
  assert.ok(compact.length <= 82);
  assert.equal(compact.at(-1).g, 499);
});
