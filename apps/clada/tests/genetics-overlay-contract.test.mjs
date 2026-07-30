import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sourceUrls = [1,2].map(index => new URL(`../runtime/v5/25-${String(index).padStart(2,'0')}.txt`, import.meta.url));

test('main-thread fallback wraps the existing ecology pipeline with genetics', async () => {
  const source = (await Promise.all(sourceUrls.map(url => readFile(url, 'utf8')))).join('\n');
  const calls = [];
  const community = { generation: 0, species: [], demes: [] };
  const context = vm.createContext({
    console,
    globalThis: null,
    state: { metacommunity: community, species: [] },
    META: { advance(value) { calls.push('ecology'); value.generation += 1; return { proposals: [] }; } },
    metaCreateAppSpecies() { calls.push('species'); return 7; },
    buildWorld() { calls.push('world'); },
    migrateLivingState() { calls.push('migrate'); },
    saveState() { calls.push('save'); },
    openSpeciesSheet: undefined,
    fieldOpenJournal: undefined,
    fieldBuildSpeciesDiagnostic: undefined,
    buildCompactDiagnostic: undefined,
    safeText(value) { return String(value); },
    sheetBody: { querySelector() { return null; }, insertAdjacentHTML() {} },
    openSheet() {}
  });
  context.globalThis = context;
  context.CladaGeneticsCore = {
    clamp: value => Math.max(0, Math.min(1, Number(value) || 0)),
    ensureCommunity(value) { calls.push('ensure'); value.genetics ||= {}; return value.genetics; },
    prepareGeneration() { calls.push('prepare'); },
    finalizeGeneration() { calls.push('finalize'); },
    recordSpeciation() { calls.push('record-speciation'); },
    summarizeSpecies() { return {}; },
    compactDiagnostic() { return {}; }
  };

  vm.runInContext(source, context, { filename: '25-genetics-ui.js' });
  calls.length = 0;
  context.META.advance(community);
  assert.deepEqual(calls, ['ensure', 'prepare', 'ecology', 'finalize']);
  context.metaCreateAppSpecies({ speciesId: 1, demeId: 2 });
  assert.ok(calls.includes('record-speciation'));
});
