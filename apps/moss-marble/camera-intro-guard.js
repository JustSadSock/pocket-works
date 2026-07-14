const canvas = document.getElementById('game');
const overviewButton = document.getElementById('overviewBtn');
let previousMode = document.body.dataset.mode || '';
let activeUntil = 0;
let releaseTimer = 0;

function isGuarded() {
  return performance.now() < activeUntil;
}

function release() {
  if (isGuarded()) return;
  document.body.dataset.cameraIntro = 'false';
  if (overviewButton) {
    overviewButton.style.pointerEvents = '';
    overviewButton.style.opacity = '';
  }
}

function beginIntro() {
  activeUntil = performance.now() + 1800;
  document.body.dataset.cameraIntro = 'true';
  if (overviewButton) {
    overviewButton.style.pointerEvents = 'none';
    overviewButton.style.opacity = '.28';
  }
  clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(release, 1840);
}

function syncMode() {
  const nextMode = document.body.dataset.mode || '';
  if (nextMode === 'playing' && previousMode !== 'playing' && previousMode !== 'paused') beginIntro();
  if (nextMode !== 'playing') release();
  previousMode = nextMode;
}

function guardEvent(event) {
  if (!isGuarded()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

canvas?.addEventListener('pointerdown', guardEvent, { capture: true, passive: false });
overviewButton?.addEventListener('click', guardEvent, { capture: true, passive: false });
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'v') guardEvent(event);
}, { capture: true });

new MutationObserver(syncMode).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
syncMode();
