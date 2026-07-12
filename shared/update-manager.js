const DEFAULT_CHECK_INTERVAL = 30 * 60 * 1000;

function workerInfo(worker, timeout = 1200) {
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeout);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data || null);
    };

    worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]);
  });
}

function createUpdatePrompt({ appName, onApply, onDismiss }) {
  const existing = document.querySelector('[data-app-update-prompt]');
  if (existing) existing.remove();

  const prompt = document.createElement('aside');
  prompt.className = 'app-update-prompt';
  prompt.dataset.appUpdatePrompt = '';
  prompt.dataset.ui = '';
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'polite');
  prompt.innerHTML = `
    <div class="app-update-prompt__copy">
      <p class="app-update-prompt__eyebrow">UPDATE AVAILABLE</p>
      <strong class="app-update-prompt__title"></strong>
      <ul class="app-update-prompt__notes"></ul>
    </div>
    <div class="app-update-prompt__actions">
      <button type="button" data-update-dismiss data-native-press>Later</button>
      <button type="button" data-update-apply data-native-press>Update now</button>
    </div>
  `;

  const title = prompt.querySelector('.app-update-prompt__title');
  const notes = prompt.querySelector('.app-update-prompt__notes');
  const applyButton = prompt.querySelector('[data-update-apply]');

  prompt.show = (info = {}) => {
    const version = info.version ? ` ${info.version}` : '';
    title.textContent = `${appName}${version}`;
    notes.replaceChildren();

    const releaseNotes = Array.isArray(info.releaseNotes) && info.releaseNotes.length > 0
      ? info.releaseNotes
      : ['A newer application build is ready.'];

    for (const note of releaseNotes.slice(0, 4)) {
      const item = document.createElement('li');
      item.textContent = note;
      notes.append(item);
    }

    applyButton.disabled = false;
    applyButton.textContent = 'Update now';
    prompt.classList.remove('is-applying');
    prompt.classList.add('is-visible');
  };

  prompt.querySelector('[data-update-dismiss]').addEventListener('click', () => {
    prompt.classList.remove('is-visible');
    onDismiss?.();
  });

  applyButton.addEventListener('click', async () => {
    if (applyButton.disabled) return;
    applyButton.disabled = true;
    applyButton.textContent = 'Updating…';
    prompt.classList.add('is-applying');

    const applied = await onApply?.();
    if (applied) return;

    applyButton.disabled = false;
    applyButton.textContent = 'Try again';
    prompt.classList.remove('is-applying');
  });

  document.body.append(prompt);
  return prompt;
}

export async function registerManagedServiceWorker(options = {}) {
  if (!('serviceWorker' in navigator)) return null;

  const {
    path = './sw.js',
    appName = document.title || 'Application',
    currentVersion = '',
    checkInterval = DEFAULT_CHECK_INTERVAL,
    renderPrompt = true
  } = options;

  const registration = await navigator.serviceWorker.register(path);
  let waitingWorker = null;
  let waitingInfo = null;
  let applying = false;
  let prompt = null;
  let snoozedUntil = 0;

  const apply = async () => {
    if (!waitingWorker || applying) return false;
    applying = true;

    const controllerChanged = new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
    });

    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    const changed = await Promise.race([
      controllerChanged,
      new Promise((resolve) => window.setTimeout(() => resolve(false), 4000))
    ]);

    if (changed) {
      window.location.reload();
      return true;
    }

    applying = false;
    return false;
  };

  const announce = async (worker) => {
    if (!worker || worker === waitingWorker) return;
    waitingWorker = worker;
    waitingInfo = await workerInfo(worker) || {};

    const detail = {
      registration,
      worker,
      currentVersion,
      ...waitingInfo,
      apply
    };

    window.dispatchEvent(new CustomEvent('appupdateavailable', { detail }));

    if (!renderPrompt || Date.now() < snoozedUntil) return;
    prompt ||= createUpdatePrompt({
      appName,
      onApply: apply,
      onDismiss: () => {
        snoozedUntil = Date.now() + 60 * 60 * 1000;
      }
    });
    prompt.show(waitingInfo);
  };

  const inspect = () => {
    if (registration.waiting && navigator.serviceWorker.controller) announce(registration.waiting);
  };

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        announce(registration.waiting || installing);
      }
    });
  });

  inspect();

  const check = async () => {
    try {
      await registration.update();
      inspect();
      return true;
    } catch (error) {
      console.warn(`${appName} update check failed`, error);
      return false;
    }
  };

  const timer = checkInterval > 0 ? window.setInterval(check, checkInterval) : null;
  window.addEventListener('online', check, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });

  return {
    registration,
    check,
    apply,
    getWaitingInfo: () => waitingInfo,
    destroy() {
      if (timer) window.clearInterval(timer);
      prompt?.remove();
    }
  };
}

const autoScript = document.querySelector('script[data-update-manager]');
if (autoScript) {
  registerManagedServiceWorker({
    path: autoScript.dataset.serviceWorker || './sw.js',
    appName: autoScript.dataset.appName || document.title,
    currentVersion: autoScript.dataset.appVersion || ''
  }).catch((error) => {
    console.warn(`${autoScript.dataset.appName || document.title} managed service worker registration failed`, error);
  });
}
