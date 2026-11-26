import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  MODES,
  activeMode,
  createSession,
  getActiveTarget,
  getSessionSummary,
  registerShot,
  resizeSession,
  updateSession
} from './engine.mjs';
import { createYardSound } from './sound.mjs';

installMobileRuntime();

const DEFAULT_SETTINGS = { sensitivity: 1, reticleSize: 1, adaptive: true, sound: true, effects: true };
const DEFAULT_PROFILE = { sessions: [], bests: {}, totalSessions: 0 };
const store = createVersionedStore({
  namespace: 'pocket-works:flickyard',
  version: 1,
  defaults: { settings: DEFAULT_SETTINGS, profile: DEFAULT_PROFILE }
});

function normalizeSettings(value = {}) {
  return {
    sensitivity: Math.max(0.5, Math.min(2, Number(value.sensitivity) || 1)),
    reticleSize: Math.max(0.7, Math.min(1.5, Number(value.reticleSize) || 1)),
    adaptive: value.adaptive !== false,
    sound: value.sound !== false,
    effects: value.effects !== false
  };
}

function normalizeProfile(value = {}) {
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.filter((item) => item && typeof item === 'object' && Number.isFinite(item.score)).slice(0, 40)
    : [];
  const bests = value.bests && typeof value.bests === 'object' && !Array.isArray(value.bests) ? value.bests : {};
  return { sessions, bests, totalSessions: Math.max(sessions.length, Number(value.totalSessions) || 0) };
}

let settings = normalizeSettings(store.get('settings', DEFAULT_SETTINGS));
let profile = normalizeProfile(store.get('profile', DEFAULT_PROFILE));
let currentMode = 'flick';
let session = null;
let rafId = 0;
let lastFrame = 0;
let lastHudUpdate = 0;
let holding = false;
let pointerLocked = false;
let wasPointerLocked = false;
let releasingPointer = false;
let canvasWidth = 0;
let canvasHeight = 0;
let aim = { x: 0, y: 0 };
let particles = [];
let impactRings = [];
let toastTimer = 0;
const qaMode = new URLSearchParams(location.search).has('qa');

