import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await Promise.all([1, 2].map(index => readFile(new URL(`../runtime/v5/27-${String(index).padStart(2, '0')}.txt`, import.meta.url), 'utf8')))).join('\n');

test('installs the trace renderer, top-level mode and journal tab', () => {
  for (const token of [
    'data-view="trace"',
    'function drawLifeTrace()',
    "state.view !== 'trace'",
    'data-field-panel="trace"',
    'СЛЕД ЖИЗНИ',
    'lifeTraceOpenCell',
    'speciesImpact',
    'compactDiagnostic'
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('world view receives restrained persistent trace marks', () => {
  assert.match(source, /lifeTraceDrawWorldMarks/);
  assert.match(source, /slice\(0, 18\)/);
  assert.match(source, /state\.fossilIndex !== null/);
});
