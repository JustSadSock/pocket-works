import { LEVELS, getLevel } from './levels.js';
import { createRunSeed, formatRunCode, generateEndlessLevel } from './procedural.js';
import { createBall, isBallStopped, stepBall, strikeBall } from './physics.js';
import { DioramaRenderer } from './render.js';
import { AudioGarden } from './audio.js';

// Runtime equivalent of: import { createWorkshopMode } from '../../shared/workshop-mode.js'

const APP_VERSION = '1.3.0';
const STORAGE_KEY = 'pocket-works:moss-marble:save';
const DEFAULT_SAVE = {
  version: 2,
  unlocked: 1,
  current: 0,
  best: Array(LEVELS.length).fill(null),
  roundBest: null,
  endlessBest: 0,
  endlessBestStrokes: null,
  endlessRun: null,
  sound: true,
  haptics: true,
  tilt: false,
  hasAimed: false
};

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new DioramaRenderer(canvas);
const audio = new AudioGarden();

let save = loadSave();
let mode = 'menu';
let levelIndex = Math.min(save.current, save.unlocked - 1, LEVELS.length - 1);
let level = getLevel(levelIndex);
let ball = createBall(level.start);
let strokes = 0;
let roundStrokes = [];
let roundActive = false;
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

const aim = { active: false, pointerId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, vx: 0, vy: 0, power: 0 };

function normalizeEndlessRun(value) {
  if (!value || typeof value !== 'object') return null;
  const seed = Number(value.seed) >>> 0;
  if (!seed) return null;
  return {
    seed,
    depth: Math.max(0, Math.trunc(Number(value.depth) || 0)),
    totalStrokes: Math.max(0, Math.trunc(Number(value.totalStrokes) || 0)),
    startedAt: Number.isFinite(Number(value.startedAt)) ? Number(value.startedAt) : Date.now()
  };
}

function loadSave() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || ![1, 2].includes(parsed.version)) return structuredClone(DEFAULT_SAVE);
    const best = Array.from({ length: LEVELS.length }, (_, index) => Number.isFinite(parsed.best?.[index]) ? parsed.best[index] : null);
    return {
      ...structuredClone(DEFAULT_SAVE),
      ...parsed,
      version: 2,
      best,
      unlocked: Math.max(1, Math.min(LEVELS.length, Number(parsed.unlocked) || 1)),
      current: Math.max(0, Math.min(LEVELS.length - 1, Number(parsed.current) || 0)),
      endlessBest: Math.max(0, Math.trunc(Number(parsed.endlessBest) || 0)),
      endlessBestStrokes: Number.isFinite(parsed.endlessBestStrokes) ? Math.max(0, Math.trunc(parsed.endlessBestStrokes)) : null,
      endlessRun: normalizeEndlessRun(parsed.endlessRun)
    };
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
  surfaceTimer = window.setTimeout(() => note.classList.remove('is-visible'), 1200);
}

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('is-visible'));
  const map = { menu: 'menuScreen', holes: 'holesScreen', paused: 'pauseScreen', result: 'resultScreen', finish: 'finishScreen' };
  if (map[next]) $(map[next]).classList.add('is-visible');
  if (next !== 'playing') cancelAim();
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
  document.body.dataset.ballMoving = String(ball.moving || ball.sunk);
  document.body.dataset.route = endlessActive ? 'endless' : 'course';
}

function syncMenu() {
  const current = getLevel(Math.min(save.current, save.unlocked - 1));
  $('continueLabel').textContent = save.best.some((value) => value != null) ? 'Продолжить прогулку' : 'Начать прогулку';
  $('continueMeta').textContent = `Лунка ${current.id} · пар ${current.par}`;
  const total = save.best.every((value) => Number.isFinite(value)) ? save.best.reduce((sum, value) => sum + value, 0) : null;
  $('courseBest').textContent = total == null ? 'Лучший круг ещё не сыгран' : `Лучший собранный круг · ${total} ударов`;

  const run = normalizeEndlessRun(save.endlessRun);
  $('endlessLabel').textContent = run ? 'Продолжить бесконечный путь' : 'Бесконечная оранжерея';
  $('endlessMeta').textContent = run
    ? `Секция ${run.depth + 1} · ${formatRunCode(run.seed)}`
    : save.endlessBest > 0
      ? `Новый код · рекорд ${save.endlessBest} секций`
      : 'Новый код · без конца';
  $('newEndlessBtn').hidden = !run;
  $('endlessBest').textContent = save.endlessBest > 0
    ? `Глубже всего · ${save.endlessBest} секций${Number.isFinite(save.endlessBestStrokes) ? ` · ${save.endlessBestStrokes} ударов` : ''}`
    : 'Бесконечный путь ещё не начат';
  renderHoleShelf();
}

