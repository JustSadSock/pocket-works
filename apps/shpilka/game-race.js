function createCar(options) {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    accent: options.accent,
    player: Boolean(options.player),
    skill: options.skill ?? 1,
    lane: options.lane ?? 0,
    x: 0,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    airborne: false,
    jumpCooldown: 0,
    trackIndex: 0,
    previousTrackIndex: 0,
    completedLaps: 0,
    lapArmed: false,
    lapStartTime: 0,
    bestLap: null,
    finishTime: null,
    throttleInput: 0,
    brakeInput: 0,
    steerInput: 0,
    slip: 0,
    distanceFromRoad: 0,
    safeIndex: 0,
    stuckTime: 0,
    collisionCooldown: 0,
    markTimer: 0,
    aiPhase: options.aiPhase ?? 0,
    raceScore: 0,
    lastImpact: 0
  };
}

function setupRace() {
  particles = [];
  skidMarks = [];
  raceElapsed = 0;
  finishDelay = 0;
  cameraShake = 0;
  resetInputs();

  cars = [
    createCar({ id: 'player', name: 'ТЫ', color: '#f4efe0', accent: '#e65e2f', player: true, lane: -17 }),
    createCar({ id: 'rook', name: 'ГРАЧ', color: '#3c7775', accent: '#f4efe0', skill: 0.94, lane: 18, aiPhase: 0.4 }),
    createCar({ id: 'volt', name: 'ВОЛЬТ', color: '#d7a72d', accent: '#1e211f', skill: 1.01, lane: -21, aiPhase: 1.2 }),
    createCar({ id: 'mara', name: 'МАРА', color: '#59719c', accent: '#f4efe0', skill: 0.98, lane: 24, aiPhase: 2.1 }),
    createCar({ id: 'shunt', name: 'ШУНТ', color: '#9c4d3c', accent: '#f4efe0', skill: 1.035, lane: 0, aiPhase: 3.4 })
  ];
  player = cars[0];

  const start = track[0];
  const startAngle = Math.atan2(start.ty, start.tx);
  cars.forEach((car, index) => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const backward = 36 + row * 58;
    const lateral = side * (index === 0 ? 0 : 27);
    car.x = start.x - start.tx * backward + start.nx * lateral;
    car.y = start.y - start.ty * backward + start.ny * lateral;
    car.angle = startAngle;
    const nearest = nearestTrackIndex(car.x, car.y);
    car.trackIndex = nearest.index;
    car.previousTrackIndex = nearest.index;
    car.safeIndex = nearest.index;
    car.lapStartTime = 0;
  });

  raceOrder = [...cars];
  updateHud();
}

function resetInputs() {
  Object.keys(input).forEach((key) => { input[key] = false; });
  document.querySelectorAll('.is-active').forEach((node) => node.classList.remove('is-active'));
}

function showRaceUi(visible) {
  hud.hidden = !visible;
  controls.hidden = !visible;
  speedCluster.hidden = !visible;
}

function beginRace() {
  setupRace();
  startScreen.hidden = true;
  pauseScreen.hidden = true;
  finishScreen.hidden = true;
  showRaceUi(true);
  mode = 'countdown';
  countdownElapsed = 0;
  lastCountdownBeat = 4;
  countdownNode.hidden = false;
  countdownNode.textContent = '3';
  audio.unlock();
}

function setPause(paused) {
  if (paused && (mode === 'race' || mode === 'countdown')) {
    previousMode = mode;
    mode = 'paused';
    pauseScreen.hidden = false;
    showRaceUi(false);
    countdownNode.hidden = true;
    resetInputs();
    audio.update(player, false);
  } else if (!paused && mode === 'paused') {
    mode = previousMode === 'countdown' ? 'countdown' : 'race';
    pauseScreen.hidden = true;
    showRaceUi(true);
    countdownNode.hidden = mode !== 'countdown';
    lastFrame = performance.now();
  }
}

function showRaceMessage(text, duration = 0.8) {
  raceMessage.textContent = text;
  raceMessage.hidden = false;
  raceMessage.dataset.remaining = String(duration);
}

