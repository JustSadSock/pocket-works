import { LEVELS, getLevel } from './levels.js';
import { createRunSeed, formatRunCode, generateEndlessLevel, parseRunCode } from './procedural.js';
import { createBall, isBallStopped, stepBall, strikeBall } from './physics.js';
import { DioramaRenderer } from './render.js';
import { compileCourse19 } from './course19.js';
import { installLivingTerrain } from './experience14.js';
import { AudioGarden } from './audio.js';
import {
  campaignSegmentTotal,
  checkpointCampaignRun,
  checkpointEndlessRun,
  createCampaignRun,
  createDefaultSave,
  fullCampaignTotal,
  normalizeCampaignRun,
  normalizeEndlessRun,
  normalizeSave,
  recordCampaignHole,
  sectionWord,
  strokeWord
} from './state.js';

// Runtime equivalent of: import { createWorkshopMode } from '../../shared/workshop-mode.js'

const APP_VERSION = '1.14.0';
const STORAGE_KEY = 'pocket-works:moss-marble:save';
const DEFAULT_SAVE = createDefaultSave(LEVELS.length);

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new DioramaRenderer(canvas);
const audio = new AudioGarden();

let save = loadSave();
let mode = 'menu';
let levelIndex = Math.min(save.current, save.unlocked - 1, LEVELS.length - 1);
let level = compileCourse19(getLevel(levelIndex));
let ball = createBall(level.start, level);
let strokes = 0;
let roundStrokes = [];
let roundActive = false;
let roundStartHole = 0;
let endlessActive = false;
let endlessResult = null;
let lastSafe = { ...level.start };
let waterResetTimer = 0;
let finishTimer = 0;
let lastTime = performance.now();
let elapsed = 0;
let pausedBeforeHidden = false;
let toastTimer = 0;
let surfaceTimer = 0;
let tiltListening = false;
let confirmationAction = null;
let confirmationReturnMode = 'menu';
let confirmationFocus = null;
let keyboardAngle = 0;
let overviewUiKey = '';
let lastBallMovingState = '';
let invalidAimAt = 0;
let lastInactiveRenderAt = 0;

const aim = { active: false, pointerId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, vx: 0, vy: 0, power: 0 };
const livingTerrain = installLivingTerrain(renderer, canvas, () => ({ mode, level, ball, aim }));

function loadSave() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizeSave(parsed, LEVELS.length);
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch {}
}

function vibrate(pattern) {
  if (save.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function exitToShelf(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const target = new URL('../../', window.location.href).href;
  const fallback = () => window.location.assign(target);
  try {
    if (window.PocketWorks?.closeApp) { window.PocketWorks.closeApp(); return; }
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'pocketworks:close-app', appId: 'moss-marble' }, '*');
      window.setTimeout(fallback, 160);
      return;
    }
  } catch {}
  fallback();
}

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1900);
}

function showSurface(text) {
  const note = $('surfaceNote');
  note.textContent = text;
  note.classList.add('is-visible');
  clearTimeout(surfaceTimer);
  surfaceTimer = window.setTimeout(() => note.classList.remove('is-visible'), 1350);
}

function requestConfirmation({ eyebrow = 'Подтверждение', title, detail, acceptLabel, meta = 'действие нельзя отменить', returnMode = mode, action }) {
  confirmationFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirmationAction = action;
  confirmationReturnMode = returnMode;
  $('confirmEyebrow').textContent = eyebrow;
  $('confirmTitle').textContent = title;
  $('confirmDetail').textContent = detail;
  $('confirmAcceptLabel').textContent = acceptLabel;
  $('confirmMeta').textContent = meta;
  setMode('confirm');
}

function closeConfirmation() {
  const focus = confirmationFocus;
  confirmationFocus = null;
  confirmationAction = null;
  setMode(confirmationReturnMode);
  if (confirmationReturnMode === 'menu') syncMenu();
  if (focus?.isConnected) window.requestAnimationFrame(() => focus.focus({ preventScroll: true }));
}

function setMode(next, { focus = true } = {}) {
  mode = next;
  document.body.dataset.mode = next;
  const playing = next === 'playing';
  const map = { menu: 'menuScreen', holes: 'holesScreen', code: 'codeScreen', confirm: 'confirmScreen', paused: 'pauseScreen', result: 'resultScreen', finish: 'finishScreen' };
  const activeId = map[next] || '';
  document.querySelectorAll('.screen').forEach((screen) => {
    const active = screen.id === activeId;
    screen.classList.toggle('is-visible', active);
    screen.inert = !active;
    screen.setAttribute('aria-hidden', String(!active));
  });
  [canvas, document.querySelector('.scorebar'), $('overviewBtn')].forEach((element) => {
    if (!element) return;
    element.inert = !playing;
    element.setAttribute('aria-hidden', String(!playing));
  });
  if (next !== 'playing') {
    cancelAim();
    livingTerrain.cancelOverview();
  }
  if (next === 'paused') syncPauseContext();
  syncOverviewControl();
  if (!focus) return;
  const focusId = { menu: 'continueBtn', holes: 'holesCloseBtn', code: 'runCodeInput', confirm: 'confirmAcceptBtn', paused: 'resumeBtn', result: $('nextBtn').hidden ? 'retryBtn' : 'nextBtn', finish: 'againBtn' }[next];
  if (next === 'playing') window.requestAnimationFrame(() => canvas.focus({ preventScroll: true }));
  else if (focusId) window.requestAnimationFrame(() => $(focusId)?.focus?.({ preventScroll: true }));
}

function syncPauseContext() {
  $('pauseContext').textContent = endlessActive
    ? `${formatRunCode(level.endless?.seed || save.endlessRun?.seed)} · секция ${level.section} · ${strokes} ${strokeWord(strokes)}`
    : `Лунка ${levelIndex + 1} · ${strokes} ${strokeWord(strokes)} · пар ${level.par}`;
}

