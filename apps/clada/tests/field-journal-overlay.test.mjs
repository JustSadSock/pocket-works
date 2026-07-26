import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function nodeStub() {
  return {
    dataset: {}, files: [], value: '',
    querySelector: () => null,
    insertAdjacentHTML() {},
    addEventListener() {},
    click() {},
    setAttribute() {}
  };
}

test('field journal overlay installs without mutating metacommunity', () => {
  const viewTabs = nodeStub();
  const sheetBody = nodeStub();
  const app = nodeStub();
  const replayInput = nodeStub();
  const document = {
    querySelector(selector) {
      if (selector === '.app') return app;
      if (selector === '#fieldReplayInput') return replayInput;
      return null;
    }
  };
  const state = {
    generation: 164,
    seed: 'garden',
    originMode: 'mature',
    commandLog: [],
    env: { temperature: .52, food: .62, mutation: .24 },
    metacommunity: {
      species: [{ id: 1, abundance: 12, guild: 'grazer', extinct: false }],
      demes: [{ id: 1, speciesId: 1, abundance: 12, trend: 1, patchId: '00', foodRatio: .9, compatibility: .9, carryingCapacity: 15, geneFlow: .2, isolation: .1 }],
      events: []
    }
  };
  const context = vm.createContext({
    globalThis: {}, state, document, viewTabs, sheetBody,
    finalizeGeneration() {}, openSpeciesSheet() {}, openMenuSheet() {}, buildWorld(seed) { state.seed = seed; state.generation = 164; }, migrateLivingState() {},
    applyCataclysm(type) { state.commandLog.push({ g: state.generation, type: 'cataclysm', value: type }); }, seedAt(x, y, amount) { state.commandLog.push({ g: state.generation, type: 'introduction', x, y, amount }); }, buildCompactDiagnostic() { return { version: '4.0.0' }; },
    saveState() {}, safeText: String, Blob, URL, setTimeout,
    LIVING: { originMode: 'mature', habitatColors: {} },
    META: { summarize() { return { abundance: 12, richness: 1, demes: 1, occupiedPatches: 1, guilds: {} }; } },
    metaEnsureState() { return state.metacommunity; },
    metaPatchById() { return null; },
    metaRound(value) { return value; },
    MAX_ORGANISMS: 260,
    showToast() {}, syncAllUI() {}, syncPressureUI() {}, closeSheet() {}, openSheet() {}, tone() {},
    clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); },
    fieldJournalTestMarker: true,
    requestAnimationFrame(callback) { callback(); }
  });
  const source = ['../runtime/v4/18-field-journal-core.js', '../runtime/v4/19-01.txt', '../runtime/v4/19-02.txt', '../runtime/v4/19-03.txt'].map((name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8')).join('\n');
  vm.runInContext(source, context);
  assert.equal(state.fieldJournal.version, 1);
  assert.equal(state.fieldJournal.speciesSeries[1].length, 1);
  assert.equal(state.metacommunity.demes[0].abundance, 12);

  context.fieldStartReplay({
    schema: 'clada-replay-v1', seed: 'garden', originMode: 'mature', version: '4.1.0',
    commands: [{ g: 164, type: 'environment', key: 'food', value: .88 }, { g: 164, type: 'cataclysm', value: 'ice' }]
  });
  assert.equal(state.env.food, .88);
  assert.equal(state.fieldJournal.replay.active, false);
  assert.equal(state.commandLog.filter((entry) => entry.type === 'environment').length, 1);
  assert.equal(state.commandLog.filter((entry) => entry.type === 'cataclysm').length, 1);
});
