import assert from 'node:assert/strict';
import {
  createBirthdayModel,
  exactPatternProbability
} from './math.js';

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

const model23 = createBirthdayModel(23);
near(model23.anyMatch, 0.5072972343239854, 1e-12, 'classic n=23');

const model50 = createBirthdayModel(50);
near(model50.anyMatch, 0.9703735795779884, 1e-12, 'classic n=50');

const model3 = createBirthdayModel(3);
near(model3.tripleOrMore, 1 / (365 ** 2), 5e-13, 'triple n=3');

const model4 = createBirthdayModel(4);
const twoPairs = exactPatternProbability(4, { 2: 2 }).probability;
near(model4.twoSharedDatesOrMore, twoPairs, 5e-13, 'two shared dates n=4');
near(model4.quartetOrMore, 1 / (365 ** 3), 5e-13, 'quartet n=4');

assert.equal(createBirthdayModel(366).anyMatch, 1, 'pigeonhole pair threshold');
assert.equal(createBirthdayModel(731).tripleOrMore, 1, 'pigeonhole triple threshold');
assert.ok(model23.scenarios.compact.length >= 4, 'scenario catalog populated');

console.log('sovpalo math tests passed');
