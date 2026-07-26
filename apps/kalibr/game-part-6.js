function bindEvents() {
  document.querySelectorAll('.map-card').forEach((card) => card.addEventListener('click', () => selectMap(card.dataset.map)));
  elements.start.addEventListener('click', requestStart);
  elements.how.addEventListener('click', () => { elements.menu.hidden = true; elements.briefing.hidden = false; phase = 'briefing'; audio.ui(); });
  elements.briefingClose.addEventListener('click', showMenu);
  elements.briefingStart.addEventListener('click', () => { profile.briefingSeen = true; persistProfile(); startGame(); });
  elements.settingsButton.addEventListener('click', openSettings);
  elements.pauseSettingsButton.addEventListener('click', openSettings);
  elements.settingsClose.addEventListener('click', closeSettings);
  elements.settingsBackdrop.addEventListener('click', closeSettings);
  elements.pauseButton.addEventListener('click', pauseGame);
  elements.continueButton.addEventListener('click', resumeGame);
  elements.restartButton.addEventListener('click', startGame);
  elements.menuButton.addEventListener('click', showMenu);
  elements.again.addEventListener('click', startGame);
  elements.resultMenu.addEventListener('click', showMenu);
  elements.home.addEventListener('click', () => { window.location.href = '../../'; });
  elements.reload.addEventListener('click', () => beginReload(performance.now()));

  elements.sensitivity.addEventListener('input', () => {
    profile.settings.sensitivity = Number(elements.sensitivity.value);
    elements.sensitivityOutput.textContent = profile.settings.sensitivity.toFixed(2);
    persistProfile();
  });
  elements.assist.addEventListener('input', () => {
    profile.settings.assist = Number(elements.assist.value);
    elements.assistOutput.textContent = profile.settings.assist.toFixed(1);
    persistProfile();
  });
  elements.leftHand.addEventListener('click', () => { profile.settings.leftHanded = !profile.settings.leftHanded; persistProfile(); syncProfileUi(); audio.ui(); });
  elements.audio.addEventListener('click', () => { profile.settings.audio = !profile.settings.audio; persistProfile(); syncProfileUi(); if (profile.settings.audio) audio.ensure(); audio.ui(); });
  elements.haptic.addEventListener('click', () => { profile.settings.haptics = !profile.settings.haptics; persistProfile(); syncProfileUi(); haptic(18); });
  elements.quality.addEventListener('click', () => { profile.settings.quality = profile.settings.quality === 'high' ? 'low' : 'high'; persistProfile(); syncProfileUi(); resize(); audio.ui(); });

  elements.moveZone.addEventListener('pointerdown', onMoveDown);
  elements.moveZone.addEventListener('pointermove', onMoveMove);
  elements.moveZone.addEventListener('pointerup', onMoveUp);
  elements.moveZone.addEventListener('pointercancel', onMoveUp);
  elements.lookZone.addEventListener('pointerdown', onLookDown);
  elements.lookZone.addEventListener('pointermove', onLookMove);
  elements.lookZone.addEventListener('pointerup', onLookUp);
  elements.lookZone.addEventListener('pointercancel', onLookUp);
  elements.fire.addEventListener('pointerdown', startFiring);
  elements.fire.addEventListener('pointerup', stopFiring);
  elements.fire.addEventListener('pointercancel', stopFiring);
  elements.fire.addEventListener('lostpointercapture', stopFiring);

  window.addEventListener('keydown', (event) => {
    input.keys.add(event.code);
    if (event.code === 'KeyR') beginReload(performance.now());
    if (event.code === 'Escape' && phase === 'playing') pauseGame();
    if (event.code === 'Escape' && phase === 'paused') resumeGame();
  });
  window.addEventListener('keyup', (event) => input.keys.delete(event.code));
  elements.canvas.addEventListener('click', () => {
    if (phase === 'playing' && matchMedia('(pointer:fine)').matches) elements.canvas.requestPointerLock?.();
  });
  window.addEventListener('mousemove', (event) => {
    if (phase === 'playing' && document.pointerLockElement === elements.canvas) {
      current.player.a += event.movementX / 560 * 4 * Number(profile.settings.sensitivity);
      current.player.pitch = clamp(current.player.pitch + event.movementY / 420 * .3 * Number(profile.settings.sensitivity), -.13, .13);
    }
  });
  window.addEventListener('mousedown', (event) => { if (event.button === 0 && document.pointerLockElement === elements.canvas) input.mouseDown = true; });
  window.addEventListener('mouseup', (event) => { if (event.button === 0) input.mouseDown = false; });
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => { if (phase === 'playing') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'playing') pauseGame(); });
  document.addEventListener('contextmenu', (event) => event.preventDefault());
}

syncProfileUi();
resize();
setGameChrome(false);
bindEvents();
frameId = requestAnimationFrame(loop);

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(frameId);
  persistProfile();
});
