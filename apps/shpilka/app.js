import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const VERSION = '2.8.1';
const gameParts = [
  ...Array.from({ length: 11 }, (_, index) => `./engine-v2-${String(index + 1).padStart(2, '0')}.js`),
  './engine-v2-stability.js',
  './engine-v2-advanced.js',
  './engine-v2-advanced-fixes.js',
  './engine-v2-23-ui.js',
  './engine-v2-23.js',
  './engine-v2-23-fixes.js',
  './engine-v2-24.js',
  './engine-v2-25-ai.js',
  './engine-v2-25-race.js',
  './engine-v2-25-1.js',
  './engine-v2-25-contacts.js',
  './engine-v2-25-wall.js',
  './engine-v2-26-career.js',
  './engine-v2-26-racecraft.js',
  './engine-v2-26-landmarks.js',
  './engine-v2-26-feel.js',
  './engine-v2-26-fixes.js',
  './engine-v2-27-ai.js',
  './engine-v2-27-fixes.js',
  './engine-v2-27-1.js',
  './engine-v2-27-2.js',
  './engine-v2-28-route.js',
  './engine-v2-28-ai.js',
  './engine-v2-28-physics.js',
  './engine-v2-28-fixes.js',
  './engine-v2-28-ui.js',
  './engine-v2-28-1.js',
  './engine-v2-12.js'
];

const loadingProgress = document.querySelector('#loadingProgress');

function loadGameParts(sources) {
  let loaded = 0;
  return Promise.all(sources.map((source) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = false;
    script.src = `${source}?v=${VERSION}`;
    script.onload = () => {
      loaded += 1;
      if (loadingProgress) loadingProgress.textContent = `ДВИЖОК ${loaded}/${sources.length}`;
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${source}`));
    document.head.append(script);
  })));
}

try {
  await loadGameParts(gameParts);
} catch (error) {
  console.error(error);
  const screen = document.querySelector('#loadingScreen');
  if (screen) {
    screen.dataset.error = 'true';
    if (loadingProgress) loadingProgress.textContent = 'НЕ УДАЛОСЬ ЗАГРУЗИТЬ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'loading-retry';
    retry.textContent = 'ПОВТОРИТЬ';
    retry.addEventListener('click', () => window.location.reload());
    screen.append(retry);
  }
}
