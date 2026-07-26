import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = ['20-01.txt', '20-02.txt', '20-03.txt'].map((part) => fs.readFileSync(new URL(`../runtime/v4/${part}`, import.meta.url), 'utf8')).join('');
function load() {
  const context = vm.createContext({ console, Math, Object, Array, Map, Set, Number, String, Boolean, JSON, globalThis: null });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: '20-living-planet-core.js' });
  return context.CladaLivingPlanetCore;
}
function patches() {
  const list = [];
  for (let by = 0; by < 3; by += 1) for (let bx = 0; bx < 4; bx += 1) {
    const x = (bx + .5) / 4, y = (by + .5) / 3;
    const elevation = .28 + bx * .08 + (by === 1 ? .18 : 0) - (bx === 0 ? .12 : 0);
    const water = elevation < .4;
    list.push({ id: `${bx}${by}`, bx, by, x, y, elevation, water, coast: !water && elevation < .47, temperature: .52 + (y - .5) * .2, moisture: .55 - bx * .06, biome: water ? 'ocean' : elevation > .73 ? 'highland' : 'grassland', region: `${bx}${by}` });
  }
  return list;
}
function community(seed = 1234) {
  return {
    originSeed: seed, generation: 0, rng: 99, env: { food: .62, mutation: .45, temperature: .52 },
    patches: patches(), species: [
      { id: 1, extinct: false, traits: { thermal: .5, moisture: .5, altitude: .3, water: .1, migration: .55, fertility: .6, mateChoice: .4, plant: .8, prey: .1 } },
      { id: 2, extinct: false, traits: { thermal: .55, moisture: .48, altitude: .25, water: .12, migration: .48, fertility: .55, mateChoice: .44, plant: .74, prey: .14 } }
    ],
    demes: [
      { id: 1, speciesId: 1, patchId: '31', guild: 'grazer', abundance: 20, carryingCapacity: 25, age: 30, traits: { thermal: .5, moisture: .5, altitude: .3, water: .1, migration: .72, fertility: .6, mateChoice: .4, plant: .8, prey: .1 }, isolation: .2, geneFlow: .08 },
      { id: 2, speciesId: 1, patchId: '21', guild: 'grazer', abundance: 12, carryingCapacity: 18, age: 28, traits: { thermal: .48, moisture: .46, altitude: .4, water: .1, migration: .5, fertility: .58, mateChoice: .45, plant: .78, prey: .1 }, isolation: .3, geneFlow: .06 },
      { id: 3, speciesId: 2, patchId: '31', guild: 'grazer', abundance: 18, carryingCapacity: 22, age: 34, traits: { thermal: .55, moisture: .48, altitude: .25, water: .12, migration: .48, fertility: .55, mateChoice: .44, plant: .74, prey: .14 }, isolation: .15, geneFlow: .08 }
    ],
    resources: {}, events: [], nextDemeId: 4, metrics: { colonizations: 0 }
  };
}

test('planet evolution is deterministic for the same seed and history', () => {
  const P = load();
  const a = community(991), b = community(991);
  for (let g = 0; g < 600; g += 1) {
    P.prepareGeneration(a); a.generation += 1;
    P.prepareGeneration(b); b.generation += 1;
  }
  assert.deepEqual(P.compact(a), P.compact(b));
  assert.ok(a.planet.metrics.epochChanges >= 3);
  assert.ok(a.planet.timeline.length > 50);
});

test('currents are directional and mountains reduce terrestrial connection', () => {
  const P = load();
  const c = community(77);
  const planet = P.ensurePlanet(c);
  const seaA = c.patches[0], seaB = c.patches[1];
  seaA.water = true; seaB.water = true; seaA.mountainBarrier = false; seaB.mountainBarrier = false;
  planet.patchBase[seaA.id].currentAngle = 0;
  planet.patchBase[seaA.id].currentStrength = .9;
  planet.patchBase[seaB.id].currentAngle = 0;
  planet.patchBase[seaB.id].currentStrength = .9;
  const aquatic = { guild: 'filterer', traits: { water: .9, migration: .7 } };
  const forward = P.routeDescriptor(c, seaA, seaB, aquatic).modifier;
  const reverse = P.routeDescriptor(c, seaB, seaA, aquatic).modifier;
  assert.ok(forward > reverse * 1.25);
  const landA = c.patches.find((p) => p.id === '21');
  const landB = c.patches.find((p) => p.id === '31');
  landA.water = false; landB.water = false; landA.mountainBarrier = true; landB.mountainBarrier = true;
  const grazer = { guild: 'grazer', traits: { water: .1, migration: .5 } };
  const blocked = P.routeDescriptor(c, landA, landB, grazer).modifier;
  landA.mountainBarrier = false; landB.mountainBarrier = false;
  const open = P.routeDescriptor(c, landA, landB, grazer).modifier;
  assert.ok(open > blocked * 3);
});

