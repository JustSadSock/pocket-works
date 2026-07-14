const raceCanvas = document.querySelector('#race');
const appShell = document.querySelector('#app');
const controls = document.querySelector('#controls');
const gasButton = document.querySelector('#gas');
const brakeButton = document.querySelector('#brake');
const draftBadge = document.querySelector('#draft');

if (!raceCanvas || !appShell || !gasButton || !brakeButton) {
  throw new Error('Velocity Core could not find the ПЕТЛЯ 17 cockpit controls.');
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const smoothstep = (value) => value * value * (3 - 2 * value);
const hash01 = (value) => {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return result - Math.floor(result);
};

const overlay = document.createElement('canvas');
overlay.className = 'velocity-core-layer';
overlay.setAttribute('aria-hidden', 'true');
raceCanvas.insertAdjacentElement('afterend', overlay);
const context = overlay.getContext('2d', { alpha: true, desynchronized: true });

const style = document.createElement('style');
style.textContent = `
  .velocity-core-layer {
    position: absolute;
    inset: 0;
    z-index: 4;
    width: 100%;
    height: 100%;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  #race {
    transform-origin: 50% 68%;
    will-change: transform, filter;
  }
  .app-shell[data-velocity-band="high"] .grain {
    opacity: .055;
  }
`;
document.head.append(style);

let width = 1;
let height = 1;
let dpr = 1;
let lastFrame = performance.now();
let estimatedSpeed = 0;
let speedFeel = 0;
let throttle = false;
let braking = false;
let active = false;
let cameraSurge = 0;
let cameraBank = 0;
let lastSpeed = 0;
let hapticClock = 0;
let visualTime = 0;
let audioContext = null;
let windSource = null;
let windFilter = null;
let windGain = null;
let bodyOscillator = null;
let bodyGain = null;
let tireSource = null;
let tireGain = null;

function resize() {
  const rect = raceCanvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  width = Math.max(1, Math.round(rect.width));
  height = Math.max(1, Math.round(rect.height));
  overlay.width = Math.round(width * dpr);
  overlay.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function isRaceActive() {
  return controls && !controls.hidden && !document.hidden;
}

function setInput(element, setter) {
  const start = async (event) => {
    event.preventDefault();
    setter(true);
    await unlockAudio();
  };
  const end = () => setter(false);
  element.addEventListener('pointerdown', start, { passive: false });
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener('lostpointercapture', end);
  element.addEventListener('touchstart', start, { passive: false });
  element.addEventListener('touchend', end);
  element.addEventListener('touchcancel', end);
}

setInput(gasButton, (value) => { throttle = value; });
setInput(brakeButton, (value) => { braking = value; });

window.addEventListener('keydown', async (event) => {
  if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) {
    throttle = true;
    await unlockAudio();
  }
  if (['ArrowDown', 'KeyS'].includes(event.code)) braking = true;
});
window.addEventListener('keyup', (event) => {
  if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) throttle = false;
  if (['ArrowDown', 'KeyS'].includes(event.code)) braking = false;
});

async function unlockAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') await audioContext.resume();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();

  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 1.2), audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;

  windSource = audioContext.createBufferSource();
  windSource.buffer = buffer;
  windSource.loop = true;
  windFilter = audioContext.createBiquadFilter();
  windFilter.type = 'highpass';
  windFilter.frequency.value = 380;
  windGain = audioContext.createGain();
  windGain.gain.value = 0.0001;
  windSource.connect(windFilter).connect(windGain).connect(audioContext.destination);

  tireSource = audioContext.createBufferSource();
  tireSource.buffer = buffer;
  tireSource.loop = true;
  const tireFilter = audioContext.createBiquadFilter();
  tireFilter.type = 'bandpass';
  tireFilter.frequency.value = 170;
  tireFilter.Q.value = 0.75;
  tireGain = audioContext.createGain();
  tireGain.gain.value = 0.0001;
  tireSource.connect(tireFilter).connect(tireGain).connect(audioContext.destination);

  bodyOscillator = audioContext.createOscillator();
  bodyOscillator.type = 'triangle';
  bodyOscillator.frequency.value = 43;
  bodyGain = audioContext.createGain();
  bodyGain.gain.value = 0.0001;
  bodyOscillator.connect(bodyGain).connect(audioContext.destination);

  windSource.start();
  tireSource.start();
  bodyOscillator.start();
}

