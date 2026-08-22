import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:kvarta:state:v1';
const SIZE = 4;
const TILE_COUNT = SIZE * SIZE;
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const CHAPTERS = [
  { name: 'I · ПРИВОДКА', range: [0, 4] },
  { name: 'II · СМЕЩЕНИЕ', range: [5, 9] },
  { name: 'III · ПЕРЕКРЫТИЕ', range: [10, 14] },
  { name: 'IV · ТИРАЖ', range: [15, 19] }
];

const LEVELS = [
  ['ПЕРВАЯ ОСЬ', 1049, 1], ['СОСЕДНИЙ КВАРТЕТ', 1193, 2], ['ДВА ЦЕНТРА', 1229, 3], ['КРАЙ ЛИСТА', 1297, 4], ['ЧЕТЫРЕ КРАСКИ', 1361, 5],
  ['СБИТАЯ МЕТКА', 1453, 6], ['ВСТРЕЧНЫЙ ХОД', 1543, 7], ['СЕТКА', 1601, 8], ['КРЕСТ', 1699, 9], ['ЧУЖАЯ ОСЬ', 1759, 10],
  ['НАЛОЖЕНИЕ', 1877, 11], ['ВТОРОЙ ПРОГОН', 1999, 12], ['СЛЕПАЯ ЗОНА', 2081, 13], ['ОТРАЖЕНИЕ', 2179, 14], ['ПЛОТНАЯ ФОРМА', 2281, 15],
  ['ТИРАЖ 01', 2393, 16], ['ТИРАЖ 02', 2477, 17], ['ТИРАЖ 03', 2593, 18], ['ТИРАЖ 04', 2689, 19], ['МАСТЕР-ФОРМА', 2791, 20]
].map(([title, seed, turns], index) => ({ title, seed, turns, index }));

const els = {
  screens: [...document.querySelectorAll('.screen')],
  menu: document.querySelector('#menu-screen'),
  levels: document.querySelector('#levels-screen'),
  help: document.querySelector('#help-screen'),
  game: document.querySelector('#game-screen'),
  board: document.querySelector('#board'),
  pivots: document.querySelector('#pivot-layer'),
  proof: document.querySelector('#proof-image'),
  menuPoster: document.querySelector('#menu-poster'),
  continue: document.querySelector('#continue-button'),
  levelsButton: document.querySelector('#levels-button'),
  helpButton: document.querySelector('#help-button'),
  levelsBack: document.querySelector('#levels-back'),
  helpBack: document.querySelector('#help-back'),
  helpPlay: document.querySelector('#help-play'),
  chapterList: document.querySelector('#chapter-list'),
  levelKicker: document.querySelector('#level-kicker'),
  levelTitle: document.querySelector('#level-title'),
  moves: document.querySelector('#moves-count'),
  best: document.querySelector('#best-count'),
  hint: document.querySelector('#gesture-hint'),
  undo: document.querySelector('#undo-button'),
  reset: document.querySelector('#reset-button'),
  levelsFromGame: document.querySelector('#levels-from-game'),
  pause: document.querySelector('#pause-button'),
  pauseModal: document.querySelector('#pause-modal'),
  resume: document.querySelector('#resume-button'),
  pauseReset: document.querySelector('#pause-reset'),
  pauseLevels: document.querySelector('#pause-levels'),
  resetModal: document.querySelector('#reset-modal'),
  confirmReset: document.querySelector('#confirm-reset'),
  cancelReset: document.querySelector('#cancel-reset'),
  successModal: document.querySelector('#success-modal'),
  successCopy: document.querySelector('#success-copy'),
  next: document.querySelector('#next-button'),
  replay: document.querySelector('#replay-button'),
  successLevels: document.querySelector('#success-levels'),
  menuProgress: document.querySelector('#menu-progress'),
  menuBest: document.querySelector('#menu-best'),
  soundButtons: [...document.querySelectorAll('#menu-sound, #levels-sound, #game-sound')]
};

const defaultProfile = () => ({
  unlocked: 1,
  completed: Array(LEVELS.length).fill(false),
  best: Array(LEVELS.length).fill(null),
  sound: true,
  current: null,
  seenHelp: false
});

