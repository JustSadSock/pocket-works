import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBlueprint, createRepairPacket, BLUEPRINT_EXAMPLE, BlueprintError } from '../src/blueprint.js';
import { normalizeDocument, compileDocument } from '../src/engine.js';

test('Blueprint compiles Gearfly into gears, frame and cover', () => {
  const { document, report } = compileBlueprint(BLUEPRINT_EXAMPLE);
  assert.equal(document.format, 'formacode-1');
  assert.deepEqual(document.parts.map(p => p.id), ['flywheel', 'thumb', 'frame-base', 'frame-cover']);
  assert.equal(report.gearPairs[0].ratio, 2.8);
  assert.equal(report.gearPairs[0].centerDistance, 20.2);
  assert.doesNotThrow(() => normalizeDocument(document));
  assert.doesNotThrow(() => compileDocument(document));
});

test('Blueprint compiler rejects incompatible gear modules', () => {
  const broken = structuredClone(BLUEPRINT_EXAMPLE);
  broken.parts[1].module = 1.3;
  assert.throws(() => compileBlueprint(broken), error => {
    assert.ok(error instanceof BlueprintError);
    assert.match(error.message, /module должен совпадать/);
    return true;
  });
});

test('repair packet preserves source and bans low-level gear drawing', () => {
  const source = JSON.stringify({ format: 'forma-blueprint-1', parts: [] });
  let error;
  try { compileBlueprint(JSON.parse(source)); } catch (caught) { error = caught; }
  const repair = createRepairPacket(source, error);
  assert.match(repair, /Исходный Blueprint/);
  assert.match(repair, /Не рисуй шестерни/);
  assert.match(repair, /Нужен непустой массив parts/);
});
