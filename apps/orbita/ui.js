import { MATCH_TARGET, colorForTurn, matchWinner } from './engine.js';
import { AI_LEVELS } from './ai.js';
import { ROMAN } from './board.js';

const COLOR_NAMES = ['СИНИЙ', 'КРАСНЫЙ'];
let toastTimer = null;

export const dom = {
  home: document.querySelector('#homeScreen'),
  game: document.querySelector('#gameScreen'),
  board: document.querySelector('#board'),
  aiMatch: document.querySelector('#aiMatchButton'),
  localMatch: document.querySelector('#localMatchButton'),
  continueButton: document.querySelector('#continueButton'),
  continueMeta: document.querySelector('#continueMeta'),
  rulesButton: document.querySelector('#rulesButton'),
  settingsButton: document.querySelector('#settingsButton'),
  rulesDialog: document.querySelector('#rulesDialog'),
  settingsDialog: document.querySelector('#settingsDialog'),
  soundToggle: document.querySelector('#soundToggle'),
  hapticsToggle: document.querySelector('#hapticsToggle'),
  difficultySelect: document.querySelector('#difficultySelect'),
  difficultyButtons: [...document.querySelectorAll('[data-difficulty]')],
  restartRound: document.querySelector('#restartRoundButton'),
  resetMatch: document.querySelector('#resetMatchButton'),
  openRulesFromSettings: document.querySelector('#openRulesFromSettings'),
  seatPanels: [document.querySelector('#seat0Panel'), document.querySelector('#seat1Panel')],
  seatNames: [document.querySelector('#seat0Name'), document.querySelector('#seat1Name')],
  roundNumber: document.querySelector('#roundNumber'),
  modeBadge: document.querySelector('#modeBadge'),
  turnStone: document.querySelector('#turnStone'),
  turnLabel: document.querySelector('#turnLabel'),
  phaseLabel: document.querySelector('#phaseLabel'),
  pieBanner: document.querySelector('#pieBanner'),
  swapButton: document.querySelector('#swapButton'),
  keepButton: document.querySelector('#keepButton'),
  rotationPanel: document.querySelector('#rotationPanel'),
  ringChoices: [...document.querySelectorAll('[data-ring-choice]')],
  rotateCcw: document.querySelector('#rotateCcw'),
  rotateCw: document.querySelector('#rotateCw'),
  selectedRingLabel: document.querySelector('#selectedRingLabel'),
  gestureHint: document.querySelector('#gestureHint'),
  lastMove: document.querySelector('#lastMove'),
  aiStatus: document.querySelector('#aiStatus'),
  aiStatusText: document.querySelector('#aiStatusText'),
  result: document.querySelector('#resultOverlay'),
  resultKicker: document.querySelector('#resultKicker'),
  resultTitle: document.querySelector('#resultTitle'),
  resultText: document.querySelector('#resultText'),
  resultScore: document.querySelector('#resultScore'),
  nextRound: document.querySelector('#nextRoundButton'),
  resultHome: document.querySelector('#resultHomeButton'),
  toast: document.querySelector('#toast')
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
  dom.aiMatch.querySelector('small').textContent = `${AI_LEVELS[prefs.difficulty].label.toLowerCase()} · матч до трёх побед`;
}

export function renderScore(state, prefs) {
  dom.roundNumber.textContent = String(state.round);
  dom.modeBadge.textContent = prefs.mode === 'ai' ? AI_LEVELS[prefs.difficulty].label : 'НА ДВОИХ';
  dom.seatNames.forEach((node, seat) => { node.textContent = playerName(prefs, seat); });
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
  else if (state.phase === 'place') dom.phaseLabel.textContent = state.canSwap ? 'Выберите сторону или поставьте камень' : `Поставьте ${COLOR_NAMES[color].toLowerCase()} камень`;
  else if (state.phase === 'rotate') dom.phaseLabel.textContent = 'Теперь поверните любое кольцо';
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
    dom.resultKicker.textContent = 'ЦЕПЬ ЗАМКНУ�(�$	��K��\�[]K�^�۝[�H^Y\��[YJ�Y���[��\�N�K��\�[^�^�۝[�H	���ԗӐSQT���]K��[��\���ܗ_H4a�,�-t`�4/�`4/�b4dt.�4/�`�4,�/t`�`�`4-t/t/t-t,�/�4.�/�.�c4a�,4.�4,�/t-tb4/t-t/4`˘B���K��\�[��ܙK�^�۝[�H	��]K���ܙ\��_H�	��]K���ܙ\��W_X�K��^��[��^�۝[�HX]��X]OOH�[�	�'t'�$�*�&H4'4$4(�)I��	�(t&�%t%4(�+�*t&4&H4(4$4(�'t%	��K��\�[�Y[�H�[�N�]\��	��]K���[�N���]K��[��\��X]N���]K���ܙ\˚��[�	�I�_N���]K��]�XB��^ܝ�[��[ۈ����\�
Y\��Y�JH�[��˘�X\�[Y[�]
�\�[Y\�N�K��\��^�۝[�HY\��Y�N�K��\��Y[�H�[�N�\�[Y\�H�[��˜�][Y[�]


HO���K��\��Y[�H�YN�KN
NB��^ܝ�[��[ۈ�[�X[��X[��HY�
YX[�˛�[�HX[�˜���[�[

NB