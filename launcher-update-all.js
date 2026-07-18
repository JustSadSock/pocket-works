import { errorMessage, mapWithConcurrencyResilient, withTimeout } from './shared/update-queue.js';

const REGISTRY_CACHE_KEY = 'pocket-works:registry:v1';
const UPDATE_CONCURRENCY = 2;
const REGISTRY_TIMEOUT = 12_000;
const LOOKUP_TIMEOUT = 8_000;
const REGISTER_TIMEOUT = 15_000;
const UPDATE_REQUEST_TIMEOUT = 18_000;
const INSTALL_TIMEOUT = 50_000;
const ACTIVATION_TIMEOUT = 18_000;
const APP_TIMEOUT = 65_000;
const WORKER_INFO_TIMEOUT = 1_800;

const refreshButton = document.querySelector('#refresh-button');
const syncStatus = document.querySelector('#sync-status');
const sortButton = document.querySelector('#sort-button');
const appList = document.querySelector('#app-list');

let bulkUpdateRunning = false;
let orderRepairQueued = false;
let repairingOrder = false;
const activeStages = new Map();
const currentApps = new Map();

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeRegistrySnapshot(apps) {
  try {
    localStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), apps }));
  } catch {
    // Updates must not depend on localStorage availability.
  }
}

function setStage(app, stage) {
  activeStages.set(app.slug, stage);
  if (!bulkUpdateRunning || !syncStatus) return;
  const active = [...activeStages.entries()].map(([slug, value]) => {
    const current = currentApps.get(slug);
    return `${current?.name || slug}: ${value}`;
  });
  syncStatus.textContent = active.slice(0, UPDATE_CONCURRENCY).join(' · ');
}

