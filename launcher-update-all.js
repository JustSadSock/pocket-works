const REGISTRY_CACHE_KEY = 'pocket-works:registry:v1';
const UPDATE_CONCURRENCY = 2;
const INSTALL_TIMEOUT = 90_000;
const ACTIVATION_TIMEOUT = 20_000;

const refreshButton = document.querySelector('#refresh-button');
const syncStatus = document.querySelector('#sync-status');
const sortButton = document.querySelector('#sort-button');
const appList = document.querySelector('#app-list');

let bulkUpdateRunning = false;
let orderRepairQueued = false;
let repairingOrder = false;

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
    localStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      apps
    }));
  } catch {
    // Updating applications must not depend on localStorage availability.
  }
}

async function fetchLiveRegistry() {
  const response = await fetch(`./apps.json?update=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' }
  });

  if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
  const apps = await response.json();
  if (!Array.isArray(apps)) throw new TypeError('apps.json must contain an array');

  return apps.filter((app) => (
    app &&
    app.status !== 'archived' &&
    typeof app.slug === 'string' &&
    typeof app.path === 'string'
  ));
}

function workerInfoAttempt(worker, timeout = 2200) {
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeout);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data || null);
    };

    try {
      worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

async function workerInfo(worker) {
  for (const timeout of [1200, 2200, 3600]) {
    const info = await workerInfoAttempt(worker, timeout);
    if (info) return info;
    await wait(60);
  }
  return null;
}

function waitForWorkerState(worker, acceptedStates, timeout) {
  if (!worker) return Promise.resolve(null);
  if (acceptedStates.includes(worker.state)) return Promise.resolve(worker.state);

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.removeEventListener('statechange', inspect);
      reject(new Error(`Service Worker timed out in ${worker.state}`));
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
  const deadline = Date.now() + ACTIVATION_TIMEOUT;
  while (Date.now() < deadline) {
    const active = registration.active;
    if (active && (!preferredWorker || active === preferredWorker || preferredWorker.state === 'activated')) return active;
    if (preferredWorker?.state === 'redundant') throw new Error('The downloaded worker became redundant during activation');
    await wait(120);
  }
  throw new Error('The downloaded worker did not activate');
}

async function settleInstallation(registration) {
  let installing = registration.installing;
  if (!installing) {
    await wait(80);
    installing = registration.installing;
  }
  if (!installing) return;

  const state = await waitForWorkerState(installing, ['installed', 'activated', 'redundant'], INSTALL_TIMEOUT);
  if (state === 'redundant') throw new Error('The new application worker could not finish downloading');
}

async function activateWaitingWorker(registration) {
  const waiting = registration.waiting;
  if (!waiting) return null;

  const info = await workerInfo(waiting);
  waiting.postMessage({ type: 'SKIP_WAITING' });
  await waitForWorkerState(waiting, ['activated', 'redundant'], ACTIVATION_TIMEOUT);
  if (waiting.state === 'redundant') throw new Error('The new application worker failed during activation');
  await waitForRegistrationActive(registration, waiting);
  return info;
}

function exactRegistrationForScope(registration, scopeUrl) {
  if (!registration) return null;
  return new URL(registration.scope).href === scopeUrl.href ? registration : null;
}

async function updateApplication(app) {
  const scopeUrl = new URL(app.path, window.location.href);
  const workerUrl = new URL('sw.js', scopeUrl);

  const matchedRegistration = exactRegistrationForScope(
    await navigator.serviceWorker.getRegistration(scopeUrl.href),
    scopeUrl
  );
  const previousWorker = matchedRegistration?.active || null;
  const previousInfo = await workerInfo(previousWorker);

  let registration;
  try {
    registration = await navigator.serviceWorker.register(workerUrl.href, {
      scope: scopeUrl.href,
      updateViaCache: 'none'
    });

    try {
      await registration.update();
    } catch (error) {
      // A first registration may already be installing. Only fail immediately when
      // there is neither an installation nor an existing active fallback.
      if (!registration.installing && !registration.active) throw error;
    }

    await settleInstallation(registration);

    const downloadedInfo = await activateWaitingWorker(registration);
    const activeWorker = await waitForRegistrationActive(registration);
    const activeInfo = await workerInfo(activeWorker) || downloadedInfo;

    if (activeInfo?.version && app.version && activeInfo.version !== app.version) {
      throw new Error(`Expected v${app.version}, activated v${activeInfo.version}`);
    }

    const changedWorker = Boolean(previousWorker && activeWorker !== previousWorker);
    const changedVersion = Boolean(previousInfo?.version && activeInfo?.version && previousInfo.version !== activeInfo.version);

    return {
      app,
      status: previousWorker ? (changedWorker || changedVersion ? 'updated' : 'current') : 'installed',
      version: activeInfo?.version || app.version || ''
    };
  } catch (error) {
    // Deliberately do not delete caches or unregister the previous worker here.
    // A failed installation remains isolated while the last active build stays usable offline.
    return {
      app,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function mapWithConcurrency(items, concurrency, handler, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await handler(items[index], index);
      completed += 1;
      onProgress?.(completed, items.length, results[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function updateSummary(results) {
  const updated = results.filter((result) => result.status === 'updated').length;
  const installed = results.filter((result) => result.status === 'installed').length;
  const current = results.filter((result) => result.status === 'current').length;
  const failed = results.filter((result) => result.status === 'failed');

  const changed = updated + installed;
  const main = failed.length > 0
    ? `${changed} updated / ${current} current / ${failed.length} failed — old caches kept`
    : changed > 0
      ? `${changed} application${changed === 1 ? '' : 's'} updated / ${current} already current`
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
  syncStatus.textContent = 'Checking the live application registry';

  try {
    if (!('serviceWorker' in navigator)) throw new Error('Service Workers are unavailable in this browser');
    if (!navigator.onLine) throw new Error('No internet connection');

    const apps = await fetchLiveRegistry();
    writeRegistrySnapshot(apps);

    const results = await mapWithConcurrency(
      apps,
      UPDATE_CONCURRENCY,
      updateApplication,
      (completed, total, result) => {
        refreshButton.textContent = `${completed}/${total}`;
        syncStatus.textContent = result.status === 'failed'
          ? `${result.app.name}: download failed; previous offline build kept`
          : `${result.app.name}: ${result.status}`;
      }
    );

    const summary = updateSummary(results);
    window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete', { detail: summary }));

    refreshButton.disabled = false;
    bulkUpdateRunning = false;
    refreshButton.click();
    await waitForLauncherRefresh();
    syncStatus.textContent = summary.main;
    navigator.vibrate?.(summary.failed.length > 0 ? [10, 40, 10] : 12);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    syncStatus.textContent = `${reason} — existing offline caches kept`;
  } finally {
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
  const labels = {
    updated: 'Updated ↓',
    recent: 'Opened ↓',
    name: 'Name A–Z'
  };
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

const buttonLabelObserver = refreshButton
  ? new MutationObserver(() => {
      if (!bulkUpdateRunning && !refreshButton.disabled && refreshButton.textContent === 'Sync') {
        refreshButton.textContent = 'Update';
      }
    })
  : null;
buttonLabelObserver?.observe(refreshButton, { childList: true, characterData: true, subtree: true });

const sortLabelObserver = sortButton ? new MutationObserver(queueOrderRepair) : null;
sortLabelObserver?.observe(sortButton, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-sort'] });

const listObserver = appList ? new MutationObserver(queueOrderRepair) : null;
listObserver?.observe(appList, { childList: true });
sortButton?.addEventListener('click', queueOrderRepair);
window.addEventListener('pocketworks:bulk-update-complete', queueOrderRepair);

repairSortLabel();
queueOrderRepair();
if (refreshButton && refreshButton.textContent === 'Sync') refreshButton.textContent = 'Update';
