import { registerSW } from 'virtual:pwa-register';
import './update-manager.css';

export interface EnhancedUpdateOptions {
  appName: string;
  version: string;
  releaseNotes: string[];
}

type EnhancedUpdateHandle = (reloadPage?: boolean) => Promise<void>;
type PocketWorksRelease = { verified?: boolean };

function createPrompt(options: EnhancedUpdateOptions, applyUpdate: () => Promise<void>) {
  const prompt = document.createElement('section');
  prompt.className = 'app-update-prompt';
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'polite');
  prompt.innerHTML = `
    <div class="app-update-prompt__copy">
      <p class="app-update-prompt__eyebrow">UPDATE READY · v${options.version}</p>
      <strong class="app-update-prompt__title">A new ${options.appName} build is ready.</strong>
      <ul class="app-update-prompt__notes"></ul>
    </div>
    <div class="app-update-prompt__actions">
      <button type="button" data-update-later>Later</button>
      <button type="button" data-update-apply>Update now</button>
    </div>
  `;

  const notes = prompt.querySelector<HTMLUListElement>('.app-update-prompt__notes');
  for (const note of options.releaseNotes.slice(0, 4)) {
    const item = document.createElement('li');
    item.textContent = note;
    notes?.append(item);
  }

  const later = prompt.querySelector<HTMLButtonElement>('[data-update-later]');
  const apply = prompt.querySelector<HTMLButtonElement>('[data-update-apply]');

  later?.addEventListener('click', () => prompt.classList.remove('is-visible'));
  apply?.addEventListener('click', async () => {
    if (!apply) return;
    apply.disabled = true;
    apply.textContent = 'Updating…';
    try {
      await applyUpdate();
    } catch (error) {
      console.error('Enhanced PWA update failed', error);
      apply.disabled = false;
      apply.textContent = 'Try again';
    }
  });

  document.body.append(prompt);
  return {
    show() {
      requestAnimationFrame(() => prompt.classList.add('is-visible'));
    }
  };
}

export function registerEnhancedUpdate(options: EnhancedUpdateOptions): EnhancedUpdateHandle {
  const coherentRelease = (globalThis as typeof globalThis & {
    __POCKET_WORKS_RELEASE__?: PocketWorksRelease;
  }).__POCKET_WORKS_RELEASE__;

  // Production pages are stamped with release-guard.js before the application bundle runs.
  // That guard owns the fingerprinted Service Worker URL and recovery lifecycle. Registering
  // the same scope again through vite-plugin-pwa with canonical `sw.js` creates a second
  // candidate for the same release and can trap Safari in a permanent "Update now" loop.
  if (coherentRelease?.verified) {
    document.querySelectorAll('.app-update-prompt').forEach((element) => element.remove());
    return async () => {};
  }

  let prompt: ReturnType<typeof createPrompt> | null = null;
  let updateSW: EnhancedUpdateHandle | undefined;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      prompt ||= createPrompt(options, async () => updateSW?.(true));
      prompt.show();
    },
    onRegisterError(error) {
      console.warn('Enhanced Service Worker registration failed', error);
    }
  });

  return updateSW;
}