function finishRace() {
  if (mode === 'finished') return;
  mode = 'finished';
  resetInputs();
  showRaceUi(false);
  countdownNode.hidden = true;
  recoverButton.hidden = true;
  audio.update(player, false);

  const ranking = [...cars].sort(compareRaceOrder);
  const place = ranking.indexOf(player) + 1;
  finishKicker.textContent = place === 1 ? 'ЧИСТАЯ РАБОТА' : 'ФИНИШ';
  finishTitle.textContent = `${place} МЕСТО`;
  const best = player.bestLap || saved.bestLap;
  finishSummary.textContent = `Время ${formatTime(player.finishTime || raceElapsed)}. Лучший круг ${formatTime(best)}.`;
  resultsNode.innerHTML = '';
  ranking.forEach((car, index) => {
    const item = document.createElement('li');
    if (car.player) item.classList.add('is-player');
    const status = car.finishTime ? formatTime(car.finishTime) : `${Math.max(1, car.completedLaps + 1)}/${LAPS_TO_WIN} круг`;
    item.innerHTML = `<span>${index + 1}</span><b>${car.name}</b><time>${status}</time>`;
    resultsNode.append(item);
  });
  finishScreen.hidden = false;
  audio.blip(place === 1 ? 'go' : 'lap', 1);
}

function compareRaceOrder(a, b) {
  if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
  if (a.finishTime != null) return -1;
  if (b.finishTime != null) return 1;
  return b.raceScore - a.raceScore;
}

function updateRaceOrder() {
  raceOrder = [...cars].sort(compareRaceOrder);
}

function updateHud() {
  if (!player) return;
  const speed = Math.round(Math.hypot(player.vx, player.vy) * 0.53);
  speedValue.textContent = String(speed);
  positionValue.textContent = `${raceOrder.indexOf(player) + 1}/${cars.length}`;
  lapValue.textContent = `${Math.min(player.completedLaps + 1, LAPS_TO_WIN)}/${LAPS_TO_WIN}`;
  lapTime.textContent = formatTime(Math.max(0, raceElapsed - player.lapStartTime));
  bestLap.textContent = saved.bestLap ? `ЛУЧШИЙ ${formatTime(saved.bestLap)}` : 'ЛУЧШИЙ —';
}

function updateSoundLabels() {
  const label = `ЗВУК: ${saved.sound ? 'ВКЛ' : 'ВЫКЛ'}`;
  document.querySelector('#soundButtonStart').textContent = label;
  document.querySelector('#soundButtonPause').textContent = label;
}

function aiControls(car) {
  const speed = Math.hypot(car.vx, car.vy);
  const lookAhead = Math.round(12 + speed / 27);
  const targetIndex = (car.trackIndex + lookAhead) % track.length;
  const target = track[targetIndex];
  const laneWave = Math.sin(raceElapsed * 0.33 + car.aiPhase) * 7;
  const lane = car.lane + laneWave;
  let targetX = target.x + target.nx * lane;
  let targetY = target.y + target.ny * lane;

  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
    const side = -Math.sin(car.angle) * dx + Math.cos(car.angle) * dy;
    if (forward > 0 && forward < 95 && Math.abs(side) < 34) {
      targetX += target.nx * (side > 0 ? -34 : 34);
      targetY += target.ny * (side > 0 ? -34 : 34);
    }
  }

  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const difference = wrapAngle(desired - car.angle);
  const steer = clamp(difference * 1.75, -1, 1);
  const curvePoint = track[(car.trackIndex + Math.round(18 + speed / 24)) % track.length];
  const curve = curvePoint.curvature;
  let targetSpeed = clamp(590 - curve * 1180, 205, 575) * car.skill;
  if (sectionIndexInRange(car.trackIndex, JUMP_TRIGGER_START - 34, JUMP_TRIGGER_END + 8)) targetSpeed = Math.max(targetSpeed, 475 * car.skill);
  if (car.distanceFromRoad > ROAD_HALF * 0.72) targetSpeed *= 0.75;

  const brake = speed > targetSpeed + 24 ? clamp((speed - targetSpeed) / 120, 0, 1) : 0;
  const throttle = speed < targetSpeed ? clamp((targetSpeed - speed) / 90, 0.28, 1) : 0;
  return { steer, throttle, brake: brake > 0.12 ? brake : (Math.abs(steer) > 0.68 && speed > targetSpeed - 15 ? 0.24 : 0) };
}