function renderHoleShelf() {
  const shelf = $('holeShelf');
  shelf.replaceChildren();
  LEVELS.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hole-pot';
    button.disabled = index >= save.unlocked;
    button.dataset.index = String(index);
    if (save.best[index] === 1) button.classList.add('is-perfect');
    const best = save.best[index];
    button.innerHTML = `<span class="plant"></span><span class="label"><b>${item.id}. ${item.name}</b><small>${button.disabled ? 'Закрыто' : best == null ? `пар ${item.par}` : `лучшее ${best} · пар ${item.par}`}</small></span>`;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      audio.ui();
      startHole(index, { round: false });
    });
    shelf.append(button);
  });
}

function resetBall(to = level.start) {
  ball = createBall(to);
  lastSafe = { x: to.x, y: to.y };
  waterResetTimer = 0;
  syncHeader();
}

function preparePlayingLevel() {
  strokes = 0;
  finishTimer = 0;
  endlessResult = null;
  resetBall(level.start);
  setMode('playing');
  syncHeader();
  showSurface(level.note);
}

function startHole(index, { round = false, preserveRound = false } = {}) {
  endlessActive = false;
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  level = getLevel(levelIndex);
  if (round && !preserveRound) {
    roundActive = true;
    roundStrokes = [];
  } else if (!round) {
    roundActive = false;
    roundStrokes = [];
  }
  save.current = levelIndex;
  persist();
  preparePlayingLevel();
}

function ensureEndlessRun(fresh = false) {
  let run = fresh ? null : normalizeEndlessRun(save.endlessRun);
  if (!run) {
    run = { seed: createRunSeed(), depth: 0, totalStrokes: 0, startedAt: Date.now() };
    save.endlessRun = run;
    persist();
  }
  return run;
}

function startEndless({ fresh = false } = {}) {
  const run = ensureEndlessRun(fresh);
  endlessActive = true;
  roundActive = false;
  roundStrokes = [];
  levelIndex = -1;
  level = generateEndlessLevel(run.seed, run.depth);
  preparePlayingLevel();
}

function restartHole() {
  audio.ui();
  preparePlayingLevel();
  showSurface(endlessActive ? `Секция ${level.section} начата заново` : 'Лунка начата заново');
}

function retryResult() {
  audio.ui();
  if (endlessActive && endlessResult) {
    save.endlessRun = {
      seed: endlessResult.seed,
      depth: endlessResult.depth,
      totalStrokes: endlessResult.totalBefore,
      startedAt: endlessResult.startedAt
    };
    persist();
    startEndless();
    return;
  }
  restartHole();
}

function openMenu() {
  setMode('menu');
  syncMenu();
}

function pauseGame() {
  if (mode !== 'playing') return;
  audio.ui();
  setMode('paused');
}

function resumeGame() {
  audio.ui();
  setMode('playing');
}

function pointerLocal(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function beginAim(event) {
  if (mode !== 'playing' || !isBallStopped(ball) || ball.sunk || waterResetTimer > 0) return;
  const point = pointerLocal(event);
  const ballPoint = renderer.ballScreenPoint(ball);
  const distance = Math.hypot(point.x - ballPoint.x, point.y - ballPoint.y);
  if (distance > Math.max(76, 56 * renderer.scale)) return;
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
}

function finishAim(event, cancelled = false) {
  if (!aim.active || event.pointerId !== aim.pointerId) return;
  if (event.cancelable) event.preventDefault();
  const pointerId = aim.pointerId;
  try { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); } catch {}
  if (!cancelled && aim.power > .055) {
    strikeBall(ball, aim.vx, aim.vy);
    strokes += 1;
    save.hasAimed = true;
    lastSafe = { x: ball.x, y: ball.y };
    audio.strike(aim.power);
    vibrate(aim.power > .72 ? 18 : 10);
    renderer.emit(ball.x, ball.y, 'dust', 7);
  }
  cancelAim();
  syncHeader();
}