const canvas = document.querySelector('#rangeCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = (selector) => document.querySelector(selector);
const ui = {
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  rangeTitle: $('#rangeTitle'),
  rangeSubtitle: $('#rangeSubtitle'),
  rangeModeCode: $('#rangeModeCode'),
  homeTitle: $('#homeTitle'),
  homeDescription: $('#homeDescription'),
  homeOverlay: $('#homeOverlay'),
  launchButton: $('#launchButton'),
  homeLaunchButton: $('#homeLaunchButton'),
  durationSelect: $('#durationSelect'),
  difficultySelect: $('#difficultySelect'),
  runHud: $('#runHud'),
  hudModeName: $('#hudModeName'),
  hudStage: $('#hudStage'),
  hudTime: $('#hudTime'),
  hudScore: $('#hudScore'),
  hudHits: $('#hudHits'),
  hudStreak: $('#hudStreak'),
  hudProgress: $('#hudProgress'),
  hudHint: $('#hudHint'),
  hudAccuracy: $('#hudAccuracy'),
  pauseButton: $('#pauseButton'),
  pauseOverlay: $('#pauseOverlay'),
  pauseReason: $('#pauseReason'),
  resumeButton: $('#resumeButton'),
  pauseRestartButton: $('#pauseRestartButton'),
  pauseExitButton: $('#pauseExitButton'),
  resultsOverlay: $('#resultsOverlay'),
  resultTitle: $('#resultTitle'),
  resultRank: $('#resultRank'),
  resultScore: $('#resultScore'),
  resultBest: $('#resultBest'),
  resultAccuracy: $('#resultAccuracy'),
  resultHits: $('#resultHits'),
  resultReaction: $('#resultReaction'),
  resultStreak: $('#resultStreak'),
  resultAgainButton: $('#resultAgainButton'),
  resultHomeButton: $('#resultHomeButton'),
  modeBest: $('#modeBest'),
  modeBestLabel: $('#modeBestLabel'),
  globalBest: $('#globalBest'),
  sessionsCount: $('#sessionsCount'),
  quickAccuracy: $('#quickAccuracy'),
  quickReaction: $('#quickReaction'),
  quickInsight: $('#quickInsight'),
  rangeToast: $('#rangeToast'),
  controlHint: $('#controlHint'),
  pointerState: $('#pointerState'),
  networkState: $('#networkState'),
  soundButton: $('#soundButton'),
  fullscreenButton: $('#fullscreenButton'),
  settingsDialog: $('#settingsDialog'),
  historyDialog: $('#historyDialog'),
  sensitivity: $('#sensitivity'),
  sensitivityValue: $('#sensitivityValue'),
  reticleSize: $('#reticleSize'),
  reticleValue: $('#reticleValue'),
  adaptiveSetting: $('#adaptiveSetting'),
  soundSetting: $('#soundSetting'),
  effectsSetting: $('#effectsSetting'),
  historyList: $('#historyList'),
  historyTotal: $('#historyTotal'),
  historyTopScore: $('#historyTopScore')
};

const sound = createYardSound({ enabled: settings.sound });

const HOME_COPY = {
  flick: {
    title: 'Один щелчок.<br><em>Одна цель.</em>',
    description: 'Поймай ритм, перенеси прицел и попади в центр. Скорость без контроля здесь не спасает.',
    code: 'F-01',
    hint: 'ЛКМ — выстрел · мышь — прицел · ESC — пауза'
  },
  track: {
    title: 'Не отставай.<br><em>Не дёргайся.</em>',
    description: 'Держи левую кнопку и сопровождай движущуюся пластину. Очки начисляются только за чистое ведение.',
    code: 'T-02',
    hint: 'Зажми ЛКМ и удерживай прицел внутри мишени'
  },
  switch: {
    title: 'Смотри шире.<br><em>Меняй цель.</em>',
    description: 'Три пластины движутся одновременно. Поражай подсвеченную и сразу переноси внимание дальше.',
    code: 'S-03',
    hint: 'ЛКМ — активная цель · после попадания сразу меняй направление'
  },
  reflex: {
    title: 'Не думай долго.<br><em>Успей.</em>',
    description: 'Окно короткое. Мишень не будет ждать, пока ты решишься на первый перенос.',
    code: 'R-04',
    hint: 'Попади до того, как мишень исчезнет'
  },
  circuit: {
    title: 'Три навыка.<br><em>Один ритм.</em>',
    description: '90 секунд без пауз: флик, ведение и переключение. Короткая проверка общей формы.',
    code: 'C-05',
    hint: 'Три этапа по 30 секунд · переключение автоматическое'
  }
};

function saveSettings() {
  store.set('settings', settings);
  sound.setEnabled(settings.sound);
  ui.soundButton.setAttribute('aria-pressed', String(settings.sound));
  ui.soundButton.setAttribute('aria-label', settings.sound ? 'Выключить звук' : 'Включить звук');
  ui.soundButton.textContent = settings.sound ? '♫' : '×';
  ui.sensitivity.value = String(settings.sensitivity);
  ui.sensitivityValue.textContent = settings.sensitivity.toFixed(2) + '×';
  ui.reticleSize.value = String(settings.reticleSize);
  ui.reticleValue.textContent = settings.reticleSize.toFixed(2) + '×';
  ui.adaptiveSetting.checked = settings.adaptive;
  ui.soundSetting.checked = settings.sound;
  ui.effectsSetting.checked = settings.effects;
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('ru-RU');
}

function formatReaction(value) {
  return Number.isFinite(value) ? Math.round(value) + ' мс' : '—';
}

function showToast(message) {
  ui.rangeToast.textContent = message;
  ui.rangeToast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.rangeToast.classList.remove('is-visible'), 1700);
}

function setMenuState() {
  const inSession = session && ['running', 'paused'].includes(session.status);
  ui.modeButtons.forEach((button) => {
    const selected = button.dataset.mode === currentMode;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = Boolean(inSession);
  });
  ui.launchButton.disabled = Boolean(inSession);
  ui.homeLaunchButton.disabled = Boolean(inSession);
  ui.durationSelect.disabled = currentMode === 'circuit' || Boolean(inSession);
  ui.difficultySelect.disabled = Boolean(inSession);
}

function updateModeInfo() {
  const mode = MODES[currentMode];
  const copy = HOME_COPY[currentMode];
  ui.rangeTitle.textContent = mode.title;
  ui.rangeSubtitle.textContent = mode.subtitle;
  ui.rangeModeCode.textContent = copy.code;
  ui.homeTitle.innerHTML = copy.title;
  ui.homeDescription.textContent = copy.description;
  ui.controlHint.textContent = copy.hint;
  ui.modeBestLabel.textContent = 'в режиме «' + mode.title + '»';
  ui.durationSelect.disabled = currentMode === 'circuit';
  renderProfile();
  setMenuState();
  render();
}

