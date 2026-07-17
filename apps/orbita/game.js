import {
  colorForTurn,
  createGame,
  declineSwap,
  isBoardEmpty,
  matchWinner,
  nextRound,
  placeStone,
  resetMatch,
  restartRound,
  rotateRing,
  swapSides,
  validateStoredState
} from './engine.js';
import { AI_LEVELS, chooseAiRotation, chooseAiTurn, shouldAiSwap } from './ai.js';
import {
  angleFromCenter,
  animateBoardRing,
  buildBoard,
  nearestRing,
  normalizedAngleDifference,
  renderBoard,
  svgCoordinates
} from './board.js';
import { createFeedback } from './feedback.js';
import {
  dom,
  openDialog,
  renderDifficultyControls,
  renderHome,
  renderLastMove,
  renderResult,
  renderRotationControls,
  renderScore,
  renderSettings,
  renderTurn,
  showToast
} from './ui.js';

const STORAGE_STATE = 'pocket-works:orbita:state';
const STORAGE_PREFS = 'pocket-works:orbita:prefs';
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

let state = loadState();
let prefs = loadPrefs();
let selectedRing = 0;
let currentScreen = 'home';
let rotating = false;
let aiThinking = false;
let aiTimer = null;
let gesture = null;
let shownResultKey = '';
const feedback = createFeedback(() => prefs);

function loadState() {
  try { return validateStoredState(JSON.parse(localStorage.getItem(STORAGE_STATE))) || createGame(); }
  catch { return createGame(); }
}

function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_PREFS));
    return {
      sound: stored?.sound !== false,
      haptics: stored?.haptics !== false,
      gestureHintSeen: stored?.gestureHintSeen === true,
      mode: stored?.mode === 'local' ? 'local' : 'ai',
      difficulty: AI_LEVELS[stored?.difficulty] ? stored.difficulty : 'medium'
    };
  } catch {
    return { sound: true, haptics: true, gestureHintSeen: false, mode: 'ai', difficulty: 'medium' };
  }
}

function saveState() { localStorage.setItem(STORAGE_STATE, JSON.stringify(state)); }
function savePrefs() { localStorage.setItem(STORAGE_PREFS, JSON.stringify(prefs)); }
function isAiTurn() { return prefs.mode === 'ai' && state.turnSeat === 1 && state.phase !== 'round-over'; }
function humanCanAct() { return !rotating && !aiThinking && !isAiTurn(); }
function hasProgress() { return !isBoardEmpty(state.board) || state.round > 1 || state.scores.some(Boolean) || state.phase === 'round-over'; }

function cancelAi() {
  window.clearTimeout(aiTimer);
  aiTimer = null;
  aiThinking = false;
}

function setScreen(screen) {
  currentScreen = screen;
  dom.home.hidden = screen !== 'home';
  dom.game.hidden = screen !== 'game';
  dom.result.hidden = true;
  if (screen === 'home') {
    cancelAi();
    renderHome(state, prefs, hasProgress());
  } else {
    render();
    if (state.phase === 'round-over') window.setTimeout(showResult, 220);
  }
}

function render() {
  const canAct = humanCanAct();
  renderScore(state, prefs);
  renderTurn(state, prefs, { aiThinking, humanCanAct: canAct });
  renderBoard(dom.board, state, {
    canPlace: state.phase === 'place' && canAct,
    locked: isAiTurn() || aiThinking
  });
  renderRotationControls(state, prefs, {
    selectedRing,
    enabled: state.phase === 'rotate' && canAct
  });
  renderLastMove(state, prefs);
  renderSettings(prefs);
  saveState();
  scheduleAi();
}

function attemptPlacement(ring, sector) {
  if (!humanCanAct() || state.phase !== 'place') return;
  try {
    const color = colorForTurn(state);
    state = placeStone(state, ring, sector);
    selectedRing = ring;
    feedback.place(color);
    feedback.haptic(18);
    render();
  } catch (error) {
    feedback.invalid();
    feedback.haptic([12, 35, 12]);
    showToast(error.message);
  }
}

