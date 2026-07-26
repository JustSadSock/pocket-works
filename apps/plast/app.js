import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

if (sessionStorage.getItem('pocket-works:plast:reset-on-load') === '1') {
  sessionStorage.removeItem('pocket-works:plast:reset-on-load');
  localStorage.removeItem('pocket-works:plast:world-v1');
  localStorage.removeItem('pocket-works:plast:settings-v1');
}

try {
  await import('./game.js');
} catch (error) {
  console.error(error);
  const loading = document.getElementById('loadingScreen');
  const unsupported = document.getElementById('unsupported');
  if (loading) loading.hidden = true;
  if (unsupported) {
    unsupported.hidden = false;
    const copy = unsupported.querySelector('p');
    if (copy) copy.textContent = `ПЛАСТ не запустился: ${error.message}`;
  }
}
