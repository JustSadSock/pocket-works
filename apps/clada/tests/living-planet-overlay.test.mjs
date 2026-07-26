import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core = ['20-01.txt', '20-02.txt', '20-03.txt'].map((part) => fs.readFileSync(new URL(`../runtime/v4/${part}`, import.meta.url), 'utf8')).join('');
const bridge = fs.readFileSync(new URL('../runtime/v4/21-01.txt', import.meta.url), 'utf8');

function makeContext() {
  const patches = [];
  for (let by = 0; by < 3; by += 1) for (let bx = 0; bx < 4; bx += 1) {
    const elevation = .3 + bx * .08 + by * .06;
    patches.push({ id: `${bx}${by}`, bx, by, x: (bx + .5) / 4, y: (by + .5) / 3, elevation, water: elevation < .4, coast: elevation >= .4 && elevation < .47, temperature: .5, moisture: .5, biome: elevation < .4 ? 'ocean' : 'grassland', region: `${bx}${by}` });
  }
  const state = {
    generation: 0, seed: 777, species: [
      { id: 1, parentId: null, centroid: {}, common: 'A', speciationMode: null },
      { id: 2, parentId: null, centroid: {}, common: 'B', speciationMode: null }
    ],
    metacommunity: {
      originSeed: 777, generation: 0, env: { food: .6, mutation: .4, temperature: .5 }, patches,
      species: [{ id: 1, extinct: false, traits: { water: .1, migration: .6 } }, { id: 2, extinct: false, traits: { water: .1, migration: .5 } }],
      demes: [
        { id: 1, speciesId: 1, patchId: '31', guild: 'grazer', abundance: 18, carryingCapacity: 20, age: 30, traits: { water: .1, migration: .6, fertility: .6, mateChoice: .4 }, isolation: .2, geneFlow: .08 },
        { id: 2, speciesId: 1, patchId: '21', guild: 'grazer', abundance: 11, carryingCapacity: 15, age: 28, traits: { water: .1, migration: .5, fertility: .55, mateChoice: .42 }, isolation: .25, geneFlow: .06 }
      ], resources: {}, events: [], nextDemeId: 3, metrics: { colonizations: 0 }
    }
  };
  let nextSpecies = 3;
  const META = {
    vectorDistance(a, b) { const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); let sum = 0; for (const k of keys) sum += ((a?.[k] || 0) - (b?.[k] || 0)) ** 2; return Math.sqrt(sum / Math.max(1, keys.size)); },
    advance(community) { community.generation += 1; for (const d of community.demes) { d.age += 1; d.abundance *= .999; } return { proposals: [] }; },
    applySpeciation(community, proposal, newSpecies) { const d = community.demes.find((x) => x.id === proposal.demeId); if (!d) return false; community.species.push({ id: newSpecies.id, parentId: proposal.speciesId, traits: { ...d.traits }, extinct: false }); d.speciesId = newSpecies.id; return true; }
  };
  const context = vm.createContext({
    console, Math, Object, Array, Map, Set, Number, String, Boolean, JSON, globalThis: null,
    state, META,
    terrainAt(x, y) { return { elevation: .3 + x * .2, moisture: .5, temperature: .5, water: x < .25, coast: x >= .25 && x < .32, biome: x < .25 ? 'ocean' : 'grassland', region: 'x' }; },
    metaCreateAppSpecies(proposal) {
      const id = nextSpecies++;
      state.species.push({ id, parentId: proposal.speciesId, centroid: {}, common: `S${id}` });
      META.applySpeciation(state.metacommunity, proposal, { id, niche: 'grazer' });
      return id;
    },
    buildCompactDiagnostic() { return { schema: 'base', version: '4.1.0' }; }
  });
  context.globalThis = context;
  return context;
}

test('bridge prepares the planet before the demographic step and preserves finite populations', () => {
  const context = makeContext();
  vm.runInContext(core, context, { filename: '20-living-planet-core.js' });
  vm.runInContext(bridge, context, { filename: '21-01.txt' });
  const before = context.state.metacommunity.demes.reduce((s, d) => s + d.abundance, 0);
  const result = context.META.advance(context.state.metacommunity);
  const after = context.state.metacommunity.demes.reduce((s, d) => s + d.abundance, 0);
  assert.ok(context.state.metacommunity.planet);
  assert.equal(context.state.metacommunity.generation, 1);
  assert.ok(after > before * .9 && after < before * 1.1);
  assert.ok(context.state.metacommunity.patches.every((p) => Number.isFinite(p.elevation) && Number.isFinite(p.temperature)));
  assert.ok(Array.isArray(result.proposals));
});

test('diagnostic export gains a compact living-planet section', () => {
  const context = makeContext();
  vm.runInContext(core, context);
  vm.runInContext(bridge, context);
  context.META.advance(context.state.metacommunity);
  const payload = context.buildCompactDiagnostic();
  assert.equal(payload.version, '4.2.0');
  assert.equal(payload.planet.schema, 'clada-living-planet-v1');
  assert.equal(payload.planet.patches.length, 12);
  assert.ok(payload.planet.timeline.length >= 1);
});

test('hybrid proposal metadata reaches both visible and macro species records', () => {
  const context = makeContext();
  vm.runInContext(core, context);
  vm.runInContext(bridge, context);
  const first = context.state.metacommunity.demes[0];
  const second = { id: 3, speciesId: 2, patchId: first.patchId, guild: 'grazer', abundance: 14, traits: { water: .12, migration: .5, fertility: .5, mateChoice: .5 }, isolation: .1, geneFlow: .1 };
  context.state.metacommunity.demes.push(second);
  context.state.metacommunity.nextDemeId = 4;
  const proposal = context.CladaLivingPlanetCore.createHybridProposal(context.state.metacommunity, first, second);
  const id = context.metaCreateAppSpecies(proposal);
  const app = context.state.species.find((s) => s.id === id);
  const macro = context.state.metacommunity.species.find((s) => s.id === id);
  assert.equal(app.hybrid, true);
  assert.equal(app.hybridParentId, 2);
  assert.equal(app.speciationMode, 'hybrid');
  assert.equal(macro.hybridParentId, 2);
});
