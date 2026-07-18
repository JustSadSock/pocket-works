import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('all game DOM bindings exist exactly once', () => {
  const html = read('index.html');
  const game = read('game.js');
  const bindings = game.slice(0, game.indexOf('defaultPrefs='));
  const ids = [...bindings.matchAll(/["']#([A-Za-z][A-Za-z0-9_-]*)["']/g)].map((match) => match[1]);
  assert.ok(ids.length >= 30);
  for (const id of ids) {
    const count = (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
    assert.equal(count, 1, `Expected one #${id}, found ${count}`);
  }
});

test('menu, pause and result each expose a text route to Pocket Works', () => {
  const html = read('index.html');
  const exits = [...html.matchAll(/<a[^>]+href="\.\.\/\.\.\/"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => match[1].replace(/<[^>]+>/g, '').trim());
  assert.ok(exits.filter((label) => label.includes('POCKET WORKS')).length >= 3);
  assert.ok(html.includes('id="pauseDialog"'));
  assert.ok(html.includes('id="resultOverlay"'));
});

test('service worker shell contains every local runtime asset', () => {
  const sw = read('sw.js');
  const localEntries = [...sw.matchAll(/'\.\/([^']+)'/g)].map((match) => match[1]);
  for (const entry of localEntries) {
    if (entry === '') continue;
    assert.ok(fs.existsSync(path.join(ROOT, entry)), `Missing cached asset ${entry}`);
  }
});

test('manifest, app config and service worker release identity match', () => {
  const config = JSON.parse(read('app.config.json'));
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const sw = read('sw.js');
  assert.equal(config.slug, 'kordon');
  assert.equal(config.runtime, 'quick');
  assert.equal(config.version, '1.1.0');
  assert.equal(config.cacheName, 'kordon-v1.1.0');
  assert.equal(config.storageNamespace, 'pocket-works:kordon');
  assert.equal(manifest.id, '/apps/kordon/');
  assert.ok(sw.includes("const CACHE_NAME = 'kordon-v1.1.0'"));
  assert.ok(sw.includes("const APP_VERSION = '1.1.0'"));
});

test('finished UI avoids browser prompts and remote dependencies', () => {
  const source = ['index.html', 'game.js', 'app.js', 'styles.css'].map(read).join('\n');
  assert.doesNotMatch(source, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(read('index.html'), /https?:\/\//);
  assert.ok(read('index.html').includes('data-gesture-surface'));
  assert.ok((read('styles.css') + read('styles-board.css')).includes('prefers-reduced-motion'));
});
