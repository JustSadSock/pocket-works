import { chooseSnapshot, cloneValue, makeSnapshotRecord } from './storage-core.js';

const DB_NAME = 'pocket-works-clada';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const PRIMARY_SLOT = 'primary';
const BACKUP_SLOT = 'backup';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'slot' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
  });
}

async function readSlots(database) {
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const done = transactionDone(transaction);
  const [primary, backup] = await Promise.all([
    requestResult(store.get(PRIMARY_SLOT)),
    requestResult(store.get(BACKUP_SLOT))
  ]);
  await done;
  return { primary, backup };
}

function writeSnapshot(database, record) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const currentRequest = store.get(PRIMARY_SLOT);
    currentRequest.onsuccess = () => {
      const current = currentRequest.result;
      if (current) store.put({ ...current, slot: BACKUP_SLOT });
      store.put({ ...record, slot: PRIMARY_SLOT });
    };
    currentRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || currentRequest.error || new Error('Snapshot transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('Snapshot transaction failed'));
  });
}

async function clearSnapshots(database) {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).clear();
  await done;
}

export class CladaStorageBridge {
  constructor({ legacyKey = 'pocket-works:clada:state-v1', writeDelay = 90 } = {}) {
    this.legacyKey = legacyKey;
    this.writeDelay = writeDelay;
    this.database = null;
    this.cachedWorld = null;
    this.revision = 0;
    this.pendingRecord = null;
    this.writeTimer = 0;
    this.writeChain = Promise.resolve();
    this.backend = 'memory';
    this.recoveredFromBackup = false;
    this.lastError = null;
    this.bootstrapInstalled = false;
  }

  async ready() {
    try {
      this.database = await openDatabase();
      this.backend = 'indexeddb';
      const { primary, backup } = await readSlots(this.database);
      const chosen = chooseSnapshot(primary, backup);
      if (chosen) {
        this.cachedWorld = chosen.payload;
        this.revision = chosen.record.revision || 0;
        this.recoveredFromBackup = chosen.backup;
      } else {
        await this.migrateLegacyWorld();
      }
    } catch (error) {
      this.lastError = error;
      this.backend = 'localstorage-fallback';
      this.cachedWorld = this.readLegacyWorld();
    }
    this.installBootstrapCache();
    this.bindLifecycle();
    return this;
  }

  readLegacyWorld() {
    try {
      const payload = JSON.parse(localStorage.getItem(this.legacyKey) || 'null');
      return payload && typeof payload === 'object' ? payload : null;
    } catch {
      return null;
    }
  }

  async migrateLegacyWorld() {
    const legacy = this.readLegacyWorld();
    if (!legacy) return false;
    const record = makeSnapshotRecord(legacy, 1);
    await writeSnapshot(this.database, record);
    this.cachedWorld = legacy;
    this.revision = 1;
    try { localStorage.removeItem(this.legacyKey); } catch { /* restricted storage */ }
    return true;
  }

  installBootstrapCache() {
    if (!this.cachedWorld) return;
    try {
      localStorage.setItem(this.legacyKey, JSON.stringify(this.cachedWorld));
      this.bootstrapInstalled = true;
    } catch { /* runtime will start a new world if storage is fully unavailable */ }
  }

  releaseBootstrapCache() {
    if (!this.bootstrapInstalled || this.backend !== 'indexeddb') return;
    try { localStorage.removeItem(this.legacyKey); } catch { /* restricted storage */ }
    this.bootstrapInstalled = false;
  }

  readCachedWorld() {
    return cloneValue(this.cachedWorld);
  }

  scheduleWorld(world) {
    const record = makeSnapshotRecord(world, this.revision + 1);
    this.cachedWorld = JSON.parse(record.json);
    this.revision = record.revision;
    this.pendingRecord = record;
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush().catch(() => {}), this.writeDelay);
    return record.revision;
  }

  async flush() {
    clearTimeout(this.writeTimer);
    this.writeTimer = 0;
    const record = this.pendingRecord;
    this.pendingRecord = null;
    if (!record) return this.writeChain;

    if (!this.database) {
      try {
        localStorage.setItem(this.legacyKey, record.json);
        this.backend = 'localstorage-fallback';
      } catch (error) {
        this.lastError = error;
      }
      return;
    }

    this.writeChain = this.writeChain.then(async () => {
      try {
        await writeSnapshot(this.database, record);
        this.releaseBootstrapCache();
      } catch (error) {
        this.lastError = error;
        try {
          localStorage.setItem(this.legacyKey, record.json);
          this.backend = 'localstorage-fallback';
        } catch { /* memory copy remains available for this session */ }
      }
    });
    return this.writeChain;
  }

  async removeWorld() {
    clearTimeout(this.writeTimer);
    this.pendingRecord = null;
    this.cachedWorld = null;
    this.revision = 0;
    try { localStorage.removeItem(this.legacyKey); } catch { /* restricted storage */ }
    if (this.database) await clearSnapshots(this.database);
  }

  diagnostics() {
    return {
      backend: this.backend,
      revision: this.revision,
      pending: Boolean(this.pendingRecord),
      recoveredFromBackup: this.recoveredFromBackup,
      lastError: this.lastError ? String(this.lastError.message || this.lastError) : null
    };
  }

  bindLifecycle() {
    if (this.lifecycleBound || typeof addEventListener !== 'function') return;
    this.lifecycleBound = true;
    const flush = () => { this.flush().catch(() => {}); };
    addEventListener('pagehide', flush);
    globalThis.document?.addEventListener?.('visibilitychange', () => { if (globalThis.document.hidden) flush(); });
  }
}

export async function createCladaStorageBridge(options) {
  const bridge = new CladaStorageBridge(options);
  await bridge.ready();
  return bridge;
}

export async function deleteCladaDatabase() {
  if (!globalThis.indexedDB) return;
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