function syncOverviewControl() {
  const button = $('overviewBtn');
  if (!button) return;
  const available = mode === 'playing' && isBallStopped(ball) && !ball.sunk && waterResetTimer <= 0;
  const overview = livingTerrain.isOverview();
  const key = `${mode}:${available}:${overview}`;
  if (key === overviewUiKey) return;
  overviewUiKey = key;
  button.disabled = !available;
  button.setAttribute('aria-pressed', String(overview));
  button.querySelector('span').textContent = overview ? 'К мячу' : 'Обзор';
  document.body.dataset.overview = String(overview);
}

function syncHeader() {
  $('holeLabel').textContent = endlessActive ? 'Секция' : 'Лунка';
  $('holeNumber').textContent = endlessActive ? String(level.section) : `${levelIndex + 1} / ${LEVELS.length}`;
  $('strokeCount').textContent = String(strokes);
  $('parCount').textContent = String(level.par);
  $('soundBtn').textContent = save.sound ? 'Звук' : 'Тихо';
  $('soundBtn').setAttribute('aria-pressed', String(save.sound));
  $('soundBtn').setAttribute('aria-label', save.sound ? 'Выключить звук' : 'Включить звук');
  $('hapticsBtn').setAttribute('aria-pressed', String(save.haptics));
  $('hapticsBtn').querySelector('b').textContent = save.haptics ? 'Вкл' : 'Выкл';
  $('tiltBtn').setAttribute('aria-pressed', String(save.tilt));
  $('tiltBtn').querySelector('b').textContent = save.tilt ? 'Вкл' : 'Включить';
  document.body.dataset.hasAimed = String(save.hasAimed);
  document.body.dataset.ballMoving = String(ball.moving || ball.sunk || ball.airborne || ball.inCup);
  document.body.dataset.route = endlessActive ? 'endless' : 'course';
  syncOverviewControl();
}

function syncMenu() {
  const campaign = normalizeCampaignRun(save.campaignRun, LEVELS.length);
  const currentIndex = campaign?.current ?? Math.min(save.current, save.unlocked - 1);
  const current = getLevel(currentIndex);
  $('continueLabel').textContent = campaign
    ? 'Продолжить длинный круг'
    : save.best.some((value) => value != null)
      ? save.current > 0 ? 'Продолжить знакомство' : 'Сыграть полный круг'
      : 'Начать длинную прогулку';
  $('continueMeta').textContent = campaign?.currentStrokes
    ? `Лунка ${current.id} · ${campaign.currentStrokes} ${strokeWord(campaign.currentStrokes)}`
    : `Лунка ${current.id} · пар ${current.par}`;
  const collected = save.best.every((value) => Number.isFinite(value)) ? save.best.reduce((sum, value) => sum + value, 0) : null;
  $('courseBest').textContent = Number.isFinite(save.roundBest)
    ? `Лучший полный круг · ${save.roundBest} ${strokeWord(save.roundBest)}`
    : collected == null
      ? 'Полный круг ещё не сыгран'
      : `Сумма рекордов лунок · ${collected} ${strokeWord(collected)}`;

  const run = normalizeEndlessRun(save.endlessRun);
  $('endlessLabel').textContent = run ? 'Продолжить бесконечный путь' : 'Бесконечная оранжерея';
  $('endlessMeta').textContent = run
    ? `Секция ${run.depth + 1} · ${formatRunCode(run.seed)}${run.currentStrokes ? ` · ${run.currentStrokes} ${strokeWord(run.currentStrokes)}` : ''}`
    : save.endlessBest > 0
      ? `Новый код · рекорд ${save.endlessBest} ${sectionWord(save.endlessBest)}`
      : 'Новый код · без конца';
  $('newEndlessBtn').hidden = !run;
  $('endlessBest').textContent = save.endlessBest > 0
    ? `Глубже всего · ${save.endlessBest} ${sectionWord(save.endlessBest)}${Number.isFinite(save.endlessBestStrokes) ? ` · ${save.endlessBestStrokes} ${strokeWord(save.endlessBestStrokes)}` : ''}`
    : 'Бесконечный путь ещё не начат';
  renderHoleShelf();
}

