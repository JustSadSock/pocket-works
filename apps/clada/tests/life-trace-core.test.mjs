import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await Promise.all([1, 2, 3, 4].map(index => readFile(new URL(`../runtime/v5/26-${String(index).padStart(2, '0')}.txt`, import.meta.url), 'utf8')))).join('\n');
const context = vm.createContext({ globalThis: null });
context.globalThis = context;
vm.runInContext(source, context, { filename: '26-life-trace-core.js' });
const TRACE = context.CladaLifeTraceCore;

function community() {
  const patches = [];
  for (let by = 0; by < 3; by += 1) for (let bx = 0; bx < 4; bx += 1) {
    const water = by === 0 && bx < 2;
    patches.push({
      id: `${bx}${by}`, bx, by, x: (bx + .5) / 4, y: (by + .5) / 3,
      biome: water ? 'ocean' : bx === 3 ? 'forest' : by === 2 ? 'grassland' : 'wetland',
      water, coast: by === 0 || by === 1, temperature: .48 + bx * .05,
      moisture: water ? .9 : .42 + by * .12, elevation: water ? .08 : .35 + by * .12,
      neighbors: []
    });
  }
  return {
    generation: 20,
    rng: 123456,
    originSeed: 'trace-test',
    env: { food: .65, mutation: .4, temperature: .52 },
    patches,
    resources: Object.fromEntries(patches.map(patch => [patch.id, { vegetation: patch.water ? 3 : 30, plankton: patch.water ? 36 : 2, detritus: 8 }])),
    species: [
      { id: 1, guild: 'grazer', abundance: 34 },
      { id: 2, guild: 'burrower', abundance: 22 },
      { id: 3, guild: 'filterer', abundance: 28 },
      { id: 4, guild: 'predator', abundance: 8 }
    ],
    demes: [
      { id: 1, speciesId: 1, patchId: '12', guild: 'grazer', abundance: 34, traits: { size: .55, social: .72, fertility: .62, moisture: .35 } },
      { id: 2, speciesId: 2, patchId: '12', guild: 'burrower', abundance: 22, traits: { size: .32, social: .42, fertility: .56, moisture: .5 } },
      { id: 3, speciesId: 3, patchId: '00', guild: 'filterer', abundance: 28, traits: { size: .24, social: .48, fertility: .6, armor: .42, moisture: .8 } },
      { id: 4, speciesId: 4, patchId: '12', guild: 'predator', abundance: 8, traits: { size: .62, social: .44, fertility: .35, moisture: .35 } }
    ]
  };
}

test('builds deterministic 64-cell relaxed Delaunay/Voronoi ecology', () => {
  const first = community();
  const second = community();
  const a = TRACE.ensureCommunity(first);
  const b = TRACE.ensureCommunity(second);
  assert.equal(a.cells.length, 64);
  assert.equal(a.triangles.length > 80, true);
  assert.deepEqual(JSON.parse(JSON.stringify(a.cells.map(cell => [cell.x, cell.y, cell.neighbors, cell.polygon]))), JSON.parse(JSON.stringify(b.cells.map(cell => [cell.x, cell.y, cell.neighbors, cell.polygon]))));
  for (const cell of a.cells) {
    assert.ok(cell.neighbors.length >= 3, cell.id);
    assert.ok(cell.polygon.length >= 3, cell.id);
    for (const [x, y] of cell.polygon) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  }
});

test('niche construction changes resources but restores temporary patch climate', () => {
  const world = community();
  const trace = TRACE.ensureCommunity(world);
  for (let step = 0; step < 90; step += 1) {
    world.generation += 1;
    const before = world.patches.map(patch => ({ id: patch.id, moisture: patch.moisture, elevation: patch.elevation }));
    TRACE.prepareGeneration(world);
    TRACE.finalizeGeneration(world);
    for (const baseline of before) {
      const patch = world.patches.find(entry => entry.id === baseline.id);
      assert.equal(patch.moisture, baseline.moisture);
      assert.equal(patch.elevation, baseline.elevation);
    }
  }
  assert.ok(trace.metrics.engineeredCells > 0);
  assert.ok(Object.keys(trace.patchEffects).length === 12);
  assert.ok(trace.cells.some(cell => cell.engineerSpeciesIds.includes(1)));
  assert.ok(trace.cells.some(cell => cell.engineerSpeciesIds.includes(3)));
  assert.ok(world.resources['12'].vegetation !== 30);
});

test('patch effects and mobility stay bounded on a long run', () => {
  const world = community();
  TRACE.ensureCommunity(world);
  for (let step = 0; step < 600; step += 1) {
    world.generation += 1;
    TRACE.prepareGeneration(world);
    TRACE.finalizeGeneration(world);
  }
  for (const effect of Object.values(world.lifeTrace.patchEffects)) {
    assert.ok(effect.vegetationMultiplier >= .7 && effect.vegetationMultiplier <= 1.22);
    assert.ok(effect.planktonMultiplier >= .7 && effect.planktonMultiplier <= 1.18);
    assert.ok(effect.mobility.land >= .82 && effect.mobility.land <= 1.24);
    assert.ok(effect.mobility.water >= .84 && effect.mobility.water <= 1.2);
  }
  assert.ok(world.lifeTrace.events.length <= 240);
  assert.ok(world.lifeTrace.cells.every(cell => cell.history.length <= 48));
});

test('cell reports expose causal hierarchy and species engineering footprint', () => {
  const world = community();
  TRACE.ensureCommunity(world);
  for (let step = 0; step < 80; step += 1) {
    world.generation += 1;
    TRACE.prepareGeneration(world);
    TRACE.finalizeGeneration(world);
  }
  const cell = world.lifeTrace.cells.find(entry => entry.engineerSpeciesIds.includes(1));
  const report = TRACE.cellReport(world, cell.id);
  assert.equal(report.hierarchy.label, 'СЛЕД ЖИЗНИ');
  assert.ok(report.hierarchy.children.length > 0);
  const impact = TRACE.speciesImpact(world, 1);
  assert.ok(impact.cells > 0);
  assert.ok(impact.effects.length > 0);
});

test('connectivity bridge multiplies planetary links without replacing the planet model', () => {
  const bridgeContext = vm.createContext({ globalThis: null });
  bridgeContext.globalThis = bridgeContext;
  bridgeContext.CladaLivingPlanetCore = { connectivityModifier() { return .8; } };
  vm.runInContext(source, bridgeContext, { filename: '26-life-trace-core.js' });
  const core = bridgeContext.CladaLifeTraceCore;
  const world = community();
  core.ensureCommunity(world);
  const sourcePatch = world.patches[0];
  const targetPatch = world.patches[1];
  sourcePatch.lifeTraceMobility = { land: 1.21, water: 1.1 };
  targetPatch.lifeTraceMobility = { land: 1.21, water: 1.1 };
  const value = bridgeContext.CladaLivingPlanetCore.connectivityModifier(world, sourcePatch, targetPatch, { guild: 'filterer' });
  assert.ok(value > .8 && value <= 1.45);
});
