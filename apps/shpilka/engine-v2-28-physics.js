// ШПИЛЬКА 2.8 — slower acceleration, high-speed inertia and stable camera.
var shp28CameraBank = 0;
var shp28CameraHeading = 0;

var shp28BaseUpdateCar = updateCar;
updateCar = function shp28UpdateCar(car, dt) {
  const baseWidth = roadWidth;
  const baseHalf = roadHalf;
  const localHalf = shp28LocalHalf(car);
  roadHalf = localHalf;
  roadWidth = localHalf * 2;

  const oldAngle = car.angle || 0;
  const oldForward = (car.vx || 0) * Math.cos(oldAngle) + (car.vy || 0) * Math.sin(oldAngle);
  const oldLateral = (car.vx || 0) * -Math.sin(oldAngle) + (car.vy || 0) * Math.cos(oldAngle);
  shp28BaseUpdateCar(car, dt);

  const section = shp28SectionAtCar(car);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * rx + car.vy * ry;
  const ratio = clamp(Math.abs(forward) / MAX_SPEED, 0, 1);
  const freeOfImpact = (car.collisionCooldown || 0) <= 0.02;

  if (!car.airborne && freeOfImpact && forward > oldForward) {
    const skillFactor = car.player ? 1 : clamp(1 + ((car.skill || 1) - 1) * 0.30, 0.96, 1.06);
    const maximumAcceleration = lerp(178, 72, smoothstep(0.06, 1, ratio)) * skillFactor;
    forward = Math.min(forward, oldForward + maximumAcceleration * dt);
  }
  if (!car.airborne && freeOfImpact && oldForward > 0 && forward < oldForward && (car.brakeInput || 0) > 0.05) {
    const maximumBraking = lerp(610, 455, smoothstep(0.18, 1, ratio));
    forward = Math.max(forward, Math.max(0, oldForward - maximumBraking * dt));
  }

  if (!car.airborne) {
    const highSpeedLoad = smoothstep(0.48, 1, ratio);
    lateral = lerp(lateral, oldLateral, highSpeedLoad * 0.30);
    car.steerAngle *= lerp(1, 0.84, highSpeedLoad);
    const yawLimit = Math.max(0.18, Math.abs(forward) / CAR_WHEELBASE * Math.abs(Math.tan(car.steerAngle || 0)) * 0.90 + 0.16);
    car.yawRate = clamp(car.yawRate, -yawLimit, yawLimit);

    const grip = clamp(section?.grip || 1, 0.65, 1);
    if (grip < 0.999) {
      lateral = lerp(lateral, oldLateral, (1 - grip) * 0.62);
      car.yawRate *= lerp(0.985, 1.02, 1 - grip);
    }
    const extraDrag = section?.drag || 0;
    if (extraDrag > 0) forward *= Math.exp(-extraDrag * dt);
  }

  car.vx = fx * forward + rx * lateral;
  car.vy = fy * forward + ry * lateral;
  car.forwardSpeed = forward;
  car.lateralSpeed = lateral;

  if (!car.airborne && shp28InJumpGap(car)) {
    car.shp28GapTimer = (car.shp28GapTimer || 0) + dt;
    car.vx *= Math.exp(-3.2 * dt);
    car.vy *= Math.exp(-3.2 * dt);
    if (car.shp28GapTimer > 0.20) {
      if (car.player) showRaceMessage('НЕ ХВАТИЛО СКОРОСТИ', 0.75);
      recoverCar(car);
      car.shp28GapTimer = 0;
    }
  } else {
    car.shp28GapTimer = 0;
  }

  if ((car.collisionCooldown || 0) <= 0 && !car.airborne) car.bodyRattle = 0;
  roadWidth = baseWidth;
  roadHalf = baseHalf;
};

function shp28DrawSection(section) {
  const width = shp28BaseRoadWidth * section.width;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.terrain;
  ctx.lineWidth = shp28BaseRoadWidth + 82;
  ctx.stroke(section.path);
  ctx.strokeStyle = section.kind === 'gravel' ? theme.terrainDark : theme.shoulder;
  ctx.lineWidth = width + 52;
  ctx.stroke(section.path);
  ctx.strokeStyle = '#20231f';
  ctx.lineWidth = width + 14;
  ctx.stroke(section.path);
  ctx.strokeStyle = section.kind === 'gravel'
    ? theme.shoulder
    : section.kind === 'dam' || section.kind === 'compression'
      ? '#414844'
      : theme.asphalt;
  ctx.lineWidth = width;
  ctx.stroke(section.path);
  if (section.kind === 'gravel') {
    ctx.strokeStyle = 'rgba(238,226,199,0.18)';
    ctx.lineWidth = width * 0.72;
    ctx.setLineDash([7, 17]);
    ctx.stroke(section.path);
  }
  ctx.restore();

  const point = shp28PointAtDistance(section.center);
  if (!point) return;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  ctx.fillStyle = 'rgba(242,238,224,0.82)';
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(section.label, 0, -width * 0.5 - 22);
  ctx.restore();
}

