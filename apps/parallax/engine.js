const els = {
  instrument: document.querySelector('#instrument'),
  canvas: document.querySelector('#game-canvas'),
  fatal: document.querySelector('#fatal-error'),
  home: document.querySelector('#home-screen'),
  levels: document.querySelector('#levels-screen'),
  settings: document.querySelector('#settings-screen'),
  complete: document.querySelector('#complete-screen'),
  continueButton: document.querySelector('#continue-button'),
  homeLevelsButton: document.querySelector('#home-levels-button'),
  levelButton: document.querySelector('#level-button'),
  menuButton: document.querySelector('#menu-button'),
  undoButton: document.querySelector('#undo-button'),
  resetButton: document.querySelector('#reset-button'),
  hintButton: document.querySelector('#hint-button'),
  nextButton: document.querySelector('#next-button'),
  replayButton: document.querySelector('#replay-button'),
  soundToggle: document.querySelector('#sound-toggle'),
  hapticsToggle: document.querySelector('#haptics-toggle'),
  wipeButton: document.querySelector('#wipe-button'),
  levelGrid: document.querySelector('#level-grid'),
  chapterLabel: document.querySelector('#chapter-label'),
  levelLabel: document.querySelector('#level-label'),
  objectiveCopy: document.querySelector('#objective-copy'),
  moveLabel: document.querySelector('#move-label'),
  parLabel: document.querySelector('#par-label'),
  toast: document.querySelector('#toast'),
  progressLabel: document.querySelector('#progress-label'),
  resultMoves: document.querySelector('#result-moves'),
  resultPar: document.querySelector('#result-par'),
  resultGrade: document.querySelector('#result-grade'),
  completeTitle: document.querySelector('#complete-title'),
  completeCopy: document.querySelector('#complete-copy')
};

const ctx = els.canvas?.getContext('2d');
if (!ctx) {
  els.fatal.hidden = false;
  throw new Error('Canvas 2D is unavailable');
}

const defaultProgress = () => ({
  version: APP_VERSION,
  current: 0,
  unlocked: 1,
  best: {},
  completed: {},
  sound: true,
  haptics: true,
  introSeen: false
});

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw);
    return {
      ...defaultProgress(),
      ...parsed,
      current: clamp(Number(parsed.current) || 0, 0, LEVELS.length - 1),
      unlocked: clamp(Number(parsed.unlocked) || 1, 1, LEVELS.length),
      best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
      completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {}
    };
  } catch {
    return defaultProgress();
  }
}

let progress = loadProgress();
let state = null;
let layout = null;
let animation = null;
let pointer = null;
let frameHandle = 0;
let toastTimer = 0;
let audioContext = null;

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage can be unavailable */ }
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function pad(value) { return String(value).padStart(2, '0'); }
function cellKey(x, y) { return `${x},${y}`; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function copySet(set) { return new Set([...set]); }

function chapterFor(level) {
  return CHAPTERS.find((chapter) => chapter.id === level.chapter) || CHAPTERS[0];
}

function parseLevel(index) {
  const level = LEVELS[index];
  const height = level.grid.length;
  const width = Math.max(...level.grid.map((row) => row.length));
  let start = { x: 1, y: 1 };
  let exit = { x: width - 2, y: height - 2 };
  const shards = new Set();

  level.grid.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === 'S') start = { x, y };
      if (cell === 'E') exit = { x, y };
      if (cell === '*') shards.add(cellKey(x, y));
    });
  });

  return {
    index,
    level,
    width,
    height,
    player: { ...start },
    start,
    exit,
    shards,
    initialShards: copySet(shards),
    lens: { x: level.lens?.[0] ?? Math.floor(width / 2), y: level.lens?.[1] ?? Math.floor(height / 2), radius: level.radius },
    moves: 0,
    history: [],
    status: 'playing',
    message: '',
    justLoaded: true
  };
}

function loadLevel(index, { closeScreens = true } = {}) {
  progress.current = clamp(index, 0, LEVELS.length - 1);
  saveProgress();
  state = parseLevel(progress.current);
  animation = null;
  pointer = null;
  if (closeScreens) closeAllScreens();
  updateUI();
  requestRender();
  if (index === 0 && !progress.introSeen) {
    showToast('Тяни круглую линзу. Затем свайпни по полю или нажми стрелку.', 4200);
    progress.introSeen = true;
    saveProgress();
  }
}

