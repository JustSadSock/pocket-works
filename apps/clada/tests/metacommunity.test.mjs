import test from 'node:test';
import assert from 'node:assert/strict';
import { Core, runCommunity } from './metacommunity-harness.mjs';

test('marine, terrestrial, and predator guilds persist in the mature baseline ensemble', () => {
  const results = [];
  for (let seed = 1; seed <= 8; seed += 1) results.push(runCommunity({ seed, mode: 'mature' }, 800));
  assert.equal(results.filter((result) => result.summary.richness === 0).length, 0);
  assert.equal(results.filter((result) => result.summary.richness <= 1).length, 0);
  assert.ok(results.every((result) => (result.summary.guilds.filterer || 0) > 2), 'marine filterers must survive all baseline worlds');
  assert.ok(results.filter((result) => (result.summary.guilds.predator || 0) > 2).length >= 7, 'predators should persist in most worlds');
  assert.ok(results.every((result) => result.summary.occupiedPatches >= 7), 'life must disperse across the map');
});

test('maximum food and mutation do not collapse the world into one species', () => {
  const results = [];
  for (let seed = 21; seed <= 28; seed += 1) results.push(runCommunity({ seed, mode: 'mature', food: 1, mutation: 1 }, 800));
  assert.ok(results.every((result) => result.summary.richness >= 8));
  assert.ok(results.every((result) => result.summary.richness <= 55), 'high mutation must not create unbounded species spam');
  assert.ok(results.every((result) => (result.summary.guilds.filterer || 0) > 2));
  assert.ok(results.filter((result) => (result.summary.guilds.predator || 0) > 2).length >= 6);
});

test('a single surviving lineage can recolonize patches and radiate without scripted species creation', () => {
  const results = [];
  for (let seed = 41; seed <= 50; seed += 1) results.push(runCommunity({ seed, single: true }, 1000));
  const richness = results.map((result) => result.summary.richness).sort((a, b) => a - b);
  const occupied = results.map((result) => result.summary.occupiedPatches).sort((a, b) => a - b);
  const multiGuild = results.filter((result) => Object.values(result.summary.guilds).filter((value) => value > 1).length >= 2).length;
  assert.ok(richness[Math.floor(richness.length / 2)] >= 7);
  assert.ok(occupied[Math.floor(occupied.length / 2)] >= 7);
  assert.ok(multiGuild >= 4, 'ecological radiation should occur in a substantial fraction of lineages');
});

test('core summaries remain finite and bounded after 1200 generations', () => {
  const { community, summary } = runCommunity({ seed: 777, mode: 'primordial' }, 1200);
  assert.ok(Number.isFinite(summary.abundance));
  assert.ok(summary.abundance > 0);
  assert.ok(summary.richness >= 5 && summary.richness <= 60);
  for (const deme of community.demes) {
    assert.ok(Number.isFinite(deme.abundance));
    assert.ok(deme.abundance >= 0);
    assert.ok(deme.isolation >= 0 && deme.isolation <= 1);
    assert.ok(deme.geneFlow >= 0 && deme.geneFlow <= 1);
  }
});

test('habitat compatibility rejects a terrestrial filterer and accepts an aquatic one', () => {
  const traits = { thermal: .55, moisture: .9, altitude: .2, water: .94, size: .2, speed: .4, prey: .05, plant: .08, filter: .95, carrion: .05, nocturnal: .2, mateChoice: .3, migration: .5, fertility: .7, parentalCare: .2, armor: .1, social: .4 };
  const water = { water: true, coast: false, biome: 'ocean', temperature: .54, moisture: .95, elevation: .18 };
  const land = { water: false, coast: false, biome: 'grassland', temperature: .54, moisture: .5, elevation: .5 };
  assert.ok(Core.habitatCompatibility(traits, water, 'filterer') > .5);
  assert.ok(Core.habitatCompatibility(traits, land, 'filterer') < .1);
});
