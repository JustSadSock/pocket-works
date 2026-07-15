import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const VERSION = '2.8.0';
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
  './engine-v2-28-core.js',
  './engine-v2-28-ai.js',
  './engine-v2-28-track.js',
  './engine-v2-28-feel-ui.js',
  './engine-v2-12.js'
];

const startButton = document.querySelector('#startButton');
const newRouteButton = document.querySelector('#newRouteButton');
const bootStatus = document.querySelector('#bootStatus span');

function yieldToPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${source}?v=${VERSION}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${source}`));
    document.head.append(script);
  });
}

startButton.disabled = true;
newRouteButton.disabled = true;
await yieldToPaint();

try {
  for (let index = 0; index < gameParts.length; index += 1) {
    if (bootStatus) bootStatus.textContent = `ПОДГОТОВКА ТРАССЫ · ${index + 1}/${gameParts.length}`;
    await loadClassicScript(gameParts[index]);
    // Yield regularly so iOS can paint and handle navigation instead of showing
    // a frozen menu while the classic engine stack initializes.
    if (index % 2 === 1) await yieldToPaint();
  }

  document.documentElement.dataset.shpilkaLoading = 'false';
  startButton.disabled = false;
  newRouteButton.disabled = false;
  document.querySelector('#bootStatus')?.setAttribute('hidden', '');
  window.dispatchEvent(new CustomEvent('shpilka:ready'));
} catch (error) {
  console.error(error);
  document.documentElement.dataset.shpilkaLoading = 'error';
  if (bootStatus) bootStatus.textContent = 'ДВИЖОК НЕ ЗАГРУЗИЛСЯ';
  startButton.disabled = false;
  startButton.textContent = 'ПОВТОРИТЬ ЗАГРУЗКУ';
  startButton.addEventListener('click', () => location.reload(), { once: true });
}