async function animateRotation(ring, direction, { ai = false } = {}) {
  if (rotating || state.phase !== 'rotate') return false;
  rotating = true;
  selectedRing = ring;
  renderRotationControls(state, prefs, { selectedRing, enabled: false });
  feedback.rotate(direction);
  feedback.haptic(ai ? 10 : [10, 45, 10, 45, 18]);
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 440;
  await animateBoardRing(dom.board, ring, direction, duration);
  try { state = rotateRing(state, ring, direction); }
  catch (error) { showToast(error.message); feedback.invalid(); }
  rotating = false;
  if (ai) aiThinking = false;
  prefs.gestureHintSeen = true;
  savePrefs();
  render();
  if (state.phase === 'round-over') window.setTimeout(showResult, 280);
  return true;
}

function scheduleAi() {
  window.clearTimeout(aiTimer);
  aiTimer = null;
  if (currentScreen !== 'game' || prefs.mode !== 'ai' || state.turnSeat !== 1 || state.phase === 'round-over' || rotating || aiThinking) return;
  aiTimer = window.setTimeout(runAiTurn, 360);
}

async function runAiTurn() {
  if (currentScreen !== 'game' || prefs.mode !== 'ai' || state.turnSeat !== 1 || state.phase === 'round-over') return;
  aiThinking = true;
  render();
  await wait(prefs.difficulty === 'hard' ? 420 : 300);

  try {
    if (state.phase === 'place' && state.canSwap) {
      if (shouldAiSwap(state, prefs.difficulty)) {
        state = swapSides(state);
        feedback.swap();
        feedback.haptic([14, 40, 14]);
        aiThinking = false;
        render();
        return;
      }
      state = declineSwap(state);
    }

    if (state.phase === 'rotate') {
      const rotation = chooseAiRotation(state, prefs.difficulty);
      if (!rotation) throw new Error('ИИ не нашёл вращение');
      await animateRotation(rotation.rotatedRing, rotation.direction, { ai: true });
      return;
    }

    const move = chooseAiTurn(state, prefs.difficulty);
    if (!move) throw new Error('ИИ не нашёл ход');
    const color = colorForTurn(state);
    state = placeStone(state, move.ring, move.sector);
    selectedRing = move.rotatedRing;
    feedback.place(color);
    feedback.haptic(10);
    renderScore(state, prefs);
    renderTurn(state, prefs, { aiThinking: true, humanCanAct: false });
    renderBoard(dom.board, state, { canPlace: false, locked: true });
    renderRotationControls(state, prefs, { selectedRing, enabled: false });
    saveState();
    await wait(300);
    await animateRotation(move.rotatedRing, move.direction, { ai: true });
  } catch (error) {
    aiThinking = false;
    showToast(error.message || 'ИИ сломал собственный телескоп');
    render();
  }
}

function showResult() {
  if (currentScreen !== 'game' || state.phase !== 'round-over') return;
  const key = renderResult(state, prefs);
  if (shownResultKey === key) return;
  shownResultKey = key;
  if (!state.draw && state.winnerColor !== null) feedback.win(state.winnerColor);
  feedback.haptic(state.draw ? [20, 50, 20] : [25, 55, 25, 55, 70]);
}

function beginGesture(event) {
  if (state.phase !== 'rotate' || !humanCanAct()) return;
  const point = svgCoordinates(dom.board, event);
  const ring = nearestRing(point);
  if (ring === null) return;
  gesture = { pointerId: event.pointerId, ring, startAngle: angleFromCenter(point), moved: false };
  selectedRing = ring;
  renderRotationControls(state, prefs, { selectedRing, enabled: true });
  dom.board.setPointerCapture?.(event.pointerId);
}

function moveGesture(event) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const point = svgCoordinates(dom.board, event);
  const delta = normalizedAngleDifference(gesture.startAngle, angleFromCenter(point));
  if (Math.abs(delta) > 0.08) gesture.moved = true;
}

function endGesture(event) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const active = gesture;
  gesture = null;
  const point = svgCoordinates(dom.board, event);
  const delta = normalizedAngleDifference(active.startAngle, angleFromCenter(point));
  if (active.moved && Math.abs(delta) > 0.16) {
    event.preventDefault();
    animateRotation(active.ring, delta > 0 ? 1 : -1);
  }
}

