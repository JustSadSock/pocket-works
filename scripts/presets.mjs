export const PRESETS = {
  vanilla: {
    label: 'Vanilla',
    description: 'A minimal offline application shell with persistent state.',
    tags: ['utility', 'offline'],
    markup: `<h2 id="stage-title">A clean shell for one focused job.</h2>
      <button id="primary-action" type="button" data-native-press>Record interaction</button>
      <output id="status" aria-live="polite">Ready</output>`,
    script: `const action = document.querySelector('#primary-action');
let count = storage.get('interaction-count', 0);
const render = (prefix = 'Ready') => {
  status.value = \`${'${prefix}'} · interactions ${'${count}'}\`;
};
action.addEventListener('click', () => {
  count += 1;
  storage.set('interaction-count', count);
  render('Recorded');
});
render();`,
    styles: ''
  },

  interactive: {
    label: 'Interactive',
    description: 'A direct-manipulation starter with pointer capture and interruption handling.',
    tags: ['interactive', 'gesture', 'offline'],
    markup: `<h2 id="stage-title">Drag the signal. Release it anywhere.</h2>
      <div class="forge-track" id="forge-track" data-gesture-surface data-block-callout>
        <div class="forge-knob" id="forge-knob" data-pressable aria-label="Draggable signal"></div>
      </div>
      <button id="primary-action" type="button" data-native-press>Center signal</button>
      <output id="status" aria-live="polite">Ready</output>`,
    script: `const track = document.querySelector('#forge-track');
const knob = document.querySelector('#forge-knob');
const action = document.querySelector('#primary-action');
let position = storage.get('signal-position', 0.5);

function renderSignal(prefix = 'Signal') {
  knob.style.left = \`${'${Math.round(position * 100)}'}%\`;
  status.value = \`${'${prefix}'} · ${'${Math.round(position * 100)}'}%\`;
}

bindPointerGesture(track, {
  onStart: ({ event }) => updateFromPointer(event, 'Grabbed'),
  onMove: ({ event }) => updateFromPointer(event, 'Moving'),
  onEnd: () => {
    storage.set('signal-position', position);
    renderSignal('Settled');
  },
  onCancel: () => renderSignal('Interrupted')
});

function updateFromPointer(event, prefix) {
  const rect = track.getBoundingClientRect();
  position = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  renderSignal(prefix);
}

action.addEventListener('click', () => {
  position = 0.5;
  storage.set('signal-position', position);
  renderSignal('Centered');
});
renderSignal();`,
    styles: `.forge-track {
  position: relative;
  height: 84px;
  border-block: 1px solid color-mix(in srgb, var(--fg) 28%, transparent);
  touch-action: none;
}
.forge-track::before {
  content: "";
  position: absolute;
  inset: 50% 0 auto;
  border-top: 1px dashed color-mix(in srgb, var(--fg) 32%, transparent);
}
.forge-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 54px;
  height: 54px;
  background: var(--accent);
  transform: translate(-50%, -50%) rotate(45deg);
  transition: scale 120ms ease;
}
.forge-knob.is-pressed { scale: .9; }`
  },

  canvas: {
    label: 'Canvas',
    description: 'A responsive high-DPI drawing surface with pointer input.',
    tags: ['canvas', 'drawing', 'offline'],
    markup: `<h2 id="stage-title">Draw directly into a device-scaled canvas.</h2>
      <canvas class="forge-canvas" id="forge-canvas" data-gesture-surface data-block-callout></canvas>
      <button id="primary-action" type="button" data-native-press>Clear canvas</button>
      <output id="status" aria-live="polite">Ready</output>`,
    script: `const canvas = document.querySelector('#forge-canvas');
const context = canvas.getContext('2d');
const action = document.querySelector('#primary-action');
let drawing = false;
let lastPoint = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 7;
  context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  status.value = \`Canvas ${'${Math.round(rect.width)}'} × ${'${Math.round(rect.height)}'}\`;
}

function pointFrom(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

bindPointerGesture(canvas, {
  onStart: ({ event }) => {
    drawing = true;
    lastPoint = pointFrom(event);
  },
  onMove: ({ event }) => {
    if (!drawing) return;
    const point = pointFrom(event);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPoint = point;
  },
  onEnd: () => { drawing = false; lastPoint = null; },
  onCancel: () => { drawing = false; lastPoint = null; }
});

action.addEventListener('click', () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  status.value = 'Canvas cleared';
});
window.addEventListener('resize', resizeCanvas, { passive: true });
resizeCanvas();`,
    styles: `.forge-canvas {
  display: block;
  width: 100%;
  min-height: 280px;
  border: 1px solid color-mix(in srgb, var(--fg) 30%, transparent);
  background: color-mix(in srgb, var(--fg) 4%, var(--bg));
  touch-action: none;
}`
  },

  'game-2d': {
    label: 'Game 2D',
    description: 'A lightweight requestAnimationFrame game loop and touch target.',
    tags: ['game', 'canvas', 'offline'],
    markup: `<h2 id="stage-title">A tiny game loop with no framework tax.</h2>
      <canvas class="forge-canvas forge-game" id="forge-canvas" data-gesture-surface data-block-callout></canvas>
      <button id="primary-action" type="button" data-native-press>Pause</button>
      <output id="status" aria-live="polite">Running</output>`,
    script: `const canvas = document.querySelector('#forge-canvas');
const context = canvas.getContext('2d');
const action = document.querySelector('#primary-action');
const player = { x: 80, y: 80, targetX: 80, targetY: 80 };
let paused = false;
let width = 1;
let height = 1;
let last = performance.now();

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function setTarget(event) {
  const rect = canvas.getBoundingClientRect();
  player.targetX = event.clientX - rect.left;
  player.targetY = event.clientY - rect.top;
}

bindPointerGesture(canvas, {
  onStart: ({ event }) => setTarget(event),
  onMove: ({ event }) => setTarget(event)
});

function frame(now) {
  const delta = Math.min(32, now - last) / 16.667;
  last = now;
  if (!paused) {
    player.x += (player.targetX - player.x) * 0.12 * delta;
    player.y += (player.targetY - player.y) * 0.12 * delta;
  }
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  context.beginPath();
  context.arc(player.x, player.y, 18, 0, Math.PI * 2);
  context.fill();
  requestAnimationFrame(frame);
}

action.addEventListener('click', () => {
  paused = !paused;
  action.textContent = paused ? 'Resume' : 'Pause';
  status.value = paused ? 'Paused' : 'Running';
});
window.addEventListener('resize', resizeCanvas, { passive: true });
resizeCanvas();
requestAnimationFrame(frame);`,
    styles: `.forge-canvas {
  display: block;
  width: 100%;
  min-height: 300px;
  border: 1px solid color-mix(in srgb, var(--fg) 30%, transparent);
  background: repeating-linear-gradient(90deg, transparent 0 31px, color-mix(in srgb, var(--fg) 7%, transparent) 31px 32px), var(--bg);
  touch-action: none;
}`
  },

  audio: {
    label: 'Audio',
    description: 'A user-gesture-safe Web Audio starter with a small synthesised cue.',
    tags: ['audio', 'web-audio', 'offline'],
    markup: `<h2 id="stage-title">Sound starts only when the user asks for it.</h2>
      <div class="forge-audio-meter" id="forge-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <button id="primary-action" type="button" data-native-press>Play signal</button>
      <output id="status" aria-live="polite">Audio locked</output>`,
    script: `const action = document.querySelector('#primary-action');
const meter = document.querySelector('#forge-meter');
let audioContext = null;

async function playSignal() {
  audioContext ||= new AudioContext();
  await audioContext.resume();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(220, now);
  oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.25);
  meter.classList.remove('is-live');
  void meter.offsetWidth;
  meter.classList.add('is-live');
  status.value = 'Signal played';
}

action.addEventListener('click', () => {
  playSignal().catch((error) => {
    console.warn('Audio unavailable', error);
    status.value = 'Audio unavailable';
  });
});`,
    styles: `.forge-audio-meter {
  display: flex;
  align-items: end;
  gap: 8px;
  height: 120px;
  border-bottom: 1px solid color-mix(in srgb, var(--fg) 28%, transparent);
}
.forge-audio-meter i {
  display: block;
  width: min(13vw, 54px);
  height: 12%;
  background: var(--accent);
  transform-origin: bottom;
}
.forge-audio-meter.is-live i { animation: forge-meter 280ms cubic-bezier(.2,.9,.2,1) both; }
.forge-audio-meter.is-live i:nth-child(2) { animation-delay: 25ms; }
.forge-audio-meter.is-live i:nth-child(3) { animation-delay: 50ms; }
.forge-audio-meter.is-live i:nth-child(4) { animation-delay: 75ms; }
.forge-audio-meter.is-live i:nth-child(5) { animation-delay: 100ms; }
@keyframes forge-meter { 45% { height: 100%; } 100% { height: 18%; } }`
  }
};

export function getPreset(name) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unknown preset ${name}. Available: ${Object.keys(PRESETS).join(', ')}`);
  return preset;
}
