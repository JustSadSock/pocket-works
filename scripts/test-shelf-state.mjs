import assert from 'node:assert/strict';
import { createShelfStateStore, SHELF_EXPORT_SCHEMA } from '../shared/shelf-state.js';

function fakeDatabase() {
  const rows = new Map();
  return {
    rows,
    open() {
      const request = {};
      const database = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction(_name, mode) {
          const tx = {
            objectStore() {
              return {
                get(key) {
                  const req = {};
                  queueMicrotask(() => {
                    req.result = rows.get(key);
                    req.onsuccess?.();
                    queueMicrotask(() => tx.oncomplete?.());
                  });
                  return req;
                },
                put(record, key) {
                  const req = {};
                  queueMicrotask(() => {
                    rows.set(key, record);
                    req.onsuccess?.();
                    queueMicrotask(() => tx.oncomplete?.());
                  });
                  return req;
                }
              };
            }
          };
          return tx;
        }
      };
      queueMicrotask(() => { request.result = database; request.onsuccess?.(); });
      return request;
    }
  };
}

const data = new Map();
data.set('pocket-works:shelf:v1', JSON.stringify({
  favorites: ['arena-shift', 'arena-shift', 'rivet'],
  recents: { 'arena-shift': 1234 },
  filter: 'favorites', sort: 'recent', selected: 'rivet'
}));
let blocked = false;
const storage = {
  getItem(key) { return data.get(key) ?? null; },
  setItem(key, value) { if (blocked) throw new Error('QuotaExceededError'); data.set(key, String(value)); }
};
const indexed = fakeDatabase();
let observed = 0;
const one = createShelfStateStore({ storage, database: indexed, onState: () => observed++ });
assert.deepEqual(one.get().favorites, ['arena-shift','rivet'], 'legacy saved favorites migrated without duplication');
assert.equal(one.get().sort, 'recent');
await one.hydrate();
assert.equal(indexed.rows.get('personal-shelf').data.selected, 'rivet', 'first hydration backs up legacy shelf');

const saved = one.get();
saved.favorites.push('zastava');
await one.save(saved);
assert.equal(data.has('pocket-works:shelf:v2'), true);
assert.equal(indexed.rows.get('personal-shelf').data.favorites.length, 3);
const backup = one.exportBackup();
assert.equal(backup.schema, SHELF_EXPORT_SCHEMA);

blocked = true;
await one.save({ ...one.get(), favorites: ['arena-shift'] });
assert.equal(one.getStatus().localOk, false, 'quota failure detected');
assert.equal(one.getStatus().dbOk, true, 'IndexedDB backup remains durable when localStorage fails');
const newTab = createShelfStateStore({ storage, database: indexed });
await newTab.hydrate();
assert.deepEqual(newTab.get().favorites, ['arena-shift'], 'next session recovers newer IDB backup');

blocked = false;
await newTab.importBackup(backup);
assert.equal(newTab.get().favorites.length, 3);
await newTab.flush();
assert.equal(JSON.parse(data.get('pocket-works:shelf:v2')).data.favorites.length, 3);
await assert.rejects(newTab.importBackup({ schema: 'invalid' }), TypeError);
assert.equal(newTab.acceptCrossTabRecord({
  schema: SHELF_EXPORT_SCHEMA, savedAt: Date.now() + 100_000,
  data: { favorites: ['rivet'], sort: 'name' }
}), true);
assert.deepEqual(newTab.get().favorites, ['rivet']);
assert.equal(newTab.get().sort, 'name');
assert.ok(observed >= 2);
console.log('Shelf migration, redundant persistence, quota fallback, backup import/export and tab convergence passed.');
