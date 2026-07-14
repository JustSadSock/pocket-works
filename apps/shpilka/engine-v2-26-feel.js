// ШПИЛЬКА 2.6 — stronger body language, visible steering, load-aware audio and physical tyre smoke.

function shp26SpawnTyreSmoke(car) {
  const rearX = car.x - Math.cos(car.angle) * 20;
  const rearY = car.y - Math.sin(car.angle) * 20;
  const rightX = -Math.sin(car.angle);
  const rightY = Math.cos(car.angle);
  for (const side of [-1, 1]) {
    particles.push({
      x: rearX + rightX * side * 9,
      y: rearY + rightY * side * 9,
      vx: -car.vx * 0.10 + rightX * side * 9 + (Math.random() - 0.5) * 22,
      vy: -car.vy * 0.10 + rightY * side * 9 + (Math.random() - 0.5) * 22,
      life: 0.48,
      maxLife: 0.48,
      size: 3.5 + Math.random() * 3.5,
      color: '#d8d5ca',
      gravity: 0,
      kind: 'smoke'
    });
  }
}

var shp26FeelBaseUpdateCar = updateCar;
updateCar = function shp26FeelUpdateCar(car, dt) {
  shp26FeelBaseUpdateCar(car, dt);
  const rollTarget = clamp(-(car.lateralAccel || 0) / 1250 - (car.yawRate || 0) * 0.025, -0.18, 0.18);
  const pitchTarget = clamp(-(car.longitudinalAccel || 0) / 2800, -0.105, 0.105);
  car.shp26BodyRoll = lerp(car.shp26BodyRoll || 0, rollTarget, clamp(dt * 8.5, 0, 1));
  car.shp26BodyPitch = lerp(car.shp26BodyPitch || 0, pitchTarget, clamp(dt * 7.2, 0, 1));
  car.shp26Suspension = lerp(car.shp26Suspension || 0, clamp(Math.abs(car.lateralAccel || 0) / 2400 + Math.abs(car.longitudinalAccel || 0) / 4800, 0, 1), clamp(dt * 6, 0, 1));
  car.shp26SmokeTimer = Math.max(0, (car.shp26SmokeTimer || 0) - dt);

  const speed = Math.abs(car.forwardSpeed || 0);
  const smokeStrength = clamp(((car.slip || 0) - 52) / 105, 0, 1);
  if (!car.airborne && car.distanceFromRoad < roadHalf + 8 && speed > 155 && smokeStrength > 0 && car.shp26SmokeTimer <= 0) {
    shp26SpawnTyreSmoke(car);
    car.shp26SmokeTimer = lerp(0.085, 0.032, smokeStrength);
  }
};

var shp26FeelBaseUpdateParticles = updateParticles;
updateParticles = function shp26FeelUpdateParticles(dt) {
  shp26FeelBaseUpdateParticles(dt);
  for (const particle of particles) {
    if (particle.kind === 'smoke') particle.size += dt * 18;
  }
};

function shp26DrawWheel(x, y, steer, compression) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(steer);
  ctx.fillStyle = '#151715';
  ctx.fillRect(-6.2, -3.7 - compression, 12.4, 7.4 + compression * 2);
  ctx.fillStyle = '#5e625d';
  ctx.fillRect(-2.4, -2.2, 4.8, 4.4);
  ctx.restore();
}

