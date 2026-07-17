
function syncChoices() {
  for (const button of el.modeChoices.querySelectorAll('button')) {
    button.classList.toggle('selected', button.dataset.value === mode);
  }
  for (const button of el.levelChoices.querySelectorAll('button')) {
    button.classList.toggle('selected', button.dataset.value === level);
  }
  el.levelLine.classList.toggle('hidden', mode !== 'ai');
}

function playerLabel(player) {
  const seat = seatForColor[player];
  if (mode === 'ai') {
    return `${seat === 1 ? '\u0412\u044b' : '\u041a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440'} \u00b7 ${NAME[player]}`;
  }
  return `\u0418\u0433\u0440\u043e\u043a ${seat} \u00b7 ${NAME[player]}`;
}

function status(player) {
  if (game.winner) return game.winner === player ? '\u041f\u043e\u0431\u0435\u0434\u0430' : '\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435';
  if (game.centerClaim?.player === player) return `\u041e\u0441\u044c: ${game.centerClaim.replies}/${game.centerReplies}`;
  if (aiBusy && seatForColor[player] === 2) return '\u0414\u0443\u043c\u0430\u0435\u0442';
  if (game.turn === player) {
    return mode === 'ai' && seatForColor[player] === 1 ? '\u0412\u0430\u0448 \u0445\u043e\u0434' : '\u0425\u043e\u0434\u0438\u0442';
  }
  return '\u0416\u0434\u0451\u0442 \u0445\u043e\u0434\u0430';
}

