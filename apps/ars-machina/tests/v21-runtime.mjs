import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const sw = read('sw.js');
const config = JSON.parse(read('app.config.json'));
const html = read('index.html');
const finalRuntime = read('engine/part-21e.txt');

const loadedParts = [...app.matchAll(/\.\/engine\/(part-[^']+\.txt)/g)].map((match) => match[1]);
const cachedParts = [...sw.matchAll(/\.\/engine\/(part-[^']+\.txt)/g)].map((match) => match[1]);
assert.deepEqual(cachedParts, loadedParts, 'loader and offline cache must contain the same ordered engine parts');
assert.equal(new Set(loadedParts).size, loadedParts.length, 'engine modules must not be loaded twice');
assert.ok(loadedParts.indexOf('part-21e.txt') < loadedParts.indexOf('part-22.txt'), '2.1 post-repair verification must run before later UX layers');
assert.match(app, /APP_VERSION = '2\.2\.0'/);
assert.match(sw, /APP_VERSION = '2\.2\.0'/);
assert.match(html, /data-app-version="2\.2\.0"/);
assert.equal(config.version, '2.2.0');
assert.equal(config.cacheName, 'ars-machina-v2.2.0-p1');
assert.match(finalRuntime, /enterFinalVerifiedRunV21/);
assert.match(finalRuntime, /dataset\.arsMachinaVersion = '2\.1\.0'/);
assert.match(finalRuntime, /updateFinalVisionUiV21/);

console.log(`ARS MACHINA 2.1 compatibility parity passed inside 2.2: ${loadedParts.length} engine modules`);
