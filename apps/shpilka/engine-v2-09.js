function addSkidMark(car) {
  const rearX = car.x - Math.cos(car.angle) * 19;
  const rearY = car.y - Math.sin(car.angle) * 19;
  const rightX = -Math.sin(car.angle);
  const rightY = Math.cos(car.angle);
  for (const side of [-1, 1]) {
    skidMarks.push({
      x1: rearX + rightX * side * 9,
      y1: rearY + rightY * side * 9,
      x2: rearX + rightX * side * 9 - car.vx * 0.018,
      y2: rearY + rightY * side * 9 - car.vy * 0.018,
      alpha: clamp(car.slip / 220, 0.12, 0.42)
    });
  }
  if (skidMarks.length > 900) skidMarks.splice(0, skidMarks.length - 900);
}

function spawnDust(car) {
  const rearX = car.x - Math.cos(car.angle) * 21;
  const rearY = car.y - Math.sin(car.angle) * 21;
  particles.push({
    x: rearX,
    y: rearY,
    vx: -car.vx * 0.18 + (Math.random() - 0.5) * 45,
    vy: -car.vy * 0.18 + (Math.random() - 0.5) * 45,
    life: 0.45,
    maxLife: 0.45,
    size: 5 + Math.random() * 9,
    color: theme.terrainDark,
    gravity: 0,
    kind: 'dust'
  });
}

function spawnSparks(x, y, nx, ny, strength) {
  const count = Math.round(5 + strength * 10);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 1.5;
    const speed = lerp(65, 245, Math.random()) * strength;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: lerp(0.18, 0.42, Math.random()), maxLife: 0.42, size: lerp(1, 3, Math.random()), color: '#f0b63e', gravity: 80, kind: 'spark' });
  }
}

function spawnBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const magnitude = Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(angle) * magnitude, vy: Math.sin(angle) * magnitude, life: lerp(0.22, 0.55, Math.random()), maxLife: 0.55, size: lerp(2, 7, Math.random()), color, gravity: 0, kind: 'burst' });
  }
}

function updateParticles(dt) {
  particles.forEach((particle) => {
    particle.life -= dt;
    particle.vy += particle.gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.exp(-1.8 * dt);
    particle.vy *= Math.exp(-1.8 * dt);
    if (particle.kind === 'dust') particle.size += dt * 18;
  });
  particles = particles.filter((particle) => particle.life > 0);
  if (particles.length > 430) particles.splice(0, particles.length - 430);
}

function updateSimulation(dt) {
  if (mode === 'countdown') {
    countdownElapsed += dt;
    const remaining = 3.15 - countdownElapsed;
    const beat = Math.ceil(remaining);
    if (beat !== lastCountdownBeat && beat > 0 && beat <= 3) {
      lastCountdownBeat = beat;
      countdownNode.textContent = String(beat);
      audio.blip('countdown', 0.72);
      navigator.vibrate?.(8);
    }
    if (remaining <= 0) {
      mode = 'race';
      countdownNode.textContent = 'ПОШЁЛ';
      audio.blip('go', 1);
      navigator.vibrate?.([12, 35, 12]);
      setTimeout(() => {
        if (mode === 'race') countdownNode.hidden = true;
      }, 500);
    }
    return;
  }

  if (mode !== 'race') return;
  raceElapsed += dt;
  cars.forEach((car) => updateCar(car, dt));
  resolveCarCollisions();
  updateParticles(dt);
  updateRaceOrder();
  updateHud();

  const recoveryNeeded = player.stuckTime > 1.45 || (!player.airborne && player.distanceFromRoad > roadHalf + 12);
  recoverButton.hidden = !recoveryNeeded;

  if (finishDelay > 0) {
    finishDelay -= dt;
    if (finishDelay <= 0) finishRace();
  }

  if (!raceMessage.hidden) {
    const remaining = Number(raceMessage.dataset.remaining || 0) - dt;
    raceMessage.dataset.remaining = String(remaining);
    if (remaining <= 0) raceMessage.hidden = true;
  }
}


let trackPath = new Path2D();
let racingLinePath = new Path2D();

function rebuildTrackPaths() {
  trackPath = new Path2D();
  racingLinePath = new Path2D();
  if (!track.length) return;
  trackPath.moveTo(track[0].x, track[0].y);
  racingLinePath.moveTo(track[0].x + track[0].nx * track[0].raceOffset, track[0].y + track[0].ny * track[0].raceOffset);
  for (let i = 1; i < track.length; i += 1) {
    trackPath.lineTo(track[i].x, track[i].y);
    racingLinePath.lineTo(track[i].x + track[i].nx * track[i].raceOffset, track[i].y + track[i].ny * track[i].raceOffset);
  }
  trackPath.closePath();
  racingLinePath.closePath();
}

function drawWorldBackground() {
  const bounds = track.bounds || { minX: -1200, maxX: 1200, minY: -1000, maxY: 1000 };
  const padding = 1200;
  ctx.fillStyle = theme?.terrain || '#d2c49d';
  ctx.fillRect(bounds.minX - padding, bounds.minY - padding, bounds.maxX - bounds.minX + padding * 2, bounds.maxY - bounds.minY + padding * 2);

  ctx.save();
  ctx.strokeStyle = 'rgba(30,33,31,0.055)';
  ctx.lineWidth = 2;
  const spacing = theme?.id === 'port' ? 130 : 180;
  for (let x = Math.floor((bounds.minX - padding) / spacing) * spacing; x < bounds.maxX + padding; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, bounds.minY - padding);
    ctx.lineTo(x + (theme?.id === 'clay' ? 520 : 140), bounds.maxY + padding);
    ctx.stroke();
  }
  for (let y = Math.floor((bounds.minY - padding) / spacing) * spacing; y < bounds.maxY + padding; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(bounds.minX - padding, y);
    ctx.lineTo(bounds.maxX + padding, y + (theme?.id === 'pine' ? 90 : 0));
    ctx.stroke();
  }
  ctx.restore();

  drawProps();
}