function restartLevel() {
  const lens = state?.lens ? { ...state.lens } : null;
  state = parseLevel(progress.current);
  if (lens) state.lens = lens;
  animation = null;
  updateUI();
  sound('reset');
  haptic(12);
  requestRender();
}

function snapshot() {
  return {
    player: { ...state.player },
    shards: copySet(state.shards),
    lens: { ...state.lens },
    moves: state.moves
  };
}

function restoreSnapshot(item) {
  state.player = { ...item.player };
  state.shards = copySet(item.shards);
  state.lens = { ...item.lens };
  state.moves = item.moves;
  state.status = 'playing';
  animation = null;
  updateUI();
  requestRender();
}

function undo() {
  if (!state || state.status !== 'playing' || animation || state.history.length === 0) return;
  restoreSnapshot(state.history.pop());
  sound('undo');
  haptic(8);
}

function tileAt(x, y) {
  if (!state || y < 0 || y >= state.height || x < 0 || x >= state.width) return '#';
  const row = state.level.grid[y] || '';
  return row[x] || '#';
}

function isInsideLens(x, y, lens = state.lens) {
  return Math.hypot(x - lens.x, y - lens.y) <= lens.radius + 0.001;
}

function activeLayerAt(x, y) {
  return isInsideLens(x, y) ? 'B' : 'A';
}

function isBlocked(x, y) {
  const tile = tileAt(x, y);
  if (tile === '#') return true;
  if (tile === 'a') return activeLayerAt(x, y) === 'A';
  if (tile === 'b') return activeLayerAt(x, y) === 'B';
  return false;
}

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function reflect(dir, mirror) {
  if (mirror === '/') return { x: -dir.y, y: -dir.x };
  if (mirror === '\\') return { x: dir.y, y: dir.x };
  return dir;
}

function planMove(directionName) {
  const initialDirection = DIRECTIONS[directionName];
  if (!initialDirection || !state || state.status !== 'playing') return null;

  let position = { ...state.player };
  let direction = { ...initialDirection };
  const path = [{ ...position }];
  const collected = new Set();
  const seen = new Set();
  let reachedExit = false;
  let blockedExit = false;

  for (let guard = 0; guard < state.width * state.height * 8; guard += 1) {
    const signature = `${position.x},${position.y},${direction.x},${direction.y}`;
    if (seen.has(signature)) return { loop: true, path, collected, reachedExit: false, blockedExit: false };
    seen.add(signature);

    const next = { x: position.x + direction.x, y: position.y + direction.y };
    if (isBlocked(next.x, next.y)) break;
    position = next;
    path.push({ ...position });

    const key = cellKey(position.x, position.y);
    if (state.shards.has(key)) collected.add(key);

    const tile = tileAt(position.x, position.y);
    if (tile === 'E') {
      const remaining = state.shards.size - collected.size;
      if (remaining === 0) reachedExit = true;
      else blockedExit = true;
      break;
    }
    if (tile === '/' || tile === '\\') direction = reflect(direction, tile);
  }

  return { path, collected, reachedExit, blockedExit, loop: false };
}

function move(directionName) {
  if (!state || state.status !== 'playing' || animation || isScreenOpen()) return;
  const plan = planMove(directionName);
  if (!plan || plan.path.length <= 1 || plan.loop) {
    invalidAction(plan?.loop ? 'Оптическая петля. Смени линзу.' : 'Там упор. Реальность не впечатлена.');
    return;
  }

  state.history.push(snapshot());
  if (state.history.length > 50) state.history.shift();
  state.moves += 1;
  animation = {
    path: plan.path,
    startedAt: performance.now(),
    duration: Math.max(170, (plan.path.length - 1) * 92),
    result: plan
  };
  sound('move');
  updateUI();
  requestRender();
}

function finishMove(result) {
  const final = result.path[result.path.length - 1];
  state.player = { ...final };
  result.collected.forEach((key) => state.shards.delete(key));
  animation = null;

  if (result.collected.size > 0) {
    sound('shard');
    haptic([12, 26, 12]);
  } else {
    haptic(6);
  }

  if (result.blockedExit) showToast(`Апертура закрыта: осталось фрагментов ${state.shards.size}.`, 2200);
  if (result.reachedExit) completeLevel();
  updateUI();
  requestRender();
}

