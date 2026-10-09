import {
  installMobileRuntime,
  setDocumentScrollLocked
} from './shared/mobile-runtime.js';

import { loadRegistry as fetchRegistry, getRegistrySnapshot, setRegistrySnapshot, subscribeRegistry } from './shared/launcher-registry.js';
import { reconcileKeyed, setText } from './shared/launcher-dom-reconcile.js';
import { inspectOfflineReadiness } from './shared/offline-readiness.js';
import { createShelfStateStore } from './shared/shelf-state.js';
import { installShelfTools } from './shared/shell-tools.js';
import { installPocketDeck } from './shared/pocket-deck.js';

installMobileRuntime();


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
const launchStage = document.querySelector('#launch-stage');
const launchObject = launchStage?.querySelector('.launch-stage__object');
const launchName = launchStage?.querySelector('.launch-stage__object strong');

let registry = [];
let offlineReady = new Set();
let offlineStates = new Map();
let offlineAuditGeneration = 0;
let panelOpen = false;
let lastFocusedElement = null;
let lastSyncAt = null;
let launchInProgress = false;
let deck = null;

function defaultShelfState() {
  return { favorites: [], recents: {}, filter: 'all', sort: 'updated', selected: null, query: '' };
}

let shelfState;
let shelfCanRender = false;
let shelfSavePending = false;
const shelfStore = createShelfStateStore({
  onState(next) {
    const query = shelfState?.query || '';
    shelfState = { ...next, query };
    if (shelfCanRender && !shelfSavePending) renderShelf();
  },
  onStatus(status) {
    const message = document.querySelector('#storage-status');
    if (message) {
      message.textContent = status.warning || (status.localOk && status.dbOk
        ? 'Personal shelf backed up on device'
        : status.localOk || status.dbOk ? 'Personal shelf saved' : 'Personal shelf storage unavailable');
      message.dataset.state = status.warning ? 'warning' : 'ready';
    }
  }
});
shelfState = shelfStore.get();