function cancelAim() {
  aim.active = false;
  aim.pointerId = null;
  aim.vx = 0;
  aim.vy = 0;
  aim.power = 0;
}

function handlePhysicsEvent(event) {
  if (event.type === 'collision') {
    audio.collision(event.material, event.speed);
    if (event.speed > 520) vibrate(8);
  } else if (event.type === 'water' && waterResetTimer <= 0) {
    waterResetTimer = .85;
    audio.water();
    vibrate([12, 32, 12]);
    renderer.emit(ball.x, ball.y, 'water', 18);
    showSurface('Вода вернула мяч');
  } else if (event.type === 'tunnel') {
    audio.tunnel();
    vibrate(12);
    renderer.emit(ball.x, ball.y, 'dust', 10);
    showSurface('Тихий туннель');
  } else if (event.type === 'cup') {
    finishTimer = 1.18;
    audio.cup(strokes === 1);
    vibrate(strokes === 1 ? [18, 45, 18, 45, 26] : [16, 45, 22]);
    renderer.emit(level.hole.x, level.hole.y, 'cup', strokes === 1 ? 30 : 18);
  } else if (event.type === 'stopped') {
    lastSafe = { x: ball.x, y: ball.y };
  }
}

function resultCopy(delta, strokesTaken) {
  if (strokesTaken === 1) return ['Безупречно', 'Один удар. Светлячки теперь будут всем это рассказывать.'];
  if (delta <= -2) return ['Редкая точность', 'Поле закончилось раньше, чем успело возмутиться.'];
  if (delta === -1) return ['Чисто', 'Ни одного лишнего движения. Почти подозрительно.'];
  if (delta === 0) return ['Пар', 'Ровно столько, сколько задумал садовник.'];
  if (delta === 1) return ['Почти', 'Один лишний удар. Мох переживёт.'];
  return ['Дошёл', 'Не изящно, зато мяч всё-таки в лунке.'];
}

function setResultCopy(eyebrow, title, detail, isRecord = false) {
  $('resultEyebrow').textContent = eyebrow;
  $('resultTitle').textContent = title;
  $('resultStrokes').textContent = String(strokes);
  $('resultDetail').textContent = isRecord ? `${detail} Новый лучший результат.` : detail;
}

