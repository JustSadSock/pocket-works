const DEFAULT_CHECK_INTERVAL = 30 * 60 * 1000;
const UPDATE_RECEIPT_PREFIX = 'pocket-works:managed-update-receipt:v1:';
const UPDATE_SEEN_PREFIX = 'pocket-works:managed-update-seen:v1:';
const UPDATE_RECEIPT_MAX_AGE = 24 * 60 * 60 * 1000;

function workerInfoAttempt(worker, timeout) {
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeout);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data || null);
    };

    try {
      worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

async function workerInfo(worker) {
  for (const timeout of [1200, 2000, 3200]) {
    const info = await workerInfoAttempt(worker, timeout);
    if (info) return info;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return null;
}

function storageKey(prefix, path) {
  const pathname = new URL(path, window.location.href).pathname;
  return `${prefix}${encodeURIComponent(pathname)}`;
}

function readStoredJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Managed updates must still work when storage is unavailable.
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
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

function createUpdateReceipt({ appName, info = {}, onClose }) {
  const existing = document.querySelector('[data-app-update-receipt]');
  if (existing) existing.remove();

  const receipt = document.createElement('aside');
  receipt.className = 'app-update-prompt app-update-receipt';
  receipt.dataset.appUpdateReceipt = '';
  receipt.dataset.ui = '';
  receipt.setAttribute('role', 'status');
  receipt.setAttribute('aria-live', 'polite');
  receipt.innerHTML = `
    <div class="app-update-prompt__copy">
      <p class="app-update-prompt__eyebrow">UPDATED</p>
      <strong class="app-update-prompt__title"></strong>
      <ul class="app-update-prompt__notes"></ul>
    </div>
    <div class="app-update-prompt__actions">
      <button type="button" data-update-receipt-close data-native-press>Got it</button>
    </div>
  `;

  const version = info.version ? ` ${info.version}` : '';
  receipt.querySelector('.app-update-prompt__title').textContent = `${appName}${version}`;
  const notes = receipt.querySelector('.app-update-prompt__notes');
  const releaseNotes = Array.isArray(info.releaseNotes) && info.releaseNotes.length > 0
    ? info.releaseNotes
    : ['The new build is now active.'];

  for (const note of releaseNotes.slice(0, 4)) {
    const item = document.createElement('li');
    item.textContent = note;
    notes.append(item);
  }

  receipt.querySelector('[data-update-receipt-close]').addEventListener('click', () => {
    receipt.classList.remove('is-visible');
    window.setTimeout(() => receipt.remove(), 240);
    onClose?.();
  });

  document.body.append(receipt);
  requestAnimationFrame(() => receipt.classList.add('is-visible'));
  return receipt;
}

export async function registerManagedServiceWorker(options = {}) {
  if (!('serviceWorker' in navigator)) return null;

  const {
    path = './sw.js',
    appName = document.title || 'Application',
    currentVersion: configuredVersion = '',
    checkInterval = DEFAULT_CHECK_INTERVAL,
    renderPrompt = true
  } = options;

  const receiptKey = storageKey(UPDATE_RECEIPT_PREFIX, path);
  const seenKey = storageKey(UPDATE_SEEN_PREFIX, path);
  const coherentRelease = globalThis.__POCKET_WORKS_RELEASE__;

  if (coherentRelease?.verified) {
    document
      .querySelectorAll('[data-app-update-prompt], [data-app-update-receipt]')
      .forEach((element) => element.remove());
    removeStoredValue(receiptKey);

    const targetUrl = new URL(path, window.location.href).href;
    let registration = null;

    const resolveRegistration = async () => {
      try {
        registration ||= await navigator.serviceWorker.getRegistration(targetUrl);
      } catch {
        registration = null;
      }
      return registration;
    };

    const check = async () => {
      const guardedRegistration = await resolveRegistration();
      if (!guardedRegistration) return false;
      try {
        await guardedRegistration.update();
        return true;
      } catch (error) {
        console.warn(`${appName} guarded update check failed`, error);
        return false;
      }
    };

    await resolveRegistration();
    return {
      get registration() {
        return registration;
      },
      check,
      apply: async () => false,
      getWaitingInfo: () => null,
      destroy() {}
    };
  }

  const registration = await navigator.serviceWorker.register(path);
  const activeInfo = await workerInfo(navigator.serviceWorker.controller || registration.active);
  const currentVersion = activeInfo?.version || configuredVersion;
  let waitingWorker = null;
  let waitingInfo = null;
  let applying = false;
  let prompt = null;
  let snoozedUntil = 0;

  const storedReceipt = readStoredJson(receiptKey);
  if (storedReceipt && Date.now() - storedReceipt.savedAt <= UPDATE_RECEIPT_MAX_AGE) {
    removeStoredValue(receiptKey);
    if (storedReceipt.info?.version) setStoredValue(seenKey, storedReceipt.info.version);
    queueMicrotask(() => createUpdateReceipt({ appName, info: storedReceipt.info || {} }));
  } else if (storedReceipt) {
    removeStoredValue(receiptKey);
  }

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
      writeStoredJson(receiptKey, {
        savedAt: Date.now(),
        info: waitingInfo || {}
      });
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

    if (currentVersion && waitingInfo.version === currentVersion) {
      return;
    }

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
