import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../shared/release-guard.js', import.meta.url), 'utf8');
const nextTick = () => new Promise(resolve => setImmediate(resolve));

function boot({ storage = new Map(), latest = { version: '1.0.0', fingerprint: 'current' },
                version = '1.0.0', fingerprint = 'current', controller = null } = {}) {
  const listeners = new Map();
  const timers = [];
  const navigations = [];
  const worker = {
    controller,
    addEventListener(type, callback) { listeners.set('worker:' + type, callback); },
    async getRegistration() { return {}; },
    async getRegistrations() { return []; }
  };
  const context = {
    URL, URLSearchParams, console, Promise, Date,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    navigator: { serviceWorker: worker },
    location: {
      href: `https://example.test/apps/sample/?pw_release=${version}&pw_fp=${fingerprint}`,
      pathname: '/apps/sample/',
      search: `?pw_release=${version}&pw_fp=${fingerprint}`,
      replace: target => navigations.push(target)
    },
    history: { replaceState() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    document: {
      currentScript: { dataset: { pwRelease: version, pwFingerprint: fingerprint, pwSlug: 'sample' } },
      documentElement: { dataset: {} },
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: { append() {} },
      addEventListener() {},
      visibilityState: 'visible'
    },
    fetch: async () => ({ ok: true, json: async () => latest }),
    addEventListener(type, callback) {
      listeners.set('window:' + type, callback);
    },
    dispatchEvent() {},
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    setInterval() {},
    clearTimeout() {}
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {
    navigations,
    storage,
    focus() { listeners.get('window:focus')?.(); },
    claim(next) {
      worker.controller = next;
      listeners.get('worker:controllerchange')?.();
    },
    async newEntry() {
      for (const timer of timers.filter(timer => timer.delay === 0)) timer.callback();
      await nextTick();
      await nextTick();
    }
  };
}

const storage = new Map();
const current = { scriptURL: 'https://example.test/apps/sample/sw.js' };
const playing = boot({
  storage, controller: current,
  latest: { version: '2.0.0', fingerprint: 'next' }
});
playing.focus();
await nextTick();
await nextTick();
assert.equal(playing.navigations.length, 0, 'new release must not reload a live game');
assert.equal(JSON.parse(storage.get('pocket-works:pending-release:sample')).version, '2.0.0',
  'new release should be stored for next entry');
playing.claim({ ...current });
await nextTick();
assert.equal(playing.navigations.length, 0, 'controller replacement must not reload active rooms');

const reopened = boot({ storage, controller: current });
await reopened.newEntry();
assert.equal(reopened.navigations.length, 1, 'next document entry applies the deferred release');
assert.match(reopened.navigations[0], /pw_release=2\.0\.0/);

const updated = boot({ storage, version: '2.0.0', fingerprint: 'next' });
await updated.newEntry();
assert.equal(updated.navigations.length, 0, 'new release must not create a reload loop');
assert.equal(storage.has('pocket-works:pending-release:sample'), false,
  'pending record is cleared after the new version starts');

const fresh = boot();
fresh.claim(current);
await nextTick();
assert.equal(fresh.navigations.length, 0, 'first worker claim must not interrupt a new game');
console.log('Live games retain their page and controller changes; deferred releases apply at next entry.');
