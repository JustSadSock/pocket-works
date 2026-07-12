import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import { createRafLoop } from '../../shared/capabilities/motion.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { toggleFullscreen, watchOrientation } from '../../shared/capabilities/device.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();

const preferences = createVersionedStore({
  namespace: 'pocket-works:screen-lab',
  version: 1,
  defaults: { motionLevel: 1 }
});

const root = document.documentElement;
const body = document.body;
const canvas = document.querySelector('#field');
const context = canvas.getContext('2d', { alpha: true });
const specimen = document.querySelector('#specimen');
const touchZone = document.querySelector('#touch-zone');
const touchCount = document.querySelector('#touch-count');
const safeProbe = document.querySelector('.safe-probe');
const toast = document.querySelector('#toast');
const statusOrb = document.querySelector('#status-orb');

const readings = {
  viewport: document.querySelector('#viewport'),
  dpr: document.querySelector('#dpr'),
  fps: document.querySelector('#fps'),
  displayMode: document.querySelector('#display-mode'),
  aspect: document.querySelector('#aspect-live'),
  orientation: document.querySelector('#orientation'),
  angle: document.querySelector('#angle'),
  network: document.querySelector('#network'),
  platform: document.querySelector('#platform'),
  motion: document.querySelector('#motion-mode'),
  visibility: document.querySelector('#visibility'),
  clock: document.querySelector('#clock'),
  safeTop: document.querySelector('#safe-top'),
  safeRight: document.querySelector('#safe-right'),
  safeBottom: document.querySelector('#safe-bottom'),
  safeLeft: document.querySelector('#safe-left')
};

const orientationFigure = document.querySelector('#orientation-figure');
const activeTouches = new Map();
const particles = [];
let width = 0;
let height = 0;
let dpr = 1;
let frozen = false;
let motionLevel = preferences.get('motionLevel', 1);
let toastTimer;
let lastFrame = performance.now();
let frameSamples = [];
let orientationStop = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const motionStates = [
  { label: 'calm', scale: 0.25 },
  { label: 'live', scale: 1 },
  { label: 'wild', scale: 1.7 }
];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function getDisplayMode() {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return 'standalone';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  return 'browser';
}

function readSafeArea() {
  const style = getComputedStyle(safeProbe);
  const values = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
  [readings.safeTop.textContent, readings.safeRight.textContent, readings.safeBottom.textContent, readings.safeLeft.textContent] = values;
}

function readOrientation() {
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  readings.orientation.textContent = landscape ? 'landscape' : 'portrait';
  orientationFigure.classList.toggle('landscape', landscape);
  const screenAngle = screen.orientation?.angle;
  const legacyAngle = typeof window.orientation === 'number' ? window.orientation : null;
  const angle = Number.isFinite(screenAngle) ? screenAngle : legacyAngle;
  readings.angle.textContent = Number.isFinite(angle) ? `${angle}° rotation` : 'Angle unavailable';
}

function updateMetrics() {
  const viewport = window.visualViewport;
  const vw = Math.round(viewport?.width || window.innerWidth);
  const vh = Math.round(viewport?.height || window.innerHeight);
  const ratio = vw / vh;
  readings.viewport.textContent = `${vw} × ${vh}`;
  readings.dpr.textContent = (window.devicePixelRatio || 1).toFixed(2);
  readings.aspect.textContent = ratio >= 1 ? ratio.toFixed(2) : `1:${(1 / ratio).toFixed(2)}`;
  readings.displayMode.textContent = getDisplayMode();
  readings.network.textContent = navigator.onLine ? 'online' : 'offline';
  readings.platform.textContent = navigator.userAgentData?.platform || navigator.platform || 'unknown';
  readSafeArea();
  readOrientation();
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateMetrics();
}

function setPointerPosition(x, y) {
  const mx = clamp((x / Math.max(width, 1) - 0.5) * 2, -1, 1);
  const my = clamp((y / Math.max(height, 1) - 0.5) * 2, -1, 1);
  root.style.setProperty('--mx', mx.toFixed(3));
  root.style.setProperty('--my', my.toFixed(3));
}

function spawnParticle(x, y, strength = 1, hue = 0) {
  const count = Math.round(5 + 8 * strength);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.45 + Math.random() * 1.6) * strength;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.024,
      size: 2 + Math.random() * 9,
      hue
    });
  }
  if (particles.length > 260) particles.splice(0, particles.length - 260);
}

function drawParticles() {
  context.clearRect(0, 0, width, height);
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.life -= particle.decay;
    if (particle.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    context.globalAlpha = particle.life * 0.55;
    context.fillStyle = particle.hue === 1 ? '#1d4fff' : particle.hue === 2 ? '#c8ff45' : '#ff4d1f';
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function animationLoop(now) {
  const delta = now - lastFrame;
  lastFrame = now;
  if (delta > 0 && delta < 250) {
    frameSamples.push(1000 / delta);
    if (frameSamples.length > 30) frameSamples.shift();
    const average = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
    readings.fps.textContent = String(Math.round(average));
  }
  if (!frozen) drawParticles();
}

function createTouchDot(pointerId, x, y) {
  let dot = activeTouches.get(pointerId);
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'touch-dot';
    touchZone.append(dot);
    activeTouches.set(pointerId, dot);
  }
  const rect = touchZone.getBoundingClientRect();
  dot.style.left = `${x - rect.left}px`;
  dot.style.top = `${y - rect.top}px`;
  touchCount.textContent = String(activeTouches.size);
}

function removeTouchDot(pointerId) {
  activeTouches.get(pointerId)?.remove();
  activeTouches.delete(pointerId);
  touchCount.textContent = String(activeTouches.size);
}

function updateClock() {
  readings.clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date());
}

