import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../workers/simulation-worker.js', import.meta.url), 'utf8');

test('worker runs life trace around the same ecology pipeline', () => {
  for (const token of [
    '../runtime/v5/26-01.txt',
    'trace.ensureCommunity(community)',
    'trace.prepareGeneration(community)',
    'trace.finalizeGeneration(community)',
    'trace.compactDiagnostic(community)'
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(source.indexOf('planet.prepareGeneration(community)') < source.indexOf('trace.prepareGeneration(community)'));
  assert.ok(source.indexOf('trace.prepareGeneration(community)') < source.indexOf('planet.applyHabitatStress(community)'));
  assert.ok(source.indexOf('trace.prepareGeneration(community)') < source.indexOf('meta.advance(community)'));
  assert.ok(source.indexOf('trace.finalizeGeneration(community)') > source.indexOf('genetics.finalizeGeneration(community)'));
});