function playerControls() {
  return {
    steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    throttle: input.throttle ? 1 : 0,
    brake: input.brake ? 1 : 0
  };
}

function updateCar(car, dt) {
  const commands = car.player ? playerControls() : aiControls(car);
  car.steerInput = commands.steer;
  car.throttleInput = commands.throttle;
  car.brakeInput = commands.brake;
  car.jumpCooldown = Math.max(0, car.jumpCooldown - dt);
  car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  let forwardSpeed = car.vx * forwardX + car.vy * forwardY;
  let lateralSpeed = car.vx * rightX + car.vy * rightY;
  const speed = Math.hypot(car.vx, car.vy);

  const onRoad = car.distanceFromRoad <= ROAD_HALF + 4 || car.airborne;
  const throttleForce = onRoad ? 480 : 245;
  if (commands.throttle > 0) {
    const engineFade = 1 - clamp(Math.abs(forwardSpeed) / MAX_SPEED, 0, 0.94);
    forwardSpeed += commands.throttle * throttleForce * (0.38 + engineFade * 0.78) * dt;
  }

  if (commands.brake > 0) {
    if (forwardSpeed > 12) {
      forwardSpeed -= Math.min(forwardSpeed, 760 * commands.brake * dt);
    } else if (commands.throttle === 0) {
      forwardSpeed -= 190 * commands.brake * dt;
    }
  }

  const driftIntent = commands.brake > 0.12 && Math.abs(commands.steer) > 0.18 && Math.abs(forwardSpeed) > 130;
  const grip = car.airborne ? 0.12 : driftIntent ? 1.45 : onRoad ? 7.8 : 3.2;
  lateralSpeed *= Math.exp(-grip * dt);
  const rolling = onRoad ? 0.42 : 2.4;
  const aerodynamic = 0.00078 * forwardSpeed * Math.abs(forwardSpeed);
  forwardSpeed -= Math.sign(forwardSpeed) * Math.min(Math.abs(forwardSpeed), (rolling * Math.abs(forwardSpeed) + Math.abs(aerodynamic)) * dt);

  const steerAuthority = clamp(Math.abs(forwardSpeed) / 75, 0, 1) * clamp(1.34 - Math.abs(forwardSpeed) / 920, 0.58, 1.2);
  const turnRate = commands.steer * steerAuthority * (1.34 + Math.abs(forwardSpeed) / 330) * Math.sign(forwardSpeed || 1);
  if (!car.airborne) car.angle += turnRate * dt;
  else car.angle += commands.steer * 0.38 * dt;

  const newForwardX = Math.cos(car.angle);
  const newForwardY = Math.sin(car.angle);
  const newRightX = -newForwardY;
  const newRightY = newForwardX;
  car.vx = newForwardX * forwardSpeed + newRightX * lateralSpeed;
  car.vy = newForwardY * forwardSpeed + newRightY * lateralSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  if (car.airborne) {
    car.z += car.vz * dt;
    car.vz -= 900 * dt;
    if (car.z <= 0) {
      car.z = 0;
      car.vz = 0;
      car.airborne = false;
      car.jumpCooldown = 1.1;
      car.vx *= 0.94;
      car.vy *= 0.94;
      spawnBurst(car.x, car.y, '#d8c49b', 14, 120);
      if (car.player) {
        cameraShake = prefersReducedMotion ? 2 : 13;
        audio.blip('impact', 0.7);
        navigator.vibrate?.(24);
      }
    }
  }

  const nearest = nearestTrackIndex(car.x, car.y, car.trackIndex, car.airborne ? 112 : 76);
  car.previousTrackIndex = car.trackIndex;
  car.trackIndex = nearest.index;
  car.distanceFromRoad = nearest.distance;

  let indexDelta = car.trackIndex - car.previousTrackIndex;
  if (indexDelta < -track.length / 2) indexDelta += track.length;
  if (indexDelta > track.length / 2) indexDelta -= track.length;

  if (car.trackIndex > track.length * 0.28 && car.trackIndex < track.length * 0.74) car.lapArmed = true;

  if (car.lapArmed && indexDelta > 0 && car.previousTrackIndex > track.length * 0.83 && car.trackIndex < track.length * 0.16 && forwardSpeed > 40) {
    car.lapArmed = false;
    car.completedLaps += 1;
    const currentLap = raceElapsed - car.lapStartTime;
    car.lapStartTime = raceElapsed;
    if (car.player && car.completedLaps <= LAPS_TO_WIN) {
      car.bestLap = car.bestLap == null ? currentLap : Math.min(car.bestLap, currentLap);
      if (saved.bestLap == null || currentLap < saved.bestLap) {
        saved.bestLap = currentLap;
        saveState();
        showRaceMessage('НОВЫЙ ЛУЧШИЙ', 1.05);
      } else if (car.completedLaps < LAPS_TO_WIN) {
        showRaceMessage(`КРУГ ${car.completedLaps + 1}`, 0.72);
      }
      audio.blip('lap', 0.9);
      navigator.vibrate?.(12);
    }
    if (car.completedLaps >= LAPS_TO_WIN && car.finishTime == null) {
      car.finishTime = raceElapsed;
      if (car.player) finishDelay = 0.85;
    }
  }

  const triggerEntered = car.previousTrackIndex < JUMP_TRIGGER_START && car.trackIndex >= JUMP_TRIGGER_START;
  if (triggerEntered && !car.airborne && car.jumpCooldown <= 0 && Math.abs(forwardSpeed) > 325) {
    car.airborne = true;
    car.z = 2;
    car.vz = clamp(Math.abs(forwardSpeed) * 0.48, 190, 315);
    car.jumpCooldown = 1.4;
    if (car.player) {
      showRaceMessage('ДЕРЖИ РОВНО', 0.65);
      audio.blip('jump', 0.8);
      navigator.vibrate?.(10);
    }
  }

  if (!car.airborne) resolveRoadCollision(car);

  let raceDistance = track[car.trackIndex].distance;
  if (!car.lapArmed && car.completedLaps === 0 && car.trackIndex > track.length * 0.8) raceDistance -= track.totalLength;
  car.raceScore = car.completedLaps * track.totalLength + raceDistance;
  car.slip = Math.abs(lateralSpeed);

  if (!car.airborne && car.distanceFromRoad < ROAD_HALF * 0.72) {
    car.safeIndex = car.trackIndex;
  }

  if (speed < 22 && (car.distanceFromRoad > ROAD_HALF * 0.72 || Math.abs(wrapAngle(car.angle - Math.atan2(track[car.trackIndex].ty, track[car.trackIndex].tx))) > 2.5)) car.stuckTime += dt;
  else car.stuckTime = Math.max(0, car.stuckTime - dt * 1.8);

  if (!car.player && car.stuckTime > 2.5) recoverCar(car);

  if (!car.airborne && car.slip > 54 && speed > 145) {
    car.markTimer -= dt;
    if (car.markTimer <= 0) {
      addSkidMark(car);
      car.markTimer = 0.038;
    }
  } else {
    car.markTimer = 0;
  }
}