function updateNetwork() {
  readings.network.textContent = navigator.onLine ? 'online' : 'offline';
  showToast(navigator.onLine ? 'Network restored' : 'Offline mode active');
}

function applyMotionLevel(level) {
  motionLevel = clamp(Number(level) || 0, 0, motionStates.length - 1);
  const state = motionStates[motionLevel];
  root.style.setProperty('--motion-scale', state.scale);
  readings.motion.textContent = state.label;
}

function cycleMotion() {
  applyMotionLevel((motionLevel + 1) % motionStates.length);
  preferences.set('motionLevel', motionLevel);
  showToast(`Motion: ${motionStates[motionLevel].label}`);
  navigator.vibrate?.(18);
}

async function enableDeviceMotion() {
  if (orientationStop) return true;
  orientationStop = await watchOrientation((event) => {
    if (frozen || event.gamma == null || event.beta == null) return;
    const mx = clamp(event.gamma / 35, -1, 1);
    const my = clamp((event.beta - 35) / 45, -1, 1);
    root.style.setProperty('--mx', mx.toFixed(3));
    root.style.setProperty('--my', my.toFixed(3));
  });

  if (!orientationStop) {
    showToast('Motion permission unavailable');
    return false;
  }
  return true;
}

function resetLab() {
  particles.length = 0;
  root.style.setProperty('--mx', '0');
  root.style.setProperty('--my', '0');
  preferences.reset();
  applyMotionLevel(1);
  readings.visibility.textContent = document.visibilityState;
  showToast('Lab reset');
}

window.addEventListener('pointermove', (event) => {
  if (!frozen && event.pointerType === 'mouse') setPointerPosition(event.clientX, event.clientY);
}, { passive: true });

window.addEventListener('pointerdown', (event) => {
  if (!frozen) spawnParticle(event.clientX, event.clientY, 0.75, event.pointerId % 3);
}, { passive: true });

bindPointerGesture(touchZone, {
  onStart(event) {
    createTouchDot(event.pointerId, event.clientX, event.clientY);
    spawnParticle(event.clientX, event.clientY, 1.25, event.pointerId % 3);
    navigator.vibrate?.(10);
  },
  onMove(event) {
    createTouchDot(event.pointerId, event.clientX, event.clientY);
    if (Math.random() > 0.62) spawnParticle(event.clientX, event.clientY, 0.38, event.pointerId % 3);
  },
  onEnd(event) {
    removeTouchDot(event.pointerId);
  },
  onCancel(event) {
    removeTouchDot(event.pointerId);
  }
});

statusOrb.addEventListener('click', async () => {
  cycleMotion();
  await enableDeviceMotion();
});

document.querySelector('.control-row').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'pulse') {
    body.classList.remove('impulse');
    void body.offsetWidth;
    body.classList.add('impulse');
    const rect = specimen.getBoundingClientRect();
    spawnParticle(rect.left + rect.width / 2, rect.top + rect.height / 2, 2.3, 0);
    navigator.vibrate?.([18, 35, 18]);
    setTimeout(() => body.classList.remove('impulse'), 750);
  }

  if (action === 'freeze') {
    frozen = !frozen;
    body.classList.toggle('frozen', frozen);
    button.textContent = frozen ? 'Resume' : 'Freeze';
    readings.visibility.textContent = frozen ? 'frozen' : document.visibilityState;
    showToast(frozen ? 'Motion suspended' : 'Motion resumed');
  }

  if (action === 'fullscreen') {
    const changed = await toggleFullscreen();
    if (!changed) showToast('Use “Add to Home Screen” for fullscreen on iPhone');
    updateMetrics();
  }

  if (action === 'reset') resetLab();
});

createWorkshopMode({
  appName: 'Screen Lab',
  version: '1.3.0',
  cachePrefix: 'screen-lab-',
  storageNamespace: 'pocket-works:screen-lab',
  onReset: resetLab
});

window.addEventListener('resize', resizeCanvas, { passive: true });
window.addEventListener('appviewportchange', updateMetrics, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(updateMetrics, 180), { passive: true });
window.addEventListener('online', updateNetwork);
window.addEventListener('offline', updateNetwork);
document.addEventListener('visibilitychange', () => {
  readings.visibility.textContent = document.visibilityState;
});
document.addEventListener('fullscreenchange', updateMetrics);

applyMotionLevel(motionLevel);
resizeCanvas();
updateClock();
setInterval(updateClock, 1000);
createRafLoop(animationLoop, { pauseWhenHidden: true, maxDelta: 80 });
