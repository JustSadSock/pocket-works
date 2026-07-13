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

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
startButton.addEventListener('click', () => beginRace());
newRouteButton.addEventListener('click', () => {
  prepareRoute();
  setupRace();
  showRaceMessage('НОВАЯ ТРАССА', 0.5);
});
document.querySelector('#pauseButton').addEventListener('click', () => setPause(true));
document.querySelector('#resumeButton').addEventListener('click', () => setPause(false));
document.querySelector('#restartButtonPause').addEventListener('click', () => beginRace());
restartButtonFinish.addEventListener('click', () => beginRace({ newRoute: true }));
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
prepareRoute(hashSeed(Date.now() ^ 0x51a7b33f));
setupRace();
showRaceUi(false);
resize();
requestAnimationFrame(frame);