function holeMapMarkup(item) {
  const visualItem = compileCourse19(item);
  const padding = 8;
  const width = 100;
  const height = 66;
  const xs = visualItem.centerline.map((point) => point.x);
  const ys = visualItem.centerline.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY));
  const point = ({ x, y }) => ({
    x: padding + (x - minX) * scale,
    y: padding + (y - minY) * scale
  });
  const route = visualItem.centerline.map((value, index) => {
    const mapped = point(value);
    return `${index ? 'L' : 'M'}${mapped.x.toFixed(1)} ${mapped.y.toFixed(1)}`;
  }).join(' ');
  const start = point(visualItem.start);
  const hole = point(visualItem.hole);
  const obstacles = (visualItem.course18?.props || visualItem.obstacles || []).slice(0, 5).map((obstacle) => {
    const mapped = point(obstacle);
    const radius = Math.max(1.8, Math.min(4.2, obstacle.r * scale * .24));
    return `<circle class="map-obstacle" cx="${mapped.x.toFixed(1)}" cy="${mapped.y.toFixed(1)}" r="${radius.toFixed(1)}"/>`;
  }).join('');
  const surfaces = (visualItem.course18?.field?.masks || []).map((mask) => {
    const className = `map-surface map-${mask.type}`;
    if (mask.a && mask.b) {
      const a = point(mask.a);
      const b = point(mask.b);
      const strokeWidth = Math.max(3, Math.min(12, mask.width * scale * .72));
      return `<line class="${className} is-segment" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${strokeWidth.toFixed(1)}"/>`;
    }
    const center = point(mask);
    const rx = Math.max(2, mask.length * scale * .5);
    const ry = Math.max(1.5, mask.width * scale * .5);
    const rotation = (mask.angle || 0) * 180 / Math.PI;
    return `<ellipse class="${className}" cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${rotation.toFixed(1)} ${center.x.toFixed(1)} ${center.y.toFixed(1)})"/>`;
  }).join('');
  const cssColor = (value, fallback, alpha) => Array.isArray(value) && value.length >= 3
    ? `rgba(${Math.round(value[0] * 255)},${Math.round(value[1] * 255)},${Math.round(value[2] * 255)},${alpha})`
    : fallback;
  const terrain = item.visual?.terrain || {};
  const mapStyle = [
    `--map-route:${cssColor(terrain.grassLight, 'rgba(222,220,171,.72)', .82)}`,
    `--map-route-shadow:${cssColor(terrain.moss, 'rgba(4,16,9,.28)', .48)}`,
    `--map-obstacle:${cssColor(terrain.moss, '#28372d', 1)}`,
    `--map-water:${cssColor(terrain.waterLight, 'rgba(86,160,155,.72)', .76)}`,
    `--map-sand:${cssColor(terrain.sandLight, 'rgba(219,187,112,.72)', .76)}`,
    `--map-moss:${cssColor(terrain.mossLight, 'rgba(74,124,66,.72)', .74)}`
  ].join(';');
  return `<svg class="hole-map" style="${mapStyle}" aria-hidden="true" viewBox="0 0 ${width} ${height}">${surfaces}<path class="map-route-shadow" d="${route}"/><path class="map-route" d="${route}"/>${obstacles}<circle class="map-start" cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="2.6"/><circle class="map-hole" cx="${hole.x.toFixed(1)}" cy="${hole.y.toFixed(1)}" r="3.3"/></svg>`;
}

function renderHoleShelf() {
  const shelf = $('holeShelf');
  shelf.replaceChildren();
  LEVELS.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hole-pot';
    if (item.name.split(/\s+/).some((word) => word.length > 11)) button.classList.add('has-long-name');
    button.disabled = index >= save.unlocked;
    button.dataset.index = String(index);
    button.style.setProperty('--hole-sky-top', item.visual?.skyTop || '#486047');
    button.style.setProperty('--hole-sky-bottom', item.visual?.skyBottom || '#263d31');
    button.style.setProperty('--hole-glow', `rgba(${item.visual?.glow || '215,207,146'},.22)`);
    if (save.best[index] === 1) button.classList.add('is-perfect');
    const best = save.best[index];
    button.innerHTML = `${holeMapMarkup(item)}<span class="label"><b>${item.id}. ${item.name}</b><small>${button.disabled ? 'Закрыто' : best == null ? `пар ${item.par}` : `лучшее ${best} · пар ${item.par}`}</small></span>`;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      audio.ui();
      startHole(index, { round: false });
    });
    shelf.append(button);
  });
}

function resetBall(to = level.start) {
  ball = createBall(to, level);
  lastSafe = { x: to.x, y: to.y };
  waterResetTimer = 0;
  syncHeader();
}

function saveActiveCheckpoint() {
  if (!['playing', 'paused'].includes(mode)) return;
  const stable = isBallStopped(ball) && !ball.sunk && waterResetTimer <= 0;
  const point = stable ? { x: ball.x, y: ball.y } : { ...lastSafe };
  if (roundActive && !endlessActive && levelIndex >= 0) {
    save.campaignRun = checkpointCampaignRun(save.campaignRun, LEVELS.length, levelIndex, strokes, point, lastSafe);
    save.current = levelIndex;
  } else if (endlessActive) {
    save.endlessRun = checkpointEndlessRun(save.endlessRun, strokes, point, lastSafe);
  } else {
    return;
  }
  persist();
}

function preparePlayingLevel({ checkpoint = null, checkpointStrokes = 0 } = {}) {
  strokes = 0;
  finishTimer = 0;
  endlessResult = null;
  livingTerrain.cancelOverview();
  resetBall(level.start);
  if (checkpoint && Number.isFinite(checkpoint.x) && Number.isFinite(checkpoint.y)) {
    resetBall({ x: checkpoint.x, y: checkpoint.y });
    lastSafe = {
      x: Number.isFinite(checkpoint.safeX) ? checkpoint.safeX : checkpoint.x,
      y: Number.isFinite(checkpoint.safeY) ? checkpoint.safeY : checkpoint.y
    };
    strokes = Math.max(0, Math.trunc(Number(checkpointStrokes) || 0));
  }
  setMode('playing');
  livingTerrain.beginLevel();
  syncHeader();
  showSurface(level.note);
}

function startHole(index, { round = false, preserveRound = false, checkpoint = null, checkpointStrokes = 0 } = {}) {
  endlessActive = false;
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  level = compileCourse19(getLevel(levelIndex));
  if (round && !preserveRound) {
    roundActive = true;
    roundStrokes = [];
    roundStartHole = levelIndex;
  } else if (!round) {
    roundActive = false;
    roundStrokes = [];
  }
  preparePlayingLevel({ checkpoint, checkpointStrokes });
}

function startCampaign({ fresh = false } = {}) {
  let run = fresh ? null : normalizeCampaignRun(save.campaignRun, LEVELS.length);
  if (!run) run = createCampaignRun(fresh ? 0 : Math.min(save.current, save.unlocked - 1), LEVELS.length);
  save.campaignRun = run;
  save.current = run.current;
  roundActive = true;
  roundStartHole = run.startHole;
  roundStrokes = [...run.strokes];
  persist();
  startHole(run.current, {
    round: true,
    preserveRound: true,
    checkpoint: run.checkpoint,
    checkpointStrokes: run.currentStrokes
  });
}

