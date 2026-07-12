import { registerSW } from 'virtual:pwa-register';
import './update-manager.css';

export interface EnhancedUpdateOptions {
  appName: string;
  version: string;
  releaseNotes: string[];
}

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

export function registerEnhancedUpdate(options: EnhancedUpdateOptions) {
  let prompt: ReturnType<typeof createPrompt> | null = null;
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

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