function persistShelfState() {
  shelfSavePending = true;
  const result = shelfStore.save(shelfState);
  shelfSavePending = false;
  return result;
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
  element.style.setProperty('--entry-accent', app.accent || '#c8a460');
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
  for (const preview of list.querySelectorAll('.app-preview:not([data-observed])')) {
    preview.dataset.observed = 'true';
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

function shouldUseNativeNavigation(event, link) {
  return event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || link?.target === '_blank'
    || link?.hasAttribute('download');
}

function launchApp(event, slug, link) {
  const app = registry.find((item) => item.slug === slug);
  if (!app || !link || shouldUseNativeNavigation(event, link)) {
    if (app) recordRecent(app.slug);
    return;
  }

  event.preventDefault();
  if (launchInProgress) return;
  launchInProgress = true;
  recordRecent(app.slug);

  try {
    sessionStorage.setItem('pocket-works:return-object', app.slug);
    sessionStorage.setItem('pocket-works:return-deck-view', deck?.getView() || 'library');
    sessionStorage.setItem('pocket-works:return-scroll', String(window.scrollY));
  } catch {
    // Spatial continuity is an enhancement; navigation must always work.
  }

  if (!launchStage || reducedMotionQuery.matches) {
    window.location.assign(link.href);
    return;
  }

  const sourcePreview = link.closest('.app-entry')?.querySelector('.app-preview') || link.closest('.deck-tile')?.querySelector('.deck-art') || detailPreview;
  const sourcePhoto = sourcePreview?.querySelector('.deck-art__photo, .deck-cover-photo');
  const coverUrl = sourcePhoto?.getAttribute('src');
  const iconImage = coverUrl ? `url("${new URL(coverUrl, document.baseURI).href}")`
    : sourcePreview?.style.getPropertyValue('--app-icon-image')
    || `url("${new URL(`${app.path}icons/icon.svg?v=${encodeURIComponent(app.version || '0')}`, document.baseURI).href}")`;
  const bounds = sourcePreview?.getBoundingClientRect();
  if (deck && bounds?.width > 0 && bounds?.height > 0) {
    launchStage.classList.add('deck-launch');
    launchStage.style.setProperty('--deck-launch-x', `${bounds.left + bounds.width / 2 - window.innerWidth / 2}px`);
    launchStage.style.setProperty('--deck-launch-y', `${bounds.top + bounds.height / 2 - window.innerHeight / 2}px`);
    launchStage.style.setProperty('--deck-launch-scale-x', String(bounds.width / 170));
    launchStage.style.setProperty('--deck-launch-scale-y', String(bounds.height / 170));
    launchStage.classList.toggle('deck-launch--cover', Boolean(coverUrl));
  }

  launchStage.style.setProperty('--launch-icon', iconImage);
  launchStage.style.setProperty('--launch-accent', app.accent || '#c8a460');
  if (launchName) launchName.textContent = app.name;
  launchStage.classList.add('is-launching');
  body.classList.add('is-launching-app');
  navigator.vibrate?.(10);

  window.setTimeout(() => window.location.assign(link.href), 515);
}

function restoreLibraryPosition() {
  let slug = null;
  let scrollY = 0;
  try {
    slug = sessionStorage.getItem('pocket-works:return-object');
    scrollY = Number(sessionStorage.getItem('pocket-works:return-scroll')) || 0;
    sessionStorage.removeItem('pocket-works:return-object');
    sessionStorage.removeItem('pocket-works:return-scroll');
  } catch {
    return;
  }

  if (!slug) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    const entry = list.querySelector(`.app-entry[data-slug="${CSS.escape(slug)}"]`);
    if (!entry || reducedMotionQuery.matches) return;
    entry.animate(
      [
        { transform: 'translateY(-10px) scale(1.018)', filter: 'brightness(1.13)' },
        { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' }
      ],
      { duration: 620, easing: 'cubic-bezier(.16,.78,.22,1)' }
    );
  });
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

function formatDate(value, compact = false) {
  if (!value) return 'unknown';
  const source = String(value);
  const hasTime = source.includes('T');
  const date = new Date(hasTime ? source : `${source}T12:00:00`);
  if (Number.isNaN(date.getTime())) return source;
  return new Intl.DateTimeFormat(undefined, {
    ...(compact ? {} : { year: 'numeric' }),
    month: 'short', day: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date);
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
  const view = deck?.getView() || 'library';
  const pool = view === 'home' ? registry : (deck?.getVisibleList() || registry);
  return pool
    .filter((app) => appMatchesQuery(app, query))
    .filter((app) => view === 'archive' || appMatchesFilter(app))
    .sort(compareApps);
}

function filterCounts() {
  const apps = deck ? registry.filter(app => !deck.getState().archived.includes(app.slug)) : registry;
  return {
    all: apps.length,
    favorites: apps.filter((app) => isFavorite(app.slug)).length,
    recent: apps.filter((app) => recentTimestamp(app.slug) > 0).length,
    offline: apps.filter((app) => offlineReady.has(app.slug)).length,
    experimental: apps.filter((app) => app.status === 'experimental').length
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

  if (searchInput.value !== shelfState.query) searchInput.value = shelfState.query;
  clearSearch.hidden = shelfState.query.length === 0;
  sortButton.dataset.sort = shelfState.sort;
  sortButton.textContent = SORT_LABELS[shelfState.sort];
  count.textContent = String(apps.length);

  const noun = apps.length === 1 ? 'object' : 'objects';
  const qualifier = shelfState.query ? ` matching “${shelfState.query}”` : '';
  resultSummary.textContent = `${apps.length} ${noun}${qualifier}`;
}

function createAppEntry() {
  const entry = template.content.firstElementChild.cloneNode(true);
  entry.pwParts = {
    select: entry.querySelector('.app-entry__select'),
    favorite: entry.querySelector('.app-entry__favorite'),
    open: entry.querySelector('.app-entry__open'),
    preview: entry.querySelector('.app-preview'),
    name: entry.querySelector('.app-entry__name'),
    status: entry.querySelector('.app-entry__status'),
    description: entry.querySelector('.app-entry__description'),
    meta: entry.querySelector('.app-entry__meta')
  };
  return entry;
}

function patchAppEntry(entry, app, index) {
  const p = entry.pwParts;
  entry.dataset.slug = app.slug;
  entry.style.setProperty('--entry-accent', app.accent || '#c8a460');
  entry.style.setProperty('--delay', `${Math.min(index, 10) * 34}ms`);
  entry.classList.toggle('is-selected', shelfState.selected === app.slug);

  p.select.dataset.slug = app.slug;
  p.select.setAttribute('aria-label', `View ${app.name} details`);
  p.favorite.dataset.slug = app.slug;
  p.favorite.setAttribute('aria-label', isFavorite(app.slug) ? `Remove ${app.name} from saved applications` : `Save ${app.name}`);
  p.favorite.setAttribute('aria-pressed', String(isFavorite(app.slug)));
  setText(p.favorite, isFavorite(app.slug) ? '★' : '☆');
  p.open.dataset.slug = app.slug;
  if (p.open.getAttribute('href') !== app.path) p.open.href = app.path;
  p.open.setAttribute('aria-label', `Open ${app.name}`);

  setText(p.name, app.name);
  setText(p.status, app.status === 'experimental' ? 'lab' : app.status);
  setText(p.description, app.description);
  const cacheState = offlineStates.get(app.slug)?.status;
  const cacheLabel = cacheState === 'ready' ? 'offline essentials cached' :
    cacheState === 'partial' ? 'partial cache' : 'not cached';
  const baseMeta = [
    `v${app.version}`, formatDate(app.updatedAt, true), cacheLabel,
    ...(app.tags || []).slice(0, 2)
  ].filter(Boolean).join(' / ');
  if (p.meta.dataset.pwBase !== baseMeta) {
    p.meta.dataset.pwBase = baseMeta;
    setText(p.meta, baseMeta);
  }
  if (p.preview.dataset.preset !== (app.preset || 'vanilla') ||
      p.preview.dataset.iconSlug !== app.slug) configurePreview(p.preview, app);
}

function renderApps(apps) {
  const inArchive = deck?.getView() === 'archive';
  emptyState.querySelector('strong').textContent = inArchive ? 'Nothing archived.' : 'Nothing on this shelf.';
  emptyState.querySelector('p').textContent = inArchive
    ? 'You can move unused experiments here from Library. Nothing gets deleted.'
    : 'Try another filter or clear the search.';
  emptyState.hidden = apps.length !== 0;
  reconcileKeyed(list, apps, {
    key: app => app.slug,
    create: createAppEntry,
    patch: patchAppEntry,
    remove: entry => previewObserver?.unobserve(entry.querySelector('.app-preview'))
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

let lastDetailSignature = '';
function renderDetail(app) {
  const signature = app ? JSON.stringify([
    app.slug, app.version, app.description, app.updatedAt, app.status, app.preset,
    app.accent, app.tags, app.changelog, isFavorite(app.slug),
    offlineStates.get(app.slug), recentTimestamp(app.slug), panelOpen
  ]) : 'empty';
  if (lastDetailSignature === signature) return;
  lastDetailSignature = signature;
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
  detailPanel.style.setProperty('--detail-accent', app.accent || '#c8a460');
  detailKicker.textContent = `${app.status} / ${app.preset || 'application'}`;
  detailName.textContent = app.name;
  detailDescription.textContent = app.description;
  detailVersion.textContent = `v${app.version}`;
  detailUpdated.textContent = formatDate(app.updatedAt);
  const offlineState = offlineStates.get(app.slug);
  detailOffline.textContent = offlineState?.status === 'ready' ? 'essentials cached' :
    offlineState?.status === 'partial' ? 'incomplete cache' : 'open online first';
  detailOffline.title = offlineState?.reason || 'Offline availability has not been verified';
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
    deck?.refresh();
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
  if (deck?.getView() === 'home') deck.setView('library');
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
  const generation = ++offlineAuditGeneration;
  const apps = [...registry];
  try {
    const report = await inspectOfflineReadiness(apps);
    if (generation !== offlineAuditGeneration) return;
    offlineStates = report;
    offlineReady = new Set(
      [...report].filter(([, result]) => result.status === 'ready').map(([slug]) => slug)
    );
  } catch (error) {
    if (generation !== offlineAuditGeneration) return;
    console.warn('Pocket Works could not inspect offline application resources', error);
    offlineStates = new Map();
    offlineReady = new Set();
  }
  // Avoid blocking first paint on CacheStorage enumeration and inspection.
  renderShelf();
}

async function loadRegistry({ manual = false } = {}) {
  refreshButton.disabled = true;
  refreshButton.textContent = manual ? 'Syncing…' : 'Reading…';
  syncStatus.textContent = navigator.onLine ? 'Syncing registry' : 'Reading saved registry';
  errorState.hidden = true;

  try {
    const live = await fetchRegistry({ force: manual });
    registry = normalizeRegistry(live.apps);
    lastSyncAt = live.savedAt;
    syncStatus.textContent = `Synced ${formatRecent(lastSyncAt)}`;
  } catch (error) {
    console.error(error);
    const snapshot = getRegistrySnapshot();
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
    refreshButton.textContent = 'Refresh';
  }

  if (!registry.some((app) => app.slug === shelfState.selected)) {
    shelfState.selected = registry[0]?.slug || null;
    persistShelfState();
  }

  renderShelf();
  void readOfflineReadiness();
}

async function applyExternalRegistrySnapshot(apps) {
  if (!Array.isArray(apps)) return false;

  const nextRegistry = normalizeRegistry(apps);
  if (apps.length > 0 && nextRegistry.length === 0) return false;

  registry = nextRegistry;
  lastSyncAt = Date.now();

  if (!registry.some((app) => app.slug === shelfState.selected)) {
    shelfState.selected = registry[0]?.slug || null;
    persistShelfState();
  }

  void readOfflineReadiness();
  syncStatus.textContent = `Synced ${formatRecent(lastSyncAt)}`;
  renderShelf({ transition: true });
  return true;
}

window.addEventListener('pocketworks:registry-snapshot', (event) => {
  if (!Array.isArray(event.detail?.apps)) return;
  try { setRegistrySnapshot(event.detail.apps, { source: event.detail.source || 'external' }); }
  catch (error) { console.warn('Pocket Works rejected a registry handoff', error); }
});

let launcherInitialized = false;
subscribeRegistry((snapshot) => {
  if (launcherInitialized) void applyExternalRegistrySnapshot(snapshot.apps);
});

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
  if (open) launchApp(event, open.dataset.slug, open);
});

detailOpen.addEventListener('click', (event) => launchApp(event, detailOpen.dataset.slug, detailOpen));
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
    void readOfflineReadiness();
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

deck = installPocketDeck({
  getApps: () => registry,
  getFavorites: () => shelfState.favorites,
  getRecents: () => shelfState.recents,
  getSelected: () => shelfState.selected,
  onViewChanged: () => {
    if (deck?.getView() !== 'library') shelfState.query = '';
    renderShelf();
  },
  onOpen: (event, slug, link) => launchApp(event, slug, link),
  onDetails: slug => selectApp(slug),
  onFavorite: slug => toggleFavorite(slug),
  onRefresh: () => loadRegistry({ manual: true }),
  onTools: () => document.querySelector('#shelf-tools-button')?.click()
});
installShelfTools({ store: shelfStore });
updateSystemStatus();
void shelfStore.hydrate();
window.addEventListener('storage', (event) => {
  if (event.key !== 'pocket-works:shelf:v2' || !event.newValue) return;
  try { shelfStore.acceptCrossTabRecord(JSON.parse(event.newValue)); }
  catch { /* another tab has malformed shelf data */ }
});
loadRegistry().then(() => {
  launcherInitialized = true;
  shelfCanRender = true;
  body.classList.add('is-library-ready');
  restoreLibraryPosition();
});