function ensureEndlessRun(fresh = false, requestedSeed = null) {
  let run = fresh ? null : normalizeEndlessRun(save.endlessRun);
  if (!run) {
    run = { seed: requestedSeed || createRunSeed(), depth: 0, totalStrokes: 0, currentStrokes: 0, checkpoint: null, startedAt: Date.now() };
    save.endlessRun = run;
    persist();
  }
  return run;
}

function startEndless({ fresh = false, seed = null } = {}) {
  const run = ensureEndlessRun(fresh, seed);
  endlessActive = true;
  roundActive = false;
  roundStrokes = [];
  levelIndex = -1;
  level = compileCourse19(generateEndlessLevel(run.seed, run.depth));
  preparePlayingLevel({ checkpoint: run.checkpoint, checkpointStrokes: run.currentStrokes });
}

function openCodeScreen(seed = null, { focus = true } = {}) {
  const run = normalizeEndlessRun(save.endlessRun);
  $('runCodeInput').value = seed ? formatRunCode(seed) : run ? formatRunCode(run.seed) : '';
  $('codeError').textContent = '';
  setMode('code', { focus });
}

function sharedRouteUrl(seed) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('route', formatRunCode(seed));
  url.hash = '';
  return url.toString();
}

function clearSharedRoute() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('route')) return;
  url.searchParams.delete('route');
  window.history.replaceState(null, '', url);
}

function startCodeRoute() {
  const seed = parseRunCode($('runCodeInput').value);
  if (!seed) {
    $('codeError').textContent = 'Нужны от одного до семи латинских букв или цифр.';
    vibrate(7);
    return;
  }
  const launch = () => {
    $('codeError').textContent = '';
    clearSharedRoute();
    startEndless({ fresh: true, seed });
    showToast(`Маршрут ${formatRunCode(seed)}`);
  };
  const current = normalizeEndlessRun(save.endlessRun);
  if (current && (current.seed !== seed || current.depth > 0 || current.totalStrokes > 0)) {
    requestConfirmation({
      eyebrow: 'Смена маршрута',
      title: `Открыть ${formatRunCode(seed)}?`,
      detail: `Текущий путь ${formatRunCode(current.seed)} останется в рекордах, но продолжить его уже не получится.`,
      acceptLabel: 'Открыть новый код',
      meta: 'пройденные секции останутся в рекорде',
      returnMode: 'code',
      action: launch
    });
    return;
  }
  launch();
}

async function shareRunCode() {
  const seed = parseRunCode($('runCodeInput').value) || normalizeEndlessRun(save.endlessRun)?.seed;
  if (!seed) {
    $('codeError').textContent = 'Сначала введи код маршрута.';
    return;
  }
  const code = formatRunCode(seed);
  const text = `Moss & Marble · маршрут ${code}`;
  const url = sharedRouteUrl(seed);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Moss & Marble', text, url });
      showToast('Маршрут передан');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const sharedText = `${text}\n${url}`;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(sharedText);
    else {
      const copy = document.createElement('textarea');
      copy.value = sharedText;
      copy.setAttribute('readonly', '');
      copy.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(copy);
      copy.select();
      const copied = document.execCommand('copy');
      copy.remove();
      if (!copied) throw new Error('Copy command was rejected');
    }
    showToast(`Ссылка на ${code} скопирована`);
  } catch {
    $('codeError').textContent = `Код маршрута: ${code}`;
  }
}

function restartHole() {
  audio.ui();
  if (roundActive && !endlessActive) {
    save.campaignRun = checkpointCampaignRun(save.campaignRun, LEVELS.length, levelIndex, 0, null);
    save.current = levelIndex;
    persist();
  } else if (endlessActive) {
    save.endlessRun = checkpointEndlessRun(save.endlessRun, 0, null);
    persist();
  }
  preparePlayingLevel();
  showSurface(endlessActive ? `Секция ${level.section} начата заново` : 'Лунка начата заново');
}

function requestRestart() {
  if (strokes <= 0) {
    restartHole();
    return;
  }
  audio.ui();
  requestConfirmation({
    eyebrow: endlessActive ? `Секция ${level.section}` : `${level.id}. ${level.name}`,
    title: 'Начать эту попытку заново?',
    detail: `${strokes} ${strokeWord(strokes)} текущей попытки будут сброшены. Лучшие результаты не изменятся.`,
    acceptLabel: 'Начать заново',
    meta: 'текущие удары будут сброшены',
    returnMode: 'paused',
    action: restartHole
  });
}

function retryResult() {
  audio.ui();
  if (endlessActive && endlessResult) {
    save.endlessRun = {
      seed: endlessResult.seed,
      depth: endlessResult.depth,
      totalStrokes: endlessResult.totalBefore,
      currentStrokes: 0,
      checkpoint: null,
      startedAt: endlessResult.startedAt
    };
    persist();
    startEndless();
    return;
  }
  restartHole();
}

function openMenu() {
  if (mode === 'code') clearSharedRoute();
  saveActiveCheckpoint();
  setMode('menu');
  syncMenu();
}

function pauseGame() {
  if (mode !== 'playing') return;
  saveActiveCheckpoint();
  audio.ui();
  setMode('paused');
}

async function resumeGame() {
  await audio.unlock();
  audio.ui();
  setMode('playing');
}

