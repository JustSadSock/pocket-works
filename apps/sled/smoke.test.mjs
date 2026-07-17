import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [index, app, css, worker, manifestText, configText] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./app.js', import.meta.url), 'utf8'),
  readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  readFile(new URL('./sw.js', import.meta.url), 'utf8'),
  readFile(new URL('./manifest.webmanifest', import.meta.url), 'utf8'),
  readFile(new URL('./app.config.json', import.meta.url), 'utf8')
]);

const config = JSON.parse(configText);
const manifest = JSON.parse(manifestText);
assert.equal(config.version, '2.0.0');
assert.equal(config.cacheName, 'sled-v2.0.0');
assert(index.includes('data-app-version="2.0.0"'));
assert(index.includes('./app.js?v=2.0.0'));
assert(index.includes('./styles.css?v=2.0.0'));
assert(worker.includes("const APP_VERSION = '2.0.0'"));
assert(worker.includes("const CACHE_NAME = 'sled-v2.0.0'"));
assert.deepEqual(config.changelog, Function(`${worker.match(/const RELEASE_NOTES = (\[[\s\S]*?\]);/)?.[1] ? `return ${worker.match(/const RELEASE_NOTES = (\[[\s\S]*?\]);/)?.[1]}` : 'return null'}`)());
assert.equal(manifest.name, config.name);
assert.equal(manifest.theme_color, config.themeColor);
assert(css.includes('.hex-cell'));
assert(css.includes('clip-path: polygon'));
assert(!index.includes('balance-patch.js'));
assert(!app.includes('pieRule'));

const ids = new Set([...index.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = [...app.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(referencedIds.filter((id) => !ids.has(id)))];
assert.deepEqual(missing, [], `missing DOM ids: ${missing.join(', ')}`);

const duplicateIds = [...ids].filter((id) => (index.match(new RegExp(`id="${id}"`, 'g')) || []).length > 1);
assert.deepEqual(duplicateIds, [], `duplicate DOM ids: ${duplicateIds.join(', ')}`);

for (const required of ['./index.html', './app.config.json', './styles.css', './app.js', './engine.mjs', './manifest.webmanifest', './icons/icon.svg']) {
  assert(worker.includes(`'${required}'`), `service worker shell misses ${required}`);
}

console.log('СЛЕД 2.0 smoke tests: ok');
