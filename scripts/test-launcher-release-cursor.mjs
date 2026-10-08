import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Browser-free regression checks for the launcher release acknowledgement path.
// The actual launcher module is evaluated with deterministic storage and DOM fakes.
const source = (await readFile(new URL('../launcher-sync.js', import.meta.url), 'utf8'))
  .replace(/^import [^\n]+;\s*/, '');
const storage = new Map();
const indexed = new Map();
// Existing users may have a bad v1 cursor and a stale 30-release badge.
storage.set('pocket-works:release-cursor:v1', JSON.stringify({ apps: { 'test-app': 'stale' } }));
storage.set('pocket-works:last-release-digest:v1', JSON.stringify({
  kind: 'registry', notes: Array(30).fill('Already viewed release')
}));
let quotaExceeded = false;
let indexedUnavailable = false;
const soon = (callback) => Promise.resolve().then(callback);

function boot(initialApps) {
  let apps = initialApps;
  let surface = null;
  let button = null;
  const timers = [];

  const element = () => ({
    textContent: '', hidden: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    append() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}, remove() {}
  });
  const deck = {
    querySelector: (selector) => selector === '[data-whats-new]' ? button : null,
    prepend: (value) => { button = value; }
  };
  const document = {
    querySelector: (selector) => selector === '.deck-actions' ? deck
      : selector === '[data-launcher-release-digest]' ? surface : null,
    createElement(tag) {
      const node = element();
      if (tag === 'button') {
        const count = element();
        node.listeners = new Map();
        node.addEventListener = (type, callback) => node.listeners.set(type, callback);
        node.querySelector = () => count;
        node.remove = () => { button = null; };
      } else if (tag === 'aside') {
        surface = node;
        const children = new Map();
        node.querySelector = (selector) => {
          if (!children.has(selector)) children.set(selector, element());
          return children.get(selector);
        };
      }
      return node;
    },
    addEventListener() {},
    body: { append() {} }
  };
  const fakeIndexedDb = {
    open() {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        close() {},
        transaction() {
          const transaction = {};
          transaction.objectStore = () => ({
            get(key) {
              const request = {};
              void soon(() => {
                request.result = indexed.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            put(value, key) {
              indexed.set(key, JSON.parse(JSON.stringify(value)));
              void soon(() => transaction.oncomplete?.());
            }
          });
          return transaction;
        }
      };
      const opening = { result: db };
      void soon(() => indexedUnavailable ? opening.onerror?.() : opening.onsuccess?.());
      return opening;
    }
  };
  const window = {
    location: { href: 'https://test.invalid/' },
    indexedDB: fakeIndexedDb,
    addEventListener() {},
    dispatchEvent() {},
    setInterval() {},
    setTimeout(callback) { timers.push(callback); return timers.length; }
  };
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) {
      if (quotaExceeded) throw new Error('QuotaExceededError');
      storage.set(key, String(value));
    },
    removeItem(key) { storage.delete(key); }
  };
  const fetch = async () => ({ ok: true, json: async () => apps });
  const factory = new Function(
    'window', 'document', 'localStorage', 'navigator', 'fetch',
    'queueMicrotask', 'requestAnimationFrame', 'CustomEvent', 'setTimeout', 'clearTimeout',
    'requestRegistry', 'getRegistrySnapshot', 'BroadcastChannel',
    source + '\nreturn {checkRegistry, closeDigest, getActive: () => activeDigest, getCursor: () => releaseCursorMemory};'
  );
  const runtime = factory(
    window, document, localStorage, { onLine: true }, fetch,
    () => {}, () => {}, class CustomEvent {}, (callback) => {
      timers.push(callback); return timers.length;
    }, () => {},
    async () => ({ apps }),
    () => {
      const saved = storage.get('pocket-works:registry:v1');
      return saved ? JSON.parse(saved) : { apps: [] };
    },
    class FakeBroadcastChannel { addEventListener() {} postMessage() {} close() {} }
  );
  runtime.setApps = (value) => { apps = value; };
  runtime.getSurface = () => surface;
  runtime.getCount = () => button?.querySelector('[data-whats-new-count]').textContent;
  runtime.clickHistory = () => button?.listeners.get('click')?.();
  runtime.runTimers = async () => {
    const queued = timers.splice(0);
    for (const callback of queued) await callback();
  };
  return runtime;
}

const original = [{
  slug: 'test-app', name: 'Test app', version: '1.0',
  updatedAt: '2026-10-01T00:00:00Z', fingerprint: 'build-1', changelog: ['Old release']
}];
const next = [{ ...original[0], version: '1.1', fingerprint: 'build-2', changelog: ['New release'] }];

