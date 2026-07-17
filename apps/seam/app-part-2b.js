function claimSwap() {
  if (!game?.canClaimOpening() || !humanCanAct()) return;
  snapshots.push(snapshot());
  game.claimOpening();
  seatForColor = { 1: seatForColor[2], 2: seatForColor[1] };
  swapDeclined = true;
  selected = [];
  deployMode = false;
  saveGame();
  render();
  maybeAI();
}

function declineSwap() {
  if (!game?.canClaimOpening() || !humanCanAct()) return;
  snapshots.push(snapshot());
  silentDeclineSwap();
  saveGame();
  render();
  maybeAI();
}

function undo() {
  if (!game || aiBusy || !snapshots.length) return;
  restore(snapshots.pop());
  if (mode === 'ai') {
    while (snapshots.length && actorSeat() !== 1) restore(snapshots.pop());
  }
  game.winner = 0;
  game.winReason = '';
  saveGame();
  render();
}

function clearSelection() {
  selected = [];
  deployMode = false;
  el.boardFrame.classList.remove('deploy-mode');
  render();
}

function toggleDeploy(player) {
  if (!humanCanAct() || game.turn !== player || game.reserve[player] <= 0) return;
  selected = [];
  deployMode = !deployMode;
  el.boardFrame.classList.toggle('deploy-mode', deployMode);
  if (deployMode) toast('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043f\u043e\u0434\u0441\u0432\u0435\u0447\u0435\u043d\u043d\u0443\u044e \u043a\u043b\u0435\u0442\u043a\u0443 \u0434\u043e\u043c\u0430\u0448\u043d\u0435\u0433\u043e \u043a\u0440\u0430\u044f');
  render();
}

function handleCell(cell) {
  if (!humanCanAct()) return;
  const key = coordKey(cell);
  if (deployMode) {
    const move = game.legalMoves().find((candidate) =>
      candidate.kind === 'deploy' && candidate.destinations?.[0] === key
    );
    if (move) performMove(move);
    else toast('\u041f\u043e\u0434\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u0438\u044e \u043d\u0443\u0436\u043d\u0430 \u0441\u0432\u043e\u0431\u043e\u0434\u043d\u0430\u044f \u043a\u043b\u0435\u0442\u043a\u0430 \u0440\u044f\u0434\u043e\u043c \u0441 \u0441\u043e\u044e\u0437\u043d\u0438\u043a\u043e\u043c');
    return;
  }

  if (game.valueAt(cell) !== game.turn) {
    clearSelection();
    return;
  }

  if (!selected.length) selected = [key];
  else {
    const line = lineBetween(parseCoordKey(selected[0]), cell, game).map(coordKey);
    selected = line.length ? line : [key];
  }
  sound('select', game.turn);
  render();
}


