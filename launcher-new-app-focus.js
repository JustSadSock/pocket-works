(() => {
  'use strict';

  const REGISTRY_KEY = 'pocket-works:registry:v1';
  const SHELF_KEY = 'pocket-works:shelf:v1';
  const previousSnapshot = readJson(REGISTRY_KEY);
  const previousSlugs = new Set(
    Array.isArray(previousSnapshot?.apps)
      ? previousSnapshot.apps.map((app) => app?.slug).filter(Boolean)
      : []
  );

  // A missing snapshot means this is a first launch, not a newly added app.
  if (previousSlugs.size === 0) return;

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (Date.now() - startedAt > 12000) {
      window.clearInterval(timer);
      return;
    }

    const currentSnapshot = readJson(REGISTRY_KEY);
    if (!Array.isArray(currentSnapshot?.apps)) return;

    const additions = currentSnapshot.apps
      .filter((app) => app?.slug && !previousSlugs.has(app.slug))
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

    if (additions.length === 0) return;
    window.clearInterval(timer);
    reveal(additions[0].slug);
  }, 120);

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  function reveal(slug) {
    const shelf = readJson(SHELF_KEY) || {};
    try {
      localStorage.setItem(SHELF_KEY, JSON.stringify({
        ...shelf,
        filter: 'all',
        selected: slug
      }));
    } catch {}

    const search = document.querySelector('#app-search');
    if (search && search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const allFilter = document.querySelector('#filter-strip [data-filter="all"]');
    allFilter?.click();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const entry = [...document.querySelectorAll('.app-entry[data-slug]')]
        .find((element) => element.dataset.slug === slug);
      entry?.querySelector('.app-entry__select')?.click();
      entry?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }
})();
