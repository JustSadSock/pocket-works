import assert from 'node:assert/strict';
import { PUZZLE_TARGETS, TONE_FREQUENCIES, normalizeToneValue, puzzleModeFromTitle, toneFrequency } from './puzzle-assist.js';

assert.equal(TONE_FREQUENCIES.length, 8, 'all eight resonator positions need distinct tones');
for (let index = 1; index < TONE_FREQUENCIES.length; index += 1) {
  const ratio = TONE_FREQUENCIES[index] / TONE_FREQUENCIES[index - 1];
  assert.ok(ratio > 1.22, `adjacent resonator tones ${index - 1}/${index} must be clearly separated on phone speakers`);
}
assert.deepEqual(PUZZLE_TARGETS.market, [2, 5, 1]);
assert.deepEqual(PUZZLE_TARGETS.tower, [6, 2, 4]);
assert.equal(normalizeToneValue(9), 1);
assert.equal(normalizeToneValue(-1), 7);
assert.equal(toneFrequency(2), TONE_FREQUENCIES[2]);
assert.equal(puzzleModeFromTitle('РЫНОЧНЫЙ РЕЗОНАТОР'), 'market');
assert.equal(puzzleModeFromTitle('БАШЕННЫЙ РЕЗОНАТОР'), 'tower');

console.log('BELLFORGE resonance puzzle tests passed');