function pointerLocal(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function beginAim(event) {
  if (aim.active || mode !== 'playing' || livingTerrain.isOverview() || !isBallStopped(ball) || ball.sunk || waterResetTimer > 0) return;
  const point = pointerLocal(event);
  const ballPoint = renderer.ballScreenPoint(ball);
  const distance = Math.hypot(point.x - ballPoint.x, point.y - ballPoint.y);
  if (distance > Math.max(76, 56 * renderer.scale)) {
    if (performance.now() - invalidAimAt > 900) {
      invalidAimAt = performance.now();
      showSurface('Начни жест от стеклянного шара');
      vibrate(4);
    }
    return;
  }
  if (event.cancelable) event.preventDefault();
  audio.unlock();
  aim.active = true;
  aim.pointerId = event.pointerId;
  aim.startX = point.x;
  aim.startY = point.y;
  aim.currentX = point.x;
  aim.currentY = point.y;
  aim.vx = 0;
  aim.vy = 0;
  syncAimMeter();
  try { canvas.setPointerCapture(event.pointerId); } catch {}
}

function moveAim(event) {
  if (!aim.active || event.pointerId !== aim.pointerId) return;
  if (event.cancelable) event.preventDefault();
  const point = pointerLocal(event);
  aim.currentX = point.x;
  aim.currentY = point.y;
  const dxScreen = aim.startX - point.x;
  const dyScreen = aim.startY - point.y;
  const worldDx = dxScreen / renderer.scale;
  const worldDy = dyScreen / (renderer.scale * .82);
  const distance = Math.hypot(worldDx, worldDy);
  const maxPull = 260;
  const pull = Math.min(maxPull, distance);
  const unitX = distance ? worldDx / distance : 0;
  const unitY = distance ? worldDy / distance : 0;
  const shaped = Math.pow(pull / maxPull, .88);
  aim.power = shaped;
  aim.vx = unitX * shaped * 1780;
  aim.vy = unitY * shaped * 1780;
  syncAimMeter();
}

function takeShot() {
  if (aim.power > .055) {
    livingTerrain.cancelOverview();
    strikeBall(ball, aim.vx, aim.vy);
    strokes += 1;
    save.hasAimed = true;
    lastSafe = { x: ball.x, y: ball.y };
    saveActiveCheckpoint();
    audio.strike(aim.power);
    vibrate(aim.power > .72 ? 18 : 10);
    renderer.emit(ball.x, ball.y, 'dust', 7);
    return true;
  }
  showSurface('Потяни немного дальше');
  vibrate(4);
  return false;
}

function finishAim(event, cancelled = false) {
  if (!aim.active || event.pointerId !== aim.pointerId) return;
  if (event.cancelable) event.preventDefault();
  const pointerId = aim.pointerId;
  if (!cancelled) takeShot();
  cancelAim();
  try { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); } catch {}
  syncHeader();
}

function syncAimMeter() {
  const meter = $('powerGauge');
  if (meter) {
    const value = Math.round(Math.max(0, Math.min(1, aim.power)) * 100);
    meter.style.setProperty('--aim-power', String(value / 100));
    meter.setAttribute('aria-valuenow', String(value));
    meter.setAttribute('aria-valuetext', `${value}%`);
    meter.setAttribute('aria-hidden', String(!aim.active));
  }
  document.body.dataset.aiming = String(aim.active);
}

function cancelAim() {
  aim.active = false;
  aim.pointerId = null;
  aim.vx = 0;
  aim.vy = 0;
  aim.power = 0;
  syncAimMeter();
}

function handlePhysicsEvent(event) {
  if (event.type === 'collision') {
    audio.collision(event.material, event.speed);
    if (event.speed > 520) vibrate(8);
  } else if (event.type === 'water' && waterResetTimer <= 0) {
    waterResetTimer = .85;
    strokes += 1;
    audio.water();
    vibrate([12, 32, 12]);
    renderer.emit(ball.x, ball.y, 'water', 18);
    showSurface('Вода · один штрафной удар');
    syncHeader();
    saveActiveCheckpoint();
  } else if (event.type === 'tunnel') {
    audio.tunnel();
    vibrate(12);
    renderer.emit(ball.x, ball.y, 'dust', 10);
    showSurface('Тихий туннель');
  } else if (event.type === 'tunnel-blocked') {
    audio.collision('stone', Math.max(90, event.speed));
    vibrate(7);
    showSurface('Туннелю не хватило разгона');
  } else if (event.type === 'jump') {
    audio.collision('wood', Math.min(420, event.speed * .34));
    vibrate(8);
    showSurface('Мяч оторвался от поверхности');
  } else if (event.type === 'land') {
    audio.collision('stone', Math.min(620, event.speed));
    if (event.speed > 260) vibrate(10);
    renderer.emit(ball.x, ball.y, 'dust', 9);
  } else if (event.type === 'lip-out') {
    audio.collision('cup', Math.max(110, event.speed));
    vibrate([7, 20, 7]);
    showSurface('Кромка вернула мяч');
  } else if (event.type === 'cup-bottom') {
    audio.collision('cup', Math.max(120, event.speed));
    vibrate(10);
  } else if (event.type === 'cup') {
    finishTimer = 1.05;
    audio.cup(strokes === 1);
    vibrate(strokes === 1 ? [18, 45, 18, 45, 26] : [16, 45, 22]);
    renderer.emit(level.hole.x, level.hole.y, 'cup', strokes === 1 ? 30 : 18);
  } else if (event.type === 'stopped') {
    lastSafe = { x: ball.x, y: ball.y };
    saveActiveCheckpoint();
  }
}

