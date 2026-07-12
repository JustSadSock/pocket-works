const root = document.documentElement;
const list = document.querySelector('#app-list');
const detailUpdated = document.querySelector('#detail-updated');
const detailOpen = document.querySelector('#detail-open');
const searchInput = document.querySelector('#app-search');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const registryCacheKey = 'pocket-works:registry:v1';

if (list) {
  root.classList.add('has-launcher-list-motion');

  let registryBySlug = new Map();
  let previousRects = new Map();
  let previousHeight = 0;
  let pendingReason = null;
  let animationFrame = 0;

  function normalizeRegistry(apps) {
    registryBySlug = new Map(
      (Array.isArray(apps) ? apps : [])
        .filter((app) => app && typeof app.slug === 'string')
        .map((app) => [app.slug, app])
    );
  }

  function readSavedRegistry() {
    try {
      const saved = JSON.parse(localStorage.getItem(registryCacheKey) || 'null');
      if (Array.isArray(saved?.apps)) normalizeRegistry(saved.apps);
    } catch {
      // A malformed cache should not affect the launcher.
    }
  }

  async function refreshRegistry() {
    try {
      const response = await fetch(`./apps.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      normalizeRegistry(await response.json());
      patchReleaseTimes();
    } catch {
      // The launcher itself handles offline registry fallbacks.
    }
  }

  function parseReleaseTime(value) {
    if (!value) return null;
    const source = String(value);
    const date = new Date(source.includes('T') ? source : `${source}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatReleaseTime(value, compact = false) {
    const date = parseReleaseTime(value);
    if (!date) return value || 'unknown';
    const hasTime = String(value).includes('T');
    const options = compact
      ? { month: 'short', day: 'numeric', ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) }
      : { year: 'numeric', month: 'short', day: 'numeric', ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) };
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function patchReleaseTimes() {
    for (const entry of list.querySelectorAll('.app-entry[data-slug]')) {
      const app = registryBySlug.get(entry.dataset.slug);
      const meta = entry.querySelector('.app-entry__meta');
      if (!app || !meta) continue;
      const cacheLabel = /offline ready/i.test(meta.textContent) ? 'offline ready' : 'not cached';
      meta.textContent = [
        `v${app.version}`,
        formatReleaseTime(app.updatedAt, true),
        cacheLabel,
        ...(Array.isArray(app.tags) ? app.tags.slice(0, 2) : [])
      ].filter(Boolean).join(' / ');
    }

    const selected = registryBySlug.get(detailOpen?.dataset.slug || '');
    if (selected && detailUpdated) detailUpdated.textContent = formatReleaseTime(selected.updatedAt);
  }

  function captureLayout(reason) {
    previousRects = new Map(
      [...list.querySelectorAll('.app-entry[data-slug]')]
        .map((entry) => [entry.dataset.slug, entry.getBoundingClientRect()])
    );
    previousHeight = list.getBoundingClientRect().height;
    pendingReason = reason;
    root.classList.add('is-list-motion-pending');
    if (reason === 'refresh') {
      list.classList.add('is-list-syncing');
      refreshRegistry();
    }
  }

  function finishListMotion(delay = 0) {
    window.setTimeout(() => {
      list.classList.remove('is-list-syncing');
      root.classList.remove('is-list-motion-pending');
    }, delay);
  }

  function animateListUpdate() {
    animationFrame = 0;
    patchReleaseTimes();

    const entries = [...list.querySelectorAll('.app-entry[data-slug]')];
    const reason = pendingReason;
    pendingReason = null;

    if (!reason || reducedMotion.matches || typeof list.animate !== 'function') {
      previousRects.clear();
      finishListMotion();
      return;
    }

    const nextHeight = list.getBoundingClientRect().height;
    const duration = reason === 'refresh' ? 460 : 380;
    const easing = 'cubic-bezier(.2,.82,.2,1)';

    if (Math.abs(nextHeight - previousHeight) > 1) {
      list.style.height = `${previousHeight}px`;
      list.style.overflow = 'clip';
      const heightAnimation = list.animate(
        [{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }],
        { duration, easing, fill: 'both' }
      );
      heightAnimation.finished.then(
        () => {
          list.style.removeProperty('height');
          list.style.removeProperty('overflow');
        },
        () => {
          list.style.removeProperty('height');
          list.style.removeProperty('overflow');
        }
      );
    }

    entries.forEach((entry, index) => {
      const previous = previousRects.get(entry.dataset.slug);
      const next = entry.getBoundingClientRect();
      const delay = Math.min(index, 10) * 22;

      if (previous) {
        const deltaX = previous.left - next.left;
        const deltaY = previous.top - next.top;
        const moved = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
        entry.animate(
          moved
            ? [
                { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: .72 },
                { transform: 'translate(0, 0)', opacity: 1 }
              ]
            : [
                { transform: 'scale(.992)', opacity: .62 },
                { transform: 'scale(1)', opacity: 1 }
              ],
          { duration, delay, easing, fill: 'both' }
        );
        return;
      }

      entry.animate(
        [
          { transform: 'translateY(18px) scale(.985)', opacity: 0, filter: 'blur(5px)' },
          { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'blur(0)' }
        ],
        { duration: duration + 60, delay, easing, fill: 'both' }
      );
    });

    previousRects.clear();
    finishListMotion(duration + 260);
  }

  function scheduleAnimation() {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(animateListUpdate);
  }

  function captureControlLayout(event) {
    const control = event.target.closest?.('[data-filter], #sort-button, #refresh-button, #clear-search, [data-action="favorite"], #reset-shelf');
    if (!control || pendingReason) return;
    captureLayout(control.id === 'refresh-button' ? 'refresh' : 'control');
  }

  document.addEventListener('pointerdown', captureControlLayout, { capture: true });
  document.addEventListener('click', captureControlLayout, { capture: true });
  searchInput?.addEventListener('beforeinput', () => {
    if (!pendingReason) captureLayout('search');
  }, { capture: true });

  new MutationObserver(scheduleAnimation).observe(list, { childList: true });

  readSavedRegistry();
  refreshRegistry();
  patchReleaseTimes();
}
