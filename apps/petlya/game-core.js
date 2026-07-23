const { installMobileRuntime, createWorkshopMode, watchConnectivity, CHAPTERS, LEVELS, MOVES, parseLevel, isEchoOnlyPlate } = globalThis.__PETLYA_DEPS__;
installMobileRuntime();

const STORAGE_KEY = 'pocket-works:petlya:state:v1';
const VALID_MOVE = /^[UDLRW]*$/;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const parsedLevels = LEVELS.map(parseLevel);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dom = {
  shell: $('#app-shell'), menu: $('#menu-screen'), archive: $('#archive-screen'), game: $('#game-screen'),
  continue: $('#continue-button'), continueLabel: $('#continue-label'), archiveButton: $('#archive-button'), helpButton: $('#help-button'),
  menuProgress: $('#menu-progress'), menuChapter: $('#menu-chapter'), archiveBack: $('#archive-back'), archiveSummary: $('#archive-summary'), chapterList: $('#chapter-list'),
  pause: $('#pause-button'), levelKicker: $('#level-kicker'), levelTitle: $('#level-title'), beat: $('#beat-label'), echo: $('#echo-label'), seals: $('#seal-status'),
  stage: $('#board-stage'), board: $('#board'), cells: $('#cell-layer'), actors: $('#actor-layer'), trails: $('#trail-layer'), feedback: $('#board-feedback'),
  hint: $('#hint-copy'), timeline: $('#timeline'), undo: $('#undo-button'), eraseEcho: $('#erase-echo-button'), record: $('#record-button'),
  pauseSheet: $('#pause-sheet'), resume: $('#resume-button'), restart: $('#restart-button'), pauseArchive: $('#pause-archive-button'), pauseHelp: $('#pause-help-button'),
  helpSheet: $('#help-sheet'), helpClose: $('#help-close'), winSheet: $('#win-sheet'), winTitle: $('#win-title'), winCopy: $('#win-copy'), winStamp: $('#win-stamp'),
  winRecordings: $('#win-recordings'), winPar: $('#win-par'), winBest: $('#win-best'), next: $('#next-button'), replay: $('#replay-button'), winArchive: $('#win-archive-button'),
  confirmSheet: $('#confirm-sheet'), confirmTitle: $('#confirm-title'), confirmCopy: $('#confirm-copy'), confirmAccept: $('#confirm-accept'), confirmCancel: $('#confirm-cancel'),
  fatal: $('#fatal-error'), network: $('#network-label')
};

if (Object.values(dom).some((node) => !node)) {
  document.getElementById('fatal-error')?.removeAttribute('hidden');
  throw new Error('PETLYA DOM contract is incomplete');
}

let state = loadState();
let currentIndex = resolveSessionIndex();
let currentLevel = parsedLevels[currentIndex];
let currentSimulation = null;
let activeScreen = 'menu';
let confirmAction = null;
let lastResult = null;
let audioContext = null;
let feedbackTimer = 0;
let busy = false;
let gesture = null;

function defaultState() {
  return {
    sound: true,
    unlocked: 1,
    currentLevel: 0,
    completed: {},
    session: null
  };
}

function clampInt(value, min, max, fallback = min) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function cleanRoute(value, max) {
  return typeof value === 'string' && VALID_MOVE.test(value) ? value.slice(0, max) : '';
}

function sanitizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const index = LEVELS.findIndex((level) => level.id === raw.levelId);
  if (index < 0) return null;
  const level = LEVELS[index];
  const echoes = Array.isArray(raw.echoes)
    ? raw.echoes.slice(0, level.maxEchoes).map((route) => cleanRoute(route, level.loop)).filter(Boolean)
    : [];
  return {
    levelId: level.id,
    echoes,
    current: cleanRoute(raw.current, level.loop),
    recordings: clampInt(raw.recordings, echoes.length, 99, echoes.length)
  };
}

function loadState() {
  const fallback = defaultState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    const completed = {};
    if (raw.completed && typeof raw.completed === 'object') {
      for (const level of LEVELS) {
        const best = Number(raw.completed[level.id]?.best);
        if (Number.isFinite(best) && best >= 0) completed[level.id] = { best: Math.round(best) };
      }
    }
    return {
      sound: raw.sound !== false,
      unlocked: clampInt(raw.unlocked, 1, LEVELS.length, 1),
      currentLevel: clampInt(raw.currentLevel, 0, LEVELS.length - 1, 0),
      completed,
      session: sanitizeSession(raw.session)
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showFeedback('Сохранение недоступно', 'bad');
    console.warn('PETLYA state save failed', error);
  }
}

