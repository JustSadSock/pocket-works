import fs from 'node:fs';
import vm from 'node:vm';

const core = fs.readFileSync(new URL('../runtime/v4/22-01.txt', import.meta.url), 'utf8');
const overlay = ['22-02-1.txt', '22-02-2.txt', '22-02-3.txt', '22-03-1.txt', '22-03-2.txt', '22-03-3.txt'].map((part) => fs.readFileSync(new URL(`../runtime/v4/${part}`, import.meta.url), 'utf8')).join('');

export function makeContext() {
  let nextId = 20;
  let idleCallback = null;
  let saves = 0;
  const patches = [
    { id: 'A', x: .2, y: .5, water: false, bx: 0, by: 0 },
    { id: 'B', x: .8, y: .5, water: false, bx: 1, by: 0 }
  ];
  const demes = [
    { id: 1, speciesId: 1, patchId: 'A', guild: 'grazer', abundance: 18, traits: { water: .1 }, appPopulationId: 101 },
    { id: 2, speciesId: 1, patchId: 'B', guild: 'grazer', abundance: 14, traits: { water: .1 }, appPopulationId: 102, colonizationSource: 1, planetRouteType: 'land-bridge' }
  ];
  const state = {
    step: 0, generation: 12, selectedId: null, env: { food: .6 }, season: 2, fossilIndex: null,
    organisms: [{ id: 1, speciesId: 1, macroDemeId: 1, populationId: 101, x: .22, y: .5, vx: 0, vy: 0, energy: 8, lastMeal: -1, genome: { diet: .2, size: 1, territory: .2 } }],
    species: [{ id: 1, abundance: 32, extinct: false }], populations: [], history: [], macroTimeline: [], events: [], interactions: {},
    metacommunity: { demes, patches, species: [{ id: 1, abundance: 32, extinct: false }], metrics: {}, generation: 12 }
  };
  const context = vm.createContext({
    console, Math, Map, Set, structuredClone, Blob, File: undefined,
    state, MAX_ORGANISMS: 180, MAX_HISTORY: 120, metaReconciling: false, metaLastSoftStep: -1,
    addEventListener() {}, document: { hidden: false, addEventListener() {} },
    requestIdleCallback(callback) { idleCallback = callback; return 1; }, cancelIdleCallback() {},
    setTimeout(callback) { idleCallback = callback; return 2; }, clearTimeout() {},
    saveState() { saves += 1; },
    simulateStep() { state.step += 1; },
    metaRecordHistory() {}, buildWorld() {}, migrateLivingState() {},
    metaEnsureState() { return state.metacommunity; },
    META: { summarize(meta) { return { abundance: meta.demes.reduce((sum, d) => sum + d.abundance, 0), richness: 1, demes: meta.demes.length, occupiedPatches: 2, guilds: { grazer: 32 } }; } },
    metaCreateRepresentative(deme, juvenile = false) {
      return { id: nextId++, speciesId: deme.speciesId, macroDemeId: deme.id, populationId: deme.appPopulationId, x: deme.patchId === 'A' ? .2 : .8, y: .5, vx: 0, vy: 0, energy: 8, lastMeal: -1, age: juvenile ? 30 : 300, genome: { diet: .2, size: 1, territory: .2 } };
    },
    metaPatchIdAt(x) { return x < .5 ? 'A' : 'B'; },
    terrainAt(x) { return { water: false, biome: 'grassland', x }; },
    distanceSq(x1, y1, x2, y2) { return (x1 - x2) ** 2 + (y1 - y2) ** 2; },
    snapshotOrganism(organism) { return { id: organism.id, x: organism.x, y: organism.y, speciesId: organism.speciesId, genome: { ...organism.genome } }; }
  });
  vm.runInContext(core, context);
  vm.runInContext(overlay, context);
  return { context, state, getIdle: () => idleCallback, getSaves: () => saves };
}
