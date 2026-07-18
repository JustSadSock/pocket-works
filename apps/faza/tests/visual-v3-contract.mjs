import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const app = read('app.js');
const visual = read('visual-v3.js');
const css = read('visual-v3.css');
const sw = read('sw.js');
const config = JSON.parse(read('app.config.json'));

assert.match(app, /visual-v3\.js/);
assert.match(visual, /position-radar/);
assert.match(visual, /capture-track/);
assert.match(visual, /data-concept-phase/);
assert.match(visual, /phase-compass/);
assert.doesNotMatch(visual, /observe\(document\.body/);
assert.match(css, /data-closed-axis/);
assert.match(css, /stone\.is-threat/);
assert.match(css, /prefers-reduced-motion/);
assert.match(sw, /visual-v3\.css/);
assert.match(sw, /visual-v3\.js/);
assert.equal(config.version, '1.3.0');
assert.equal(config.cacheName, 'faza-v1.3.0');

console.log(JSON.stringify({ status: 'ok', checks: 13, version: config.version }));
