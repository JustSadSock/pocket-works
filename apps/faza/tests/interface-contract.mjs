import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');

const app = read('app.js');
const ui = read('interface-v2.js');
const css = read('interface-v2.css');
const sw = read('sw.js');
const config = JSON.parse(read('app.config.json'));

assert.match(app, /interface-v2\.js/);
assert.match(ui, /turn-stepper/);
assert.match(ui, /concept-board/);
assert.match(css, /grid-template-areas:[^}]*stepper/);
assert.match(css, /\.board \.broken-link\{opacity:0/);
assert.match(css, /orientation:landscape/);
assert.match(sw, /interface-v2\.css/);
assert.match(sw, /interface-v2\.js/);
assert.equal(config.version, '1.2.0');
assert.equal(config.cacheName, 'faza-v1.2.0');

console.log(JSON.stringify({ status: 'ok', checks: 10, version: config.version }));
