function drawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - particle.size * 0.5, particle.y - particle.size * 0.5, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawCar(car) {
  const elevationScale = 1 + clamp(car.z / 850, 0, 0.08);
  const shadowOffset = 5 + car.z * 0.16;
  ctx.save();
  ctx.translate(car.x + shadowOffset, car.y + shadowOffset * 0.72);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);
  ctx.fillStyle = `rgba(30,33,31,${car.airborne ? 0.24 : 0.36})`;
  ctx.beginPath();
  ctx.moveTo(27, 0);
  ctx.lineTo(15, 15);
  ctx.lineTo(-25, 13);
  ctx.lineTo(-29, 0);
  ctx.lineTo(-25, -13);
  ctx.lineTo(15, -15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y - car.z * 0.08);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);

  ctx.fillStyle = '#171918';
  ctx.fillRect(-19, -17, 12, 5);
  ctx.fillRect(9, -17, 12, 5);
  ctx.fillRect(-19, 12, 12, 5);
  ctx.fillRect(9, 12, 12, 5);

  ctx.fillStyle = car.color;
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(29, 0);
  ctx.lineTo(18, 13);
  ctx.lineTo(-17, 13);
  ctx.lineTo(-29, 7);
  ctx.lineTo(-29, -7);
  ctx.lineTo(-17, -13);
  ctx.lineTo(18, -13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = car.accent;
  ctx.beginPath();
  ctx.moveTo(27, 0);
  ctx.lineTo(12, 4);
  ctx.lineTo(-24, 4);
  ctx.lineTo(-24, -4);
  ctx.lineTo(12, -4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#222824';
  ctx.fillRect(-6, -8, 14, 16);
  ctx.fillStyle = '#8aa09b';
  ctx.fillRect(-2, -6, 8, 12);

  if (car.player) {
    ctx.strokeStyle = '#e65e2f';
    ctx.lineWidth = 3;
    ctx.strokeRect(-33, -16, 4, 32);
  }
  ctx.restore();
}

function drawCarsAndBridge() {
  const underpassCars = cars.filter((car) => sectionIndexInRange(car.trackIndex, UNDERPASS_START, UNDERPASS_END) && !car.airborne);
  const otherCars = cars.filter((car) => !underpassCars.includes(car));
  underpassCars.sort((a, b) => a.z - b.z).forEach(drawCar);
  drawBridge();
  otherCars.sort((a, b) => a.z - b.z || Number(a.player) - Number(b.player)).forEach(drawCar);
}

function drawSpeedStreaks(speed) {
  if (prefersReducedMotion || speed < 370) return;
  const intensity = clamp((speed - 370) / 230, 0, 1);
  const count = Math.floor(5 + intensity * 13);
  ctx.save();
  ctx.globalAlpha = 0.08 + intensity * 0.12;
  ctx.strokeStyle = '#f4efe0';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 73 + raceElapsed * 170) % (viewportWidth + 80)) - 40;
    const y = ((i * 119 + raceElapsed * 310) % viewportHeight);
    const length = 18 + intensity * 52;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + length);
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = '#d2c49d';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const focus = player || { x: track[0].x, y: track[0].y, angle: Math.atan2(track[0].ty, track[0].tx), vx: 0, vy: 0 };
  const speed = Math.hypot(focus.vx, focus.vy);
  const targetZoom = clamp(1.08 - speed / 1150, 0.68, 0.98);
  cameraZoom = lerp(cameraZoom, targetZoom, mode === 'race' ? 0.075 : 0.03);
  cameraShake *= 0.88;
  cameraShakeX = (Math.random() - 0.5) * cameraShake;
  cameraShakeY = (Math.random() - 0.5) * cameraShake;
  const forwardX = Math.cos(focus.angle);
  const forwardY = Math.sin(focus.angle);
  const lead = 95 + speed * 0.15;
  const camX = focus.x + forwardX * lead;
  const camY = focus.y + forwardY * lead;

  ctx.save();
  ctx.translate(viewportWidth * 0.5 + cameraShakeX, viewportHeight * 0.48 + cameraShakeY);
  ctx.scale(cameraZoom, cameraZoom);
  ctx.rotate(-focus.angle - Math.PI / 2);
  ctx.translate(-camX, -camY);
  drawWorldBackground();
  drawBaseTrack();
  drawCarsAndBridge();
  drawParticles();
  ctx.restore();

  drawSpeedStreaks(speed);
}

function frame(now) {
  const elapsed = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (document.visibilityState === 'visible') {
    accumulator += elapsed;
    const fixedStep = 1 / 120;
    let iterations = 0;
    while (accumulator >= fixedStep && iterations < 7) {
      updateSimulation(fixedStep);
      accumulator -= fixedStep;
      iterations += 1;
    }
    draw();
    audio.update(player, mode === 'race' || mode === 'countdown');
  }
  requestAnimationFrame(frame);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  viewportWidth = Math.max(1, rect.width);
  viewportHeight = Math.max(1, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(viewportHeight * dpr);
  ctx.imageSmoothingEnabled = true;
}

for (const [id, key] of controlBindings) {
  const button = document.querySelector(`#${id}`);
  const release = (event) => {
    if (event.pointerId != null && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    input[key] = false;
    button.classList.remove('is-active');
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    input[key] = true;
    button.classList.add('is-active');
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
document.querySelector('#startButton').addEventListener('click', beginRace);
document.querySelector('#pauseButton').addEventListener('click', () => setPause(true));
document.querySelector('#resumeButton').addEventListener('click', () => setPause(false));
document.querySelector('#restartButtonPause').addEventListener('click', beginRace);
document.querySelector('#restartButtonFinish').addEventListener('click', beginRace);
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
setupRace();
showRaceUi(false);
resize();
requestAnimationFrame(frame);
