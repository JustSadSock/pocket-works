import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../runtime/v4/16-02.txt', import.meta.url);

test('ecology consumes explicit coevolution modifiers with bounded costs', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const token of ['attackMultiplier', 'defenseMultiplier', 'parasiteCost', 'mutualismBenefit', 'dependencyCost', 'metabolicCost']) assert.match(source, new RegExp(token));
  assert.match(source, /clamp\(predator\.coevolution\?\.attackMultiplier/);
  assert.match(source, /survival = clamp\(/);
  assert.match(source, /recruitLambda = Math\.max\(\.64/);
});
