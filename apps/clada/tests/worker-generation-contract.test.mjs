import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../runtime/v4/23-worker-storage.js', import.meta.url);

test('worker generation applies the returned community through the existing adapters', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const calls = [];
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    addEventListener() {},
    globalThis: null,
    state: { generation: 0, rng: 1, env: { food: .5 }, metacommunity: { generation: 0, rng: 1 }, interactions: {} },
    saveState() { calls.push('save'); },
    removeStoredWorld() {},
    simulateStep() { calls.push('step'); },
    finalizeGeneration() {},
    metaEnsureState() { return context.state.metacommunity; },
    metaSyncVisibleTraitsIntoCommunity() { calls.push('traits'); },
    deepClone(value) { return JSON.parse(JSON.stringify(value)); },
    metaCreateAppSpecies() { calls.push('species'); },
    metaSyncSpeciesRecords() { calls.push('species-records'); },
    metaSyncPopulationRecords() { calls.push('population-records'); },
    metaReconcileRepresentatives() { calls.push('reconcile'); },
    metaRecordHistory() { calls.push('history'); },
    updateTimeline() { calls.push('timeline'); },
    updateReadouts() { calls.push('readouts'); },
    META: { advance(meta) { meta.generation += 1; return { proposals: [] }; } },
    buildCompactDiagnostic: undefined
  });
  context.globalThis = context;
  context.CladaRuntimeServices = {
    storage: null,
    simulation: {
      async advance(input) {
        return { community: { ...input, generation: input.generation + 1, rng: 8 }, proposals: [], duration: 2.5 };
      }
    }
  };

  vm.runInContext(source, context, { filename: '23-worker-storage.js' });
  context.finalizeGeneration();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.state.generation, 1);
  assert.equal(context.state.rng, 8);
  assert.ok(calls.includes('traits'));
  assert.ok(calls.includes('reconcile'));
  assert.ok(calls.includes('history'));
  assert.ok(calls.includes('save'));
});