function resultCopy(delta, strokesTaken) {
  if (strokesTaken === 1) return ['Безупречно', 'Один удар. Светлячки теперь будут всем это рассказывать.'];
  if (delta <= -2) return ['Редкая точность', 'Поле закончилось раньше, чем успело возмутиться.'];
  if (delta === -1) return ['Чисто', 'Ни одного лишнего движения. Почти подозрительно.'];
  if (delta === 0) return ['Пар', 'Ровно столько, сколько задумал садовник.'];
  if (delta === 1) return ['Почти', 'Один лишний удар. Мох переживёт.'];
  return ['Дошёл', 'Не изящно, зато мяч всё-таки остался на дне.'];
}

function setResultCopy(eyebrow, title, detail, isRecord = false) {
  $('resultEyebrow').textContent = eyebrow;
  $('resultTitle').textContent = title;
  $('resultStrokes').textContent = String(strokes);
  $('resultStrokeWord').textContent = strokeWord(strokes);
  $('resultDetail').textContent = isRecord ? `${detail} Новый лучший результат.` : detail;
}

function finishEndlessSection() {
  const run = ensureEndlessRun(false);
  const totalBefore = run.totalStrokes;
  const completedSections = run.depth + 1;
  const totalStrokes = totalBefore + strokes;
  endlessResult = { seed: run.seed, depth: run.depth, strokes, totalBefore, startedAt: run.startedAt };
  save.endlessRun = { ...run, depth: completedSections, totalStrokes, currentStrokes: 0, checkpoint: null };
  const isDepthRecord = completedSections > save.endlessBest;
  const isScoreRecord = completedSections === save.endlessBest && (!Number.isFinite(save.endlessBestStrokes) || totalStrokes < save.endlessBestStrokes);
  if (isDepthRecord || isScoreRecord) {
    save.endlessBest = completedSections;
    save.endlessBestStrokes = totalStrokes;
  }
  persist();

  const delta = strokes - level.par;
  const [title, detail] = resultCopy(delta, strokes);
  setResultCopy(`Секция ${level.section} · ${level.name}`, title, `${detail} Пройдено секций: ${completedSections}.`, isDepthRecord || isScoreRecord);
  $('nextBtn').hidden = false;
  $('nextBtn').querySelector('span').textContent = 'Дальше в оранжерею';
  const next = generateEndlessLevel(run.seed, completedSections);
  $('nextMeta').textContent = `секция ${next.section} · пар ${next.par}`;
  $('retryBtn').hidden = false;
  setMode('result');
  syncMenu();
}

function finishHole() {
  finishTimer = 0;
  if (endlessActive) {
    finishEndlessSection();
    return;
  }

  const previous = save.best[levelIndex];
  if (previous == null || strokes < previous) save.best[levelIndex] = strokes;
  if (levelIndex + 1 < LEVELS.length) save.unlocked = Math.max(save.unlocked, levelIndex + 2);
  let completedRun = null;
  if (roundActive) {
    roundStrokes[levelIndex] = strokes;
    completedRun = recordCampaignHole(save.campaignRun, LEVELS.length, levelIndex, strokes);
    roundStartHole = completedRun.startHole;
    if (levelIndex < LEVELS.length - 1) {
      save.campaignRun = completedRun;
      save.current = completedRun.current;
    }
  }
  const delta = strokes - level.par;
  const [title, detail] = resultCopy(delta, strokes);
  setResultCopy(`${level.id}. ${level.name}`, title, detail, previous == null || strokes < previous);

  if (levelIndex === LEVELS.length - 1 && roundActive) {
    const fullTotal = fullCampaignTotal(completedRun, LEVELS.length);
    const segmentTotal = campaignSegmentTotal(completedRun, LEVELS.length);
    const total = fullTotal ?? segmentTotal;
    if (fullTotal != null && (save.roundBest == null || fullTotal < save.roundBest)) save.roundBest = fullTotal;
    save.campaignRun = null;
    save.current = 0;
    persist();
    $('finishStrokes').textContent = String(total);
    $('finishStrokeWord').textContent = strokeWord(total);
    if (fullTotal == null) {
      $('finishEyebrow').textContent = 'Прогулка завершена';
      $('finishTitle').textContent = 'Финальная лунка';
      $('finishDetail').textContent = `${total} ${strokeWord(total)} с лунки ${roundStartHole + 1}. Полный круг начнётся с первой лунки.`;
    } else {
      $('finishEyebrow').textContent = 'Круг завершён';
      $('finishTitle').textContent = 'Садовые маршруты';
      const par = LEVELS.reduce((sum, item) => sum + item.par, 0);
      const courseDelta = fullTotal - par;
      $('finishDetail').textContent = courseDelta < 0
        ? `На ${Math.abs(courseDelta)} ${strokeWord(Math.abs(courseDelta))} ниже общего пара. Оранжерея запомнила этот круг.`
        : courseDelta === 0
          ? 'Точно общий пар. Очень аккуратная прогулка.'
          : `На ${courseDelta} ${strokeWord(courseDelta)} выше общего пара. В следующий раз растения будут менее самоуверенны.`;
    }
    setMode('finish');
    syncMenu();
    return;
  }

  persist();

  $('nextBtn').querySelector('span').textContent = 'Следующая лунка';
  $('retryBtn').hidden = false;
  if (levelIndex === LEVELS.length - 1) {
    $('nextBtn').hidden = true;
  } else {
    $('nextBtn').hidden = false;
    const next = LEVELS[levelIndex + 1];
    $('nextMeta').textContent = `№ ${next.id} · пар ${next.par}`;
  }
  setMode('result');
  syncMenu();
}

async function enableTilt() {
  await audio.unlock();
  if (save.tilt) {
    save.tilt = false;
    renderer.setParallax(0, 0);
    persist();
    syncHeader();
    audio.ui();
    return;
  }
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== 'granted') throw new Error('denied');
    }
    save.tilt = true;
    persist();
    attachTilt();
    syncHeader();
    audio.ui();
    showToast('Глубина реагирует на наклон');
  } catch {
    save.tilt = false;
    syncHeader();
    showToast('Датчик наклона недоступен');
  }
}

