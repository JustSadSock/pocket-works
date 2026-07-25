import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:otklik';
const STORAGE_KEY = `${STORAGE_NAMESPACE}:state-v1`;
const BAND_LABELS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k'];
const BAND_RANGES = [
  [44, 88], [88, 177], [177, 355], [355, 710],
  [710, 1420], [1420, 2840], [2840, 5680], [5680, 11360]
];

const defaults = Object.freeze({
  schema: 1,
  projectName: 'Новая комната',
  room: { width: 4.2, length: 5.5, height: 2.7 },
  points: [],
  selectedPointId: null,
  mapMode: 'clarity',
  settings: { haptics: true, uiSound: true },
  compareIds: []
});

const els = {
  canvas: document.querySelector('#roomCanvas'),
  mapFrame: document.querySelector('#mapFrame'),
  mapEmpty: document.querySelector('#mapEmpty'),
  measureVisual: document.querySelector('#measureVisual'),
  projectNameLabel: document.querySelector('#projectNameLabel'),
  selectedPointIndex: document.querySelector('#selectedPointIndex'),
  pointStatus: document.querySelector('#pointStatus'),
  pointHint: document.querySelector('#pointHint'),
  measureButton: document.querySelector('#measureButton'),
  measureButtonText: document.querySelector('#measureButtonText'),
  resultStrip: document.querySelector('#resultStrip'),
  resultGrade: document.querySelector('#resultGrade'),
  resultCaption: document.querySelector('#resultCaption'),
  resultSummary: document.querySelector('#resultSummary'),
  metricDecay: document.querySelector('#metricDecay'),
  metricBoom: document.querySelector('#metricBoom'),
  metricNoise: document.querySelector('#metricNoise'),
  openResultButton: document.querySelector('#openResultButton'),
  settingsSheet: document.querySelector('#settingsSheet'),
  roomSheet: document.querySelector('#roomSheet'),
  resultSheet: document.querySelector('#resultSheet'),
  compareSheet: document.querySelector('#compareSheet'),
  sheetBackdrop: document.querySelector('#sheetBackdrop'),
  preflightModal: document.querySelector('#preflightModal'),
  errorModal: document.querySelector('#errorModal'),
  confirmClearModal: document.querySelector('#confirmClearModal'),
  errorMessage: document.querySelector('#errorMessage'),
  toast: document.querySelector('#toast'),
  projectNameInput: document.querySelector('#projectNameInput'),
  hapticsToggle: document.querySelector('#hapticsToggle'),
  uiSoundToggle: document.querySelector('#uiSoundToggle'),
  roomWidthInput: document.querySelector('#roomWidthInput'),
  roomLengthInput: document.querySelector('#roomLengthInput'),
  roomHeightInput: document.querySelector('#roomHeightInput'),
  measurementsScreen: document.querySelector('#measurementsScreen'),
  guideScreen: document.querySelector('#guideScreen'),
  measurementList: document.querySelector('#measurementList'),
  archiveSummary: document.querySelector('#archiveSummary'),
  compareButton: document.querySelector('#compareButton'),
  compareBody: document.querySelector('#compareBody'),
  resultScore: document.querySelector('#resultScore'),
  resultSheetKicker: document.querySelector('#resultSheetKicker'),
  resultTitle: document.querySelector('#resultTitle'),
  diagnosisText: document.querySelector('#diagnosisText'),
  detailDecay: document.querySelector('#detailDecay'),
  detailBoom: document.querySelector('#detailBoom'),
  detailNoise: document.querySelector('#detailNoise'),
  detailClarity: document.querySelector('#detailClarity'),
  spectrumBars: document.querySelector('#spectrumBars'),
  precisionLabel: document.querySelector('#precisionLabel'),
  deleteMeasurementButton: document.querySelector('#deleteMeasurementButton'),
  legendLow: document.querySelector('#legendLow'),
  legendHigh: document.querySelector('#legendHigh')
};

const ctx = els.canvas.getContext('2d', { alpha: true });
let state = loadState();
let resizeObserver = null;
let canvasMetrics = { width: 1, height: 1, dpr: 1 };
let pointerSession = null;
let measuring = false;
let measurementAbort = null;
let viewedPointId = null;
let toastTimer = 0;
let uiAudioContext = null;

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaults));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.schema !== 1) return cloneDefaults();
    return sanitizeState(parsed);
  } catch {
    return cloneDefaults();
  }
}

function sanitizeState(input) {
  const next = cloneDefaults();
  next.projectName = typeof input.projectName === 'string' && input.projectName.trim()
    ? input.projectName.trim().slice(0, 40)
    : defaults.projectName;
  next.room = {
    width: clampNumber(input.room?.width, 1.5, 30, defaults.room.width),
    length: clampNumber(input.room?.length, 1.5, 30, defaults.room.length),
    height: clampNumber(input.room?.height, 1.8, 8, defaults.room.height)
  };
  next.mapMode = ['clarity', 'boom', 'decay'].includes(input.mapMode) ? input.mapMode : 'clarity';
  next.settings = {
    haptics: input.settings?.haptics !== false,
    uiSound: input.settings?.uiSound !== false
  };
  next.points = Array.isArray(input.points)
    ? input.points.slice(0, 80).map(sanitizePoint).filter(Boolean)
    : [];
  next.selectedPointId = next.points.some((point) => point.id === input.selectedPointId)
    ? input.selectedPointId
    : (next.points.at(-1)?.id || null);
  next.compareIds = Array.isArray(input.compareIds)
    ? input.compareIds.filter((id) => next.points.some((point) => point.id === id && point.measurement)).slice(0, 2)
    : [];
  return next;
}

function sanitizePoint(point) {
  if (!point || typeof point.id !== 'string') return null;
  const clean = {
    id: point.id.slice(0, 60),
    x: clampNumber(point.x, 0.03, 0.97, 0.5),
    y: clampNumber(point.y, 0.03, 0.97, 0.5),
    createdAt: typeof point.createdAt === 'string' ? point.createdAt : new Date().toISOString(),
    measurement: null
  };
  if (point.measurement && Array.isArray(point.measurement.bands)) {
    clean.measurement = sanitizeMeasurement(point.measurement);
  }
  return clean;
}

