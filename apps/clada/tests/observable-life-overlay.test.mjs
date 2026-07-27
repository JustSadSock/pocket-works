import test from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from './observable-life-test-harness.mjs';

test('reconciliation preserves an existing representative and adds a travelling colonist', () => {
  const { context, state } = makeContext();
  const original = state.organisms[0];
  context.metaReconcileRepresentatives({ soft: false });
  assert.ok(state.organisms.includes(original));
  assert.equal(original.x, .22);
  const colonist = state.organisms.find((organism) => organism.macroDemeId === 2);
  assert.ok(colonist);
  assert.ok(colonist.observationJourney);
  assert.equal(colonist.observationJourney.sourcePatchId, 'A');
  assert.equal(colonist.observationJourney.targetPatchId, 'B');
  assert.ok(colonist.x < .5, 'colonist begins at the source instead of teleporting');
});

test('multiple generation saves are coalesced into one idle write', () => {
  const { context, getIdle, getSaves } = makeContext();
  context.saveState(); context.saveState(); context.saveState();
  assert.equal(getSaves(), 0);
  assert.equal(typeof getIdle(), 'function');
  getIdle()();
  assert.equal(getSaves(), 1);
});

test('history stores a compact stratified visual sample', () => {
  const { context, state } = makeContext();
  for (let i = 0; i < 160; i += 1) state.organisms.push({ id: 100 + i, speciesId: 1, macroDemeId: i % 2 ? 1 : 2, x: i % 2 ? .2 : .8, y: .5, genome: { diet: .2 } });
  context.metaRecordHistory();
  assert.equal(state.history.length, 1);
  assert.ok(state.history[0].organisms.length <= 84);
  assert.equal(state.history[0].population, 32);
});
