import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function genome(role, habitat = 'land') {
  return {
    plantDiet: role === 'plant' ? .9 : .08,
    preyDiet: role === 'prey' ? .9 : .08,
    carrionDiet: role === 'carrion' ? .9 : .12,
    filterDiet: role === 'filter' ? .92 : .04,
    waterAffinity: habitat === 'water' ? .9 : .08,
    moisture: habitat === 'water' ? .88 : .3,
    altitude: habitat === 'high' ? .85 : .25,
    thermal: habitat === 'high' ? .2 : .65,
    size: role === 'prey' ? 1.2 : .75,
    nocturnal: role === 'carrion' ? .75 : .15,
    migration: .25,
    mateChoice: .82,
    speed: 1, vision: 1, metabolism: .8, diet: role === 'prey' ? .85 : .15,
    armor: .2, fertility: 1, pattern: .4, hue: 100, chromosome: 3,
    bodyPlan: .4, limbs: .7, tail: .5, wing: 0, fins: habitat === 'water' ? .8 : .1,
    shell: .1, fur: habitat === 'high' ? .7 : .1, horns: .1, eyes: .6,
    camouflage: .4, social: .5, aquatic: habitat === 'water' ? .85 : .05, display: .4,
    brain: .55, stamina: .55, parentalCare: .4, brood: .5, reproStrategy: .65,
    territory: .4, ambush: .35, cooperation: .45, toxinResistance: .3, burrow: .2
  };
}

function makeContext() {
  let randomState = 1234567;
  const random = () => ((randomState = (randomState * 1664525 + 1013904223) >>> 0) / 4294967296);
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const deepClone = (v) => JSON.parse(JSON.stringify(v));
  const gA = genome('plant', 'land');
  const gB = genome('prey', 'water');
  const state = {
    generation: 100, step: 0, env: { food: .6, mutation: .24 }, terrainSeed: 1,
    diversificationFlow: { generation: 100, populations: {} },
    species: [{ id: 1, born: 0, extinct: null, centroid: deepClone(gA), common: 'предок', peak: 20 }],
    populations: [
      { id: 1, speciesId: 1, region: '00L', centroid: deepClone(gA), founded: 20, lastSeen: 100, size: 8, status: 'stable', isolationAge: 25, geneFlowEMA: 0, ecotype: 'plant:land:day', adaptiveRole: 'plant', adaptiveRoleAssigned: true },
      { id: 2, speciesId: 1, region: '32W', centroid: deepClone(gB), founded: 20, lastSeen: 100, size: 8, status: 'stable', isolationAge: 25, geneFlowEMA: 0, ecotype: 'prey:water:day', adaptiveRole: 'prey', adaptiveRoleAssigned: true }
    ],
    nextPopulationId: 3, nextSpeciesId: 2, lastSpeciationGeneration: -999,
    organisms: [], statistics: { speciations: 0 }, populationEvents: [], interactions: {}, carrion: [], microResources: [], mortality: {}
  };
  for (let i = 0; i < 8; i++) state.organisms.push({ id: i + 1, speciesId: 1, populationId: 1, homeRegion: '00L', x: .12 + i * .004, y: .2, age: 300, energy: 10, genome: deepClone(gA), sex: i % 2 ? 'f' : 'm' });
  for (let i = 0; i < 8; i++) state.organisms.push({ id: 20 + i, speciesId: 1, populationId: 2, homeRegion: '32W', x: .78 + i * .004, y: .78, age: 300, energy: 10, genome: deepClone(gB), sex: i % 2 ? 'f' : 'm' });

  const context = {
    globalThis: null, state, console, Map, Set, Math, Infinity,
    clamp, lerp: (a, b, t) => a + (b - a) * t, deepClone, random,
    randomRange: (a, b) => a + (b - a) * random(), gauss: () => 0,
    distanceSq: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
    terrainAt: (x, y) => x > .6 ? { region: '32W', water: true, moisture: .9, elevation: .18, temperature: .58, coast: false, biome: 'ocean' } : { region: '00L', water: false, moisture: .35, elevation: .28, temperature: .66, coast: false, biome: 'grassland' },
    habitatFitness: () => .9,
    genomeDistance: (a, b) => {
      const keys = ['plantDiet', 'preyDiet', 'filterDiet', 'waterAffinity', 'moisture', 'thermal', 'size'];
      return Math.sqrt(keys.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0) / keys.length);
    },
    livingCentroid: (members) => {
      const out = deepClone(members[0].genome);
      for (const key of Object.keys(out)) if (typeof out[key] === 'number') out[key] = members.reduce((sum, member) => sum + member.genome[key], 0) / members.length;
      return out;
    },
    createPopulation: (speciesId, region, centroid, status, founded) => {
      const pop = { id: state.nextPopulationId++, speciesId, region, centroid: deepClone(centroid), status, founded, lastSeen: state.generation, size: 0 };
      state.populations.push(pop); return pop;
    },
    livingPromotePopulation: (population, members) => {
      const id = state.nextSpeciesId++;
      state.species.push({ id, parentId: population.speciesId, born: state.generation, extinct: null, centroid: deepClone(population.centroid), common: `вид ${id}`, peak: members.length });
      population.speciesId = id; population.status = 'species';
      for (const member of members) member.speciesId = id;
      state.statistics.speciations += 1;
    },
    livingPopulationAt: () => state.populations[0], livingCanMate: () => .5,
    livingSpatialIndex: () => ({ nearby: () => [] }), livingApplyBehavior: () => {},
    reproduce: () => {}, livingFindResources: () => ({ prey: null }), livingFeed: () => {},
    simulateStep: () => {}, migrateLivingState: () => {}, buildWorld: () => {}, saveState: () => {},
    stabilityRaw: (g) => g, stabilityExpressGenome: (g) => g,
    steerToward: () => {}, steerAway: () => {},
    EXTRA: ['bodyPlan', 'limbs', 'tail', 'wing', 'fins', 'shell', 'fur', 'horns', 'eyes', 'camouflage', 'social', 'aquatic', 'display'],
    LIVING: { genomeKeys: ['plantDiet', 'preyDiet', 'carrionDiet', 'filterDiet', 'brain', 'stamina', 'parentalCare', 'brood', 'reproStrategy', 'mateChoice', 'territory', 'ambush', 'migration', 'nocturnal', 'cooperation', 'toxinResistance', 'altitude', 'moisture', 'waterAffinity', 'burrow'] }
  };
  context.globalThis = context;
  return context;
}

