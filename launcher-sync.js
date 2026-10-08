const SHELF_STORAGE_KEY = 'pocket-works:shelf:v1';
const REGISTRY_CACHE_KEY = 'pocket-works:registry:v1';
const RELEASE_CURSOR_KEY = 'pocket-works:release-cursor:v2';
const LEGACY_RELEASE_CURSOR_KEY = 'pocket-works:release-cursor:v1';
const CURSOR_DB_NAME = 'pocket-works-release-tracking';
const CURSOR_DB_STORE = 'state';
const LEGACY_REGISTRY_HISTORY_KEY = 'pocket-works:registry-history:v2';
const LEGACY_SEEN_DIGESTS_KEY = 'pocket-works:seen-release-digests:v1';
const LAST_DIGEST_KEY = 'pocket-works:last-release-digest:v1';
const MANAGED_RECEIPT_PREFIX = 'pocket-works:managed-update-receipt:v1:';
const MANAGED_SEEN_PREFIX = 'pocket-works:managed-update-seen:v1:';
const REGISTRY_CHECK_INTERVAL = 5 * 60 * 1000;
const REGISTRY_CHECK_COOLDOWN = 45 * 1000;

const deckActions = document.querySelector('.deck-actions');
const cachedRegistryAtBoot = readRegistryCache()?.apps || [];
const returningUser = storageHas(SHELF_STORAGE_KEY) || cachedRegistryAtBoot.length > 0;

let lastRegistryCheckAt = 0;
let registryCheckPromise = null;
let activeDigest = null;
let digestQueue = [];
let releaseCursorMemory = null;
let releaseCursorInitialized = false;
let cursorLoadPromise = null;
let cursorWritePromise = Promise.resolve();

function storageHas(key) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage cleanup is best-effort.
  }
}

function readRegistryCache() {
  const value = readJson(REGISTRY_CACHE_KEY);
  return value && Array.isArray(value.apps) ? value : null;
}

function normalizeRegistry(apps) {
  if (!Array.isArray(apps)) return [];
  return apps
    .filter((app) => app && typeof app === 'object' && app.status !== 'archived')
    .filter((app) => typeof app.slug === 'string' && typeof app.name === 'string')
    .map((app) => ({
      ...app,
      slug: app.slug,
      name: app.name,
      description: typeof app.description === 'string' ? app.description : '',
      version: typeof app.version === 'string' ? app.version : '',
      updatedAt: typeof app.updatedAt === 'string' ? app.updatedAt : '',
      changelog: Array.isArray(app.changelog) ? app.changelog.filter((note) => typeof note === 'string') : []
    }));
}

function registrySignature(app) {
  // The published fingerprint identifies the actual deployable app contents.
  // Rewriting the registry timestamp or notes is not an application update.
  if (typeof app.fingerprint === 'string' && app.fingerprint) {
    return [app.version, app.fingerprint].join('\u001f');
  }
  return [app.version, app.updatedAt, ...app.changelog].join('\u001f');
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function releaseToken(app) {
  return hashString(registrySignature(app));
}

function buildReleaseCursor(apps) {
  return Object.fromEntries(
    normalizeRegistry(apps).map((app) => [app.slug, releaseToken(app)])
  );
}

function normalizeReleaseCursor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([slug, token]) => typeof slug === 'string' && typeof token === 'string')
  );
}

// A compact localStorage copy is fast to read; IndexedDB is a durable fallback
// for iOS origins where dozens of apps have filled the shared localStorage quota.
function cursorDatabase(mode, record) {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) { resolve(mode === 'read' ? null : false); return; }
    let db = null;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { db?.close(); } catch { /* ignore */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish(mode === 'read' ? null : false), 2000);
    try {
      const opening = window.indexedDB.open(CURSOR_DB_NAME, 1);
      opening.onupgradeneeded = () => {
        if (!opening.result.objectStoreNames.contains(CURSOR_DB_STORE)) {
          opening.result.createObjectStore(CURSOR_DB_STORE);
        }
      };
      opening.onerror = () => finish(mode === 'read' ? null : false);
      opening.onblocked = () => finish(mode === 'read' ? null : false);
      opening.onsuccess = () => {
        db = opening.result;
        if (done) { db.close(); return; }
        try {
          const tx = db.transaction(CURSOR_DB_STORE, mode === 'read' ? 'readonly' : 'readwrite');
          const store = tx.objectStore(CURSOR_DB_STORE);
          if (mode === 'read') {
            const request = store.get('cursor');
            request.onsuccess = () => finish(request.result || null);
            request.onerror = () => finish(null);
          } else {
            store.put(record, 'cursor');
            tx.oncomplete = () => finish(true);
            tx.onerror = () => finish(false);
            tx.onabort = () => finish(false);
          }
        } catch {
          finish(mode === 'read' ? null : false);
        }
      };
    } catch {
      finish(mode === 'read' ? null : false);
    }
  });
}