function sanitizeMeasurement(value) {
  return {
    measuredAt: typeof value.measuredAt === 'string' ? value.measuredAt : new Date().toISOString(),
    demo: Boolean(value.demo),
    clarityScore: clampNumber(value.clarityScore, 0, 100, 50),
    clarityDb: clampNumber(value.clarityDb, -20, 30, 0),
    decay: clampNumber(value.decay, 0.12, 5, 1),
    boom: clampNumber(value.boom, -18, 30, 0),
    noiseDb: clampNumber(value.noiseDb, -100, -3, -50),
    bands: value.bands.slice(0, 8).map((band) => clampNumber(band, -30, 30, 0)),
    confidence: ['high', 'medium', 'low', 'demo'].includes(value.confidence) ? value.confidence : 'low',
    snr: clampNumber(value.snr, 0, 100, 0),
    clipping: clampNumber(value.clipping, 0, 1, 0)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('Не удалось сохранить проект на устройстве');
  }
}

function selectedPoint() {
  return state.points.find((point) => point.id === state.selectedPointId) || null;
}

function measuredPoints() {
  return state.points.filter((point) => point.measurement);
}

function pointNumber(point) {
  const index = state.points.findIndex((candidate) => candidate.id === point?.id);
  return index >= 0 ? index + 1 : 0;
}

function uid() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function haptic(pattern = 12) {
  if (state.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function playUiTick(pitch = 520) {
  if (!state.settings.uiSound) return;
  try {
    uiAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const audio = uiAudioContext;
    if (audio.state === 'suspended') audio.resume();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = pitch;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, audio.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.055);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.06);
  } catch {
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2300);
}

function openSheet(sheet) {
  closeAllSheets();
  els.sheetBackdrop.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.querySelector('button, input')?.focus({ preventScroll: true }));
}

function closeAllSheets() {
  [els.settingsSheet, els.roomSheet, els.resultSheet, els.compareSheet].forEach((sheet) => { sheet.hidden = true; });
  els.sheetBackdrop.hidden = true;
}

function openModal(modal) {
  modal.hidden = false;
  requestAnimationFrame(() => modal.querySelector('button')?.focus({ preventScroll: true }));
}

function closeModals() {
  [els.preflightModal, els.errorModal, els.confirmClearModal].forEach((modal) => { modal.hidden = true; });
}

function showScreen(screen) {
  els.measurementsScreen.hidden = screen !== 'measurements';
  els.guideScreen.hidden = screen !== 'guide';
  document.querySelectorAll('[data-screen]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.screen === (screen === 'map' ? 'map' : screen));
  });
  if (screen === 'measurements') renderArchive();
}

function closeSecondaryScreens() {
  els.measurementsScreen.hidden = true;
  els.guideScreen.hidden = true;
  document.querySelectorAll('[data-screen]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.screen === 'map');
  });
}

function updateStaticControls() {
  els.projectNameLabel.textContent = state.projectName;
  els.projectNameInput.value = state.projectName;
  els.hapticsToggle.checked = state.settings.haptics;
  els.uiSoundToggle.checked = state.settings.uiSound;
  els.roomWidthInput.value = state.room.width.toFixed(1);
  els.roomLengthInput.value = state.room.length.toFixed(1);
  els.roomHeightInput.value = state.room.height.toFixed(1);
  document.querySelectorAll('[data-map-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mapMode === state.mapMode);
  });
  const legends = {
    clarity: ['глуше', 'яснее'],
    boom: ['гудит', 'ровнее'],
    decay: ['дольше', 'короче']
  };
  [els.legendLow.textContent, els.legendHigh.textContent] = legends[state.mapMode];
}

function updateDock() {
  const point = selectedPoint();
  if (!point) {
    els.selectedPointIndex.textContent = 'Нет точки';
    els.pointStatus.textContent = 'Коснись плана';
    els.pointHint.textContent = 'Точка появится прямо под пальцем.';
    els.measureButton.disabled = true;
    els.measureButtonText.textContent = 'Измерить';
    return;
  }
  els.measureButton.disabled = measuring;
  els.selectedPointIndex.textContent = `Точка ${pointNumber(point)}`;
  if (measuring) {
    els.pointStatus.textContent = 'Слушаю помещение';
    els.pointHint.textContent = 'Не двигай телефон и не разговаривай.';
    els.measureButton.disabled = false;
    els.measureButton.classList.add('is-measuring');
    els.measureButtonText.textContent = 'Остановить';
  } else if (point.measurement) {
    els.pointStatus.textContent = point.measurement.demo ? 'Демо-замер' : 'Замер готов';
    els.pointHint.textContent = diagnosisShort(point.measurement);
    els.measureButton.classList.remove('is-measuring');
    els.measureButtonText.textContent = 'Перемерить';
  } else {
    els.pointStatus.textContent = 'Готова к замеру';
    els.pointHint.textContent = 'Телефон должен лежать экраном вверх.';
    els.measureButton.classList.remove('is-measuring');
    els.measureButtonText.textContent = 'Измерить';
  }
}

function latestMeasuredPoint() {
  return measuredPoints().slice().sort((a, b) => {
    return new Date(b.measurement.measuredAt) - new Date(a.measurement.measuredAt);
  })[0] || null;
}

function updateResultStrip() {
  const point = selectedPoint()?.measurement ? selectedPoint() : latestMeasuredPoint();
  const measurement = point?.measurement;
  if (!measurement) {
    els.resultGrade.textContent = '—';
    els.resultCaption.textContent = 'Последний замер';
    els.resultSummary.textContent = 'Пока пусто';
    els.metricDecay.textContent = '—';
    els.metricBoom.textContent = '—';
    els.metricNoise.textContent = '—';
    return;
  }
  els.resultGrade.textContent = gradeFor(measurement.clarityScore);
  els.resultCaption.textContent = `${measurement.demo ? 'Демо · ' : ''}точка ${pointNumber(point)}`;
  els.resultSummary.textContent = diagnosisShort(measurement);
  els.metricDecay.textContent = `${measurement.decay.toFixed(2)}с`;
  els.metricBoom.textContent = formatSigned(measurement.boom, 'дБ');
  els.metricNoise.textContent = `${measurement.noiseDb.toFixed(0)}`;
}

function gradeFor(score) {
  if (score >= 84) return 'A';
  if (score >= 70) return 'B';
  if (score >= 54) return 'C';
  if (score >= 38) return 'D';
  return 'E';
}

function diagnosisShort(measurement) {
  if (measurement.demo) return 'Пример данных, не реальный замер';
  if (measurement.clarityScore >= 82 && measurement.decay < 0.75) return 'Чистая точка для речи';
  if (measurement.boom > 7) return 'Заметный низкочастотный гул';
  if (measurement.decay > 1.35) return 'Длинный отражённый хвост';
  if (measurement.noiseDb > -38) return 'Фон мешает точности';
  if (measurement.clarityScore >= 66) return 'Рабочая точка без явной беды';
  return 'Речь будет терять разборчивость';
}