function renderProfile() {
  const best = profile.bests[currentMode];
  ui.modeBest.textContent = best ? formatNumber(best.score) : '—';
  ui.globalBest.textContent = formatNumber(Math.max(0, ...Object.values(profile.bests).map((item) => Number(item?.score) || 0)));
  ui.sessionsCount.textContent = formatNumber(profile.totalSessions);

  const recent = profile.sessions.slice(0, 12);
  if (!recent.length) {
    ui.quickAccuracy.textContent = '—';
    ui.quickReaction.textContent = '—';
    ui.quickInsight.innerHTML = '<span class="insight-pin"></span><div><b>Пока тихо.</b><p>Первый заезд создаст отправную точку для сравнения.</p></div>';
    return;
  }

  const accuracyValues = recent.map((item) => Number(item.accuracy)).filter(Number.isFinite);
  const reactionValues = recent.map((item) => Number(item.averageReactionMs)).filter(Number.isFinite);
  const averageAccuracy = accuracyValues.length ? accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length : 0;
  const averageReaction = reactionValues.length ? reactionValues.reduce((sum, value) => sum + value, 0) / reactionValues.length : null;
  ui.quickAccuracy.textContent = Math.round(averageAccuracy) + '%';
  ui.quickReaction.textContent = formatReaction(averageReaction);

  let headline = 'Стабильность набирается.';
  let detail = 'Сравнивай результаты одинаковых упражнений, а не только общий счёт.';
  if (averageAccuracy < 58) {
    headline = 'Сначала контроль.';
    detail = 'Уменьши темп и доводи перенос до центра мишени.';
  } else if (averageReaction !== null && averageReaction > 420) {
    headline = 'Сократи первый перенос.';
    detail = 'Сохрани точность, но убери лишнюю паузу перед первым выстрелом.';
  } else if (averageAccuracy >= 82) {
    headline = 'Можно усложнять.';
    detail = 'Попробуй меньшие мишени или более быстрые траектории.';
  }
  ui.quickInsight.innerHTML = '<span class="insight-pin"></span><div><b>' + headline + '</b><p>' + detail + '</p></div>';
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const nextWidth = rect.width;
  const nextHeight = rect.height;
  if (canvasWidth && canvasHeight && session && ['running', 'paused'].includes(session.status)) {
    resizeSession(session, nextWidth, nextHeight);
  }
  canvasWidth = nextWidth;
  canvasHeight = nextHeight;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(nextWidth * dpr));
  canvas.height = Math.max(1, Math.round(nextHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  aim.x = Math.max(0, Math.min(canvasWidth, aim.x || canvasWidth / 2));
  aim.y = Math.max(0, Math.min(canvasHeight, aim.y || canvasHeight / 2));
  render();
}

function drawBolt(x, y, radius = 3) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#a99e83';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.55, y);
  ctx.lineTo(x + radius * 0.55, y);
  ctx.strokeStyle = '#4c574c';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRail(y, width) {
  ctx.fillStyle = '#141d18';
  ctx.fillRect(0, y - 8, width, 16);
  ctx.fillStyle = '#566052';
  ctx.fillRect(0, y - 5, width, 2);
  ctx.fillStyle = '#111a15';
  ctx.fillRect(0, y + 4, width, 2);
  for (let x = 26; x < width; x += 92) drawBolt(x, y, 3.1);
  ctx.fillStyle = 'rgba(205,190,153,.16)';
  for (let x = 18; x < width; x += 18) ctx.fillRect(x, y + 13, 1, 5);
}

function drawBackground(width, height) {
  ctx.fillStyle = '#202923';
  ctx.fillRect(0, 0, width, height);
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, '#29342c');
  shade.addColorStop(0.52, '#202923');
  shade.addColorStop(1, '#1a231e');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(204,192,163,.055)';
  ctx.lineWidth = 1;
  for (let x = 24; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 24; y < height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  drawRail(height * 0.18, width);
  drawRail(height * 0.82, width);
  ctx.fillStyle = 'rgba(10,17,13,.24)';
  ctx.fillRect(0, 0, 18, height);
  ctx.fillRect(width - 18, 0, 18, height);
  ctx.strokeStyle = 'rgba(204,192,163,.14)';
  ctx.strokeRect(18.5, 18.5, width - 37, height - 37);
  ctx.fillStyle = 'rgba(220,204,167,.36)';
  ctx.font = '700 8px ui-monospace,monospace';
  ctx.fillText('RANGE 01', 31, 34);
  ctx.textAlign = 'right';
  ctx.fillText('STEEL / ENAMEL / BRASS', width - 31, 34);
  ctx.textAlign = 'left';
}

function drawTarget(target, active = false, now = 0) {
  if (!target) return;
  const r = target.radius;
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.rotate(target.rotation || 0);

  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath();
  ctx.ellipse(3, r * 0.45, r * 1.08, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#151d18';
  ctx.beginPath();
  ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = active ? '#d18a5a' : '#87907c';
  ctx.lineWidth = active ? 3 : 1.6;
  ctx.stroke();

  ctx.fillStyle = '#c8b998';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e5d9bf';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#9b9a80';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#27312b';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#bd5a3e';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f0dfc0';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#27312b';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 2 + Math.PI / 4;
    drawBolt(Math.cos(angle) * r * 0.88, Math.sin(angle) * r * 0.88, Math.max(1.6, r * 0.065));
  }

  ctx.fillStyle = 'rgba(255,249,229,.32)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.43, r * 0.22, r * 0.09, -0.4, 0, Math.PI * 2);
  ctx.fill();

  if (target.maxTtlMs > 0) {
    const progress = Math.max(0, target.ttlMs / target.maxTtlMs);
    ctx.beginPath();
    ctx.arc(0, 0, r + 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = progress < 0.3 ? '#d66a4a' : '#d7bd88';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (active) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 13 + Math.sin(now / 130) * 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(219,159,105,.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawHomeTargets(width, height) {
  const radius = Math.min(24, Math.max(15, height * 0.045));
  const y = height * 0.51;
  const positions = [width * 0.56, width * 0.72, width * 0.88];
  positions.forEach((x, index) => {
    drawTarget({ x, y: y + (index === 1 ? -height * 0.13 : height * 0.04), radius: radius * (index === 1 ? 1.08 : 0.82), rotation: index * 0.07 }, index === 1, performance.now());
  });
}

function drawAim() {
  const scale = settings.reticleSize;
  const radius = 8 * scale;
  ctx.save();
  ctx.translate(aim.x, aim.y);
  ctx.strokeStyle = 'rgba(244,237,219,.94)';
  ctx.lineWidth = 1.25;
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.moveTo(-radius - 9 * scale, 0);
  ctx.lineTo(-radius - 3 * scale, 0);
  ctx.moveTo(radius + 3 * scale, 0);
  ctx.lineTo(radius + 9 * scale, 0);
  ctx.moveTo(0, -radius - 9 * scale);
  ctx.lineTo(0, -radius - 3 * scale);
  ctx.moveTo(0, radius + 3 * scale);
  ctx.lineTo(0, radius + 9 * scale);
  ctx.stroke();
  ctx.fillStyle = '#bd5a3e';
  ctx.beginPath();
  ctx.arc(0, 0, 1.8 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updateEffects(dt) {
  const seconds = dt / 1000;
  for (const particle of particles) {
    particle.life -= dt;
    particle.x += particle.vx * seconds;
    particle.y += particle.vy * seconds;
    particle.vy += 190 * seconds;
    particle.vx *= Math.pow(0.985, dt / 16);
    particle.angle += particle.spin * seconds;
  }
  particles = particles.filter((particle) => particle.life > 0);
  for (const ring of impactRings) ring.life -= dt;
  impactRings = impactRings.filter((ring) => ring.life > 0);
}

function drawEffects() {
  for (const ring of impactRings) {
    const progress = 1 - ring.life / ring.maxLife;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius * (0.25 + progress * 1.25), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(221,157,102,' + Math.max(0, 0.45 * (1 - progress)) + ')';
    ctx.lineWidth = 2 - progress;
    ctx.stroke();
  }
  if (!settings.effects) return;
  for (const particle of particles) {
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.angle);
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.55);
    ctx.restore();
  }
}

function render(now = performance.now()) {
  if (!ctx || canvasWidth < 1 || canvasHeight < 1) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawBackground(canvasWidth, canvasHeight);
  if (session && ['running', 'paused'].includes(session.status)) {
    session.targets.forEach((target, index) => {
      drawTarget(target, activeMode(session) === 'switch' ? index === session.activeTargetIndex : true, now);
    });
    drawEffects();
    drawAim();
  } else {
    drawHomeTargets(canvasWidth, canvasHeight);
  }
}

function updateHud() {
  if (!session) return;
  const summary = getSessionSummary(session);
  const mode = activeMode(session);
  ui.hudModeName.textContent = MODES[mode].title.toUpperCase();
  ui.hudStage.textContent = session.mode === 'circuit' ? 'ЭТАП ' + (session.stage + 1) + '/3' : MODES[mode].subtitle.toUpperCase();
  ui.hudTime.textContent = (session.remainingMs / 1000).toFixed(1);
  ui.hudScore.textContent = formatNumber(summary.score);
  ui.hudHits.textContent = formatNumber(summary.hits);
  ui.hudStreak.textContent = session.streak + '×';
  ui.hudProgress.style.transform = 'scaleX(' + (session.remainingMs / session.durationMs) + ')';
  ui.hudHint.textContent = MODES[mode].hint;
  ui.hudAccuracy.textContent = mode === 'track'
    ? 'НА ЦЕЛИ ' + Math.round(summary.onTargetPercent) + '%'
    : 'ТОЧНОСТЬ ' + Math.round(summary.clickAccuracy) + '%';
}

function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  lastFrame = performance.now();
  lastHudUpdate = 0;
  const tick = (now) => {
    if (!session || session.status !== 'running') {
      rafId = 0;
      return;
    }
    const dt = Math.min(50, Math.max(0, now - lastFrame || 16));
    lastFrame = now;
    const events = updateSession(session, dt, canvasWidth, canvasHeight, holding, aim);
    for (const event of events) {
      if (event.kind === 'expired') sound.miss();
      if (event.kind === 'stage') {
        sound.select();
        showToast('Этап ' + (event.stage + 1) + '/3 · ' + MODES[event.mode].title);
      }
    }
    updateEffects(dt);
    render(now);
    if (now - lastHudUpdate > 90) {
      updateHud();
      lastHudUpdate = now;
    }
    if (session.status === 'finished') {
      finishSession();
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function requestPointerLock() {
  if (qaMode || typeof canvas.requestPointerLock !== 'function') {
    ui.pointerState.textContent = 'CURSOR MODE';
    return;
  }
  try {
    const result = canvas.requestPointerLock({ unadjustedMovement: true });
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        ui.pointerState.textContent = 'CURSOR MODE';
        showToast('Pointer Lock недоступен — наведение работает обычным курсором.');
      });
    }
  } catch {
    try {
      const result = canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => showToast('Используется обычный курсор.'));
    } catch {
      ui.pointerState.textContent = 'CURSOR MODE';
    }
  }
}

function releasePointerLock() {
  if (document.pointerLockElement !== canvas) return;
  releasingPointer = true;
  document.exitPointerLock();
  window.setTimeout(() => { releasingPointer = false; }, 80);
}

function startSession(force = false) {
  if (session && session.status === 'running') return;
  if (session && session.status === 'paused' && !force) return;
  const width = Math.max(1, canvasWidth);
  const height = Math.max(1, canvasHeight);
  session = createSession({
    mode: currentMode,
    duration: Number(ui.durationSelect.value),
    difficulty: ui.difficultySelect.value,
    width,
    height,
    seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
    adaptive: settings.adaptive
  });
  aim = { x: width / 2, y: height / 2 };
  holding = false;
  wasPointerLocked = false;
  particles = [];
  impactRings = [];
  ui.homeOverlay.hidden = true;
  ui.runHud.hidden = false;
  ui.pauseOverlay.hidden = true;
  ui.resultsOverlay.hidden = true;
  setMenuState();
  sound.unlock();
  requestPointerLock();
  updateHud();
  render();
  startLoop();
}

function pauseSession(reason = 'Тренировка остановлена.') {
  if (!session || session.status !== 'running') return;
  session.status = 'paused';
  holding = false;
  stopLoop();
  releasePointerLock();
  ui.pauseReason.textContent = reason;
  ui.pauseOverlay.hidden = false;
  updateHud();
  render();
}

function resumeSession() {
  if (!session || session.status !== 'paused') return;
  session.status = 'running';
  wasPointerLocked = false;
  ui.pauseOverlay.hidden = true;
  requestPointerLock();
  sound.unlock();
  startLoop();
}

function exitToMenu(force = false) {
  if (session && ['running', 'paused'].includes(session.status) && !force) {
    if (!window.confirm('Завершить текущую тренировку без записи результата?')) return;
  }
  stopLoop();
  holding = false;
  if (session) session.status = 'abandoned';
  session = null;
  releasePointerLock();
  ui.runHud.hidden = true;
  ui.pauseOverlay.hidden = true;
  ui.resultsOverlay.hidden = true;
  ui.homeOverlay.hidden = false;
  setMenuState();
  renderProfile();
  render();
}

function spawnImpact(target, strong = true) {
  if (!target) return;
  impactRings.push({ x: target.x, y: target.y, radius: target.radius, life: 240, maxLife: 240 });
  if (!settings.effects) return;
  const count = strong ? 15 : 7;
  const palette = ['#d5bd8d', '#bd5a3e', '#f1e7d1', '#87917c'];
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 65 + Math.random() * 180;
    particles.push({
      x: target.x,
      y: target.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 260 + Math.random() * 260,
      maxLife: 520,
      size: 2 + Math.random() * 4,
      angle,
      spin: (Math.random() - 0.5) * 12,
      color: palette[index % palette.length]
    });
  }
}

function handleShot() {
  if (!session || session.status !== 'running') return;
  const result = registerShot(session, aim.x, aim.y, canvasWidth, canvasHeight);
  if (result.kind === 'hit') {
    spawnImpact(result.target, true);
    sound.hit();
  } else if (result.kind === 'miss') {
    if (result.target) impactRings.push({ x: aim.x, y: aim.y, radius: 5, life: 130, maxLife: 130 });
    sound.miss();
  }
  updateHud();
  render();
}

function recordSession() {
  const summary = getSessionSummary(session);
  const record = {
    timestamp: new Date().toISOString(),
    mode: session.mode,
    difficulty: session.difficulty,
    score: summary.score,
    accuracy: Number(summary.accuracy.toFixed(1)),
    hits: summary.hits,
    misses: summary.misses,
    shots: summary.shots,
    averageReactionMs: summary.averageReactionMs,
    bestStreak: summary.bestStreak,
    durationSeconds: summary.durationSeconds
  };
  const previousBest = profile.bests[session.mode];
  const isBest = !previousBest || record.score > previousBest.score;
  profile.sessions.unshift(record);
  profile.sessions = profile.sessions.slice(0, 40);
  profile.totalSessions += 1;
  if (isBest) profile.bests[session.mode] = { score: record.score, accuracy: record.accuracy, timestamp: record.timestamp };
  store.set('profile', profile);
  return { record, isBest, summary };
}

function finishSession() {
  if (!session || session.status === 'saved') return;
  session.status = 'saved';
  holding = false;
  stopLoop();
  releasePointerLock();
  sound.finish();
  const { isBest, summary } = recordSession();
  ui.runHud.hidden = true;
  ui.pauseOverlay.hidden = true;
  ui.resultsOverlay.hidden = false;
  ui.resultTitle.textContent = summary.accuracy >= 82 ? 'Хладнокровно.' : summary.accuracy >= 60 ? 'Хороший темп.' : 'Есть куда расти.';
  ui.resultRank.textContent = isBest ? 'НОВЫЙ РЕКОРД' : 'РЕЗУЛЬТАТ ЗАПИСАН';
  ui.resultScore.textContent = formatNumber(summary.score);
  ui.resultBest.textContent = isBest ? 'Лучший результат в этом режиме' : 'Личный рекорд: ' + formatNumber(profile.bests[session.mode]?.score || 0);
  ui.resultAccuracy.textContent = Math.round(summary.accuracy) + '%';
  ui.resultHits.textContent = session.mode === 'track' ? Math.round(summary.onTargetPercent) + '%' : formatNumber(summary.hits);
  ui.resultReaction.textContent = formatReaction(summary.averageReactionMs);
  ui.resultStreak.textContent = summary.bestStreak + '×';
  setMenuState();
  renderProfile();
  render();
}

function renderHistory() {
  const recent = profile.sessions;
  ui.historyTotal.textContent = formatNumber(profile.totalSessions);
  ui.historyTopScore.textContent = formatNumber(Math.max(0, ...Object.values(profile.bests).map((item) => Number(item?.score) || 0)));
  ui.historyList.replaceChildren();
  if (!recent.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'Здесь появятся завершённые тренировки.';
    ui.historyList.append(empty);
    return;
  }
  for (const item of recent) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    const score = document.createElement('strong');
    const detail = document.createElement('small');
    const date = new Date(item.timestamp);
    label.textContent = (MODES[item.mode]?.title || item.mode) + ' · ' + date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    score.textContent = formatNumber(item.score);
    detail.textContent = Math.round(item.accuracy) + '% · ' + (item.difficulty === 'hard' ? 'Жёстко' : item.difficulty === 'relaxed' ? 'Спокойно' : 'Стандарт');
    row.append(label, score, detail);
    ui.historyList.append(row);
  }
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function exportHistory() {
  const payload = { schema: 'flickyard-history', version: 1, exportedAt: new Date().toISOString(), profile, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'flickyard-history-' + new Date().toISOString().slice(0, 10) + '.json';
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Журнал сохранён в JSON.');
}

function toggleFullscreen() {
  const shell = document.querySelector('.yard-shell');
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch?.(() => {});
  } else if (shell.requestFullscreen) {
    shell.requestFullscreen().catch(() => showToast('Полноэкранный режим недоступен.'));
  } else {
    showToast('Браузер не поддерживает полноэкранный режим.');
  }
}

function syncFullscreenButton() {
  ui.fullscreenButton.textContent = document.fullscreenElement ? '⤢' : '⛶';
  ui.fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полного экрана' : 'Полноэкранный режим');
}

ui.modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (session && ['running', 'paused'].includes(session.status)) return;
    currentMode = button.dataset.mode;
    sound.select();
    updateModeInfo();
  });
});

