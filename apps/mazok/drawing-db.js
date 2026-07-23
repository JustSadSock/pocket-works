const DATABASE_VERSION = 1;
const DRAWING_STORE = 'drawings';

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

    async remove(id) {
      const transaction = database.transaction(DRAWING_STORE, 'readwrite');
      transaction.objectStore(DRAWING_STORE).delete(id);
      await transactionDone(transaction);
    },

    async clear() {
      const transaction = database.transaction(DRAWING_STORE, 'readwrite');
      transaction.objectStore(DRAWING_STORE).clear();
      await transactionDone(transaction);
    },

    close() {
      database.close();
    }
  };
}
