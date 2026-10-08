import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the production module with a browser-like storage and fetch surface.
const source = await readFile(new URL('../shared/launcher-registry.js', import.meta.url), 'utf8');
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value))
};

const { loadRegistry, getRegistrySnapshot, subscribeRegistry, setRegistrySnapshot } =
  await import(`data:text/javascript,${encodeURIComponent(source)}`);

const original = [
  { slug: 'alpha', name: 'Alpha', path: './apps/alpha/', version: '1.0', fingerprint: 'a' },
  { slug: 'beta', name: 'Beta', path: './apps/beta/', version: '1.0', fingerprint: 'b' }
];
let calls = 0;
let releaseFetch;
globalThis.fetch = async () => {
  calls++;
  return await new Promise(resolve => { releaseFetch = resolve; });
};

const first = loadRegistry();
const second = loadRegistry();
const third = loadRegistry();
assert.equal(calls, 1, 'simultaneous consumers share one registry request');
releaseFetch({ ok: true, json: async () => original });
const snapshots = await Promise.all([first, second, third]);
assert.equal(snapshots[0].apps.length, 2);
assert.equal(snapshots[0], snapshots[1], 'consumers receive the same snapshot');
assert.equal(snapshots[1], snapshots[2]);
assert.ok(storage.has('pocket-works:registry:v1'), 'registry persists for offline use');

let events = 0;
const unsubscribe = subscribeRegistry(() => { events++; }, { immediate: true });
assert.equal(events, 1, 'late subscribers receive the loaded registry');
await loadRegistry();
assert.equal(calls, 1, 'recent registry snapshot avoids a second request');
setRegistrySnapshot([...original]);
assert.equal(events, 1, 'equivalent snapshots do not cause unnecessary re-renders');

const updated = [{ ...original[0], version: '2.0' }, original[1]];
setRegistrySnapshot(updated, { source: 'bulk-update' });
assert.equal(events, 2, 'subscribers see a real change');
assert.equal(getRegistrySnapshot().source, 'bulk-update');
unsubscribe();

// An older request must not overwrite a newer version handed off by Sync.
const pending = loadRegistry({ force: true });
assert.equal(calls, 2);
setRegistrySnapshot([{ ...original[0], version: '3.0' }, original[1]]);
releaseFetch({ ok: true, json: async () => updated });
await pending;
assert.equal(getRegistrySnapshot().apps[0].version, '3.0', 'in-flight response cannot regress a live registry');

globalThis.fetch = async () => { throw new Error('offline'); };
await assert.rejects(loadRegistry({ force: true }), /offline/);
assert.equal(getRegistrySnapshot().apps[0].version, '3.0', 'a network failure retains the cached registry');

console.log('Shared launcher registry deduplication, subscriptions and race checks passed.');
