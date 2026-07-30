import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../workers/simulation-worker.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const config = JSON.parse(await readFile(new URL('../app.config.json', import.meta.url), 'utf8'));
const workshop = await readFile(new URL('../workshop.js', import.meta.url), 'utf8');

test('app and worker load the same core before the trace UI', () => {
  assert.match(app, /life-trace\.css/);
  assert.match(app, /26-01\.txt/);
  assert.match(app, /27-01\.txt/);
  assert.ok(app.indexOf('26-01.txt') < app.indexOf('27-01.txt'));
  assert.match(worker, /26-01\.txt/);
});

test('release metadata and offline shell agree on 5.1.0', () => {
  assert.equal(config.version, '5.1.0');
  assert.equal(config.cacheName, 'clada-v5.1.0');
  assert.match(sw, /const CACHE_NAME = 'clada-v5\.1\.0'/);
  assert.match(sw, /const APP_VERSION = '5\.1\.0'/);
  assert.match(sw, /life-trace\.css/);
  assert.match(sw, /26-01\.txt/);
  assert.match(sw, /27-01\.txt/);
  assert.match(workshop, /version: '5\.1\.0'/);
});
