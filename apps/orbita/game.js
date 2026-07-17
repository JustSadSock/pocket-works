import {
  MATCH_TARGET,
  RINGS,
  SECTORS,
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

const STORAGE_STATE = 'pocket-works:orbita:state';
const STORAGE_PREFS = 'pocket-works:orbita:prefs';
const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_RADII = [82, 142, 202, 262];
const ROMAN = ['I', 'II', 'III', 'IV'];
const COLOR_NAMES = ['СИНИЙ', 'КРАСНЫЙ'];
const PLAYER_NAMES = ['ИГРОК 1', 'ИГРОК 2'];

const dom = {
  home: document.querySelector('#homeScreen'),
  game: document.querySelector('#gameScreen'),
  board: document.querySelector('#board'),
  boardWrap: document.querySelector('#boardWrap'),
  newMatch: document.querySelector('#newMatchButton'),
  continueButton: document.querySelector('#continueButton'),
  continueMeta: document.querySelector('#continueMeta'),
  rulesButton: document.querySelector('#rulesButton'),
  settingsButton: document.querySelector('#settingsButton'),
  rulesDialog: document.querySelector('#rulesDialog'),
  settingsDialog: document.querySelector('#settingsDialog'),
  soundToggle: document.querySelector('#soundToggle'),
  hapticsToggle: document.querySelector('#hapticsToggle'),
  restartRound: document.querySelector('#restartRoundButton'),
  resetMatch: document.querySelector('#resetMatchButton'),
  openRulesFromSettings: document.querySelector('#openRulesFromSettings'),
  seatPanels: [document.querySelector('#seat0Panel'), document.querySelector('#seat1Panel')],
  roundNumber: document.querySelector('#roundNumber'),
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
  result: document.querySelector('#resultOverlay'),
  resultKicker: document.querySelector('#resultKicker'),
  resultTitle: document.querySelector('#resultTitle'),
  resultText: document.querySelector('#resultText'),
  resultScore: document.querySelector('#resultScore'),
  nextRound: document.querySelector('#nextRoundButton'),
  resultHome: document.querySelector('#resultHomeButton'),
  toast: document.querySelector('#toast')
};

let state = loadState();
let prefs = loadPrefs();
let selectedRing = 0;
let currentScreen = 'home';
let rotating = false;
let gesture = null;
let toastTimer = null;
let shownResultKey = '';

class AudioEngine {
  constructor() {
    this.context = null;
  }

  ensure() {
    if (!prefs.sound) return null;
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return null;
      this.context = new Context();
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  tone(frequency, duration, options = {}) {
    const context = this.ensure();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime + (options.delay || 0);
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, now + duration);
    gain.gain.setValueAtTime(options.volume || 0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  place(color) {
    this.tone(color === 0 ? 310 : 250, 0.11, { to: color === 0 ? 220 : 180, type: 'triangle', volume: 0.055 });
  }

  rotate(direction) {
    for (let index = 0; index < 5; index += 1) {
      this.tone(direction === 1 ? 175 + index * 8 : 215 - index * 8, 0.045, {
        delay: index * 0.065,
        type: 'square',
        volume: 0.018
      });
    }
    this.tone(direction === 1 ? 110 : 96, 0.25, { delay: 0.28, to: 72, type: 'triangle', volume: 0.035 });
  }

  swap() {
    this.tone(210, 0.18, { to: 330, type: 'triangle', volume: 0.04 });
    this.tone(330, 0.18, { delay: 0.11, to: 210, type: 'triangle', volume: 0.035 });
  }

  win(color) {
    const base = color === 0 ? 196 : 174;
    [1, 1.25, 1.5, 2].forEach((ratio, index) => {
      this.tone(base * ratio, 0.42, { delay: index * 0.1, type: index === 3 ? 'sine' : 'triangle', volume: 0.045 });
    });
  }

  invalid() {
    this.tone(92, 0.1, { to: 70, type: 'square', volume: 0.025 });
  }
}

const audio = new AudioEngine();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_STATE));
    return validateStoredState(parsed) || createGame();
  } catch {
    return createGame();
  }
}

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_PREFS));
    return {
      sound: parsed?.sound !== false,
      haptics: parsed?.haptics !== false,
      gestureHintSeen: parsed?.gestureHintSeen === true
    };
  } catch {
    return { sound: true, haptics: true, gestureHintSeen: false };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_STATE, JSON.stringify(state));
}

