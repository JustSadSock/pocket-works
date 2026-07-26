import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const RESET_MARKER = 'pocket-works:plast:reset-on-load';
if (sessionStorage.getItem(RESET_MARKER) === '1') {
  sessionStorage.removeItem(RESET_MARKER);
  localStorage.removeItem('pocket-works:plast:world:v1');
  localStorage.removeItem('pocket-works:plast:settings:v1');
  localStorage.removeItem('pocket-works:plast:controls-seen:v1');
}

try {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './app-main.js?v=1.1.1';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Не удалось загрузить игровой цикл.'));
    document.body.append(script);
  });
  await import('./polish.js?v=1.1.1');
} catch (error) {
  console.error(error);
  const boot = document.getElementById('boot');
  const unsupported = document.getElementById('unsupported');
  if (boot) boot.hidden = true;
  if (unsupported) {
    unsupported.hidden = false;
    const copy = unsupported.querySelector('p');
    if (copy) copy.textContent = `ПЛАСТ не запустился: ${error.message}`;
  }
}