let profile = loadProfile();
let game = null;
let artCache = new Map();
let audioContext = null;
let pointerState = null;
let isAnimating = false;

function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return defaultProfile();
    const next = defaultProfile();
    next.unlocked = clampInteger(raw.unlocked, 1, LEVELS.length, 1);
    next.sound = raw.sound !== false;
    next.seenHelp = raw.seenHelp === true;
    if (Array.isArray(raw.completed)) {
      next.completed = next.completed.map((_, i) => raw.completed[i] === true);
    }
    if (Array.isArray(raw.best)) {
      next.best = next.best.map((_, i) => Number.isInteger(raw.best[i]) && raw.best[i] > 0 ? raw.best[i] : null);
    }
    if (raw.current && isValidCurrent(raw.current)) {
      next.current = {
        levelIndex: raw.current.levelIndex,
        board: [...raw.current.board],
        moves: raw.current.moves,
        history: raw.current.history.slice(-60).map((board) => [...board])
      };
    }
    const highestDone = next.completed.reduce((acc, done, i) => done ? i + 2 : acc, 1);
    next.unlocked = Math.min(LEVELS.length, Math.max(next.unlocked, highestDone));
    return next;
  } catch {
    return defaultProfile();
  }
}

function isValidCurrent(value) {
  return Number.isInteger(value.levelIndex)
    && value.levelIndex >= 0 && value.levelIndex < LEVELS.length
    && isPermutation(value.board)
    && Number.isInteger(value.moves) && value.moves >= 0
    && Array.isArray(value.history)
    && value.history.every(isPermutation);
}

function isPermutation(board) {
  if (!Array.isArray(board) || board.length !== TILE_COUNT) return false;
  const sorted = [...board].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index);
}

function clampInteger(value, min, max, fallback) {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* storage can be unavailable */ }
}

function solvedBoard() { return Array.from({ length: TILE_COUNT }, (_, i) => i); }
function isSolved(board) { return board.every((value, index) => value === index); }

function rotateBlock(board, pivot, dir = 1) {
  const row = Math.floor(pivot / 3);
  const col = pivot % 3;
  const a = row * SIZE + col;
  const b = a + 1;
  const c = a + SIZE + 1;
  const d = a + SIZE;
  const next = [...board];
  if (dir > 0) {
    next[b] = board[a];
    next[c] = board[b];
    next[d] = board[c];
    next[a] = board[d];
  } else {
    next[d] = board[a];
    next[c] = board[d];
    next[b] = board[c];
    next[a] = board[b];
  }
  return next;
}

function makeLevel(levelIndex) {
  const level = LEVELS[levelIndex];
  const board = solvedBoard();
  if (levelIndex === 0) {
    const scramble = [{ pivot: 4, dir: -1 }];
    return { board: rotateBlock(board, 4, -1), scramble };
  }
  const rng = mulberry32(level.seed);
  const scramble = [];
  let current = board;
  let previous = null;
  for (let i = 0; i < level.turns; i += 1) {
    let pivot;
    let dir;
    let guard = 0;
    do {
      pivot = Math.floor(rng() * 9);
      dir = rng() < 0.5 ? -1 : 1;
      guard += 1;
    } while (previous && previous.pivot === pivot && previous.dir === -dir && guard < 12);
    current = rotateBlock(current, pivot, dir);
    scramble.push({ pivot, dir });
    previous = { pivot, dir };
  }
  if (isSolved(current)) {
    current = rotateBlock(current, (levelIndex * 2 + 4) % 9, 1);
    scramble.push({ pivot: (levelIndex * 2 + 4) % 9, dir: 1 });
  }
  return { board: current, scramble };
}

function validateLevels() {
  return LEVELS.every((_, levelIndex) => {
    const generated = makeLevel(levelIndex);
    let board = [...generated.board];
    for (let i = generated.scramble.length - 1; i >= 0; i -= 1) {
      const move = generated.scramble[i];
      board = rotateBlock(board, move.pivot, -move.dir);
    }
    return isSolved(board);
  });
}

