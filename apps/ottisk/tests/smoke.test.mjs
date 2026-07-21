import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');
const [configText, html, css, js, manifestText, sw, icon] = await Promise.all([
  read('app.config.json'), read('index.html'), read('styles.css'), read('app.js'),
  read('manifest.webmanifest'), read('sw.js'), read('icons/icon.svg')
]);
const config = JSON.parse(configText);
const manifest = JSON.parse(manifestText);
assert.equal(config.slug, 'ottisk');
assert.equal(config.runtime, 'quick');
assert.equal(config.cacheName, 'ottisk-v1.0.0');
assert.equal(manifest.id, '/apps/ottisk/');
assert.match(html, /id="press-canvas"/);
assert.match(html, /data-workshop-trigger/);
assert.match(css, /100dvh/);
assert.match(css, /prefers-reduced-motion/);
assert.match(js, /const PRINTS = 8/);
assert.match(js, /localStorage/);
assert.match(sw, /CACHE_PREFIX = 'ottisk-'/);
assert.match(icon, /mix-blend-mode:multiply/);
console.log('ОТТИСК smoke contract: ok');
