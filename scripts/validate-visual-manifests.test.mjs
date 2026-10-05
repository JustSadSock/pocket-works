import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateVisualManifest } from './validate-visual-manifests.mjs';

const example = JSON.parse(await readFile(new URL('../docs/examples/visual.pw.json', import.meta.url)));
test('example art direction manifest is valid', () => {
  assert.deepEqual(validateVisualManifest(example), []);
});
test('rejects empty direction, invalid colors and inverted roughness', () => {
  const errors = validateVisualManifest({ ...example, direction: '', palette: ['red'], roughness: [0.9, 0.2] });
  assert.equal(errors.length, 3);
});