function attachTilt() {
  if (tiltListening || !save.tilt) return;
  tiltListening = true;
  window.addEventListener('deviceorientation', (event) => {
    if (!save.tilt) return;
    renderer.setParallax((event.gamma || 0) / 24, (event.beta || 0) / 35);
  }, { passive: true });
}

function toggleOverview() {
  if (!canAimNow()) return;
  cancelAim();
  const active = livingTerrain.toggleOverview();
  audio.ui();
  showToast(active ? 'Показана вся территория' : 'Камера вернулась к мячу');
  syncOverviewControl();
}

function canAimNow() {
  return mode === 'playing' && !livingTerrain.isOverview() && isBallStopped(ball) && !ball.sunk && waterResetTimer <= 0;
}

function updateKeyboardAim() {
  const power = Math.max(.08, Math.min(1, aim.power || .34));
  aim.active = true;
  aim.pointerId = 'keyboard';
  aim.power = power;
  aim.vx = Math.cos(keyboardAngle) * power * 1780;
  aim.vy = Math.sin(keyboardAngle) * power * 1780;
  syncAimMeter();
}

function handleKeyboardAim(event) {
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return false;
  const key = event.key;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(key)) return false;
  if (!canAimNow() && aim.pointerId !== 'keyboard') return false;
  event.preventDefault();
  if (aim.pointerId !== 'keyboard') {
    keyboardAngle = Math.atan2(level.hole.y - ball.y, level.hole.x - ball.x);
    aim.power = .34;
  }
  if (key === 'ArrowLeft') keyboardAngle -= .075;
  if (key === 'ArrowRight') keyboardAngle += .075;
  if (key === 'ArrowUp') aim.power = Math.min(1, (aim.power || .34) + .055);
  if (key === 'ArrowDown') aim.power = Math.max(.08, (aim.power || .34) - .055);
  updateKeyboardAim();
  if (key === ' ' || key === 'Enter') {
    takeShot();
    cancelAim();
    syncHeader();
  }
  return true;
}

function bindControls() {
  canvas.addEventListener('pointerdown', beginAim, { passive: false });
  canvas.addEventListener('pointermove', moveAim, { passive: false });
  canvas.addEventListener('pointerup', (event) => finishAim(event, false), { passive: false });
  canvas.addEventListener('pointercancel', (event) => finishAim(event, true), { passive: false });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (aim.active && aim.pointerId === event.pointerId) cancelAim();
  });

  $('continueBtn').addEventListener('click', async () => {
    await audio.unlock();
    audio.ui();
    startCampaign();
  });
  $('endlessBtn').addEventListener('click', async () => {
    await audio.unlock();
    audio.ui();
    startEndless({ fresh: !normalizeEndlessRun(save.endlessRun) });
  });
  $('newEndlessBtn').addEventListener('click', async () => {
    await audio.unlock();
    audio.ui();
    const current = normalizeEndlessRun(save.endlessRun);
    requestConfirmation({
      eyebrow: 'Новый бесконечный путь',
      title: 'Заменить текущий маршрут?',
      detail: current ? `Путь ${formatRunCode(current.seed)} останется в рекордах, но его текущая секция будет потеряна.` : 'Оранжерея вырастит новый маршрут с другим кодом.',
      acceptLabel: 'Вырастить новый путь',
      meta: 'пройденные секции останутся в рекорде',
      returnMode: 'menu',
      action: () => {
        startEndless({ fresh: true });
        showToast(`Новый код · ${formatRunCode(save.endlessRun.seed)}`);
      }
    });
  });
  $('codeBtn').addEventListener('click', async () => { await audio.unlock(); audio.ui(); openCodeScreen(); });
  $('startCodeBtn').addEventListener('click', startCodeRoute);
  $('shareCodeBtn').addEventListener('click', shareRunCode);
  $('runCodeInput').addEventListener('input', (event) => {
    const cleaned = event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 7);
    if (event.target.value !== cleaned) event.target.value = cleaned;
    $('codeError').textContent = '';
  });
  $('runCodeInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); startCodeRoute(); }
  });
  $('confirmAcceptBtn').addEventListener('click', async () => {
    const action = confirmationAction;
    confirmationFocus = null;
    confirmationAction = null;
    audio.ui();
    if (action) await action();
  });
  $('confirmCancelBtn').addEventListener('click', () => { audio.ui(); closeConfirmation(); });
  $('holesBtn').addEventListener('click', async () => { await audio.unlock(); audio.ui(); setMode('holes'); renderHoleShelf(); });
  document.querySelectorAll('[data-close-screen]').forEach((button) => button.addEventListener('click', () => { audio.ui(); openMenu(); }));
  $('pauseBtn').addEventListener('click', pauseGame);
  $('overviewBtn').addEventListener('click', toggleOverview);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtn').addEventListener('click', requestRestart);
  $('quitBtn').addEventListener('click', () => { audio.ui(); openMenu(); });
  $('retryBtn').addEventListener('click', retryResult);
  $('resultMenuBtn').addEventListener('click', () => { audio.ui(); openMenu(); });
  $('finishMenuBtn').addEventListener('click', () => { audio.ui(); openMenu(); });
  $('againBtn').addEventListener('click', () => { audio.ui(); startCampaign({ fresh: true }); });
  $('nextBtn').addEventListener('click', () => {
    audio.ui();
    if (endlessActive) startEndless();
    else startHole(levelIndex + 1, { round: roundActive, preserveRound: roundActive });
  });
  $('soundBtn').addEventListener('click', async () => {
    save.sound = !save.sound;
    audio.setEnabled(save.sound);
    if (save.sound) { await audio.unlock(); audio.ui(); }
    persist();
    syncHeader();
  });
  $('hapticsBtn').addEventListener('click', () => {
    save.haptics = !save.haptics;
    if (save.haptics) vibrate(14);
    audio.ui();
    persist();
    syncHeader();
  });
  $('tiltBtn').addEventListener('click', enableTilt);
  ['menuHomeLink', 'codeHomeLink', 'holesHomeLink', 'pauseHomeLink', 'resultHomeLink', 'finishHomeLink'].forEach((id) => $(id).addEventListener('click', exitToShelf));

  window.addEventListener('resize', () => renderer.resize(), { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(() => renderer.resize(), 180), { passive: true });
  window.addEventListener('moss-marble:webgl-lost', () => {
    saveActiveCheckpoint();
    cancelAim();
    audio.suspend();
    persist();
  });
  window.addEventListener('keydown', (event) => {
    if (handleKeyboardAim(event)) return;
    if (event.key === 'Escape') {
      if (aim.pointerId === 'keyboard') cancelAim();
      else if (mode === 'playing') pauseGame();
      else if (mode === 'paused') resumeGame();
      else if (mode === 'code' || mode === 'holes') openMenu();
      else if (mode === 'confirm') closeConfirmation();
    }
    if (event.key.toLowerCase() === 'v') toggleOverview();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pausedBeforeHidden = mode === 'playing';
      saveActiveCheckpoint();
      if (pausedBeforeHidden) setMode('paused');
      audio.suspend();
      persist();
    }
  });
  window.addEventListener('pagehide', () => { saveActiveCheckpoint(); persist(); }, { capture: true });
}

