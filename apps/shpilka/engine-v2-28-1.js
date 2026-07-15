// ШПИЛЬКА 2.8.1 — iPhone startup hotfix: resilient loop and Path2D-free race renderer.
var shp281LastErrorKey = '';
var shp281LastErrorTime = 0;

function shp281ReportError(scope, error) {
  const message = error?.stack || error?.message || String(error);
  const key = `${scope}:${message}`;
  const now = performance.now();
  if (key !== shp281LastErrorKey || now - shp281LastErrorTime > 2500) console.error(`[ШПИЛЬКА/${scope}]`, error);
  shp281LastErrorKey = key;
  shp281LastErrorTime = now;
  window.__SHPILKA_LAST_ERROR__ = { scope, message, at: Date.now() };
}

function shp281Finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function shp281GuardAudio(name) {
  if (!audio || typeof audio[name] !== 'function' || audio[name].shp281Guarded) return;
  const original = audio[name];
  const guarded = function shp281SafeAudioMethod(...args) {
    try {
      return original.apply(audio, args);
    } catch (error) {
      shp281ReportError(`audio.${name}`, error);
      return undefined;
    }
  };
  guarded.shp281Guarded = true;
  audio[name] = guarded;
}

shp281GuardAudio('unlock');
shp281GuardAudio('update');
shp281GuardAudio('blip');

var shp281CurrentAiControls = aiControls;
aiControls = function shp281SafeAiControls(car, dt) {
  try {
    return shp281CurrentAiControls(car, dt);
  } catch (error) {
    shp281ReportError('ai', error);
    if (typeof shp28BaseAiControls === 'function') {
      try { return shp28BaseAiControls(car, dt); } catch (fallbackError) { shp281ReportError('ai-fallback', fallbackError); }
    }
    return { steer: 0, throttle: 0.45, brake: 0 };
  }
};

var shp281CurrentUpdateCar = updateCar;
updateCar = function shp281SafeUpdateCar(car, dt) {
  const previousWidth = roadWidth;
  const previousHalf = roadHalf;
  try {
    return shp281CurrentUpdateCar(car, dt);
  } catch (error) {
    shp281ReportError('car', error);
    roadWidth = previousWidth;
    roadHalf = previousHalf;
    if (typeof shp28BaseUpdateCar === 'function') {
      try { return shp28BaseUpdateCar(car, dt); } catch (fallbackError) { shp281ReportError('car-fallback', fallbackError); }
    }
    return undefined;
  } finally {
    roadWidth = previousWidth;
    roadHalf = previousHalf;
  }
};

var shp281CurrentSetupRace = setupRace;
setupRace = function shp281SetupRace() {
  shp281CurrentSetupRace();
  if (player) {
    shp28CameraHeading = shp281Finite(player.angle, 0);
    shp28CameraBank = 0;
    cameraAngle = shp28CameraHeading;
    cameraX = shp281Finite(player.x, 0);
    cameraY = shp281Finite(player.y, 0);
  }
};

function shp281AdvanceCountdownFallback(dt) {
  countdownElapsed += dt;
  const remaining = 3.15 - countdownElapsed;
  const beat = Math.ceil(remaining);
  if (beat !== lastCountdownBeat && beat > 0 && beat <= 3) {
    lastCountdownBeat = beat;
    countdownNode.textContent = String(beat);
  }
  if (remaining <= 0) {
    mode = 'race';
    countdownNode.textContent = 'ПОШЁЛ';
    setTimeout(() => {
      if (mode === 'race') countdownNode.hidden = true;
    }, 500);
  }
}

function shp281TraceTrack(step = 2) {
  if (!track.length) return false;
  ctx.beginPath();
  ctx.moveTo(track[0].x, track[0].y);
  for (let index = step; index < track.length; index += step) ctx.lineTo(track[index].x, track[index].y);
  ctx.closePath();
  return true;
}

function shp281DrawGround() {
  const bounds = track.bounds || { minX: -1400, maxX: 1400, minY: -1400, maxY: 1400 };
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
}

function shp281DrawBaseTrack() {
  if (!shp281TraceTrack(2)) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.shoulder;
  ctx.lineWidth = roadWidth + 52;
  ctx.stroke();
  ctx.strokeStyle = '#20231f';
  ctx.lineWidth = roadWidth + 14;
  ctx.stroke();
  ctx.strokeStyle = theme.asphalt;
  ctx.lineWidth = roadWidth;
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = 'rgba(242,238,224,0.20)';
  ctx.lineWidth = 3;
  ctx.setLineDash([28, 32]);
  ctx.stroke();
  ctx.restore();
}

