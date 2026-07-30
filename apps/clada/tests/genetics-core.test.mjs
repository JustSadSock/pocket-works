import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const coreSource = (await Promise.all([1,2,3,4,5].map(index => readFile(new URL(`../runtime/v5/24-${String(index).padStart(2,'0')}.txt`, import.meta.url), 'utf8')))).join('\n');
const coreContext = vm.createContext({ globalThis: null }); coreContext.globalThis = coreContext; vm.runInContext(coreSource, coreContext);
const G = coreContext.CladaGeneticsCore;

function community() {
  return {
    generation: 12,
    rng: 12345,
    originSeed: 'test-world',
    env: { food: .62, mutation: .9, temperature: .52 },
    patches: [
      { id: 'a', biome: 'grassland', water: false },
      { id: 'b', biome: 'forest', water: false }
    ],
    species: [
      { id: 1, guild: 'predator', abundance: 12, traits: { speed: .72, prey: .88, armor: .2, social: .55, fertility: .4, parentalCare: .45, nocturnal: .4 } },
      { id: 2, guild: 'grazer', abundance: 24, traits: { speed: .55, prey: .05, armor: .42, social: .65, fertility: .68, parentalCare: .4, nocturnal: .3 } },
      { id: 3, guild: 'browser', abundance: 17, traits: { speed: .38, prey: .04, armor: .3, social: .72, fertility: .58, parentalCare: .6, nocturnal: .2 } }
    ],
    demes: [
      { id: 1, speciesId: 1, patchId: 'a', guild: 'predator', abundance: 12, carryingCapacity: 16, geneFlow: .05, age: 30, traits: { speed: .72, prey: .88, armor: .2, social: .55, fertility: .4, parentalCare: .45, nocturnal: .4 } },
      { id: 2, speciesId: 2, patchId: 'a', guild: 'grazer', abundance: 24, carryingCapacity: 30, geneFlow: .08, age: 35, traits: { speed: .55, prey: .05, armor: .42, social: .65, fertility: .68, parentalCare: .4, nocturnal: .3 } },
      { id: 3, speciesId: 3, patchId: 'a', guild: 'browser', abundance: 17, carryingCapacity: 24, geneFlow: .04, age: 28, traits: { speed: .38, prey: .04, armor: .3, social: .72, fertility: .58, parentalCare: .6, nocturnal: .2 } }
    ]
  };
}

test('initializes compact ancestry and allele state', () => {
  const world = community();
  const genetics = G.ensureCommunity(world);
  assert.equal(genetics.version, 1);
  assert.equal(genetics.nodes.length, 3);
  assert.ok(world.demes.every(deme => Object.keys(deme.genetics.alleles).length === G.LOCI.length));
  assert.ok(world.demes.every(deme => deme.genetics.heterozygosity > 0));
});

test('predator, pathogen and mutualism pressures remain bounded', () => {
  const world = community();
  G.prepareGeneration(world);
  const predator = world.demes[0];
  const grazer = world.demes[1];
  assert.ok(predator.coevolution.attackMultiplier >= .72 && predator.coevolution.attackMultiplier <= 1.34);
  assert.ok(grazer.coevolution.defenseMultiplier >= 1);
  assert.ok(grazer.coevolution.parasiteCost >= 0 && grazer.coevolution.parasiteCost <= .32);
  assert.ok(world.genetics.mutualisms.length >= 1);
});

test('bottlenecks reduce diversity and create ancestry nodes', () => {
  const world = community();
  G.prepareGeneration(world);
  G.finalizeGeneration(world);
  const deme = world.demes[1];
  const beforeH = deme.genetics.heterozygosity;
  const beforeNodes = world.genetics.nodes.length;
  deme.abundance = .7;
  world.generation += 1;
  G.prepareGeneration(world);
  G.finalizeGeneration(world);
  assert.ok(deme.genetics.heterozygosity < beforeH);
  assert.ok(deme.genetics.inbreeding > 0);
  assert.ok(world.genetics.nodes.length > beforeNodes);
  assert.ok(world.genetics.events.some(event => event.type === 'bottleneck'));
});

test('speciation records a child node and hybrid ancestry', () => {
  const world = community();
  G.ensureCommunity(world);
  world.species.push({ id: 4, guild: 'grazer', abundance: 2, traits: { ...world.species[1].traits } });
  const node = G.recordSpeciation(world, { speciesId: 2, demeId: 2, mode: 'hybrid', secondParentId: 3 }, 4);
  assert.equal(node.type, 'hybrid-speciation');
  assert.equal(world.demes[1].speciesId, 4);
  const incoming = world.genetics.edges.filter(edge => edge.child === node.id);
  assert.equal(incoming.length, 2);
});

test('long run creates mutations without unbounded history', () => {
  const world = community();
  G.ensureCommunity(world);
  for (let generation = 0; generation < 400; generation += 1) {
    world.generation += 1;
    G.prepareGeneration(world);
    G.finalizeGeneration(world);
  }
  assert.ok(world.genetics.metrics.mutations > 0);
  assert.ok(world.genetics.nodes.length <= 520);
  assert.ok(world.genetics.edges.length <= 860);
  assert.ok(world.genetics.mutations.length <= 360);
});

test('persistent low abundance does not count the same bottleneck every generation', () => {
  const world = community();
  G.ensureCommunity(world);
  const deme = world.demes[0];
  deme.genetics.previousAbundance = 30;
  deme.abundance = 1.5;
  G.prepareGeneration(world);
  G.finalizeGeneration(world);
  const first = world.genetics.metrics.bottlenecks;
  for (let step = 0; step < 10; step += 1) {
    world.generation += 1;
    G.prepareGeneration(world);
    G.finalizeGeneration(world);
  }
  assert.equal(first, 1);
  assert.equal(world.genetics.metrics.bottlenecks, 1);
});
