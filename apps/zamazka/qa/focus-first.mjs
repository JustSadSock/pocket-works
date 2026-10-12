import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const base = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, base), 'utf8');
const [app, css, html, sw, config] = await Promise.all([
  read('app.js'), read('gallery-motion.css'), read('index.html'),
  read('sw.js'), read('app.config.json').then(JSON.parse)
]);
const parsed = spawnSync(process.execPath, ['--check', new URL('app.js', base).pathname], {encoding:'utf8'});
assert.equal(parsed.status, 0, parsed.stderr);
assert.match(app, /phase-directive/);
assert.match(app, /waiting-players/);
assert.match(app, /id="readyCount"/);
assert.match(app, /id="readyList"/);
assert.match(app, /id="unveilRange"/);
assert.match(app, /data-action="submit"/);
assert.match(app, /data-action="vote"/);
assert.match(app, /data-action="copy-code"/);
assert.match(css, /\.screen:has\(> \.museum-home\)\{overflow:hidden\}/);
assert.match(css, /\.waiting-players\[open\]/);
assert.match(html, /data-app-version="1\.21\.0"/);
assert.match(sw, /const APP_VERSION = '1\.21\.0'/);
assert.equal(config.version, '1.21.0');
assert.equal(config.cacheName, 'zamazka-v1.21.0');
console.log('Zamazka focus-first contract: OK');
