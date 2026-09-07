import { registerSW } from 'virtual:pwa-register';
import './update-manager.css';

export interface EnhancedUpdateOptions {
  appName: string;
  version: string;
  releaseNotes: string[];
}

interface EnhancedUpdateInfo {
  version?: string;
  releaseDate?: string;
  releaseNotes?: string[];
}

const ENHANCED_UPDATE_SEEN_PREFIX = 'pocket-works:enhanced-update-seen:v1:';
const WORKER_INFO_TIMEOUT = 1600;
const ACTIVATION_TIMEOUT = 8000;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function seenKey() {
  return `${ENHANCED_UPDATE_SEEN_PREFIX}${encodeURIComponent(window.location.pathname)}`;
}

function readSeenVersion() {
  try {
    return window.localStorage.getItem(seenKey());
  } catch {
    return null;
  }
}

function writeSeenVersion(version: string) {
  try {
    window.localStorage.setItem(seenKey(), version);
  } catch {
    // Update prompting must still work when storage is unavailable.
  }
}

function requestWorkerInfo(worker: ServiceWorker | null | undefined, timeout = WORKER_INFO_TIMEOUT): Promise<EnhancedUpdateInfo | null> {
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value: EnhancedUpdateInfo | null) => {
      window.clearTimeout(timer);
      channel.port1.onmessage = null;
      channel.port1.close();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeout);

    channel.port1.onmessage = (event) => finish((event.data || null) as EnhancedUpdateInfo | null);
    try {
      worker.postMessage({ type: 'GET_UPDATE_INFO' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

async function resolveWaitingRegistration() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let registration: ServiceWorkerRegistration | undefined;
    try {
      registration = await navigator.serviceWorker.getRegistration();
    } catch {
      registration = undefined;
    }

    if (registration?.waiting) return { registration, worker: registration.waiting };
    await wait(80);
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.waiting ? { registration, worker: registration.waiting } : null;
  } catch {
    return null;
  }
}

async function activateWaitingWorker(
  registration: ServiceWorkerRegistration,
  worker: ServiceWorker,
  { reload }: { reload: boolean }
) {
  try {
    worker.postMessage({ type: 'SKIP_WAITING' });
  } catch (error) {
    throw new Error(`Could not activate waiting service worker: ${String(error)}`);
  }

  const deadline = Date.now() + ACTIVATION_TIMEOUT;
  while (Date.now() < deadline) {
    if (String(worker.state) === 'redundant') throw new Error('Waiting service worker became redundant');
    if (worker.state === 'activated' && registration.waiting !== worker) {
      if (reload) window.location.reload();
      return;
    }
    await wait(60);
  }

  throw new Error('Timed out while activating the new application build');
}

function createPrompt(appName: string) {
  const existing = document.querySelector('[data-enhanced-update-prompt]');
  existing?.remove();

  const prompt = document.createElement('section');
  prompt.className = 'app-update-prompt';
  prompt.dataset.enhancedUpdatePrompt = '';
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'polite');
  prompt.innerHTML = `
    <div class="app-update-prompt__copy">
      <p class="app-update-prompt__eyebrow" data-update-eyebrow>UPDATE READY</p>
      <strong class="app-update-prompt__title">A new ${appName} build is ready.</strong>
      <ul class="app-update-prompt__notes"></ul>
    </div>
    <div class="app-update-prompt__actions">
      <button type="button" data-update-later>Later</button>
      <button type="button" data-update-apply>Update now</button>
    </div>
  `;

  const eyebrow = prompt.querySelector<HTMLElement>('[data-update-eyebrow]');
  const notes = prompt.querySelector<HTMLUListElement>('.app-update-prompt__notes');
  const later = prompt.querySelector<HTMLButtonElement>('[data-update-later]');
  const apply = prompt.querySelector<HTMLButtonElement>('[data-update-apply]');

  let onApply: (() => Promise<void>) | null = null;
  let onDismiss: (() => void) | null = null;

  later?.addEventListener('click', () => {
    prompt.classList.remove('is-visible');
    onDismiss?.();
  });

  apply?.addEventListener('click', async () => {
    if (!apply || !onApply || apply.disabled) return;
    apply.disabled = true;
    apply.textContent = 'Updating…';
    prompt.classList.add('is-applying');
    try {
      await onApply();
    } catch (error) {
      console.error('Enhanced PWA update failed', error);
      apply.disabled = false;
      apply.textContent = 'Try again';
      prompt.classList.remove('is-applying');
    }
  });

  document.body.append(prompt);

  return {
    show(info: EnhancedUpdateInfo, applyUpdate: () => Promise<void>, dismissUpdate: () => void) {
      const version = typeof info.version === 'string' && info.version ? info.version : '';
      if (eyebrow) eyebrow.textContent = version ? `UPDATE READY · v${version}` : 'UPDATE READY';
      notes?.replaceChildren();

      const releaseNotes = Array.isArray(info.releaseNotes) && info.releaseNotes.length > 0
        ? info.releaseNotes
        : ['A newer application build is ready.'];
      for (const note of releaseNotes.slice(0, 4)) {
        const item = document.createElement('li');
        item.textContent = note;
        notes?.append(item);
      }

      onApply = applyUpdate;
      onDismiss = dismissUpdate;
      if (apply) {
        apply.disabled = false;
        apply.textContent = 'Update now';
      }
      prompt.classList.remove('is-applying');
      requestAnimationFrame(() => prompt.classList.add('is-visible'));
    }
  };
}

export function registerEnhancedUpdate(options: EnhancedUpdateOptions) {
  let prompt: ReturnType<typeof createPrompt> | null = null;
  let handlingRefresh = false;

  const handleNeedRefresh = async () => {
    if (handlingRefresh) return;
    handlingRefresh = true;

    try {
      const pending = await resolveWaitingRegistration();
      if (!pending) return;

      const info = await requestWorkerInfo(pending.worker) || {};
      const targetVersion = typeof info.version === 'string' ? info.version : '';

      // The launcher used to re-register application workers under a query-string URL.
      // Enhanced apps then saw a byte-identical, same-release worker as a fresh update.
      // Converge that worker silently instead of presenting a fake update loop.
      if (targetVersion && targetVersion === options.version) {
        await activateWaitingWorker(pending.registration, pending.worker, { reload: false });
        return;
      }

      if (targetVersion && readSeenVersion() === targetVersion) return;

      const displayInfo: EnhancedUpdateInfo = {
        version: targetVersion || undefined,
        releaseDate: info.releaseDate,
        releaseNotes: Array.isArray(info.releaseNotes) && info.releaseNotes.length > 0
          ? info.releaseNotes
          : targetVersion
            ? options.releaseNotes
            : ['A newer application build is ready.']
      };

      prompt ||= createPrompt(options.appName);
      prompt.show(
        displayInfo,
        () => activateWaitingWorker(pending.registration, pending.worker, { reload: true }),
        () => {
          if (targetVersion) writeSeenVersion(targetVersion);
        }
      );
    } catch (error) {
      console.warn('Enhanced Service Worker refresh handling failed', error);
    } finally {
      handlingRefresh = false;
    }
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void handleNeedRefresh();
    },
    onRegisterError(error) {
      console.warn('Enhanced Service Worker registration failed', error);
    }
  });

  return updateSW;
}
