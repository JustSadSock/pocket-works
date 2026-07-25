const STATE_KEY = 'pocket-works:otklik:state-v1';
const GEOMETRY_KEY = 'pocket-works:otklik:geometry-v2';
const DEFAULT_POLYGON = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clone = (value) => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

let geometry = loadGeometry();
let scanMode = 'manual';
let editPoints = clone(geometry.points);
let selectedCorner = 0;
let referenceEdge = 0;
let photoBitmap = null;
let photoNatural = { width: 1, height: 1 };
let cameraStream = null;
let xrRuntime = null;
let overlayFrame = 0;
let recommendationFrame = 0;

const appShell = $('[data-app-shell]');
const mapFrame = $('#mapFrame');
const roomCanvas = $('#roomCanvas');
const settingsSheet = $('#settingsSheet');
const resultSheet = $('#resultSheet');

function loadMainState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveMainState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadGeometry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GEOMETRY_KEY) || 'null');
    if (!parsed || parsed.schema !== 2 || !validPolygon(parsed.points)) return defaultGeometry();
    return sanitizeGeometry(parsed);
  } catch {
    return defaultGeometry();
  }
}

function defaultGeometry() {
  return {
    schema: 2,
    points: clone(DEFAULT_POLYGON),
    source: 'rectangle',
    capturedAt: null,
    referenceWallMeters: null,
    referenceEdge: 0
  };
}

function sanitizeGeometry(input) {
  return {
    schema: 2,
    points: input.points.slice(0, 16).map((point) => ({
      x: clamp(Number(point.x) || 0, 0.02, 0.98),
      y: clamp(Number(point.y) || 0, 0.02, 0.98)
    })),
    source: ['rectangle', 'manual', 'photo', 'ar'].includes(input.source) ? input.source : 'manual',
    capturedAt: typeof input.capturedAt === 'string' ? input.capturedAt : null,
    referenceWallMeters: Number.isFinite(Number(input.referenceWallMeters)) ? Number(input.referenceWallMeters) : null,
    referenceEdge: Number.isInteger(input.referenceEdge) ? input.referenceEdge : 0
  };
}

function validPolygon(points) {
  return Array.isArray(points)
    && points.length >= 3
    && points.length <= 16
    && points.every((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
}

function saveGeometry(next) {
  geometry = sanitizeGeometry(next);
  localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry));
  applyGeometry();
}