async function loadReleaseCursor() {
  if (releaseCursorMemory !== null) return releaseCursorMemory;
  if (cursorLoadPromise) return cursorLoadPromise;
  cursorLoadPromise = (async () => {
    const local = readJson(RELEASE_CURSOR_KEY);
    const indexed = await cursorDatabase('read');
    const records = [local, indexed]
      .filter((record) => record && Object.keys(normalizeReleaseCursor(record.apps)).length > 0)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    releaseCursorInitialized = records.length > 0;
    releaseCursorMemory = releaseCursorInitialized ? normalizeReleaseCursor(records[0].apps) : {};

    // v1 contained an unreliable baseline and could replay dozens of already
    // acknowledged updates. Bootstrap v2 from the current LIVE registry once.
    removeStored(LEGACY_RELEASE_CURSOR_KEY);
    removeStored(LEGACY_REGISTRY_HISTORY_KEY);
    removeStored(LEGACY_SEEN_DIGESTS_KEY);
    if (!releaseCursorInitialized) removeStored(LAST_DIGEST_KEY);
    return releaseCursorMemory;
  })();
  try { return await cursorLoadPromise; }
  finally { cursorLoadPromise = null; }
}

function persistReleaseCursor(cursor) {
  const compact = normalizeReleaseCursor(cursor);
  // Advance immediately: an in-flight network check must not resurrect a
  // digest that the user has just dismissed.
  releaseCursorMemory = compact;
  releaseCursorInitialized = true;
  const record = { savedAt: Date.now(), apps: compact };

  cursorWritePromise = cursorWritePromise.catch(() => false).then(async () => {
    removeStored(LEGACY_RELEASE_CURSOR_KEY);
    removeStored(LEGACY_REGISTRY_HISTORY_KEY);
    removeStored(LEGACY_SEEN_DIGESTS_KEY);
    let storedLocally = writeJson(RELEASE_CURSOR_KEY, record);
    if (!storedLocally) {
      // History is expendable; the acknowledgement cursor is not.
      removeStored(LAST_DIGEST_KEY);
      storedLocally = writeJson(RELEASE_CURSOR_KEY, record);
    }
    const storedInDb = await cursorDatabase('write', record);
    if (!storedLocally && !storedInDb) {
      console.warn('Pocket Works cannot persist release acknowledgements; current session remains acknowledged');
    }
    return storedLocally || storedInDb;
  });
  return cursorWritePromise;
}

function registryFingerprint(apps) {
  return normalizeRegistry(apps)
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((app) => `${app.slug}:${releaseToken(app)}`)
    .join('\u001e');
}

function diffRegistry(cursor, nextApps) {
  const previous = normalizeReleaseCursor(cursor);
  const added = [];
  const updated = [];

  for (const app of normalizeRegistry(nextApps)) {
    const earlier = previous[app.slug];
    if (!earlier) added.push(app);
    else if (earlier !== releaseToken(app)) updated.push(app);
  }

  return { added, updated };
}

function createDigestSurface() {
  const surface = document.createElement('aside');
  surface.className = 'app-update-prompt launcher-release-digest';
  surface.dataset.launcherReleaseDigest = '';
  surface.dataset.ui = '';
  surface.setAttribute('role', 'status');
  surface.setAttribute('aria-live', 'polite');
  surface.innerHTML = `
    <div class="app-update-prompt__copy">
      <p class="app-update-prompt__eyebrow" data-digest-eyebrow>WHAT'S NEW</p>
      <strong class="app-update-prompt__title" data-digest-title></strong>
      <ul class="app-update-prompt__notes" data-digest-notes></ul>
    </div>
    <div class="app-update-prompt__actions">
      <button type="button" data-digest-close data-native-press>Got it</button>
    </div>
  `;

  surface.querySelector('[data-digest-close]').addEventListener('click', () => closeDigest(surface));
  document.body.append(surface);
  return surface;
}

