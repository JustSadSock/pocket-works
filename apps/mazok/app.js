import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

// serviceWorker.register('./sw.js') is owned by shared/update-manager.js.
installMobileRuntime();

const storage = createVersionedStore({
  namespace: 'pocket-works:mazok',
  version: 1,
  defaults: {}
});
const status = document.querySelector('#status');

const canvas = document.querySelector('#forge-canvas');
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
  status.value = `Canvas ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
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
resizeCanvas();

createWorkshopMode({
  appName: 'МАЗОК',
  version: '0.1.0',
  cachePrefix: 'mazok-',
  storageNamespace: 'pocket-works:mazok',
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
