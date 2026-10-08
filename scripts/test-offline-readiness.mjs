import assert from 'node:assert/strict';
import { criticalEntrypointUrls, inspectOfflineReadiness } from '../shared/offline-readiness.js';

const origin = 'https://works.example/';
const alpha = { slug: 'alpha', path: './apps/alpha/', runtime: 'quick' };
const godot = { slug: 'godot-demo', path: './apps/godot-demo/', runtime: 'godot' };
const html = '<!doctype html><link rel="stylesheet" href="./styles.css?v=1"><script type="module" src="./app.js?pw=2"></script>';
assert.deepEqual(criticalEntrypointUrls(html, origin + 'apps/alpha/index.html'), [
  origin + 'apps/alpha/styles.css',
  origin + 'apps/alpha/app.js'
]);

const cacheEntries = new Map([
  [origin + 'apps/alpha/', html],
  [origin + 'apps/alpha/styles.css', 'body{}'],
  [origin + 'apps/alpha/app.js', 'console.log(1)'],
  [origin + 'apps/godot-demo/index.html', '<script data-pocketworks-wasm-chunks>const chunkUrls=["./index.wasm.part-000?x=1","./index.wasm.part-001?x=1"]</script><script src="./index.js"></script>'],
  [origin + 'apps/godot-demo/index.js', 'boot()'],
  [origin + 'apps/godot-demo/index.pck', 'binary'],
  [origin + 'apps/godot-demo/index.wasm.part-000', 'chunk'],
  [origin + 'apps/godot-demo/index.wasm.part-001', 'chunk']
]);
const cache = {
  async keys() { return [...cacheEntries.keys()].map(url => ({ url })); },
  async match(request) {
    const body = cacheEntries.get(request.url);
    return body === undefined ? undefined : { ok: true, text: async () => body };
  }
};
const cacheStorage = {
  async keys() { return ['workbox-precache-v2-unrelated-name']; },
  async open() { return cache; }
};
const serviceWorkers = {
  async getRegistrations() {
    return [alpha, godot].map(app => ({
      scope: new URL(app.path, origin).href,
      active: { state: 'activated' }
    }));
  }
};
const inspect = () => inspectOfflineReadiness([alpha, godot], { cacheStorage, serviceWorkers, base: origin });
let result = await inspect();
assert.equal(result.get('alpha').status, 'ready', 'workbox cache names are supported');
assert.equal(result.get('godot-demo').status, 'ready', 'all Godot bootstrap chunks are required');

cacheEntries.delete(origin + 'apps/alpha/styles.css');
cacheEntries.delete(origin + 'apps/godot-demo/index.wasm.part-001');
result = await inspect();
assert.equal(result.get('alpha').status, 'partial', 'a cached HTML alone does not imply offline readiness');
assert.equal(result.get('godot-demo').status, 'partial', 'a missing WASM part prevents Godot-ready state');

result = await inspectOfflineReadiness([alpha], {
  cacheStorage,
  serviceWorkers: { async getRegistrations() { return []; } },
  base: origin
});
assert.equal(result.get('alpha').status, 'uncached', 'an active app worker is required');
console.log('Offline entrypoint, Workbox caches, critical assets and Godot chunks passed.');
