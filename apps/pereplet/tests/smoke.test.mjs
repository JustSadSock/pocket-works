import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('required app files and UI controls exist', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const id of ['menuScreen','setupScreen','gameScreen','boardCanvas','swapModal','resultModal','labScreen']) assert.match(html, new RegExp(`id="${id}"`));
});

test('manifest and config identifiers are isolated', async () => {
  const config = JSON.parse(await readFile(new URL('app.config.json', root), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(config.slug, 'pereplet');
  assert.match(config.cacheName, /^pereplet-/);
  assert.equal(config.storageNamespace, 'pocket-works:pereplet');
  assert.equal(manifest.scope, './');
});

test('service worker only cleans its own cache prefix', async () => {
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  assert.match(sw, /CACHE_PREFIX = 'pereplet-'/);
  assert.match(sw, /keys\.filter\(\(key\) => key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME\)\.map\(\(key\) => caches\.delete\(key\)\)/);
});
