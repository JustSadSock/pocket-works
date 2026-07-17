
function toast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add('show');
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1700);
}

function openSheet(sheet) {
  el.sheetLayer.classList.remove('hidden');
  for (const candidate of [el.menuSheet, el.rulesSheet, el.auditSheet, el.resultSheet]) candidate.classList.add('hidden');
  sheet.classList.remove('hidden');
}

function closeSheets() {
  el.sheetLayer.classList.add('hidden');
  for (const candidate of [el.menuSheet, el.rulesSheet, el.auditSheet, el.resultSheet]) candidate.classList.add('hidden');
}

function showResult() {
  if (!game?.winner) return;
  if (game.winner < 0) {
    el.resultTitle.textContent = '\u041b\u0438\u043c\u0438\u0442 \u0445\u043e\u0434\u043e\u0432';
    el.resultReason.textContent = '\u041d\u0438\u0447\u044c\u044f';
    el.resultText.textContent = '\u041f\u043e\u0437\u0438\u0446\u0438\u044f \u043d\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u043b\u0430\u0441\u044c \u0437\u0430 200 \u0445\u043e\u0434\u043e\u0432.';
    openSheet(el.resultSheet);
    return;
  }
  const player = game.winner;
  el.resultTitle.textContent = `${NAME[player]} \u043f\u043e\u0431\u0435\u0434\u0438\u043b\u0430`;
  el.resultMark.className = `player-mark ${CLASS[player]}`;
  if (game.winReason === 'crown-ejected') {
    el.resultReason.textContent = '\u041a\u043e\u0440\u0435\u043d\u044c \u0432\u044b\u0431\u0438\u0442';
    el.resultText.textContent = '\u0412\u0440\u0430\u0436\u0435\u0441\u043a\u0438\u0439 \u041a\u043e\u0440\u0435\u043d\u044c \u0432\u044b\u0442\u043e\u043b\u043a\u043d\u0443\u043b\u0438 \u0437\u0430 \u043a\u0440\u0430\u0439 \u043f\u043e\u043b\u044f.';
  } else if (game.winReason === 'immobilized') {
    el.resultReason.textContent = '\u0421\u0442\u0440\u043e\u0439 \u0437\u0430\u043f\u0435\u0440\u0442';
    el.resultText.textContent = '\u0423 \u0441\u043e\u043f\u0435\u0440\u043d\u0438\u043a\u0430 \u043d\u0435 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043a\u043e\u043d\u043d\u044b\u0445 \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0439.';
  } else if (game.winReason === 'resign') {
    el.resultReason.textContent = '\u0421\u043e\u043f\u0435\u0440\u043d\u0438\u043a \u0441\u0434\u0430\u043b\u0441\u044f';
    el.resultText.textContent = '\u041f\u0430\u0440\u0442\u0438\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430 \u0441\u0434\u0430\u0447\u0435\u0439.';
  } else {
    el.resultReason.textContent = '\u041e\u0441\u044c \u0443\u0434\u0435\u0440\u0436\u0430\u043d\u0430';
    el.resultText.textContent = '\u041a\u043e\u0440\u0435\u043d\u044c \u0432 \u0446\u0435\u043d\u0442\u0440\u0435 \u0441 \u0447\u0435\u0442\u044b\u0440\u044c\u043c\u044f \u0441\u043e\u044e\u0437\u043d\u0438\u043a\u0430\u043c\u0438 \u043f\u0435\u0440\u0435\u0436\u0438\u043b \u0442\u0440\u0438 \u043e\u0442\u0432\u0435\u0442\u043d\u044b\u0445 \u0445\u043e\u0434\u0430.';
  }
  openSheet(el.resultSheet);
}

function confirmNewGame() {
  if (!newGameArmed) {
    newGameArmed = true;
    el.newGameButton.querySelector('small').textContent = '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u2014 \u043f\u043e\u0437\u0438\u0446\u0438\u044f \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u043c\u0435\u043d\u0435\u043d\u0430';
    setTimeout(() => {
      newGameArmed = false;
      el.newGameButton.querySelector('small').textContent = '\u0417\u0430\u043c\u0435\u043d\u0438\u0442 \u0442\u0435\u043a\u0443\u0449\u0435\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435';
    }, 2500);
    return;
  }
  newGameArmed = false;
  closeSheets();
  startGame();
}

function resign() {
  if (!game || game.winner) return;
  if (!resignArmed) {
    resignArmed = true;
    el.resignButton.querySelector('small').textContent = '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c';
    setTimeout(() => {
      resignArmed = false;
      el.resignButton.querySelector('small').textContent = '\u041f\u043e\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0432\u0442\u043e\u0440\u043e\u0435 \u043d\u0430\u0436\u0430\u0442\u0438\u0435';
    }, 2500);
    return;
  }
  game.winner = 3 - game.turn;
  game.winReason = 'resign';
  saveGame();
  closeSheets();
  showResult();
}

function audio() {
  if (!settings.sound) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(frequency, duration, gain = .03, type = 'sine', delay = 0) {
  const context = audio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay);
  volume.gain.setValueAtTime(.0001, context.currentTime + delay);
  volume.gain.exponentialRampToValueAtTime(gain, context.currentTime + delay + .012);
  volume.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + duration + .03);
}

function sound(kind, player = PLAYER.AZURE) {
  const base = player === PLAYER.AZURE ? 180 : 220;
  if (kind === 'select') tone(base * 1.6, .045, .018, 'triangle');
  if (kind === 'move') tone(base, .08, .03, 'triangle');
  if (kind === 'slide') tone(base * .82, .12, .026, 'triangle');
  if (kind === 'push') { tone(92, .12, .05, 'square'); tone(150, .08, .028, 'triangle', .04); }
  if (kind === 'eject') { tone(72, .2, .07, 'sawtooth'); tone(220, .08, .025, 'triangle', .08); }
  if (kind === 'deploy') { tone(base * .72, .11, .03, 'triangle'); tone(base * 1.18, .09, .02, 'sine', .055); }
}

function buzz(kind) {
  if (!settings.haptic || !navigator.vibrate) return;
  const pattern = { move: 12, push: [18,20,18], error: [10,25,10] }[kind] || 8;
  navigator.vibrate(pattern);
}