function ensureWhatsNewButton() {
  if (!deckActions) return null;
  let button = deckActions.querySelector('[data-whats-new]');
  if (button) return button;

  button = document.createElement('button');
  button.type = 'button';
  button.dataset.whatsNew = '';
  button.dataset.nativePress = '';
  button.innerHTML = `What's new <span data-whats-new-count hidden></span>`;
  button.addEventListener('click', () => {
    // Do not replace an unacknowledged digest with a history-only copy:
    // the history intentionally has no release cursor to acknowledge.
    if (activeDigest) return;
    const digest = readJson(LAST_DIGEST_KEY);
    if (digest) enqueueDigest(digest, { remember: false, immediate: true });
  });
  deckActions.prepend(button);
  return button;
}

function updateWhatsNewButton(digest, { unread = false } = {}) {
  const button = digest
    ? ensureWhatsNewButton()
    : deckActions?.querySelector('[data-whats-new]');
  if (!button) return;
  if (!digest) { button.remove(); return; }
  const counter = button.querySelector('[data-whats-new-count]');
  const count = unread ? (digest?.changeCount || digest?.notes?.length || 0) : 0;
  counter.textContent = count ? String(count) : '';
  counter.hidden = count === 0;
  button.classList.toggle('has-release', count > 0);
}

function showDigest(digest) {
  activeDigest = digest;
  const surface = document.querySelector('[data-launcher-release-digest]') || createDigestSurface();
  surface.querySelector('[data-digest-eyebrow]').textContent = digest.eyebrow || "WHAT'S NEW";
  surface.querySelector('[data-digest-title]').textContent = digest.title || 'Pocket Works changed';

  const notes = surface.querySelector('[data-digest-notes]');
  notes.replaceChildren();
  for (const note of (Array.isArray(digest.notes) && digest.notes.length > 0 ? digest.notes : ['The live shelf was refreshed.']).slice(0, 5)) {
    const item = document.createElement('li');
    item.textContent = note;
    notes.append(item);
  }

  requestAnimationFrame(() => surface.classList.add('is-visible'));
}

function closeDigest(surface) {
  const closedDigest = activeDigest;
  const committed = closedDigest?.kind === 'registry' && closedDigest.releaseCursor
    ? persistReleaseCursor(closedDigest.releaseCursor)
    : Promise.resolve(true);

  surface.classList.remove('is-visible');
  activeDigest = null;
  updateWhatsNewButton(readJson(LAST_DIGEST_KEY), { unread: false });

  // A queued registry digest was computed against the unacknowledged cursor.
  digestQueue = digestQueue.filter((digest) => digest.kind !== 'registry');
  window.setTimeout(async () => {
    await committed;
    if (digestQueue.length > 0) showDigest(digestQueue.shift());
    void checkRegistry({ force: true });
  }, 180);
}

function enqueueDigest(digest, { remember = true, immediate = false } = {}) {
  if (!digest || !Array.isArray(digest.notes) || digest.notes.length === 0) return;
  if (remember) {
    // Keep a small readable history, not a second copy of the full cursor.
    const { releaseCursor, ...history } = digest;
    writeJson(LAST_DIGEST_KEY, history);
  }
  updateWhatsNewButton(digest, { unread: remember });

  if (activeDigest && !immediate) {
    if (!digestQueue.some((item) => item.id === digest.id)) digestQueue.push(digest);
    return;
  }

  if (activeDigest && immediate) {
    const surface = document.querySelector('[data-launcher-release-digest]');
    if (surface) surface.classList.remove('is-visible');
  }
  showDigest(digest);
}

function buildRegistryDigest(changes, nextApps) {
  const notes = [];
  for (const app of changes.added) {
    notes.push(`New application: ${app.name}${app.description ? ` — ${app.description}` : ''}`);
  }
  for (const app of changes.updated) {
    const releaseNote = app.changelog[0] || 'Release metadata changed.';
    notes.push(`${app.name}${app.version ? ` v${app.version}` : ''}: ${releaseNote}`);
  }

  const total = changes.added.length + changes.updated.length;
  if (total > 5) notes[4] = `And ${total - 4} more application changes.`;

  return {
    id: `registry:${hashString(registryFingerprint(nextApps))}`,
    kind: 'registry',
    changeCount: total,
    releaseCursor: buildReleaseCursor(nextApps),
    eyebrow: changes.added.length > 0 ? 'NEW ON THE SHELF' : 'APPLICATIONS UPDATED',
    title: changes.added.length > 0
      ? `${changes.added.length} new application${changes.added.length === 1 ? '' : 's'}`
      : `${changes.updated.length} application update${changes.updated.length === 1 ? '' : 's'}`,
    notes: notes.slice(0, 5),
    savedAt: Date.now()
  };
}

