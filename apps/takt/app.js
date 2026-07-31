import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createAudioFeedback } from '../../shared/capabilities/audio.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();

const STORAGE_NAMESPACE = 'pocket-works:takt';
const GRID_W = 9;
const GRID_H = 10;
const LOGICAL_W = 720;
const LOGICAL_H = 770;
const GRID_X = 72;
const GRID_Y = 56;
const CELL = 64;
const COMMAND_SLOTS = 4;

const store = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: {
    profile: {
      scrap: 0,
      lifetimeScrap: 0,
      bestScore: 0,
      totalRuns: 0,
      victories: 0,
      selectedFrame: 'scout',
      unlockedFrames: ['scout'],
      discoveredModules: [],
      missions: 0,
      tutorialSeen: false
    },
    run: null,
    lastRun: null,
    settings: { sound: true, haptics: true }
  }
});

const data = store.getAll();
data.profile ||= {};
data.settings ||= { sound: true, haptics: true };
data.profile.unlockedFrames ||= ['scout'];
data.profile.discoveredModules ||= [];
data.profile.selectedFrame ||= 'scout';
data.profile.tutorialSeen = Boolean(data.profile.tutorialSeen);
data.profile.totalRuns = Number.isFinite(data.profile.totalRuns) ? data.profile.totalRuns : 0;

const audio = createAudioFeedback({ enabled: data.settings.sound, volume: 0.14 });

const refs = {
  home: document.querySelector('#homeScreen'),
  map: document.querySelector('#mapScreen'),
  mission: document.querySelector('#missionScreen'),
  event: document.querySelector('#eventScreen'),
  reward: document.querySelector('#rewardScreen'),
  end: document.querySelector('#endScreen'),
  newRun: document.querySelector('#newRunButton'),
  continue: document.querySelector('#continueButton'),
  continueMeta: document.querySelector('#continueMeta'),
  sound: document.querySelector('#soundToggle'),
  rules: document.querySelector('#rulesButton'),
  frames: document.querySelector('#framesButton'),
  frameDialog: document.querySelector('#framesDialog'),
  frameCatalog: document.querySelector('#frameCatalog'),
  rulesDialog: document.querySelector('#rulesDialog'),
  bestScore: document.querySelector('#bestScore'),
  scrapTotal: document.querySelector('#scrapTotal'),
  runCount: document.querySelector('#runCount'),
  routeMap: document.querySelector('#routeMap'),
  mapDepth: document.querySelector('#mapDepth'),
  mapScrap: document.querySelector('#mapScrap'),
  mapFrame: document.querySelector('#mapFrame'),
  mapModules: document.querySelector('#mapModules'),
  missionEyebrow: document.querySelector('#missionEyebrow'),
  missionTitle: document.querySelector('#missionTitle'),
  missionRound: document.querySelector('#missionRound'),
  missionObjective: document.querySelector('#missionObjective'),
  missionObjectiveCount: document.querySelector('#missionObjectiveCount'),
  canvas: document.querySelector('#missionCanvas'),
  telemetry: document.querySelector('#telemetryCode'),
  missionStatus: document.querySelector('#missionStatus'),
  droneDock: document.querySelector('#droneDock'),
  timeline: document.querySelector('#timeline'),
  commandTray: document.querySelector('#commandTray'),
  clearProgram: document.querySelector('#clearProgramButton'),
  execute: document.querySelector('#executeButton'),
  tutorial: document.querySelector('#tutorialOverlay'),
  tutorialStepLabel: document.querySelector('#tutorialStepLabel'),
  tutorialTitle: document.querySelector('#tutorialTitle'),
  tutorialCopy: document.querySelector('#tutorialCopy'),
  tutorialProgress: document.querySelector('#tutorialProgress'),
  tutorialNext: document.querySelector('#tutorialNext'),
  tutorialSkip: document.querySelector('#tutorialSkip'),
  eventEyebrow: document.querySelector('#eventEyebrow'),
  eventTitle: document.querySelector('#eventTitle'),
  eventCopy: document.querySelector('#eventCopy'),
  eventOptions: document.querySelector('#eventOptions'),
  rewardTitle: document.querySelector('#rewardTitle'),
  rewardCopy: document.querySelector('#rewardCopy'),
  rewardOptions: document.querySelector('#rewardOptions'),
  endEyebrow: document.querySelector('#endEyebrow'),
  endTitle: document.querySelector('#endTitle'),
  endCopy: document.querySelector('#endCopy'),
  endStampNumber: document.querySelector('#endStampNumber'),
  endScore: document.querySelector('#endScore'),
  endScrap: document.querySelector('#endScrap'),
  endNodes: document.querySelector('#endNodes'),
  endModules: document.querySelector('#endModules'),
  endNewRun: document.querySelector('#endNewRunButton'),
  endHome: document.querySelector('#endHomeButton'),
  toast: document.querySelector('#toast')
};

const NODE_META = {
  combat: { label: 'BREACH', icon: '×', title: 'Точка разрыва' },
  salvage: { label: 'SCRAP', icon: '+', title: 'Тихий лом' },
  workshop: { label: 'FORGE', icon: '◇', title: 'Сухая мастерская' },
  anomaly: { label: 'VOID', icon: '?', title: 'Нулевая аномалия' },
  boss: { label: 'CORE', icon: '!', title: 'Главный реактор' }
};

const FRAME_DEFS = {
  scout: {
    name: 'SCOUT / L-1',
    sigil: 'L1',
    cost: 0,
    description: 'Сбалансированный корпус. Ничего не обещает — поэтому редко подводит.',
    bonus: 'Базовая конфигурация'
  },
  bulwark: {
    name: 'BULWARK / K-4',
    sigil: 'K4',
    cost: 150,
    description: 'Толстая броня стража и усиленная решётка импульса.',
    bonus: '+2 HP стражу, +1 щит от GUARD'
  },
  salvager: {
    name: 'SALVAGER / M-2',
    sigil: 'M2',
    cost: 240,
    description: 'Корпус, который слышит металл сквозь стены и не любит уходить с пустыми руками.',
    bonus: 'На 1 ядро меньше, HACK работает дальше'
  },
  relay: {
    name: 'RELAY / R-9',
    sigil: 'R9',
    cost: 390,
    description: 'Экспериментальная связка: программа начинается с заряженной защитой.',
    bonus: 'Все дроны получают 1 щит в начале миссии'
  }
};

const MODULE_DEFS = {
  'vector-core': { name: 'VECTOR CORE', sigil: '↗', description: 'MOVE достаёт на две клетки и всё ещё считает это одним тактом.', color: 'cyan' },
  'echo-loop': { name: 'ECHO LOOP', sigil: '∿', description: 'PULSE получает +1 урон. Повторять хороший импульс — не стыдно.', color: 'ember' },
  'shield-weave': { name: 'SHIELD WEAVE', sigil: '▱', description: 'GUARD даёт на один щит больше и не сгорает от пустого хода.', color: 'lime' },
  mender: { name: 'MENDER GEL', sigil: '+', description: 'REPAIR восстанавливает два HP вместо одного.', color: 'yellow' },
  maglock: { name: 'MAGLOCK', sigil: '◇', description: 'HACK действует на расстоянии двух клеток и тянет ядро через один зазор.', color: 'violet' },
  'ghost-step': { name: 'GHOST STEP', sigil: '∕', description: 'Скаут может пройти через одну аварийную клетку без урона.', color: 'cyan' },
  'surge-cell': { name: 'SURGE CELL', sigil: '⚡', description: 'Первый PULSE каждого раунда цепляет всех соседних угроз.', color: 'ember' },
  'cold-start': { name: 'COLD START', sigil: '04', description: 'Первый пустой слот ленты автоматически становится GUARD.', color: 'lime' }
};

const COMMAND_DEFS = [
  { id: 'move', label: 'MOVE', glyph: '↗', note: 'клетка' },
  { id: 'pulse', label: 'PULSE', glyph: '◎', note: 'удар' },
  { id: 'guard', label: 'GUARD', glyph: '▱', note: 'щит' },
  { id: 'repair', label: 'REPAIR', glyph: '+', note: 'HP' },
  { id: 'hack', label: 'HACK', glyph: '◇', note: 'ядро' }
];

const UNIT_DEFS = {
  scout: { name: 'SCOUT', sigil: 'S', color: '#79d4d3', maxHp: 3, power: 1 },
  hauler: { name: 'HAULER', sigil: 'H', color: '#f1c96a', maxHp: 4, power: 1 },
  warden: { name: 'WARDEN', sigil: 'W', color: '#e75843', maxHp: 5, power: 2 }
};

