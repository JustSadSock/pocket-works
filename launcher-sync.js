const SHELF_STORAGE_KEY = 'pocket-works:shelf:v1';
const REGISTRY_CACHE_KEY = 'pocket-works:registry:v1';
const REGISTRY_HISTORY_KEY = 'pocket-works:registry-history:v2';
const LAST_DIGEST_KEY = 'pocket-works:last-release-digest:v1';
const MANAGED_RECEIPT_PREFIX = 'pocket-works:managed-update-receipt:v1:';
const MANAGED_SEEN_PREFIX = 'pocket-works:managed-update-seen:v1:';
const REGISTRY_CHECK_INTERVAL = 5 * 60 * 1000;
const REGISTRY_CHECK_COOLDOWN = 45 * 1000;

const refreshButton = document.querySelector('#refresh-button');
const deckActions = document.querySelector('.deck-actions');
const cachedRegistryAtBoot = readRegistryCache()?.apps || [];
const returningUser = storageHas(SHELF_STORAGE_KEY) || cachedRegistryAtBoot.length > 0;

let lastRegistryCheckAt = 0;
let registryCheckPromise = null;
let activeDigest = null;
let digestQueue = [];

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
      slug: app.slug,
      name: app.name,
      description: typeof app.description === 'string' ? app.description : '',
      version: typeof app.version === 'string' ? app.version : '',
      updatedAt: typeof app.updatedAt === 'string' ? app.updatedAt : '',
      changelog: Array.isArray(app.changelog) ? app.changelog.filter((note) => typeof note === 'string') : []
    }));
}

function registrySignature(app) {
  return [app.version, app.updatedAt, ...app.changelog].join('\u001f');
}

function registryFingerprint(apps) {
  return normalizeRegistry(apps)
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((app) => `${app.slug}:${registrySignature(app)}`)
    .join('\u001e');
}

function diffRegistry(previousApps, nextApps) {
  const previous = new Map(normalizeRegistry(previousApps).map((app) => [app.slug, app]));
  const added = [];
  const updated = [];

  for (const app of normalizeRegistry(nextApps)) {
    const earlier = previous.get(app.slug);
    if (!earlier) added.push(app);
    else if (registrySignature(earlier) !== registrySignature(app)) updated.push(app);
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
    const digest = readJson(LAST_DIGEST_KEY);
    if (digest) enqueueDigest(digest, { remember: false, immediate: true });
  });
  deckActions.prepend(button);
  return button;
}

function updateWhatsNewButton(digest) {
  const button = ensureWhatsNewButton();
  if (!button || !digest) return;
  const counter = button.querySelector('[data-whats-new-count]');
  const count = Array.isArray(digest.notes) ? digest.notes.length : 0;
  counter.textContent = String(count);
  counter.hidden = count === 0;
  button.classList.add('has-release');
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
  surface.classList.remove('is-visible');
  activeDigest = null;
  window.setTimeout(() => {
    if (digestQueue.length > 0) showDigest(digestQueue.shift());
  }, 180);
}

function enqueueDigest(digest, { remember = true, immediate = false } = {}) {
  if (!digest || !Array.isArray(digest.notes) || digest.notes.length === 0) return;
  if (remember) writeJson(LAST_DIGEST_KEY, digest);
  updateWhatsNewButton(digest);

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
    id: `registry:${registryFingerprint(nextApps)}`,
    eyebrow: changes.added.length > 0 ? 'NEW ON THE SHELF' : 'APPLICATIONS UPDATED',
    title: changes.added.length > 0
      ? `${changes.added.length} new application${changes.added.length === 1 ? '' : 's'}`
      : `${changes.updated.length} application update${changes.updated.length === 1 ? '' : 's'}`,
    notes: notes.slice(0, 5),
    savedAt: Date.now()
  };
}

async function requestLauncherRefresh() {
  if (!refreshButton) return;
  const deadline = Date.now() + 4500;
  while (refreshButton.disabled && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  if (!refreshButton.disabled) refreshButton.click();
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
  if (!force && Date.now() - lastRegistryCheckAt < REGISTRY_CHECK_COOLDOWN) return false;
  if (registryCheckPromise) return registryCheckPromise;

  const baseline = readJson(REGISTRY_HISTORY_KEY)?.apps || cachedRegistryAtBoot;
  lastRegistryCheckAt = Date.now();
  registryCheckPromise = (async () => {
    try {
      const nextApps = await fetchLiveRegistry();
      const changes = diffRegistry(baseline, nextApps);
      writeJson(REGISTRY_HISTORY_KEY, { savedAt: Date.now(), apps: nextApps });

      const visibleFingerprint = registryFingerprint(readRegistryCache()?.apps || []);
      const liveFingerprint = registryFingerprint(nextApps);
      if (visibleFingerprint !== liveFingerprint) await requestLauncherRefresh();

      if ((changes.added.length > 0 || changes.updated.length > 0) && baseline.length > 0) {
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
if (lastDigest) updateWhatsNewButton(lastDigest);

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
