import { MATCH_TARGET, colorForTurn, matchWinner } from './engine.js';
import { AI_LEVELS } from './ai.js';
import { ROMAN } from './board.js';

const COLOR_NAMES = ['СИНИЙ', 'КРАСНЫЙ'];
let toastTimer = null;

function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`ОРБИТА: отсутствует элемент ${selector}`);
  return element;
}

export const dom = {
  home: required('#homeScreen'),
  game: required('#gameScreen'),
  board: required('#board'),
  aiMatch: required('#aiMatchButton'),
  localMatch: required('#localMatchButton'),
  continueButton: required('#continueButton'),
  continueMeta: required('#continueMeta'),
  rulesButton: required('#rulesButton'),
  settingsButton: required('#settingsButton'),
  rulesDialog: required('#rulesDialog'),
  settingsDialog: required('#settingsDialog'),
  soundToggle: required('#soundToggle'),
  hapticsToggle: required('#hapticsToggle'),
  difficultySelect: required('#difficultySelect'),
  difficultyButtons: [...document.querySelectorAll('[data-difficulty]')],
  restartRound: required('#restartRoundButton'),
  resetMatch: required('#resetMatchButton'),
  openRulesFromSettings: required('#openRulesFromSettings'),
  seatPanels: [required('#seat0Panel'), required('#seat1Panel')],
  seatNames: [required('#seat0Name'), required('#seat1Name')],
  roundNumber: required('#roundNumber'),
  modeBadge: required('#modeBadge'),
  turnStone: required('#turnStone'),
  turnLabel: required('#turnLabel'),
  phaseLabel: required('#phaseLabel'),
  pieBanner: required('#pieBanner'),
  swapButton: required('#swapButton'),
  keepButton: required('#keepButton'),
  rotationPanel: required('#rotationPanel'),
  ringChoices: [...document.querySelectorAll('[data-ring-choice]')],
  rotateCcw: required('#rotateCcw'),
  rotateCw: required('#rotateCw'),
  selectedRingLabel: required('#selectedRingLabel'),
  gestureHint: required('#gestureHint'),
  lastMove: required('#lastMove'),
  aiStatus: required('#aiStatus'),
  aiStatusText: required('#aiStatusText'),
  result: required('#resultOverlay'),
  resultKicker: required('#resultKicker'),
  resultTitle: required('#resultTitle'),
  resultText: required('#resultText'),
  resultScore: required('#resultScore'),
  nextRound: required('#nextRoundButton'),
  resultHome: required('#resultHomeButton'),
  toast: required('#toast')
};

export function playerName(prefs, seat) {
  return prefs.mode === 'ai' ? (seat === 0 ? 'ВЫ' : 'ОРБИТА') : `ИГРОК ${seat + 1}`;
}

export function renderHome(state, prefs, hasProgress) {
  dom.continueButton.hidden = !hasProgress;
  if (hasProgress) {
    const opponent = prefs.mode === 'ai' ? AI_LEVELS[prefs.difficulty].label : 'ЛОКАЛЬНЫЙ PvP';
    dom.continueMeta.textContent = `раунд ${state.round} · ${state.scores[0]}:${state.scores[1]} · ${opponent}`;
  }
  renderDifficultyControls(prefs);
}

export function renderDifficultyControls(prefs) {
  dom.difficultyButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.difficulty === prefs.difficulty));
  });
  dom.difficultySelect.value = prefs.difficulty;
  const subtitle = dom.aiMatch.querySelector('small');
  if (subtitle) subtitle.textContent = `${AI_LEVELS[prefs.difficulty].label.toLowerCase()} · матч до трёх побед`;
}

export function renderScore(state, prefs) {
  dom.roundNumber.textContent = String(state.round);
  dom.modeBadge.textContent = prefs.mode === 'ai' ? AI_LEVELS[prefs.difficulty].label : 'НА ДВОИХ';
  dom.seatNames.forEach((node, seat) => {
    node.textContent = playerName(prefs, seat);
  });

  dom.seatPanels.forEach((panel, seat) => {
    panel.dataset.color = String(state.seatColors[seat]);
    panel.classList.toggle('active', state.phase !== 'round-over' && state.turnSeat === seat);
    panel.classList.toggle('ai-seat', prefs.mode === 'ai' && seat === 1);
    const pipWrap = panel.querySelector('.score-pips');
    pipWrap.replaceChildren();
    for (let index = 0; index < MATCH_TARGET; index += 1) {
      const pip = document.createElement('i');
      pip.classList.toggle('filled', index < state.scores[seat]);
      pipWrap.append(pip);
    }
  });
}

