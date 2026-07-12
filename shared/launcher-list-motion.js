const root = document.documentElement;
const list = document.querySelector('#app-list');
const detailUpdated = document.querySelector('#detail-updated');
const detailOpen = document.querySelector('#detail-open');
const detailName = document.querySelector('#detail-name');
const detailContent = document.querySelector('#detail-content');
const searchInput = document.querySelector('#app-search');
const count = document.querySelector('#app-count');
const networkStatus = document.querySelector('#network-status');
const syncStatus = document.querySelector('#sync-status');
const refreshButton = document.querySelector('#refresh-button');
const sortButton = document.querySelector('#sort-button');
const resetShelf = document.querySelector('#reset-shelf');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const registryCacheKey = 'pocket-works:registry:v1';

if (list) {
  root.classList.add('has-launcher-list-motion');

  let registryBySlug = new Map();
  let previousRects = new Map();
  let pendingReason = null;
  let pendingCapturedAt = 0;
  let pendingTimeout = 0;
  let firstRenderHandled = list.childElementCount > 0;
  let animationGeneration = 0;
  let rafOne = 0;
  let rafTwo = 0;
  let resetConfirmTimer = 0;
  const activeAnimations = new Set();

  const toast = document.createElement('div');
  toast.className = 'launcher-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  document.body.append(toast);

  function showToast(message, tone = 'default') {
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.remove('is-visible');
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 1900);
  }

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

  function cancelScheduledFrames() {
    cancelAnimationFrame(rafOne);
    cancelAnimationFrame(rafTwo);
    rafOne = 0;
    rafTwo = 0;
  }

  function cancelActiveAnimations() {
    animationGeneration += 1;
    for (const animation of activeAnimations) {
      try {
        animation.cancel();
      } catch {
        // A finished animation may already be detached.
      }
    }
    activeAnimations.clear();
    for (const entry of list.querySelectorAll('.app-entry')) {
      for (const animation of entry.getAnimations?.() || []) animation.cancel();
    }
    list.style.removeProperty('height');
    list.style.removeProperty('overflow');
    list.classList.remove('is-list-animating');
  }

  function finishListMotion(delay = 0) {
    window.setTimeout(() => {
      list.classList.remove('is-list-syncing', 'is-list-animating');
      root.classList.remove('is-list-motion-pending');
    }, delay);
  }

  function clearPendingMotion({ cancelAnimations = false } = {}) {
    window.clearTimeout(pendingTimeout);
    cancelScheduledFrames();
    if (cancelAnimations) cancelActiveAnimations();
    previousRects.clear();
    pendingReason = null;
    pendingCapturedAt = 0;
    list.classList.remove('is-list-syncing', 'is-list-animating');
    root.classList.remove('is-list-motion-pending');
  }

  function captureLayout(reason) {
    if (!firstRenderHandled || document.hidden || reducedMotion.matches || pendingReason) return;

    cancelActiveAnimations();
    previousRects = new Map(
      [...list.querySelectorAll('.app-entry[data-slug]')]
        .map((entry) => [entry.dataset.slug, entry.getBoundingClientRect()])
        .filter(([, rect]) => rect.width > 0 && rect.height > 0)
    );

    pendingReason = reason;
    pendingCapturedAt = performance.now();
    root.classList.add('is-list-motion-pending');

    if (reason === 'refresh') {
      list.classList.add('is-list-syncing');
      refreshRegistry();
    }

    window.clearTimeout(pendingTimeout);
    pendingTimeout = window.setTimeout(() => clearPendingMotion(), 2500);
  }

  function trackAnimation(animation) {
    activeAnimations.add(animation);
    animation.finished.then(
      () => activeAnimations.delete(animation),
      () => activeAnimations.delete(animation)
    );
    return animation;
  }

  function revealInitialEntries() {
    patchReleaseTimes();
    if (reducedMotion.matches || document.hidden || typeof list.animate !== 'function') return;

    const entries = [...list.querySelectorAll('.app-entry[data-slug]')];
    list.classList.add('is-list-animating');
    const animations = entries.map((entry, index) => trackAnimation(entry.animate(
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      {
        duration: 330,
        delay: Math.min(index, 8) * 34,
        easing: 'cubic-bezier(.22,.82,.24,1)'
      }
    )));
    Promise.allSettled(animations.map((animation) => animation.finished))
      .then(() => list.classList.remove('is-list-animating'));
  }

  function animateListUpdate() {
    patchReleaseTimes();

    const reason = pendingReason;
    const capturedAt = pendingCapturedAt;
    const oldRects = new Map(previousRects);
    clearPendingMotion();

    if (
      !reason
      || reducedMotion.matches
      || document.hidden
      || typeof list.animate !== 'function'
      || performance.now() - capturedAt > 3000
    ) {
      return;
    }

    const generation = ++animationGeneration;
    const entries = [...list.querySelectorAll('.app-entry[data-slug]')];
    const duration = reason === 'refresh' ? 420 : 350;
    const easing = 'cubic-bezier(.22,.82,.24,1)';
    const animations = [];

    list.classList.add('is-list-animating');
    if (reason === 'refresh') list.classList.add('is-list-syncing');

    entries.forEach((entry, index) => {
      const previous = oldRects.get(entry.dataset.slug);
      const next = entry.getBoundingClientRect();
      const delay = Math.min(index, 9) * 18;

      if (previous) {
        const deltaX = previous.left - next.left;
        const deltaY = previous.top - next.top;
        const moved = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
        if (moved) {
          animations.push(trackAnimation(entry.animate(
            [
              { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: .78 },
              { transform: 'translate3d(0, 0, 0)', opacity: 1 }
            ],
            { duration, delay, easing }
          )));
        } else if (reason === 'refresh') {
          animations.push(trackAnimation(entry.animate(
            [
              { opacity: .68 },
              { opacity: 1 }
            ],
            { duration: 260, delay, easing: 'ease-out' }
          )));
        }
        return;
      }

      animations.push(trackAnimation(entry.animate(
        [
          { transform: 'translate3d(0, 14px, 0)', opacity: 0 },
          { transform: 'translate3d(0, 0, 0)', opacity: 1 }
        ],
        { duration: duration + 40, delay, easing }
      )));
    });

    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (generation !== animationGeneration) return;
      finishListMotion(reason === 'refresh' ? 140 : 0);
    });
  }

  function scheduleAnimation() {
    cancelScheduledFrames();

    if (!firstRenderHandled) {
      firstRenderHandled = true;
      rafOne = requestAnimationFrame(() => {
        rafTwo = requestAnimationFrame(revealInitialEntries);
      });
      return;
    }

    if (!pendingReason) {
      patchReleaseTimes();
      return;
    }

    rafOne = requestAnimationFrame(() => {
      rafTwo = requestAnimationFrame(animateListUpdate);
    });
  }

  function reasonForControl(control) {
    if (control.id === 'refresh-button') return 'refresh';
    if (control.matches('[data-filter]')) return 'filter';
    if (control.id === 'sort-button') return 'sort';
    if (control.id === 'clear-search') return 'search';
    if (control.matches('[data-action="favorite"], #detail-favorite')) return 'favorite';
    if (control.id === 'reset-shelf') return 'reset';
    return 'control';
  }

  function captureControlLayout(event) {
    const control = event.target.closest?.(
      '[data-filter], #sort-button, #refresh-button, #clear-search, [data-action="favorite"], #detail-favorite, #reset-shelf'
    );
    if (!control) return;
    captureLayout(reasonForControl(control));
  }

  function animateTextChange(element) {
    if (!element || reducedMotion.matches || typeof element.animate !== 'function') return;
    trackAnimation(element.animate(
      [
        { opacity: .35, transform: 'translateY(-3px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }
    ));
  }

  function syncSearchState() {
    document.querySelector('.search-field')?.classList.toggle('has-value', Boolean(searchInput?.value));
  }

  function clearResetConfirmation() {
    window.clearTimeout(resetConfirmTimer);
    if (!resetShelf?.dataset.confirming) return;
    delete resetShelf.dataset.confirming;
    resetShelf.classList.remove('is-confirming');
    resetShelf.textContent = 'Reset personal shelf';
    resetShelf.setAttribute('aria-label', 'Reset personal shelf');
  }

  function installControlPolish() {
    syncStatus?.setAttribute('aria-live', 'polite');
    refreshButton?.setAttribute('aria-controls', 'app-list');
    sortButton?.setAttribute('aria-controls', 'app-list');

    for (const button of document.querySelectorAll('[data-filter]')) {
      button.setAttribute('aria-controls', 'app-list');
      button.dataset.haptic = 'selection';
    }
    for (const control of document.querySelectorAll('[data-native-press]')) {
      control.dataset.interactionReady = 'true';
    }

    searchInput?.addEventListener('input', syncSearchState, { passive: true });
    syncSearchState();

    document.addEventListener('click', (event) => {
      const control = event.target.closest?.('[data-filter], #sort-button, #refresh-button, #detail-copy, [data-action="favorite"], #detail-favorite');
      if (!control) return;

      if (control.matches('[data-filter]')) {
        requestAnimationFrame(() => animateTextChange(control.querySelector('[data-filter-count]')));
      }

      if (control.id === 'sort-button') {
        requestAnimationFrame(() => {
          sortButton.setAttribute('aria-label', `Change application sort order. Current: ${sortButton.textContent}`);
          animateTextChange(sortButton);
        });
      }

      if (control.id === 'refresh-button') {
        refreshButton.classList.add('is-busy');
        refreshButton.setAttribute('aria-busy', 'true');
      }

      if (control.id === 'detail-copy') {
        window.setTimeout(() => showToast('Application link copied'), 60);
      }

      if (control.matches('[data-action="favorite"], #detail-favorite')) {
        window.setTimeout(() => {
          const favorite = document.querySelector(`[data-action="favorite"][data-slug="${control.dataset.slug}"]`);
          const pressed = favorite?.getAttribute('aria-pressed') === 'true';
          showToast(pressed ? 'Saved to shelf' : 'Shelf updated');
        }, 100);
      }
    });

    document.addEventListener('click', (event) => {
      const control = event.target.closest?.('#reset-shelf');
      if (!control) return;

      if (control.dataset.confirming !== 'true') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        control.dataset.confirming = 'true';
        control.classList.add('is-confirming');
        control.textContent = 'Press again to reset';
        control.setAttribute('aria-label', 'Press again to confirm shelf reset');
        showToast('Reset armed. Press once more to confirm.', 'warning');
        resetConfirmTimer = window.setTimeout(clearResetConfirmation, 2600);
        return;
      }

      clearResetConfirmation();
      window.setTimeout(() => showToast('Personal shelf reset'), 80);
    }, { capture: true });

    const refreshObserver = new MutationObserver(() => {
      if (!refreshButton) return;
      const done = !refreshButton.disabled && refreshButton.textContent.trim() === 'Sync';
      if (!done) return;
      window.setTimeout(() => {
        refreshButton.classList.remove('is-busy');
        refreshButton.removeAttribute('aria-busy');
      }, 180);
    });
    if (refreshButton) refreshObserver.observe(refreshButton, { attributes: true, childList: true, characterData: true, subtree: true });

    const countObserver = new MutationObserver(() => animateTextChange(count));
    if (count) countObserver.observe(count, { childList: true, characterData: true, subtree: true });

    const statusObserver = new MutationObserver(() => {
      animateTextChange(networkStatus);
      animateTextChange(syncStatus);
    });
    if (networkStatus) statusObserver.observe(networkStatus, { childList: true, characterData: true, subtree: true });
    if (syncStatus) statusObserver.observe(syncStatus, { childList: true, characterData: true, subtree: true });

    const detailObserver = new MutationObserver(() => {
      patchReleaseTimes();
      if (!detailContent || detailContent.hidden || reducedMotion.matches) return;
      trackAnimation(detailContent.animate(
        [
          { opacity: .72, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        { duration: 280, easing: 'cubic-bezier(.22,.82,.24,1)' }
      ));
    });
    if (detailName) detailObserver.observe(detailName, { childList: true, characterData: true, subtree: true });

    root.classList.add('is-launcher-ui-ready');
  }

  document.addEventListener('click', captureControlLayout, { capture: true });
  searchInput?.addEventListener('beforeinput', () => captureLayout('search'), { capture: true });

  new MutationObserver(scheduleAnimation).observe(list, { childList: true });

  window.addEventListener('pageshow', (event) => {
    clearPendingMotion({ cancelAnimations: true });
    firstRenderHandled = list.childElementCount > 0;
    patchReleaseTimes();
    if (event.persisted) requestAnimationFrame(() => list.getBoundingClientRect());
  }, { passive: true });

  window.addEventListener('pagehide', () => clearPendingMotion({ cancelAnimations: true }), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearPendingMotion({ cancelAnimations: true });
  });

  readSavedRegistry();
  refreshRegistry();
  patchReleaseTimes();
  installControlPolish();
}
