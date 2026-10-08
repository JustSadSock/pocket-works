// Single owner for the Pocket Works launcher registry.
// All launcher features share one network request, cache and change stream.
const CACHE_KEY = 'pocket-works:registry:v1';
const REGISTRY_URL = './apps.json';
const DEFAULT_MAX_AGE = 30_000;

let snapshot = null;
let inflight = null;
let lastFetchedAt = 0;
let revision = 0;
const subscribers = new Set();

function normalize(apps) {
  if (!Array.isArray(apps)) throw new TypeError('apps.json must contain an array');
  return apps
    .filter(app => app && typeof app === 'object' && app.status !== 'archived')
    .filter(app => typeof app.slug === 'string' && typeof app.name === 'string' && typeof app.path === 'string');
}

function readSavedSnapshot() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (saved && Array.isArray(saved.apps)) {
      return { apps: normalize(saved.apps), savedAt: Number(saved.savedAt) || 0, source: 'cache' };
    }
  } catch {
    // Storage is optional; a network response can still populate the shelf.
  }
  return null;
}

export function getRegistrySnapshot() {
  if (!snapshot) snapshot = readSavedSnapshot();
  return snapshot;
}

function notify(next) {
  for (const subscriber of subscribers) {
    try { subscriber(next); }
    catch (error) { console.error('Pocket Works registry subscriber failed', error); }
  }
}

export function subscribeRegistry(subscriber, { immediate = false } = {}) {
  if (typeof subscriber !== 'function') throw new TypeError('registry subscriber must be a function');
  subscribers.add(subscriber);
  if (immediate && getRegistrySnapshot()) subscriber(snapshot);
  return () => subscribers.delete(subscriber);
}

export function setRegistrySnapshot(apps, { source = 'external', savedAt = Date.now() } = {}) {
  const normalized = normalize(apps);
  if (apps.length && !normalized.length) throw new TypeError('No valid application entries');
  const previous = getRegistrySnapshot();
  const changed = !previous || JSON.stringify(previous.apps) !== JSON.stringify(normalized);
  snapshot = { apps: normalized, savedAt, source };
  revision++;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ apps: normalized, savedAt }));
  } catch (error) {
    console.warn('Pocket Works could not persist the registry cache', error);
  }
  if (changed) notify(snapshot);
  return snapshot;
}

export async function loadRegistry({ force = false, maxAge = DEFAULT_MAX_AGE } = {}) {
  const saved = getRegistrySnapshot();
  if (!force && lastFetchedAt && Date.now() - lastFetchedAt < maxAge && saved) return saved;
  if (inflight) return inflight;

  const startRevision = revision;
  inflight = (async () => {
    const response = await fetch(`${REGISTRY_URL}?registry=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' }
    });
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
    const apps = normalize(await response.json());
    lastFetchedAt = Date.now();
    // A manual sync or another tab may have published a newer snapshot while fetching.
    if (revision !== startRevision) return getRegistrySnapshot();
    return setRegistrySnapshot(apps, { source: 'network', savedAt: lastFetchedAt });
  })();

  try { return await inflight; }
  finally { inflight = null; }
}