function diagnosisLong(measurement) {
  const notes = [];
  if (measurement.demo) return 'Это демонстрационный отпечаток. Он показывает интерфейс, но ничего не говорит о твоей комнате.';
  if (measurement.clarityScore >= 82) notes.push('Речь здесь должна оставаться собранной и читаемой.');
  else if (measurement.clarityScore >= 64) notes.push('Точка пригодна для разговора, но помещение заметно подмешивает себя.');
  else notes.push('Отражения и спектральный перекос будут съедать согласные и утомлять слух.');
  if (measurement.boom > 7) notes.push('Главная проблема — избыток баса: попробуй отодвинуть источник или точку прослушивания от стены и угла.');
  else if (measurement.boom < -6) notes.push('Низкие частоты здесь проваливаются; перемещение на 20–50 см может изменить картину сильнее любой эквализации.');
  if (measurement.decay > 1.35) notes.push('Мягкие крупные поверхности напротив голых стен дадут больше пользы, чем мелкий декор.');
  if (measurement.noiseDb > -38) notes.push('Фон был высоким, поэтому сравни результат повторным замером в тишине.');
  return notes.join(' ');
}

function formatSigned(value, suffix = '') {
  const sign = value > 0.05 ? '+' : '';
  return `${sign}${value.toFixed(1)}${suffix ? ` ${suffix}` : ''}`;
}

function renderAll() {
  updateStaticControls();
  updateDock();
  updateResultStrip();
  resizeCanvas();
  renderArchive();
}

function resizeCanvas() {
  const rect = els.mapFrame.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  canvasMetrics = { width: rect.width, height: rect.height, dpr };
  els.canvas.style.width = `${rect.width}px`;
  els.canvas.style.height = `${rect.height}px`;
  drawMap();
}

function roomRect() {
  const { width, height } = canvasMetrics;
  const padding = Math.max(28, Math.min(width, height) * 0.09);
  const usableWidth = Math.max(20, width - padding * 2);
  const usableHeight = Math.max(20, height - padding * 2);
  const aspect = state.room.width / state.room.length;
  let roomWidth = usableWidth;
  let roomHeight = roomWidth / aspect;
  if (roomHeight > usableHeight) {
    roomHeight = usableHeight;
    roomWidth = roomHeight * aspect;
  }
  return {
    x: (width - roomWidth) / 2,
    y: (height - roomHeight) / 2,
    width: roomWidth,
    height: roomHeight
  };
}

