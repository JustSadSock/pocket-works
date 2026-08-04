import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const [index, worker, configSource, manifestSource] = await Promise.all([
  read('./index.html'), read('./sw.js'), read('./app.config.json'), read('./manifest.webmanifest')
]);
const config = JSON.parse(configSource);
const manifest = JSON.parse(manifestSource);

test('release metadata stays coherent', () => {
  assert.match(index, new RegExp(`data-app-version="${config.version}"`));
  assert.match(worker, new RegExp(`const APP_VERSION = '${config.version}'`));
  assert.match(worker, new RegExp(`const CACHE_NAME = '${config.cacheName}'`));
  assert.equal(manifest.description, config.description);
});

test('third-patch runtime files are loaded and cached', () => {
  for (const file of ['./phase3.css', './phase3.js']) assert.ok(index.includes(file));
  for (const file of ['./phase3.css', './phase3.js', './phase3-core.js']) assert.ok(worker.includes(file));
});

test('release notes match app config exactly', () => {
  const match = worker.match(/const RELEASE_NOTES = (\[[\s\S]*?\]);/);
  assert.ok(match);
  const notes = Function(`"use strict";return(${match[1]})`)();
  assert.deepEqual(notes, config.changelog);
});
