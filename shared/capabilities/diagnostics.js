import { getViewportState } from '../mobile-runtime.js';
import {
  clearNamespace,
  estimateNamespaceBytes,
  listNamespaceKeys
} from './storage.js';
import { getDeviceCapabilities } from './device.js';

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function createFpsProbe(options = {}) {
  const sampleSize = Math.max(10, options.sampleSize || 45);
  const samples = [];
  let frame = 0;
  let previous = 0;
  let value = 0;
  let running = false;

  const tick = (now) => {
    if (!running) return;
    if (previous) {
      const delta = now - previous;
      if (delta > 0 && delta < 500) {
        samples.push(1000 / delta);
        if (samples.length > sampleSize) samples.shift();
        value = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      }
    }
    previous = now;
    frame = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      previous = 0;
      frame = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
    },
    get value() {
      return Math.round(value || 0);
    }
  };
}

function normalizeError(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || ''
    };
  }
  return {
    name: typeof value,
    message: String(value),
    stack: ''
  };
}

export function createErrorCollector(options = {}) {
  const limit = Math.max(1, options.limit || 20);
  const errors = [];
  const push = (value, source = 'manual') => {
    errors.unshift({
      ...normalizeError(value),
      source,
      time: new Date().toISOString()
    });
    if (errors.length > limit) errors.length = limit;
  };

  const onError = (event) => push(event.error || event.message, 'window.error');
  const onRejection = (event) => push(event.reason, 'unhandledrejection');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return {
    record: push,
    list: () => errors.map((entry) => ({ ...entry })),
    clear: () => errors.splice(0),
    destroy() {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    }
  };
}

export async function listOwnedCaches(cachePrefix) {
  if (!('caches' in window) || !cachePrefix) return [];
  const names = await caches.keys();
  return names.filter((name) => name.startsWith(cachePrefix));
}

export async function clearOwnedCaches(cachePrefix) {
  const names = await listOwnedCaches(cachePrefix);
  await Promise.all(names.map((name) => caches.delete(name)));
  return names.length;
}

async function serviceWorkerSnapshot() {
  if (!('serviceWorker' in navigator)) return { supported: false, state: 'unsupported' };
  const registration = await navigator.serviceWorker.getRegistration();
  const worker = registration?.waiting || registration?.installing || registration?.active;
  return {
    supported: true,
    controlled: Boolean(navigator.serviceWorker.controller),
    state: worker?.state || 'none',
    waiting: Boolean(registration?.waiting),
    scope: registration?.scope || ''
  };
}

export async function collectDiagnostics(options = {}) {
  const {
    appName = document.title,
    version = '',
    cachePrefix = '',
    storageNamespace = '',
    fps = 0,
    errors = []
  } = options;

  const viewport = getViewportState();
  const cacheNames = await listOwnedCaches(cachePrefix);
  const storageEstimate = await navigator.storage?.estimate?.().catch(() => null);
  const appStorageBytes = storageNamespace ? estimateNamespaceBytes(storageNamespace) : 0;

  return {
    generatedAt: new Date().toISOString(),
    app: { name: appName, version },
    runtime: {
      viewport: {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        offsetTop: viewport.offsetTop,
        keyboardInset: viewport.keyboardInset
      },
      dpr: window.devicePixelRatio || 1,
      fps: Math.round(fps || 0),
      online: navigator.onLine,
      visibility: document.visibilityState,
      displayMode: viewport.standalone ? 'standalone' : document.fullscreenElement ? 'fullscreen' : 'browser',
      orientation: screen.orientation?.type || (matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait')
    },
    device: getDeviceCapabilities(),
    serviceWorker: await serviceWorkerSnapshot(),
    storage: {
      namespace: storageNamespace,
      keys: storageNamespace ? listNamespaceKeys(storageNamespace) : [],
      appBytes: appStorageBytes,
      usage: storageEstimate?.usage ?? null,
      quota: storageEstimate?.quota ?? null
    },
    caches: cacheNames,
    errors
  };
}

export function clearOwnedStorage(storageNamespace) {
  if (!storageNamespace) return 0;
  const count = listNamespaceKeys(storageNamespace).length;
  clearNamespace(storageNamespace);
  return count;
}
