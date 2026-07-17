import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (name) => readFile(path.join(root, name), 'utf8');

test('all app.js id selectors exist exactly once in index.html', async () => {
  const [html, script] = await Promise.all([read('index.html'), read('app.js')]);
  const selectors = [...script.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]);
  assert.ok(selectors.length > 35);
  for (const id of new Set(selectors)) {
    const occurrences = [...html.matchAll(new RegExp(`id=["']${id}["']`, 'g'))].length;
    assert.equal(occurrences, 1, `#${id} must exist once`);
  }
});

test('HTML has no duplicate ids and keeps the complete primary flow', async () => {
  const html = await read('index.html');
  const ids = [...html.matchAll(/id=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['startScreen', 'gameScreen', 'boardCanvas', 'swapOffer', 'menuSheet', 'rulesSheet', 'auditSheet', 'resultSheet']) {
    assert.ok(ids.includes(required));
  }
});

test('versions and cache identifiers agree across app metadata', async () => {
  const [html, script, configSource, manifestSource, worker] = await Promise.all([
    read('index.html'), read('app.js'), read('app.config.json'), read('manifest.webmanifest'), read('sw.js')
  ]);
  const config = JSON.parse(configSource);
  const manifest = JSON.parse(manifestSource);
  assert.equal(config.version, '2.0.0');
  assert.match(html, /data-app-version="2\.0\.0"/);
  assert.match(script, /const VERSION = '2\.0\.0'/);
  assert.match(worker, /const APP_VERSION = '2\.0\.0'/);
  assert.match(worker, new RegExp(`const CACHE_NAME = '${config.cacheName}'`));
  assert.equal(manifest.name, config.name);
  assert.equal(config.storageNamespace, 'pocket-works:seam');
});

test('service worker shell contains every app runtime file', async () => {
  const worker = await read('sw.js');
  for (const file of ['index.html', 'styles.css', 'app.js', 'engine.js', 'app.config.json', 'manifest.webmanifest', 'icons/icon.svg', 'BALANCE_AUDIT.md']) {
    assert.ok(worker.includes(`./${file}`), `${file} missing from shell`);
  }
});

test('mobile CSS covers safe areas, compact height, tablet and reduced motion', async () => {
  const css = await read('styles.css');
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(max-height: 670px\)/);
  assert.match(css, /@media \(min-width: 620px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /touch-action: none/);
});
