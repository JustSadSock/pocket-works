import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();

const AXES = ['X', 'Y', 'Z', 'W', 'V'];
const AXIS_COLORS = ['#15171c', '#2459d6', '#a6472f', '#66722f', '#7b4f77'];
const SHAPES = new Set(['hypercube', 'simplex', 'cross']);
const METHODS = new Set(['perspective', 'orthographic']);
const DEFAULT_ANGLES = {
  '0-1': 0.12,
  '0-2': 0.48,
  '1-2': -0.54,
  '0-3': 0.62,
  '1-3': 0.28,
  '2-3': -0.18,
  '0-4': 0.34,
  '1-4': -0.26
};
const DEFAULTS = {
  dimension: 4,
  shape: 'hypercube',
  target: 3,
  method: 'perspective',
  plane: '0-3',
  zoom: 1,
  auto: false,
  angles: DEFAULT_ANGLES
};

const storage = createVersionedStore({
  namespace: 'pocket-works:n-space',
  version: 1,
  defaults: DEFAULTS,
  validate(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
});

const ui = {
  canvas: document.querySelector('#space-canvas'),
  dimensionButtons: [...document.querySelectorAll('[data-dimension]')],
  targetButtons: [...document.querySelectorAll('[data-target]')],
  shape: document.querySelector('#shape-select'),
  method: document.querySelector('#method-select'),
  plane: document.querySelector('#plane-select'),
  zoom: document.querySelector('#zoom-range'),
  zoomOutput: document.querySelector('#zoom-output'),
  auto: document.querySelector('#auto-button'),
  reset: document.querySelector('#reset-button'),
  stats: document.querySelector('#stats'),
  topStatus: document.querySelector('#top-status'),
  stageLabel: document.querySelector('#stage-label'),
  gestureHint: document.querySelector('#gesture-hint'),
  vertexName: document.querySelector('#vertex-name'),
  vertexCoordinates: document.querySelector('#vertex-coordinates'),
  miniCanvases: [...document.querySelectorAll('[data-mini-target]')],
  miniCells: [...document.querySelectorAll('[data-mini-cell]')],
  explain: document.querySelector('#explain'),
  fatal: document.querySelector('#fatal')
};

if (!ui.canvas || !ui.canvas.getContext) {
  throw new Error('N·SPACE requires Canvas 2D');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function planeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function parsePlane(key) {
  const [a, b] = String(key).split('-').map(Number);
  return Number.isInteger(a) && Number.isInteger(b) ? [a, b] : [0, 1];
}

function planeKeys(dimension) {
  const keys = [];
  for (let a = 0; a < dimension; a += 1) {
    for (let b = a + 1; b < dimension; b += 1) {
      keys.push(planeKey(a, b));
    }
  }
  return keys;
}

function sanitizeState(raw) {
  const dimension = clamp(Math.round(Number(raw.dimension) || DEFAULTS.dimension), 1, 5);
  const shape = SHAPES.has(raw.shape) ? raw.shape : DEFAULTS.shape;
  const target = clamp(Math.round(Number(raw.target) || DEFAULTS.target), 1, Math.min(4, dimension));
  const method = METHODS.has(raw.method) ? raw.method : DEFAULTS.method;
  const zoom = clamp(Number(raw.zoom) || 1, 0.55, 1.8);
  const angles = {};
  for (const key of planeKeys(5)) {
    const value = Number(raw.angles?.[key]);
    angles[key] = Number.isFinite(value) ? value : (DEFAULT_ANGLES[key] || 0);
  }
  const validPlanes = planeKeys(dimension);
  const plane = validPlanes.includes(raw.plane)
    ? raw.plane
    : (validPlanes.find((key) => parsePlane(key)[1] === dimension - 1) || validPlanes[0] || '');
  return {
    dimension,
    shape,
    target,
    method,
    zoom,
    angles,
    plane,
    auto: Boolean(raw.auto)
  };
}

let state = sanitizeState(storage.getAll());
let liveAngles = { ...state.angles };
let geometry = null;
let dirty = true;
let selectedVertex = -1;
let lastMainScreenPoints = [];
let activePointers = new Map();
let dragState = null;
let pinchState = null;
let lastFrameTime = performance.now();
let isVisible = !document.hidden;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function persist() {
  state.angles = { ...liveAngles };
  storage.replace({
    dimension: state.dimension,
    shape: state.shape,
    target: state.target,
    method: state.method,
    plane: state.plane,
    zoom: state.zoom,
    auto: state.auto,
    angles: state.angles
  });
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function normalize(vector) {
  const length = Math.sqrt(dot(vector, vector)) || 1;
  return vector.map((value) => value / length);
}

function dominantAxis(a, b) {
  let best = 0;
  let magnitude = -1;
  for (let i = 0; i < a.length; i += 1) {
    const delta = Math.abs((a[i] || 0) - (b[i] || 0));
    if (delta > magnitude) {
      magnitude = delta;
      best = i;
    }
  }
  return best;
}

function hypercube(dimension) {
  const vertices = [];
  const edges = [];
  const count = 1 << dimension;
  for (let index = 0; index < count; index += 1) {
    const point = [];
    for (let axis = 0; axis < dimension; axis += 1) {
      point.push(index & (1 << axis) ? 0.78 : -0.78);
    }
    vertices.push(point);
  }
  for (let index = 0; index < count; index += 1) {
    for (let axis = 0; axis < dimension; axis += 1) {
      const other = index ^ (1 << axis);
      if (index < other) edges.push({ a: index, b: other, axis });
    }
  }
  return { vertices, edges };
}

function simplex(dimension) {
  const ambient = dimension + 1;
  const rawVertices = [];
  for (let i = 0; i < ambient; i += 1) {
    const vertex = [];
    for (let j = 0; j < ambient; j += 1) {
      vertex.push((i === j ? 1 : 0) - 1 / ambient);
    }
    rawVertices.push(vertex);
  }

  const basis = [];
  for (let i = 0; i < dimension; i += 1) {
    let vector = Array.from({ length: ambient }, (_, j) => (j === i ? 1 : 0) - (j === dimension ? 1 : 0));
    for (const existing of basis) {
      const projection = dot(vector, existing);
      vector = vector.map((value, j) => value - projection * existing[j]);
    }
    basis.push(normalize(vector));
  }

  let vertices = rawVertices.map((vertex) => basis.map((axis) => dot(vertex, axis)));
  const radius = Math.max(...vertices.map((vertex) => Math.sqrt(dot(vertex, vertex))), 1);
  vertices = vertices.map((vertex) => vertex.map((value) => value * 0.98 / radius));

  const edges = [];
  for (let a = 0; a < vertices.length; a += 1) {
    for (let b = a + 1; b < vertices.length; b += 1) {
      edges.push({ a, b, axis: dominantAxis(vertices[a], vertices[b]) });
    }
  }
  return { vertices, edges };
}

function crossPolytope(dimension) {
  const vertices = [];
  for (let axis = 0; axis < dimension; axis += 1) {
    const positive = Array(dimension).fill(0);
    const negative = Array(dimension).fill(0);
    positive[axis] = 1;
    negative[axis] = -1;
    vertices.push(positive, negative);
  }

  const edges = [];
  for (let a = 0; a < vertices.length; a += 1) {
    for (let b = a + 1; b < vertices.length; b += 1) {
      if (Math.floor(a / 2) === Math.floor(b / 2)) continue;
      edges.push({ a, b, axis: dominantAxis(vertices[a], vertices[b]) });
    }
  }
  return { vertices, edges };
}

function buildGeometry() {
  if (state.shape === 'simplex') geometry = simplex(state.dimension);
  else if (state.shape === 'cross') geometry = crossPolytope(state.dimension);
  else geometry = hypercube(state.dimension);
  selectedVertex = -1;
  updateVertexReadout();
  dirty = true;
}

function rotatePoint(point) {
  const result = point.slice();
  for (const key of planeKeys(state.dimension)) {
    const angle = liveAngles[key] || 0;
    if (Math.abs(angle) < 0.000001) continue;
    const [a, b] = parsePlane(key);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const av = result[a];
    const bv = result[b];
    result[a] = av * cos - bv * sin;
    result[b] = av * sin + bv * cos;
  }
  return result;
}

function projectDimensions(point, target) {
  const projected = point.slice();
  if (state.method === 'orthographic') {
    return projected.slice(0, target);
  }

  while (projected.length > target) {
    const hidden = projected[projected.length - 1];
    const distance = 3.35;
    const factor = clamp(distance / (distance - hidden), 0.28, 3.2);
    projected.pop();
    for (let i = 0; i < projected.length; i += 1) projected[i] *= factor;
  }
  return projected;
}

function toScreen(point, target, width, height, mini = false) {
  let x = point[0] || 0;
  let y = target > 1 ? point[1] || 0 : 0;
  let depth = 0;

  if (target === 4) {
    let z = point[2] || 0;
    const w = point[3] || 0;
    if (state.method === 'perspective') {
      const hyperCamera = 3.35;
      const hyperFactor = clamp(hyperCamera / (hyperCamera - w), 0.28, 3.2);
      x *= hyperFactor;
      y *= hyperFactor;
      z *= hyperFactor;
    }
    const camera = 4.2;
    const factor = clamp(camera / (camera - z), 0.42, 2.7);
    x *= factor;
    y *= factor;
    depth = z;
  } else if (target === 3) {
    const z = point[2] || 0;
    const camera = 4.2;
    const factor = clamp(camera / (camera - z), 0.42, 2.7);
    x *= factor;
    y *= factor;
    depth = z;
  }

  const span = target === 1 ? width * 0.34 : Math.min(width, height) * (mini ? 0.30 : 0.34);
  const scale = span * state.zoom;
  return {
    x: width / 2 + x * scale,
    y: height / 2 - y * scale,
    z: depth
  };
}

function prepareScene(target, width, height, mini = false) {
  const rotated = geometry.vertices.map(rotatePoint);
  const projected = rotated.map((point) => projectDimensions(point, target));
  const screen = projected.map((point) => toScreen(point, target, width, height, mini));
  return { rotated, projected, screen };
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function mixAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawAxes(ctx, width, height, target, mini) {
  if (mini || target === 1) return;
  const origin = Array(state.dimension).fill(0);
  const originScreen = toScreen(projectDimensions(rotatePoint(origin), target), target, width, height, mini);

  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';

  for (let axis = 0; axis < state.dimension; axis += 1) {
    const vector = Array(state.dimension).fill(0);
    vector[axis] = 1.34;
    const projected = projectDimensions(rotatePoint(vector), target);
    const end = toScreen(projected, target, width, height, mini);
    const color = AXIS_COLORS[axis];
    ctx.strokeStyle = mixAlpha(color, axis < target ? 0.36 : 0.55);
    ctx.fillStyle = color;
    ctx.setLineDash(axis < target ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(originScreen.x, originScreen.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(AXES[axis], end.x + 5, end.y);
  }

  ctx.restore();
}

function drawOneDimensional(ctx, scene, width, height, mini) {
  const baselineY = height / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(17,19,24,.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mini ? 8 : 18, baselineY);
  ctx.lineTo(width - (mini ? 8 : 18), baselineY);
  ctx.stroke();

  const maxEdges = mini ? 45 : 90;
  const step = Math.max(1, Math.ceil(geometry.edges.length / maxEdges));
  for (let i = 0; i < geometry.edges.length; i += step) {
    const edge = geometry.edges[i];
    const a = scene.screen[edge.a];
    const b = scene.screen[edge.b];
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const span = right - left;
    const bend = Math.min((mini ? 18 : 48), Math.max(4, span * 0.18));
    const direction = i % 2 ? 1 : -1;
    ctx.strokeStyle = mixAlpha(AXIS_COLORS[edge.axis % AXIS_COLORS.length], mini ? 0.24 : 0.34);
    ctx.beginPath();
    ctx.moveTo(left, baselineY);
    ctx.quadraticCurveTo((left + right) / 2, baselineY + bend * direction, right, baselineY);
    ctx.stroke();
  }

  for (let i = 0; i < scene.screen.length; i += 1) {
    const point = scene.screen[i];
    ctx.fillStyle = i === selectedVertex && !mini ? '#2459d6' : '#111318';
    ctx.beginPath();
    ctx.arc(point.x, baselineY, i === selectedVertex && !mini ? 5 : (mini ? 2.4 : 3.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGraph(ctx, scene, width, height, target, mini) {
  if (target === 1) {
    drawOneDimensional(ctx, scene, width, height, mini);
    return;
  }

  const edges = geometry.edges.map((edge) => ({
    ...edge,
    depth: ((scene.screen[edge.a].z || 0) + (scene.screen[edge.b].z || 0)) / 2
  }));
  edges.sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const edge of edges) {
    const a = scene.screen[edge.a];
    const b = scene.screen[edge.b];
    const depthAlpha = target >= 3 ? clamp(0.30 + (edge.depth + 1.5) * 0.16, 0.20, 0.80) : 0.62;
    ctx.strokeStyle = mixAlpha(AXIS_COLORS[edge.axis % AXIS_COLORS.length], mini ? depthAlpha * 0.72 : depthAlpha);
    ctx.lineWidth = mini ? 1 : (edge.axis >= target ? 1.65 : 1.25);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let i = 0; i < scene.screen.length; i += 1) {
    const point = scene.screen[i];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const selected = i === selectedVertex && !mini;
    ctx.fillStyle = selected ? '#2459d6' : '#111318';
    ctx.beginPath();
    ctx.arc(point.x, point.y, selected ? 5.5 : (mini ? 2.2 : 3.2), 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = 'rgba(36,89,214,.28)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderCanvas(canvas, requestedTarget, mini = false) {
  const { ctx, width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  if (requestedTarget > state.dimension) {
    ctx.save();
    ctx.fillStyle = 'rgba(17,19,24,.36)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`нет ${requestedTarget}D в ${state.dimension}D`, width / 2, height / 2);
    ctx.restore();
    return null;
  }

  const target = Math.min(requestedTarget, state.dimension);
  const scene = prepareScene(target, width, height, mini);
  drawAxes(ctx, width, height, target, mini);
  drawGraph(ctx, scene, width, height, target, mini);
  return scene;
}

function updateVertexReadout() {
  if (selectedVertex < 0 || !geometry?.vertices[selectedVertex]) {
    ui.vertexName.textContent = 'V—';
    ui.vertexCoordinates.textContent = 'Коснитесь вершины';
    return;
  }

  const rotated = rotatePoint(geometry.vertices[selectedVertex]);
  ui.vertexName.textContent = `V${selectedVertex}`;
  ui.vertexCoordinates.textContent = rotated
    .slice(0, state.dimension)
    .map((value, index) => `${AXES[index]} ${value >= 0 ? '+' : ''}${value.toFixed(2)}`)
    .join(' · ');
}

function companionPlane() {
  if (state.dimension < 3 || !state.plane) return '';
  const [a, b] = parsePlane(state.plane);
  const candidate = [...Array(state.dimension).keys()].find((axis) => axis !== a && axis !== b);
  if (candidate === undefined) return '';
  return planeKey(candidate, b);
}

function updateExplain() {
  if (state.dimension === 1) {
    ui.explain.textContent = '1D содержит только одну координату X. Здесь нечего вращать: любая фигура сводится к точкам и связям на линии.';
  } else if (state.dimension === 2) {
    ui.explain.textContent = '2D живёт на плоскости X–Y. Вращение XY меняет ориентацию, но не создаёт скрытых координат.';
  } else if (state.dimension === 3) {
    ui.explain.textContent = '3D добавляет Z. Экран всё ещё 2D, поэтому глубина показывается перспективой, перекрытием и изменением масштаба.';
  } else if (state.dimension === 4) {
    ui.explain.textContent = '4D добавляет W. Вращайте XW, YW или ZW: W нельзя увидеть напрямую, но смешивание с X/Y/Z меняет наблюдаемую 3D-тень.';
  } else {
    ui.explain.textContent = '5D добавляет V поверх W. Плоскости XV, YV, ZV и WV дают независимые вращения, после чего координаты последовательно проецируются 5D→4D→3D→2D.';
  }
}

function updatePlaneOptions() {
  const keys = planeKeys(state.dimension);
  const current = keys.includes(state.plane) ? state.plane : (keys[0] || '');
  state.plane = current;
  ui.plane.replaceChildren();

  if (!keys.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Нет — в 1D вращения отсутствуют';
    ui.plane.append(option);
    ui.plane.disabled = true;
    return;
  }

  ui.plane.disabled = false;
  for (const key of keys) {
    const [a, b] = parsePlane(key);
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${AXES[a]}${AXES[b]}`;
    ui.plane.append(option);
  }
  ui.plane.value = state.plane;
}

function planeLabel(key) {
  if (!key) return '—';
  const [a, b] = parsePlane(key);
  return `${AXES[a]}${AXES[b]}`;
}

function updateUi() {
  for (const button of ui.dimensionButtons) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.dimension) === state.dimension));
  }

  if (state.target > state.dimension) state.target = Math.min(3, state.dimension);
  for (const button of ui.targetButtons) {
    const target = Number(button.dataset.target);
    button.disabled = target > state.dimension;
    button.setAttribute('aria-pressed', String(target === state.target));
  }

  ui.shape.value = state.shape;
  ui.method.value = state.method;
  ui.zoom.value = String(Math.round(state.zoom * 100));
  ui.zoomOutput.value = `${Math.round(state.zoom * 100)}%`;
  ui.auto.setAttribute('aria-pressed', String(state.auto));
  ui.auto.textContent = state.auto ? 'Авто: вкл' : 'Авто: выкл';
  ui.auto.disabled = state.dimension < 2;
  updatePlaneOptions();

  const methodName = state.method === 'perspective' ? 'перспективная' : 'ортографическая';
  ui.topStatus.textContent = `${state.dimension}D → ${state.target}D`;
  ui.stageLabel.textContent = `${state.dimension}D → ${state.target}D · ${methodName}`;
  ui.stats.textContent = `${geometry.vertices.length} вершин · ${geometry.edges.length} рёбер · ${planeKeys(state.dimension).length} плоскостей вращения`;

  const companion = companionPlane();
  ui.gestureHint.textContent = state.dimension < 2
    ? 'касание — координаты вершины'
    : companion
      ? `↔ ${state.plane ? planeLabel(state.plane) : '—'} · ↕ ${planeLabel(companion)} · щипок — масштаб`
      : `↔ ${state.plane ? planeLabel(state.plane) : '—'} · щипок — масштаб`;

  for (const cell of ui.miniCells) {
    const target = Number(cell.dataset.miniCell);
    cell.classList.toggle('is-unavailable', target > state.dimension);
  }

  updateExplain();
}

function publishTestState() {
  window.__PW_TEST_STATE__ = {
    ready: true,
    app: 'n-space',
    dimension: state.dimension,
    shape: state.shape,
    target: state.target,
    method: state.method,
    plane: state.plane,
    zoom: Number(state.zoom.toFixed(2)),
    auto: state.auto,
    vertices: geometry.vertices.length,
    edges: geometry.edges.length,
    selectedVertex
  };
  window.__POCKET_WORKS_TEST_STATE__ = window.__PW_TEST_STATE__;
}

function render() {
  const scene = renderCanvas(ui.canvas, state.target, false);
  lastMainScreenPoints = scene?.screen || [];
  for (const canvas of ui.miniCanvases) {
    renderCanvas(canvas, Number(canvas.dataset.miniTarget), true);
  }
  updateVertexReadout();
  publishTestState();
  dirty = false;
}

function scheduleRender() {
  dirty = true;
}

function resetView() {
  liveAngles = { ...DEFAULT_ANGLES };
  for (const key of planeKeys(5)) {
    if (!Number.isFinite(liveAngles[key])) liveAngles[key] = 0;
  }
  state.zoom = 1;
  selectedVertex = -1;
  updateUi();
  persist();
  scheduleRender();
}

function setDimension(value) {
  const dimension = clamp(Math.round(value), 1, 5);
  if (dimension === state.dimension) return;
  state.dimension = dimension;
  state.target = Math.min(state.target, Math.min(4, dimension));
  const keys = planeKeys(dimension);
  if (!keys.includes(state.plane)) {
    state.plane = keys.find((key) => parsePlane(key)[1] === dimension - 1) || keys[0] || '';
  }
  buildGeometry();
  updateUi();
  persist();
}

for (const button of ui.dimensionButtons) {
  button.addEventListener('click', () => setDimension(Number(button.dataset.dimension)));
}

for (const button of ui.targetButtons) {
  button.addEventListener('click', () => {
    const target = Number(button.dataset.target);
    if (target > state.dimension) return;
    state.target = target;
    updateUi();
    persist();
    scheduleRender();
  });
}

ui.shape.addEventListener('change', () => {
  state.shape = SHAPES.has(ui.shape.value) ? ui.shape.value : 'hypercube';
  buildGeometry();
  updateUi();
  persist();
});

ui.method.addEventListener('change', () => {
  state.method = METHODS.has(ui.method.value) ? ui.method.value : 'perspective';
  updateUi();
  persist();
  scheduleRender();
});

ui.plane.addEventListener('change', () => {
  if (planeKeys(state.dimension).includes(ui.plane.value)) {
    state.plane = ui.plane.value;
    updateUi();
    persist();
    scheduleRender();
  }
});

ui.zoom.addEventListener('input', () => {
  state.zoom = clamp(Number(ui.zoom.value) / 100, 0.55, 1.8);
  ui.zoomOutput.value = `${Math.round(state.zoom * 100)}%`;
  scheduleRender();
});

ui.zoom.addEventListener('change', persist);

ui.auto.addEventListener('click', () => {
  if (state.dimension < 2) return;
  state.auto = !state.auto;
  updateUi();
  persist();
  scheduleRender();
});

ui.reset.addEventListener('click', resetView);

function pointerDistance() {
  const points = [...activePointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function closestVertex(x, y) {
  const rect = ui.canvas.getBoundingClientRect();
  const localX = x - rect.left;
  const localY = y - rect.top;
  let best = -1;
  let bestDistance = 24;
  for (let i = 0; i < lastMainScreenPoints.length; i += 1) {
    const point = lastMainScreenPoints[i];
    const distance = Math.hypot(point.x - localX, point.y - localY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

ui.canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  ui.canvas.focus({ preventScroll: true });
  ui.canvas.setPointerCapture?.(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 1) {
    dragState = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseAngles: { ...liveAngles },
      moved: false
    };
  } else if (activePointers.size === 2) {
    pinchState = {
      distance: pointerDistance(),
      zoom: state.zoom
    };
  }
});

ui.canvas.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  event.preventDefault();
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size >= 2 && pinchState) {
    const startDistance = Math.max(10, pinchState.distance);
    state.zoom = clamp(pinchState.zoom * pointerDistance() / startDistance, 0.55, 1.8);
    ui.zoom.value = String(Math.round(state.zoom * 100));
    ui.zoomOutput.value = `${Math.round(state.zoom * 100)}%`;
    if (dragState) dragState.moved = true;
    scheduleRender();
    return;
  }

  if (!dragState || dragState.id !== event.pointerId || state.dimension < 2) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  if (Math.hypot(dx, dy) > 5) dragState.moved = true;

  if (state.plane) {
    liveAngles[state.plane] = (dragState.baseAngles[state.plane] || 0) + dx * 0.008;
  }

  const companion = companionPlane();
  if (companion) {
    liveAngles[companion] = (dragState.baseAngles[companion] || 0) - dy * 0.008;
  } else if (state.plane) {
    liveAngles[state.plane] = (dragState.baseAngles[state.plane] || 0) + (dx - dy * 0.25) * 0.008;
  }

  scheduleRender();
});

function endPointer(event) {
  const wasTap = dragState?.id === event.pointerId && !dragState.moved && activePointers.size === 1;
  activePointers.delete(event.pointerId);
  try {
    ui.canvas.releasePointerCapture?.(event.pointerId);
  } catch {}

  if (wasTap) {
    selectedVertex = closestVertex(event.clientX, event.clientY);
    scheduleRender();
  }

  if (activePointers.size < 2) pinchState = null;
  if (dragState?.id === event.pointerId) dragState = null;
  persist();
}

ui.canvas.addEventListener('pointerup', endPointer);
ui.canvas.addEventListener('pointercancel', endPointer);
ui.canvas.addEventListener('lostpointercapture', (event) => {
  activePointers.delete(event.pointerId);
  pinchState = null;
  if (dragState?.id === event.pointerId) dragState = null;
});

ui.canvas.addEventListener('keydown', (event) => {
  if (state.dimension < 2) return;
  const amount = event.shiftKey ? 0.03 : 0.1;
  const companion = companionPlane();
  let handled = true;

  if (event.key === 'ArrowLeft' && state.plane) liveAngles[state.plane] -= amount;
  else if (event.key === 'ArrowRight' && state.plane) liveAngles[state.plane] += amount;
  else if (event.key === 'ArrowUp' && companion) liveAngles[companion] += amount;
  else if (event.key === 'ArrowDown' && companion) liveAngles[companion] -= amount;
  else if (event.key === '+' || event.key === '=') state.zoom = clamp(state.zoom + 0.08, 0.55, 1.8);
  else if (event.key === '-' || event.key === '_') state.zoom = clamp(state.zoom - 0.08, 0.55, 1.8);
  else handled = false;

  if (handled) {
    event.preventDefault();
    ui.zoom.value = String(Math.round(state.zoom * 100));
    ui.zoomOutput.value = `${Math.round(state.zoom * 100)}%`;
    scheduleRender();
    persist();
  }
});

const observer = new ResizeObserver(() => scheduleRender());
observer.observe(ui.canvas);
for (const canvas of ui.miniCanvases) observer.observe(canvas);

document.addEventListener('visibilitychange', () => {
  isVisible = !document.hidden;
  if (!isVisible) persist();
  else scheduleRender();
});

window.addEventListener('pagehide', persist);

window.addEventListener('appdatareset', () => {
  state = sanitizeState(DEFAULTS);
  liveAngles = { ...state.angles };
  buildGeometry();
  updateUi();
  scheduleRender();
});

createWorkshopMode({
  appName: 'N·SPACE',
  version: '1.0.0',
  cachePrefix: 'n-space-',
  storageNamespace: 'pocket-works:n-space',
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (isVisible && state.auto && state.dimension > 1 && !reducedMotion) {
    if (state.plane) liveAngles[state.plane] = (liveAngles[state.plane] || 0) + dt * 0.34;
    const companion = companionPlane();
    if (companion) liveAngles[companion] = (liveAngles[companion] || 0) + dt * 0.13;
    dirty = true;
  }

  if (isVisible && dirty) render();
  requestAnimationFrame(frame);
}

try {
  buildGeometry();
  updateUi();
  render();
  document.documentElement.dataset.ready = 'true';
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  ui.fatal.hidden = false;
  ui.fatal.textContent = 'Не удалось запустить симуляцию. Обновите приложение или сбросьте данные через Workshop.';
  window.__PW_TEST_STATE__ = { ready: false, app: 'n-space', error: String(error?.message || error) };
}