test('actual overlay promotes a persistent isolated population', () => {
  const context = makeContext();
  vm.runInNewContext(fs.readFileSync(new URL('../runtime/v3/14-diversification-core.js', import.meta.url), 'utf8'), context);
  vm.runInNewContext(['15-01.txt', '15-02.txt', '15-03.txt'].map((name) => fs.readFileSync(new URL(`../runtime/v3/${name}`, import.meta.url), 'utf8')).join(''), context);
  context.updatePopulationStructure();
  assert.equal(context.state.statistics.speciations, 1);
  assert.equal(context.state.species.filter((species) => species.extinct === null).length, 2);
  assert.equal(new Set(context.state.organisms.map((organism) => organism.speciesId)).size, 2);
});

test('overlay records visible speciation progress without splitting under gene flow', () => {
  const context = makeContext();
  context.state.diversificationFlow = { generation: 100, populations: { 1: { within: 2, cross: 10, hybrid: 0 }, 2: { within: 2, cross: 10, hybrid: 0 } } };
  vm.runInNewContext(fs.readFileSync(new URL('../runtime/v3/14-diversification-core.js', import.meta.url), 'utf8'), context);
  vm.runInNewContext(['15-01.txt', '15-02.txt', '15-03.txt'].map((name) => fs.readFileSync(new URL(`../runtime/v3/${name}`, import.meta.url), 'utf8')).join(''), context);
  context.updatePopulationStructure();
  assert.equal(context.state.statistics.speciations, 0);
  assert.ok(context.state.populations.some((population) => Number.isFinite(population.speciationProgress)));
});
