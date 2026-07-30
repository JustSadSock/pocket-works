import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../workers/simulation-worker.js', import.meta.url);

test('worker keeps the living-planet advance pipeline', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const call of [
    'planet.ensurePlanet(community)',
    'planet.prepareGeneration(community)',
    'planet.applyHabitatStress(community)',
    'planet.adjustIsolation(community)',
    'planet.seedCorridorColonization(community)',
    'planet.decorateProposals(community',
    'planet.extraProposals(community)'
  ]) assert.match(source, new RegExp(call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /runtime\/v4\/20-01\.txt/);
});
