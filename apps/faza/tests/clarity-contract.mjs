import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [index, app, controller, css, sw, configText] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('app.js', root), 'utf8'),
  readFile(new URL('app-v2.js', root), 'utf8'),
  readFile(new URL('clarity.css', root), 'utf8'),
  readFile(new URL('sw.js', root), 'utf8'),
  readFile(new URL('app.config.json', root), 'utf8')
]);
const config = JSON.parse(configText);

assert.match(app, /import '\.\/app-v2\.js';/);
assert.match(index, /data-app-version="1\.1\.0"/);
assert.match(index, /clarity\.css/);
assert.match(index, /Без ↔/);
assert.match(controller, /const AXES/);
assert.match(controller, /aiStage = 'cell'/);
assert.match(controller, /aiStage = 'phase'/);
assert.match(controller, /commitPreviewedMove/);
assert.match(controller, /Сначала разрываются выключенные связи/);
assert.match(css, /\.board \.broken-link/);
assert.match(css, /\.board \.liberty-dot/);
assert.match(sw, /'\.\/app-v2\.js'/);
assert.match(sw, /'\.\/clarity\.css'/);
assert.equal(config.version, '1.1.0');
assert.equal(config.cacheName, 'faza-v1.1.0');

console.log(JSON.stringify({ status: 'ok', version: config.version, clarityFiles: 2 }, null, 2));
