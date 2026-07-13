function drawCar(car) {
  const elevationScale = 1 + clamp(car.z / 850, 0, 0.085);
  const shadowOffset = 5 + car.z * 0.17;
  const bodyLift = car.z * 0.08;
  const roll = clamp(-car.lateralAccel / 2100, -0.08, 0.08);
  const pitch = clamp(-car.longitudinalAccel / 4200, -0.05, 0.05);

  ctx.save();
  ctx.translate(car.x + shadowOffset, car.y + shadowOffset * 0.72);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);
  ctx.globalAlpha = car.airborne ? 0.22 : 0.34;
  ctx.fillStyle = '#171918';
  ctx.fillRect(-CAR_HALF_LENGTH + 1, -CAR_HALF_WIDTH + 1, CAR_HALF_LENGTH * 2 - 2, CAR_HALF_WIDTH * 2 - 2);
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y - bodyLift);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);

  ctx.fillStyle = '#171918';
  ctx.fillRect(-18, -16, 11, 5);
  ctx.fillRect(8, -16, 11, 5);
  ctx.fillRect(-18, 11, 11, 5);
  ctx.fillRect(8, 11, 11, 5);

  ctx.fillStyle = car.color;
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(27, 0);
  ctx.lineTo(18, 12.4);
  ctx.lineTo(-17, 12.4);
  ctx.lineTo(-27, 7);
  ctx.lineTo(-27, -7);
  ctx.lineTo(-17, -12.4);
  ctx.lineTo(18, -12.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = car.accent;
  ctx.beginPath();
  ctx.moveTo(25, 0);
  ctx.lineTo(12, 3.6);
  ctx.lineTo(-23, 3.6);
  ctx.lineTo(-23, -3.6);
  ctx.lineTo(12, -3.6);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(pitch * 18, roll * 24);
  ctx.fillStyle = '#222824';
  ctx.fillRect(-7, -8, 15, 16);
  ctx.fillStyle = '#8aa09b';
  ctx.fillRect(-2, -6, 8, 12);
  ctx.restore();

  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(18, -13);
  ctx.lineTo(18, 13);
  ctx.stroke();

  if (car.player) {
    ctx.strokeStyle = '#e65e2f';
    ctx.lineWidth = 3;
    ctx.strokeRect(-CAR_HALF_LENGTH - 2, -CAR_HALF_WIDTH - 2, CAR_HALF_LENGTH * 2 + 4, CAR_HALF_WIDTH * 2 + 4);
  }
  ctx.restore();
}

function drawCars() {
  const ordered = [...cars].sort((a, b) => a.z - b.z || Number(a.player) - Number(b.player));
  ordered.forEach(drawCar);
}

function drawSpeedStreaks(speed) {
  if (prefersReducedMotion || speed < 320) return;
  const intensity = clamp((speed - 320) / 420, 0, 1);
  const count = Math.floor(8 + intensity * 18);
  ctx.save();
  ctx.globalAlpha = 0.07 + intensity * 0.12;
  ctx.strokeStyle = '#f4efe0';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side > 0 ? viewportWidth * lerp(0.58, 1.02, ((i * 47) % 100) / 100) : viewportWidth * lerp(-0.02, 0.42, ((i * 61) % 100) / 100);
    const y = ((i * 119 + raceElapsed * 350) % (viewportHeight + 120)) - 60;
    const length = 22 + intensity * 72;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * intensity * 10, y + length);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(speed) {
  const intensity = clamp((speed - 280) / 540, 0, 0.38);
  if (intensity <= 0) return;
  const gradient = ctx.createRadialGradient(viewportWidth * 0.5, viewportHeight * 0.48, viewportWidth * 0.18, viewportWidth * 0.5, viewportHeight * 0.48, viewportWidth * 0.72);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(18,20,18,${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = theme?.terrain || '#d2c49d';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const focus = player || { x: track[0]?.x || 0, y: track[0]?.y || 0, angle: track[0]?.heading || 0, vx: 0, vy: 0, forwardSpeed: 0, lateralSpeed: 0, yawRate: 0 };
  const speed = Math.abs(focus.forwardSpeed || Math.hypot(focus.vx, focus.vy));
  const targetZoom = clamp(0.88 - speed / 2100, 0.57, 0.84);
  cameraZoom = lerp(cameraZoom, targetZoom, mode === 'race' ? 0.075 : 0.035);
  cameraShake *= 0.86;
  cameraShakeX = (Math.random() - 0.5) * cameraShake;
  cameraShakeY = (Math.random() - 0.5) * cameraShake;

  const forwardX = Math.cos(focus.angle);
  const forwardY = Math.sin(focus.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const lead = 150 + speed * 0.23;
  const slipLead = clamp(focus.lateralSpeed || 0, -120, 120) * 0.24;
  const targetCameraX = focus.x + forwardX * lead + rightX * slipLead;
  const targetCameraY = focus.y + forwardY * lead + rightY * slipLead;
  cameraX = lerp(cameraX, targetCameraX, mode === 'race' ? 0.105 : 0.04);
  cameraY = lerp(cameraY, targetCameraY, mode === 'race' ? 0.105 : 0.04);
  cameraAngle = angleLerp(cameraAngle, focus.angle, mode === 'race' ? 0.10 : 0.04);
  const bank = clamp(-(focus.yawRate || 0) * 0.018 - (focus.lateralSpeed || 0) / 5500, -0.055, 0.055);

  ctx.save();
  ctx.translate(viewportWidth * 0.5 + cameraShakeX, viewportHeight * 0.49 + cameraShakeY);
  ctx.scale(cameraZoom, cameraZoom);
  ctx.rotate(-cameraAngle - Math.PI / 2 + bank);
  ctx.translate(-cameraX, -cameraY);
  drawWorldBackground();
  drawTrackSurface();
  drawSkidMarks();
  drawCars();
  drawParticles();
  ctx.restore();

  drawSpeedStreaks(speed);
  drawVignette(speed);
}


function frame(now) {
  const elapsed = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (document.visibilityState === 'visible') {
    accumulator += elapsed;
    const fixedStep = 1 / 120;
    let iterations = 0;
    while (accumulator >= fixedStep && iterations < 8) {
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