const first = boot(original);
await first.checkRegistry({ force: true });
assert.equal(first.getActive(), null, 'initial live registry is a silent baseline');
assert.ok(indexed.get('cursor')?.apps?.['test-app'], 'baseline persists in IndexedDB');
assert.ok(!first.getCount(), 'old unread badges are cleared by the v2 bootstrap');

first.setApps(next);
await first.checkRegistry({ force: true });
assert.equal(first.getActive()?.changeCount, 1, 'real release is announced');
assert.equal(first.getCount(), '1', 'badge shows actual unread count');

const active = first.getActive();
first.clickHistory();
assert.equal(first.getActive(), active, 'history cannot replace an unread digest');

quotaExceeded = true;
first.closeDigest(first.getSurface());
await first.runTimers();
assert.equal(first.getActive(), null, 'dismissal closes the overlay');
assert.equal(first.getCount(), '', 'dismissal clears unread count');
assert.equal(indexed.get('cursor')?.apps?.['test-app'], first.getCursor()['test-app'],
  'acknowledgement survives localStorage quota exhaustion');

const reopened = boot(next);
await reopened.checkRegistry({ force: true });
assert.equal(reopened.getActive(), null, 'reopening does not repeat acknowledged updates');
assert.ok(!reopened.getCount(), 'reopening does not show a stale badge');

// Return to writable localStorage: acknowledged history may remain browsable,
// but the badge must not reappear on the next launcher visit.
quotaExceeded = false;
const later = [{ ...next[0], version: '1.2', fingerprint: 'build-3' }];
reopened.setApps(later);
await reopened.checkRegistry({ force: true });
assert.equal(reopened.getActive()?.changeCount, 1, 'a later release is still detected');
reopened.closeDigest(reopened.getSurface());
await reopened.runTimers();
const again = boot(later);
await again.checkRegistry({ force: true });
assert.equal(again.getActive(), null, 'locally saved acknowledgement survives another visit');
assert.ok(!again.getCount(), 'saved release history never implies unread updates');

const metadataOnly = [{ ...later[0], updatedAt: '2026-10-10T00:00:00Z', changelog: ['Edited copy'] }];
const metadataCheck = boot(later);
await metadataCheck.checkRegistry({ force: true });
metadataCheck.setApps(metadataOnly);
await metadataCheck.checkRegistry({ force: true });
assert.equal(metadataCheck.getActive(), null, 'metadata-only churn is not an app release');


const secondOriginal = { slug: 'other', name: 'Other', version: '1.0', fingerprint: 'other-1' };
const twoApps = [later[0], secondOriginal];
const partial = boot(twoApps);
await partial.checkRegistry({ force: true });
assert.equal(partial.getActive()?.changeCount, 1, 'a newly added second app is unread');
partial.closeDigest(partial.getSurface());
await partial.runTimers();
const priorOtherToken = partial.getCursor()['other'];
// closeDigest starts a background check; let its microtasks settle before changing fixtures.
await new Promise(resolve => setImmediate(resolve));
partial.setApps([{ ...later[0], version: '1.3', fingerprint: 'build-4' }, secondOriginal]);
await partial.checkRegistry({ force: true });
assert.equal(partial.getActive()?.changeCount, 1, 'only the changed app is unread');
partial.closeDigest(partial.getSurface());
await partial.runTimers();
assert.ok(partial.getCursor()['test-app'], 'newly acknowledged app is preserved');
assert.equal(partial.getCursor()['other'], priorOtherToken, 'a partial digest preserves another app acknowledgement');

// Both localStorage and IndexedDB can fail in private mode or at quota.
const broken = boot([{ ...later[0], version: '1.3', fingerprint: 'build-4' }, secondOriginal]);
await broken.checkRegistry({ force: true });
const brokenLatest = [{ ...later[0], version: '1.4', fingerprint: 'build-5' }, secondOriginal];
broken.setApps(brokenLatest);
await broken.checkRegistry({ force: true });
assert.equal(broken.getActive()?.changeCount, 1);
quotaExceeded = true;
indexedUnavailable = true;
broken.closeDigest(broken.getSurface());
await broken.runTimers();
assert.equal(broken.getCount(), '1', 'failed persistence must retain an unread indicator');

quotaExceeded = false;
indexedUnavailable = false;
broken.clickHistory();
assert.equal(broken.getActive()?.kind, 'registry', 'failed acknowledgement can be retried');
broken.closeDigest(broken.getSurface());
await broken.runTimers();
assert.equal(broken.getCount(), '', 'retry clears the unread badge after storage recovers');

console.log('Launcher acknowledgement persistence regression checks passed.');
