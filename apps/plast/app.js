import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

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
