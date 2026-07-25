import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'app.config.json', 'package.json', 'vite.config.ts', 'tsconfig.json', 'assemble-source.mjs',
  'source/index.html', 'source/main.ts', 'source/runtime-generated.ts', 'source/core.ts', 'source/core.test.ts',
  'source/styles.css', 'source/sw.ts', 'public/icons/icon.svg', 'public/NOTICE',
  'public/licenses/RAY_OPTICS_APACHE-2.0.txt', 'NOTICE', 'licenses/RAY_OPTICS_APACHE-2.0.txt', 'README.md'
];
for (const file of required) assert.ok(existsSync(resolve(root, file)), `missing ${file}`);

const config = JSON.parse(readFileSync(resolve(root, 'app.config.json'), 'utf8'));
assert.equal(config.slug, 'prelom');
assert.equal(config.runtime, 'enhanced');
assert.equal(config.preset, 'vite');
assert.equal(config.storageNamespace, 'pocket-works:prelom');
assert.match(config.cacheName, /^prelom-/);

const html = readFileSync(resolve(root, 'source/index.html'), 'utf8');
for (const id of ['labCanvas', 'catalogSheet', 'inspectorSheet', 'librarySheet', 'tutorial', 'importInput']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing UI contract ${id}`);
}
for (const token of ['viewport-fit=cover', 'data-app-shell', 'data-native-press', 'data-workshop-trigger']) assert.ok(html.includes(token), `missing source contract ${token}`);
assert.doesNotMatch(html, /iframe/i);

const entry = readFileSync(resolve(root, 'source/main.ts'), 'utf8');
for (const token of ['shared/mobile-runtime', 'installMobileRuntime', 'registerEnhancedUpdate', 'shared/workshop-mode', 'createWorkshopMode', "cachePrefix: 'prelom-'", "storageNamespace: 'pocket-works:prelom'"]) {
  assert.ok(entry.includes(token), `missing Pocket Works runtime contract ${token}`);
}

const runtime = readFileSync(resolve(root, 'source/runtime-generated.ts'), 'utf8');
for (const capability of ['source-white', 'medium-prism', 'mirror-parabolic', 'lens-thick', 'beam-splitter', 'grating', 'sensor']) assert.ok(runtime.includes(capability), `missing object capability ${capability}`);
for (const mode of ['rays', 'beam', 'image', 'intensity', 'spectrum', 'precision', 'trail']) assert.ok(runtime.includes(`'${mode}'`) || runtime.includes(`"${mode}"`), `missing mode ${mode}`);
assert.ok(runtime.includes('pointerdown') && runtime.includes('pointermove') && runtime.includes('pointerup'), 'pointer gestures missing');
assert.ok(runtime.includes('localStorage') && runtime.includes('JSON.stringify'), 'persistence missing');

const worker = readFileSync(resolve(root, 'source/sw.ts'), 'utf8');
for (const token of ['precacheAndRoute', 'cleanupOutdatedCaches', 'GET_UPDATE_INFO', 'SKIP_WAITING', "const APP_VERSION = '1.0.0'", "const RELEASE_DATE = '2026-07-25'", "const CACHE_NAME = 'prelom-v1.0.0'"]) assert.ok(worker.includes(token), `missing update/offline contract ${token}`);

console.log('ПРЕЛОМ source smoke: OK');
