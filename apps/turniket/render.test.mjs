import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./app-v2.js', import.meta.url), 'utf8');

for (const literal of [
  'fill="${COLORS.board}"',
  'fill="${COLORS.tile}"',
  'fill="${targetColor}"',
  'fill="${fill}"',
  'stroke="${COLORS.gate}"',
  'fill="#ffffff"'
]) {
  assert.ok(source.includes(literal), `renderer must include literal SVG attribute template: ${literal}`);
}

assert.equal(source.includes('fill="var(--board)"'), false);
assert.equal(source.includes('fill="var(--tile)"'), false);
assert.equal(source.includes('stroke="var(--'), false);

console.log('TURNIKET literal SVG renderer regression test passed');
