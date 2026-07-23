export const TOOL_DEFS = Object.freeze({
  pencil: Object.freeze({ label: 'Карандаш', icon: 'i-pencil', min: 2, max: 34, defaultSize: 8, opacity: 0.82 }),
  ink: Object.freeze({ label: 'Чернила', icon: 'i-pen', min: 2, max: 52, defaultSize: 14, opacity: 1 }),
  marker: Object.freeze({ label: 'Маркер', icon: 'i-marker', min: 8, max: 96, defaultSize: 38, opacity: 0.28 }),
  eraser: Object.freeze({ label: 'Ластик', icon: 'i-eraser', min: 8, max: 120, defaultSize: 34, opacity: 1 })
});

export const PAPER_COLORS = Object.freeze(['#fffaf0', '#ffffff', '#f4eadf', '#e9f1ef']);

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

export function makeId(prefix = 'drawing') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function normalizeHexColor(value, fallback = '#20211f') {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

export function createDrawingDocument(viewportWidth, viewportHeight, options = {}) {
  const width = 1200;
  const safeWidth = Math.max(280, Number(viewportWidth) || 390);
  const safeHeight = Math.max(420, Number(viewportHeight) || 760);
  const aspect = clamp(safeHeight / safeWidth, 0.72, 2.35);
  const height = Math.round(width * aspect);
  const timestamp = new Date().toISOString();

  return {
    schema: 1,
    id: makeId(),
    title: options.title || 'Без названия',
    createdAt: timestamp,
    updatedAt: timestamp,
    width,
    height,
    background: PAPER_COLORS.includes(options.background) ? options.background : PAPER_COLORS[0],
    strokes: [],
    thumbnail: null
  };
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function simplifySection(points, first, last, tolerance, keep) {
  let farthest = tolerance;
  let index = -1;
  for (let cursor = first + 1; cursor < last; cursor += 1) {
    const candidate = pointSegmentDistance(points[cursor], points[first], points[last]);
    if (candidate > farthest) {
      farthest = candidate;
      index = cursor;
    }
  }
  if (index < 0) return;
  keep[index] = true;
  simplifySection(points, first, index, tolerance, keep);
  simplifySection(points, index, last, tolerance, keep);
}

export function simplifyPoints(points, tolerance = 0.75) {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? points.slice() : [];
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifySection(points, 0, points.length - 1, Math.max(0.05, tolerance), keep);
  return points.filter((_, index) => keep[index]);
}

function finitePoint(point, width, height) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= -width * 0.05 && point.x <= width * 1.05
    && point.y >= -height * 0.05 && point.y <= height * 1.05;
}

export function isValidDrawing(value) {
  if (!value || value.schema !== 1 || typeof value.id !== 'string' || value.id.length > 160) return false;
  if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return false;
  if (value.width < 240 || value.width > 4096 || value.height < 240 || value.height > 8192) return false;
  if (!Array.isArray(value.strokes) || value.strokes.length > 5000) return false;
  if (typeof value.title !== 'string' || value.title.length > 80) return false;
  if (!/^#[0-9a-f]{6}$/i.test(value.background || '')) return false;

  return value.strokes.every((stroke) => {
    if (!stroke || !TOOL_DEFS[stroke.tool] || !Array.isArray(stroke.points)) return false;
    if (stroke.points.length < 1 || stroke.points.length > 12_000) return false;
    if (!Number.isFinite(stroke.size) || stroke.size < 0.1 || stroke.size > 1000) return false;
    if (stroke.tool !== 'eraser' && !/^#[0-9a-f]{6}$/i.test(stroke.color || '')) return false;
    return stroke.points.every((point) => finitePoint(point, value.width, value.height));
  });
}

function pressureOf(point) {
  const pressure = Number(point?.p);
  return pressure > 0 && Number.isFinite(pressure) ? clamp(pressure, 0.08, 1) : 0.5;
}

export function widthForPoint(stroke, point) {
  const pressure = pressureOf(point);
  if (stroke.tool === 'ink') return stroke.size * (0.62 + pressure * 0.76);
  if (stroke.tool === 'pencil') return stroke.size * (0.72 + pressure * 0.3);
  if (stroke.tool === 'eraser') return stroke.size * (0.9 + pressure * 0.22);
  return stroke.size;
}

function dot(context, point, radius) {
  context.beginPath();
  context.arc(point.x, point.y, Math.max(0.2, radius), 0, Math.PI * 2);
  context.fill();
}

function drawSegment(context, stroke, previous, current) {
  const width = (widthForPoint(stroke, previous) + widthForPoint(stroke, current)) * 0.5;
  context.lineWidth = Math.max(0.35, width);
  context.beginPath();
  context.moveTo(previous.x, previous.y);
  context.lineTo(current.x, current.y);
  context.stroke();
}

function seededRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addPencilGrain(context, stroke, fromIndex, toIndex) {
  if (stroke.tool !== 'pencil') return;
  const random = seededRandom(stroke.seed);
  const points = stroke.points;
  const end = Math.min(points.length - 1, toIndex);
  context.save();
  context.globalAlpha *= 0.24;
  for (let index = 0; index <= end; index += 1) {
    const point = points[index];
    const spread = stroke.size * 0.44;
    const count = index >= fromIndex ? 2 : 0;
    for (let grain = 0; grain < count; grain += 1) {
      const angle = random() * Math.PI * 2;
      const radius = random() * spread;
      dot(context, {
        x: point.x + Math.cos(angle) * radius,
        y: point.y + Math.sin(angle) * radius
      }, Math.max(0.25, stroke.size * (0.025 + random() * 0.035)));
    }
  }
  context.restore();
}

export function drawStrokeRange(context, stroke, fromIndex = 0, options = {}) {
  if (!context || !stroke?.points?.length || !TOOL_DEFS[stroke.tool]) return;
  const points = stroke.points;
  const start = clamp(Math.floor(fromIndex), 0, points.length - 1);
  const opacity = Number.isFinite(options.opacity) ? options.opacity : TOOL_DEFS[stroke.tool].opacity;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = stroke.tool === 'eraser' ? '#000000' : normalizeHexColor(stroke.color);
  context.fillStyle = context.strokeStyle;
  context.globalAlpha = opacity;
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

  if (points.length === 1 && start === 0) {
    dot(context, points[0], widthForPoint(stroke, points[0]) * 0.5);
  } else {
    for (let index = Math.max(1, start); index < points.length; index += 1) {
      drawSegment(context, stroke, points[index - 1], points[index]);
    }
  }
  addPencilGrain(context, stroke, start, points.length - 1);
  context.restore();
}

export function replayStrokes(context, strokes, width, height) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.restore();
  for (const stroke of strokes || []) drawStrokeRange(context, stroke, 0);
}

export function safeFileStem(title) {
  const normalized = String(title || 'mazok')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9_-]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'mazok';
}

export function drawingCountLabel(count) {
  const value = Math.max(0, Number(count) || 0);
  const tens = value % 100;
  const unit = value % 10;
  if (tens >= 11 && tens <= 14) return `${value} рисунков`;
  if (unit === 1) return `${value} рисунок`;
  if (unit >= 2 && unit <= 4) return `${value} рисунка`;
  return `${value} рисунков`;
}