function updateAudio() {
  if (!audioContext || !windGain || !tireGain || !bodyGain) return;
  const now = audioContext.currentTime;
  const draft = draftBadge && !draftBadge.hidden ? 1 : 0;
  const enabled = active ? 1 : 0;
  windFilter.frequency.setTargetAtTime(380 + speedFeel * 3000 + draft * 700, now, 0.045);
  windGain.gain.setTargetAtTime(enabled * (0.0001 + speedFeel ** 1.45 * 0.13 + draft * speedFeel * 0.035), now, 0.055);
  tireGain.gain.setTargetAtTime(enabled * (0.0001 + speedFeel * 0.022 + Math.abs(cameraBank) * 0.016), now, 0.05);
  bodyOscillator.frequency.setTargetAtTime(42 + speedFeel * 22, now, 0.07);
  bodyGain.gain.setTargetAtTime(enabled * (0.002 + speedFeel * 0.013 + Math.abs(cameraSurge) * 0.015), now, 0.055);
}

function updateSimulation(delta) {
  active = isRaceActive();
  if (!active) {
    estimatedSpeed += (0 - estimatedSpeed) * (1 - Math.exp(-delta * 3));
    throttle = false;
    braking = false;
  } else {
    const force = throttle ? 82 * (1 - estimatedSpeed / 365) : 0;
    const drag = 7 + estimatedSpeed * 0.027;
    estimatedSpeed = clamp(estimatedSpeed + (force - (braking ? 146 : 0) - drag) * delta, 0, 338);
  }

  const normalized = clamp((estimatedSpeed - 28) / 295, 0, 1);
  const targetFeel = smoothstep(normalized);
  speedFeel += (targetFeel - speedFeel) * (1 - Math.exp(-delta * 3.8));

  const acceleration = (estimatedSpeed - lastSpeed) / Math.max(delta, 0.001);
  lastSpeed = estimatedSpeed;
  const surgeTarget = clamp(-acceleration / 95, -1, 1);
  cameraSurge += (surgeTarget - cameraSurge) * (1 - Math.exp(-delta * 7));

  const tiltTarget = throttle ? -0.015 : braking ? 0.022 : 0;
  cameraBank += (tiltTarget - cameraBank) * (1 - Math.exp(-delta * 5));

  hapticClock -= delta;
  if (active && speedFeel > 0.58 && hapticClock <= 0) {
    navigator.vibrate?.(3);
    hapticClock = lerp(0.46, 0.2, speedFeel);
  }

  const buzzX = Math.sin(visualTime * (18 + speedFeel * 31)) * speedFeel * 0.75;
  const buzzY = Math.sin(visualTime * (24 + speedFeel * 36)) * speedFeel * 1.05;
  const zoomX = 1 + speedFeel * 0.075;
  const zoomY = 1 + speedFeel * 0.018;
  const pitch = cameraSurge * height * 0.012 + buzzY;
  raceCanvas.style.transform = `translate3d(${buzzX.toFixed(2)}px, ${pitch.toFixed(2)}px, 0) scaleX(${zoomX.toFixed(4)}) scaleY(${zoomY.toFixed(4)}) rotate(${cameraBank.toFixed(4)}rad)`;
  raceCanvas.style.filter = `contrast(${(1 + speedFeel * 0.09).toFixed(3)}) saturate(${(1 + speedFeel * 0.07).toFixed(3)})`;

  appShell.dataset.velocityBand = speedFeel > 0.7 ? 'high' : speedFeel > 0.28 ? 'mid' : 'low';
  updateAudio();
}

function drawRoadFlow() {
  const intensity = speedFeel ** 1.18;
  if (intensity < 0.015) return;

  const horizonY = height * 0.31;
  const roadBottom = height * 0.82;
  const centerX = width * 0.5;
  const phase = estimatedSpeed * visualTime * 0.72;

  context.save();
  context.globalCompositeOperation = 'screen';
  context.lineCap = 'round';

  const grainCount = Math.round(18 + intensity * 34);
  for (let index = 0; index < grainCount; index += 1) {
    const seed = index * 37.17;
    const cycle = 190 + hash01(seed) * 290;
    const progress = ((phase * (0.65 + hash01(seed * 2.1) * 0.8) + seed * 11) % cycle) / cycle;
    const depth = progress ** 2.35;
    const y = lerp(horizonY, roadBottom, depth);
    const roadHalf = lerp(width * 0.014, width * 0.43, depth);
    const lane = hash01(seed * 4.7) * 1.8 - 0.9;
    const x = centerX + lane * roadHalf;
    const length = (2 + depth * 35) * (0.35 + intensity * 1.25);
    context.globalAlpha = intensity * (0.05 + depth * 0.28);
    context.strokeStyle = hash01(seed * 1.3) > 0.68 ? '#e9d8af' : '#89918a';
    context.lineWidth = 0.7 + depth * 2.1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + lane * length * 0.14, y + length);
    context.stroke();
  }

  const reflectorCount = 9;
  for (let index = 0; index < reflectorCount; index += 1) {
    const progress = ((phase * 0.008 + index / reflectorCount) % 1) ** 2.15;
    const y = lerp(horizonY, roadBottom, progress);
    const roadHalf = lerp(width * 0.014, width * 0.43, progress);
    const size = lerp(0.7, 5.5, progress);
    context.globalAlpha = intensity * lerp(0.08, 0.56, progress);
    context.fillStyle = '#f2d76f';
    context.fillRect(centerX - roadHalf * 0.92 - size, y, size * 1.8, size * 0.7);
    context.fillRect(centerX + roadHalf * 0.92 - size, y, size * 1.8, size * 0.7);
  }

  context.restore();
}

