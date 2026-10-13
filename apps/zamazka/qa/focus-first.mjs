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
assert.match(html, new RegExp('data-app-version="'+config.version.replaceAll('.', '\\.')+'"'));
assert.match(sw, new RegExp("const APP_VERSION = '"+config.version.replaceAll('.', '\\.')+"'"));
assert.equal(config.cacheName, 'zamazka-v'+config.version);
console.log('Zamazka focus-first contract: OK');
