function render() {
  if (!game) return;
  el.azureName.textContent = playerLabel(PLAYER.AZURE);
  el.ochreName.textContent = playerLabel(PLAYER.OCHRE);
  el.azureStatus.textContent = status(PLAYER.AZURE);
  el.ochreStatus.textContent = status(PLAYER.OCHRE);
  el.azurePieces.textContent = game.cellsFor(PLAYER.AZURE).length;
  el.ochrePieces.textContent = game.cellsFor(PLAYER.OCHRE).length;
  el.azureReserve.textContent = game.reserve[PLAYER.AZURE];
  el.ochreReserve.textContent = game.reserve[PLAYER.OCHRE];

  el.azureReserveButton.disabled = !humanCanAct() || game.turn !== PLAYER.AZURE || game.reserve[PLAYER.AZURE] <= 0;
  el.ochreReserveButton.disabled = !humanCanAct() || game.turn !== PLAYER.OCHRE || game.reserve[PLAYER.OCHRE] <= 0;
  el.azureReserveButton.classList.toggle('ready', deployMode && game.turn === PLAYER.AZURE);
  el.ochreReserveButton.classList.toggle('ready', deployMode && game.turn === PLAYER.OCHRE);

  el.azureStrip.classList.toggle('active', !game.winner && game.turn === PLAYER.AZURE);
  el.ochreStrip.classList.toggle('active', !game.winner && game.turn === PLAYER.OCHRE);
  el.turnLabel.textContent = game.winner
    ? '\u0414\u0443\u044d\u043b\u044c \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430'
    : `\u0425\u043e\u0434 ${NAME[game.turn]}`;
  el.turnPill.querySelector('.turn-dot').className = `turn-dot ${CLASS[game.turn]}`;
  el.undoButton.disabled = !snapshots.length || aiBusy;
  el.clearButton.disabled = (!selected.length && !deployMode) || aiBusy;
  el.swapOffer.classList.toggle('hidden', !(game.canClaimOpening() && !swapDeclined && humanCanAct()));
  el.boardCaption.textContent = caption();

  board.render({ game, selected, deployMode, interactive: humanCanAct() });
}