function drawMap() {
  const { width, height, dpr } = canvasMetrics;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const room = roomRect();
  const measured = measuredPoints();
  els.mapEmpty.classList.toggle('is-hidden', state.points.length > 0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(room.x, room.y, room.width, room.height);
  ctx.clip();
  if (measured.length) drawHeatmap(room, measured);
  drawRoomGrid(room);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#20211f';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(room.x, room.y, room.width, room.height);
  drawDoor(room);
  drawDimensions(room);
  ctx.restore();

  state.points.forEach((point) => drawPoint(room, point));
  const selected = selectedPoint();
  if (selected) {
    const position = pointToCanvas(room, selected);
    els.measureVisual.style.setProperty('--scan-x', `${position.x}px`);
    els.measureVisual.style.setProperty('--scan-y', `${position.y}px`);
  }
}

function drawRoomGrid(room) {
  ctx.save();
  ctx.strokeStyle = 'rgba(32,33,31,.09)';
  ctx.lineWidth = 1;
  const stepX = room.width / Math.max(2, Math.round(state.room.width));
  const stepY = room.height / Math.max(2, Math.round(state.room.length));
  for (let x = room.x + stepX; x < room.x + room.width; x += stepX) {
    ctx.beginPath(); ctx.moveTo(x, room.y); ctx.lineTo(x, room.y + room.height); ctx.stroke();
  }
  for (let y = room.y + stepY; y < room.y + room.height; y += stepY) {
    ctx.beginPath(); ctx.moveTo(room.x, y); ctx.lineTo(room.x + room.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawDoor(room) {
  const door = Math.min(room.width * 0.18, 58);
  ctx.save();
  ctx.fillStyle = '#eee9df';
  ctx.fillRect(room.x + room.width - door - 16, room.y - 4, door, 8);
  ctx.beginPath();
  ctx.arc(room.x + room.width - 16, room.y, door, Math.PI, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(32,33,31,.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawDimensions(room) {
  ctx.save();
  ctx.fillStyle = 'rgba(32,33,31,.72)';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${state.room.width.toFixed(1)} м`, room.x + room.width / 2, Math.max(14, room.y - 9));
  ctx.translate(Math.max(12, room.x - 11), room.y + room.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${state.room.length.toFixed(1)} м`, 0, 0);
  ctx.restore();
}

function metricValue(measurement) {
  if (state.mapMode === 'clarity') return clamp(measurement.clarityScore / 100, 0, 1);
  if (state.mapMode === 'boom') return clamp(1 - Math.max(0, measurement.boom + 1) / 18, 0, 1);
  return clamp(1 - (measurement.decay - 0.2) / 2.2, 0, 1);
}

function drawHeatmap(room, points) {
  const step = Math.max(5, Math.round(Math.min(room.width, room.height) / 54));
  for (let y = room.y; y < room.y + room.height; y += step) {
    for (let x = room.x; x < room.x + room.width; x += step) {
      let weighted = 0;
      let weightTotal = 0;
      points.forEach((point) => {
        const px = room.x + point.x * room.width;
        const py = room.y + point.y * room.height;
        const dx = (x - px) / room.width;
        const dy = (y - py) / room.height;
        const distance2 = dx * dx + dy * dy;
        const weight = 1 / (0.015 + distance2 * 4.2);
        weighted += metricValue(point.measurement) * weight;
        weightTotal += weight;
      });
      const value = weighted / Math.max(weightTotal, 0.0001);
      ctx.fillStyle = heatColor(value, 0.62);
      ctx.fillRect(x, y, step + 1, step + 1);
    }
  }
}

function heatColor(value, alpha = 1) {
  const stops = [
    [0, [168, 77, 62]],
    [0.42, [194, 139, 70]],
    [0.72, [77, 139, 138]],
    [1, [36, 90, 120]]
  ];
  const v = clamp(value, 0, 1);
  let left = stops[0];
  let right = stops.at(-1);
  for (let index = 0; index < stops.length - 1; index += 1) {
    if (v >= stops[index][0] && v <= stops[index + 1][0]) {
      left = stops[index];
      right = stops[index + 1];
      break;
    }
  }
  const t = (v - left[0]) / Math.max(0.0001, right[0] - left[0]);
  const rgb = left[1].map((channel, index) => Math.round(channel + (right[1][index] - channel) * t));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function drawPoint(room, point) {
  const { x, y } = pointToCanvas(room, point);
  const selected = point.id === state.selectedPointId;
  const measurement = point.measurement;
  ctx.save();
  if (selected) {
    ctx.strokeStyle = 'rgba(32,33,31,.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(room.x, y); ctx.lineTo(room.x + room.width, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, room.y); ctx.lineTo(x, room.y + room.height); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(x, y, selected ? 15 : 12, 0, Math.PI * 2);
  ctx.fillStyle = measurement ? heatColor(metricValue(measurement), 0.98) : '#eee9df';
  ctx.fill();
  ctx.strokeStyle = '#20211f';
  ctx.lineWidth = selected ? 2.4 : 1.6;
  ctx.stroke();
  if (!measurement) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#a84d3e';
    ctx.fill();
  }
  ctx.fillStyle = measurement && metricValue(measurement) < 0.48 ? '#f5efe4' : '#20211f';
  ctx.font = '800 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (measurement) ctx.fillText(String(pointNumber(point)), x, y + 0.5);
  ctx.restore();
}

function pointToCanvas(room, point) {
  return { x: room.x + point.x * room.width, y: room.y + point.y * room.height };
}

function canvasToPoint(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  const room = roomRect();
  const x = clamp((clientX - rect.left - room.x) / room.width, 0.03, 0.97);
  const y = clamp((clientY - rect.top - room.y) / room.height, 0.03, 0.97);
  return { x, y };
}

function hitPoint(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  const room = roomRect();
  const local = { x: clientX - rect.left, y: clientY - rect.top };
  let best = null;
  let bestDistance = 28;
  state.points.forEach((point) => {
    const position = pointToCanvas(room, point);
    const distance = Math.hypot(position.x - local.x, position.y - local.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  });
  return best;
}

function addOrMovePoint(clientX, clientY) {
  const position = canvasToPoint(clientX, clientY);
  let point = selectedPoint();
  if (!point || point.measurement) {
    point = { id: uid(), ...position, createdAt: new Date().toISOString(), measurement: null };
    state.points.push(point);
  } else {
    point.x = position.x;
    point.y = position.y;
  }
  state.selectedPointId = point.id;
  state.compareIds = [];
  saveState();
  haptic(10);
  playUiTick(410);
  renderAll();
}

function handleCanvasPointerDown(event) {
  if (measuring) return;
  const hit = hitPoint(event.clientX, event.clientY);
  pointerSession = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    hitId: hit?.id || null,
    dragging: false
  };
  els.canvas.setPointerCapture?.(event.pointerId);
  if (hit) {
    state.selectedPointId = hit.id;
    renderAll();
  }
}

function handleCanvasPointerMove(event) {
  if (!pointerSession || pointerSession.id !== event.pointerId || !pointerSession.hitId || measuring) return;
  const distance = Math.hypot(event.clientX - pointerSession.startX, event.clientY - pointerSession.startY);
  if (distance < 5 && !pointerSession.dragging) return;
  pointerSession.dragging = true;
  const point = state.points.find((candidate) => candidate.id === pointerSession.hitId);
  if (!point) return;
  Object.assign(point, canvasToPoint(event.clientX, event.clientY));
  state.selectedPointId = point.id;
  drawMap();
  updateDock();
}

function handleCanvasPointerUp(event) {
  if (!pointerSession || pointerSession.id !== event.pointerId) return;
  const session = pointerSession;
  pointerSession = null;
  els.canvas.releasePointerCapture?.(event.pointerId);
  if (session.dragging) {
    saveState();
    haptic(8);
    renderAll();
    return;
  }
  if (session.hitId) {
    state.selectedPointId = session.hitId;
    saveState();
    playUiTick(470);
    renderAll();
  } else {
    addOrMovePoint(event.clientX, event.clientY);
  }
}

function handleCanvasPointerCancel(event) {
  if (!pointerSession || pointerSession.id !== event.pointerId) return;
  pointerSession = null;
  renderAll();
}

async function beginMeasurement() {
  const point = selectedPoint();
  if (!point || measuring) return;
  closeModals();
  measuring = true;
  measurementAbort = { cancelled: false, cleanup: null };
  els.measureVisual.classList.add('is-active');
  updateDock();
  drawMap();
  try {
    const result = await captureAndAnalyze(measurementAbort);
    if (measurementAbort.cancelled) return;
    point.measurement = { ...result, measuredAt: new Date().toISOString(), demo: false };
    state.selectedPointId = point.id;
    state.compareIds = [];
    saveState();
    haptic([20, 35, 45]);
    playUiTick(660);
    renderAll();
    openResult(point.id);
  } catch (error) {
    if (measurementAbort?.cancelled) {
      showToast('Замер остановлен');
    } else {
      els.errorMessage.textContent = humanizeMeasurementError(error);
      openModal(els.errorModal);
    }
  } finally {
    measurementAbort?.cleanup?.();
    measurementAbort = null;
    measuring = false;
    els.measureVisual.classList.remove('is-active');
    updateDock();
    drawMap();
  }
}

function cancelMeasurement() {
  if (!measuring || !measurementAbort) return;
  measurementAbort.cancelled = true;
  measurementAbort.cleanup?.();
  measuring = false;
  els.measureVisual.classList.remove('is-active');
  updateDock();
  showToast('Замер остановлен');
}

function humanizeMeasurementError(error) {
  const name = error?.name || '';
  if (!navigator.mediaDevices?.getUserMedia) return 'Этот браузер не даёт приложению доступ к микрофону. Открой ОТКЛИК в Safari или Chrome по HTTPS.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к микрофону запрещён. Разреши его для Pocket Works в настройках браузера и повтори замер.';
  if (name === 'NotFoundError') return 'Браузер не нашёл доступный микрофон.';
  if (name === 'NotReadableError') return 'Микрофон занят другим приложением или системой.';
  if (String(error?.message || '').includes('ScriptProcessor')) return 'Аудиодвижок этого браузера не поддерживает запись для анализа.';
  return 'Аудиозапись прервалась. Проверь разрешение микрофона, убери Bluetooth-гарнитуру и попробуй ещё раз.';
}

async function captureAndAnalyze(abort) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia unavailable');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('AudioContext unavailable');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1
    }
  });
  if (abort.cancelled) {
    stream.getTracks().forEach((track) => track.stop());
    throw new DOMException('Cancelled', 'AbortError');
  }

  const audio = new AudioContextClass({ latencyHint: 'interactive' });
  await audio.resume();
  const processor = audio.createScriptProcessor?.(2048, 1, 1);
  if (!processor) throw new Error('ScriptProcessor unavailable');
  const input = audio.createMediaStreamSource(stream);
  const mute = audio.createGain();
  mute.gain.value = 0;
  const chunks = [];
  let collecting = true;
  processor.onaudioprocess = (event) => {
    if (!collecting || abort.cancelled) return;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  input.connect(processor);
  processor.connect(mute).connect(audio.destination);

  const cleanup = () => {
    collecting = false;
    processor.onaudioprocess = null;
    try { input.disconnect(); } catch {}
    try { processor.disconnect(); } catch {}
    try { mute.disconnect(); } catch {}
    stream.getTracks().forEach((track) => track.stop());
    if (audio.state !== 'closed') audio.close().catch(() => {});
  };
  abort.cleanup = cleanup;

  const preDuration = 0.32;
  const sweepDuration = 2.35;
  const tailDuration = 1.05;
  await sleep(preDuration * 1000, abort);

  const chirp = createLogSweep(audio.sampleRate, sweepDuration, 45, Math.min(15500, audio.sampleRate * 0.42));
  const buffer = audio.createBuffer(1, chirp.length, audio.sampleRate);
  buffer.copyToChannel(chirp, 0);
  const sweepSource = audio.createBufferSource();
  const sweepGain = audio.createGain();
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 8;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  sweepGain.gain.value = 0.19;
  sweepSource.buffer = buffer;
  sweepSource.connect(sweepGain).connect(compressor).connect(audio.destination);
  sweepSource.start();
  await sleep((sweepDuration + tailDuration) * 1000, abort);

  collecting = false;
  const samples = joinFloat32(chunks);
  const analysis = analyzeRecording(samples, audio.sampleRate, preDuration, sweepDuration);
  cleanup();
  return analysis;
}

function sleep(milliseconds, abort) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const check = setInterval(() => {
      if (!abort.cancelled) return;
      clearTimeout(timer);
      clearInterval(check);
      reject(new DOMException('Cancelled', 'AbortError'));
    }, 30);
    setTimeout(() => clearInterval(check), milliseconds + 100);
  });
}

function createLogSweep(sampleRate, duration, startFrequency, endFrequency) {
  const length = Math.floor(sampleRate * duration);
  const output = new Float32Array(length);
  const ratio = endFrequency / startFrequency;
  const logRatio = Math.log(ratio);
  const fadeSamples = Math.floor(sampleRate * 0.035);
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const phase = 2 * Math.PI * startFrequency * duration / logRatio * (Math.exp(logRatio * t / duration) - 1);
    let envelope = 1;
    if (index < fadeSamples) envelope = 0.5 - 0.5 * Math.cos(Math.PI * index / fadeSamples);
    if (index > length - fadeSamples) envelope = 0.5 - 0.5 * Math.cos(Math.PI * (length - index) / fadeSamples);
    output[index] = Math.sin(phase) * envelope;
  }
  return output;
}

