import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVELS,
  edgeForMove,
  flipFacing,
  portalExit,
  scoreRun,
  simulate,
  validatePlacements
} from '../game-core.js';

test('every authored answer completes its level', () => {
  for (const level of LEVELS) {
    const result = simulate(level, level.answer);
    assert.equal(result.status, 'success', `level ${level.id}: ${result.status}`);
    assert.equal(result.collected.length, level.crystals.length, `level ${level.id} crystals`);
  }
});

test('portal exit is determined by the standing gate facing', () => {
  assert.deepEqual(portalExit({ slot: 'v:3:2', facing: 'E' }), {
    cell: { x: 3, y: 2 }, edge: { x: 3, y: 2.5 }, dir: 'E'
  });
  assert.deepEqual(portalExit({ slot: 'h:4:3', facing: 'N' }), {
    cell: { x: 4, y: 2 }, edge: { x: 4.5, y: 3 }, dir: 'N'
  });
});

test('movement maps to the crossed board edge', () => {
  assert.equal(edgeForMove({ x: 1, y: 2 }, { x: 2, y: 2 }), 'v:2:2');
  assert.equal(edgeForMove({ x: 2, y: 2 }, { x: 2, y: 1 }), 'h:2:2');
});

test('duplicate sockets and missing gates are rejected', () => {
  const level = LEVELS[0];
  assert.equal(validatePlacements(level, {}).reason, 'missing-portals');
  const duplicate = {
    A: { slot: level.sockets[0], facing: 'E' },
    B: { slot: level.sockets[0], facing: 'W' }
  };
  assert.equal(validatePlacements(level, duplicate).reason, 'duplicate-slot');
});

test('facing flips only within the edge axis', () => {
  assert.equal(flipFacing('v:2:2', 'E'), 'W');
  assert.equal(flipFacing('h:2:2', 'N'), 'S');
});

test('run rating rewards clean planning', () => {
  assert.equal(scoreRun(LEVELS[0], 1, 0), 3);
  assert.equal(scoreRun(LEVELS[0], 8, 0), 2);
  assert.equal(scoreRun(LEVELS[0], 1, 1), 1);
});
