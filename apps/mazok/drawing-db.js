const DATABASE_VERSION = 2;
const DRAWING_STORE = 'drawings';
const VERSION_STORE = 'versions';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB request failed')), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('IndexedDB transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error || new Error('IndexedDB transaction failed')), { once: true });
  });
}

export async function openDrawingDatabase(namespace) {
  if (!('indexedDB' in globalThis)) throw new Error('IndexedDB is unavailable');

  const databaseName = `${namespace}:drawings`;
  const openRequest = indexedDB.open(databaseName, DATABASE_VERSION);

  openRequest.addEventListener('upgradeneeded', () => {
    const database = openRequest.result;
    if (!database.objectStoreNames.contains(DRAWING_STORE)) {
      const store = database.createObjectStore(DRAWING_STORE, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
    if (!database.objectStoreNames.contains(VERSION_STORE)) {
      const store = database.createObjectStore(VERSION_STORE, { keyPath: 'id' });
      store.createIndex('drawingId', 'drawingId');
      store.createIndex('createdAt', 'createdAt');
    }
  });

  const database = await new Promise((resolve, reject) => {
    openRequest.addEventListener('success', () => resolve(openRequest.result), { once: true });
    openRequest.addEventListener('error', () => reject(openRequest.error || new Error('Could not open the drawing database')), { once: true });
    openRequest.addEventListener('blocked', () => reject(new Error('Drawing database upgrade is blocked by another tab')), { once: true });
  });

  database.addEventListener('versionchange', () => database.close());

  return {
    async get(id) {
      const transaction = database.transaction(DRAWING_STORE, 'readonly');
      return requestResult(transaction.objectStore(DRAWING_STORE).get(id));
    },

    async getAll() {
      const transaction = database.transaction(DRAWING_STORE, 'readonly');
      return requestResult(transaction.objectStore(DRAWING_STORE).getAll());
    },

    async put(drawing) {
      const transaction = database.transaction(DRAWING_STORE, 'readwrite', { durability: 'relaxed' });
      transaction.objectStore(DRAWING_STORE).put(drawing);
      await transactionDone(transaction);
      return drawing.id;
    },

    async putVersion(version) {
      const transaction = database.transaction(VERSION_STORE, 'readwrite', { durability: 'relaxed' });
      transaction.objectStore(VERSION_STORE).put(version);
      await transactionDone(transaction);
      return version.id;
    },

    async getVersions(drawingId) {
      const transaction = database.transaction(VERSION_STORE, 'readonly');
      const index = transaction.objectStore(VERSION_STORE).index('drawingId');
      const versions = await requestResult(index.getAll(IDBKeyRange.only(drawingId)));
      return versions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    async pruneVersions(drawingId, maximum = 10) {
      const transaction = database.transaction(VERSION_STORE, 'readwrite');
      const store = transaction.objectStore(VERSION_STORE);
      const versions = await requestResult(store.index('drawingId').getAll(IDBKeyRange.only(drawingId)));
      versions
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(Math.max(1, Number(maximum) || 10))
        .forEach((version) => store.delete(version.id));
      await transactionDone(transaction);
    },

    async remove(id) {
      const transaction = database.transaction([DRAWING_STORE, VERSION_STORE], 'readwrite');
      transaction.objectStore(DRAWING_STORE).delete(id);
      const versionStore = transaction.objectStore(VERSION_STORE);
      const request = versionStore.index('drawingId').openKeyCursor(IDBKeyRange.only(id));
      request.addEventListener('success', () => {
        const cursor = request.result;
        if (!cursor) return;
        versionStore.delete(cursor.primaryKey);
        cursor.continue();
      });
      await transactionDone(transaction);
    },

    async clear() {
      const transaction = database.transaction([DRAWING_STORE, VERSION_STORE], 'readwrite');
      transaction.objectStore(DRAWING_STORE).clear();
      transaction.objectStore(VERSION_STORE).clear();
      await transactionDone(transaction);
    },

    close() {
      database.close();
    }
  };
}