function resolveRoadCollision(car) {
  const point = track[car.trackIndex];
  const dx = car.x - point.x;
  const dy = car.y - point.y;
  const distance = Math.hypot(dx, dy) || 0.001;
  const allowed = sectionIndexInRange(car.trackIndex, BRIDGE_START, BRIDGE_END) ? ROAD_HALF - CAR_RADIUS - 4 : ROAD_HALF - CAR_RADIUS;
  if (distance <= allowed) return;

  const nx = dx / distance;
  const ny = dy / distance;
  const penetration = distance - allowed;
  car.x -= nx * penetration;
  car.y -= ny * penetration;
  const outward = car.vx * nx + car.vy * ny;
  if (outward > 0) {
    car.vx -= nx * outward * 1.48;
    car.vy -= ny * outward * 1.48;
    car.vx *= 0.86;
    car.vy *= 0.86;
    if (car.collisionCooldown <= 0) {
      spawnSparks(car.x, car.y, nx, ny, clamp(outward / 220, 0.3, 1));
      car.collisionCooldown = 0.18;
      if (car.player) {
        cameraShake = prefersReducedMotion ? 1 : clamp(outward * 0.055, 3, 11);
        audio.blip('impact', clamp(outward / 280, 0.25, 1));
        navigator.vibrate?.(Math.round(clamp(outward * 0.05, 8, 28)));
      }
    }
  }
}