function joinFloat32(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
  return output;
}

function analyzeRecording(samples, sampleRate, preDuration, sweepDuration) {
  if (samples.length < sampleRate * 2) throw new Error('Recording too short');
  const preSamples = Math.min(samples.length, Math.floor(sampleRate * Math.max(0.18, preDuration * 0.72)));
  const noiseRms = rms(samples, 0, preSamples);
  const noiseDb = dbfs(noiseRms);
  let clippingCount = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const absolute = Math.abs(samples[index]);
    if (absolute > 0.985) clippingCount += 1;
  }
  const clipping = clippingCount / samples.length;

  const frameSize = Math.max(128, Math.floor(sampleRate * 0.01));
  const envelope = frameRms(samples, frameSize);
  const noiseFrameDb = dbfs(noiseRms);
  const expectedStartFrame = Math.floor(preDuration / 0.01);
  let signalStartFrame = expectedStartFrame;
  for (let index = Math.max(0, expectedStartFrame - 8); index < Math.min(envelope.length, expectedStartFrame + 45); index += 1) {
    if (dbfs(envelope[index]) > noiseFrameDb + 9) {
      signalStartFrame = index;
      break;
    }
  }
  const signalStart = signalStartFrame * frameSize;
  const sweepEnd = Math.min(samples.length, signalStart + Math.floor(sampleRate * sweepDuration));
  const bands = computeBandProfile(samples, sampleRate, signalStart, sweepEnd);

  const tailSearchStart = Math.min(envelope.length - 1, Math.floor(sweepEnd / frameSize));
  const tailSearchEnd = Math.min(envelope.length, tailSearchStart + Math.floor(0.35 / 0.01));
  let tailPeakFrame = tailSearchStart;
  for (let index = tailSearchStart; index < tailSearchEnd; index += 1) {
    if ((envelope[index] || 0) > (envelope[tailPeakFrame] || 0)) tailPeakFrame = index;
  }

  const decay = estimateDecay(envelope, tailPeakFrame, noiseRms, 0.01);
  const clarityDb = estimateClarity(samples, tailPeakFrame * frameSize, sampleRate);
  const mid = average([bands[3], bands[4], bands[5]]);
  const low = average([bands[0], bands[1]]);
  const boom = clamp(low - mid, -18, 30);
  const signalRms = rms(samples, signalStart, sweepEnd);
  const snr = clamp(20 * Math.log10((signalRms + 1e-9) / (noiseRms + 1e-9)), 0, 100);

  let clarityScore = 70;
  clarityScore += clamp(clarityDb, -8, 12) * 1.9;
  clarityScore -= Math.max(0, decay - 0.55) * 23;
  clarityScore -= Math.max(0, boom - 2.5) * 2.35;
  clarityScore -= Math.max(0, noiseDb + 48) * 1.15;
  clarityScore -= clipping > 0.006 ? 12 : 0;
  clarityScore = clamp(Math.round(clarityScore), 0, 100);

  let confidence = 'low';
  if (snr >= 24 && clipping < 0.003 && samples.length >= sampleRate * 3.2) confidence = 'high';
  else if (snr >= 14 && clipping < 0.02) confidence = 'medium';

  return {
    clarityScore,
    clarityDb: clamp(clarityDb, -20, 30),
    decay: clamp(decay, 0.12, 5),
    boom,
    noiseDb: clamp(noiseDb, -100, -3),
    bands,
    confidence,
    snr,
    clipping
  };
}

