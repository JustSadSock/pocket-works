import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [index, loader, loaderCss, worker, manifestText, configText] = await Promise.all([
  read('./index.html'), read('./app.js'), read('./styles.css'), read('./sw.js'), read('./manifest.webmanifest'), read('./app.config.json')
]);
const appPayload = (await Promise.all([0,1,2,3].map((i) => read(`./bundle/app-${i}.txt`)))).join('');
const cssPayload = (await Promise.all([0,1,2].map((i) => read(`./bundle/css-${i}.txt`)))).join('');
const app = gunzipSync(Buffer.from(appPayload, 'base64')).toString('utf8');
const css = gunzipSync(Buffer.from(cssPayload, 'base64')).toString('utf8');
const config = JSON.parse(configText);
const manifest = JSON.parse(manifestText);
const pointy = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';

assert.equal(config.version, '2.0.1');
assert.equal(config.cacheName, 'sled-v2.0.1');
assert(index.includes('data-app-version="2.0.1"'));
assert(index.includes('./app.js?v=2.0.1'));
assert(index.includes('./styles.css?v=2.0.1'));
assert(worker.includes("const APP_VERSION = '2.0.1'"));
assert(worker.includes("const CACHE_NAME = 'sled-v2.0.1'"));
assert.deepEqual(config.changelog, Function(`${worker.match(/const RELEASE_NOTES = (\[[\s\S]*?\]);/)?.[1] ? `return ${worker.match(/const RELEASE_NOTES = (\[[\s\S]*?\]);/)?.[1]}` : 'return null'}`)());
assert.equal(manifest.name, config.name);
assert.equal(manifest.theme_color, config.themeColor);
assert(loader.includes("DecompressionStream('gzip')"));
assert(loader.includes("const APP_VERSION='2.0.0'"));
assert(loader.includes("const APP_VERSION='2.0.1'"));
assert(loaderCss.includes(`${pointy}!important`));
assert(css.includes('.hex-cell'));
assert(css.includes('clip-path:polygon') || css.includes('clip-path: polygon'));
assert(!index.includes('balance-patch.js'));
assert(!app.includes('pieRule'));
const ids = new Set([...index.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = [...app.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(referencedIds.filter((id) => !ids.has(id)))];
assert.deepEqual(missing, [], `missing DOM ids: ${missing.join(', ')}`);
for (const required of ['./index.html','./app.config.json','./styles.css','./app.js','./engine.mjs','./manifest.webmanifest','./icons/icon.svg', ...[0,1,2,3].map(i=>`./bundle/app-${i}.txt`), ...[0,1,2].map(i=>`./bundle/css-${i}.txt`)]) assert(worker.includes(`'${required}'`), `service worker shell misses ${required}`);
console.log('СЛЕД 2.0.1 smoke tests: ok');