const TUTORIAL_STEPS = [
  {
    label: 'BOOT / 01',
    title: 'Четыре такта — один план.',
    copy: 'Станция уже дала тебе готовый сектор. Здесь ты не кликаешь в панике: сначала собираешь цепочку, потом смотришь, как она сталкивается с чужими намерениями.'
  },
  {
    label: 'BOOT / 02',
    title: 'Команда занимает один такт.',
    copy: 'Выбери дрон, слот ленты и команду. Для MOVE сначала нажми MOVE, затем клетку на поле. Остальные команды записываются одним тапом.'
  },
  {
    label: 'BOOT / 03',
    title: 'Красное уже предупредило.',
    copy: 'Красная линия — намерение угрозы. Забери ядро через HACK, выведи любого живого дрона в EXIT и только тогда запускай следующий красивый план.'
  }
];

const state = {
  screen: 'home',
  ui: {
    selectedUnit: 'scout',
    selectedSlot: 0,
    armedCommand: null,
    executing: false,
    tutorialOpen: false,
    tutorialStep: 0,
    newRunArmedUntil: 0,
    newRunTimer: 0
  }
};

let toastTimer = 0;
let animationFrame = 0;

function persist() {
  store.patch(data);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = value + 0x6D2B79F5 | 0;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  const cryptoSeed = globalThis.crypto?.getRandomValues?.(new Uint32Array(1))?.[0];
  return cryptoSeed || Math.floor(Math.random() * 0xFFFFFFFF);
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatNumber(value, width = 3) {
  return String(Math.max(0, Math.floor(value || 0))).padStart(width, '0');
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function showToast(message, duration = 1900) {
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { refs.toast.hidden = true; }, duration);
}

function haptic(pattern = 10) {
  if (data.settings.haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
}

function sound(name) {
  if (data.settings.sound) audio.play(name);
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function createRoute(seed) {
  const random = mulberry32(seed);
  const rows = [];
  const choices = ['combat', 'salvage', 'workshop', 'anomaly'];
  for (let row = 0; row < 9; row += 1) {
    const rowNodes = [];
    for (let col = 0; col < 3; col += 1) {
      let type;
      if (row === 0) type = col === 1 ? 'combat' : pick(random, ['salvage', 'anomaly']);
      else if (row === 8) type = 'boss';
      else if (row % 3 === 2 && col === 1) type = 'workshop';
      else type = pick(random, choices);
      rowNodes.push({
        id: `n-${row}-${col}`,
        row,
        col,
        type,
        done: false,
        visited: false,
        title: NODE_META[type].title
      });
    }
    rows.push(rowNodes);
  }
  return rows;
}

function createRun(seed = randomSeed()) {
  return {
    seed,
    row: -1,
    col: 1,
    route: createRoute(seed),
    frame: data.profile.selectedFrame || 'scout',
    modules: [],
    scrap: 0,
    score: 0,
    completedNodes: 0,
    missions: 0,
    mission: null,
    event: null,
    rewardOptions: null,
    threatPlus: 0,
    tutorial: false,
    runNumber: (data.profile.totalRuns || 0) + 1
  };
}

function createTutorialRun() {
  const run = createRun(0x7a6b7c);
  const node = run.route[0][1];
  run.row = node.row;
  run.col = node.col;
  run.completedNodes = 1;
  run.currentNode = node.id;
  node.visited = true;
  run.tutorial = true;

  const mission = createMission(node, run);
  mission.title = 'Первый отклик';
  mission.required = 1;
  mission.maxRounds = 12;
  mission.cores = [{ x: 2, y: 8, active: true, index: 1 }];
  mission.obstacles = [{ x: 3, y: 7 }, { x: 3, y: 6 }, { x: 5, y: 5 }, { x: 5, y: 4 }];
  mission.hazards = [];
  mission.enemies = [{ id: 'e-tutorial', type: 'turret', x: 7, y: 3, hp: 1, maxHp: 1, alive: true, stunned: 0 }];
  mission.message = 'Обучение: выбери SCOUT и запиши первый MOVE.';
  run.mission = mission;
  return run;
}

function hasModule(id) {
  return Boolean(data.run?.modules?.includes(id));
}

function activeFrame() {
  return FRAME_DEFS[data.run?.frame || data.profile.selectedFrame || 'scout'] || FRAME_DEFS.scout;
}

function renderScreen() {
  const screenRefs = { home: refs.home, map: refs.map, mission: refs.mission, event: refs.event, reward: refs.reward, end: refs.end };
  for (const [name, element] of Object.entries(screenRefs)) element.hidden = state.screen !== name;
  if (state.screen === 'home') renderHome();
  if (state.screen === 'map') renderMap();
  if (state.screen === 'mission') renderMission();
  if (state.screen === 'event') renderEvent();
  if (state.screen === 'reward') renderReward();
  if (state.screen === 'end') renderEnd();
}

function goTo(screen) {
  state.screen = screen;
  renderScreen();
  if (screen !== 'mission') state.ui.armedCommand = null;
  if (screen === 'mission') startAnimationLoop();
  else stopAnimationLoop();
}

function renderTutorial() {
  const isOpen = state.ui.tutorialOpen && state.screen === 'mission';
  refs.tutorial.hidden = !isOpen;
  if (!isOpen) return;
  const step = TUTORIAL_STEPS[state.ui.tutorialStep] || TUTORIAL_STEPS[0];
  refs.tutorialStepLabel.textContent = step.label;
  refs.tutorialTitle.textContent = step.title;
  refs.tutorialCopy.textContent = step.copy;
  refs.tutorialProgress.replaceChildren();
  TUTORIAL_STEPS.forEach((_, index) => {
    const dot = document.createElement('i');
    dot.className = index === state.ui.tutorialStep ? 'is-current' : index < state.ui.tutorialStep ? 'is-done' : '';
    refs.tutorialProgress.append(dot);
  });
  refs.tutorialNext.querySelector('span').textContent = state.ui.tutorialStep === TUTORIAL_STEPS.length - 1 ? 'К ИГРЕ' : 'ДАЛЬШЕ';
}

function finishTutorial() {
  state.ui.tutorialOpen = false;
  data.profile.tutorialSeen = true;
  if (data.run) data.run.tutorial = false;
  persist();
  sound('success');
  haptic(14);
  renderTutorial();
}

function skipTutorial() {
  finishTutorial();
  showToast('Обучение отключено. Готовый сектор остаётся — можно сразу играть.');
}

function advanceTutorial() {
  if (!state.ui.tutorialOpen) return;
  if (state.ui.tutorialStep >= TUTORIAL_STEPS.length - 1) return finishTutorial();
  state.ui.tutorialStep += 1;
  sound('click');
  haptic(8);
  renderTutorial();
}

function bootstrapFirstLaunch() {
  if (data.run?.tutorial && !data.profile.tutorialSeen) {
    state.screen = 'mission';
    state.ui.tutorialOpen = true;
    return;
  }
  if (data.profile.tutorialSeen || data.run || data.profile.totalRuns > 0) return;
  data.run = createTutorialRun();
  state.screen = 'mission';
  state.ui.tutorialOpen = true;
  persist();
}

function renderHome() {
  const profile = data.profile;
  refs.bestScore.textContent = formatNumber(profile.bestScore, 4);
  refs.scrapTotal.textContent = formatNumber(profile.scrap, 3);
  refs.runCount.textContent = formatNumber(profile.totalRuns, 2);
  refs.continue.hidden = !data.run;
  if (data.run) {
    const label = data.run.mission ? `МИССИЯ · УЗЕЛ ${data.run.row + 1}` : `МАРШРУТ · УЗЕЛ ${Math.max(0, data.run.row + 1)}`;
    refs.continueMeta.textContent = label;
  }
  refs.newRun.textContent = '';
  const text = document.createElement('span');
  text.textContent = state.ui.newRunArmedUntil > Date.now() ? 'ЕЩЁ РАЗ — СБРОСИТЬ' : 'НОВЫЙ ЗАБЕГ';
  const arrow = document.createElement('b');
  arrow.textContent = '↗';
  refs.newRun.append(text, arrow);
  refs.newRun.dataset.armed = state.ui.newRunArmedUntil > Date.now() ? 'true' : 'false';
}

function renderMap() {
  const run = data.run;
  if (!run) return goTo('home');
  refs.mapDepth.textContent = String(Math.max(1, run.row + 2)).padStart(2, '0');
  refs.mapScrap.textContent = formatNumber(run.scrap, 2);
  refs.mapFrame.textContent = FRAME_DEFS[run.frame]?.name || 'SCOUT / L-1';
  refs.mapModules.textContent = run.modules.length ? run.modules.map((id) => MODULE_DEFS[id]?.name || id).join(' · ') : '—';
  refs.routeMap.replaceChildren();

  for (const row of run.route) {
    const rowElement = document.createElement('div');
    rowElement.className = 'route-row';
    for (const node of row) {
      const button = document.createElement('button');
      const unlocked = node.row === run.row + 1 && (run.row < 0 || Math.abs(node.col - run.col) <= 1);
      button.type = 'button';
      button.className = 'route-node';
      button.dataset.type = node.type;
      button.dataset.nodeId = node.id;
      button.disabled = !unlocked || node.done;
      if (node.done) button.classList.add('is-done');
      if (node.row === run.row && node.col === run.col) button.classList.add('is-current');
      const content = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = NODE_META[node.type].icon;
      const small = document.createElement('small');
      small.textContent = NODE_META[node.type].label;
      content.append(strong, small);
      button.append(content);
      rowElement.append(button);
    }
    refs.routeMap.append(rowElement);
  }
}

function getNode(nodeId) {
  return data.run?.route.flat().find((node) => node.id === nodeId) || null;
}

function canChooseNode(node) {
  const run = data.run;
  return Boolean(run && node && node.row === run.row + 1 && (run.row < 0 || Math.abs(node.col - run.col) <= 1) && !node.done);
}

function chooseNode(node) {
  if (!data.run || !canChooseNode(node) || state.ui.executing) return;
  const run = data.run;
  run.row = node.row;
  run.col = node.col;
  node.visited = true;
  run.completedNodes += 1;
  run.currentNode = node.id;
  persist();
  sound('click');
  haptic(12);

  if (node.type === 'combat' || node.type === 'boss') beginMission(node);
  else beginEvent(node);
}

function makeCellPool(random, mission, count, reserved = new Set()) {
  const candidates = [];
  for (let y = 1; y < GRID_H - 1; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      if (!reserved.has(keyOf(x, y))) candidates.push({ x, y });
    }
  }
  const result = [];
  while (candidates.length && result.length < count) {
    const index = Math.floor(random() * candidates.length);
    result.push(candidates.splice(index, 1)[0]);
  }
  return result;
}

function createMission(node, runOverride = data.run) {
  const run = runOverride;
  const random = mulberry32((run.seed ^ ((node.row + 11) * 99991) ^ ((node.col + 3) * 4723)) >>> 0);
  const frame = FRAME_DEFS[run.frame] || FRAME_DEFS.scout;
  const requiredBase = node.type === 'boss' ? 3 : 2 + Math.floor(node.row / 4);
  const required = run.frame === 'salvager' ? Math.max(1, requiredBase - 1) : requiredBase;
  const units = [
    { id: 'scout', x: 1, y: 8, hp: UNIT_DEFS.scout.maxHp, maxHp: UNIT_DEFS.scout.maxHp, shield: 0, alive: true },
    { id: 'hauler', x: 4, y: 9, hp: UNIT_DEFS.hauler.maxHp, maxHp: UNIT_DEFS.hauler.maxHp, shield: 0, alive: true },
    { id: 'warden', x: 7, y: 8, hp: UNIT_DEFS.warden.maxHp, maxHp: UNIT_DEFS.warden.maxHp, shield: 0, alive: true }
  ];
  if (run.frame === 'bulwark') {
    const warden = units.find((unit) => unit.id === 'warden');
    warden.maxHp += 2;
    warden.hp = warden.maxHp;
  }
  if (run.frame === 'relay') units.forEach((unit) => { unit.shield = 1; });

  const reserved = new Set([...units.map((unit) => keyOf(unit.x, unit.y)), keyOf(4, 0)]);
  const obstacleCount = 7 + Math.min(7, node.row) + (node.type === 'boss' ? 3 : 0);
  const obstacleCells = makeCellPool(random, null, obstacleCount, reserved);
  const obstacles = obstacleCells.filter((cell) => cell.y > 1);
  const coreReserved = new Set([...reserved, ...obstacles.map((cell) => keyOf(cell.x, cell.y))]);
  const coreCells = makeCellPool(random, null, required, coreReserved);
  const enemyReserved = new Set([...coreReserved, ...coreCells.map((cell) => keyOf(cell.x, cell.y))]);
  const threatBonus = clamp(Number(run.threatPlus) || 0, 0, 2);
  const baseEnemyCount = node.type === 'boss' ? 6 : node.type === 'salvage' ? 2 : 3 + Math.min(2, Math.floor(node.row / 3));
  const enemyCount = Math.min(8, baseEnemyCount + threatBonus);
  const enemyCells = makeCellPool(random, null, enemyCount, enemyReserved);
  const enemies = enemyCells.map((cell, index) => {
    const type = node.type === 'boss' && index % 3 === 0 ? 'turret' : index % 3 === 0 ? 'crawler' : index % 3 === 1 ? 'turret' : 'stalker';
    const maxHp = type === 'turret' ? (node.type === 'boss' ? 3 : 2) : type === 'stalker' ? 2 : 2;
    return { id: `e-${index}`, type, x: cell.x, y: cell.y, hp: maxHp, maxHp, alive: true, stunned: 0 };
  });
  const hazards = [];
  if (node.type === 'anomaly' || node.type === 'boss') {
    const hazardCells = makeCellPool(random, null, (node.type === 'boss' ? 5 : 3) + threatBonus, new Set([...enemyReserved, ...enemyCells.map((cell) => keyOf(cell.x, cell.y))]));
    hazardCells.forEach((cell, index) => hazards.push({ ...cell, phase: index % 2, active: index % 2 === 0 }));
  }

  return {
    nodeId: node.id,
    nodeType: node.type,
    title: node.title,
    seed: run.seed ^ node.row * 113,
    round: 1,
    maxRounds: node.type === 'boss' ? 10 : 8,
    beat: -1,
    required,
    collected: 0,
    score: 0,
    damageTaken: 0,
    obstacles,
    cores: coreCells.map((cell, index) => ({ ...cell, active: true, index: index + 1 })),
    exit: { x: 4, y: 0 },
    hazards,
    enemies,
    units,
    program: Array(COMMAND_SLOTS).fill(null),
    effects: [],
    status: 'planning',
    telemetry: `${String(run.seed).slice(-4)}-${String(node.row + 1).padStart(2, '0')}`,
    message: 'Собери четыре такта. Красные линии — чужие намерения.'
  };
}

function beginMission(node) {
  data.run.mission = createMission(node);
  data.run.threatPlus = 0;
  data.run.event = null;
  data.run.rewardOptions = null;
  state.ui.selectedUnit = 'scout';
  state.ui.selectedSlot = 0;
  state.ui.armedCommand = null;
  persist();
  goTo('mission');
}

function beginEvent(node) {
  data.run.event = { nodeId: node.id, type: node.type };
  data.run.mission = null;
  persist();
  goTo('event');
}

function activeMission() {
  return data.run?.mission || null;
}

function getUnit(unitId, mission = activeMission()) {
  return mission?.units.find((unit) => unit.id === unitId) || null;
}

function aliveUnits(mission) {
  return mission.units.filter((unit) => unit.alive);
}

function getEnemy(mission, enemyId) {
  return mission.enemies.find((enemy) => enemy.id === enemyId) || null;
}

function unitAt(mission, x, y) {
  return mission.units.find((unit) => unit.alive && unit.x === x && unit.y === y) || null;
}

function enemyAt(mission, x, y) {
  return mission.enemies.find((enemy) => enemy.alive && enemy.x === x && enemy.y === y) || null;
}

function obstacleAt(mission, x, y) {
  return mission.obstacles.some((cell) => cell.x === x && cell.y === y);
}

function hazardAt(mission, x, y) {
  return mission.hazards.find((cell) => cell.x === x && cell.y === y) || null;
}

function inBounds(x, y) {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

function canEnter(mission, unit, x, y) {
  if (!inBounds(x, y) || obstacleAt(mission, x, y) || unitAt(mission, x, y) || enemyAt(mission, x, y)) return false;
  const hazard = hazardAt(mission, x, y);
  if (hazard && unit.id !== 'scout' && !hasModule('ghost-step')) return false;
  return true;
}

function moveRange() {
  return hasModule('vector-core') ? 2 : 1;
}

function canMoveTo(mission, unit, targetX, targetY) {
  if (!unit?.alive || !canEnter(mission, unit, targetX, targetY)) return false;
  const range = moveRange();
  if (distance(unit, { x: targetX, y: targetY }) > range) return false;
  if (range < 2 || distance(unit, { x: targetX, y: targetY }) < 2) return true;
  const dx = Math.sign(targetX - unit.x);
  const dy = Math.sign(targetY - unit.y);
  if (dx !== 0 && dy !== 0) return false;
  return canEnter(mission, unit, unit.x + dx, unit.y + dy);
}

function commandForSlot(slot) {
  return activeMission()?.program?.[slot] || null;
}

function nextEmptySlot(start = state.ui.selectedSlot) {
  const mission = activeMission();
  if (!mission) return 0;
  for (let offset = 1; offset <= COMMAND_SLOTS; offset += 1) {
    const slot = (start + offset) % COMMAND_SLOTS;
    if (!mission.program[slot]) return slot;
  }
  return start;
}

function recordCommand(command) {
  const mission = activeMission();
  if (!mission || state.ui.executing) return;
  const unit = getUnit(command.unitId, mission);
  if (!unit?.alive) {
    showToast('Этот дрон уже не отвечает.');
    sound('error');
    return;
  }
  mission.program[state.ui.selectedSlot] = command;
  state.ui.selectedSlot = nextEmptySlot(state.ui.selectedSlot);
  state.ui.armedCommand = null;
  mission.message = `${UNIT_DEFS[unit.id].name}: ${command.type.toUpperCase()} записан в ленту.`;
  sound('click');
  haptic(8);
  persist();
  renderMission();
}

function armCommand(commandId) {
  const mission = activeMission();
  const unit = getUnit(state.ui.selectedUnit, mission);
  if (!mission || state.ui.executing || !unit?.alive) return;
  if (commandId === 'move') {
    state.ui.armedCommand = 'move';
    mission.message = `${UNIT_DEFS[unit.id].name}: выбери клетку в радиусе ${moveRange()}.`;
    sound('click');
    renderMission();
    return;
  }
  recordCommand({ type: commandId, unitId: unit.id });
}

function clearProgram() {
  const mission = activeMission();
  if (!mission || state.ui.executing) return;
  mission.program = Array(COMMAND_SLOTS).fill(null);
  state.ui.selectedSlot = 0;
  state.ui.armedCommand = null;
  mission.message = 'Лента очищена. Хороший план иногда начинается с нуля.';
  sound('error');
  haptic([8, 35, 8]);
  persist();
  renderMission();
}

function isLineClear(mission, from, to) {
  if (from.x === to.x) {
    const step = Math.sign(to.y - from.y);
    for (let y = from.y + step; y !== to.y; y += step) if (obstacleAt(mission, from.x, y)) return false;
    return true;
  }
  if (from.y === to.y) {
    const step = Math.sign(to.x - from.x);
    for (let x = from.x + step; x !== to.x; x += step) if (obstacleAt(mission, x, from.y)) return false;
    return true;
  }
  return false;
}

function nearestUnit(mission, origin, predicate = () => true) {
  return aliveUnits(mission).filter(predicate).sort((a, b) => distance(origin, a) - distance(origin, b))[0] || null;
}

function enemyIntent(mission, enemy) {
  if (!enemy.alive) return null;
  const target = nearestUnit(mission, enemy);
  if (!target) return null;
  if (enemy.type === 'turret') {
    if (enemy.x === target.x && isLineClear(mission, enemy, target)) return { type: 'fire', target };
    if (enemy.y === target.y && isLineClear(mission, enemy, target)) return { type: 'fire', target };
    return { type: 'watch', target };
  }
  const steps = enemy.type === 'stalker' ? 2 : 1;
  let x = enemy.x;
  let y = enemy.y;
  for (let step = 0; step < steps; step += 1) {
    const dx = Math.sign(target.x - x);
    const dy = Math.sign(target.y - y);
    const candidates = Math.abs(target.x - x) >= Math.abs(target.y - y) ? [{ x: x + dx, y }, { x, y: y + dy }] : [{ x, y: y + dy }, { x: x + dx, y }];
    const next = candidates.find((cell) => inBounds(cell.x, cell.y) && !obstacleAt(mission, cell.x, cell.y) && !enemyAt(mission, cell.x, cell.y));
    if (!next) break;
    x = next.x;
    y = next.y;
  }
  return { type: 'move', target, cell: { x, y } };
}

function addEffect(mission, x, y, color = '#c7f36b', kind = 'spark') {
  mission.effects.push({ x, y, color, kind, ttl: 1 });
}

function damageUnit(mission, unit, amount, reason = 'impact') {
  if (!unit?.alive) return;
  let remaining = amount;
  if (unit.shield > 0) {
    const blocked = Math.min(unit.shield, remaining);
    unit.shield -= blocked;
    remaining -= blocked;
    addEffect(mission, unit.x, unit.y, '#79d4d3', 'shield');
  }
  if (remaining > 0) {
    unit.hp -= remaining;
    mission.damageTaken += remaining;
    addEffect(mission, unit.x, unit.y, '#e75843', 'hit');
  }
  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.alive = false;
    addEffect(mission, unit.x, unit.y, '#e75843', 'break');
    mission.message = `${UNIT_DEFS[unit.id].name} потерян: ${reason}.`;
    sound('error');
    haptic([20, 45, 20]);
  }
}

function damageEnemy(mission, enemy, amount) {
  if (!enemy?.alive) return false;
  enemy.hp -= amount;
  addEffect(mission, enemy.x, enemy.y, '#c7f36b', 'hit');
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
    mission.score += enemy.type === 'turret' ? 85 : 60;
    addEffect(mission, enemy.x, enemy.y, '#c7f36b', 'break');
    sound('success');
    return true;
  }
  return false;
}

function collectCoreAt(mission, unit, range = 0) {
  const core = mission.cores.find((item) => item.active && distance(item, unit) <= range);
  if (!core) return false;
  core.active = false;
  mission.collected += 1;
  mission.score += 120;
  addEffect(mission, core.x, core.y, '#f1c96a', 'core');
  mission.message = `${UNIT_DEFS[unit.id].name} взломал ядро ${core.index}/${mission.required}.`;
  sound('success');
  haptic(18);
  return true;
}

function applyPlayerCommand(mission, command) {
  if (!command || command.type === 'wait') return;
  const unit = getUnit(command.unitId, mission);
  if (!unit?.alive) return;

  if (command.type === 'move') {
    if (canMoveTo(mission, unit, command.x, command.y)) {
      unit.x = command.x;
      unit.y = command.y;
      addEffect(mission, unit.x, unit.y, UNIT_DEFS[unit.id].color, 'step');
      if (hasModule('maglock')) collectCoreAt(mission, unit, 0);
    } else {
      mission.message = `${UNIT_DEFS[unit.id].name}: маршрут заблокирован.`;
      addEffect(mission, unit.x, unit.y, '#e75843', 'blocked');
      sound('error');
    }
    return;
  }

  if (command.type === 'pulse') {
    const nearby = mission.enemies.filter((enemy) => enemy.alive && distance(enemy, unit) <= 1);
    const power = UNIT_DEFS[unit.id].power + (hasModule('echo-loop') ? 1 : 0);
    const surge = hasModule('surge-cell') && mission.beat === 0;
    const targets = surge ? mission.enemies.filter((enemy) => enemy.alive && distance(enemy, unit) <= 1) : nearby;
    targets.forEach((enemy) => damageEnemy(mission, enemy, power));
    addEffect(mission, unit.x, unit.y, '#e75843', 'pulse');
    if (targets.length === 0) mission.message = `${UNIT_DEFS[unit.id].name}: импульс ушёл в пустоту.`;
    return;
  }

  if (command.type === 'guard') {
    const frameBonus = data.run?.frame === 'bulwark' ? 1 : 0;
    unit.shield = clamp(unit.shield + 2 + frameBonus + (hasModule('shield-weave') ? 1 : 0), 0, 5);
    addEffect(mission, unit.x, unit.y, '#79d4d3', 'shield');
    mission.message = `${UNIT_DEFS[unit.id].name}: щит поднят до ${unit.shield}.`;
    return;
  }

  if (command.type === 'repair') {
    const target = nearestUnit(mission, unit, (candidate) => candidate.hp < candidate.maxHp && distance(candidate, unit) <= 1) || (unit.hp < unit.maxHp ? unit : null);
    if (!target) {
      mission.message = 'REPAIR не нашёл повреждённую цель.';
      addEffect(mission, unit.x, unit.y, '#f1c96a', 'blocked');
      return;
    }
    const amount = hasModule('mender') ? 2 : 1;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    addEffect(mission, target.x, target.y, '#c7f36b', 'repair');
    mission.message = `${UNIT_DEFS[target.id].name}: +${amount} HP.`;
    return;
  }

  if (command.type === 'hack') {
    const range = (data.run.frame === 'salvager' ? 1 : 0) + (hasModule('maglock') ? 1 : 0);
    if (!collectCoreAt(mission, unit, range)) {
      mission.message = `${UNIT_DEFS[unit.id].name}: в радиусе нет ядра.`;
      addEffect(mission, unit.x, unit.y, '#bd9bf2', 'blocked');
    }
  }
}

function enemyTurn(mission) {
  for (const enemy of mission.enemies) {
    if (!enemy.alive || enemy.stunned > 0) {
      if (enemy.stunned > 0) enemy.stunned -= 1;
      continue;
    }
    const intent = enemyIntent(mission, enemy);
    if (!intent) continue;
    if (enemy.type === 'turret') {
      if (intent.type === 'fire') {
        damageUnit(mission, intent.target, mission.nodeType === 'boss' ? 2 : 1, 'огонь турели');
        addEffect(mission, intent.target.x, intent.target.y, '#e75843', 'beam');
      }
      continue;
    }
    if (intent.cell && unitAt(mission, intent.cell.x, intent.cell.y)) {
      const target = unitAt(mission, intent.cell.x, intent.cell.y);
      damageUnit(mission, target, enemy.type === 'stalker' ? 2 : 1, 'контакт');
      addEffect(mission, target.x, target.y, '#e75843', 'clash');
    } else if (intent.cell && !enemyAt(mission, intent.cell.x, intent.cell.y)) {
      enemy.x = intent.cell.x;
      enemy.y = intent.cell.y;
      addEffect(mission, enemy.x, enemy.y, '#e75843', 'enemy-step');
    }
  }
}

function resolveHazards(mission) {
  for (const hazard of mission.hazards) {
    hazard.active = (mission.round + hazard.phase) % 2 === 0;
    if (!hazard.active) continue;
    const unit = unitAt(mission, hazard.x, hazard.y);
    if (unit && !(unit.id === 'scout' && hasModule('ghost-step'))) damageUnit(mission, unit, 1, 'аварийное поле');
  }
}

function missionSucceeded(mission) {
  return mission.collected >= mission.required && aliveUnits(mission).some((unit) => unit.x === mission.exit.x && unit.y === mission.exit.y);
}

function missionFailed(mission) {
  return aliveUnits(mission).length === 0 || mission.round > mission.maxRounds;
}

function normalizeProgram(mission) {
  const program = mission.program.map((command) => command || { type: 'wait' });
  if (hasModule('cold-start')) {
    const firstEmpty = mission.program.findIndex((command) => !command);
    if (firstEmpty >= 0) program[firstEmpty] = { type: 'guard', unitId: state.ui.selectedUnit };
  }
  return program;
}

async function executeProgram() {
  const mission = activeMission();
  if (!mission || state.ui.executing) return;
  if (!aliveUnits(mission).length) return finishRun(false);
  state.ui.executing = true;
  state.ui.armedCommand = null;
  mission.status = 'executing';
  const program = normalizeProgram(mission);
  sound('click');
  haptic(15);
  for (let beat = 0; beat < COMMAND_SLOTS; beat += 1) {
    if (!data.run?.mission || state.screen !== 'mission') return;
    mission.beat = beat;
    applyPlayerCommand(mission, program[beat]);
    if (!missionSucceeded(mission)) enemyTurn(mission);
    resolveHazards(mission);
    mission.effects = mission.effects.filter((effect) => effect.ttl > 0).map((effect) => ({ ...effect, ttl: effect.ttl - .32 }));
    persist();
    renderMission();
    await sleep(300);
    if (missionSucceeded(mission) || missionFailed(mission)) break;
  }
  if (!data.run?.mission || state.screen !== 'mission') return;
  mission.round += 1;
  mission.beat = -1;
  mission.program = Array(COMMAND_SLOTS).fill(null);
  mission.status = 'planning';
  state.ui.selectedSlot = 0;
  state.ui.executing = false;
  if (missionSucceeded(mission)) return finishMission(true);
  if (missionFailed(mission)) return finishMission(false);
  mission.message = `Раунд ${mission.round}: красное снова двигается первым.`;
  persist();
  renderMission();
}

function finishMission(success) {
  const run = data.run;
  const mission = run?.mission;
  if (!run || !mission) return;
  state.ui.executing = false;
  if (!success) {
    run.score += Math.max(0, mission.score);
    run.mission = null;
    persist();
    sound('error');
    haptic([25, 50, 25]);
    return finishRun(false);
  }
  const node = getNode(mission.nodeId);
  if (node) node.done = true;
  run.score += mission.score + Math.max(0, 300 - mission.round * 18 - mission.damageTaken * 22);
  run.missions += 1;
  data.profile.missions = (data.profile.missions || 0) + 1;
  run.mission = null;
  run.rewardOptions = chooseRewardOptions();
  persist();
  sound('success');
  haptic([12, 45, 18]);
  goTo('reward');
}

function chooseRewardOptions() {
  const owned = new Set(data.run?.modules || []);
  let candidates = Object.keys(MODULE_DEFS).filter((id) => !owned.has(id));
  const random = mulberry32((data.run.seed ^ (data.run.row * 911)) >>> 0);
  candidates = candidates.sort(() => random() - .5);
  const options = candidates.slice(0, 3);
  if (!options.length) return ['scrap', 'repair-cache', 'score-chip'];
  while (options.length < 3) options.push('scrap');
  return options;
}

function resolveReward(id) {
  const run = data.run;
  if (!run || !run.rewardOptions) return;
  if (id === 'scrap') {
    run.scrap += 70;
    showToast('+70 лома. Не самый красивый модуль, зато честный.');
  } else if (id === 'repair-cache') {
    run.scrap += 35;
    run.repairAll = true;
    showToast('+35 лома. Дроны будут полностью отремонтированы.');
  } else if (id === 'score-chip') {
    run.score += 180;
    showToast('+180 очков за чистое исполнение.');
  } else if (MODULE_DEFS[id]) {
    run.modules.push(id);
    if (!data.profile.discoveredModules.includes(id)) data.profile.discoveredModules.push(id);
    showToast(`${MODULE_DEFS[id].name} добавлен в протокол.`);
  }
  const node = getNode(run.currentNode);
  if (node && node.type !== 'combat' && node.type !== 'boss') node.done = true;
  run.rewardOptions = null;
  persist();
  sound('success');
  haptic(20);
  if (run.row >= 8) return finishRun(true);
  goTo('map');
}

function eventChoices(event) {
  if (event.type === 'salvage') {
    return [
      { id: 'strip', title: 'Разобрать корпус', copy: '+70 лома. Станция услышит работу.', value: '+70', tone: 'risk' },
      { id: 'quiet', title: 'Тихий сбор', copy: '+28 лома и маленький ремонт всех дронов.', value: '+28', tone: 'safe' },
      { id: 'scan', title: 'Сканировать след', copy: 'Шанс найти модуль, но можно разбудить охрану.', value: 'RISK', tone: 'normal' }
    ];
  }
  if (event.type === 'workshop') {
    const options = chooseRewardOptions();
    return options.map((id) => {
      if (id === 'scrap') return { id, title: 'Снять редкий сплав', copy: '+85 лома. Оставить станок мёртвым.', value: '+85', tone: 'safe' };
      if (id === 'repair-cache') return { id, title: 'Перепрошить наноконтур', copy: '+35 лома и полный ремонт перед следующим сектором.', value: '+35 / FIX', tone: 'safe' };
      if (id === 'score-chip') return { id, title: 'Снять чистый отклик', copy: '+180 очков за точную работу станка.', value: '+180', tone: 'normal' };
      return { id, title: `Собрать ${MODULE_DEFS[id]?.name || 'модуль'}`, copy: MODULE_DEFS[id]?.description || 'Редкая деталь для следующего сектора.', value: 'INSTALL', tone: 'normal' };
    });
  }
  return [
    { id: 'listen', title: 'Послушать пустоту', copy: '+1 щит всем дронам в следующей миссии.', value: 'SHIELD', tone: 'safe' },
    { id: 'cut', title: 'Перерезать контур', copy: '+110 очков сейчас, но следующий сектор получит ещё одну угрозу.', value: '+110', tone: 'risk' },
    { id: 'touch', title: 'Коснуться ядра', copy: 'Получить случайный модуль ценой 20 лома.', value: 'MYSTERY', tone: 'normal' }
  ];
}

function resolveEvent(choiceId) {
  const run = data.run;
  const event = run?.event;
  if (!run || !event) return;
  if (event.type === 'salvage') {
    if (choiceId === 'strip') run.scrap += 70;
    if (choiceId === 'quiet') {
      run.scrap += 28;
      run.repairAll = true;
    }
    if (choiceId === 'scan') {
      if (Math.random() > .33) {
        const possible = Object.keys(MODULE_DEFS).find((id) => !run.modules.includes(id));
        if (possible) run.modules.push(possible);
        showToast(possible ? `${MODULE_DEFS[possible].name} найден в пыли.` : '+50 лома. Тут уже всё найдено.');
      } else {
        run.scrap += 12;
        showToast('Сканер заверещал. Удалось спасти только +12 лома.');
      }
    }
  } else if (event.type === 'workshop') {
    if (choiceId === 'scrap') run.scrap += 85;
    else if (choiceId === 'repair-cache') {
      run.scrap += 35;
      run.repairAll = true;
      showToast('+35 лома. Следующий сектор начнётся с полным ремонтом.');
    } else if (choiceId === 'score-chip') {
      run.score += 180;
      showToast('+180 очков за чистую работу.');
    }
    else if (MODULE_DEFS[choiceId] && !run.modules.includes(choiceId)) run.modules.push(choiceId);
  } else {
    if (choiceId === 'listen') run.startShield = (run.startShield || 0) + 1;
    if (choiceId === 'cut') {
      run.score += 110;
      run.threatPlus = Math.min(2, (run.threatPlus || 0) + 1);
      showToast('Контур перерезан: следующий сектор получил дополнительную угрозу.');
    }
    if (choiceId === 'touch') {
      run.scrap = Math.max(0, run.scrap - 20);
      const possible = Object.keys(MODULE_DEFS).find((id) => !run.modules.includes(id));
      if (possible) run.modules.push(possible);
    }
  }
  const node = getNode(event.nodeId);
  if (node) node.done = true;
  run.event = null;
  persist();
  sound('success');
  haptic(15);
  goTo('map');
}

function applyRunBonuses(mission) {
  const run = data.run;
  if (!run) return;
  if (run.startShield) mission.units.forEach((unit) => { unit.shield += run.startShield; });
  if (run.repairAll) mission.units.forEach((unit) => { unit.hp = unit.maxHp; });
  run.startShield = 0;
  run.repairAll = false;
}

function finishRun(victory) {
  const run = data.run;
  if (!run) return;
  const recovered = Math.max(0, Math.floor(run.scrap + (victory ? 80 : Math.max(10, run.scrap * .35))));
  const score = Math.max(0, Math.floor(run.score + (victory ? 500 : 0)));
  const lastRun = {
    victory,
    runNumber: run.runNumber,
    score,
    scrap: recovered,
    nodes: run.completedNodes,
    modules: run.modules.length,
    row: run.row
  };
  data.profile.totalRuns = (data.profile.totalRuns || 0) + 1;
  data.profile.scrap = (data.profile.scrap || 0) + recovered;
  data.profile.lifetimeScrap = (data.profile.lifetimeScrap || 0) + recovered;
  data.profile.bestScore = Math.max(data.profile.bestScore || 0, score);
  if (victory) data.profile.victories = (data.profile.victories || 0) + 1;
  data.lastRun = lastRun;
  data.run = null;
  state.ui.executing = false;
  persist();
  sound(victory ? 'success' : 'error');
  haptic(victory ? [14, 35, 14, 35, 22] : [30, 65, 30]);
  goTo('end');
}

function renderMission() {
  const mission = activeMission();
  if (!mission) return goTo('map');
  applyRunBonuses(mission);
  const run = data.run;
  refs.missionEyebrow.textContent = `SECTOR ${String(run.row + 1).padStart(2, '0')} / ${mission.nodeType.toUpperCase()}`;
  refs.missionTitle.textContent = mission.title;
  refs.missionRound.textContent = String(Math.min(mission.round, mission.maxRounds)).padStart(2, '0');
  refs.missionObjectiveCount.textContent = `${mission.collected} / ${mission.required}`;
  refs.missionObjective.textContent = mission.collected >= mission.required ? 'Ядра собраны. Дойди до шлюза.' : 'Взломать ядра и уйти через шлюз';
  refs.telemetry.textContent = `TKT-${mission.telemetry}`;
  refs.missionStatus.textContent = mission.message;
  renderDroneDock(mission);
  renderTimeline(mission);
  renderCommandTray(mission);
  renderTutorial();
  refs.clearProgram.disabled = state.ui.executing;
  refs.execute.disabled = state.ui.executing;
  drawMission();
}

function renderDroneDock(mission) {
  refs.droneDock.replaceChildren();
  for (const id of Object.keys(UNIT_DEFS)) {
    const unit = getUnit(id, mission);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `drone-card${state.ui.selectedUnit === id ? ' is-selected' : ''}${unit?.alive ? '' : ' is-dead'}`;
    button.dataset.unitId = id;
    button.disabled = !unit?.alive || state.ui.executing;
    const glyph = document.createElement('span');
    glyph.className = 'drone-glyph';
    glyph.textContent = UNIT_DEFS[id].sigil;
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = UNIT_DEFS[id].name;
    const stats = document.createElement('small');
    stats.textContent = unit?.alive ? `HP ${unit.hp}/${unit.maxHp} · SH ${unit.shield}` : 'NO SIGNAL';
    text.append(name, stats);
    button.append(glyph, text);
    refs.droneDock.append(button);
  }
}

function renderTimeline(mission) {
  refs.timeline.replaceChildren();
  mission.program.forEach((command, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `timeline-slot${state.ui.selectedSlot === index ? ' is-selected' : ''}${command ? ' is-filled' : ''}`;
    button.dataset.slot = String(index);
    const beat = document.createElement('b');
    beat.textContent = `0${index + 1}`;
    const content = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = command ? command.type.toUpperCase() : '—';
    const meta = document.createElement('small');
    if (command?.type === 'move') meta.textContent = `${UNIT_DEFS[command.unitId].sigil} · ${command.x},${command.y}`;
    else if (command) meta.textContent = `${UNIT_DEFS[command.unitId].sigil} · ${UNIT_DEFS[command.unitId].name}`;
    else meta.textContent = 'WAIT';
    content.append(title, meta);
    button.append(beat, content);
    refs.timeline.append(button);
  });
}

function renderCommandTray(mission) {
  refs.commandTray.replaceChildren();
  for (const command of COMMAND_DEFS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `command-card${state.ui.armedCommand === command.id ? ' is-armed' : ''}`;
    button.dataset.command = command.id;
    button.disabled = state.ui.executing;
    const glyph = document.createElement('strong');
    glyph.textContent = command.glyph;
    const label = document.createElement('span');
    label.textContent = command.label;
    const note = document.createElement('small');
    note.textContent = command.note;
    button.append(glyph, label, note);
    refs.commandTray.append(button);
  }
}

function renderEvent() {
  const event = data.run?.event;
  if (!event) return goTo('map');
  if (event.type === 'salvage') {
    refs.eventEyebrow.textContent = 'SCRAP / QUIET SIGNAL';
    refs.eventTitle.textContent = 'Старый корпус ещё дышит.';
    refs.eventCopy.textContent = 'В обломках есть полезный металл. Но каждый лишний звук притянет охрану из соседнего сектора.';
  } else if (event.type === 'workshop') {
    refs.eventEyebrow.textContent = 'FORGE / BEHAVIOUR PATCH';
    refs.eventTitle.textContent = 'Мастерская не задаёт вопросов.';
    refs.eventCopy.textContent = 'Здесь можно перепрошить один принцип отряда. Выбери то, что должно остаться с тобой после следующей аварии.';
  } else {
    refs.eventEyebrow.textContent = 'VOID / UNSTABLE';
    refs.eventTitle.textContent = 'Аномалия смотрит первой.';
    refs.eventCopy.textContent = 'Нулевой сектор не атакует — он предлагает сделку. Вопрос только в том, кто потом будет считать цену.';
  }
  refs.eventOptions.replaceChildren();
  for (const choice of eventChoices(event)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-card';
    button.dataset.choice = choice.id;
    button.dataset.choiceTone = choice.tone;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = choice.title;
    const copy = document.createElement('span');
    copy.textContent = choice.copy;
    text.append(title, copy);
    const value = document.createElement('b');
    value.textContent = choice.value;
    button.append(text, value);
    refs.eventOptions.append(button);
  }
}

function renderReward() {
  const run = data.run;
  if (!run?.rewardOptions) return goTo('map');
  refs.rewardTitle.innerHTML = run.row >= 8 ? 'Станция открыла<br><em>главный контур.</em>' : 'Станция запомнила<br><em>твой способ думать.</em>';
  refs.rewardCopy.textContent = run.row >= 8 ? 'Финальный узел пройден. Выбери последнее изменение и забери протокол домой.' : 'Выбери один модуль. Он меняет не цифры, а правила следующего сектора.';
  refs.rewardOptions.replaceChildren();
  run.rewardOptions.forEach((id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'module-card';
    button.dataset.reward = id;
    const sigil = document.createElement('span');
    sigil.className = 'module-sigil';
    const title = document.createElement('span');
    const name = document.createElement('strong');
    const copy = document.createElement('p');
    const arrow = document.createElement('b');
    arrow.textContent = '↗';
    if (MODULE_DEFS[id]) {
      sigil.textContent = MODULE_DEFS[id].sigil;
      name.textContent = MODULE_DEFS[id].name;
      copy.textContent = MODULE_DEFS[id].description;
    } else if (id === 'scrap') {
      sigil.textContent = '+70'; name.textContent = 'ПОЛЕВОЙ ЛОМ'; copy.textContent = 'Ничего не меняет. Зато можно купить корпус, который не развалится.';
    } else if (id === 'repair-cache') {
      sigil.textContent = '+35'; name.textContent = 'РЕМОНТНЫЙ КЕШ'; copy.textContent = '+35 лома и полный ремонт перед следующей миссией.';
    } else {
      sigil.textContent = '+180'; name.textContent = 'ЧИСТЫЙ ОТКЛИК'; copy.textContent = 'Дополнительные очки за красивую работу без нового железа.';
    }
    title.append(name, copy);
    button.append(sigil, title, arrow);
    refs.rewardOptions.append(button);
  });
}

function renderEnd() {
  const result = data.lastRun || { victory: false, runNumber: data.profile.totalRuns, score: 0, scrap: 0, nodes: 0, modules: 0, row: 0 };
  refs.endStampNumber.textContent = String(result.runNumber || 1).padStart(2, '0');
  refs.endScore.textContent = formatNumber(result.score, 4);
  refs.endScrap.textContent = formatNumber(result.scrap, 3);
  refs.endNodes.textContent = `${result.nodes} / 9`;
  refs.endModules.textContent = String(result.modules).padStart(2, '0');
  if (result.victory) {
    refs.endEyebrow.textContent = 'CORE STABLE / FULL RECOVERY';
    refs.endTitle.innerHTML = 'Экипаж<br><em>синхронизирован.</em>';
    refs.endCopy.textContent = 'Ты не победил станцию. Ты заставил её сыграть по твоей ленте.';
  } else {
    refs.endEyebrow.textContent = 'SIGNAL LOST / PARTIAL RECOVERY';
    refs.endTitle.innerHTML = 'Экипаж<br><em>не синхронизирован.</em>';
    refs.endCopy.textContent = 'Станция забрала своё. Но протокол стал умнее.';
  }
}

function renderFrameCatalog() {
  refs.frameCatalog.replaceChildren();
  for (const [id, frame] of Object.entries(FRAME_DEFS)) {
    const unlocked = data.profile.unlockedFrames.includes(id);
    const active = data.profile.selectedFrame === id;
    const row = document.createElement('div');
    row.className = `frame-row${active ? ' is-active' : ''}${unlocked ? '' : ' is-locked'}`;
    const sigil = document.createElement('i'); sigil.textContent = frame.sigil;
    const text = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = frame.name;
    const detail = document.createElement('small'); detail.textContent = `${frame.bonus} · ${frame.description}`;
    text.append(name, detail);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button'; button.dataset.frame = id;
    button.textContent = active ? 'ACTIVE' : unlocked ? 'SELECT' : `${frame.cost} SCRAP`;
    row.append(sigil, text, button);
    refs.frameCatalog.append(row);
  }
}

function startNewRun() {
  if (data.run) {
    if (state.ui.newRunArmedUntil > Date.now()) {
      window.clearTimeout(state.ui.newRunTimer);
      state.ui.newRunArmedUntil = 0;
      data.run = null;
      persist();
    } else {
      state.ui.newRunArmedUntil = Date.now() + 4200;
      state.ui.newRunTimer = window.setTimeout(() => { state.ui.newRunArmedUntil = 0; renderHome(); }, 4200);
      renderHome();
      showToast('Тапни ещё раз, чтобы стереть текущий забег.');
      return;
    }
  }
  data.run = createRun();
  persist();
  sound('click');
  haptic(18);
  goTo('map');
}

function continueRun() {
  if (!data.run) return startNewRun();
  if (data.run.mission) {
    state.ui.selectedUnit = data.run.mission.units.find((unit) => unit.alive)?.id || 'scout';
    goTo('mission');
  } else if (data.run.event) goTo('event');
  else if (data.run.rewardOptions) goTo('reward');
  else goTo('map');
}

function handleFrameSelection(id) {
  const frame = FRAME_DEFS[id];
  if (!frame) return;
  const unlocked = data.profile.unlockedFrames.includes(id);
  if (!unlocked) {
    if ((data.profile.scrap || 0) < frame.cost) {
      showToast(`Нужно ещё ${frame.cost - data.profile.scrap} лома.`);
      sound('error');
      return;
    }
    data.profile.scrap -= frame.cost;
    data.profile.unlockedFrames.push(id);
    showToast(`${frame.name} собран.`);
  }
  data.profile.selectedFrame = id;
  persist();
  renderFrameCatalog();
  renderHome();
  sound('success');
  haptic(16);
}

function handleBoardPointer(event) {
  const mission = activeMission();
  if (!mission || state.ui.executing) return;
  const rect = refs.canvas.getBoundingClientRect();
  const logicalX = ((event.clientX - rect.left) / rect.width) * LOGICAL_W;
  const logicalY = ((event.clientY - rect.top) / rect.height) * LOGICAL_H;
  const x = Math.floor((logicalX - GRID_X) / CELL);
  const y = Math.floor((logicalY - GRID_Y) / CELL);
  if (!inBounds(x, y)) return;
  const touchedUnit = unitAt(mission, x, y);
  if (touchedUnit) {
    state.ui.selectedUnit = touchedUnit.id;
    state.ui.armedCommand = null;
    mission.message = `${UNIT_DEFS[touchedUnit.id].name} выбран. Теперь выбери слот и команду.`;
    sound('click');
    haptic(7);
    renderMission();
    return;
  }
  if (state.ui.armedCommand === 'move') {
    const unit = getUnit(state.ui.selectedUnit, mission);
    if (!canMoveTo(mission, unit, x, y)) {
      mission.message = 'MOVE: клетка недоступна или слишком далеко.';
      sound('error');
      haptic([8, 30, 8]);
      renderMission();
      return;
    }
    recordCommand({ type: 'move', unitId: unit.id, x, y });
  }
}

function getBoardMetrics() {
  return { x: GRID_X, y: GRID_Y, cell: CELL };
}

function drawMission() {
  if (state.screen !== 'mission' || !activeMission()) return;
  const canvas = refs.canvas;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== LOGICAL_W * dpr || canvas.height !== LOGICAL_H * dpr) {
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
  const mission = activeMission();
  const now = performance.now() / 1000;
  const pulse = (Math.sin(now * 3.2) + 1) / 2;
  const { x: ox, y: oy, cell } = getBoardMetrics();

  ctx.fillStyle = '#0a1118'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.strokeStyle = 'rgba(121,212,211,.09)'; ctx.lineWidth = 1;
  for (let i = 0; i < 14; i += 1) { const y = 18 + i * 53; ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(702, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(199,243,107,.38)'; ctx.font = '9px ui-monospace, monospace'; ctx.fillText(`GRID / ${mission.nodeType.toUpperCase()}`, 18, 24);
  ctx.fillStyle = 'rgba(129,145,154,.6)'; ctx.fillText(`ROUND ${String(mission.round).padStart(2, '0')} · BEAT ${mission.beat < 0 ? '—' : mission.beat + 1}`, 515, 24);

  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      const px = ox + x * cell; const py = oy + y * cell;
      ctx.fillStyle = (x + y) % 2 ? 'rgba(26,39,51,.53)' : 'rgba(20,31,42,.72)';
      ctx.fillRect(px, py, cell - 1, cell - 1);
      ctx.strokeStyle = 'rgba(129,145,154,.12)'; ctx.strokeRect(px + .5, py + .5, cell - 1, cell - 1);
      if (x === 0) { ctx.fillStyle = 'rgba(129,145,154,.35)'; ctx.font = '8px ui-monospace, monospace'; ctx.fillText(String(y).padStart(2, '0'), px + 5, py + 13); }
    }
  }

  const exit = mission.exit;
  ctx.fillStyle = mission.collected >= mission.required ? 'rgba(199,243,107,.2)' : 'rgba(121,212,211,.1)';
  ctx.fillRect(ox + exit.x * cell + 5, oy + exit.y * cell + 5, cell - 10, cell - 10);
  ctx.strokeStyle = mission.collected >= mission.required ? '#c7f36b' : '#79d4d3'; ctx.lineWidth = 2; ctx.strokeRect(ox + exit.x * cell + 9, oy + exit.y * cell + 9, cell - 18, cell - 18);
  ctx.fillStyle = mission.collected >= mission.required ? '#c7f36b' : '#79d4d3'; ctx.font = '900 9px ui-monospace, monospace'; ctx.fillText('EXIT', ox + exit.x * cell + 19, oy + exit.y * cell + 37);

  for (const cellData of mission.obstacles) {
    const px = ox + cellData.x * cell; const py = oy + cellData.y * cell;
    ctx.fillStyle = '#263846'; ctx.fillRect(px + 6, py + 6, cell - 13, cell - 13);
    ctx.strokeStyle = 'rgba(121,212,211,.22)'; ctx.lineWidth = 1; ctx.strokeRect(px + 8, py + 8, cell - 17, cell - 17);
    ctx.strokeStyle = 'rgba(121,212,211,.17)'; ctx.beginPath(); ctx.moveTo(px + 12, py + cell - 12); ctx.lineTo(px + cell - 12, py + 12); ctx.stroke();
  }

  for (const hazard of mission.hazards) {
    const px = ox + hazard.x * cell; const py = oy + hazard.y * cell;
    ctx.fillStyle = hazard.active ? `rgba(231,88,67,${.14 + pulse * .1})` : 'rgba(231,88,67,.06)'; ctx.fillRect(px + 4, py + 4, cell - 9, cell - 9);
    ctx.strokeStyle = hazard.active ? 'rgba(231,88,67,.7)' : 'rgba(231,88,67,.24)'; ctx.setLineDash([5, 5]); ctx.strokeRect(px + 8, py + 8, cell - 17, cell - 17); ctx.setLineDash([]);
    ctx.fillStyle = hazard.active ? '#e75843' : 'rgba(231,88,67,.5)'; ctx.font = '900 18px ui-monospace, monospace'; ctx.fillText('!', px + 27, py + 39);
  }

  for (const core of mission.cores) {
    if (!core.active) continue;
    const cx = ox + core.x * cell + cell / 2; const cy = oy + core.y * cell + cell / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#f1c96a'; ctx.shadowColor = 'rgba(241,201,106,.55)'; ctx.shadowBlur = 8 + pulse * 6; ctx.fillRect(-12, -12, 24, 24); ctx.restore();
    ctx.fillStyle = '#0e151d'; ctx.font = '900 10px ui-monospace, monospace'; ctx.fillText(String(core.index), cx - 3, cy + 4);
  }

  for (const enemy of mission.enemies) {
    if (!enemy.alive) continue;
    const intent = enemyIntent(mission, enemy);
    const cx = ox + enemy.x * cell + cell / 2; const cy = oy + enemy.y * cell + cell / 2;
    if (intent?.type === 'fire') {
      ctx.strokeStyle = `rgba(231,88,67,${.3 + pulse * .28})`; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox + intent.target.x * cell + cell / 2, oy + intent.target.y * cell + cell / 2); ctx.stroke(); ctx.setLineDash([]);
    } else if (intent?.cell) {
      const tx = ox + intent.cell.x * cell + cell / 2; const ty = oy + intent.cell.y * cell + cell / 2;
      ctx.strokeStyle = 'rgba(231,88,67,.34)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = 'rgba(231,88,67,.5)'; ctx.beginPath(); ctx.moveTo(tx, ty - 7); ctx.lineTo(tx + 7, ty); ctx.lineTo(tx, ty + 7); ctx.lineTo(tx - 7, ty); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = enemy.type === 'turret' ? '#e75843' : '#9a5264';
    ctx.strokeStyle = '#0e151d'; ctx.lineWidth = 4;
    if (enemy.type === 'turret') { ctx.fillRect(cx - 16, cy - 16, 32, 32); ctx.strokeRect(cx - 16, cy - 16, 32, 32); }
    else { ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 17, cy); ctx.lineTo(cx, cy + 18); ctx.lineTo(cx - 17, cy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#0e151d'; ctx.font = '900 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(enemy.type === 'turret' ? 'T' : 'X', cx, cy + 4); ctx.textAlign = 'start';
    ctx.fillStyle = 'rgba(232,225,207,.62)'; ctx.font = '7px ui-monospace, monospace'; ctx.fillText(`${enemy.hp}`, cx - 3, cy + 29);
  }

  for (const unit of mission.units) {
    if (!unit.alive) continue;
    const cx = ox + unit.x * cell + cell / 2; const cy = oy + unit.y * cell + cell / 2;
    if (state.ui.selectedUnit === unit.id) { ctx.strokeStyle = '#c7f36b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 26 + pulse * 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = UNIT_DEFS[unit.id].color; ctx.shadowColor = UNIT_DEFS[unit.id].color; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#0e151d'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#0e151d'; ctx.font = '900 11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(UNIT_DEFS[unit.id].sigil, cx, cy + 4); ctx.textAlign = 'start';
    ctx.fillStyle = 'rgba(14,21,29,.76)'; ctx.fillRect(cx - 19, cy + 23, 38, 4); ctx.fillStyle = '#c7f36b'; ctx.fillRect(cx - 19, cy + 23, 38 * (unit.hp / unit.maxHp), 4);
    if (unit.shield > 0) { ctx.strokeStyle = '#79d4d3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 22, -Math.PI * .8, -Math.PI * .8 + Math.PI * 2 * Math.min(1, unit.shield / 5)); ctx.stroke(); }
  }

  if (state.ui.armedCommand === 'move') {
    const unit = getUnit(state.ui.selectedUnit, mission);
    if (unit?.alive) {
      for (let y = Math.max(0, unit.y - moveRange()); y <= Math.min(GRID_H - 1, unit.y + moveRange()); y += 1) {
        for (let x = Math.max(0, unit.x - moveRange()); x <= Math.min(GRID_W - 1, unit.x + moveRange()); x += 1) {
          if (!canMoveTo(mission, unit, x, y)) continue;
          const px = ox + x * cell; const py = oy + y * cell;
          ctx.strokeStyle = 'rgba(199,243,107,.75)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.strokeRect(px + 10, py + 10, cell - 21, cell - 21); ctx.setLineDash([]);
        }
      }
    }
  }

  for (const effect of mission.effects) {
    const cx = ox + effect.x * cell + cell / 2; const cy = oy + effect.y * cell + cell / 2;
    const size = 11 + (1 - Math.max(0, effect.ttl)) * 18;
    ctx.strokeStyle = effect.color; ctx.globalAlpha = Math.max(.12, effect.ttl); ctx.lineWidth = 2;
    if (effect.kind === 'beam') { ctx.beginPath(); ctx.moveTo(cx - size, cy - size); ctx.lineTo(cx + size, cy + size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + size, cy - size); ctx.lineTo(cx - size, cy + size); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(cx, cy, size, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
}

function startAnimationLoop() {
  if (animationFrame || document.hidden || state.screen !== 'mission' || !activeMission()) return;
  const frame = () => {
    animationFrame = 0;
    if (document.hidden || state.screen !== 'mission' || !activeMission()) return;
    drawMission();
    animationFrame = requestAnimationFrame(frame);
  };
  animationFrame = requestAnimationFrame(frame);
}

function stopAnimationLoop() {
  if (!animationFrame) return;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}

function updateSoundButton() {
  refs.sound.setAttribute('aria-pressed', String(data.settings.sound));
  refs.sound.setAttribute('aria-label', data.settings.sound ? 'Звук включён' : 'Звук выключен');
  refs.sound.textContent = data.settings.sound ? '◖))' : '◖×';
}

refs.newRun.addEventListener('click', startNewRun);
refs.continue.addEventListener('click', continueRun);
refs.endNewRun.addEventListener('click', () => { data.run = null; startNewRun(); });
refs.endHome.addEventListener('click', () => goTo('home'));
refs.sound.addEventListener('click', () => {
  data.settings.sound = !data.settings.sound;
  audio.setEnabled(data.settings.sound);
  updateSoundButton();
  persist();
  if (data.settings.sound) sound('click');
});
refs.rules.addEventListener('click', () => openDialog(refs.rulesDialog));
refs.frames.addEventListener('click', () => { renderFrameCatalog(); openDialog(refs.frameDialog); });
refs.clearProgram.addEventListener('click', clearProgram);
refs.execute.addEventListener('click', executeProgram);
refs.tutorialNext.addEventListener('click', advanceTutorial);
refs.tutorialSkip.addEventListener('click', skipTutorial);
refs.canvas.addEventListener('pointerdown', handleBoardPointer, { passive: true });

refs.routeMap.addEventListener('click', (event) => {
  const button = event.target.closest('[data-node-id]');
  if (button) chooseNode(getNode(button.dataset.nodeId));
});

refs.droneDock.addEventListener('click', (event) => {
  const button = event.target.closest('[data-unit-id]');
  const mission = activeMission();
  if (!button || !mission || state.ui.executing) return;
  state.ui.selectedUnit = button.dataset.unitId;
  state.ui.armedCommand = null;
  mission.message = `${UNIT_DEFS[state.ui.selectedUnit].name} выбран. Собери ему такт.`;
  sound('click'); haptic(7); renderMission();
});

refs.timeline.addEventListener('click', (event) => {
  const slot = event.target.closest('[data-slot]');
  if (!slot || state.ui.executing) return;
  state.ui.selectedSlot = Number(slot.dataset.slot);
  state.ui.armedCommand = null;
  renderMission();
});

refs.commandTray.addEventListener('click', (event) => {
  const command = event.target.closest('[data-command]');
  if (command) armCommand(command.dataset.command);
});

refs.eventOptions.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-choice]');
  if (choice) resolveEvent(choice.dataset.choice);
});

refs.rewardOptions.addEventListener('click', (event) => {
  const reward = event.target.closest('[data-reward]');
  if (reward) resolveReward(reward.dataset.reward);
});

refs.frameCatalog.addEventListener('click', (event) => {
  const frame = event.target.closest('[data-frame]');
  if (frame) handleFrameSelection(frame.dataset.frame);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist();
    stopAnimationLoop();
  } else {
    startAnimationLoop();
  }
});
window.addEventListener('pagehide', () => {
  persist();
  stopAnimationLoop();
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

createWorkshopMode({
  appName: 'ТАКТ',
  version: '1.1.0',
  cachePrefix: 'takt-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    store.reset();
    window.location.reload();
  }
});

bootstrapFirstLaunch();
updateSoundButton();
renderScreen();
startAnimationLoop();