export function renderTurn(state, prefs, { aiThinking, humanCanAct }) {
  const color = colorForTurn(state);
  dom.turnStone.classList.toggle('color-1', color === 1);

  if (state.phase === 'round-over') dom.turnLabel.textContent = 'РАУНД ЗАВЕРШЁН';
  else if (aiThinking || (prefs.mode === 'ai' && state.turnSeat === 1)) dom.turnLabel.textContent = 'ХОД ОРБИТЫ';
  else dom.turnLabel.textContent = `ХОД ${playerName(prefs, state.turnSeat)}`;

  if (aiThinking) dom.phaseLabel.textContent = 'ИИ просчитывает вращения';
  else if (state.phase === 'place') {
    dom.phaseLabel.textContent = state.canSwap
      ? 'Выберите сторону или поставьте камень'
      : `Поставьте ${COLOR_NAMES[color].toLowerCase()} камень`;
  } else if (state.phase === 'rotate') dom.phaseLabel.textContent = 'Теперь поверните любое кольцо';
  else if (state.draw) dom.phaseLabel.textContent = 'Свободных ячеек не осталось';
  else dom.phaseLabel.textContent = 'Цепь соединяет внутреннее и внешнее кольцо';

  const showPie = state.canSwap && humanCanAct;
  dom.pieBanner.hidden = !showPie;
  if (showPie) {
    dom.pieBanner.querySelector('strong').textContent = `${playerName(prefs, state.turnSeat)}: ПРАВИЛО ОБМЕНА`;
    dom.pieBanner.querySelector('p').textContent = `Можно забрать первый цвет у ${playerName(prefs, 1 - state.turnSeat).toLowerCase()}. Обмен считается целым ходом.`;
  }

  dom.aiStatus.hidden = !aiThinking;
  dom.aiStatusText.textContent = `${AI_LEVELS[prefs.difficulty].label} перебирает варианты`;
}

export function renderRotationControls(state, prefs, { selectedRing, enabled }) {
  dom.rotationPanel.classList.toggle('enabled', enabled);
  dom.ringChoices.forEach((button, ring) => {
    button.setAttribute('aria-pressed', String(ring === selectedRing));
    button.disabled = !enabled;
  });
  dom.rotateCcw.disabled = !enabled;
  dom.rotateCw.disabled = !enabled;
  dom.selectedRingLabel.textContent = ROMAN[selectedRing];
  dom.gestureHint.hidden = !enabled || prefs.gestureHintSeen;
}

export function renderLastMove(state, prefs) {
  const last = state.history.at(-1);
  if (!last) {
    dom.lastMove.textContent = `Первый ход — у ${playerName(prefs, state.starterSeat).toLowerCase()}`;
    return;
  }
  if (last.type === 'swap') {
    dom.lastMove.textContent = `${playerName(prefs, last.seat)} обменял цвета · ход передан`;
    return;
  }
  dom.lastMove.textContent = `ХОД ${last.move} · ${playerName(prefs, last.seat)} · КОЛЬЦО ${ROMAN[last.rotatedRing]} ${last.direction === 1 ? '↻' : '↺'}`;
}

export function renderSettings(prefs) {
  dom.soundToggle.checked = prefs.sound;
  dom.hapticsToggle.checked = prefs.haptics;
  renderDifficultyControls(prefs);
}

export function renderResult(state, prefs) {
  const winner = state.winnerSeat;
  const matchSeat = matchWinner(state);
  dom.result.classList.remove('color-0', 'color-1');
  if (winner !== null) dom.result.classList.add(`color-${state.winnerColor}`);

  if (state.draw) {
    dom.resultKicker.textContent = 'РАУНД ЗАВЕРШЁН';
    dom.resultTitle.textContent = 'НИЧЬЯ';
    dom.resultText.textContent = 'Поле заполнено, но ни одна цепь не дошла до края.';
  } else if (matchSeat !== null) {
    dom.resultKicker.textContent = 'МАТЧ ЗАВЕРШЁН';
    dom.resultTitle.textContent = playerName(prefs, matchSeat);
    dom.resultText.textContent = matchSeat === 1 && prefs.mode === 'ai'
      ? 'Машина забрала три раунда. Неприятно, зато честно.'
      : 'Три победы. Матч взят.';
  } else {
    dom.resultKicker.textContent = 'ЦЕПЬ ЗАМКНУТА';
    dom.resultTitle.textContent = playerName(prefs, winner);
    dom.resultText.textContent = `${COLOR_NAMES[state.winnerColor]} цвет прошёл от внутреннего кольца к внешнему.`;
  }

  dom.resultScore.textContent = `${state.scores[0]} : ${state.scores[1]}`;
  dom.nextRound.textContent = matchSeat !== null ? 'НОВЫЙ МАТЧ' : 'СЛЕДУЮЩИЙ РАУНД';
  dom.result.hidden = false;
  return `${state.round}:${state.winnerSeat}:${state.scores.join('-')}:${state.draw}`;
}

export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 1800);
}
