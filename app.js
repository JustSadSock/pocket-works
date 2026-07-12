// serviceWorker.register('./sw.js') is owned by shared/update-manager.js.
const list = document.querySelector('#app-list');
const emptyState = document.querySelector('#empty-state');
const errorState = document.querySelector('#error-state');
const count = document.querySelector('#app-count');
const refreshButton = document.querySelector('#refresh-button');
const template = document.querySelector('#app-card-template');

function renderApps(apps) {
  list.replaceChildren();
  count.textContent = String(apps.length);
  emptyState.hidden = apps.length !== 0;
  errorState.hidden = true;

  apps.forEach((app, index) => {
    const fragment = template.content.cloneNode(true);
    const link = fragment.querySelector('.app-entry__link');
    const tags = fragment.querySelector('.app-entry__tags');

    link.href = app.path;
    link.style.setProperty('--entry-accent', app.accent || '#c8ff45');
    fragment.querySelector('.app-entry__index').textContent = String(index + 1).padStart(2, '0');
    fragment.querySelector('.app-entry__name').textContent = app.name;
    fragment.querySelector('.app-entry__description').textContent = app.description;
    tags.textContent = [app.status, `v${app.version}`, app.updatedAt, ...(app.tags || [])].filter(Boolean).join(' · ');

    list.append(fragment);
  });
}

async function loadRegistry() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Reading…';

  try {
    const response = await fetch(`./apps.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);

    const apps = await response.json();
    if (!Array.isArray(apps)) throw new TypeError('apps.json must contain an array');

    renderApps(apps.filter((app) => app.status !== 'archived'));
  } catch (error) {
    console.error(error);
    list.replaceChildren();
    count.textContent = '0';
    emptyState.hidden = true;
    errorState.hidden = false;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh registry';
  }
}

refreshButton.addEventListener('click', loadRegistry);
loadRegistry();