function drawPeripheralParallax() {
  const intensity = speedFeel ** 1.08;
  if (intensity < 0.03) return;

  const phase = visualTime * estimatedSpeed * 0.24;
  context.save();
  context.globalCompositeOperation = 'screen';
  context.lineCap = 'round';

  for (let index = 0; index < 18; index += 1) {
    const seed = index * 83.31;
    const side = index % 2 === 0 ? -1 : 1;
    const vertical = height * (0.43 + ((phase + seed) % 310) / 310 * 0.48);
    const edge = side < 0 ? width * (0.018 + hash01(seed) * 0.11) : width * (0.982 - hash01(seed) * 0.11);
    const length = (22 + hash01(seed * 1.7) * 64) * (0.45 + intensity * 1.2);
    context.globalAlpha = intensity * (0.07 + hash01(seed * 2.8) * 0.24);
    context.strokeStyle = index % 3 === 0 ? '#efc857' : '#eadfc3';
    context.lineWidth = 0.8 + intensity * 1.7;
    context.beginPath();
    context.moveTo(edge, vertical);
    context.lineTo(edge - side * length, vertical + length * 0.08);
    context.stroke();
  }

  const panelCycle = 6;
  for (let index = 0; index < panelCycle; index += 1) {
    const progress = ((phase * 0.0045 + index / panelCycle) % 1) ** 1.85;
    if (progress < 0.08) continue;
    const y = lerp(height * 0.36, height * 0.86, progress);
    const roadHalf = lerp(width * 0.025, width * 0.47, progress);
    const size = lerp(2, 18, progress);
    for (const side of [-1, 1]) {
      const x = width * 0.5 + side * roadHalf * 1.12;
      context.globalAlpha = intensity * lerp(0.12, 0.55, progress);
      context.fillStyle = (index + side) % 3 === 0 ? '#dd5d2f' : '#e7d9b8';
      context.fillRect(x - size * 0.5, y - size * 1.8, size, size * 0.55);
      context.strokeStyle = '#f2e6c8';
      context.lineWidth = Math.max(0.7, size * 0.08);
      context.beginPath();
      context.moveTo(x, y - size * 1.3);
      context.lineTo(x + side * size * intensity * 2.8, y - size * 1.15);
      context.stroke();
    }
  }

  context.restore();
}

function drawDraftTunnel() {
  if (!draftBadge || draftBadge.hidden || speedFeel < 0.12) return;
  context.save();
  context.globalCompositeOperation = 'screen';
  context.strokeStyle = '#d8eee2';
  context.lineWidth = 1.2;
  for (let index = -3; index <= 3; index += 1) {
    context.globalAlpha = (0.07 + (3 - Math.abs(index)) * 0.018) * speedFeel;
    context.beginPath();
    context.moveTo(width * 0.5 + index * 25, height * 0.62);
    context.quadraticCurveTo(width * 0.5 + index * 14, height * 0.46, width * 0.5 + index * 4, height * 0.32);
    context.stroke();
  }
  context.restore();
}

function drawLens() {
  if (speedFeel < 0.08) return;
  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.47,
    height * 0.16,
    width * 0.5,
    height * 0.47,
    Math.max(width, height) * 0.68
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.7, `rgba(120,150,140,${speedFeel * 0.015})`);
  gradient.addColorStop(1, `rgba(8,18,15,${speedFeel * 0.22})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function render() {
  context.clearRect(0, 0, width, height);
  if (!active) return;
  drawRoadFlow();
  drawPeripheralParallax();
  drawDraftTunnel();
  drawLens();
}

function frame(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  visualTime += delta;
  updateSimulation(delta);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    throttle = false;
    braking = false;
  }
});
window.addEventListener('pagehide', () => {
  if (audioContext && audioContext.state === 'running') audioContext.suspend().catch(() => {});
});

window.__petlyaVelocityCore = {
  getState() {
    return {
      active,
      estimatedSpeed,
      speedFeel,
      cameraSurge,
      audioReady: Boolean(audioContext)
    };
  }
};

resize();
requestAnimationFrame(frame);
