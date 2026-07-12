import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import { createRafLoop } from '../../shared/capabilities/motion.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { copyText, downloadJson, serializeJson } from '../../shared/capabilities/transfer.js';
import { toggleFullscreen, watchOrientation } from '../../shared/capabilities/device.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

const APP_VERSION = '1.4.0';
const mobileRuntime = installMobileRuntime();

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
const freezeButton = document.querySelector('[data-action="freeze"]');
const viewportPlotVisual = document.querySelector('#viewport-plot-visual');
const pressureNeedle = document.querySelector('#pressure-needle');

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
  safeLeft: document.querySelector('#safe-left'),
  visualViewport: document.querySelector('#visual-viewport'),
  visualOffset: document.querySelector('#visual-offset'),
  visualScale: document.querySelector('#visual-scale'),
  keyboardInset: document.querySelector('#keyboard-inset'),
  pointerType: document.querySelector('#pointer-type'),
  pointerPosition: document.querySelector('#pointer-position'),
  pressure: document.querySelector('#pressure-live'),
  gesture: document.querySelector('#gesture'),
  peakPoints: document.querySelector('#peak-points')
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
let gestureBaseline = null;

const pointerState = {
  type: 'idle',
  x: null,
  y: null,
  pressure: 0,
  scale: 1,
  rotation: 0,
  peakPoints: 0
};

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

function readVisualViewport() {
  const state = mobileRuntime.getViewportState();
  const viewport = window.visualViewport;
  const visualWidth = viewport?.width ?? state.width;
  const visualHeight = viewport?.height ?? state.height;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const offsetTop = viewport?.offsetTop ?? state.offsetTop;
  const scale = viewport?.scale ?? 1;

  readings.visualViewport.textContent = `${Math.round(visualWidth)} × ${Math.round(visualHeight)}`;
  readings.visualOffset.textContent = `${Math.round(offsetLeft)}, ${Math.round(offsetTop)}px`;
  readings.visualScale.textContent = `${scale.toFixed(2)}×`;
  readings.keyboardInset.textContent = `${Math.round(state.keyboardInset)}px`;

  const layoutWidth = Math.max(window.innerWidth, 1);
  const layoutHeight = Math.max(window.innerHeight, 1);
  viewportPlotVisual.style.width = `${clamp(visualWidth / layoutWidth, 0.08, 1) * 100}%`;
  viewportPlotVisual.style.height = `${clamp(visualHeight / layoutHeight, 0.08, 1) * 100}%`;
  viewportPlotVisual.style.left = `${clamp(offsetLeft / layoutWidth, 0, 1) * 100}%`;
  viewportPlotVisual.style.top = `${clamp(offsetTop / layoutHeight, 0, 1) * 100}%`;
}

function updateNetworkReading() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!navigator.onLine) {
    readings.network.textContent = 'offline';
    return;
  }
  readings.network.textContent = connection?.effectiveType ? `online · ${connection.effectiveType}` : 'online';
}

function updateVisibilityReading() {
  readings.visibility.textContent = frozen ? 'frozen' : document.visibilityState;
}

function updateMetrics() {
  const viewport = window.visualViewport;
  const vw = Math.max(1, Math.round(viewport?.width || window.innerWidth));
  const vh = Math.max(1, Math.round(viewport?.height || window.innerHeight));
  const ratio = vw / vh;
  readings.viewport.textContent = `${vw} × ${vh}`;
  readings.dpr.textContent = (window.devicePixelRatio || 1).toFixed(2);
  readings.aspect.textContent = ratio >= 1 ? ratio.toFixed(2) : `1:${(1 / ratio).toFixed(2)}`;
  readings.displayMode.textContent = getDisplayMode();
  readings.platform.textContent = navigator.userAgentData?.platform || navigator.platform || 'unknown';
  updateNetworkReading();
  updateVisibilityReading();
  readSafeArea();
  readOrientation();
  readVisualViewport();
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

function createTouchDot(event) {
  let dot = activeTouches.get(event.pointerId);
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'touch-dot';
    touchZone.append(dot);
    activeTouches.set(event.pointerId, dot);
  }
  const rect = touchZone.getBoundingClientRect();
  const pressure = clamp(Number.isFinite(event.pressure) ? event.pressure : 0, 0, 1);
  dot.style.left = `${event.clientX - rect.left}px`;
  dot.style.top = `${event.clientY - rect.top}px`;
  dot.style.setProperty('--dot-pressure', String(Math.max(pressure, event.buttons ? 0.45 : 0.2)));
  touchCount.textContent = String(activeTouches.size);
}