ui.launchButton.addEventListener('click', () => startSession());
ui.homeLaunchButton.addEventListener('click', () => startSession());
ui.pauseButton.addEventListener('click', () => pauseSession('Тренировка остановлена вручную.'));
ui.resumeButton.addEventListener('click', resumeSession);
ui.pauseRestartButton.addEventListener('click', () => startSession(true));
ui.pauseExitButton.addEventListener('click', () => exitToMenu(false));
ui.resultAgainButton.addEventListener('click', () => startSession());
ui.resultHomeButton.addEventListener('click', () => exitToMenu(true));

$('#historyButton').addEventListener('click', () => { renderHistory(); openDialog(ui.historyDialog); });
$('#ledgerHistoryButton').addEventListener('click', () => { renderHistory(); openDialog(ui.historyDialog); });
$('#closeHistory').addEventListener('click', () => closeDialog(ui.historyDialog));
$('#closeHistoryDone').addEventListener('click', () => closeDialog(ui.historyDialog));
$('#exportHistoryButton').addEventListener('click', exportHistory);
$('#resetStatsButton').addEventListener('click', () => {
  if (!window.confirm('Удалить все личные результаты и рекорды? Это действие нельзя отменить.')) return;
  profile = { sessions: [], bests: {}, totalSessions: 0 };
  store.set('profile', profile);
  renderHistory();
  renderProfile();
  showToast('Личный журнал очищен.');
});