function resolveSessionIndex() {
  if (state.session) {
    const index = LEVELS.findIndex((level) => level.id === state.session.levelId);
    if (index >= 0) return index;
  }
  return state.currentLevel;
}

function ensureSession(index = currentIndex, reset = false) {
  const level = LEVELS[index];
  if (reset || !state.session || state.session.levelId !== level.id) {
    state.session = { levelId: level.id, echoes: [], current: '', recordings: 0 };
  }
  currentIndex = index;
  currentLevel = parsedLevels[index];
  state.currentLevel = index;
  saveState();
}

function samePosition(a, b) {
  return a.x === b.x && a.y === b.y;
}

function tileAt(level, position) {
  return level.map[position.y]?.[position.x] || '#';
}

function plateActive(level, actors, key) {
  return (level.plates.get(key) || []).some((plate) => actors.some((actor) =>
    samePosition(actor.position, plate) && (!isEchoOnlyPlate(key) || actor.echo)
  ));
}

function getGateState(level, actors) {
  return new Map([...level.gates.keys()].map((key) => [key, plateActive(level, actors, key)]));
}

function simulate(level, echoes, currentRoute) {
  const actors = [
    ...echoes.map((route, index) => ({ echo: true, index, route, position: { ...level.start }, trail: [{ ...level.start }] })),
    { echo: false, index: echoes.length, route: currentRoute, position: { ...level.start }, trail: [{ ...level.start }] }
  ];
  let success = false;
  let successStep = 0;

  for (let step = 0; step < currentRoute.length; step += 1) {
    const gateState = getGateState(level, actors);
    for (const actor of actors) {
      const code = actor.route[step] || 'W';
      const move = MOVES[code] || MOVES.W;
      const next = { x: actor.position.x + move.dx, y: actor.position.y + move.dy };
      const tile = tileAt(level, next);
      const gateBlocked = /[ABCUVW]/.test(tile) && !gateState.get(tile.toLowerCase());
      if (tile !== '#' && !gateBlocked) actor.position = next;
      actor.trail.push({ ...actor.position });
    }
    const current = actors.at(-1);
    const requiredActive = level.required.every((key) => plateActive(level, actors, key));
    if (samePosition(current.position, level.exit) && requiredActive) {
      success = true;
      successStep = step + 1;
      break;
    }
  }

  const gates = getGateState(level, actors);
  const active = new Map(level.required.map((key) => [key, plateActive(level, actors, key)]));
  return { actors, gates, active, success, successStep, current: actors.at(-1) };
}

function canCurrentMove(code) {
  if (code === 'W') return true;
  const move = MOVES[code];
  const next = {
    x: currentSimulation.current.position.x + move.dx,
    y: currentSimulation.current.position.y + move.dy
  };
  const tile = tileAt(currentLevel, next);
  if (tile === '#') return false;
  if (/[ABCUVW]/.test(tile) && !currentSimulation.gates.get(tile.toLowerCase())) return false;
  return true;
}

function showScreen(name) {
  activeScreen = name;
  const screens = { menu: dom.menu, archive: dom.archive, game: dom.game };
  for (const [key, screen] of Object.entries(screens)) {
    const active = key === name;
    screen.hidden = !active;
    screen.classList.toggle('is-active', active);
  }
  closeSheets();
  if (name === 'menu') renderMenu();
  if (name === 'archive') renderArchive();
  if (name === 'game') renderGame(true);
}

function showSheet(sheet) {
  closeSheets();
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('is-open'));
}

function closeSheets() {
  for (const sheet of $$('.sheet')) {
    sheet.classList.remove('is-open');
    sheet.hidden = true;
  }
  confirmAction = null;
}

function openConfirm(title, copy, action, acceptLabel = 'Стереть') {
  dom.confirmTitle.textContent = title;
  dom.confirmCopy.textContent = copy;
  dom.confirmAccept.textContent = acceptLabel;
  showSheet(dom.confirmSheet);
  confirmAction = action;
}

function startLevel(index, reset = false) {
  const launch = () => {
    ensureSession(index, reset);
    showScreen('game');
    playChord([190, 238], 0.06);
  };
  if (state.session && state.session.levelId !== LEVELS[index].id && (state.session.echoes.length || state.session.current)) {
    openConfirm('СМЕНИТЬ КАМЕРУ?', 'Текущая незавершённая петля будет стёрта.', launch, 'Сменить');
  } else {
    launch();
  }
}

