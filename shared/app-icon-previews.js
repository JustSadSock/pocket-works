const REGISTRY_URL = './apps.json';
const SHELF_STATE_KEY = 'pocket-works:shelf:v1';

let registryBySlug = new Map();

function iconUrl(app) {
  return new URL(`${app.path}icons/icon.svg?v=${encodeURIComponent(app.version || '0')}`, document.baseURI).href;
}

function applyIcon(preview, app) {
  if (!preview || !app) return;
  preview.classList.add('has-app-icon');
  preview.dataset.iconSlug = app.slug;
  preview.style.setProperty('--app-icon-image', `url("${iconUrl(app)}")`);
}

function selectedSlug() {
  const explicit = document.querySelector('#detail-open')?.dataset.slug;
  if (explicit) return explicit;

  try {
    const state = JSON.parse(localStorage.getItem(SHELF_STATE_KEY) || '{}');
    return typeof state.selected === 'string' ? state.selected : null;
  } catch {
    return null;
  }
}

function refreshCardIcons() {
  for (const entry of document.querySelectorAll('.app-entry[data-slug]')) {
    const app = registryBySlug.get(entry.dataset.slug);
    applyIcon(entry.querySelector('.app-preview'), app);
  }
}

function refreshDetailIcon() {
  const app = registryBySlug.get(selectedSlug());
  applyIcon(document.querySelector('#detail-preview'), app);
}

function refreshAllIcons() {
  refreshCardIcons();
  refreshDetailIcon();
}

async function loadRegistry() {
  const response = await fetch(`${REGISTRY_URL}?icon-previews=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Icon registry request failed: ${response.status}`);
  const apps = await response.json();
  registryBySlug = new Map(apps.map((app) => [app.slug, app]));
}

async function startIconPreviews() {
  try {
    await loadRegistry();
  } catch (error) {
    console.warn('Pocket Works could not load application icons', error);
    return;
  }

  const list = document.querySelector('#app-list');
  const detail = document.querySelector('#detail-content');

  new MutationObserver(refreshCardIcons).observe(list, { childList: true, subtree: true });
  new MutationObserver(refreshDetailIcon).observe(detail, { childList: true, subtree: true, attributes: true });

  document.addEventListener('click', () => requestAnimationFrame(refreshDetailIcon), { passive: true });
  refreshAllIcons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startIconPreviews, { once: true });
} else {
  startIconPreviews();
}