function finishEndlessSection() {
  const run = ensureEndlessRun(false);
  const totalBefore = run.totalStrokes;
  const completedSections = run.depth + 1;
  const totalStrokes = totalBefore + strokes;
  endlessResult = { seed: run.seed, depth: run.depth, strokes, totalBefore, startedAt: run.startedAt };
  save.endlessRun = { ...run, depth: completedSections, totalStrokes };
  const isDepthRecord = completedSections > save.endlessBest;
  const isScoreRecord = completedSections === save.endlessBest && (!Number.isFinite(save.endlessBestStrokes) || totalStrokes < save.endlessBestStrokes);
  if (isDepthRecord || isScoreRecord) {
    save.endlessBest = completedSections;
    save.endlessBestStrokes = totalStrokes;
  }
  persist();

  const delta = strokes - level.par;
  const [title, detail] = resultCopy(delta, strokes);
  setResultCopy(`Секция ${level.section} · ${level.name}`, title, `${detail} Пройдено секций: ${completedSections}.`, isDepthRecord);
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
  save.current = Math.min(LEVELS.length - 1, levelIndex + 1);
  persist();

  if (roundActive) roundStrokes[levelIndex] = strokes;
  const delta = strokes - level.par;
  const [title, detail] = resultCopy(delta, strokes);
  setResultCopy(`${level.id}. ${level.name}`, title, detail, previous == null || strokes < previous);

  if (levelIndex === LEVELS.length - 1 && roundActive) {
    const total = roundStrokes.reduce((sum, value) => sum + (value || 0), 0);
    if (save.roundBest == null || total < save.roundBest) save.roundBest = total;
    persist();
    $('finishStrokes').textContent = String(total);
    const par = LEVELS.reduce((sum, item) => sum + item.par, 0);
    const courseDelta = total - par;
    $('finishDetail').textContent = courseDelta < 0
      ? `${Math.abs(courseDelta)} ниже общего пара. Оранжерея запомнила этот круг.`
      : courseDelta === 0
        ? 'Точно общий пар. Очень аккуратная прогулка.'
        : `${courseDelta} выше общего пара. В следующий раз растения будут менее самоуверенны.`;
    setMode('finish');
    syncMenu();
    return;
  }

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

function bindControls() {
  canvas.addEventListener('pointerdown', beginAim, { passive: false });
  canvas.addEventListener('pointermove', moveAim, { passive: false });
  canvas.addEventListener('pointerup', (event) => finishAim(event, false), { passive: false });
  canvas.addEventListener('pointercancel', (event) => finishAim(event, true), { passive: false });
  canvas.addEventListener('lostpointercapture', () => cancelAim());

  $('continueBtn').addEventListener('click', async () => {
    await audio.unlock();
    audio.ui();
    startHole(Math.min(save.current, save.unlocked - 1), { round: true });
  });
  $('endlessBtn').addEventListener('click', async () => {
    await audio.unlock();
    audio.ui();
    startEndless({ fresh: !normalizeEndlessRun(save.endlessRun) });
  });
  $('newEndlessBtn').addEventListener('click', async () => {
    await audio.unlock();
    audio.ui();
    startEndless({ fresh: true });
    showToast(`Новый код · ${formatRunCode(save.endlessRun.seed)}`);
  });
  $('holesBtn').addEventListener('click', async () => { await audio.unlock(); audio.ui(); setMode('holes'); renderHoleShelf(); });
  document.querySelectorAll('[data-close-screen]').forEach((button) => button.addEventListener('click', () => { audio.ui(); openMenu(); }));
  $('pauseBtn').addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtn').addEventListener('click', restartHole);
  $('quitBtn').addEventListener('click', () => { audio.ui(); openMenu(); });
  $('retryBtn').addEventListener('click', retryResult);
  $('resultMenuBtn').addEventListener('click', () => { audio.ui(); openMenu(); });
  $('finishMenuBtn').addEventListener('click', () => { audio.ui(); openMenu(); });
  $('againBtn').addEventListener('click', () => { audio.ui(); startHole(0, { round: true }); });
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
  ['menuHomeLink', 'holesHomeLink', 'pauseHomeLink', 'resultHomeLink', 'finishHomeLink'].forEach((id) => $(id).addEventListener('click', exitToShelf));

  window.addEventListener('resize', () => renderer.resize(), { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(() => renderer.resize(), 180), { passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (mode === 'playing') pauseGame();
      else if (mode === 'paused') resumeGame();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pausedBeforeHidden = mode === 'playing';
      if (pausedBeforeHidden) setMode('paused');
      audio.suspend();
      persist();
    }
  });
  window.addEventListener('pagehide', persist, { capture: true });
}

function previewMotion(time) {
  if (mode !== 'menu' || save.best.some((value) => value != null)) return;
  const cx = level.start.x + Math.sin(time * .21) * 34;
  const cy = level.start.y - 30 + Math.cos(time * .25) * 18;
  ball.x += (cx - ball.x) * .018;
  ball.y += (cy - ball.y) * .018;
}

function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  audio.ambientTick(dt);

  if (mode === 'playing') {
    if (waterResetTimer > 0) {
      waterResetTimer -= dt;
      if (waterResetTimer <= 0) resetBall(lastSafe);
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

  document.body.dataset.ballMoving = String(ball.moving || ball.sunk || waterResetTimer > 0);
  const renderMode = mode === 'menu' || mode === 'holes' ? 'menu' : 'playing';
  renderer.draw(level, ball, aim, elapsed, dt, renderMode);
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
setMode('menu');
requestAnimationFrame(frame);

window.__MOSS_MARBLE__ = {
  startHole,
  startEndless,
  restartHole,
  generateEndlessLevel,
  snapshot: () => ({
    mode,
    levelIndex,
    strokes,
    roundActive,
    endlessActive,
    level: { id: level.id, name: level.name, par: level.par, section: level.section, endless: level.endless },
    ball: { ...ball },
    save: structuredClone(save)
  }),
  strike: (vx, vy) => {
    if (mode === 'playing' && isBallStopped(ball)) {
      strokes += 1;
      strikeBall(ball, vx, vy);
      syncHeader();
    }
  },
  complete: () => {
    if (mode === 'playing') {
      ball.sunk = true;
      ball.x = level.hole.x;
      ball.y = level.hole.y;
      finishTimer = .01;
    }
  }
};
