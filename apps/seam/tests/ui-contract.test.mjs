import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (name) => readFile(path.join(root, name), 'utf8');

test('all runtime id selectors exist exactly once in index.html', async () => {
  const files = ['app.js', 'app-part-1.js', 'app-part-2a.js', 'app-part-2b.js', 'app-part-3a1.js', 'app-part-3a2.js', 'app-part-3b.js', 'app-part-4.js', 'app-part-5.js'];
  const [html, ...scripts] = await Promise.all([read('index.html'), ...files.map(read)]);
  const selectors = scripts.flatMap((script) => [...script.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]));
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
  for (const required of ['startScreen', 'gameScreen', 'boardCanvas', 'swapOffer', 'azureReserveButton', 'ochreReserveButton', 'menuSheet', 'rulesSheet', 'auditSheet', 'resultSheet']) {
    assert.ok(ids.includes(required));
  }
});

test('versions and cache identifiers agree across app metadata', async () => {
  const [html, script, configSource, manifestSource, worker] = await Promise.all([
    read('index.html'), read('app.js'), read('app.config.json'), read('manifest.webmanifest'), read('sw.js')
  ]);
  const config = JSON.parse(configSource);
  const manifest = JSON.parse(manifestSource);
  assert.equal(config.version, '2.2.0');
  assert.match(html, /data-app-version="2\.2\.0"/);
  assert.match(script, /const VERSION\s*=\s*'2\.2\.0'/);
  assert.match(worker, /const APP_VERSION\s*=\s*'2\.2\.0'/);
  assert.match(worker, new RegExp(`const CACHE_NAME\\s*=\\s*'${config.cacheName}'`));
  assert.equal(manifest.name, config.name);
  assert.equal(config.storageNamespace, 'pocket-works:seam');
});

test('service worker shell contains every app runtime and visual file', async () => {
  const worker = await read('sw.js');
  for (const file of ['index.html', 'styles.css', 'visual.css', 'motion.css', 'app.js', 'board-view.js', 'motion.js', 'engine.js', 'app.config.json', 'manifest.webmanifest', 'icons/icon.svg', 'BALANCE_AUDIT.md']) {
    assert.ok(worker.includes(`./${file}`), `${file} missing from shell`);
  }
});

test('visual layer preserves mobile constraints and tactical states', async () => {
  const [base, visual, board] = await Promise.all([read('styles.css'), read('visual.css'), read('board-view.js')]);
  assert.match(base, /safe-area-inset-top/);
  assert.match(base, /safe-area-inset-bottom/);
  assert.match(base, /touch-action: none/);
  assert.match(visual, /@media \(max-width: 420px\)/);
  assert.match(visual, /@media \(orientation: landscape\)/);
  assert.match(visual, /\.board-frame\.deploy-mode/);
  assert.match(board, /#selectionBand/);
  assert.match(board, /#moveHandles/);
  assert.match(board, /#lastMove/);
});
