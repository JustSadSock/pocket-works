import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIALS,
  OBJECTS,
  cubeSideForMass,
  formatLength,
  nearestObject,
  sanitizeState
} from '../engine.js';

test('objects are unique and strictly sorted by size', () => {
  assert.equal(new Set(OBJECTS.map((object) => object.id)).size, OBJECTS.length);
  for (let index = 1; index < OBJECTS.length; index += 1) {
    assert.ok(OBJECTS[index].size > OBJECTS[index - 1].size);
  }
});

test('materials have valid positive densities', () => {
  assert.ok(MATERIALS.length >= 8);
  MATERIALS.forEach((material) => assert.ok(material.density > 0));
});

test('nearest object resolves the human scale', () => {
  assert.equal(nearestObject(Math.log10(1.75)).id, 'human');
});

test('ten kilograms of osmium forms about a 7.6 cm cube', () => {
  const side = cubeSideForMass(10, 22590);
  assert.ok(side > 0.075 && side < 0.077);
});

test('length formatter uses useful engineering units', () => {
  assert.match(formatLength(2e-9), /нм/);
  assert.match(formatLength(1.75), /м/);
  assert.match(formatLength(12742000), /км/);
});

test('stored state is clamped and unknown ids are discarded', () => {
  const state = sanitizeState({
    logScale: 99,
    selectedId: 'missing',
    pinnedIds: ['human', 'missing', 'human'],
    massLogKg: -99,
    screen: 'broken',
    settings: { sound: false }
  });
  assert.equal(state.logScale, 27);
  assert.deepEqual(state.pinnedIds, ['human']);
  assert.equal(state.massLogKg, -3);
  assert.equal(state.screen, 'scale');
  assert.equal(state.settings.sound, false);
});
