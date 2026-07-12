import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

const APP_VERSION = '0.1.0';
const STORAGE_NAMESPACE = 'pocket-works:doctrina';

installMobileRuntime();

const store = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: { game: null },
  validate(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
});

window.__POCKET_DOCTRINA_STORE__ = store;

try {
  await import('./game-loader.js');
} catch (error) {
  console.error('DOCTRINA failed to initialise', error);
  const root = document.querySelector('#app');
  if (root) {
    root.innerHTML = `
      <main class="fatal-state app-shell" data-app-shell>
        <a href="../../" data-app-control data-native-press>← Pocket Works</a>
        <small>КРИТИЧЕСКАЯ ОШИБКА</small>
        <h1>Симуляция не запустилась</h1>
        <p>Перезагрузите приложение или откройте Workshop Mode после следующего запуска.</p>
      </main>`;
  }
  throw error;
}

const workshop = createWorkshopMode({
  appName: 'ДОКТРИНА',
  version: APP_VERSION,
  cachePrefix: 'doctrina-',
  storageNamespace: 'pocket-works:doctrina',
  onReset() {
    store.reset();
    window.__DOCTRINA__?.reset?.();
  }
});

// The game menu is rendered after Workshop Mode initialises, so its trigger is dynamic.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest?.('[data-workshop-trigger]');
  if (trigger && !trigger.hidden) workshop.open();
});

const persist = () => window.__DOCTRINA__?.save?.();
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});