function frameRms(samples, frameSize) {
  const frames = Math.ceil(samples.length / frameSize);
  const output = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    output[frame] = rms(samples, frame * frameSize, Math.min(samples.length, (frame + 1) * frameSize));
  }
  return output;
}

function estimateDecay(envelope, startFrame, noiseRms, frameSeconds) {
  const values = [];
  const peak = Math.max(envelope[startFrame] || 0, noiseRms * 1.5, 1e-8);
  for (let index = startFrame; index < envelope.length; index += 1) {
    const relativeDb = 20 * Math.log10(Math.max(envelope[index], 1e-9) / peak);
    const absoluteDb = dbfs(envelope[index]);
    if (relativeDb <= -5 && relativeDb >= -28 && absoluteDb > dbfs(noiseRms) + 3) {
      values.push({ time: (index - startFrame) * frameSeconds, db: relativeDb });
    }
  }
  if (values.length < 8) {
    let crossing = 0.35;
    for (let index = startFrame; index < envelope.length; index += 1) {
      if (20 * Math.log10(Math.max(envelope[index], 1e-9) / peak) < -18) {
        crossing = (index - startFrame) * frameSeconds;
        break;
      }
    }
    return clamp(crossing * (60 / 18), 0.18, 3.5);
  }
  const fit = linearRegression(values);
  if (!Number.isFinite(fit.slope) || fit.slope >= -1) return 2.5;
  return clamp(-60 / fit.slope, 0.15, 4.5);
}

function estimateClarity(samples, start, sampleRate) {
  const earlyEnd = Math.min(samples.length, start + Math.floor(sampleRate * 0.08));
  const lateEnd = Math.min(samples.length, start + Math.floor(sampleRate * 0.55));
  const early = energy(samples, start, earlyEnd);
  const late = energy(samples, earlyEnd, lateEnd);
  return 10 * Math.log10((early + 1e-12) / (late + 1e-12));
}

function computeBandProfile(samples, sampleRate, start, end) {
  const fftSize = 2048;
  const hop = 1024;
  const totals = new Float64Array(BAND_RANGES.length);
  let frames = 0;
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);
  for (let offset = start; offset + fftSize <= end; offset += hop) {
    for (let index = 0; index < fftSize; index += 1) {
      const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (fftSize - 1));
      real[index] = samples[offset + index] * windowValue;
      imag[index] = 0;
    }
    fft(real, imag);
    for (let bin = 1; bin < fftSize / 2; bin += 1) {
      const frequency = bin * sampleRate / fftSize;
      const magnitude2 = real[bin] * real[bin] + imag[bin] * imag[bin];
      for (let band = 0; band < BAND_RANGES.length; band += 1) {
        if (frequency >= BAND_RANGES[band][0] && frequency < BAND_RANGES[band][1]) {
          totals[band] += magnitude2;
          break;
        }
      }
    }
    frames += 1;
  }
  const rawDb = Array.from(totals, (total) => 10 * Math.log10(total / Math.max(1, frames) + 1e-14));
  const reference = average(rawDb.slice(2, 6));
  return rawDb.map((value) => clamp(value - reference, -24, 24));
}

function fft(real, imag) {
  const n = real.length;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const wLengthReal = Math.cos(angle);
    const wLengthImag = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let wReal = 1;
      let wImag = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const even = i + k;
        const odd = even + length / 2;
        const oddReal = real[odd] * wReal - imag[odd] * wImag;
        const oddImag = real[odd] * wImag + imag[odd] * wReal;
        const evenReal = real[even];
        const evenImag = imag[even];
        real[even] = evenReal + oddReal;
        imag[even] = evenImag + oddImag;
        real[odd] = evenReal - oddReal;
        imag[odd] = evenImag - oddImag;
        const nextReal = wReal * wLengthReal - wImag * wLengthImag;
        wImag = wReal * wLengthImag + wImag * wLengthReal;
        wReal = nextReal;
      }
    }
  }
}

function linearRegression(points) {
  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.time, 0);
  const sumY = points.reduce((sum, point) => sum + point.db, 0);
  const sumXY = points.reduce((sum, point) => sum + point.time * point.db, 0);
  const sumXX = points.reduce((sum, point) => sum + point.time * point.time, 0);
  const denominator = count * sumXX - sumX * sumX;
  return { slope: denominator ? (count * sumXY - sumX * sumY) / denominator : NaN };
}

function rms(samples, start, end) {
  const safeStart = Math.max(0, Math.floor(start));
  const safeEnd = Math.min(samples.length, Math.max(safeStart + 1, Math.floor(end)));
  let sum = 0;
  for (let index = safeStart; index < safeEnd; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / Math.max(1, safeEnd - safeStart));
}

function energy(samples, start, end) {
  let sum = 0;
  for (let index = Math.max(0, start); index < Math.min(samples.length, end); index += 1) sum += samples[index] * samples[index];
  return sum;
}