$('#settingsButton').addEventListener('click', () => openDialog(ui.settingsDialog));
$('#closeSettings').addEventListener('click', () => closeDialog(ui.settingsDialog));
$('#closeSettingsDone').addEventListener('click', () => closeDialog(ui.settingsDialog));
ui.sensitivity.addEventListener('input', () => {
  settings.sensitivity = Number(ui.sensitivity.value);
  saveSettings();
});
ui.reticleSize.addEventListener('input', () => {
  settings.reticleSize = Number(ui.reticleSize.value);
  saveSettings();
  render();
});
ui.adaptiveSetting.addEventListener('change', () => { settings.adaptive = ui.adaptiveSetting.checked; saveSettings(); });
ui.soundSetting.addEventListener('change', () => { settings.sound = ui.soundSetting.checked; saveSettings(); });
ui.effectsSetting.addEventListener('change', () => { settings.effects = ui.effectsSetting.checked; saveSettings(); });
ui.soundButton.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  if (settings.sound) { sound.unlock(); sound.select(); }
  showToast(settings.sound ? 'Звук включён.' : 'Звук выключен.');
});
ui.fullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', syncFullscreenButton);
ui.durationSelect.addEventListener('change', () => sound.select());
ui.difficultySelect.addEventListener('change', () => sound.select());

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointermove', (event) => {
  if (pointerLocked) {
    aim.x += event.movementX * settings.sensitivity;
    aim.y += event.movementY * settings.sensitivity;
  } else {
    const rect = canvas.getBoundingClientRect();
    aim.x = event.clientX - rect.left;
    aim.y = event.clientY - rect.top;
  }
  aim.x = Math.max(0, Math.min(canvasWidth, aim.x));
  aim.y = Math.max(0, Math.min(canvasHeight, aim.y));
  if (!session || session.status !== 'running') render();
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !session || session.status !== 'running') return;
  event.preventDefault();
  if (event.pointerType === 'touch') {
    const rect = canvas.getBoundingClientRect();
    aim.x = event.clientX - rect.left;
    aim.y = event.clientY - rect.top;
  }
  if (activeMode(session) === 'track') {
    holding = true;
    sound.select();
  } else {
    handleShot();
  }
});
window.addEventListener('pointerup', (event) => { if (event.button === 0) holding = false; });
window.addEventListener('pointercancel', () => { holding = false; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  ui.pauseButton.hidden = pointerLocked;
  ui.pointerState.textContent = pointerLocked ? 'ESC / P — PAUSE' : 'CURSOR MODE';
  if (pointerLocked) {
    wasPointerLocked = true;
    return;
  }
  if (wasPointerLocked && !releasingPointer && session?.status === 'running') {
    pauseSession('Курсор освобождён. Нажми «Продолжить», чтобы вернуться на рубеж.');
  }
});
window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches('input,select,textarea,button,[contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' && session?.status === 'running' && !pointerLocked) pauseSession('Тренировка остановлена клавишей Escape.');
  if (key === 'p' && session?.status === 'running') pauseSession('Тренировка остановлена клавишей P.');
  else if (key === 'p' && session?.status === 'paused') resumeSession();
  if (key === 'r' && session && ['running', 'paused'].includes(session.status)) startSession(true);
  if (key === 'f') toggleFullscreen();
  if (event.code === 'Space' && session?.status === 'running' && activeMode(session) !== 'track') {
    event.preventDefault();
    handleShot();
  }
});
window.addEventListener('blur', () => {
  if (session?.status === 'running') pauseSession('Окно потеряло фокус. Тренировка поставлена на паузу.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session?.status === 'running') pauseSession('Вкладка скрыта. Тренировка поставлена на паузу.');
});
window.addEventListener('resize', resizeCanvas, { passive: true });
window.addEventListener('appviewportchange', resizeCanvas);

watchConnectivity((online) => {
  ui.networkState.textContent = online ? 'ЛОКАЛЬНЫЙ ТИР' : 'ОФЛАЙН · ГОТОВ';
});
createWorkshopMode({
  appName: 'FLICKYARD',
  version: '0.1.0',
  cachePrefix: 'flickyard-',
  storageNamespace: 'pocket-works:flickyard',
  onReset() {
    store.reset();
    settings = { sensitivity: 1, reticleSize: 1, adaptive: true, sound: true, effects: true };
    profile = { sessions: [], bests: {}, totalSessions: 0 };
    saveSettings();
    renderProfile();
    renderHistory();
  }
});

if (qaMode) {
  Object.defineProperty(window, '__FLICKYARD_TEST__', {
    configurable: false,
    value: {
      snapshot() {
        const target = session ? getActiveTarget(session) : null;
        const rect = canvas.getBoundingClientRect();
        return {
          mode: currentMode,
          status: session?.status || 'menu',
          hits: session?.hits || 0,
          score: session?.score || 0,
          target: target ? { x: target.x, y: target.y, radius: target.radius } : null,
          canvas: { left: rect.left, top: rect.top },
          pointerLocked
        };
      },
      finish() {
        if (!session || !['running', 'paused'].includes(session.status)) return;
        session.remainingMs = 0;
        session.status = 'finished';
        finishSession();
      }
    }
  });
}

saveSettings();
resizeCanvas();
updateModeInfo();
renderProfile();
syncFullscreenButton();
window.addEventListener('beforeunload', () => sound.dispose(), { once: true });