test('low sea level opens land bridges and glaciation opens ice bridges', () => {
  const P = load();
  const c = community(88);
  const planet = P.ensurePlanet(c);
  const a = c.patches.find((p) => p.id === '11');
  const b = c.patches.find((p) => p.id === '21');
  a.water = false; b.water = false;
  planet.seaLevel = -.14;
  const route = P.routeDescriptor(c, a, b, { guild: 'grazer', traits: { water: .1, migration: .6 } });
  assert.equal(route.landBridge, true);
  const w1 = c.patches.find((p) => p.id === '00');
  const w2 = c.patches.find((p) => p.id === '10');
  w1.water = true; w2.water = false; w1.seaIce = true; w2.seaIce = true;
  planet.glaciation = .7;
  const ice = P.routeDescriptor(c, w1, w2, { guild: 'grazer', traits: { water: .1, migration: .7 } });
  assert.equal(ice.iceBridge, true);
});

test('geography classifies vicariant, peripatric, ring and parapatric speciation', () => {
  const P = load();
  const c = community(101);
  const d = c.demes[0];
  let p = c.patches.find((x) => x.id === d.patchId);
  d.geographicBarrier = .9; p.mountainBarrier = true;
  assert.equal(P.classifyProposal(c, { speciesId: 1, demeId: d.id, mode: 'ecological' }).mode, 'vicariant');
  d.geographicBarrier = 0; p.mountainBarrier = false; p.island = true; d.age = 20; d.abundance = 7;
  assert.equal(P.classifyProposal(c, { speciesId: 1, demeId: d.id, mode: 'ecological' }).mode, 'peripatric');
  p.island = false; d.ringTerminal = true;
  assert.equal(P.classifyProposal(c, { speciesId: 1, demeId: d.id, mode: 'ecological' }).mode, 'ring');
  d.ringTerminal = false; d.spatialIsolation = .12; d.ecologicalDivergence = .14;
  assert.equal(P.classifyProposal(c, { speciesId: 1, demeId: d.id, mode: 'ecological' }).mode, 'parapatric');
});

test('hybrid and chromosomal origins create viable isolated founder demes', () => {
  const P = load();
  const c = community(202);
  const a = c.demes[0], b = c.demes[2];
  const hybrid = P.createHybridProposal(c, a, b);
  assert.equal(hybrid.mode, 'hybrid');
  assert.equal(hybrid.secondParentId, 2);
  const hybridDeme = c.demes.find((d) => d.id === hybrid.demeId);
  assert.ok(hybridDeme.abundance > .8);
  assert.equal(hybridDeme.geneFlow, 0);
  const chromosomal = P.createChromosomalProposal(c, c.demes[1]);
  assert.equal(chromosomal.mode, 'chromosomal');
  assert.ok(c.demes.find((d) => d.id === chromosomal.demeId).isolation > .8);
});

test('one thousand prepared generations stay finite and produce geographic turnover', () => {
  const P = load();
  const c = community(303);
  const initialWater = c.patches.filter((p) => p.water).length;
  for (let g = 0; g < 1000; g += 1) {
    P.prepareGeneration(c);
    P.applyHabitatStress(c);
    P.adjustIsolation(c);
    c.generation += 1;
  }
  const compact = P.compact(c);
  assert.ok(Number.isFinite(compact.seaLevel));
  assert.ok(compact.timeline.length >= 100);
  assert.ok(c.planet.metrics.epochChanges >= 6);
  assert.ok(c.patches.filter((p) => p.water).length !== initialWater || c.planet.metrics.inundations + c.planet.metrics.emergences > 0);
  assert.ok(c.demes.every((d) => Number.isFinite(d.abundance) && Number.isFinite(d.isolation || 0)));
});