function dbfs(value) {
  return 20 * Math.log10(Math.max(value, 1e-9));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addDemoMeasurement() {
  closeModals();
  let point = selectedPoint();
  if (!point) {
    point = { id: uid(), x: 0.55, y: 0.55, createdAt: new Date().toISOString(), measurement: null };
    state.points.push(point);
    state.selectedPointId = point.id;
  }
  const phase = point.x * 7.2 + point.y * 4.8;
  const decay = clamp(0.48 + point.y * 1.15 + Math.sin(phase) * 0.17, 0.3, 2.1);
  const boom = clamp((1 - point.x) * 11 + Math.cos(phase * 1.3) * 2.2, -3, 15);
  const clarityScore = clamp(Math.round(88 - decay * 18 - Math.max(0, boom - 2) * 2), 24, 92);
  point.measurement = {
    measuredAt: new Date().toISOString(),
    demo: true,
    clarityScore,
    clarityDb: clamp(8 - decay * 5 - boom * 0.2, -6, 12),
    decay,
    boom,
    noiseDb: -49,
    bands: [boom + 3, boom, 2, 0, -1, 1, -2, -4].map((value, index) => clamp(value + Math.sin(phase + index) * 1.8, -18, 18)),
    confidence: 'demo',
    snr: 0,
    clipping: 0
  };
  saveState();
  renderAll();
  openResult(point.id);
  showToast('Добавлен демонстрационный, не реальный замер');
}

function openResult(pointId) {
  const point = state.points.find((candidate) => candidate.id === pointId && candidate.measurement);
  if (!point) {
    showToast('Сначала сделай замер');
    return;
  }
  viewedPointId = point.id;
  const measurement = point.measurement;
  els.resultSheetKicker.textContent = `${measurement.demo ? 'ДЕМО · ' : ''}ТОЧКА ${pointNumber(point)}`;
  els.resultTitle.textContent = diagnosisShort(measurement);
  els.resultScore.textContent = Math.round(measurement.clarityScore);
  els.diagnosisText.textContent = diagnosisLong(measurement);
  els.detailDecay.textContent = `${measurement.decay.toFixed(2)} с`;
  els.detailBoom.textContent = formatSigned(measurement.boom, 'дБ');
  els.detailNoise.textContent = `${measurement.noiseDb.toFixed(1)} dBFS`;
  els.detailClarity.textContent = formatSigned(measurement.clarityDb, 'дБ');
  els.precisionLabel.textContent = confidenceLabel(measurement.confidence);
  els.spectrumBars.innerHTML = '';
  measurement.bands.forEach((value, index) => {
    const bar = document.createElement('div');
    bar.className = 'spectrum-bar';
    const fill = document.createElement('i');
    fill.style.height = `${clamp(50 + value * 2.3, 4, 100)}%`;
    fill.style.opacity = String(clamp(0.55 + Math.abs(value) / 30, 0.55, 1));
    const label = document.createElement('span');
    label.textContent = BAND_LABELS[index];
    bar.append(fill, label);
    els.spectrumBars.append(bar);
  });
  openSheet(els.resultSheet);
}

function confidenceLabel(confidence) {
  return ({ high: 'высокое', medium: 'среднее', low: 'низкое', demo: 'демо' })[confidence] || 'низкое';
}

function renderArchive() {
  const measured = measuredPoints();
  const volume = state.room.width * state.room.length * state.room.height;
  els.archiveSummary.innerHTML = `
    <strong>${measured.length} ${declension(measured.length, ['замер', 'замера', 'замеров'])}</strong>
    <p>${state.room.width.toFixed(1)} × ${state.room.length.toFixed(1)} × ${state.room.height.toFixed(1)} м · примерно ${volume.toFixed(0)} м³. Выбери две точки для сравнения.</p>
  `;
  els.measurementList.innerHTML = '';
  if (!measured.length) {
    els.measurementList.innerHTML = '<div class="empty-archive"><div><strong>Архив ещё молчит</strong><p>Поставь точку на плане и сделай первый замер. После этого здесь появится частотный отпечаток.</p></div></div>';
    els.compareButton.disabled = true;
    return;
  }
  measured.forEach((point) => {
    const measurement = point.measurement;
    const row = document.createElement('div');
    row.className = `measurement-card${state.compareIds.includes(point.id) ? ' is-selected' : ''}`;
    row.innerHTML = `
      <button type="button" class="map-dot" data-compare-id="${point.id}" aria-label="Выбрать точку ${pointNumber(point)} для сравнения">${pointNumber(point)}</button>
      <button type="button" class="measurement-copy" data-open-point="${point.id}">
        <strong>${diagnosisShort(measurement)}</strong>
        <small>${formatDate(measurement.measuredAt)} · ${measurement.demo ? 'демо' : confidenceLabel(measurement.confidence)}</small>
      </button>
      <button type="button" class="card-score" data-open-point="${point.id}" aria-label="Открыть результат">${Math.round(measurement.clarityScore)}</button>
    `;
    els.measurementList.append(row);
  });
  els.compareButton.disabled = state.compareIds.length !== 2;
}

function declension(number, words) {
  const value = Math.abs(number) % 100;
  const remainder = value % 10;
  if (value > 10 && value < 20) return words[2];
  if (remainder > 1 && remainder < 5) return words[1];
  if (remainder === 1) return words[0];
  return words[2];
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return 'без даты';
  }
}

function toggleCompare(pointId) {
  if (state.compareIds.includes(pointId)) {
    state.compareIds = state.compareIds.filter((id) => id !== pointId);
  } else {
    if (state.compareIds.length >= 2) state.compareIds.shift();
    state.compareIds.push(pointId);
  }
  saveState();
  haptic(8);
  renderArchive();
}

function openComparison() {
  if (state.compareIds.length !== 2) return;
  const points = state.compareIds.map((id) => state.points.find((point) => point.id === id)).filter(Boolean);
  if (points.length !== 2) return;
  const [a, b] = points;
  const aM = a.measurement;
  const bM = b.measurement;
  const winner = aM.clarityScore === bM.clarityScore ? null : (aM.clarityScore > bM.clarityScore ? a : b);
  const difference = Math.abs(aM.clarityScore - bM.clarityScore);
  let verdict = 'Точки почти равны: выбирай по удобству, а не по магии одной цифры.';
  if (winner && difference >= 5) verdict = `Точка ${pointNumber(winner)} лучше подходит для речи. Разница в ${difference} пунктов уже заметна, а не высосана из статистического пальца.`;
  if (winner && winner.measurement.boom > 7) verdict += ' Но в ней всё ещё остаётся выраженный басовый избыток.';
  els.compareBody.innerHTML = `
    <div class="compare-head">
      <div class="compare-point"><small>ТОЧКА ${pointNumber(a)}</small><strong>${Math.round(aM.clarityScore)}</strong></div>
      <span class="compare-vs">vs</span>
      <div class="compare-point"><small>ТОЧКА ${pointNumber(b)}</small><strong>${Math.round(bM.clarityScore)}</strong></div>
    </div>
    ${compareRow(`${aM.decay.toFixed(2)} с`, 'хвост', `${bM.decay.toFixed(2)} с`)}
    ${compareRow(formatSigned(aM.boom, 'дБ'), 'гул', formatSigned(bM.boom, 'дБ'))}
    ${compareRow(`${aM.noiseDb.toFixed(0)} dBFS`, 'фон', `${bM.noiseDb.toFixed(0)} dBFS`)}
    ${compareRow(formatSigned(aM.clarityDb, 'дБ'), 'ранняя энергия', formatSigned(bM.clarityDb, 'дБ'))}
    <div class="compare-verdict">${verdict}</div>
  `;
  openSheet(els.compareSheet);
}