function mulberry32(seed) {
  return function rng() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildArtwork(levelIndex) {
  if (artCache.has(levelIndex)) return artCache.get(levelIndex);
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(LEVELS[levelIndex].seed * 17 + 73);
  ctx.fillStyle = '#f7eed9';
  ctx.fillRect(0, 0, 640, 640);

  ctx.globalAlpha = 0.96;
  ctx.fillStyle = '#f2cf52';
  const bandY = 80 + Math.floor(rng() * 320);
  ctx.save();
  ctx.translate(320, bandY);
  ctx.rotate((-0.28 + rng() * 0.56));
  ctx.fillRect(-430, -58, 860, 116);
  ctx.restore();

  ctx.fillStyle = '#86a8a0';
  const radius = 85 + Math.floor(rng() * 90);
  ctx.beginPath();
  ctx.arc(120 + rng() * 400, 120 + rng() * 400, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#17324a';
  ctx.lineWidth = 34;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(-40, 520 - rng() * 220);
  ctx.bezierCurveTo(170, 40 + rng() * 140, 430, 620 - rng() * 160, 700, 100 + rng() * 200);
  ctx.stroke();

  ctx.strokeStyle = '#ef5b3f';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(70, 80 + rng() * 430);
  ctx.lineTo(570, 90 + rng() * 430);
  ctx.stroke();

  for (let i = 0; i < 8; i += 1) {
    const x = 38 + rng() * 564;
    const y = 38 + rng() * 564;
    const r = 8 + rng() * 19;
    ctx.fillStyle = i % 2 ? '#17324a' : '#ef5b3f';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#17324a';
  for (let i = 0; i < 1600; i += 1) {
    const x = rng() * 640;
    const y = rng() * 640;
    const s = rng() * 1.7 + .35;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;

  const url = canvas.toDataURL('image/jpeg', 0.82);
  artCache.set(levelIndex, url);
  return url;
}

function showScreen(target) {
  closeModals();
  els.screens.forEach((screen) => {
    const active = screen === target;
    screen.hidden = !active;
    screen.classList.toggle('is-active', active);
  });
  if (target === els.menu) renderMenu();
  if (target === els.levels) renderLevels();
}

function renderMenu() {
  const done = profile.completed.filter(Boolean).length;
  els.menuProgress.textContent = done;
  els.continue.textContent = profile.current ? `Продолжить лист ${pad(profile.current.levelIndex + 1)}` : `Начать с листа ${pad(Math.min(profile.unlocked, LEVELS.length))}`;
  const bestIndex = profile.best.findIndex((value) => value !== null);
  if (bestIndex === -1) {
    els.menuBest.textContent = 'Лучший лист —';
  } else {
    const candidates = profile.best.map((value, index) => ({ value, index })).filter((x) => x.value !== null).sort((a, b) => a.value - b.value);
    els.menuBest.textContent = `Рекорд ${pad(candidates[0].index + 1)} · ${candidates[0].value} х.`;
  }
  updateSoundButtons();
  renderMenuPoster();
}

function renderMenuPoster() {
  const art = buildArtwork(Math.min(profile.unlocked - 1, LEVELS.length - 1));
  els.menuPoster.replaceChildren();
  for (let i = 0; i < TILE_COUNT; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'poster-cell';
    setTileBackground(cell, i, art);
    els.menuPoster.append(cell);
  }
}

function renderLevels() {
  els.chapterList.replaceChildren();
  CHAPTERS.forEach((chapter) => {
    const section = document.createElement('section');
    section.className = 'chapter';
    const done = profile.completed.slice(chapter.range[0], chapter.range[1] + 1).filter(Boolean).length;
    section.innerHTML = `<div class="chapter-title"><span>${chapter.name}</span><span>${done} / 5</span></div>`;
    const grid = document.createElement('div');
    grid.className = 'level-grid';
    for (let i = chapter.range[0]; i <= chapter.range[1]; i += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-button';
      button.disabled = i >= profile.unlocked;
      button.classList.toggle('is-complete', profile.completed[i]);
      button.classList.toggle('is-current', profile.current?.levelIndex === i);
      button.dataset.level = String(i);
      const best = profile.best[i] ? `${profile.best[i]} Х.` : (button.disabled ? 'ЗАКРЫТО' : `${LEVELS[i].turns} СДВ.`);
      button.innerHTML = `<strong>${pad(i + 1)}</strong><span>${LEVELS[i].title}</span><span>${best}</span>`;
      if (!button.disabled) button.addEventListener('click', () => startLevel(i, false));
      grid.append(button);
    }
    section.append(grid);
    els.chapterList.append(section);
  });
  updateSoundButtons();
}

function startLevel(levelIndex, resume = false) {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= profile.unlocked) return;
  let board;
  let moves = 0;
  let history = [];
  if (resume && profile.current?.levelIndex === levelIndex && isValidCurrent(profile.current)) {
    board = [...profile.current.board];
    moves = profile.current.moves;
    history = profile.current.history.map((item) => [...item]);
  } else {
    board = makeLevel(levelIndex).board;
  }
  game = { levelIndex, board, moves, history, initialBoard: makeLevel(levelIndex).board };
  profile.current = serializeCurrentGame();
  saveProfile();
  showScreen(els.game);
  renderGame();
}

function serializeCurrentGame() {
  if (!game) return null;
  return {
    levelIndex: game.levelIndex,
    board: [...game.board],
    moves: game.moves,
    history: game.history.slice(-60).map((item) => [...item])
  };
}

function renderGame() {
  if (!game) return;
  const level = LEVELS[game.levelIndex];
  const chapter = CHAPTERS.find((entry) => game.levelIndex >= entry.range[0] && game.levelIndex <= entry.range[1]);
  const art = buildArtwork(game.levelIndex);
  els.levelKicker.textContent = `ЛИСТ ${pad(game.levelIndex + 1)} · ${chapter.name.split('·')[1].trim()}`;
  els.levelTitle.textContent = level.title;
  els.moves.textContent = game.moves;
  els.best.textContent = profile.best[game.levelIndex] ?? '—';
  els.undo.disabled = game.history.length === 0 || isAnimating;
  els.proof.style.backgroundImage = `url(${art})`;
  els.hint.textContent = game.levelIndex === 0 && game.moves === 0 ? 'Нажми центральную заклёпку' : 'Нажми или смахни по заклёпке';
  renderBoard();
  renderPivots();
  updateSoundButtons();
}

function renderBoard() {
  const art = buildArtwork(game.levelIndex);
  els.board.replaceChildren();
  game.board.forEach((tileId, position) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.tile = String(tileId);
    tile.dataset.position = String(position);
    setTileBackground(tile, tileId, art);
    els.board.append(tile);
  });
}

function setTileBackground(element, tileId, art) {
  const row = Math.floor(tileId / SIZE);
  const col = tileId % SIZE;
  element.style.backgroundImage = `url(${art})`;
  element.style.backgroundPosition = `${(col / (SIZE - 1)) * 100}% ${(row / (SIZE - 1)) * 100}%`;
}

function renderPivots() {
  if (els.pivots.childElementCount === 9) return;
  els.pivots.replaceChildren();
  for (let i = 0; i < 9; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pivot';
    button.dataset.pivot = String(i);
    button.style.left = `${(col + 1) * 25}%`;
    button.style.top = `${(row + 1) * 25}%`;
    button.setAttribute('aria-label', `Повернуть квартет ${row + 1}, ${col + 1}`);
    button.addEventListener('pointerdown', onPivotDown);
    button.addEventListener('pointerup', onPivotUp);
    button.addEventListener('pointercancel', onPivotCancel);
    button.addEventListener('lostpointercapture', onPivotCancel);
    els.pivots.append(button);
  }
}

function onPivotDown(event) {
  if (isAnimating || !game) return;
  const button = event.currentTarget;
  button.setPointerCapture?.(event.pointerId);
  pointerState = {
    id: event.pointerId,
    pivot: Number(button.dataset.pivot),
    x: event.clientX,
    y: event.clientY,
    button
  };
  button.classList.add('is-pressed');
}

function onPivotUp(event) {
  if (!pointerState || pointerState.id !== event.pointerId) return;
  const { x, y, pivot, button } = pointerState;
  const dx = event.clientX - x;
  const dy = event.clientY - y;
  button.classList.remove('is-pressed');
  button.releasePointerCapture?.(event.pointerId);
  pointerState = null;
  const dominant = Math.abs(dx) > Math.abs(dy) ? dx : dy;
  const dir = Math.abs(dominant) < 15 ? 1 : (dominant > 0 ? 1 : -1);
  makeMove(pivot, dir, button);
}

function onPivotCancel(event) {
  if (!pointerState || pointerState.id !== event.pointerId) return;
  pointerState.button.classList.remove('is-pressed');
  pointerState = null;
}

async function makeMove(pivot, dir, button) {
  if (isAnimating || !game) return;
  isAnimating = true;
  game.history.push([...game.board]);
  if (game.history.length > 60) game.history.shift();
  const oldBoard = [...game.board];
  game.board = rotateBlock(game.board, pivot, dir);
  game.moves += 1;
  profile.current = serializeCurrentGame();
  saveProfile();
  playTick(dir);
  vibrate(8);
  button?.classList.add(dir > 0 ? 'is-cw' : 'is-ccw');
  setTimeout(() => button?.classList.remove('is-cw', 'is-ccw'), 230);
  renderBoard();
  animateChangedTiles(oldBoard, game.board);
  els.moves.textContent = game.moves;
  els.undo.disabled = false;
  await delay(REDUCED_MOTION ? 0 : 190);
  isAnimating = false;
  els.undo.disabled = game.history.length === 0;
  if (isSolved(game.board)) completeLevel();
}

function animateChangedTiles(oldBoard, newBoard) {
  if (REDUCED_MOTION) return;
  const tiles = [...els.board.querySelectorAll('.tile')];
  const rects = tiles.map((tile) => tile.getBoundingClientRect());
  const byId = new Map(tiles.map((tile, index) => [Number(tile.dataset.tile), { tile, index, rect: rects[index] }]));
  oldBoard.forEach((tileId, oldIndex) => {
    const entry = byId.get(tileId);
    if (!entry || entry.index === oldIndex) return;
    const oldRow = Math.floor(oldIndex / SIZE);
    const oldCol = oldIndex % SIZE;
    const newRow = Math.floor(entry.index / SIZE);
    const newCol = entry.index % SIZE;
    const stepX = rects.length > 1 ? rects[1].left - rects[0].left : entry.rect.width;
    const stepY = rects.length > SIZE ? rects[SIZE].top - rects[0].top : entry.rect.height;
    entry.tile.animate([
      { transform: `translate(${(oldCol - newCol) * stepX}px, ${(oldRow - newRow) * stepY}px) scale(1.035)`, zIndex: 2 },
      { transform: 'translate(0, 0) scale(1)', zIndex: 1 }
    ], { duration: 180, easing: 'cubic-bezier(.2,.8,.25,1)' });
  });
}

function undoMove() {
  if (!game || isAnimating || game.history.length === 0) return;
  game.board = game.history.pop();
  game.moves = Math.max(0, game.moves - 1);
  profile.current = serializeCurrentGame();
  saveProfile();
  playTick(-1, true);
  renderGame();
}

function requestReset() {
  if (!game) return;
  els.resetModal.hidden = false;
}

function resetCurrent() {
  if (!game) return;
  game.board = [...game.initialBoard];
  game.moves = 0;
  game.history = [];
  profile.current = serializeCurrentGame();
  saveProfile();
  closeModals();
  renderGame();
  playReset();
}

function completeLevel() {
  const levelIndex = game.levelIndex;
  const previousBest = profile.best[levelIndex];
  const isRecord = previousBest === null || game.moves < previousBest;
  profile.completed[levelIndex] = true;
  profile.best[levelIndex] = previousBest === null ? game.moves : Math.min(previousBest, game.moves);
  profile.unlocked = Math.max(profile.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  profile.current = null;
  saveProfile();
  playSuccess();
  vibrate([14, 34, 18]);
  els.successCopy.textContent = `${game.moves} ${movesWord(game.moves)}${isRecord ? ' · новый рекорд' : ` · рекорд ${profile.best[levelIndex]}`}`;
  els.next.textContent = levelIndex === LEVELS.length - 1 ? 'Собрать мастер-форму ещё раз' : `Следующий лист · ${pad(levelIndex + 2)}`;
  setTimeout(() => { els.successModal.hidden = false; }, REDUCED_MOTION ? 0 : 160);
}

function goNext() {
  const index = game?.levelIndex ?? 0;
  closeModals();
  startLevel(index === LEVELS.length - 1 ? index : index + 1, false);
}

function openPause() { if (game) els.pauseModal.hidden = false; }
function closeModals() { [els.pauseModal, els.successModal, els.resetModal].forEach((modal) => { modal.hidden = true; }); }

function openLevelsFromGame() {
  if (game && !isSolved(game.board)) {
    profile.current = serializeCurrentGame();
    saveProfile();
  }
  showScreen(els.levels);
}

function updateSoundButtons() {
  els.soundButtons.forEach((button) => { button.textContent = `Звук: ${profile.sound ? 'вкл' : 'выкл'}`; });
}

function toggleSound() {
  profile.sound = !profile.sound;
  saveProfile();
  if (profile.sound) playTick(1, true);
  updateSoundButtons();
}

function ensureAudio() {
  if (!profile.sound) return null;
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(frequency, duration, gain = 0.035, when = 0, type = 'triangle') {
  const ctx = ensureAudio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const amp = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + when);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + when + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
  oscillator.connect(amp).connect(ctx.destination);
  oscillator.start(ctx.currentTime + when);
  oscillator.stop(ctx.currentTime + when + duration + 0.02);
}

function playTick(dir = 1, quiet = false) { if (profile.sound) tone(dir > 0 ? 330 : 294, .07, quiet ? .015 : .028, 0, 'square'); }
function playReset() { if (profile.sound) { tone(260, .08, .02); tone(190, .1, .018, .06); } }
function playSuccess() { if (profile.sound) { tone(392, .13, .035); tone(494, .16, .03, .09); tone(659, .24, .03, .18); } }
function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch { /* optional */ } }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function pad(value) { return String(value).padStart(2, '0'); }
function movesWord(value) { const mod10 = value % 10; const mod100 = value % 100; if (mod10 === 1 && mod100 !== 11) return 'ход'; if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'хода'; return 'ходов'; }

els.continue.addEventListener('click', () => {
  if (profile.current) startLevel(profile.current.levelIndex, true);
  else startLevel(Math.min(profile.unlocked - 1, LEVELS.length - 1), false);
});
els.levelsButton.addEventListener('click', () => showScreen(els.levels));
els.helpButton.addEventListener('click', () => { profile.seenHelp = true; saveProfile(); showScreen(els.help); });
els.levelsBack.addEventListener('click', () => showScreen(els.menu));
els.helpBack.addEventListener('click', () => showScreen(els.menu));
els.helpPlay.addEventListener('click', () => startLevel(0, false));
els.undo.addEventListener('click', undoMove);
els.reset.addEventListener('click', requestReset);
els.levelsFromGame.addEventListener('click', openLevelsFromGame);
els.pause.addEventListener('click', openPause);
els.resume.addEventListener('click', closeModals);
els.pauseReset.addEventListener('click', () => { closeModals(); requestReset(); });
els.pauseLevels.addEventListener('click', openLevelsFromGame);
els.confirmReset.addEventListener('click', resetCurrent);
els.cancelReset.addEventListener('click', closeModals);
els.next.addEventListener('click', goNext);
els.replay.addEventListener('click', () => startLevel(game.levelIndex, false));
els.successLevels.addEventListener('click', () => showScreen(els.levels));
els.soundButtons.forEach((button) => button.addEventListener('click', toggleSound));

window.addEventListener('keydown', (event) => {
  if (els.game.hidden) return;
  if (event.key === 'Escape') {
    if (!els.pauseModal.hidden || !els.resetModal.hidden) closeModals(); else openPause();
  }
  if ((event.key === 'z' || event.key === 'Z') && (event.ctrlKey || event.metaKey || !event.repeat)) undoMove();
});

window.addEventListener('pagehide', () => {
  if (game && !isSolved(game.board)) profile.current = serializeCurrentGame();
  saveProfile();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !isSolved(game.board)) {
    profile.current = serializeCurrentGame();
    saveProfile();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
}

if (!validateLevels()) {
  console.error('КВАРТА: level validation failed');
  els.continue.disabled = true;
  els.continue.textContent = 'Ошибка каталога уровней';
} else {
  renderMenu();
}