function publishRegistrySnapshot(apps) {
  window.dispatchEvent(new CustomEvent('pocketworks:registry-snapshot', {
    detail: { apps, source: 'release-check' }
  }));
}

async function fetchLiveRegistry() {
  const response = await fetch(`./apps.json?registry=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' }
  });
  if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
  const apps = await response.json();
  if (!Array.isArray(apps)) throw new TypeError('apps.json must contain an array');
  return normalizeRegistry(apps);
}

async function checkRegistry({ force = false } = {}) {
  if (!navigator.onLine) return false;
  if (registryCheckPromise) return registryCheckPromise;
  if (!force && Date.now() - lastRegistryCheckAt < REGISTRY_CHECK_COOLDOWN) return false;

  lastRegistryCheckAt = Date.now();
  registryCheckPromise = (async () => {
    try {
      await loadReleaseCursor();
      const nextApps = await fetchLiveRegistry();

      const visibleFingerprint = registryFingerprint(readRegistryCache()?.apps || []);
      const liveFingerprint = registryFingerprint(nextApps);
      if (visibleFingerprint !== liveFingerprint) publishRegistrySnapshot(nextApps);

      const nextCursor = buildReleaseCursor(nextApps);
      if (!releaseCursorInitialized) {
        // On first v2 run, do not label the entire existing library as new.
        // This also repairs users whose v1 acknowledgement was never saved.
        await persistReleaseCursor(nextCursor);
        updateWhatsNewButton(null, { unread: false });
        return true;
      }

      // Read the cursor AFTER the request, not before it: the user may have
      // dismissed an overlay while the network operation was in flight.
      const changes = diffRegistry(releaseCursorMemory, nextApps);
      if (changes.added.length || changes.updated.length) {
        enqueueDigest(buildRegistryDigest(changes, nextApps));
      }
      return true;
    } catch (error) {
      console.warn('Pocket Works live registry check failed', error);
      return false;
    } finally {
      registryCheckPromise = null;
    }
  })();

  return registryCheckPromise;
}

function managedStorageKey(prefix, serviceWorkerPath) {
  const pathname = new URL(serviceWorkerPath, window.location.href).pathname;
  return `${prefix}${encodeURIComponent(pathname)}`;
}

function workerInfo(worker, timeout = 1800) {
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeout);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data || null);
    };
    worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]);
  });
}

async function showCurrentShellRelease() {
  if (!('serviceWorker' in navigator) || !returningUser) return;

  const receiptKey = managedStorageKey(MANAGED_RECEIPT_PREFIX, './sw.js');
  const seenKey = managedStorageKey(MANAGED_SEEN_PREFIX, './sw.js');
  if (storageHas(receiptKey)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const info = await workerInfo(navigator.serviceWorker.controller || registration.active);
    if (!info?.version) return;

    let seenVersion = null;
    try { seenVersion = localStorage.getItem(seenKey); } catch { /* ignore */ }
    if (seenVersion === info.version) return;
    try { localStorage.setItem(seenKey, info.version); } catch { /* ignore */ }

    const releaseNotes = Array.isArray(info.releaseNotes) ? info.releaseNotes.filter((note) => typeof note === 'string') : [];
    enqueueDigest({
      id: `shell:${info.version}`,
      kind: 'shell',
      eyebrow: 'POCKET WORKS UPDATED',
      title: `Version ${info.version}`,
      notes: releaseNotes.length > 0 ? releaseNotes : ['The launcher shell was updated.'],
      savedAt: Date.now()
    });
  } catch (error) {
    console.warn('Pocket Works could not read the active launcher release', error);
  }
}

const lastDigest = readJson(LAST_DIGEST_KEY);
if (lastDigest) updateWhatsNewButton(lastDigest, { unread: false });

window.addEventListener('online', () => checkRegistry({ force: true }), { passive: true });
window.addEventListener('pageshow', (event) => {
  if (event.persisted) checkRegistry({ force: true });
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkRegistry();
});

window.setInterval(() => checkRegistry(), REGISTRY_CHECK_INTERVAL);
queueMicrotask(() => {
  checkRegistry({ force: true });
  showCurrentShellRelease();
});