function compareRow(left, label, right) {
  return `<div class="compare-row"><span>${left}</span><b>${label}</b><span>${right}</span></div>`;
}

function deleteViewedMeasurement() {
  const point = state.points.find((candidate) => candidate.id === viewedPointId);
  if (!point?.measurement) return;
  point.measurement = null;
  state.compareIds = state.compareIds.filter((id) => id !== point.id);
  viewedPointId = null;
  saveState();
  closeAllSheets();
  renderAll();
  showToast('Замер удалён, точка осталась на плане');
}

function saveRoom() {
  state.room = {
    width: clampNumber(els.roomWidthInput.value, 1.5, 30, state.room.width),
    length: clampNumber(els.roomLengthInput.value, 1.5, 30, state.room.length),
    height: clampNumber(els.roomHeightInput.value, 1.8, 8, state.room.height)
  };
  saveState();
  closeAllSheets();
  renderAll();
  haptic(12);
  showToast('Размеры комнаты обновлены');
}

function exportProject() {
  const payload = JSON.stringify({
    app: 'ОТКЛИК',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    state
  }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `otklik-${state.projectName.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '') || 'room'}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Проект экспортирован');
}

async function importProject(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const candidate = parsed?.state || parsed;
    state = sanitizeState(candidate);
    saveState();
    closeAllSheets();
    closeSecondaryScreens();
    renderAll();
    haptic([15, 25, 30]);
    showToast('Проект импортирован');
  } catch {
    showToast('Файл не похож на проект ОТКЛИКа');
  }
}

function clearProject() {
  const settings = { ...state.settings };
  state = cloneDefaults();
  state.settings = settings;
  saveState();
  closeModals();
  closeAllSheets();
  closeSecondaryScreens();
  renderAll();
  haptic([20, 30, 20]);
  showToast('Комната очищена');
}

function bindEvents() {
  els.canvas.addEventListener('pointerdown', handleCanvasPointerDown);
  els.canvas.addEventListener('pointermove', handleCanvasPointerMove);
  els.canvas.addEventListener('pointerup', handleCanvasPointerUp);
  els.canvas.addEventListener('pointercancel', handleCanvasPointerCancel);
  els.canvas.addEventListener('lostpointercapture', handleCanvasPointerCancel);

  els.measureButton.addEventListener('click', () => {
    playUiTick(380);
    if (measuring) cancelMeasurement();
    else if (selectedPoint()) openModal(els.preflightModal);
  });
  document.querySelector('#beginMeasurementButton').addEventListener('click', beginMeasurement);
  document.querySelector('#retryMeasurementButton').addEventListener('click', () => {
    closeModals();
    openModal(els.preflightModal);
  });
  document.querySelector('#demoMeasurementButton').addEventListener('click', addDemoMeasurement);

  document.querySelector('#openSettingsButton').addEventListener('click', () => openSheet(els.settingsSheet));
  document.querySelector('#editRoomButton').addEventListener('click', () => openSheet(els.roomSheet));
  els.sheetBackdrop.addEventListener('click', closeAllSheets);
  document.querySelectorAll('[data-close-sheet]').forEach((button) => button.addEventListener('click', closeAllSheets));
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));

  document.querySelectorAll('[data-map-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mapMode = button.dataset.mapMode;
      saveState();
      playUiTick(440 + [...document.querySelectorAll('[data-map-mode]')].indexOf(button) * 70);
      updateStaticControls();
      drawMap();
    });
  });

  document.querySelectorAll('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.screen === 'map') closeSecondaryScreens();
      else showScreen(button.dataset.screen);
    });
  });
  document.querySelectorAll('[data-close-screen]').forEach((button) => button.addEventListener('click', closeSecondaryScreens));

  els.openResultButton.addEventListener('click', () => {
    const point = selectedPoint()?.measurement ? selectedPoint() : latestMeasuredPoint();
    if (point) openResult(point.id);
    else showToast('Сначала сделай замер');
  });

  els.measurementList.addEventListener('click', (event) => {
    const compareTarget = event.target.closest('[data-compare-id]');
    if (compareTarget) { toggleCompare(compareTarget.dataset.compareId); return; }
    const openTarget = event.target.closest('[data-open-point]');
    if (openTarget) openResult(openTarget.dataset.openPoint);
  });
  els.compareButton.addEventListener('click', openComparison);
  els.deleteMeasurementButton.addEventListener('click', deleteViewedMeasurement);

  els.projectNameInput.addEventListener('input', () => {
    state.projectName = els.projectNameInput.value.trim().slice(0, 40) || defaults.projectName;
    els.projectNameLabel.textContent = state.projectName;
    saveState();
  });
  els.projectNameInput.addEventListener('change', renderAll);
  els.hapticsToggle.addEventListener('change', () => { state.settings.haptics = els.hapticsToggle.checked; saveState(); haptic(12); });
  els.uiSoundToggle.addEventListener('change', () => { state.settings.uiSound = els.uiSoundToggle.checked; saveState(); playUiTick(530); });
  document.querySelector('#saveRoomButton').addEventListener('click', saveRoom);

  document.querySelector('#exportButton').addEventListener('click', exportProject);
  document.querySelector('#importButton').addEventListener('click', () => document.querySelector('#importInput').click());
  document.querySelector('#importInput').addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) importProject(file);
    event.target.value = '';
  });
  document.querySelector('#clearProjectButton').addEventListener('click', () => { closeAllSheets(); openModal(els.confirmClearModal); });
  document.querySelector('#confirmClearButton').addEventListener('click', clearProject);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!els.preflightModal.hidden || !els.errorModal.hidden || !els.confirmClearModal.hidden) closeModals();
    else if (!els.sheetBackdrop.hidden) closeAllSheets();
    else closeSecondaryScreens();
  });
  window.addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && measuring) cancelMeasurement();
  });
  window.addEventListener('appdatareset', clearProject);
}

function setup() {
  bindEvents();
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(els.mapFrame);
  createWorkshopMode({
    appName: 'ОТКЛИК',
    version: APP_VERSION,
    cachePrefix: 'otklik-',
    storageNamespace: STORAGE_NAMESPACE,
    onReset() {
      localStorage.removeItem(STORAGE_KEY);
      state = cloneDefaults();
      renderAll();
    }
  });
  watchConnectivity((online) => {
    document.documentElement.dataset.network = online ? 'online' : 'offline';
  });
  renderAll();
}

setup();