function savePrefs() {
  localStorage.setItem(STORAGE_PREFS, JSON.stringify(prefs));
}

function haptic(pattern) {
  if (prefs.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function hasProgress() {
  return !isBoardEmpty(state.board) || state.round > 1 || state.scores.some(Boolean) || state.phase === 'round-over';
}

function setScreen(screen) {
  currentScreen = screen;
  dom.home.hidden = screen !== 'home';
  dom.game.hidden = screen !== 'game';
  dom.result.hidden = true;
  document.body.classList.toggle('playing', screen === 'game');
  if (screen === 'home') {
    renderHome();
  } else {
    render();
    if (state.phase === 'round-over') window.setTimeout(showResult, 240);
  }
}

function renderHome() {
  const progress = hasProgress();
  dom.continueButton.hidden = !progress;
  if (progress) {
    const score = `${state.scores[0]}:${state.scores[1]}`;
    dom.continueMeta.textContent = `раунд ${state.round} · счёт ${score}`;
  }
}

function createSvg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

function pointFor(ring, sector) {
  const angle = ((sector * 45) - 90) * Math.PI / 180;
  const radius = RING_RADII[ring];
  return {
    x: 300 + Math.cos(angle) * radius,
    y: 300 + Math.sin(angle) * radius
  };
}

function buildBoard() {
  dom.board.replaceChildren();
  dom.board.append(createSvg('circle', { class: 'field-disc', cx: 300, cy: 300, r: 292 }));

  for (let sector = 0; sector < SECTORS; sector += 1) {
    const inner = pointAtRadius(56, sector);
    const outer = pointAtRadius(284, sector);
    dom.board.append(createSvg('line', {
      class: 'radial-guide',
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y
    }));
  }

  for (let ring = 0; ring < RINGS; ring += 1) {
    const group = createSvg('g', { class: 'ring-group', 'data-ring-group': ring });
    group.append(createSvg('circle', { class: 'ring-band', cx: 300, cy: 300, r: RING_RADII[ring] }));
    group.append(createSvg('circle', { class: 'ring-rail', cx: 300, cy: 300, r: RING_RADII[ring] }));

    for (let tick = 0; tick < 16; tick += 1) {
      const angle = ((tick * 22.5) - 90) * Math.PI / 180;
      const radius = RING_RADII[ring];
      const length = tick % 2 === 0 ? 8 : 4;
      group.append(createSvg('line', {
        class: 'ring-tick',
        x1: 300 + Math.cos(angle) * (radius - length),
        y1: 300 + Math.sin(angle) * (radius - length),
        x2: 300 + Math.cos(angle) * (radius + length),
        y2: 300 + Math.sin(angle) * (radius + length)
      }));
    }

    for (let sector = 0; sector < SECTORS; sector += 1) {
      const { x, y } = pointFor(ring, sector);
      const cell = createSvg('g', {
        class: 'board-cell',
        transform: `translate(${x} ${y})`,
        'data-cell': 'true',
        'data-ring': ring,
        'data-sector': sector,
        role: 'button',
        tabindex: '0'
      });
      cell.append(createSvg('circle', { class: 'cell-hit', cx: 0, cy: 0, r: 31 }));
      cell.append(createSvg('circle', { class: 'cell-well', cx: 0, cy: 0, r: 21 }));
      group.append(cell);
    }

    const labelPoint = pointAtRadius(RING_RADII[ring], 1);
    const label = createSvg('text', { class: 'ring-number', x: labelPoint.x, y: labelPoint.y });
    label.textContent = ROMAN[ring];
    group.append(label);
    dom.board.append(group);
  }

  dom.board.append(createSvg('circle', { class: 'center-spindle', cx: 300, cy: 300, r: 20 }));
  dom.board.append(createSvg('circle', { class: 'center-dot', cx: 300, cy: 300, r: 6 }));
}

function pointAtRadius(radius, sector) {
  const angle = ((sector * 45) - 90) * Math.PI / 180;
  return { x: 300 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius };
}

function renderBoard() {
  dom.board.classList.toggle('phase-rotate', state.phase === 'rotate');
  const winnerKeys = new Set(state.winPath.map((cell) => `${cell.ring}:${cell.sector}`));
  dom.board.querySelectorAll('[data-cell]').forEach((cell) => {
    const ring = Number(cell.dataset.ring);
    const sector = Number(cell.dataset.sector);
    const value = state.board[ring][sector];
    const isPending = state.pendingPlacement?.ring === ring && state.pendingPlacement?.sector === sector;
    cell.classList.toggle('available', value === null && state.phase === 'place');
    cell.classList.toggle('pending', Boolean(isPending));
    cell.classList.toggle('winner', winnerKeys.has(`${ring}:${sector}`));
    cell.setAttribute('aria-label', value === null
      ? `Свободная ячейка, кольцо ${ring + 1}, сектор ${sector + 1}`
      : `${COLOR_NAMES[value].toLowerCase()} камень, кольцо ${ring + 1}, сектор ${sector + 1}`);
    cell.setAttribute('aria-disabled', String(!(value === null && state.phase === 'place')));

    cell.querySelectorAll('.stone, .stone-core, .stone-shadow').forEach((node) => node.remove());
    if (value !== null) {
      cell.append(createSvg('circle', { class: 'stone-shadow', cx: 0, cy: 0, r: 18 }));
      cell.append(createSvg('circle', { class: `stone color-${value}`, cx: 0, cy: 0, r: 18 }));
      cell.append(createSvg('circle', { class: 'stone-core', cx: -6, cy: -7, r: 5 }));
    }
  });

  dom.board.querySelectorAll('.win-path').forEach((node) => node.remove());
  if (state.winPath.length > 1 && state.winnerColor !== null) {
    const path = createSvg('path', {
      class: `win-path color-${state.winnerColor}`,
      d: winPathData(state.winPath)
    });
    dom.board.insertBefore(path, dom.board.querySelector('.center-spindle'));
  }
}

function winPathData(path) {
  const commands = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    const a = pointFor(current.ring, current.sector);
    const b = pointFor(next.ring, next.sector);
    if (current.ring !== next.ring) {
      commands.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
      continue;
    }
    const clockwise = (next.sector - current.sector + SECTORS) % SECTORS === 1;
    commands.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${RING_RADII[current.ring]} ${RING_RADII[current.ring]} 0 0 ${clockwise ? 1 : 0} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
  }
  return commands.join(' ');
}

function renderScore() {
  dom.roundNumber.textContent = String(state.round);
  dom.seatPanels.forEach((panel, seat) => {
    const color = state.seatColors[seat];
    panel.dataset.color = String(color);
    panel.classList.toggle('active', state.phase !== 'round-over' && state.turnSeat === seat);
    const pipWrap = panel.querySelector('.score-pips');
    pipWrap.replaceChildren();
    for (let index = 0; index < MATCH_TARGET; index += 1) {
      const pip = document.createElement('i');
      pip.classList.toggle('filled', index < state.scores[seat]);
      pipWrap.append(pip);
    }
  });
}

function renderTurn() {
  const color = colorForTurn(state);
  dom.turnStone.classList.toggle('color-1', color === 1);
  dom.turnLabel.textContent = state.phase === 'round-over'
    ? 'РАУНД ЗАВЕРШЁН'
    : `ХОД ${PLAYER_NAMES[state.turnSeat]}`;

  if (state.phase === 'place') {
    dom.phaseLabel.textContent = state.canSwap ? 'Выберите сторону или поставьте камень' : `Поставьте ${COLOR_NAMES[color].toLowerCase()} камень`;
  } else if (state.phase === 'rotate') {
    dom.phaseLabel.textContent = 'Теперь поверните любое кольцо';
  } else if (state.draw) {
    dom.phaseLabel.textContent = 'Свободных ячеек не осталось';
  } else {
    dom.phaseLabel.textContent = 'Цепь соединяет внутреннее и внешнее кольцо';
  }

  dom.pieBanner.hidden = !state.canSwap;
  if (state.canSwap) {
    const strong = dom.pieBanner.querySelector('strong');
    const paragraph = dom.pieBanner.querySelector('p');
    strong.textContent = `${PLAYER_NAMES[state.turnSeat]}: ПРАВИЛО ОБМЕНА`;
    paragraph.textContent = `Можно забрать синий цвет у ${PLAYER_NAMES[1 - state.turnSeat].toLowerCase()}. Обмен считается целым ходом.`;
  }
}

function renderRotationControls() {
  const enabled = state.phase === 'rotate' && !rotating;
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

function renderLastMove() {
  const last = state.history.at(-1);
  if (!last) {
    dom.lastMove.textContent = `Первый ход — у ${PLAYER_NAMES[state.starterSeat].toLowerCase()}`;
    return;
  }
  if (last.type === 'swap') {
    dom.lastMove.textContent = `${PLAYER_NAMES[last.seat]} обменял цвета · ход передан`;
    return;
  }
  const direction = last.direction === 1 ? '↻' : '↺';
  dom.lastMove.textContent = `ХОД ${last.move} · ${PLAYER_NAMES[last.seat]} · КОЛЬЦО ${ROMAN[last.rotatedRing]} ${direction}`;
}

function render() {
  renderScore();
  renderTurn();
  renderBoard();
  renderRotationControls();
  renderLastMove();
  dom.soundToggle.checked = prefs.sound;
  dom.hapticsToggle.checked = prefs.haptics;
  saveState();
}

function attemptPlacement(ring, sector) {
  if (rotating || state.phase !== 'place') return;
  try {
    const color = colorForTurn(state);
    state = placeStone(state, ring, sector);
    selectedRing = ring;
    audio.place(color);
    haptic(18);
    render();
  } catch (error) {
    audio.invalid();
    haptic([12, 35, 12]);
    showToast(error.message);
  }
}

function animateRotation(ring, direction) {
  if (rotating || state.phase !== 'rotate') return;
  const group = dom.board.querySelector(`[data-ring-group="${ring}"]`);
  if (!group) return;
  rotating = true;
  selectedRing = ring;
  dom.board.classList.add('rotating');
  renderRotationControls();
  audio.rotate(direction);
  haptic([10, 45, 10, 45, 18]);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1 : 440;
  group.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1)`;
  requestAnimationFrame(() => {
    group.style.transform = `rotate(${direction * 45}deg)`;
  });

  window.setTimeout(() => {
    try {
      state = rotateRing(state, ring, direction);
    } catch (error) {
      showToast(error.message);
      audio.invalid();
    }
    group.style.transition = 'none';
    group.style.transform = 'rotate(0deg)';
    group.getBoundingClientRect();
    rotating = false;
    dom.board.classList.remove('rotating');
    prefs.gestureHintSeen = true;
    savePrefs();
    render();
    if (state.phase === 'round-over') {
      window.setTimeout(showResult, 300);
    }
  }, duration + 30);
}

function showResult() {
  if (currentScreen !== 'game' || state.phase !== 'round-over') return;
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
    dom.resultTitle.textContent = PLAYER_NAMES[matchSeat];
    dom.resultText.textContent = 'Три победы. Матч взят.';
  } else {
    dom.resultKicker.textContent = 'ЦЕПЬ ЗАМКНУТА';
    dom.resultTitle.textContent = PLAYER_NAMES[winner];
    dom.resultText.textContent = `${COLOR_NAMES[state.winnerColor]} цвет прошёл от внутреннего кольца к внешнему.`;
  }

  dom.resultScore.textContent = `${state.scores[0]} : ${state.scores[1]}`;
  dom.nextRound.textContent = matchSeat !== null ? 'НОВЫЙ МАТЧ' : 'СЛЕДУЮЩИЙ РАУНД';
  dom.result.hidden = false;

  const resultKey = `${state.round}:${state.winnerSeat}:${state.scores.join('-')}:${state.draw}`;
  if (shownResultKey !== resultKey) {
    shownResultKey = resultKey;
    if (!state.draw && state.winnerColor !== null) audio.win(state.winnerColor);
    haptic(state.draw ? [20, 50, 20] : [25, 55, 25, 55, 70]);
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 1800);
}

function openDialog(dialog) {
  if (dialog.open) return;
  dialog.showModal();
}

function normalizedAngleDifference(from, to) {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function svgCoordinates(event) {
  const rect = dom.board.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * 600 / rect.width,
    y: (event.clientY - rect.top) * 600 / rect.height
  };
}

function beginGesture(event) {
  if (state.phase !== 'rotate' || rotating) return;
  const point = svgCoordinates(event);
  const dx = point.x - 300;
  const dy = point.y - 300;
  const radius = Math.hypot(dx, dy);
  const distances = RING_RADII.map((ringRadius) => Math.abs(ringRadius - radius));
  const ring = distances.indexOf(Math.min(...distances));
  if (distances[ring] > 34) return;
  gesture = {
    pointerId: event.pointerId,
    ring,
    startAngle: Math.atan2(dy, dx),
    moved: false
  };
  selectedRing = ring;
  renderRotationControls();
  dom.board.setPointerCapture?.(event.pointerId);
}

function moveGesture(event) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const point = svgCoordinates(event);
  const angle = Math.atan2(point.y - 300, point.x - 300);
  const delta = normalizedAngleDifference(gesture.startAngle, angle);
  if (Math.abs(delta) > 0.08) gesture.moved = true;
}

function endGesture(event) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const active = gesture;
  gesture = null;
  const point = svgCoordinates(event);
  const angle = Math.atan2(point.y - 300, point.x - 300);
  const delta = normalizedAngleDifference(active.startAngle, angle);
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

buildBoard();
renderHome();

dom.newMatch.addEventListener('click', () => {
  state = resetMatch();
  shownResultKey = '';
  selectedRing = 0;
  saveState();
  setScreen('game');
});

dom.continueButton.addEventListener('click', () => setScreen('game'));
dom.rulesButton.addEventListener('click', () => openDialog(dom.rulesDialog));
dom.settingsButton.addEventListener('click', () => openDialog(dom.settingsDialog));

dom.board.addEventListener('click', (event) => handleCellActivation(event.target));
dom.board.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (handleCellActivation(event.target)) event.preventDefault();
});
dom.board.addEventListener('pointerdown', beginGesture);
dom.board.addEventListener('pointermove', moveGesture);
dom.board.addEventListener('pointerup', endGesture);
dom.board.addEventListener('pointercancel', () => { gesture = null; });

dom.ringChoices.forEach((button) => {
  button.addEventListener('click', () => {
    selectedRing = Number(button.dataset.ringChoice);
    renderRotationControls();
    haptic(8);
  });
});
dom.rotateCcw.addEventListener('click', () => animateRotation(selectedRing, -1));
dom.rotateCw.addEventListener('click', () => animateRotation(selectedRing, 1));

dom.swapButton.addEventListener('click', () => {
  try {
    state = swapSides(state);
    audio.swap();
    haptic([18, 45, 18]);
    render();
  } catch (error) {
    showToast(error.message);
  }
});

dom.keepButton.addEventListener('click', () => {
  try {
    state = declineSwap(state);
    haptic(12);
    render();
  } catch (error) {
    showToast(error.message);
  }
});

dom.soundToggle.addEventListener('change', () => {
  prefs.sound = dom.soundToggle.checked;
  savePrefs();
  if (prefs.sound) audio.place(0);
});
dom.hapticsToggle.addEventListener('change', () => {
  prefs.haptics = dom.hapticsToggle.checked;
  savePrefs();
  haptic(18);
});

dom.restartRound.addEventListener('click', () => {
  if (!window.confirm('Переиграть текущий раунд? Счёт матча сохранится.')) return;
  state = restartRound(state);
  shownResultKey = '';
  selectedRing = 0;
  dom.settingsDialog.close();
  render();
});

dom.resetMatch.addEventListener('click', () => {
  if (!window.confirm('Сбросить весь матч и счёт?')) return;
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
  if (matchWinner(state) !== null) {
    state = resetMatch();
  } else {
    state = nextRound(state);
  }
  shownResultKey = '';
  selectedRing = 0;
  dom.result.hidden = true;
  render();
});

dom.resultHome.addEventListener('click', () => {
  dom.result.hidden = true;
  setScreen('home');
});

window.addEventListener('pagehide', saveState);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveState();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}