function removeTouchDot(pointerId) {
  activeTouches.get(pointerId)?.remove();
  activeTouches.delete(pointerId);
  touchCount.textContent = String(activeTouches.size);
}

function gestureValues(activePointers) {
  if (activePointers.size < 2) {
    gestureBaseline = null;
    return { scale: 1, rotation: 0 };
  }

  const points = [...activePointers.values()]
    .sort((a, b) => a.pointerId - b.pointerId)
    .slice(0, 2);
  const [first, second] = points;
  const dx = second.clientX - first.clientX;
  const dy = second.clientY - first.clientY;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const key = points.map((point) => point.pointerId).join(':');

  if (!gestureBaseline || gestureBaseline.key !== key) {
    gestureBaseline = { key, distance, angle };
  }

  let rotation = angle - gestureBaseline.angle;
  while (rotation > 180) rotation -= 360;
  while (rotation < -180) rotation += 360;
  return {
    scale: clamp(distance / gestureBaseline.distance, 0.1, 9.99),
    rotation
  };
}

function renderPointerState() {
  readings.pointerType.textContent = pointerState.type;
  readings.pointerPosition.textContent = pointerState.x == null ? '—' : `${Math.round(pointerState.x)}, ${Math.round(pointerState.y)}`;
  readings.pressure.textContent = pointerState.pressure.toFixed(2);
  readings.gesture.textContent = `${pointerState.scale.toFixed(2)}× / ${Math.round(pointerState.rotation)}°`;
  readings.peakPoints.textContent = String(pointerState.peakPoints);
  pressureNeedle.style.setProperty('--pressure', String(pointerState.pressure));
}

function updatePointerTelemetry(event, activePointers) {
  const gesture = gestureValues(activePointers);
  pointerState.type = event.pointerType || 'unknown';
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  pointerState.pressure = clamp(Number.isFinite(event.pressure) ? event.pressure : 0, 0, 1);
  pointerState.scale = gesture.scale;
  pointerState.rotation = gesture.rotation;
  pointerState.peakPoints = Math.max(pointerState.peakPoints, activePointers.size);
  renderPointerState();
}

function resetPointerTelemetry() {
  gestureBaseline = null;
  pointerState.type = 'idle';
  pointerState.x = null;
  pointerState.y = null;
  pointerState.pressure = 0;
  pointerState.scale = 1;
  pointerState.rotation = 0;
  pointerState.peakPoints = 0;
  for (const dot of activeTouches.values()) dot.remove();
  activeTouches.clear();
  touchCount.textContent = '0';
  renderPointerState();
}

function updateClock() {
  readings.clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date());
}

function updateNetwork() {
  updateNetworkReading();
  showToast(navigator.onLine ? 'Network restored' : 'Offline mode active');
}