function renderMenu() {
  const completed = Object.keys(state.completed).length;
  const focusIndex = state.session ? LEVELS.findIndex((level) => level.id === state.session.levelId) : Math.min(state.unlocked - 1, LEVELS.length - 1);
  const chapter = CHAPTERS.find((item) => item.id === LEVELS[Math.max(0, focusIndex)].chapter) || CHAPTERS[0];
  dom.menuProgress.textContent = `${completed} / ${LEVELS.length}`;
  dom.menuChapter.textContent = `${chapter.number} · ${chapter.title}`;
  if (state.session) dom.continueLabel.textContent = 'ПРОДОЛЖИТЬ ПЕТЛЮ';
  else if (completed === LEVELS.length) dom.continueLabel.textContent = 'ПОВТОРИТЬ ФИНАЛ';
  else dom.continueLabel.textContent = completed ? 'СЛЕДУЮЩАЯ КАМЕРА' : 'НАЧАТЬ ЗАПИСЬ';
  syncSoundButtons();
}

function starCount(level, best) {
  if (!Number.isFinite(best)) return 0;
  if (best <= level.par) return 3;
  if (best <= level.par + 1) return 2;
  return 1;
}

function renderArchive() {
  const completedCount = Object.keys(state.completed).length;
  dom.archiveSummary.textContent = `${completedCount} из ${LEVELS.length}`;
  dom.chapterList.innerHTML = '';
  for (const chapter of CHAPTERS) {
    const section = document.createElement('section');
    section.className = 'chapter-section';
    const levels = LEVELS.map((level, index) => ({ level, index })).filter((item) => item.level.chapter === chapter.id);
    section.innerHTML = `
      <header class="chapter-heading">
        <span>${chapter.number}</span>
        <div><strong>${chapter.title}</strong><p>${chapter.copy}</p></div>
      </header>
      <div class="level-grid"></div>
    `;
    const grid = $('.level-grid', section);
    for (const { level, index } of levels) {
      const unlocked = index < state.unlocked;
      const best = state.completed[level.id]?.best;
      const stars = starCount(level, best);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `level-node${unlocked ? '' : ' is-locked'}${stars ? ' is-complete' : ''}`;
      button.disabled = !unlocked;
      button.dataset.index = String(index);
      button.setAttribute('data-native-press', '');
      button.innerHTML = `
        <span class="node-number">${level.id}</span>
        <strong>${unlocked ? level.title : 'ЗАПЕЧАТАНО'}</strong>
        <span class="node-stars" aria-label="${stars} из 3 меток">${stars ? '✦'.repeat(stars) + '·'.repeat(3 - stars) : unlocked ? '···' : '×××'}</span>
      `;
      button.addEventListener('click', () => startLevel(index, true));
      grid.append(button);
    }
    dom.chapterList.append(section);
  }
  syncSoundButtons();
}

function buildBoard() {
  dom.board.style.setProperty('--cols', currentLevel.cols);
  dom.board.style.setProperty('--rows', currentLevel.rows);
  dom.board.style.aspectRatio = `${currentLevel.cols} / ${currentLevel.rows}`;
  dom.cells.style.gridTemplateColumns = `repeat(${currentLevel.cols}, 1fr)`;
  dom.cells.innerHTML = '';
  for (const cell of currentLevel.cells) {
    const node = document.createElement('div');
    node.className = `cell ${cellClass(cell.type)}`;
    node.dataset.x = String(cell.x);
    node.dataset.y = String(cell.y);
    node.dataset.type = cell.type;
    if (/[abcuvw]/.test(cell.type)) {
      node.dataset.key = cell.type;
      node.innerHTML = `<span class="plate-core"></span>`;
    } else if (/[ABCUVW]/.test(cell.type)) {
      node.dataset.key = cell.type.toLowerCase();
      node.innerHTML = '<span class="gate-bars"></span>';
    } else if (cell.type === 'E') {
      node.innerHTML = '<span class="exit-ring"></span><span class="exit-notch"></span>';
    } else if (cell.type === '@') {
      node.innerHTML = '<span class="start-mark"></span>';
    }
    dom.cells.append(node);
  }
  dom.trails.setAttribute('viewBox', `0 0 ${currentLevel.cols} ${currentLevel.rows}`);
}

function cellClass(type) {
  if (type === '#') return 'wall';
  if (type === '@') return 'floor start';
  if (type === 'E') return 'floor exit';
  if (/[abc]/.test(type)) return `floor plate plate-${type}`;
  if (/[uvw]/.test(type)) return `floor plate ghost-plate plate-${type}`;
  if (/[ABC]/.test(type)) return `floor gate gate-${type.toLowerCase()}`;
  if (/[UVW]/.test(type)) return `floor gate ghost-gate gate-${type.toLowerCase()}`;
  return 'floor';
}

