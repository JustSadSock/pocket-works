import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [index, loader, worker, manifestText, configText, engine] = await Promise.all([
  read('./index.html'),
  read('./app.js'),
  read('./sw.js'),
  read('./manifest.webmanifest'),
  read('./app.config.json'),
  read('./engine.mjs')
]);
const appPayload = (await Promise.all([0, 1, 2, 3].map((index) => read(`./bundle/app-${index}.txt`)))).join('');
const cssPayload = (await Promise.all([0, 1, 2].map((index) => read(`./bundle/css-${index}.txt`)))).join('');
const app = gunzipSync(Buffer.from(appPayload, 'base64')).toString('utf8');
const css = gunzipSync(Buffer.from(cssPayload, 'base64')).toString('utf8');
const config = JSON.parse(configText);
const manifest = JSON.parse(manifestText);

assert.equal(config.version, '3.0.0');
assert.equal(config.cacheName, 'sled-v3.0.0');
assert(index.includes('data-app-version="3.0.0"'));
assert(index.includes('./app.js?v=3.0.0'));
assert(index.includes('./styles.css?v=3.0.0'));
assert(worker.includes("const APP_VERSION = '3.0.0'"));
assert(worker.includes("const CACHE_NAME = 'sled-v3.0.0'"));
assert.deepEqual(config.changelog, Function(`return ${worker.match(/const RELEASE_NOTES = (\[[\s\S]*?\]);/)?.[1]}`)());
assert.equal(manifest.name, config.name);
assert.equal(manifest.theme_color, config.themeColor);
assert(loader.includes("DecompressionStream('gzip')"));
assert(app.includes("const APP_VERSION='3.0.0'"));
assert(app.includes('previewMove'));
assert(app.includes("marker.className='move-value'"));
assert(app.includes("preview?.ended?'РАЗРЕЗ'"));
assert(engine.includes("state.reason = 'split'"));
assert(engine.includes("state.reason = 'trap'"));
assert(engine.includes('function resolveCut'));
assert(css.includes('.hex-cell.is-finisher'));
assert(css.includes('@keyframes territory-collapse'));
assert(css.includes('polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)'));

const ids = new Set([...index.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = [...app.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(referencedIds.filter((id) => !ids.has(id)))];
assert.deepEqual(missing, [], `missing DOM ids: ${missing.join(', ')}`);
for (const required of ['./index.html','./app.config.json','./styles.css','./app.js','./engine.mjs','./manifest.webmanifest','./icons/icon.svg', ...[0,1,2,3].map(i=>`./bundle/app-${i}.txt`), ...[0,1,2].map(i=>`./bundle/css-${i}.txt`)]) {
  assert(worker.includes(`'${required}'`), `service worker shell misses ${required}`);
}

console.log('СЛЕД 3.0 smoke tests: ok');