function shp26DrawCarBody(car) {
  const roll = car.shp26BodyRoll || 0;
  const pitch = car.shp26BodyPitch || 0;
  const suspension = car.shp26Suspension || 0;
  const frontCompression = clamp(suspension * 0.8 + pitch * 3.2, 0, 1.2);
  const rearCompression = clamp(suspension * 0.8 - pitch * 3.2, 0, 1.2);
  const steer = clamp(car.steerAngle || 0, -0.62, 0.62);

  shp26DrawWheel(16.5, -14.2, steer, frontCompression);
  shp26DrawWheel(16.5, 14.2, steer, frontCompression);
  shp26DrawWheel(-16.5, -14.2, 0, rearCompression);
  shp26DrawWheel(-16.5, 14.2, 0, rearCompression);

  ctx.save();
  ctx.transform(1, pitch * 0.14, roll * 0.16, 1, pitch * 12, roll * 15);
  ctx.fillStyle = car.color;
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(19, 12.1);
  ctx.lineTo(-16, 12.5);
  ctx.lineTo(-27, 7.2);
  ctx.lineTo(-27, -7.2);
  ctx.lineTo(-16, -12.5);
  ctx.lineTo(19, -12.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = car.accent;
  ctx.beginPath();
  ctx.moveTo(25, 0);
  ctx.lineTo(12, 3.8);
  ctx.lineTo(-22, 3.8);
  ctx.lineTo(-22, -3.8);
  ctx.lineTo(12, -3.8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#202623';
  ctx.fillRect(-7, -8.2, 15, 16.4);
  ctx.fillStyle = '#91a5a0';
  ctx.fillRect(-1.5, -6.1, 7.6, 12.2);

  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(18.5, -13);
  ctx.lineTo(18.5, 13);
  ctx.stroke();

  if ((car.brakeInput || 0) > 0.12) {
    ctx.fillStyle = `rgba(230,74,48,${0.48 + car.brakeInput * 0.48})`;
    ctx.fillRect(-27.8, -8.7, 3.4, 5.4);
    ctx.fillRect(-27.8, 3.3, 3.4, 5.4);
  }
  if ((car.throttleInput || 0) > 0.72 && Math.abs(car.forwardSpeed || 0) > 110) {
    ctx.fillStyle = `rgba(240,182,62,${0.30 + car.throttleInput * 0.34})`;
    const length = 3 + Math.sin(raceElapsed * 48 + car.aiPhase) * 1.8;
    ctx.beginPath();
    ctx.moveTo(-27, -2.2);
    ctx.lineTo(-27 - length, 0);
    ctx.lineTo(-27, 2.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

drawCar = function shp26DrawCar(car) {
  const immunity = car.shp24RecoveryImmunity || 0;
  const elevationScale = 1 + clamp((car.z || 0) / 850, 0, 0.085);
  const shadowOffset = 5 + (car.z || 0) * 0.17;
  const bodyLift = (car.z || 0) * 0.08;

  ctx.save();
  if (immunity > 0) ctx.globalAlpha *= 0.48 + Math.sin(raceElapsed * 15) * 0.08;

  ctx.save();
  ctx.translate(car.x + shadowOffset, car.y + shadowOffset * 0.72);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);
  ctx.globalAlpha *= car.airborne ? 0.20 : 0.32;
  ctx.fillStyle = '#151715';
  ctx.beginPath();
  ctx.ellipse(0, 0, 28, 14, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y - bodyLift);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);
  shp26DrawCarBody(car);
  ctx.restore();

  ctx.restore();
};

drawParticles = function shp26DrawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    if (particle.kind === 'dust' || particle.kind === 'smoke') {
      ctx.globalAlpha = alpha * (particle.kind === 'smoke' ? 0.24 : 0.42);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - particle.size * 0.5, particle.y - particle.size * 0.5, particle.size, particle.size);
    }
  }
  ctx.globalAlpha = 1;
};

var shp26FeelBaseAudioUpdate = audio.update.bind(audio);
audio.update = function shp26AudioUpdate(car, active) {
  shp26FeelBaseAudioUpdate(car, active);
  if (!this.context || !this.engine || !this.engineGain || !car) return;
  const now = this.context.currentTime;
  const speed = Math.abs(car.forwardSpeed || 0);
  const load = clamp((car.throttleInput || 0) * (1.15 - speed / (MAX_SPEED * 1.25)) + (car.brakeInput || 0) * 0.18, 0, 1);
  this.engine.detune?.setTargetAtTime(load * 88 - (car.brakeInput || 0) * 24, now, 0.05);
  const loadedGain = 0.052 + speed / MAX_SPEED * 0.115 + (car.throttleInput || 0) * 0.032 + load * 0.035;
  this.engineGain.gain.setTargetAtTime(active && this.enabled ? loadedGain : 0, now, 0.055);
};

audio.contactSound = function shp26ContactSound(kind, strength = 1) {
  if (!this.context || !this.master || !this.enabled) return;
  const now = this.context.currentTime;
  const oscillator = this.context.createOscillator();
  const gain = this.context.createGain();
  const filter = this.context.createBiquadFilter();
  const heavy = kind === 'head-on' || kind === 'wall-hit';
  const scrape = kind === 'side' || kind === 'wall-glance';
  oscillator.type = heavy ? 'square' : scrape ? 'sawtooth' : 'triangle';
  const frequency = heavy ? 54 : scrape ? 186 : 92;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(heavy ? 32 : scrape ? 92 : 48, now + (scrape ? 0.13 : 0.09));
  filter.type = 'lowpass';
  filter.frequency.value = heavy ? 520 : scrape ? 1250 : 780;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.025 + clamp(strength / 180, 0, 1) * (heavy ? 0.12 : 0.075), now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (scrape ? 0.14 : 0.11));
  oscillator.connect(filter).connect(gain).connect(this.master);
  oscillator.start(now);
  oscillator.stop(now + 0.16);
};

var shp26FeelBaseMarkImpact = shp25MarkImpact;
shp25MarkImpact = function shp26MarkImpact(car, strength, kind) {
  shp26FeelBaseMarkImpact(car, strength, kind);
  if (!car?.player || strength < 12) return;
  if (raceElapsed - (audio.shp26LastContact || -Infinity) < 0.13) return;
  audio.shp26LastContact = raceElapsed;
  audio.contactSound(kind, strength);
};
