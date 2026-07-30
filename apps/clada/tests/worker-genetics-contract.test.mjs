import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../workers/simulation-worker.js', import.meta.url);

test('worker advances genetics around the same macroecology pipeline', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const call of [
    'genetics.ensureCommunity(community)',
    'genetics.prepareGeneration(community)',
    'genetics.finalizeGeneration(community)',
    'genetics.compactDiagnostic(community)'
  ]) assert.match(source, new RegExp(call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /runtime\/v5\/24-01\.txt/);
  assert.ok(source.indexOf('genetics.prepareGeneration(community)') < source.indexOf('meta.advance(community)'));
  assert.ok(source.indexOf('genetics.finalizeGeneration(community)') > source.indexOf('meta.advance(community)'));
});