function shp281TraceSection(section) {
  const steps = Math.max(8, Math.ceil(section.length / 34));
  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const point = shp28PointAtDistance(section.center - section.length * 0.5 + section.length * step / steps);
    if (!point) continue;
    if (step === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
}

function shp281DrawSections() {
  for (const section of shp28Sections || []) {
    const width = shp28BaseRoadWidth * section.width;
    shp281TraceSection(section);
    ctx.strokeStyle = section.kind === 'gravel' ? theme.terrainDark : theme.shoulder;
    ctx.lineWidth = width + 48;
    ctx.stroke();
    ctx.strokeStyle = '#20231f';
    ctx.lineWidth = width + 12;
    ctx.stroke();
    ctx.strokeStyle = section.kind === 'gravel' ? theme.shoulder : (section.kind === 'dam' || section.kind === 'compression' ? '#414844' : theme.asphalt);
    ctx.lineWidth = width;
    ctx.stroke();
    const point = shp28PointAtDistance(section.center);
    if (!point) continue;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(point.heading);
    ctx.fillStyle = 'rgba(242,238,224,0.82)';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(section.label, 0, -width * 0.5 - 20);
    ctx.restore();
  }
}

function shp281DrawTrack() {
  shp281DrawBaseTrack();
  shp281DrawSections();
  if (typeof shp28DrawJump === 'function') {
    try { shp28DrawJump(); } catch (error) { shp281ReportError('jump-render', error); }
  }
  try { drawFinishLine(); } catch (error) { shp281ReportError('finish-render', error); }
}

draw = function shp281Draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = theme?.terrain || '#d2c49d';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const fallbackPoint = track[0] || { x: 0, y: 0, heading: 0 };
  const focus = player && Number.isFinite(player.x) && Number.isFinite(player.y)
    ? player
    : { x: fallbackPoint.x, y: fallbackPoint.y, angle: fallbackPoint.heading, vx: 0, vy: 0, forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, trackIndex: 0 };
  const speed = Math.abs(shp281Finite(focus.forwardSpeed, Math.hypot(shp281Finite(focus.vx), shp281Finite(focus.vy))));
  const speedRatio = clamp(speed / MAX_SPEED, 0, 1);
  const currentPoint = track[focus.trackIndex || 0] || fallbackPoint;
  const aheadPoint = typeof shp28PointAtDistance === 'function'
    ? shp28PointAtDistance((currentPoint.distance || 0) + lerp(90, 250, speedRatio))
    : currentPoint;
  const roadHeading = aheadPoint?.heading ?? currentPoint.heading ?? focus.angle ?? 0;
  const targetHeading = angleLerp(shp281Finite(focus.angle, roadHeading), roadHeading, smoothstep(0.42, 1, speedRatio) * 0.68);

  if (!Number.isFinite(shp28CameraHeading)) shp28CameraHeading = targetHeading;
  shp28CameraHeading = angleLerp(shp28CameraHeading, targetHeading, mode === 'race' ? 0.09 : 0.15);
  const targetZoom = clamp(0.88 - speed / 1750, 0.49, 0.84);
  cameraZoom = Number.isFinite(cameraZoom) ? lerp(cameraZoom, targetZoom, mode === 'race' ? 0.065 : 0.08) : targetZoom;
  cameraShake = shp281Finite(cameraShake) * 0.82;
  cameraShakeX = cameraShake > 0.7 ? (Math.random() - 0.5) * cameraShake : shp281Finite(cameraShakeX) * 0.55;
  cameraShakeY = cameraShake > 0.7 ? (Math.random() - 0.5) * cameraShake : shp281Finite(cameraShakeY) * 0.55;

  const forwardX = Math.cos(shp28CameraHeading);
  const forwardY = Math.sin(shp28CameraHeading);
  const rightX = -forwardY;
  const rightY = forwardX;
  const lead = 130 + speed * 0.30;
  const slipLead = clamp(shp281Finite(focus.lateralSpeed), -90, 90) * lerp(0.20, 0.08, speedRatio);
  const targetCameraX = focus.x + forwardX * lead + rightX * slipLead;
  const targetCameraY = focus.y + forwardY * lead + rightY * slipLead;
  cameraX = Number.isFinite(cameraX) ? lerp(cameraX, targetCameraX, mode === 'race' ? 0.09 : 0.18) : targetCameraX;
  cameraY = Number.isFinite(cameraY) ? lerp(cameraY, targetCameraY, mode === 'race' ? 0.09 : 0.18) : targetCameraY;
  cameraAngle = Number.isFinite(cameraAngle) ? angleLerp(cameraAngle, shp28CameraHeading, mode === 'race' ? 0.09 : 0.18) : shp28CameraHeading;
  const bankTarget = clamp(-shp281Finite(focus.yawRate) * 0.012 - shp281Finite(focus.lateralSpeed) / 7600, -0.038, 0.038);
  shp28CameraBank = Number.isFinite(shp28CameraBank) ? lerp(shp28CameraBank, bankTarget, 0.075) : 0;

  ctx.save();
  try {
    ctx.translate(viewportWidth * 0.5 + cameraShakeX, viewportHeight * 0.49 + cameraShakeY);
    ctx.scale(cameraZoom, cameraZoom);
    ctx.rotate(-cameraAngle - Math.PI / 2 + shp28CameraBank);
    ctx.translate(-cameraX, -cameraY);
    shp281DrawGround();
    shp281DrawTrack();
    try { drawSkidMarks(); } catch (error) { shp281ReportError('skids-render', error); }
    try { drawCars(); } catch (error) { shp281ReportError('cars-render', error); }
    try { drawParticles(); } catch (error) { shp281ReportError('particles-render', error); }
  } finally {
    ctx.restore();
  }
  try { drawSpeedStreaks(speed); } catch (error) { shp281ReportError('streaks-render', error); }
  try { drawVignette(speed); } catch (error) { shp281ReportError('vignette-render', error); }
};

frame = function shp281Frame(now) {
  const elapsed = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  try {
    if (document.visibilityState === 'visible') {
      accumulator += elapsed;
      const fixedStep = 1 / 120;
      let iterations = 0;
      while (accumulator >= fixedStep && iterations < 8) {
        try {
          updateSimulation(fixedStep);
        } catch (error) {
          shp281ReportError('simulation', error);
          if (mode === 'countdown') shp281AdvanceCountdownFallback(fixedStep);
        }
        accumulator -= fixedStep;
        iterations += 1;
      }
      try { draw(); } catch (error) { shp281ReportError('frame-render', error); }
      try { audio.update(player, mode === 'race' || mode === 'countdown'); } catch (error) { shp281ReportError('frame-audio', error); }
    }
  } finally {
    requestAnimationFrame(frame);
  }
};
