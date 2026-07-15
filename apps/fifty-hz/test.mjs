import assert from 'node:assert/strict';
import {
  buildEventDeck,
  computeFrequency,
  frequencyQuality,
  rankShift,
  serviceFactor,
  SHIFT_DURATION,
} from './game-core.js';

assert.equal(serviceFactor(0), 0);
assert.equal(serviceFactor(1), 0.72);
assert.equal(serviceFactor(2), 1);
assert.equal(computeFrequency(100, 100), 50);
assert.ok(computeFrequency(120, 100) > 50);
assert.ok(computeFrequency(80, 100) < 50);
assert.equal(frequencyQuality(50.1), 1);
assert.equal(frequencyQuality(51.2), 0);
assert.equal(rankShift(8000, true, 80, 80).grade, 'А');
assert.equal(rankShift(9000, false, 80, 80).grade, 'АВАРИЯ');
const deck = buildEventDeck(12345);
assert.ok(deck.length >= 5);
assert.ok(deck.every((event) => event.startsAt >= 0 && event.endsAt <= SHIFT_DURATION + 20));
assert.deepEqual(buildEventDeck(12345), deck);
console.log('50 ГЦ: core tests passed');
