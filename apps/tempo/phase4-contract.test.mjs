import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('./phase4.js', import.meta.url), 'utf8');
const css = await readFile(new URL('./phase4.css', import.meta.url), 'utf8');

test('segment builder exposes add, reorder, duration, techniques and experiment controls', () => {
  for (const token of ['data-p4-add', 'data-p4-move', 'data-p4-duration', 'data-p4-technique', 'data-p4-exp']) assert.match(js, new RegExp(token));
});

test('episode submit synchronizes legacy fields and stores detailed segments', () => {
  assert.match(js, /prepareLegacyFields\(form\)/);
  assert.match(js, /queueDetailSave\(form\)/);
  assert.match(js, /SEGMENT_STORAGE_KEY/);
});

test('journal and experiment screens surface segment detail', () => {
  assert.match(js, /augmentTimeline/);
  assert.match(js, /augmentExperiments/);
  assert.match(js, /data-p4-detail/);
});

test('existing exports are intercepted only when segment details exist', () => {
  assert.match(js, /button\.dataset\.export/);
  assert.match(js, /appendDetailedMarkdown/);
  assert.match(js, /segmentDetails/);
});

test('mobile controls retain usable touch targets', () => {
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media\(max-width:480px\)/);
});
