import { readFile, writeFile } from 'node:fs/promises';

async function transform(path, fn) {
  const source = await readFile(path, 'utf8');
  const next = fn(source);
  if (next === source) throw new Error(`No changes produced for ${path}`);
  await writeFile(path, next);
}

function replaceBlock(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Could not replace block ${startMarker} -> ${endMarker}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceExact(source, before, after) {
  if (!source.includes(before)) throw new Error(`Expected fragment not found: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

const velocityState = `let speedFeel = 0;
let cameraSurge = 0;
let draftFeel = 0;
let previousSpeed = 0;
let visualTime = 0;
let roadHapticTimer = 0;`;

const engineAudio = `class EngineAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engine = null;
    this.harmonic = null;
    this.engineGain = null;
    this.wind = null;
    this.windGain = null;
    this.windFilter = null;
    this.tire = null;
    this.tireGain = null;
    this.body = null;
    this.bodyGain = null;
    this.noise = null;
  }

  async unlock() {
    if (!settings.sound) return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.78;
      this.master.connect(this.context.destination);

      const engineFilter = this.context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 760;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0.0001;
      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.harmonic = this.context.createOscillator();
      this.harmonic.type = 'square';
      const harmonicGain = this.context.createGain();
      harmonicGain.gain.value = 0.055;
      this.engine.connect(engineFilter);
      this.harmonic.connect(harmonicGain).connect(engineFilter);
      engineFilter.connect(this.engineGain).connect(this.master);

      const length = Math.floor(this.context.sampleRate * 1.1);
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;

      this.wind = this.context.createBufferSource();
      this.wind.buffer = this.noise;
      this.wind.loop = true;
      this.windFilter = this.context.createBiquadFilter();
      this.windFilter.type = 'highpass';
      this.windFilter.frequency.value = 420;
      this.windGain = this.context.createGain();
      this.windGain.gain.value = 0.0001;
      this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

      this.tire = this.context.createBufferSource();
      this.tire.buffer = this.noise;
      this.tire.loop = true;
      const tireFilter = this.context.createBiquadFilter();
      tireFilter.type = 'bandpass';
      tireFilter.frequency.value = 190;
      tireFilter.Q.value = 0.8;
      this.tireGain = this.context.createGain();
      this.tireGain.gain.value = 0.0001;
      this.tire.connect(tireFilter).connect(this.tireGain).connect(this.master);

      this.body = this.context.createOscillator();
      this.body.type = 'triangle';
      this.body.frequency.value = 46;
      this.bodyGain = this.context.createGain();
      this.bodyGain.gain.value = 0.0001;
      this.body.connect(this.bodyGain).connect(this.master);

      this.engine.start();
      this.harmonic.start();
      this.wind.start();
      this.tire.start();
      this.body.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(speed, active, feel = 0, load = 0, drafting = 0) {
    if (!this.context || !settings.sound) return;
    const now = this.context.currentTime;
    const rpm = 38 + speed * 1.42;
    this.engine.frequency.setTargetAtTime(rpm, now, 0.028);
    this.harmonic.frequency.setTargetAtTime(rpm * 2.04, now, 0.028);
    this.engineGain.gain.setTargetAtTime(active ? 0.055 + feel * 0.055 : 0.0001, now, 0.045);
    this.windFilter.frequency.setTargetAtTime(420 + feel * 2700 + drafting * 600, now, 0.05);
    this.windGain.gain.setTargetAtTime(active ? 0.001 + feel ** 1.55 * 0.15 + drafting * 0.035 : 0.0001, now, 0.065);
    this.tireGain.gain.setTargetAtTime(active ? 0.001 + feel * 0.027 + Math.abs(steer) * feel * 0.012 : 0.0001, now, 0.055);
    this.body.frequency.setTargetAtTime(42 + feel * 20, now, 0.08);
    this.bodyGain.gain.setTargetAtTime(active ? 0.004 + feel * 0.014 + Math.abs(load) * 0.018 : 0.0001, now, 0.06);
  }

  beep(frequency = 520, duration = 0.09, gainValue = 0.11) {
    if (!this.context || !settings.sound) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  impact(strength = 1) {
    if (!this.context || !settings.sound || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = 130 + strength * 220;
    gain.gain.setValueAtTime(0.15 * strength, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.2);
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start();
  }

  mute() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const gain of [this.engineGain, this.windGain, this.tireGain, this.bodyGain]) {
      gain?.gain.setTargetAtTime(0.0001, now, 0.03);
    }
  }
}

`;

const velocityHelpers = `function speedCurve(speed) {
  const value = clamp((speed - 32) / (MAX_SPEED - 32), 0, 1);
  return value * value * (3 - 2 * value);
}

function hash01(value) {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function updateVelocityFeedback(delta, frameStartSpeed, drafting) {
  const target = speedCurve(player.speed);
  speedFeel += (target - speedFeel) * (1 - Math.exp(-delta * 3.6));
  const acceleration = (player.speed - frameStartSpeed) / Math.max(delta, 0.001);
  const surgeTarget = clamp(-acceleration / 92, -1, 1);
  cameraSurge += (surgeTarget - cameraSurge) * (1 - Math.exp(-delta * 7));
  draftFeel += (drafting - draftFeel) * (1 - Math.exp(-delta * 5));
  previousSpeed = player.speed;

  roadHapticTimer -= delta;
  if (mode === 'racing' && speedFeel > 0.58 && Math.abs(player.x) < 0.92 && roadHapticTimer <= 0) {
    haptic(3);
    roadHapticTimer = lerp(0.46, 0.2, speedFeel);
  }
}

window.__petlyaVelocity = {
  getState() {
    return {
      speed: player.speed,
      speedFeel,
      cameraSurge,
      draftFeel
    };
  }
};

`;

const resetRace = `function resetRace() {
  Object.assign(player, { distance: 0, speed: 0, x: 0, lap: 1 });
  bots = makeBots();
  raceTime = 0;
  lapStart = 0;
  bestLap = Infinity;
  passes = 0;
  previousPosition = 6;
  collisionCooldown = 0;
  shake = 0;
  lastGear = 1;
  steer = 0;
  steerTarget = 0;
  throttle = false;
  braking = false;
  speedFeel = 0;
  cameraSurge = 0;
  draftFeel = 0;
  previousSpeed = 0;
  visualTime = 0;
  roadHapticTimer = 0;
  updateHud();
}

`;

const updateRace = `function updateRace(delta) {
  if (mode === 'countdown') {
    countdown -= delta;
    const mark = Math.ceil(countdown);
    if (mark !== countMark && mark > 0 && mark <= 3) {
      countMark = mark;
      say(String(mark), 720);
      audio.beep(360 + (3 - mark) * 70, 0.11, 0.14);
      haptic(18);
    }
    if (countdown <= 0) {
      mode = 'racing';
      say('СТАРТ', 760);
      audio.beep(780, 0.18, 0.18);
      haptic([25, 28, 34]);
    }
    return;
  }

  if (mode !== 'racing') return;

  raceTime += delta * 1000;
  collisionCooldown = Math.max(0, collisionCooldown - delta);
  steer += (steerTarget - steer) * Math.min(1, delta * 9.5);

  const curve = trackAt(player.distance + 75).curve;
  const drafting = draftStrength();
  const limit = MAX_SPEED + drafting * 19;
  const frameStartSpeed = player.speed;
  const engineForce = throttle ? 78 * (1 - player.speed / (limit + 48)) : 0;
  const drag = 7 + player.speed * 0.027;
  player.speed = clamp(player.speed + (engineForce - (braking ? 142 : 0) - drag) * delta, 0, limit);
  updateVelocityFeedback(delta, frameStartSpeed, drafting);

  player.x += steer * (0.28 + player.speed / MAX_SPEED * 0.84) * delta;
  player.x -= curve * (player.speed / MAX_SPEED) ** 2 * 0.2 * delta;

  if (Math.abs(player.x) > 0.92) {
    player.speed = Math.max(0, player.speed - 86 * delta);
    shake = Math.max(shake, 2 + player.speed / 120);
  }
  if (Math.abs(player.x) > 1.14) {
    player.x = Math.sign(player.x) * 1.14;
    player.speed *= 0.75;
    shake = Math.max(shake, 8);
    audio.impact(0.7);
    haptic([24, 18, 22]);
  }

  const before = player.distance;
  player.distance += player.speed / 3.6 * delta;
  updateBots(delta);
  collide();

  const oldLap = Math.floor(before / TRACK_LENGTH);
  const newLap = Math.floor(player.distance / TRACK_LENGTH);
  if (newLap > oldLap && newLap < LAPS) {
    const lapTime = raceTime - lapStart;
    lapStart = raceTime;
    bestLap = Math.min(bestLap, lapTime);
    player.lap = newLap + 1;
    say(player.lap === LAPS ? 'ПОСЛЕДНИЙ КРУГ' : \`КРУГ \${player.lap}\`, 1150);
    audio.beep(660, 0.16, 0.13);
    haptic([20, 20, 20]);
  }

  const currentPosition = position();
  if (currentPosition < previousPosition) passes += previousPosition - currentPosition;
  previousPosition = currentPosition;

  const gear = clamp(Math.floor(player.speed / 49) + 1, 1, 6);
  if (gear !== lastGear && player.speed > 18) {
    lastGear = gear;
    audio.beep(92 + gear * 18, 0.035, 0.034);
    haptic(8);
  }

  draftBadge.hidden = drafting < 0.12;
  if (!draftBadge.hidden) draftBadge.querySelector('b').textContent = \`+\${Math.round(drafting * 19)}\`;
  if (player.distance >= LAPS * TRACK_LENGTH) finish();
  updateHud();
}

`;

const buildRoad = `function buildRoad() {
  const fov = speedFeel ** 1.25;
  const horizon = height * (0.305 - fov * 0.034 + cameraSurge * 0.01);
  const bottom = height * (0.79 + fov * 0.052 + cameraSurge * 0.015);
  nearHalf = Math.max(width * (0.42 + fov * 0.082), 290);
  const farHalf = Math.max(width * (0.0055 - fov * 0.0012), 4);
  const points = [];
  let heading = 0;
  let lateral = 0;
  let elevation = 0;
  const roadBuzz = Math.sin(visualTime * (13 + speedFeel * 17)) * speedFeel * height * 0.0017;

  for (let i = 0; i <= DRAW_DISTANCE; i += 1) {
    const progress = i / DRAW_DISTANCE;
    const near = 1 - progress;
    const sampleDistance = player.distance + i * SEGMENT_LENGTH;
    const segment = trackAt(sampleDistance);
    heading += segment.curve * 0.0078;
    lateral += heading;
    elevation += segment.elevation * 0.0026;
    const perspective = near ** (2.42 - fov * 0.28);
    const half = farHalf + (nearHalf - farHalf) * perspective;
    const y = horizon + (bottom - horizon) * near ** (2.14 - fov * 0.16) - elevation * height * near * 0.56 + roadBuzz * near;
    const curveOffset = lateral * width * 0.0069 * (0.3 + near * 0.7);
    const x = width * 0.5 - player.x * half * 0.93 + curveOffset;
    points.push({ x, y, half, distance: i * SEGMENT_LENGTH, near, progress, sampleDistance });
  }

  roadPoints = points;
  return points;
}

`;

const drawRoad = `function drawRoad(points) {
  pathStrip(points, 1.29, '#343b35');
  pathStrip(points, 1.19, '#71796e');
  pathStrip(points, 1.075, '#d3bf96');

  const asphalt = ctx.createLinearGradient(0, height * 0.27, 0, height * 0.86);
  asphalt.addColorStop(0, '#4b504d');
  asphalt.addColorStop(0.52, '#292e2c');
  asphalt.addColorStop(1, '#101411');
  pathStrip(points, 1, asphalt);

  const strokeRoadLine = (offset, color, lineWidth, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x + point.half * offset;
      if (index === 0) ctx.moveTo(x, point.y);
      else ctx.lineTo(x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  };

  strokeRoadLine(-0.985, '#efe0bd', 2.1, 0.82);
  strokeRoadLine(0.985, '#efe0bd', 2.1, 0.82);
  strokeRoadLine(-0.31, '#080b09', 5.2, 0.21 + speedFeel * 0.08);
  strokeRoadLine(0.31, '#080b09', 5.2, 0.21 + speedFeel * 0.08);
  strokeRoadLine(-0.23, '#767d78', 1, 0.12);
  strokeRoadLine(0.23, '#767d78', 1, 0.12);

  const maxDistance = DRAW_DISTANCE * SEGMENT_LENGTH - 2;
  const grainSpacing = lerp(48, 25, speedFeel);
  let textureOffset = grainSpacing - mod(player.distance * 1.3, grainSpacing);
  ctx.save();
  ctx.lineCap = 'round';
  for (let distance = textureOffset; distance < maxDistance; distance += grainSpacing) {
    if (distance < 6) continue;
    const cell = Math.floor((player.distance + distance) / grainSpacing);
    const lane = hash01(cell * 3.17) * 1.72 - 0.86;
    const start = pointAt(distance);
    const streakLength = 4 + speedFeel * 34 * (0.35 + start.half / nearHalf * 0.65);
    const end = pointAt(Math.min(distance + streakLength, maxDistance));
    const jitter = (hash01(cell * 7.31) - 0.5) * 0.08;
    const alpha = 0.06 + speedFeel * 0.18 + start.half / nearHalf * 0.06;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = hash01(cell * 1.91) > 0.63 ? '#a8a599' : '#0b0e0c';
    ctx.lineWidth = Math.max(0.7, start.half / nearHalf * (1.1 + speedFeel * 2.2));
    ctx.beginPath();
    ctx.moveTo(start.x + start.half * lane, start.y);
    ctx.lineTo(end.x + end.half * (lane + jitter), end.y);
    ctx.stroke();
  }
  ctx.restore();

  const kerbLength = 28;
  const kerbCycle = 56;
  let offset = kerbCycle - mod(player.distance, kerbCycle);
  let kerbIndex = Math.floor(player.distance / kerbCycle);
  for (let distance = offset; distance < maxDistance; distance += kerbCycle) {
    const a = pointAt(distance);
    const b = pointAt(Math.min(distance + kerbLength, maxDistance));
    const fill = kerbIndex % 2 === 0 ? '#d75b35' : '#eee0bf';
    quad(
      { x: a.x - a.half * 1.075, y: a.y },
      { x: a.x - a.half * 1.006, y: a.y },
      { x: b.x - b.half * 1.006, y: b.y },
      { x: b.x - b.half * 1.075, y: b.y },
      fill
    );
    quad(
      { x: a.x + a.half * 1.006, y: a.y },
      { x: a.x + a.half * 1.075, y: a.y },
      { x: b.x + b.half * 1.075, y: b.y },
      { x: b.x + b.half * 1.006, y: b.y },
      fill
    );
    kerbIndex += 1;
  }

  const dashLength = 24;
  const dashCycle = 76;
  offset = dashCycle - mod(player.distance, dashCycle);
  for (let distance = offset; distance < maxDistance; distance += dashCycle) {
    const a = pointAt(distance);
    const b = pointAt(Math.min(distance + dashLength + speedFeel * 6, maxDistance));
    const widthA = Math.max(0.8, a.half * 0.0058);
    const widthB = Math.max(0.4, b.half * 0.0058);
    quad(
      { x: a.x - widthA, y: a.y },
      { x: a.x + widthA, y: a.y },
      { x: b.x + widthB, y: b.y },
      { x: b.x - widthB, y: b.y },
      '#e2dcc9'
    );
  }

  const reflectorSpacing = 52;
  offset = reflectorSpacing - mod(player.distance * 1.08, reflectorSpacing);
  for (let distance = offset; distance < maxDistance; distance += reflectorSpacing) {
    if (distance < 18) continue;
    const point = pointAt(distance);
    const size = Math.max(0.7, point.half / nearHalf * 4.2);
    ctx.globalAlpha = 0.35 + speedFeel * 0.35;
    ctx.fillStyle = '#f1d66c';
    ctx.fillRect(point.x - point.half * 0.94 - size, point.y - size * 0.5, size * 1.8, size);
    ctx.fillRect(point.x + point.half * 0.94 - size, point.y - size * 0.5, size * 1.8, size);
  }
  ctx.globalAlpha = 1;
}

`;

const drawTrackside = `function drawTrackside() {
  const drawRail = (side, multiplier, color, lineWidth) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 2; i < roadPoints.length; i += 1) {
      const point = roadPoints[i];
      const x = point.x + side * point.half * multiplier;
      if (i === 2) ctx.moveTo(x, point.y - 4);
      else ctx.lineTo(x, point.y - 4);
    }
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  drawRail(-1, 1.22, '#d9d3bd', 5);
  drawRail(1, 1.22, '#d9d3bd', 5);
  drawRail(-1, 1.26, '#222824', 2);
  drawRail(1, 1.26, '#222824', 2);

  const panelSpacing = lerp(112, 72, speedFeel);
  let offset = panelSpacing - mod(player.distance * 1.17, panelSpacing);
  let index = Math.floor(player.distance / panelSpacing);
  for (let distance = offset; distance < 760; distance += panelSpacing) {
    if (distance < 14) continue;
    const point = pointAt(distance);
    const scale = clamp(point.half / nearHalf, 0.055, 1.1);
    for (const side of [-1, 1]) {
      const x = point.x + side * point.half * 1.36;
      const postHeight = 44 * scale;
      const panelWidth = 34 * scale;
      ctx.fillStyle = '#151a17';
      ctx.fillRect(x - 2 * scale, point.y - postHeight, 4 * scale, postHeight);
      ctx.fillStyle = index % 3 === 0 ? '#d75b35' : index % 3 === 1 ? '#e1bd4e' : '#d9d3bd';
      ctx.fillRect(x - panelWidth * 0.5, point.y - postHeight, panelWidth, 11 * scale);
      if (speedFeel > 0.22 && scale > 0.14) {
        ctx.globalAlpha = speedFeel * scale * 0.35;
        ctx.strokeStyle = '#e9ddbe';
        ctx.lineWidth = Math.max(1, scale * 1.7);
        ctx.beginPath();
        ctx.moveTo(x, point.y - postHeight * 0.7);
        ctx.lineTo(x + side * (18 + 52 * speedFeel) * scale, point.y - postHeight * 0.54 + 4 * scale);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    index += 1;
  }

  const containerSpacing = 410;
  offset = containerSpacing - mod(player.distance + 140, containerSpacing);
  index = 0;
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += containerSpacing) {
    if (distance < 190) continue;
    const point = pointAt(distance);
    const scale = clamp(point.half / nearHalf, 0.04, 0.72);
    const side = index % 2 === 0 ? -1 : 1;
    const baseX = point.x + side * point.half * 1.64;
    const w = 150 * scale;
    const h = 42 * scale;
    for (let row = 0; row < 2 + (index % 2); row += 1) {
      ctx.fillStyle = ['#9d4229', '#28574f', '#b48639'][Math.abs(index + row) % 3];
      ctx.fillRect(baseX - w * 0.5, point.y - h * (row + 1), w, h - 2 * scale);
      ctx.strokeStyle = 'rgba(20,24,21,.45)';
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeRect(baseX - w * 0.5, point.y - h * (row + 1), w, h - 2 * scale);
    }
    index += 1;
  }

  const gantryDistance = 930 - mod(player.distance, 1180);
  if (gantryDistance > 150 && gantryDistance < DRAW_DISTANCE * SEGMENT_LENGTH) {
    const point = pointAt(gantryDistance);
    const scale = clamp(point.half / nearHalf, 0.05, 1);
    const beamY = point.y - 105 * scale;
    const left = point.x - point.half * 1.22;
    const right = point.x + point.half * 1.22;
    ctx.fillStyle = '#171c19';
    ctx.fillRect(left - 5 * scale, beamY, 10 * scale, point.y - beamY);
    ctx.fillRect(right - 5 * scale, beamY, 10 * scale, point.y - beamY);
    ctx.fillRect(left, beamY, right - left, 18 * scale);
    ctx.fillStyle = '#d85a31';
    ctx.fillRect(point.x - point.half * 0.34, beamY + 3 * scale, point.half * 0.68, 12 * scale);
    if (scale > 0.14) {
      ctx.fillStyle = '#f0e4c8';
      ctx.font = \`900 \${Math.max(7, 18 * scale)}px ui-monospace, monospace\`;
      ctx.textAlign = 'center';
      ctx.fillText('SECTOR 17', point.x, beamY + 14 * scale);
    }
  }
}

`;

const carAndVelocity = `function drawCar(bot, point, distance) {
  const perspective = clamp(point.half / nearHalf, 0.018, 1.14);
  const relativeSpeed = player.speed - bot.speed;
  const closing = clamp(relativeSpeed / 90, -1, 1);
  const carWidth = Math.max(10, 148 * perspective ** 0.9 * (1 + Math.max(0, closing) * 0.07));
  const carHeight = carWidth * 0.49;
  const x = point.x + bot.x * point.half * 0.84;
  const y = point.y - carHeight * 0.58;

  ctx.save();
  ctx.translate(x, y);

  if (speedFeel > 0.18 && distance < 520) {
    const wake = (0.12 + speedFeel * 0.34) * (1 + Math.max(0, closing));
    ctx.globalAlpha = wake;
    ctx.strokeStyle = '#d9dfd0';
    ctx.lineWidth = Math.max(0.8, carWidth * 0.012);
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * carWidth * 0.16, carHeight * 0.56);
      ctx.lineTo(i * carWidth * 0.2, carHeight * (0.98 + speedFeel * 0.55));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 0.14 + perspective * 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, carHeight * 0.72, carWidth * 0.66, carHeight * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#0d110f';
  ctx.fillRect(-carWidth * 0.57, carHeight * 0.18, carWidth * 0.17, carHeight * 0.57);
  ctx.fillRect(carWidth * 0.4, carHeight * 0.18, carWidth * 0.17, carHeight * 0.57);
  ctx.fillStyle = '#111512';
  ctx.fillRect(-carWidth * 0.67, -carHeight * 0.16, carWidth * 1.34, carHeight * 0.1);
  ctx.fillStyle = bot.color;
  ctx.fillRect(-carWidth * 0.58, -carHeight * 0.08, carWidth * 1.16, carHeight * 0.13);

  ctx.beginPath();
  ctx.moveTo(-carWidth * 0.48, carHeight * 0.64);
  ctx.lineTo(-carWidth * 0.37, carHeight * 0.02);
  ctx.lineTo(-carWidth * 0.18, -carHeight * 0.12);
  ctx.lineTo(carWidth * 0.18, -carHeight * 0.12);
  ctx.lineTo(carWidth * 0.37, carHeight * 0.02);
  ctx.lineTo(carWidth * 0.48, carHeight * 0.64);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#171c19';
  ctx.fillRect(-carWidth * 0.24, carHeight * 0.06, carWidth * 0.48, carHeight * 0.22);
  ctx.fillStyle = bot.stripe;
  ctx.fillRect(-carWidth * 0.06, -carHeight * 0.08, carWidth * 0.12, carHeight * 0.7);
  ctx.fillStyle = '#090c0a';
  ctx.fillRect(-carWidth * 0.43, carHeight * 0.56, carWidth * 0.86, carHeight * 0.13);
  ctx.fillStyle = '#df5b35';
  ctx.fillRect(-carWidth * 0.06, carHeight * 0.43, carWidth * 0.12, carHeight * 0.08);

  if (perspective > 0.1) {
    ctx.fillStyle = '#efe4cb';
    ctx.font = \`900 \${Math.max(7, carWidth * 0.09)}px ui-monospace, monospace\`;
    ctx.textAlign = 'center';
    ctx.fillText(bot.id, 0, carHeight * 0.62);
  }

  if (distance < 430 && distance > 0 && perspective > 0.15) {
    const tagWidth = Math.max(48, carWidth * 0.7);
    ctx.fillStyle = 'rgba(12,16,14,.78)';
    ctx.fillRect(-tagWidth / 2, -carHeight * 0.62, tagWidth, Math.max(13, carHeight * 0.2));
    ctx.fillStyle = '#eee3c8';
    ctx.font = \`800 \${Math.max(7, carWidth * 0.07)}px ui-monospace, monospace\`;
    ctx.fillText(bot.name, 0, -carHeight * 0.46);
  }

  ctx.restore();
}

function drawBots() {
  bots
    .map((bot) => ({ bot, distance: bot.distance - player.distance }))
    .filter((entry) => entry.distance > -86 && entry.distance < DRAW_DISTANCE * SEGMENT_LENGTH)
    .sort((a, b) => b.distance - a.distance)
    .forEach((entry) => {
      let point;
      if (entry.distance >= 5) {
        point = pointAt(entry.distance);
      } else {
        const passed = clamp(-entry.distance / 86, 0, 1);
        const base = roadPoints[0];
        point = {
          x: base.x,
          y: base.y + passed * height * 0.34,
          half: nearHalf * (1 + passed * 0.2)
        };
      }
      drawCar(entry.bot, point, entry.distance);
    });
}

function drawVelocityFX() {
  if (speedFeel <= 0.035) return;
  ctx.save();
  const intensity = speedFeel ** 1.25;
  const phase = mod(player.distance * 2.3, 137);

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#f3e7c8';
  for (let i = 0; i < 13; i += 1) {
    const seed = i * 91.7;
    const y = height * 0.42 + mod(seed + phase * (1 + i * 0.035), height * 0.48);
    const side = i % 2 === 0 ? -1 : 1;
    const x = side < 0 ? width * (0.015 + hash01(seed) * 0.12) : width * (0.985 - hash01(seed) * 0.12);
    const length = (18 + hash01(seed * 1.7) * 42) * (0.35 + intensity * 1.35);
    ctx.globalAlpha = intensity * (0.08 + hash01(seed * 2.1) * 0.2);
    ctx.lineWidth = 0.8 + intensity * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - side * length, y + length * 0.08);
    ctx.stroke();
  }

  const dustSpacing = 74;
  let offset = dustSpacing - mod(player.distance * 1.75, dustSpacing);
  for (let distance = offset; distance < 620; distance += dustSpacing) {
    if (distance < 20) continue;
    const point = pointAt(distance);
    const cell = Math.floor((player.distance + distance) / dustSpacing);
    const lane = hash01(cell * 8.13) * 2.2 - 1.1;
    const x = point.x + point.half * lane;
    const scale = clamp(point.half / nearHalf, 0.04, 1);
    ctx.globalAlpha = intensity * scale * 0.42;
    ctx.fillStyle = hash01(cell * 2.7) > 0.5 ? '#e5d5af' : '#7d796a';
    ctx.beginPath();
    ctx.ellipse(x, point.y - 2 * scale, (2 + intensity * 7) * scale, Math.max(0.7, 1.5 * scale), 0, 0, TAU);
    ctx.fill();
  }

  if (draftFeel > 0.08) {
    ctx.strokeStyle = '#d8e9df';
    ctx.lineWidth = 1.2;
    for (let i = -2; i <= 2; i += 1) {
      ctx.globalAlpha = draftFeel * (0.08 + (2 - Math.abs(i)) * 0.035);
      ctx.beginPath();
      ctx.moveTo(width * 0.5 + i * 18, height * 0.54);
      ctx.quadraticCurveTo(width * 0.5 + i * 11, height * 0.43, width * 0.5 + i * 4, height * 0.34);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = intensity * 0.045;
  ctx.strokeStyle = '#f5dba0';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    for (let x = width * 0.28; x <= width * 0.72; x += 16) {
      const y = height * (0.345 + i * 0.014) + Math.sin(x * 0.035 + visualTime * 4 + i) * 2.4;
      if (x === width * 0.28) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

`;

const render = `function render() {
  const curve = trackAt(player.distance + 80).curve;
  const activeShake = shake > 0.1 ? shake : 0;
  const roadFrequency = 18 + speedFeel * 24;
  const roadBuzzX = Math.sin(visualTime * roadFrequency * 0.73) * speedFeel * 0.8;
  const roadBuzzY = Math.sin(visualTime * roadFrequency) * speedFeel * 1.15;
  const shakeX = (activeShake ? (Math.random() - 0.5) * activeShake : 0) + roadBuzzX;
  const shakeY = (activeShake ? (Math.random() - 0.5) * activeShake * 0.42 : 0) + roadBuzzY;
  shake *= 0.88;
  const bankTarget = clamp(
    -steer * (0.01 + speedFeel * 0.027) - curve * (0.016 + speedFeel * 0.023),
    -0.072,
    0.072
  );
  worldBank += (bankTarget - worldBank) * (0.08 + speedFeel * 0.08);

  ctx.save();
  ctx.translate(shakeX, shakeY + cameraSurge * height * 0.012);
  ctx.translate(width * 0.5, height * 0.48);
  ctx.rotate(worldBank);
  ctx.translate(-width * 0.5, -height * 0.48);
  drawBackground(curve);
  const points = buildRoad();
  drawRoad(points);
  drawTrackside();
  drawBots();
  drawVelocityFX();
  ctx.restore();

  ctx.save();
  ctx.translate(width * 0.5, height);
  const cockpitScale = 1 - speedFeel * 0.027;
  ctx.scale(cockpitScale, cockpitScale);
  ctx.translate(-width * 0.5, -height);
  ctx.translate(0, cameraSurge * height * 0.018 + Math.sin(visualTime * 22) * speedFeel * 0.7);
  drawCockpit();
  ctx.restore();
  drawVignette();
}

`;

const frame = `function frame(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  visualTime += delta;
  updateRace(delta);
  audio.update(player.speed, mode === 'racing' || mode === 'countdown', speedFeel, cameraSurge, draftFeel);
  render();
  requestAnimationFrame(frame);
}

`;

await transform('apps/petlya-17/app.js', (source) => {
  source = replaceExact(source, "const VERSION = '2.1.0';", "const VERSION = '2.2.0';");
  source = replaceExact(source, 'let worldBank = 0;', `let worldBank = 0;\n${velocityState}`);
  source = replaceBlock(source, 'class EngineAudio {', 'const audio = new EngineAudio();', engineAudio);
  source = replaceExact(source, `const haptic = (pattern) => {\n  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);\n};\n`, `const haptic = (pattern) => {\n  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);\n};\n\n${velocityHelpers}`);
  source = replaceBlock(source, 'function resetRace() {', 'async function startRace(useTilt) {', resetRace);
  source = replaceBlock(source, 'function updateRace(delta) {', 'function finish() {', updateRace);
  source = replaceBlock(source, 'function buildRoad() {', 'function pointAt(distance) {', buildRoad);
  source = replaceBlock(source, 'function drawRoad(points) {', 'function drawTrackside() {', drawRoad);
  source = replaceBlock(source, 'function drawTrackside() {', 'function drawCar(bot, point, distance) {', drawTrackside);
  source = replaceBlock(source, 'function drawCar(bot, point, distance) {', 'function drawMirror(x, y, mirrorWidth, mirrorHeight, side) {', carAndVelocity);
  source = replaceBlock(source, 'function render() {', 'function frame(now) {', render);
  source = replaceBlock(source, 'function frame(now) {', 'function hold(button, setter) {', frame);
  return source;
});

await transform('apps/petlya-17/index.html', (source) => source.replaceAll('2.1.1', '2.2.0'));

await transform('apps/petlya-17/app.config.json', () => JSON.stringify({
  schemaVersion: 1,
  slug: 'petlya-17',
  name: 'ПЕТЛЯ 17',
  shortName: 'ПЕТЛЯ 17',
  description: 'Кабинная гонка с динамическим FOV, скоростным потоком дороги, ветром, параллаксом и физической реакцией камеры.',
  version: '2.2.0',
  releaseDate: '2026-07-14',
  releaseDateTime: '2026-07-14T18:30:00Z',
  changelog: [
    'Добавлен единый Velocity Core: FOV, камера, дорожный поток, ветер и эффекты теперь синхронно зависят от скорости.',
    'Асфальт получил движущиеся мировые детали, резиновые следы, отражатели и растягивающуюся на скорости фактуру.',
    'Добавлен ближний параллакс ограждений и технических панелей, которые быстро пролетают у краёв кокпита.',
    'Звук разделён на двигатель, ветер, шины и вибрацию корпуса; воздушный след получил отдельное усиление потока.',
    'Соперники получили турбулентный след и полноценный пролёт через периферию экрана во время обгона.'
  ],
  status: 'active',
  preset: 'game-2d',
  runtime: 'quick',
  accent: '#dd5d2f',
  backgroundColor: '#101512',
  themeColor: '#101512',
  orientation: 'landscape',
  cacheName: 'petlya-17-v2.2.0',
  storageNamespace: 'pocket-works:petlya-17',
  tags: ['PWA', 'offline', 'game', 'racing', 'tilt', 'canvas', 'audio', 'workshop'],
  order: 70
}, null, 2) + '\n');

await transform('apps/petlya-17/manifest.webmanifest', (source) => {
  const manifest = JSON.parse(source);
  manifest.description = 'Кабинная гонка с динамическим FOV, скоростным потоком дороги, ветром, параллаксом и физической реакцией камеры.';
  return JSON.stringify(manifest, null, 2) + '\n';
});

await transform('apps/petlya-17/sw.js', (source) => {
  source = source.replace("const CACHE_NAME = 'petlya-17-v2.1.1-p2';", "const CACHE_NAME = 'petlya-17-v2.2.0';");
  source = source.replace("const APP_VERSION = '2.1.1';", "const APP_VERSION = '2.2.0';");
  source = source.replace("const RELEASE_DATE = '2026-07-13';", "const RELEASE_DATE = '2026-07-14';");
  source = source.replace(/const RELEASE_NOTES = \[[\s\S]*?\n\];/, `const RELEASE_NOTES = [\n  'Добавлен единый Velocity Core: FOV, камера, дорожный поток, ветер и эффекты синхронно зависят от скорости.',\n  'Асфальт получил движущиеся мировые детали, резиновые следы, отражатели и растягивающуюся фактуру.',\n  'Добавлен ближний параллакс ограждений и технических панелей у краёв кокпита.',\n  'Звук разделён на двигатель, ветер, шины и вибрацию корпуса.',\n  'Соперники получили турбулентный след и полноценный пролёт через периферию экрана.'\n];`);
  return source;
});

await transform('tests/e2e/petlya-17.spec.ts', (source) => {
  source = source.replace("await page.waitForTimeout(2200);", "await page.waitForTimeout(3600);");
  source = source.replace("await page.keyboard.up('KeyW');", `await expect.poll(async () => page.evaluate(() => (window as any).__petlyaVelocity?.getState().speedFeel || 0), { timeout: 7_000 }).toBeGreaterThan(0.22);\n  const velocityState = await page.evaluate(() => (window as any).__petlyaVelocity?.getState());\n  expect(velocityState.speed).toBeGreaterThan(80);\n  expect(Math.abs(velocityState.cameraSurge)).toBeLessThanOrEqual(1);\n  await page.keyboard.up('KeyW');`);
  source = source.replace("petlya-17-cockpit-v2-1", "petlya-17-velocity-core");
  return source;
});