function applyMotionLevel(level) {
  motionLevel = clamp(Number(level) || 0, 0, motionStates.length - 1);
  const state = motionStates[motionLevel];
  root.style.setProperty('--motion-scale', state.scale);
  readings.motion.textContent = state.label;
  statusOrb.dataset.motionState = state.label;
  statusOrb.setAttribute('aria-label', `Motion intensity: ${state.label}. Activate to change.`);
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

function setFrozen(nextFrozen) {
  frozen = Boolean(nextFrozen);
  body.classList.toggle('frozen', frozen);
  freezeButton.textContent = frozen ? 'Resume' : 'Freeze';
  freezeButton.setAttribute('aria-pressed', String(frozen));
  updateVisibilityReading();
}

function collectSnapshot() {
  const viewportState = mobileRuntime.getViewportState();
  return {
    app: 'Screen Lab',
    version: APP_VERSION,
    capturedAt: new Date().toISOString(),
    displayMode: getDisplayMode(),
    viewport: {
      layout: { width: window.innerWidth, height: window.innerHeight },
      visual: {
        width: window.visualViewport?.width ?? viewportState.width,
        height: window.visualViewport?.height ?? viewportState.height,
        offsetLeft: window.visualViewport?.offsetLeft ?? 0,
        offsetTop: window.visualViewport?.offsetTop ?? viewportState.offsetTop,
        scale: window.visualViewport?.scale ?? 1
      },
      keyboardInset: viewportState.keyboardInset,
      dpr: window.devicePixelRatio || 1,
      safeArea: {
        top: readings.safeTop.textContent,
        right: readings.safeRight.textContent,
        bottom: readings.safeBottom.textContent,
        left: readings.safeLeft.textContent
      }
    },
    orientation: {
      type: readings.orientation.textContent,
      angle: readings.angle.textContent
    },
    runtime: {
      online: navigator.onLine,
      network: readings.network.textContent,
      platform: readings.platform.textContent,
      visibility: readings.visibility.textContent,
      motion: readings.motion.textContent,
      fps: Number(readings.fps.textContent) || null
    },
    pointer: { ...pointerState }
  };
}

async function exportSnapshot() {
  const snapshot = collectSnapshot();
  try {
    const copied = await copyText(serializeJson(snapshot));
    if (copied) {
      showToast('Diagnostic snapshot copied');
      return;
    }
  } catch {
    // Fall through to a local JSON download when clipboard access is blocked.
  }
  downloadJson(snapshot, `screen-lab-${APP_VERSION}-snapshot.json`);
  showToast('Snapshot downloaded');
}

function resetLab() {
  particles.length = 0;
  context.clearRect(0, 0, width, height);
  root.style.setProperty('--mx', '0');
  root.style.setProperty('--my', '0');
  orientationStop?.();
  orientationStop = null;
  preferences.reset();
  applyMotionLevel(1);
  setFrozen(false);
  resetPointerTelemetry();
  frameSamples = [];
  readings.fps.textContent = '—';
  showToast('Lab reset');
}

window.addEventListener('pointermove', (event) => {
  if (!frozen && event.pointerType === 'mouse') setPointerPosition(event.clientX, event.clientY);
}, { passive: true });

window.addEventListener('pointerdown', (event) => {
  if (!frozen && !event.target.closest?.('#touch-zone')) {
    spawnParticle(event.clientX, event.clientY, 0.75, event.pointerId % 3);
  }
}, { passive: true });

bindPointerGesture(touchZone, {
  onStart(event, activePointers) {
    createTouchDot(event);
    updatePointerTelemetry(event, activePointers);
    if (!frozen) spawnParticle(event.clientX, event.clientY, 1.25, event.pointerId % 3);
    navigator.vibrate?.(10);
  },
  onMove(event, activePointers) {
    createTouchDot(event);
    updatePointerTelemetry(event, activePointers);
    if (!frozen && Math.random() > 0.62) spawnParticle(event.clientX, event.clientY, 0.38, event.pointerId % 3);
  },
  onEnd(event, activePointers) {
    removeTouchDot(event.pointerId);
    updatePointerTelemetry(event, activePointers);
  },
  onCancel(event, activePointers) {
    removeTouchDot(event.pointerId);
    updatePointerTelemetry(event, activePointers);
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
    setFrozen(!frozen);
    showToast(frozen ? 'Motion suspended' : 'Motion resumed');
  }

  if (action === 'fullscreen') {
    const changed = await toggleFullscreen();
    if (!changed) showToast('Use “Add to Home Screen” for fullscreen on iPhone');
    updateMetrics();
  }

  if (action === 'snapshot') await exportSnapshot();
  if (action === 'reset') resetLab();
});

createWorkshopMode({
  appName: 'Screen Lab',
  version: APP_VERSION,
  cachePrefix: 'screen-lab-',
  storageNamespace: 'pocket-works:screen-lab',
  onReset: resetLab
});

window.addEventListener('resize', resizeCanvas, { passive: true });
window.addEventListener('appviewportchange', updateMetrics, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(updateMetrics, 180), { passive: true });
window.addEventListener('online', updateNetwork);
window.addEventListener('offline', updateNetwork);
document.addEventListener('visibilitychange', updateVisibilityReading);
document.addEventListener('fullscreenchange', updateMetrics);
window.addEventListener('pagehide', () => {
  orientationStop?.();
  orientationStop = null;
}, { once: true });

applyMotionLevel(motionLevel);
renderPointerState();
resizeCanvas();
updateClock();
setInterval(updateClock, 1000);
createRafLoop(animationLoop, { pauseWhenHidden: true, maxDelta: 80 });
