// Durable launcher-only preferences. Existing v1 shelves are adopted without a reset.
// LocalStorage makes first paint synchronous; IndexedDB is a second independent copy.
const LEGACY_KEY = 'pocket-works:shelf:v1';
const KEY = 'pocket-works:shelf:v2';
const DB_NAME = 'pocket-works-shelf';
const STORE = 'records';
const RECORD_ID = 'personal-shelf';
const FILTERS = new Set(['all', 'favorites', 'recent', 'offline', 'experimental']);
const SORTS = new Set(['updated', 'recent', 'name']);
const MAX_RECENTS = 750;
export const SHELF_EXPORT_SCHEMA = 'pocket-works-personal-shelf-v2';

export function cleanShelfState(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const favorites = Array.isArray(raw.favorites)
    ? [...new Set(raw.favorites.filter(item => typeof item === 'string' && /^[a-z0-9-]+$/.test(item)))].slice(0, 1000) : [];
  const recents = raw.recents && typeof raw.recents === 'object' && !Array.isArray(raw.recents)
    ? Object.fromEntries(Object.entries(raw.recents)
        .filter(([slug, time]) => /^[a-z0-9-]+$/.test(slug) && Number.isFinite(time) && time >= 0)
        .sort((a,b) => b[1] - a[1]).slice(0, MAX_RECENTS)) : {};
  return {
    favorites, recents,
    filter: FILTERS.has(raw.filter) ? raw.filter : 'all',
    sort: SORTS.has(raw.sort) ? raw.sort : 'updated',
    selected: typeof raw.selected === 'string' ? raw.selected : null,
    query: ''
  };
}

export function createShelfStateStore(options = {}) {
  const { onState = () => {}, onStatus = () => {} } = options;
  let storage = options.storage;
  let database = options.database;
  // Safari private mode / sandboxed frames may throw when storage is accessed.
  if (!Object.hasOwn(options, 'storage')) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  if (!Object.hasOwn(options, 'database')) {
    try { database = globalThis.indexedDB; } catch { database = null; }
  }
  let savedAt = 0;
  let state = cleanShelfState({});
  let revision = 0;
  let writeQueue = Promise.resolve();
  let localOk = false;
  let dbOk = false;
  let warning = '';
  const report = () => onStatus({ localOk, dbOk, warning, savedAt });
  const readJson = key => { try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; } };
  let accountId = null;
  const validAccountId = id => typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  const accountKey = () => accountId ? KEY + ':account:' + accountId : KEY;
  const accountRecord = () => accountId ? RECORD_ID + ':account:' + accountId : RECORD_ID;

  function loadScope() {
    savedAt = 0;
    localOk = false;
    dbOk = false;
    warning = '';
    const loaded = readJson(accountKey());
    if (loaded?.schema === SHELF_EXPORT_SCHEMA) {
      state = cleanShelfState(loaded.data);
      savedAt = Number(loaded.savedAt) || 0;
      localOk = true;
    } else {
      // Legacy unscoped preferences belong to the guest, not to an
      // arbitrarily chosen Pocket ID. Export/import is the explicit transfer.
      state = cleanShelfState(accountId ? {} : readJson(LEGACY_KEY));
      try { localOk = Boolean(storage); } catch { /* private browsing */ }
    }
  }
  loadScope();

  function openDatabase() {
    if (!database?.open) return Promise.reject(new Error('IndexedDB unavailable'));
    return new Promise((resolve, reject) => {
      let request;
      try { request = database.open(DB_NAME, 1); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
  }
  async function indexed(mode, value, recordId = accountRecord()) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = mode === 'readonly'
          ? tx.objectStore(STORE).get(recordId)
          : tx.objectStore(STORE).put(value, recordId);
        let result;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      });
    } finally { db.close(); }
  }
  const envelope = () => ({
    schema: SHELF_EXPORT_SCHEMA, savedAt, data: cleanShelfState(state)
  });
  async function persistIdb(record, recordId = accountRecord()) {
    try {
      await indexed('readwrite', record, recordId);
      if (recordId === accountRecord()) {
        dbOk = true;
        warning = '';
        report();
      }
      return true;
    } catch (error) {
      if (recordId === accountRecord()) {
        dbOk = false;
        if (!localOk) warning = 'Personal shelf could not be saved. Export a backup before closing Pocket Works.';
        report();
      }
      return false;
    }
  }
  function save(next) {
    state = cleanShelfState(next);
    revision++;
    savedAt = Math.max(Date.now(), savedAt + 1);
    const record = envelope();
    try {
      storage?.setItem(accountKey(), JSON.stringify(record));
      localOk = true;
      warning = '';
    } catch {
      localOk = false;
      warning = 'Browser storage is full or blocked. Pocket Works is attempting a backup.';
    }
    onState({ ...state });
    report();
    const recordId = accountRecord();
    writeQueue = writeQueue.catch(() => false).then(() => persistIdb(record, recordId));
    return writeQueue;
  }
  async function hydrate() {
    const startRevision = revision;
    const recordId = accountRecord();
    try {
      const remote = await indexed('readonly', undefined, recordId);
      if (recordId !== accountRecord()) return get();
      dbOk = true;
      if (remote?.schema === SHELF_EXPORT_SCHEMA &&
          Number(remote.savedAt) > savedAt && revision === startRevision) {
        savedAt = Number(remote.savedAt);
        state = cleanShelfState(remote.data);
        onState({ ...state });
        try { storage?.setItem(accountKey(), JSON.stringify(envelope())); localOk = Boolean(storage); }
        catch { localOk = false; }
      } else if (!remote && revision === startRevision) {
        // Migrate an existing local v1 or v2 shelf into IndexedDB.
        writeQueue = writeQueue.then(() => persistIdb(envelope(), recordId));
        await writeQueue;
      }
    } catch {
      if (recordId !== accountRecord()) return get();
      dbOk = false;
      if (!localOk) warning = 'No persistent browser storage is available.';
    }
    if (recordId === accountRecord()) report();
    return get();
  }
  function setAccount(id = null) {
    if (id !== null && !validAccountId(id)) throw new TypeError('Invalid Pocket ID account');
    const normalized = id?.toLowerCase() || null;
    if (normalized === accountId) return Promise.resolve(get());
    accountId = normalized;
    revision++;
    loadScope();
    onState(get());
    report();
    return hydrate();
  }
  function get() {
    return { ...state, favorites: [...state.favorites], recents: { ...state.recents } };
  }
  function exportBackup() {
    return { schema: SHELF_EXPORT_SCHEMA, exportedAt: new Date().toISOString(), data: cleanShelfState(state) };
  }
  function importBackup(payload) {
    if (!payload || payload.schema !== SHELF_EXPORT_SCHEMA || !payload.data ||
        typeof payload.data !== 'object' || Array.isArray(payload.data))
      throw new TypeError('This is not a valid Pocket Works personal shelf backup');
    return save(payload.data);
  }
  function acceptCrossTabRecord(record) {
    if (record?.schema !== SHELF_EXPORT_SCHEMA || !Number.isFinite(record.savedAt) ||
        record.savedAt <= savedAt) return false;
    savedAt = record.savedAt;
    state = cleanShelfState(record.data);
    revision++;
    onState({ ...state });
    return true;
  }
  return {
    get, save, hydrate, setAccount,
    getStorageKey: accountKey, flush: () => writeQueue,
    exportBackup, importBackup, acceptCrossTabRecord,
    getStatus: () => ({ localOk, dbOk, warning, savedAt })
  };
}