function resolveCarCollisions() {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.airborne !== b.airborne || Math.abs(a.z - b.z) > 25) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const minimum = CAR_RADIUS * 2;
      if (distance <= 0 || distance >= minimum) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minimum - distance;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        const impulse = -relative * 0.72;
        a.vx -= nx * impulse * 0.5;
        a.vy -= ny * impulse * 0.5;
        b.vx += nx * impulse * 0.5;
        b.vy += ny * impulse * 0.5;
        if ((a.player || b.player) && Math.abs(relative) > 65) {
          cameraShake = prefersReducedMotion ? 1 : clamp(Math.abs(relative) * 0.035, 2, 8);
          audio.blip('impact', clamp(Math.abs(relative) / 220, 0.2, 0.7));
        }
      }
    }
  }
}

function recoverCar(car) {
  const index = (car.safeIndex - 6 + track.length) % track.length;
  const point = track[index];
  car.x = point.x;
  car.y = point.y;
  car.angle = Math.atan2(point.ty, point.tx);
  car.vx = point.tx * 40;
  car.vy = point.ty * 40;
  car.z = 0;
  car.vz = 0;
  car.airborne = false;
  car.trackIndex = index;
  car.previousTrackIndex = index;
  car.distanceFromRoad = 0;
  car.stuckTime = 0;
  car.jumpCooldown = 0.8;
  spawnBurst(car.x, car.y, '#f4efe0', 10, 90);
  if (car.player) {
    cameraShake = prefersReducedMotion ? 1 : 5;
    showRaceMessage('ОБРАТНО В ДЕЛО', 0.65);
  }
}

function addSkidMark(car) {
  const rearX = car.x - Math.cos(car.angle) * 18;
  const rearY = car.y - Math.sin(car.angle) * 18;
  const rightX = -Math.sin(car.angle);
  const rightY = Math.cos(car.angle);
  for (const side of [-1, 1]) {
    skidMarks.push({
      x1: rearX + rightX * side * 9,
      y1: rearY + rightY * side * 9,
      x2: rearX + rightX * side * 9 - car.vx * 0.018,
      y2: rearY + rightY * side * 9 - car.vy * 0.018,
      alpha: clamp(car.slip / 200, 0.12, 0.38)
    });
  }
  if (skidMarks.length > 760) skidMarks.splice(0, skidMarks.length - 760);
}

function spawnSparks(x, y, nx, ny, strength) {
  const count = Math.round(5 + strength * 9);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 1.5;
    const speed = lerp(60, 230, Math.random()) * strength;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: lerp(0.18, 0.42, Math.random()), maxLife: 0.42, size: lerp(1, 3, Math.random()), color: '#f0b63e', gravity: 80 });
  }
}

function spawnBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const magnitude = Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(angle) * magnitude, vy: Math.sin(angle) * magnitude, life: lerp(0.22, 0.55, Math.random()), maxLife: 0.55, size: lerp(2, 7, Math.random()), color, gravity: 0 });
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
  });
  particles = particles.filter((particle) => particle.life > 0);
  if (particles.length > 360) particles.splice(0, particles.length - 360);
}

function updateSimulation(dt) {
  if (mode === 'countdown') {
    countdownElapsed += dt;
    const remaining = 3.2 - countdownElapsed;
    const beat = Math.ceil(remaining);
    if (beat !== lastCountdownBeat && beat > 0 && beat <= 3) {
      lastCountdownBeat = beat;
      countdownNode.textContent = String(beat);
      audio.blip('countdown', 0.7);
      navigator.vibrate?.(8);
    }
    if (remaining <= 0) {
      mode = 'race';
      countdownNode.textContent = 'ПОШЁЛ';
      audio.blip('go', 1);
      navigator.vibrate?.([12, 35, 12]);
      setTimeout(() => {
        if (mode === 'race') countdownNode.hidden = true;
      }, 520);
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

  const recoveryNeeded = player.stuckTime > 1.55 || (player.airborne === false && player.distanceFromRoad > ROAD_HALF * 0.92);
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