function completeLevel() {
  state.status = 'complete';
  const index = state.index;
  const best = Number(progress.best[index]);
  progress.best[index] = best ? Math.min(best, state.moves) : state.moves;
  progress.completed[index] = true;
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, index + 2));
  if (index < LEVELS.length - 1) progress.current = index + 1;
  saveProgress();
  updateHomeProgress();
  buildLevelGrid();
  sound('complete');
  haptic([18, 30, 18, 45, 26]);

  const grade = gradeFor(state.moves, state.level.par);
  els.resultMoves.textContent = pad(state.moves);
  els.resultPar.textContent = pad(state.level.par);
  els.resultGrade.textContent = grade;
  els.completeTitle.textContent = state.level.name;
  els.completeCopy.textContent = completeCopyFor(grade);
  els.nextButton.textContent = state.index === LEVELS.length - 1 ? 'К КАРТЕ УРОВНЕЙ' : 'СЛЕДУЮЩИЙ УРОВЕНЬ';

  setTimeout(() => {
    els.complete.hidden = false;
  }, 430);
}

function gradeFor(moves, par) {
  if (moves <= par) return 'A';
  if (moves <= par + 2) return 'B';
  return 'C';
}

function completeCopyFor(grade) {
  if (grade === 'A') return 'Чистое сведение. Даже прибору нечего пассивно-агрессивно пищать.';
  if (grade === 'B') return 'Контур сошёлся с небольшой хроматической погрешностью.';
  return 'Решение найдено. Красиво — нет. Работает — да, а это уже редкость.';
}

function showToast(message, duration = 2400) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, duration);
}

function invalidAction(message) {
  showToast(message, 1500);
  sound('invalid');
  haptic([8, 30, 8]);
  els.instrument.classList.remove('is-shaking');
  void els.instrument.offsetWidth;
  els.instrument.classList.add('is-shaking');
}

function updateUI() {
  if (!state) return;
  const chapter = chapterFor(state.level);
  els.chapterLabel.textContent = `${chapter.roman} · ${chapter.name}`;
  els.levelLabel.textContent = `${pad(state.index + 1)} / ${LEVELS.length}`;
  els.moveLabel.textContent = pad(state.moves);
  els.parLabel.textContent = `ПАР ${pad(state.level.par)}`;
  els.undoButton.disabled = state.history.length === 0 || Boolean(animation);
  els.objectiveCopy.textContent = state.shards.size > 0
    ? `Фрагменты: ${state.shards.size} · затем войди в апертуру`
    : 'Все фрагменты собраны · войди в апертуру';
}

function updateHomeProgress() {
  const count = Object.keys(progress.completed).filter((key) => progress.completed[key]).length;
  els.progressLabel.textContent = `${count} / ${LEVELS.length} завершено`;
  els.continueButton.textContent = count === 0 ? 'НАЧАТЬ НАБЛЮДЕНИЕ' : `ПРОДОЛЖИТЬ · ${pad(progress.current + 1)}`;
}

function buildLevelGrid() {
  els.levelGrid.innerHTML = '';
  let lastChapter = 0;
  LEVELS.forEach((level, index) => {
    if (level.chapter !== lastChapter) {
      lastChapter = level.chapter;
      const chapter = chapterFor(level);
      const divider = document.createElement('div');
      divider.className = 'chapter-divider';
      divider.textContent = `${chapter.roman} · ${chapter.name}`;
      els.levelGrid.append(divider);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level-tile';
    button.disabled = index >= progress.unlocked;
    if (progress.completed[index]) button.classList.add('is-complete');
    const best = progress.best[index];
    button.innerHTML = `<strong>${pad(index + 1)}</strong><span>${best ? `ЛУЧШЕЕ ${pad(best)}` : level.name}</span>`;
    button.addEventListener('click', () => loadLevel(index));
    els.levelGrid.append(button);
  });
}

function openScreen(screen) {
  closeAllScreens();
  screen.hidden = false;
}

function closeAllScreens() {
  els.home.hidden = true;
  els.levels.hidden = true;
  els.settings.hidden = true;
  els.complete.hidden = true;
}

function isScreenOpen() {
  return !els.home.hidden || !els.levels.hidden || !els.settings.hidden || !els.complete.hidden;
}

function openHome() {
  updateHomeProgress();
  els.home.hidden = false;
}

function toggleSetting(key, button) {
  progress[key] = !progress[key];
  button.setAttribute('aria-pressed', String(progress[key]));
  saveProgress();
  if (key === 'sound' && progress.sound) sound('move');
  if (key === 'haptics' && progress.haptics) haptic(12);
}

function syncSettingsUI() {
  els.soundToggle.setAttribute('aria-pressed', String(progress.sound));
  els.hapticsToggle.setAttribute('aria-pressed', String(progress.haptics));
}