function shp28DrawJump() {
  if (!shp28Jump) return;
  const takeoff = track[shp28Jump.takeoffIndex];
  if (!takeoff) return;
  const width = shp28BaseRoadWidth + 36;
  ctx.save();
  ctx.translate(takeoff.x, takeoff.y);
  ctx.rotate(takeoff.heading);
  ctx.fillStyle = '#161817';
  ctx.fillRect(36, -width * 0.58, shp28Jump.gapLength - 62, width * 1.16);
  ctx.fillStyle = theme.terrainDark;
  ctx.fillRect(36, -width * 0.58, 15, width * 1.16);
  ctx.fillRect(shp28Jump.gapLength - 42, -width * 0.58, 15, width * 1.16);

  ctx.fillStyle = '#d45731';
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-48, -shp28BaseRoadHalf + 10);
  ctx.lineTo(48, -shp28BaseRoadHalf + 18);
  ctx.lineTo(48, shp28BaseRoadHalf - 18);
  ctx.lineTo(-48, shp28BaseRoadHalf - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f2eee0';
  for (let y = -shp28BaseRoadHalf + 22; y < shp28BaseRoadHalf - 20; y += 28) {
    ctx.beginPath();
    ctx.moveTo(-28, y);
    ctx.lineTo(12, y + 11);
    ctx.lineTo(-28, y + 22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.font = '800 21px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ПРЫЖОК', -5, -shp28BaseRoadHalf - 26);
  ctx.fillStyle = '#d45731';
  ctx.fillRect(shp28Jump.gapLength - 60, -shp28BaseRoadHalf + 12, 52, shp28BaseRoadWidth - 24);
  ctx.restore();
}

var shp28BaseDrawTrackSurface = drawTrackSurface;
drawRamp = function shp28NoLegacyRamp() {};
drawTrackSurface = function shp28DrawTrackSurface() {
  shp28BaseDrawTrackSurface();
  for (const section of shp28Sections) shp28DrawSection(section);
  shp28DrawJump();
  drawFinishLine();
};

function shp28StableTrackHeading(focus) {
  const current = track[focus.trackIndex || 0];
  if (!current) return focus.angle || 0;
  const ahead = shp28PointAtDistance((current.distance || 0) + lerp(90, 260, clamp(Math.abs(focus.forwardSpeed || 0) / MAX_SPEED, 0, 1)));
  return ahead ? angleLerp(current.heading, ahead.heading, 0.34) : current.heading;
}

draw = function shp28Draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = theme?.terrain || '#d2c49d';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const focus = player || { x: track[0]?.x || 0, y: track[0]?.y || 0, angle: track[0]?.heading || 0, vx: 0, vy: 0, forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, trackIndex: 0 };
  const speed = Math.abs(focus.forwardSpeed || Math.hypot(focus.vx, focus.vy));
  const speedRatio = clamp(speed / MAX_SPEED, 0, 1);
  const targetZoom = clamp(0.88 - speed / 1750, 0.49, 0.84);
  cameraZoom = lerp(cameraZoom, targetZoom, mode === 'race' ? 0.065 : 0.035);
  cameraShake *= 0.84;
  if (cameraShake > 0.7) {
    cameraShakeX = (Math.random() - 0.5) * cameraShake;
    cameraShakeY = (Math.random() - 0.5) * cameraShake;
  } else {
    cameraShakeX *= 0.65;
    cameraShakeY *= 0.65;
  }

  const pathHeading = shp28StableTrackHeading(focus);
  const targetHeading = angleLerp(focus.angle || 0, pathHeading, smoothstep(0.42, 1, speedRatio) * 0.70);
  shp28CameraHeading = angleLerp(shp28CameraHeading || targetHeading, targetHeading, mode === 'race' ? 0.072 : 0.04);
  const forwardX = Math.cos(shp28CameraHeading);
  const forwardY = Math.sin(shp28CameraHeading);
  const rightX = -forwardY;
  const rightY = forwardX;
  const lead = 130 + speed * 0.31;
  const slipLead = clamp(focus.lateralSpeed || 0, -90, 90) * lerp(0.20, 0.08, speedRatio);
  const targetCameraX = focus.x + forwardX * lead + rightX * slipLead;
  const targetCameraY = focus.y + forwardY * lead + rightY * slipLead;
  cameraX = lerp(cameraX, targetCameraX, mode === 'race' ? 0.085 : 0.04);
  cameraY = lerp(cameraY, targetCameraY, mode === 'race' ? 0.085 : 0.04);
  cameraAngle = angleLerp(cameraAngle, shp28CameraHeading, mode === 'race' ? 0.085 : 0.04);
  const bankTarget = clamp(-(focus.yawRate || 0) * 0.012 - (focus.lateralSpeed || 0) / 7600, -0.038, 0.038);
  shp28CameraBank = lerp(shp28CameraBank, bankTarget, 0.075);

  ctx.save();
  ctx.translate(viewportWidth * 0.5 + cameraShakeX, viewportHeight * 0.49 + cameraShakeY);
  ctx.scale(cameraZoom, cameraZoom);
  ctx.rotate(-cameraAngle - Math.PI / 2 + shp28CameraBank);
  ctx.translate(-cameraX, -cameraY);
  drawWorldBackground();
  drawTrackSurface();
  drawSkidMarks();
  drawCars();
  drawParticles();
  ctx.restore();
  drawSpeedStreaks(speed);
  drawVignette(speed);
};