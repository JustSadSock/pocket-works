for (const [id, key] of controlBindings) {
  const button = document.querySelector(`#${id}`);
  const release = (event) => {
    if (event?.pointerId != null && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    input[key] = false;
    button.classList.remove('is-active');
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    input[key] = true;
    button.classList.add('is-active');
    audio.unlock();
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', () => {
    input[key] = false;
    button.classList.remove('is-active');
  });
}

const keyMap = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'throttle', KeyW: 'throttle',
  ArrowDown: 'brake', KeyS: 'brake'
};

window.addEventListener('keydown', (event) => {
  if (keyMap[event.code]) {
    input[keyMap[event.code]] = true;
    event.preventDefault();
    audio.unlock();
  }
  if (event.code === 'Escape') {
    if (mode === 'paused') setPause(false);
    else if (mode === 'race' || mode === 'countdown') setPause(true);
  }
});

window.addEventListener('keyup', (event) => {
  if (keyMap[event.code]) {
    input[keyMap[event.code]] = false;
    event.preventDefault();
  }
});

window.addEventListener('resize', resize, { passive: true });
window.visualViewport?.addEventListener('resize', resize, { passive: true });
document.addEventListener('visibilitychange', () => {
  resetInputs();
  if (document.visibilityState === 'hidden' && (mode === 'race' || mode === 'countdown')) setPause(true);
  lastFrame = performance.now();
});

function shp28LoadingVisible(visible, label = 'СБОРКА ТРАССЫ') {
  const screen = document.querySelector('#loadingScreen');
  const progress = document.querySelector('#loadingProgress');
  if (progress) progress.textContent = label;
  if (screen) screen.hidden = !visible;
}

function shp281PrepareVisibleRoute(seed = null, announce = false) {
  prepareRoute(seed);
  setupRace();
  mode = 'menu';
  showRaceUi(false);
  startScreen.hidden = false;
  shp28LoadingVisible(false);
  if (announce) showRaceMessage('НОВАЯ ТРАССА', 0.5);
  lastFrame = performance.now();
}

function shp28GenerateRoute() {
  shp28LoadingVisible(true);
  startScreen.hidden = true;
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        shp281PrepareVisibleRoute(null, true);
      } catch (error) {
        shp281ReportError('route-generation', error);
        shp28LoadingVisible(false);
        startScreen.hidden = false;
        showRaceMessage('ОШИБКА ТРАССЫ · ЕЩЁ РАЗ', 1.2);
      }
    }, 0);
  });
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
startButton.addEventListener('click', () => beginRace());
newRouteButton.addEventListener('click', shp28GenerateRoute);
document.querySelector('#pauseButton').addEventListener('click', () => setPause(true));
document.querySelector('#resumeButton').addEventListener('click', () => setPause(false));
document.querySelector('#restartButtonPause').addEventListener('click', () => beginRace());
restartButtonFinish.addEventListener('click', () => beginRace());
recoverButton.addEventListener('click', () => recoverCar(player));
document.querySelector('#soundButtonStart').addEventListener('click', async () => {
  await audio.unlock();
  audio.setEnabled(!saved.sound);
});
document.querySelector('#soundButtonPause').addEventListener('click', async () => {
  await audio.unlock();
  audio.setEnabled(!saved.sound);
});

updateSoundLabels();
showRaceUi(false);
startScreen.hidden = true;
resize();
requestAnimationFrame(frame);
requestAnimationFrame(() => {
  setTimeout(() => {
    try {
      shp281PrepareVisibleRoute(hashSeed(Date.now() ^ 0x51a7b33f));
    } catch (error) {
      shp281ReportError('initial-route', error);
      const progress = document.querySelector('#loadingProgress');
      const screen = document.querySelector('#loadingScreen');
      if (progress) progress.textContent = 'НЕ УДАЛОСЬ СОБРАТЬ ТРАССУ';
      if (screen) screen.dataset.error = 'true';
    }
  }, 0);
});
