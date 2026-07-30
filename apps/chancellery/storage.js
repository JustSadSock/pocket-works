const DB_NAME = 'pocket-works-chancellery';
const DB_VERSION = 1;
const STORE_NAME = 'campaigns';
const FALLBACK_KEY = 'pocket-works:chancellery:snapshots-v1';
const MAX_FALLBACK_ITEMS = 12;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        store.createIndex('importedAt', 'snapshot.metadata.importedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
}

function readFallback() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallback(records) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(records.slice(0, MAX_FALLBACK_ITEMS)));
    return true;
  } catch {
    return false;
  }
}

async function withStore(mode, callback) {
  const database = await openDatabase();
  if (!database) throw new Error('IndexedDB unavailable');
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = callback(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Storage transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'));
  }).finally(() => database.close());
}

export async function saveCampaign(snapshot, sourceFile = null) {
  const record = {
    hash: snapshot.hash,
    snapshot,
    source: sourceFile ? {
      name: sourceFile.name,
      type: sourceFile.type || 'application/octet-stream',
      size: sourceFile.size,
      lastModified: sourceFile.lastModified,
      blob: sourceFile
    } : null
  };

  try {
    await withStore('readwrite', (store) => store.put(record));
    return { persisted: 'indexeddb', rawFileStored: Boolean(sourceFile) };
  } catch (error) {
    if (sourceFile) {
      try {
        record.source = {
          name: sourceFile.name,
          type: sourceFile.type || 'application/octet-stream',
          size: sourceFile.size,
          lastModified: sourceFile.lastModified,
          blob: null
        };
        await withStore('readwrite', (store) => store.put(record));
        return { persisted: 'indexeddb', rawFileStored: false, warning: 'Исходный файл не поместился; паспорт кампании сохранён.' };
      } catch {
        // localStorage fallback below
      }
    }

    const fallback = readFallback().filter((item) => item.hash !== record.hash);
    fallback.unshift({ hash: record.hash, snapshot: record.snapshot, source: record.source && { ...record.source, blob: null } });
    if (!writeFallback(fallback)) throw error;
    return { persisted: 'localstorage', rawFileStored: false, warning: 'IndexedDB недоступна; сохранён только паспорт кампании.' };
  }
}

export async function getCampaign(hash) {
  try {
    const database = await openDatabase();
    if (database) {
      const value = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(hash);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      database.close();
      if (value) return value;
    }
  } catch {
    // fallback below
  }
  return readFallback().find((record) => record.hash === hash) || null;
}

export async function listCampaigns() {
  try {
    const database = await openDatabase();
    if (database) {
      const records = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      database.close();
      if (records.length) {
        return records.sort((a, b) => String(b.snapshot?.metadata?.importedAt || '').localeCompare(String(a.snapshot?.metadata?.importedAt || '')));
      }
    }
  } catch {
    // fallback below
  }
  return readFallback().sort((a, b) => String(b.snapshot?.metadata?.importedAt || '').localeCompare(String(a.snapshot?.metadata?.importedAt || '')));
}

export async function deleteCampaign(hash) {
  try {
    await withStore('readwrite', (store) => store.delete(hash));
  } catch {
    // still clear fallback
  }
  const fallback = readFallback().filter((record) => record.hash !== hash);
  writeFallback(fallback);
}

export async function clearCampaigns() {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // still clear fallback
  }
  writeFallback([]);
}