async function fetchLiveRegistry() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REGISTRY_TIMEOUT);
  try {
    const response = await withTimeout(fetch(`./apps.json?update=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: controller.signal
    }), REGISTRY_TIMEOUT + 500, 'registry request');
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
    const apps = await withTimeout(response.json(), 4_000, 'registry parsing');
    if (!Array.isArray(apps)) throw new TypeError('apps.json must contain an array');
    return apps.filter((app) => (
      app && app.status !== 'archived' && typeof app.slug === 'string' && typeof app.path === 'string'
    ));
  } finally {
    window.clearTimeout(timer);
  }
}

function workerInfo(worker) {
  if (!worker) return Promise.resolve(null);
  return withTimeout(new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      channel.port1.close();
      resolve(event.data || null);
    };
    try {
      worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]);
    } catch {
      channel.port1.close();
      resolve(null);
    }
  }), WORKER_INFO_TIMEOUT, 'worker metadata').catch(() => null);
}

function waitForWorkerState(worker, acceptedStates, timeout, stage) {
  if (!worker) return Promise.resolve(null);
  if (acceptedStates.includes(worker.state)) return Promise.resolve(worker.state);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.removeEventListener('statechange', inspect);
      const error = new Error(`${stage} timed out after ${Math.round(timeout / 1000)}s`);
      error.stage = stage;
      reject(error);
    }, timeout);
    function inspect() {
      if (!acceptedStates.includes(worker.state)) return;
      window.clearTimeout(timer);
      worker.removeEventListener('statechange', inspect);
      resolve(worker.state);
    }
    worker.addEventListener('statechange', inspect);
  });
}

async function waitForRegistrationActive(registration, preferredWorker = null) {
  const started = Date.now();
  while (Date.now() - started < ACTIVATION_TIMEOUT) {
    const active = registration.active;
    if (active && (!preferredWorker || active === preferredWorker || preferredWorker.state === 'activated')) return active;
    if (preferredWorker?.state === 'redundant') throw new Error('Downloaded worker became redundant during activation');
    await wait(120);
  }
  const error = new Error('Downloaded worker did not become active');
  error.stage = 'activation';
  throw error;
}

async function settleInstallation(registration, app) {
  let installing = registration.installing;
  if (!installing) {
    await wait(100);
    installing = registration.installing;
  }
  if (!installing) return;
  setStage(app, 'downloading');
  const state = await waitForWorkerState(
    installing,
    ['installed', 'activated', 'redundant'],
    INSTALL_TIMEOUT,
    'installation'
  );
  if (state === 'redundant') throw new Error('New application worker became redundant while downloading');
}

async function activateWaitingWorker(registration, expectedVersion, app) {
  const waiting = registration.waiting;
  if (!waiting) return null;
  setStage(app, 'activating');
  const info = await workerInfo(waiting);
  if (info?.version && expectedVersion && info.version !== expectedVersion) {
    throw new Error(`Downloaded v${info.version}, registry expects v${expectedVersion}`);
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
  const state = await waitForWorkerState(waiting, ['activated', 'redundant'], ACTIVATION_TIMEOUT, 'activation');
  if (state === 'redundant') throw new Error('New application worker failed during activation');
  await waitForRegistrationActive(registration, waiting);
  return info;
}

function exactRegistrationForScope(registration, scopeUrl) {
  if (!registration) return null;
  return new URL(registration.scope).href === scopeUrl.href ? registration : null;
}

async function updateApplication(app) {
  let stage = 'lookup';
  try {
    const scopeUrl = new URL(app.path, window.location.href);
    const workerUrl = new URL('sw.js', scopeUrl);
    setStage(app, 'checking');

    const matchedRegistration = exactRegistrationForScope(
      await withTimeout(navigator.serviceWorker.getRegistration(scopeUrl.href), LOOKUP_TIMEOUT, 'registration lookup'),
      scopeUrl
    );
    const previousWorker = matchedRegistration?.active || null;
    const previousInfo = await workerInfo(previousWorker);

    stage = 'registration';
    setStage(app, 'registering');
    const registration = await withTimeout(navigator.serviceWorker.register(workerUrl.href, {
      scope: scopeUrl.href,
      updateViaCache: 'none'
    }), REGISTER_TIMEOUT, 'service worker registration');

    stage = 'update request';
    setStage(app, 'requesting update');
    try {
      await withTimeout(registration.update(), UPDATE_REQUEST_TIMEOUT, 'service worker update request');
    } catch (error) {
      if (!registration.installing && !registration.active) throw error;
    }

    stage = 'installation';
    await settleInstallation(registration, app);
    stage = 'activation';
    const downloadedInfo = await activateWaitingWorker(registration, app.version, app);
    const activeWorker = await waitForRegistrationActive(registration);

    stage = 'verification';
    setStage(app, 'verifying');
    const activeInfo = await workerInfo(activeWorker) || downloadedInfo;
    if (activeInfo?.version && app.version && activeInfo.version !== app.version) {
      throw new Error(`Expected v${app.version}, activated v${activeInfo.version}`);
    }

    const changedWorker = Boolean(previousWorker && activeWorker !== previousWorker);
    const changedVersion = Boolean(previousInfo?.version && activeInfo?.version && previousInfo.version !== activeInfo.version);
    return {
      app,
      status: previousWorker ? (changedWorker || changedVersion ? 'updated' : 'current') : 'installed',
      version: activeInfo?.version || app.version || '',
      stage: 'complete'
    };
  } catch (error) {
    return {
      app,
      status: 'failed',
      stage: error?.stage || stage,
      error: errorMessage(error)
    };
  } finally {
    activeStages.delete(app.slug);
  }
}

function updateSummary(results) {
  const updated = results.filter((result) => result.status === 'updated').length;
  const installed = results.filter((result) => result.status === 'installed').length;
  const current = results.filter((result) => result.status === 'current').length;
  const failed = results.filter((result) => result.status === 'failed');
  const changed = updated + installed;
  const failureNames = failed.slice(0, 3).map((result) => `${result.app?.name || result.app?.slug}: ${result.stage}`).join(', ');
  const main = failed.length
    ? `${changed} updated / ${current} current / ${failed.length} skipped${failureNames ? ` — ${failureNames}` : ''}`
    : changed
      ? `${changed} updated / ${current} already current`
      : `All ${current} applications are current`;
  return { main, updated, installed, current, failed };
}

async function waitForLauncherRefresh() {
  const deadline = Date.now() + 12_000;
  let observedBusy = false;
  while (Date.now() < deadline) {
    observedBusy ||= refreshButton.disabled;
    if (observedBusy && !refreshButton.disabled) return;
    await wait(100);
  }
}

async function runBulkUpdate() {
  if (bulkUpdateRunning || !refreshButton || !syncStatus) return;
  bulkUpdateRunning = true;
  refreshButton.disabled = true;
  refreshButton.textContent = 'Checking…';
  syncStatus.textContent = 'Reading live application registry';
  activeStages.clear();
  currentApps.clear();

  try {
    if (!('serviceWorker' in navigator)) throw new Error('Service Workers are unavailable in this browser');
    if (!navigator.onLine) throw new Error('No internet connection');

    const apps = await fetchLiveRegistry();
    apps.forEach((app) => currentApps.set(app.slug, app));
    writeRegistrySnapshot(apps);

    const results = await mapWithConcurrencyResilient(apps, UPDATE_CONCURRENCY, updateApplication, {
      itemTimeout: APP_TIMEOUT,
      labelFor: (app) => app.name || app.slug,
      onStart: (app) => setStage(app, 'queued'),
      onProgress: (completed, total, result) => {
        activeStages.delete(result.app?.slug);
        refreshButton.textContent = `${completed}/${total}`;
        syncStatus.textContent = result.status === 'failed'
          ? `${result.app?.name || result.app?.slug}: skipped at ${result.stage} — continuing`
          : `${result.app.name}: ${result.status}`;
      }
    });

    const summary = updateSummary(results);
    window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete', { detail: summary }));

    refreshButton.disabled = false;
    bulkUpdateRunning = false;
    refreshButton.click();
    await waitForLauncherRefresh();
    syncStatus.textContent = summary.main;
    navigator.vibrate?.(summary.failed.length ? [10, 40, 10] : 12);
  } catch (error) {
    syncStatus.textContent = `${errorMessage(error)} — existing offline caches kept`;
  } finally {
    activeStages.clear();
    bulkUpdateRunning = false;
    refreshButton.disabled = false;
    refreshButton.textContent = 'Update';
  }
}

function updatedTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function repairSortLabel() {
  if (!sortButton) return;
  const labels = { updated: 'Updated ↓', recent: 'Opened ↓', name: 'Name A–Z' };
  const expected = labels[sortButton.dataset.sort];
  if (expected && sortButton.textContent !== expected) sortButton.textContent = expected;
}

function repairUpdatedOrder() {
  orderRepairQueued = false;
  repairSortLabel();
  if (repairingOrder || !appList || sortButton?.dataset.sort !== 'updated') return;
  const registry = readJson(REGISTRY_CACHE_KEY)?.apps;
  if (!Array.isArray(registry)) return;
  const metadata = new Map(registry.map((app) => [app.slug, app]));
  const entries = [...appList.querySelectorAll('.app-entry[data-slug]')];
  if (entries.length < 2) return;
  const ordered = [...entries].sort((left, right) => {
    const leftApp = metadata.get(left.dataset.slug) || {};
    const rightApp = metadata.get(right.dataset.slug) || {};
    const difference = updatedTimestamp(rightApp.updatedAt) - updatedTimestamp(leftApp.updatedAt);
    if (Number.isFinite(difference) && difference !== 0) return difference;
    return String(leftApp.name || left.dataset.slug).localeCompare(String(rightApp.name || right.dataset.slug));
  });
  if (ordered.every((entry, index) => entry === entries[index])) return;
  repairingOrder = true;
  const fragment = document.createDocumentFragment();
  for (const entry of ordered) fragment.append(entry);
  appList.append(fragment);
  repairingOrder = false;
}

function queueOrderRepair() {
  repairSortLabel();
  if (orderRepairQueued) return;
  orderRepairQueued = true;
  requestAnimationFrame(repairUpdatedOrder);
}

refreshButton?.addEventListener('click', (event) => {
  if (!event.isTrusted) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  runBulkUpdate();
}, { capture: true });

const buttonLabelObserver = refreshButton ? new MutationObserver(() => {
  if (!bulkUpdateRunning && !refreshButton.disabled && refreshButton.textContent === 'Sync') refreshButton.textContent = 'Update';
}) : null;
buttonLabelObserver?.observe(refreshButton, { childList: true, characterData: true, subtree: true });

const sortLabelObserver = sortButton ? new MutationObserver(queueOrderRepair) : null;
sortLabelObserver?.observe(sortButton, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-sort'] });
const listObserver = appList ? new MutationObserver(queueOrderRepair) : null;
listObserver?.observe(appList, { childList: true });
sortButton?.addEventListener('click', queueOrderRepair);
window.addEventListener('pocketworks:bulk-update-complete', queueOrderRepair);

const buildMeta = document.querySelector('meta[name="pocket-works-build"]');
if (buildMeta) buildMeta.content = '0.8.3';
const eyebrow = document.querySelector('.brand-lockup .eyebrow');
if (eyebrow) eyebrow.textContent = 'PERSONAL SOFTWARE SHELF / 0.8.3';

repairSortLabel();
queueOrderRepair();
if (refreshButton && refreshButton.textContent === 'Sync') refreshButton.textContent = 'Update';
