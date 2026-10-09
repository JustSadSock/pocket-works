// Launcher-side release lifecycle: the single owner of installed-app checks,
// Service Worker activation, verified fingerprints and stale app cleanup.
// App-local release-guard.js remains compatible with existing installed PWAs.
const VERIFIED_KEY = 'pocket-works:verified-releases:v1';
const OBSERVED_KEY = 'pocket-works:observed-releases:v1';
const CHECK_TIMEOUT = 12_000;
const INSTALL_TIMEOUT = 18_000;
const ACTIVATION_TIMEOUT = 8_000;

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

function waitForState(worker, accepted, milliseconds) {
  if (accepted.includes(worker.state)) return Promise.resolve(worker.state);
  return withTimeout(new Promise(resolve => {
    function changed() {
      if (!accepted.includes(worker.state)) return;
      worker.removeEventListener('statechange', changed);
      resolve(worker.state);
    }
    worker.addEventListener('statechange', changed);
  }), milliseconds, 'Service Worker installation');
}

async function activateCandidate(registration, candidate, onStage) {
  if (candidate.state === 'installing') {
    onStage('installing', 'Installing offline files');
    const state = await waitForState(candidate, ['installed', 'activated', 'redundant'], INSTALL_TIMEOUT);
    if (state === 'redundant') throw new Error('new worker became redundant');
  }
  const waiting = registration.waiting || (candidate.state === 'installed' ? candidate : null);
  if (waiting) {
    onStage('activating', 'Activating release');
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  const deadline = Date.now() + ACTIVATION_TIMEOUT;
  while (Date.now() < deadline) {
    if (registration.active === candidate || candidate.state === 'activated') return;
    if (candidate.state === 'redundant') throw new Error('new worker became redundant');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Service Worker activation timed out');
}

export async function updateInstalledApplication(app, registration, { verified = getVerifiedReleases(), onStage = () => {} } = {}) {
  const stage = (phase, label) => onStage(label, phase);
  try {
    const before = registration.active;
    const previousInfo = await workerInfo(before);
    const expected = releaseIdentity(app);
    if (sameRelease(verified[app.slug], expected) &&
        previousInfo?.version === expected.version &&
        (!previousInfo.fingerprint || previousInfo.fingerprint === expected.fingerprint)) {
      stage('current', 'Current release verified');
      return { app, status: 'current' };
    }

    stage('checking', 'Checking installed release');
    await withTimeout(registration.update(), CHECK_TIMEOUT, `${app.name} worker check`);
    let candidate = registration.installing || registration.waiting;
    if (candidate) await activateCandidate(registration, candidate, stage);
    else if (registration.active !== before) candidate = registration.active;

    stage('verifying', 'Verifying active release');
    const active = registration.active;
    const info = await workerInfo(active);
    if (info?.version && info.version !== expected.version)
      throw new Error(`active worker reports v${info.version}; expected v${expected.version}`);
    if (info?.fingerprint && expected.fingerprint && info.fingerprint !== expected.fingerprint)
      throw new Error('active worker fingerprint does not match published release');

    if (info?.version === expected.version) {
      saveVerified(app);
      const status = candidate || previousInfo?.version !== expected.version ? 'updated' : 'current';
      stage(status, status === 'updated' ? 'Release updated' : 'Release current');
      return { app, status };
    }
    // Older workers may not report metadata. A successful check is not proof
    // that the intended release is installed: never write a false verified receipt.
    stage('checked', 'Worker checked; release not verified');
    return { app, status: 'checked' };
  } catch (error) {
    stage('failed', 'Release check failed');
    return { app, status: 'failed', error: errorMessage(error), timedOut: errorMessage(error).includes('timed out') };
  }
}

export async function clearStaleAppRuntime(slug, release, { serviceWorkers = navigator.serviceWorker, cacheStorage = caches } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new TypeError('Invalid app slug');
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
}
