import {
  installMobileRuntime,
  setDocumentScrollLocked
} from './shared/mobile-runtime.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:shelf:v1';
const REGISTRY_CACHE_KEY = 'pocket-works:registry:v1';
const FILTERS = ['all', 'favorites', 'recent', 'offline', 'experimental'];
const SORTS = ['updated', 'recent', 'name'];
const SORT_LABELS = {
  updated: 'Updated ↓',
  recent: 'Recent ↓',
  name: 'Name A–Z'
};

const root = document.documentElement;
const body = document.body;
const mobilePanelQuery = window.matchMedia('(max-width: 980px)');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const list = document.querySelector('#app-list');
const template = document.querySelector('#app-card-template');
const emptyState = document.querySelector('#empty-state');
const errorState = document.querySelector('#error-state');
const errorCopy = document.querySelector('#error-copy');
const count = document.querySelector('#app-count');
const resultSummary = document.querySelector('#result-summary');
const offlineCount = document.querySelector('#offline-count');
const syncStatus = document.querySelector('#sync-status');
const networkStatus = document.querySelector('#network-status');
const displayMode = document.querySelector('#display-mode');
const searchInput = document.querySelector('#app-search');
const clearSearch = document.querySelector('#clear-search');
const filterStrip = document.querySelector('#filter-strip');
const sortButton = document.querySelector('#sort-button');
const refreshButton = document.querySelector('#refresh-button');
const resetShelf = document.querySelector('#reset-shelf');

const detailPanel = document.querySelector('#detail-panel');
const detailBackdrop = document.querySelector('#detail-backdrop');
const detailClose = document.querySelector('#detail-close');
const detailEmpty = document.querySelector('#detail-empty');
const detailContent = document.querySelector('#detail-content');
const detailPreview = document.querySelector('#detail-preview');
const detailKicker = document.querySelector('#detail-kicker');
const detailName = document.querySelector('#detail-name');
const detailDescription = document.querySelector('#detail-description');
const detailVersion = document.querySelector('#detail-version');
const detailUpdated = document.querySelector('#detail-updated');
const detailOffline = document.querySelector('#detail-offline');
const detailOpened = document.querySelector('#detail-opened');
const detailTags = document.querySelector('#detail-tags');
const detailChangelog = document.querySelector('#detail-changelog');
const detailOpen = document.querySelector('#detail-open');
const detailFavorite = document.querySelector('#detail-favorite');
const detailCopy = document.querySelector('#detail-copy');
const installNote = document.querySelector('#install-note');

let registry = [];
let offlineReady = new Set();
let panelOpen = false;
let lastFocusedElement = null;
let lastSyncAt = null;

function defaultShelfState() {
  return {
    favorites: [],
    recents: {},
    filter: 'all',
    sort: 'updated',
    selected: null,
    query: ''
  };
}

function readShelfState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const state = defaultShelfState();

    if (Array.isArray(parsed.favorites)) {
      state.favorites = parsed.favorites.filter((slug) => typeof slug === 'string');
    }

    if (parsed.recents && typeof parsed.recents === 'object' && !Array.isArray(parsed.recents)) {
      state.recents = Object.fromEntries(
        Object.entries(parsed.recents)
          .filter(([slug, value]) => typeof slug === 'string' && Number.isFinite(value))
      );
    }

    if (FILTERS.includes(parsed.filter)) state.filter = parsed.filter;
    if (SORTS.includes(parsed.sort)) state.sort = parsed.sort;
    if (typeof parsed.selected === 'string') state.selected = parsed.selected;
    return state;
  } catch {
    return defaultShelfState();
  }
}

let shelfState = readShelfState();

function persistShelfState() {
  const persisted = {
    favorites: [...new Set(shelfState.favorites)],
    recents: shelfState.recents,
    filter: shelfState.filter,
    sort: shelfState.sort,
    selected: shelfState.selected
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (error) {
    console.warn('Pocket Works could not persist shelf state', error);
  }
}

function saveRegistrySnapshot(apps) {
  try {
    localStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      apps
    }));
  } catch (error) {
    console.warn('Pocket Works could not save the registry snapshot', error);
  }
}

function readRegistrySnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.apps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeRegistry(apps) {
  return apps
    .filter((app) => app && typeof app === 'object' && app.status !== 'archived')
    .filter((app) => typeof app.slug === 'string' && typeof app.name === 'string' && typeof app.path === 'string')
    .map((app) => ({
      ...app,
      tags: Array.isArray(app.tags) ? app.tags.filter((tag) => typeof tag === 'string') : [],
      changelog: Array.isArray(app.changelog) ? app.changelog.filter((note) => typeof note === 'string') : []
    }));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function configurePreview(element, app) {
  if (!element || !app) return;
  const seed = hashString(app.slug);
  const x = 32 + (seed % 42);
  const y = 28 + ((seed >>> 5) % 44);
  const rotation = -24 + ((seed >>> 9) % 49);

  element.dataset.preset = app.preset || 'vanilla';
  element.style.setProperty('--entry-accent', app.accent || '#c8ff45');
  element.style.setProperty('--preview-x', `${x}%`);
  element.style.setProperty('--preview-y', `${y}%`);
  element.style.setProperty('--preview-r', `${rotation}deg`);
}

const previewObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle('is-in-view', entry.isIntersecting && !document.hidden);
      }
    }, { rootMargin: '80px 0px', threshold: 0.08 })
  : null;

function observeListPreviews() {
  previewObserver?.disconnect();
  for (const preview of list.querySelectorAll('.app-preview')) {
    if (previewObserver) previewObserver.observe(preview);
    else preview.classList.add('is-in-view');
  }
  syncDetailPreviewMotion();
}

function syncDetailPreviewMotion() {
  const shouldAnimate = !document.hidden && (!mobilePanelQuery.matches || panelOpen);
  detailPreview.classList.toggle('is-in-view', shouldAnimate);
}

function isFavorite(slug) {
  return shelfState.favorites.includes(slug);
}

function recentTimestamp(slug) {
  const value = shelfState.recents[slug];
  return Number.isFinite(value) ? value : 0;
}

function recordRecent(slug) {
  shelfState.recents[slug] = Date.now();
  shelfState.selected = slug;
  persistShelfState();
}

function toggleFavorite(slug) {
  if (isFavorite(slug)) {
    shelfState.favorites = shelfState.favorites.filter((item) => item !== slug);
  } else {
    shelfState.favorites = [slug, ...shelfState.favorites.filter((item) => item !== slug)];
  }

  persistShelfState();
  navigator.vibrate?.(8);
  renderShelf({ transition: true });
}

function getDisplayMode() {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return 'standalone';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  return 'browser';
}

function updateSystemStatus() {
  const online = navigator.onLine;
  root.classList.toggle('is-offline', !online);
  networkStatus.textContent = online ? 'online' : 'offline';
  displayMode.textContent = getDisplayMode();
  offlineCount.textContent = `${offlineReady.size} offline-ready`;
}

