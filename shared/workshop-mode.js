import { setDocumentScrollLocked } from './mobile-runtime.js';
import {
  clearOwnedCaches,
  clearOwnedStorage,
  collectDiagnostics,
  createErrorCollector,
  createFpsProbe,
  formatBytes
} from './capabilities/diagnostics.js';
import { copyText, downloadJson, serializeJson } from './capabilities/transfer.js';

function metric(label, value) {
  const item = document.createElement('div');
  item.className = 'workshop-mode__metric';
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = value;
  item.append(term, detail);
  return item;
}

function armDestructiveAction(button, action, readyLabel) {
  let armedUntil = 0;
  let timer = 0;
  const originalLabel = button.textContent;

  button.addEventListener('click', async () => {
    const now = Date.now();
    if (now > armedUntil) {
      armedUntil = now + 4000;
      button.textContent = readyLabel;
      button.dataset.armed = 'true';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        armedUntil = 0;
        button.textContent = originalLabel;
        delete button.dataset.armed;
      }, 4000);
      return;
    }

    window.clearTimeout(timer);
    armedUntil = 0;
    button.disabled = true;
    try {
      await action();
      button.textContent = 'Done';
    } catch (error) {
      button.textContent = 'Failed';
      console.warn('Workshop action failed', error);
    }
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalLabel;
      delete button.dataset.armed;
    }, 1200);
  });
}