function previewMotion(time) {
  if (mode !== 'menu' || save.best.some((value) => value != null)) return;
  const centerX = level.start.x + Math.sin(time * .21) * 34;
  const centerY = level.start.y - 30 + Math.cos(time * .25) * 18;
  ball.x += (centerX - ball.x) * .018;
  ball.y += (centerY - ball.y) * .018;
}

function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  audio.ambientTick(dt);

  if (document.hidden) {
    requestAnimationFrame(frame);
    return;
  }
  if (mode !== 'playing' && lastInactiveRenderAt > 0 && now - lastInactiveRenderAt < 1000 / 30) {
    requestAnimationFrame(frame);
    return;
  }
  if (mode !== 'playing') lastInactiveRenderAt = now;

  if (mode === 'playing') {
    if (waterResetTimer > 0) {
      waterResetTimer -= dt;
      if (waterResetTimer <= 0) {
        resetBall(lastSafe);
        saveActiveCheckpoint();
      }
    } else if (!ball.sunk) {
      const events = stepBall(ball, level, dt, elapsed);
      events.forEach(handlePhysicsEvent);
    } else {
      stepBall(ball, level, dt, elapsed);
    }
    if (finishTimer > 0) {
      finishTimer -= dt;
      if (finishTimer <= 0) finishHole();
    }
  } else {
    previewMotion(elapsed);
  }

  audio.rollTick(ball, mode === 'playing' && waterResetTimer <= 0);

  const movingState = String(ball.moving || ball.sunk || ball.airborne || ball.inCup || waterResetTimer > 0);
  if (movingState !== lastBallMovingState) {
    lastBallMovingState = movingState;
    document.body.dataset.ballMoving = movingState;
    overviewUiKey = '';
  }
  const renderMode = ['menu', 'holes', 'code', 'confirm'].includes(mode) ? 'menu' : 'playing';
  renderer.draw(level, ball, aim, elapsed, dt, renderMode);
  livingTerrain.draw(level, ball, elapsed, renderMode);
  syncOverviewControl();
  requestAnimationFrame(frame);
}

Promise.all([
  import('../../shared/mobile-runtime.js'),
  import('../../shared/workshop-mode.js')
]).then(([{ installMobileRuntime, setDocumentScrollLocked }, { createWorkshopMode }]) => {
  installMobileRuntime();
  setDocumentScrollLocked(true);
  createWorkshopMode({
    appName: 'Moss & Marble',
    version: APP_VERSION,
    cachePrefix: 'moss-marble-',
    storageNamespace: 'pocket-works:moss-marble',
    onReset() {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  });
}).catch(() => {});

bindControls();
audio.setEnabled(save.sound);
if (save.tilt) attachTilt();
syncMenu();
syncHeader();
setMode('menu', { focus: false });
const sharedRouteSeed = parseRunCode(new URL(window.location.href).searchParams.get('route'));
if (sharedRouteSeed) openCodeScreen(sharedRouteSeed, { focus: false });
requestAnimationFrame(frame);

window.__MOSS_MARBLE__ = {
  startHole,
  startEndless,
  restartHole,
  generateEndlessLevel,
  toggleOverview,
  snapshot: () => ({
    mode,
    levelIndex,
    strokes,
    roundActive,
    endlessActive,
    overview: livingTerrain.isOverview(),
    level: { id: level.id, name: level.name, par: level.par, section: level.section, endless: level.endless },
    ball: { ...ball },
    save: structuredClone(save)
  }),
  strike: (vx, vy) => {
    if (mode === 'playing' && isBallStopped(ball)) {
      strokes += 1;
      livingTerrain.cancelOverview();
      strikeBall(ball, vx, vy);
      lastSafe = { x: ball.x, y: ball.y };
      saveActiveCheckpoint();
      syncHeader();
    }
  },
  complete: () => {
    if (mode === 'playing') {
      ball.sunk = true;
      ball.inCup = true;
      ball.x = level.hole.x;
      ball.y = level.hole.y;
      ball.z = -20;
      finishTimer = .01;
    }
  }
};