function formatDate(value) {
  if (!value) return 'unknown';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatRecent(timestamp) {
  if (!timestamp) return 'never';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function appMatchesQuery(app, query) {
  if (!query) return true;
  const haystack = [
    app.name,
    app.shortName,
    app.description,
    app.version,
    app.status,
    app.preset,
    ...(app.tags || []),
    ...(app.changelog || [])
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

function appMatchesFilter(app) {
  switch (shelfState.filter) {
    case 'favorites': return isFavorite(app.slug);
    case 'recent': return recentTimestamp(app.slug) > 0;
    case 'offline': return offlineReady.has(app.slug);
    case 'experimental': return app.status === 'experimental';
    default: return true;
  }
}

function compareApps(left, right) {
  if (shelfState.sort === 'name') return left.name.localeCompare(right.name);

  if (shelfState.sort === 'recent') {
    const recentDifference = recentTimestamp(right.slug) - recentTimestamp(left.slug);
    if (recentDifference !== 0) return recentDifference;
  }

  const dateDifference = String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
  if (dateDifference !== 0) return dateDifference;
  return left.name.localeCompare(right.name);
}

function visibleApps() {
  const query = shelfState.query.trim();
  return registry
    .filter((app) => appMatchesQuery(app, query))
    .filter(appMatchesFilter)
    .sort(compareApps);
}

function filterCounts() {
  return {
    all: registry.length,
    favorites: registry.filter((app) => isFavorite(app.slug)).length,
    recent: registry.filter((app) => recentTimestamp(app.slug) > 0).length,
    offline: registry.filter((app) => offlineReady.has(app.slug)).length,
    experimental: registry.filter((app) => app.status === 'experimental').length
  };
}

function updateControlState(apps) {
  const counts = filterCounts();
  for (const button of filterStrip.querySelectorAll('[data-filter]')) {
    const filter = button.dataset.filter;
    button.setAttribute('aria-pressed', String(filter === shelfState.filter));
    const counter = button.querySelector('[data-filter-count]');
    if (counter) counter.textContent = String(counts[filter] || 0);
  }

  searchInput.value = shelfState.query;
  clearSearch.hidden = shelfState.query.length === 0;
  sortButton.dataset.sort = shelfState.sort;
  sortButton.textContent = SORT_LABELS[shelfState.sort];
  count.textContent = String(apps.length);

  const noun = apps.length === 1 ? 'object' : 'objects';
  const qualifier = shelfState.query ? ` matching “${shelfState.query}”` : '';
  resultSummary.textContent = `${apps.length} ${noun}${qualifier}`;
}

function renderApps(apps) {
  list.replaceChildren();
  emptyState.hidden = apps.length !== 0;

  apps.forEach((app, index) => {
    const fragment = template.content.cloneNode(true);
    const entry = fragment.querySelector('.app-entry');
    const select = fragment.querySelector('.app-entry__select');
    const favorite = fragment.querySelector('.app-entry__favorite');
    const open = fragment.querySelector('.app-entry__open');
    const preview = fragment.querySelector('.app-preview');

    entry.dataset.slug = app.slug;
    entry.style.setProperty('--entry-accent', app.accent || '#c8ff45');
    entry.style.setProperty('--delay', `${Math.min(index, 10) * 34}ms`);
    entry.classList.toggle('is-selected', shelfState.selected === app.slug);

    select.dataset.slug = app.slug;
    select.setAttribute('aria-label', `View ${app.name} details`);
    favorite.dataset.slug = app.slug;
    favorite.setAttribute('aria-label', isFavorite(app.slug) ? `Remove ${app.name} from saved applications` : `Save ${app.name}`);
    favorite.setAttribute('aria-pressed', String(isFavorite(app.slug)));
    favorite.textContent = isFavorite(app.slug) ? '★' : '☆';
    open.dataset.slug = app.slug;
    open.href = app.path;
    open.setAttribute('aria-label', `Open ${app.name}`);

    fragment.querySelector('.app-entry__name').textContent = app.name;
    fragment.querySelector('.app-entry__status').textContent = app.status === 'experimental' ? 'lab' : app.status;
    fragment.querySelector('.app-entry__description').textContent = app.description;

    const cacheLabel = offlineReady.has(app.slug) ? 'offline ready' : 'not cached';
    fragment.querySelector('.app-entry__meta').textContent = [
      `v${app.version}`,
      app.updatedAt,
      cacheLabel,
      ...(app.tags || []).slice(0, 2)
    ].filter(Boolean).join(' / ');

    configurePreview(preview, app);
    list.append(fragment);
  });

  observeListPreviews();
}

function selectedApp() {
  return registry.find((app) => app.slug === shelfState.selected) || null;
}

function installInstruction() {
  if (getDisplayMode() === 'standalone') return 'This shelf is already running as a standalone application.';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS
    ? 'Install independently: open the application, then use Safari Share → Add to Home Screen.'
    : 'Install independently from the application page using your browser’s install action.';
}

function renderDetail(app) {
  if (!app) {
    detailEmpty.hidden = false;
    detailContent.hidden = true;
    detailPanel.style.removeProperty('--detail-accent');
    if (!mobilePanelQuery.matches) detailPanel.setAttribute('aria-hidden', 'true');
    syncDetailPreviewMotion();
    return;
  }

  detailEmpty.hidden = true;
  detailContent.hidden = false;
  detailPanel.style.setProperty('--detail-accent', app.accent || '#c8ff45');
  detailKicker.textContent = `${app.status} / ${app.preset || 'application'}`;
  detailName.textContent = app.name;
  detailDescription.textContent = app.description;
  detailVersion.textContent = `v${app.version}`;
  detailUpdated.textContent = formatDate(app.updatedAt);
  detailOffline.textContent = offlineReady.has(app.slug) ? 'ready' : 'open once';
  detailOpened.textContent = formatRecent(recentTimestamp(app.slug));
  detailOpen.href = app.path;
  detailOpen.dataset.slug = app.slug;
  detailFavorite.dataset.slug = app.slug;
  detailFavorite.setAttribute('aria-pressed', String(isFavorite(app.slug)));
  detailFavorite.textContent = isFavorite(app.slug) ? 'Remove from saved' : 'Save to shelf';
  detailCopy.dataset.slug = app.slug;
  installNote.textContent = installInstruction();

  detailTags.replaceChildren();
  for (const tag of [app.status, app.preset, ...(app.tags || [])].filter(Boolean)) {
    const element = document.createElement('span');
    element.textContent = tag;
    detailTags.append(element);
  }

  detailChangelog.replaceChildren();
  const notes = app.changelog.length > 0 ? app.changelog : ['No release notes were supplied for this build.'];
  for (const note of notes.slice(0, 5)) {
    const item = document.createElement('li');
    item.textContent = note;
    detailChangelog.append(item);
  }

  configurePreview(detailPreview, app);
  if (!mobilePanelQuery.matches || panelOpen) detailPanel.setAttribute('aria-hidden', 'false');
  syncDetailPreviewMotion();
}

function runViewTransition(callback) {
  if (document.startViewTransition && !reducedMotionQuery.matches) {
    document.startViewTransition(callback);
  } else {
    callback();
  }
}

function renderShelf({ transition = false } = {}) {
  const render = () => {
    const apps = visibleApps();
    updateControlState(apps);
    renderApps(apps);
    renderDetail(selectedApp());
    updateSystemStatus();
  };

  if (transition) runViewTransition(render);
  else render();
}

function openDetailPanel() {
  if (!mobilePanelQuery.matches || !selectedApp()) return;
  panelOpen = true;
  lastFocusedElement = document.activeElement;
  detailBackdrop.hidden = false;
  requestAnimationFrame(() => {
    detailPanel.classList.add('is-open');
    detailBackdrop.classList.add('is-open');
  });
  detailPanel.setAttribute('aria-hidden', 'false');
  setDocumentScrollLocked(true);
  syncDetailPreviewMotion();
  window.setTimeout(() => detailClose.focus({ preventScroll: true }), reducedMotionQuery.matches ? 0 : 180);
}

function closeDetailPanel({ restoreFocus = true } = {}) {
  if (!mobilePanelQuery.matches) return;
  panelOpen = false;
  detailPanel.classList.remove('is-open');
  detailBackdrop.classList.remove('is-open');
  detailPanel.setAttribute('aria-hidden', 'true');
  setDocumentScrollLocked(false);
  syncDetailPreviewMotion();

  window.setTimeout(() => {
    if (!panelOpen) detailBackdrop.hidden = true;
  }, reducedMotionQuery.matches ? 0 : 230);

  if (restoreFocus && lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus({ preventScroll: true });
  }
}

function selectApp(slug, { openPanel = true } = {}) {
  const app = registry.find((item) => item.slug === slug);
  if (!app) return;
  shelfState.selected = slug;
  persistShelfState();
  renderShelf({ transition: true });
  if (openPanel) openDetailPanel();
}

async function copyAppLink(slug) {
  const app = registry.find((item) => item.slug === slug);
  if (!app) return;
  const url = new URL(app.path, window.location.href).href;

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  const original = detailCopy.textContent;
  detailCopy.textContent = 'Copied';
  navigator.vibrate?.(8);
  window.setTimeout(() => { detailCopy.textContent = original; }, 1300);
}

async function readOfflineReadiness() {
  if (!('caches' in window)) {
    offlineReady = new Set();
    return;
  }

  try {
    const cacheNames = await caches.keys();
    offlineReady = new Set(
      registry
        .filter((app) => cacheNames.some((cacheName) => cacheName.startsWith(`${app.slug}-`)))
        .map((app) => app.slug)
    );
  } catch (error) {
    console.warn('Pocket Works could not inspect application caches', error);
    offlineReady = new Set();
  }
}

async function loadRegistry({ manual = false } = {}) {
  refreshButton.disabled = true;
  refreshButton.textContent = manual ? 'Syncing…' : 'Reading…';
  syncStatus.textContent = navigator.onLine ? 'Syncing registry' : 'Reading saved registry';
  errorState.hidden = true;

  try {
    const response = await fetch(`./apps.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
    const apps = await response.json();
    if (!Array.isArray(apps)) throw new TypeError('apps.json must contain an array');

    registry = normalizeRegistry(apps);
    saveRegistrySnapshot(registry);
    lastSyncAt = Date.now();
    syncStatus.textContent = `Synced ${formatRecent(lastSyncAt)}`;
  } catch (error) {
    console.error(error);
    const snapshot = readRegistrySnapshot();

    if (snapshot) {
      registry = normalizeRegistry(snapshot.apps);
      lastSyncAt = snapshot.savedAt;
      errorState.hidden = false;
      errorCopy.textContent = 'Showing the last locally saved shelf. Search, favorites, recents and cached apps remain available.';
      syncStatus.textContent = `Saved shelf from ${formatRecent(snapshot.savedAt)}`;
    } else {
      registry = [];
      errorState.hidden = false;
      errorCopy.textContent = 'No locally saved shelf is available yet.';
      syncStatus.textContent = 'Registry unavailable';
    }
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Sync';
  }

  if (!registry.some((app) => app.slug === shelfState.selected)) {
    shelfState.selected = registry[0]?.slug || null;
    persistShelfState();
  }

  await readOfflineReadiness();
  renderShelf();
}

filterStrip.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  shelfState.filter = FILTERS.includes(button.dataset.filter) ? button.dataset.filter : 'all';
  persistShelfState();
  renderShelf({ transition: true });
});

searchInput.addEventListener('input', () => {
  shelfState.query = searchInput.value;
  renderShelf();
});

clearSearch.addEventListener('click', () => {
  shelfState.query = '';
  searchInput.value = '';
  searchInput.focus();
  renderShelf({ transition: true });
});

sortButton.addEventListener('click', () => {
  const currentIndex = SORTS.indexOf(shelfState.sort);
  shelfState.sort = SORTS[(currentIndex + 1) % SORTS.length];
  persistShelfState();
  renderShelf({ transition: true });
});

refreshButton.addEventListener('click', () => loadRegistry({ manual: true }));

list.addEventListener('click', (event) => {
  const favorite = event.target.closest('[data-action="favorite"]');
  if (favorite) {
    toggleFavorite(favorite.dataset.slug);
    return;
  }

  const details = event.target.closest('[data-action="details"]');
  if (details) {
    selectApp(details.dataset.slug);
    return;
  }

  const open = event.target.closest('[data-action="open"]');
  if (open) recordRecent(open.dataset.slug);
});

detailOpen.addEventListener('click', () => recordRecent(detailOpen.dataset.slug));
detailFavorite.addEventListener('click', () => toggleFavorite(detailFavorite.dataset.slug));
detailCopy.addEventListener('click', () => copyAppLink(detailCopy.dataset.slug));
detailClose.addEventListener('click', () => closeDetailPanel());
detailBackdrop.addEventListener('click', () => closeDetailPanel());

resetShelf.addEventListener('click', () => {
  const selected = registry[0]?.slug || null;
  shelfState = { ...defaultShelfState(), selected };
  persistShelfState();
  closeDetailPanel({ restoreFocus: false });
  renderShelf({ transition: true });
  navigator.vibrate?.([8, 30, 8]);
});

window.addEventListener('online', () => {
  updateSystemStatus();
  loadRegistry();
}, { passive: true });

window.addEventListener('offline', () => {
  updateSystemStatus();
  syncStatus.textContent = lastSyncAt ? `Offline / shelf saved ${formatRecent(lastSyncAt)}` : 'Offline';
}, { passive: true });

window.addEventListener('appviewportchange', updateSystemStatus, { passive: true });
window.addEventListener('fullscreenchange', updateSystemStatus);

mobilePanelQuery.addEventListener('change', () => {
  if (!mobilePanelQuery.matches) {
    panelOpen = false;
    detailPanel.classList.remove('is-open');
    detailBackdrop.classList.remove('is-open');
    detailBackdrop.hidden = true;
    setDocumentScrollLocked(false);
    detailPanel.setAttribute('aria-hidden', selectedApp() ? 'false' : 'true');
  } else {
    detailPanel.setAttribute('aria-hidden', panelOpen ? 'false' : 'true');
  }
  syncDetailPreviewMotion();
});

document.addEventListener('visibilitychange', async () => {
  body.classList.toggle('is-document-hidden', document.hidden);
  syncDetailPreviewMotion();

  if (!document.hidden) {
    await readOfflineReadiness();
    renderShelf();
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;

  if ((event.key === '/' && !typing) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (event.key === 'Escape') {
    if (panelOpen) {
      closeDetailPanel();
    } else if (shelfState.query) {
      shelfState.query = '';
      searchInput.value = '';
      renderShelf({ transition: true });
    }
  }
});

updateSystemStatus();
loadRegistry();