export function createWorkshopMode(options = {}) {
  const {
    appName = document.title || 'Application',
    version = '',
    cachePrefix = '',
    storageNamespace = '',
    triggerSelector = '[data-workshop-trigger]',
    shortcut = true,
    onReset
  } = options;

  const releaseVersion = document.querySelector('script[data-update-manager]')?.dataset.appVersion || version;
  const controller = new AbortController();
  const signal = controller.signal;
  const fpsProbe = createFpsProbe();
  const errorCollector = createErrorCollector();
  let lastFocused = null;
  let refreshTimer = 0;
  let currentReport = null;

  const root = document.createElement('section');
  root.className = 'workshop-mode';
  root.dataset.workshopMode = '';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <button class="workshop-mode__backdrop" type="button" aria-label="Close Workshop Mode" data-workshop-close></button>
    <div class="workshop-mode__panel" role="dialog" aria-modal="true" aria-labelledby="workshop-title" tabindex="-1">
      <header class="workshop-mode__header">
        <div>
          <p>WORKSHOP MODE</p>
          <h2 id="workshop-title"></h2>
        </div>
        <button class="workshop-mode__close" type="button" data-workshop-close data-native-press aria-label="Close">×</button>
      </header>
      <div class="workshop-mode__status" aria-live="polite">Collecting runtime data…</div>
      <dl class="workshop-mode__metrics" data-workshop-metrics></dl>
      <section class="workshop-mode__errors" aria-labelledby="workshop-errors-title">
        <div class="workshop-mode__section-head">
          <h3 id="workshop-errors-title">Captured errors</h3>
          <button type="button" data-workshop-clear-errors>Clear</button>
        </div>
        <ol data-workshop-errors></ol>
      </section>
      <div class="workshop-mode__actions">
        <button type="button" data-workshop-refresh data-native-press>Refresh</button>
        <button type="button" data-workshop-copy data-native-press>Copy report</button>
        <button type="button" data-workshop-export data-native-press>Export JSON</button>
        <button type="button" data-workshop-clear-cache data-native-press>Clear app cache</button>
        <button type="button" data-workshop-reset data-native-press>Reset app data</button>
      </div>
      <footer>Ctrl/⌘ + Shift + W · app-owned data only</footer>
    </div>
  `;

  root.querySelector('#workshop-title').textContent = `${appName}${releaseVersion ? ` · ${releaseVersion}` : ''}`;
  const panel = root.querySelector('.workshop-mode__panel');
  const status = root.querySelector('.workshop-mode__status');
  const metrics = root.querySelector('[data-workshop-metrics]');
  const errorList = root.querySelector('[data-workshop-errors]');

  const render = async () => {
    currentReport = await collectDiagnostics({
      appName,
      version: releaseVersion,
      cachePrefix,
      storageNamespace,
      fps: fpsProbe.value,
      errors: errorCollector.list()
    });

    const { runtime, serviceWorker, storage, caches, errors } = currentReport;
    metrics.replaceChildren(
      metric('Viewport', `${runtime.viewport.width} × ${runtime.viewport.height}`),
      metric('DPR', String(runtime.dpr)),
      metric('FPS', String(runtime.fps || '—')),
      metric('Mode', runtime.displayMode),
      metric('Network', runtime.online ? 'online' : 'offline'),
      metric('Orientation', runtime.orientation),
      metric('Worker', serviceWorker.waiting ? 'waiting' : serviceWorker.state),
      metric('App storage', formatBytes(storage.appBytes)),
      metric('Owned caches', String(caches.length)),
      metric('Errors', String(errors.length))
    );

    errorList.replaceChildren();
    if (errors.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = 'No captured runtime errors.';
      errorList.append(empty);
    } else {
      for (const error of errors.slice(0, 8)) {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        const message = document.createElement('span');
        const time = document.createElement('time');
        name.textContent = `${error.source} · ${error.name}`;
        message.textContent = error.message;
        time.textContent = new Date(error.time).toLocaleTimeString();
        item.append(name, message, time);
        errorList.append(item);
      }
    }

    status.textContent = `Updated ${new Date().toLocaleTimeString()} · ${storage.keys.length} storage key${storage.keys.length === 1 ? '' : 's'}`;
    return currentReport;
  };

  const open = async () => {
    if (root.classList.contains('is-open')) return;
    lastFocused = document.activeElement;
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    setDocumentScrollLocked(true);
    fpsProbe.start();
    await render();
    panel.focus({ preventScroll: true });
    refreshTimer = window.setInterval(render, 1500);
    window.dispatchEvent(new CustomEvent('workshopopen'));
  };

  const close = () => {
    if (!root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    window.clearInterval(refreshTimer);
    fpsProbe.stop();
    setDocumentScrollLocked(false);
    lastFocused?.focus?.({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('workshopclose'));
  };

  root.querySelectorAll('[data-workshop-close]').forEach((button) => {
    button.addEventListener('click', close, { signal });
  });

  root.querySelector('[data-workshop-refresh]').addEventListener('click', render, { signal });
  root.querySelector('[data-workshop-copy]').addEventListener('click', async (event) => {
    await render();
    const copied = await copyText(serializeJson(currentReport));
    event.currentTarget.textContent = copied ? 'Copied' : 'Copy failed';
    window.setTimeout(() => { event.currentTarget.textContent = 'Copy report'; }, 1100);
  }, { signal });
  root.querySelector('[data-workshop-export]').addEventListener('click', async () => {
    await render();
    downloadJson(currentReport, `${appName}-${releaseVersion || 'diagnostics'}-report.json`);
  }, { signal });
  root.querySelector('[data-workshop-clear-errors]').addEventListener('click', () => {
    errorCollector.clear();
    render();
  }, { signal });

  armDestructiveAction(
    root.querySelector('[data-workshop-clear-cache]'),
    async () => {
      await clearOwnedCaches(cachePrefix);
      await render();
    },
    'Tap again to clear'
  );

  armDestructiveAction(
    root.querySelector('[data-workshop-reset]'),
    async () => {
      clearOwnedStorage(storageNamespace);
      await onReset?.();
      await render();
    },
    'Tap again to reset'
  );

  document.querySelectorAll(triggerSelector).forEach((trigger) => {
    trigger.addEventListener('click', open, { signal });
  });

  if (shortcut) {
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        root.classList.contains('is-open') ? close() : open();
      }
      if (event.key === 'Escape' && root.classList.contains('is-open')) close();
    }, { signal });
  }

  document.body.append(root);

  return {
    open,
    close,
    refresh: render,
    recordError: errorCollector.record,
    getReport: () => currentReport,
    destroy() {
      close();
      controller.abort();
      errorCollector.destroy();
      fpsProbe.stop();
      root.remove();
    }
  };
}
