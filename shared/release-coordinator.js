// Launcher-side release lifecycle: the single owner of installed-app checks,
// Service Worker activation, verified fingerprints and stale app cleanup.
// App-local release-guard.js remains compatible with existing installed PWAs.
const VERIFIED_KEY = 'pocket-works:verified-releases:v1';
const OBSERVED_KEY = 'pocket-works:observed-releases:v1';

export function releaseIdentity(app) {
  return { version: String(app.version || ''), fingerprint: app.fingerprint || `version-${app.version}` };
}

export function sameRelease(actual, expected) {
  return Boolean(actual && expected &&
    actual.version === expected.version &&
    (!expected.fingerprint || actual.fingerprint === expected.fingerprint));
}

export function appScope(app, base = location.href) {
  const url = new URL(app.path, base);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

function readRecord(key) {
  try {
    const record = JSON.parse(localStorage.getItem(key) || '{}');
    return record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  } catch { return {}; }
}

export function getVerifiedReleases() { return readRecord(VERIFIED_KEY); }
export function getObservedReleases() { return readRecord(OBSERVED_KEY); }

function saveVerified(app) {
  const state = getVerifiedReleases();
  state[app.slug] = { ...releaseIdentity(app), verifiedAt: Date.now() };
  try { localStorage.setItem(VERIFIED_KEY, JSON.stringify(state)); }
  catch (error) { console.warn('Pocket Works could not persist verified releases', error); }
}

export function needsReleaseConvergence(slug, release) {
  const observed = getObservedReleases()[slug];
  const verified = getVerifiedReleases()[slug];
  return Boolean(
    (observed?.version && !sameRelease(observed, release)) ||
    (verified?.version && !sameRelease(verified, release))
  );
}

export async function installedTargets(apps, serviceWorkers = navigator.serviceWorker) {
  const registrations = await serviceWorkers.getRegistrations();
  const byScope = new Map(registrations.map(reg => [appScope({ path: reg.scope }), reg]));
  return apps.map(app => ({ app, registration: byScope.get(appScope(app)) }))
    .filter(target => Boolean(target.registration));
}

function errorMessage(error) { return error instanceof Error ? error.message : String(error); }

export function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

function workerInfoAttempt(worker, milliseconds) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, milliseconds);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data || null);
    };
    try { worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); resolve(null); }
  });
}

export async function workerInfo(worker) {
  for (const delay of [450, 900]) {
    const result = await workerInfoAttempt(worker, delay);
    if (result) return result;
  }
  return null;
}

export async function updateInstalledApplication(app, registration, { verified = getVerifiedReleases(), onStage = () => {} } = {}) {
  const stage = (phase, label) => onStage(label, phase);
  try {
    // A "check all" must NEVER call registration.update(), skipWaiting or
    // clear an app cache: the same worker may still serve a live PocketNet game.
    const expected = releaseIdentity(app);
    stage('checking', 'Reading installed release');
    const info = await workerInfo(registration.active);
    const versionMatches = info?.version === expected.version;
    const verifiedFingerprint = info?.fingerprint === expected.fingerprint ||
      (!info?.fingerprint && sameRelease(verified[app.slug], expected));
    if (versionMatches && verifiedFingerprint) {
      saveVerified(app);
      stage('current', 'Current release verified');
      return { app, status: 'current' };
    }

    // Legacy workers sometimes provide a version but no fingerprint. Do not
    // invent verification or label an unknown installation as outdated.
    if(versionMatches && !info?.fingerprint && !verified[app.slug]) {
      stage('checked', 'Version matches; fingerprint unavailable');
      return { app, status: 'checked' };
    }

    // A deferred update is applied by the versioned launcher handoff, or by
    // the app's boot guard on its next document entry.
    stage('deferred', 'Update on next launch');
    return { app, status: 'deferred' };
  } catch (error) {
    stage('failed', 'Release check failed');
    return { app, status: 'failed', error: errorMessage(error) };
  }
}

// Query live app documents rather than relying on a potentially stale
// localStorage timestamp. Never evict caches while another tab holds the game.
export async function hasActiveAppDocument(slug, { timeout = 250 } = {}) {
  if(typeof BroadcastChannel !== 'function')return false;
  const channel = new BroadcastChannel('pocket-works-release-presence');
  const nonce = `${slug}:${Date.now()}:${Math.random()}`;
  return new Promise(resolve => {
    let finished = false;
    const finish = active => {
      if(finished)return;
      finished = true;
      clearTimeout(timer);
      channel.close();
      resolve(active);
    };
    const timer = setTimeout(() => finish(false), timeout);
    channel.onmessage = event => {
      if(event.data?.type === 'APP_OPEN' &&
         event.data.slug === slug && event.data.nonce === nonce)finish(true);
    };
    try{channel.postMessage({ type: 'PROBE_APP', slug, nonce });}
    catch{finish(false);}
  });
}

export async function clearStaleAppRuntime(slug, release, { serviceWorkers = navigator.serviceWorker, cacheStorage = caches } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new TypeError('Invalid app slug');
  // Preserve the installed offline copy until connectivity returns.
  if (globalThis.navigator?.onLine === false || await hasActiveAppDocument(slug)) return false;
  const scope = appScope({ path: `./apps/${slug}/` });
  if (serviceWorkers?.getRegistrations) {
    const registrations = await serviceWorkers.getRegistrations();
    await Promise.all(registrations.filter(reg => appScope({ path: reg.scope }) === scope)
      .map(reg => reg.unregister()));
  }
  if (cacheStorage?.keys) {
    const names = await cacheStorage.keys();
    await Promise.all(names.filter(name => {
      const owned = name.startsWith(`${slug}-`) || name.startsWith(`pocket-works-app-${slug}-`);
      return owned && !(release?.version && name.includes(`v${release.version}`));
    }).map(name => cacheStorage.delete(name)));
  }
  for (const key of [OBSERVED_KEY, VERIFIED_KEY]) {
    const state = readRecord(key);
    if (state[slug] && !sameRelease(state[slug], release)) {
      delete state[slug];
      try { localStorage.setItem(key, JSON.stringify(state)); }
      catch (error) { console.warn('Pocket Works could not clear stale release receipt', error); }
    }
  }
  return true;
}