function handleCellActivation(target) {
  const cell = target.closest?.('[data-cell]');
  if (!cell) return false;
  attemptPlacement(Number(cell.dataset.ring), Number(cell.dataset.sector));
  return true;
}

function startMatch(mode) {
  cancelAi();
  prefs.mode = mode;
  state = resetMatch();
  shownResultKey = '';
  selectedRing = 0;
  savePrefs();
  saveState();
  setScreen('game');
}

function setDifficulty(level) {
  if (!AI_LEVELS[level]) return;
  prefs.difficulty = level;
  savePrefs();
  renderDifficultyControls(prefs);
  if (currentScreen === 'game') render();
}

buildBoard(dom.board);
renderHome(state, prefs, hasProgress());

dom.aiMatch.addEventListener('click', () => startMatch('ai'));
dom.localMatch.addEventListener('click', () => startMatch('local'));
dom.continueButton.addEventListener('click', () => setScreen('game'));
dom.rulesButton.addEventListener('click', () => openDialog(dom.rulesDialog));
dom.settingsButton.addEventListener('click', () => openDialog(dom.settingsDialog));
dom.difficultyButtons.forEach((button) => button.addEventListener('click', () => setDifficulty(button.dataset.difficulty)));
dom.difficultySelect.addEventListener('change', () => setDifficulty(dom.difficultySelect.value));

dom.board.addEventListener('click', (event) => handleCellActivation(event.target));
dom.board.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (handleCellActivation(event.target)) event.preventDefault();
});
dom.board.addEventListener('pointerdown', beginGesture);
dom.board.addEventListener('pointermove', moveGesture);
dom.board.addEventListener('pointerup', endGesture);
dom.board.addEventListener('pointercancel', () => { gesture = null; });

dom.ringChoices.forEach((button) => button.addEventListener('click', () => {
  if (!humanCanAct()) return;
  selectedRing = Number(button.dataset.ringChoice);
  renderRotationControls(state, prefs, { selectedRing, enabled: true });
  feedback.haptic(8);
}));
dom.rotateCcw.addEventListener('click', () => animateRotation(selectedRing, -1));
dom.rotateCw.addEventListener('click', () => animateRotation(selectedRing, 1));

dom.swapButton.addEventListener('click', () => {
  if (!humanCanAct()) return;
  try { state = swapSides(state); feedback.swap(); feedback.haptic([18, 45, 18]); render(); }
  catch (error) { showToast(error.message); }
});
dom.keepButton.addEventListener('click', () => {
  if (!humanCanAct()) return;
  try { state = declineSwap(state); feedback.haptic(12); render(); }
  catch (error) { showToast(error.message); }
});

dom.soundToggle.addEventListener('change', () => { prefs.sound = dom.soundToggle.checked; savePrefs(); if (prefs.sound) feedback.place(0); });
dom.hapticsToggle.addEventListener('change', () => { prefs.haptics = dom.hapticsToggle.checked; savePrefs(); feedback.haptic(18); });

dom.restartRound.addEventListener('click', () => {
  if (!window.confirm('Переиграть текущий раунд? Счёт матча сохранится.')) return;
  cancelAi();
  state = restartRound(state);
  shownResultKey = '';
  selectedRing = 0;
  dom.settingsDialog.close();
  render();
});

dom.resetMatch.addEventListener('click', () => {
  if (!window.confirm('Сбросить весь матч и счёт?')) return;
  cancelAi();
  state = resetMatch();
  shownResultKey = '';
  selectedRing = 0;
  dom.settingsDialog.close();
  render();
});

dom.openRulesFromSettings.addEventListener('click', () => {
  dom.settingsDialog.close();
  window.setTimeout(() => openDialog(dom.rulesDialog), 60);
});
dom.nextRound.addEventListener('click', () => {
  cancelAi();
  state = matchWinner(state) !== null ? resetMatch() : nextRound(state);
  shownResultKey = '';
  selectedRing = 0;
  dom.result.hidden = true;
  render();
});
dom.resultHome.addEventListener('click', () => { dom.result.hidden = true; setScreen('home'); });
window.addEventListener('pagehide', saveState);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveState(); cancelAi(); }
  else if (currentScreen === 'game') render();
});
