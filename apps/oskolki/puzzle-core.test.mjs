import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItems, fragmentText, shuffledIds, makeRound, correctPositions } from './puzzle-core.js';

test('numbered paragraphs are independent questions', () => {
  assert.deepEqual(parseItems('1. Alpha beta gamma.\n2) Delta epsilon zeta.\n3: Eta theta iota.'),
    ['Alpha beta gamma.', 'Delta epsilon zeta.', 'Eta theta iota.']);
});
test('numbered lines continue across hard wraps without losing words', () => {
  assert.deepEqual(parseItems('1. A long\n  statement continues here\n2. Another sentence'),
    ['A long statement continues here', 'Another sentence']);
});
test('bullets and plain lines work', () => {
  assert.deepEqual(parseItems('- First line\n• Second line\n\nThird line'),
    ['First line', 'Second line', 'Third line']);
});
test('blank and BOM input', () => {
  assert.deepEqual(parseItems('\ufeff\n  \n'), []);
  assert.deepEqual(parseItems('\ufeff1. Text'), ['Text']);
});
test('retain true numbered text in the body', () => {
  assert.deepEqual(parseItems('1. In 2026 there are 12 months.\n2. Nineteen ninety-nine.'),
    ['In 2026 there are 12 months.', 'Nineteen ninety-nine.']);
});
test('latin language fragments are contiguous ordered word groups', () => {
  const text = 'One two three four five six seven eight nine';
  const parts = fragmentText(text);
  assert(parts.length >= 3 && parts.length <= 8);
  assert.equal(parts.join(' '), text);
});
test('Ukrainian with punctuation round-trips', () => {
  const text = 'Мова, память і культура нерозривно пов’язані між собою.';
  assert.equal(fragmentText(text).join(' '), text);
});
test('Arabic word order and punctuation round-trip', () => {
  const text = 'اللغة العربية لغة جميلة وغنية بالمفردات.';
  assert.equal(fragmentText(text).join(' '), text);
});
test('Han unspaced text round-trips exactly', () => {
  const text = '学习历史帮助我们理解今天的世界。';
  assert.equal(fragmentText(text).join(''), text);
  assert(fragmentText(text).length > 1);
});
test('Japanese unspaced text round-trips exactly', () => {
  const text = '今日はとても良い天気ですね。';
  assert.equal(fragmentText(text).join(''), text);
});
test('single unspaced word is still a puzzle', () => {
  const text = 'Палеонтология';
  assert.equal(fragmentText(text).join(''), text);
  assert(fragmentText(text).length > 1);
});
test('emoji is never corrupted by splitting', () => {
  const text = '👨‍👩‍👧‍👦🚀🔭🌍';
  assert.equal(fragmentText(text).join(''), text);
});
test('every shuffled puzzle has a unique stable identity', () => {
  for (let length = 2; length < 20; length++) {
    const ids = shuffledIds(length);
    assert.equal(new Set(ids).size, length);
    assert.notDeepEqual(ids, Array.from({ length }, (_, i) => i));
  }
});
test('correct positions match visible strings even for duplicate chunks', () => {
  const pieces = ['да', 'да', 'нет'];
  assert.equal(correctPositions(pieces, [1, 0, 2]), 3);
  assert.equal(correctPositions(pieces, [2, 0, 1]), 1);
});
test('new rounds shuffle every item and begin unsolved', () => {
  const round = makeRound('Одна фраза состоит из нескольких последовательных частей.');
  assert(round.parts.length >= 2);
  assert.equal(round.bank.length, round.parts.length);
  assert.deepEqual(round.answer, []);
  assert.equal(round.checked, false);
});
