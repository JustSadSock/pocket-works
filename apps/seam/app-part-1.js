'use strict';
const {
  installMobileRuntime, createWorkshopMode, watchConnectivity,
  AxisGame, PLAYER, coordKey, parseCoordKey, lineBetween, chooseAIMove, shouldSwapOpening,
  BoardView
} = globalThis.__AXIS_DEPS;

installMobileRuntime();

const VERSION = '2.2.0';
const SAVE_KEY = 'pocket-works:seam:v3';
const SETTINGS_KEY = 'pocket-works:seam:settings:v2';
const TUTORIAL_KEY = 'pocket-works:seam:tutorial:v2';
const $ = (selector) => document.querySelector(selector);

const ids = [
  'startScreen','gameScreen','startButton','resumeButton','resumeMeta','modeChoices','levelChoices','levelLine','menuButton',
  'boardCanvas','boardFrame','boardCaption','thinking','thinkingText','toast','tutorialCard',
  'azureStrip','ochreStrip','azureName','ochreName','azureStatus','ochreStatus','azurePieces','ochrePieces',
  'azureReserve','ochreReserve','azureReserveButton','ochreReserveButton',
  'swapOffer','swapButton','declineSwapButton','turnPill','turnLabel','clearButton','undoButton','rulesButton',
  'rulesStartButton','auditStartButton','sheetLayer','sheetBackdrop','menuSheet','rulesSheet','auditSheet','resultSheet',
  'continueButton','newGameButton','menuRulesButton','menuAuditButton','soundToggle','hapticToggle','resignButton',
  'resultTitle','resultMark','resultReason','resultText','rematchButton','resultHomeButton'
];
const el = Object.fromEntries(ids.map((id) => [id, $(`#${id}`)]));

const NAME = { 1: '\u041b\u0430\u0437\u0443\u0440\u044c', 2: '\u041e\u0445\u0440\u0430' };
const CLASS = { 1: 'azure', 2: 'ochre' };
const STYLES = ['rush', 'ram', 'shell', 'flank', 'balanced'];
const THINKING = {
  rush: '\u0421\u043e\u043f\u0435\u0440\u043d\u0438\u043a \u0438\u0449\u0435\u0442 \u043f\u0440\u043e\u0445\u043e\u0434 \u043a \u0446\u0435\u043d\u0442\u0440\u0443',
  ram: '\u0421\u043e\u043f\u0435\u0440\u043d\u0438\u043a \u043f\u0440\u0438\u043c\u0435\u0440\u044f\u0435\u0442\u0441\u044f \u043a \u0442\u043e\u043b\u0447\u043a\u0443',
  shell: '\u0421\u043e\u043f\u0435\u0440\u043d\u0438\u043a \u0441\u0442\u044f\u0433\u0438\u0432\u0430\u0435\u0442 \u0441\u0442\u0440\u043e\u0439',
  flank: '\u0421\u043e\u043f\u0435\u0440\u043d\u0438\u043a \u043e\u0431\u0445\u043e\u0434\u0438\u0442 \u0444\u043b\u0430\u043d\u0433',
  balanced: '\u0421\u043e\u043f\u0435\u0440\u043d\u0438\u043a \u043f\u0435\u0440\u0435\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u0444\u0440\u043e\u043d\u0442'
};

let mode = 'ai';
let level = 'club';
let game = null;
let snapshots = [];
let seatForColor = { 1: 1, 2: 2 };
let starterSeat = 1;
let aiStyle = 'balanced';
let aiBusy = false;
let swapDeclined = false;
let selected = [];
let deployMode = false;
let toastTimer = 0;
let newGameArmed = false;
let resignArmed = false;
let audioContext = null;
let settings = loadSettings();

const reserveStyle = document.createElement('link');
reserveStyle.rel = 'stylesheet';
reserveStyle.href = './reserve.css?v=2.2.0';
document.head.append(reserveStyle);

const board = new BoardView(el.boardCanvas, el.boardFrame, {
  onCell: handleCell,
  onMove: (move) => performMove(move)
});

function loadSettings() {
  try {
    return { sound: true, haptic: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { sound: true, haptic: true };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  el.soundToggle.querySelector('em').textContent = settings.sound ? '\u0412\u043a\u043b' : '\u0412\u044b\u043a\u043b';
  el.hapticToggle.querySelector('em').textContent = settings.haptic ? '\u0412\u043a\u043b' : '\u0412\u044b\u043a\u043b';
}

function randomStyle() {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return STYLES[(values[0] || Date.now()) % STYLES.length];
}

function snapshot() {
  return { game: game.toJSON(), seatForColor: { ...seatForColor }, starterSeat, aiStyle, swapDeclined };
}

function restore(data) {
  game = AxisGame.fromJSON(data.game);
  seatForColor = { 1: Number(data.seatForColor?.[1]) || 1, 2: Number(data.seatForColor?.[2]) || 2 };
  starterSeat = Number(data.starterSeat) || 1;
  aiStyle = data.aiStyle || 'balanced';
  swapDeclined = Boolean(data.swapDeclined);
  selected = [];
  deployMode = false;
}

function saveGame() {
  if (!game) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ version: VERSION, mode, level, current: snapshot(), snapshots }));
  refreshResume();
}

function refreshResume() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    const available = data?.version === VERSION && data?.current?.game && !data.current.game.winner;
    el.resumeButton.classList.toggle('hidden', !available);
    if (available) {
      const opponent = data.mode === 'ai'
        ? '\u043f\u0440\u043e\u0442\u0438\u0432 \u043a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440\u0430'
        : '\u0432\u0434\u0432\u043e\u0451\u043c';
      el.resumeMeta.textContent = `\u0425\u043e\u0434 ${Number(data.current.game.moveNumber || 0) + 1} \u00b7 ${opponent}`;
    }
  } catch {
    el.resumeButton.classList.add('hidden');
  }
}

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!data?.current?.game || data.version !== VERSION) return false;
    mode = data.mode || 'ai';
    level = data.level || 'club';
    snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    restore(data.current);
    syncChoices();
    showGame();
    render();
    maybeAI();
    return true;
  } catch (error) {
    console.warn('Could not restore AXIS game', error);
    return false;
  }
}

function startGame({ alternate = false } = {}) {
  starterSeat = alternate ? (starterSeat === 1 ? 2 : 1) : 1;
  game = new AxisGame({ maxTurns: 200 });
  seatForColor = { 1: starterSeat, 2: 3 - starterSeat };
  snapshots = [];
  aiStyle = randomStyle();
  aiBusy = false;
  swapDeclined = false;
  selected = [];
  deployMode = false;
  saveGame();
  showGame();
  render();
  if (!localStorage.getItem(TUTORIAL_KEY)) el.tutorialCard.classList.remove('hidden');
  maybeAI();
}

function showGame() {
  closeSheets();
  el.startScreen.classList.add('hidden');
  el.gameScreen.classList.remove('hidden');
  el.menuButton.classList.remove('hidden');
  requestAnimationFrame(() => board.resize());
}

function showStart() {
  aiBusy = false;
  closeSheets();
  el.gameScreen.classList.add('hidden');
  el.startScreen.classList.remove('hidden');
  el.menuButton.classList.add('hidden');
  refreshResume();
}

function actorSeat() {
  return game ? seatForColor[game.turn] : 0;
}

function humanCanAct() {
  return Boolean(game && !game.winner && !aiBusy && (mode === 'local' || actorSeat() === 1));
}

function silentDeclineSwap() {
  if (!game?.canClaimOpening()) return;
  game.swapAvailable = false;
  swapDeclined = true;
}

