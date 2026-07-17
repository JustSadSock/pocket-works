
function performMove(move, actor = 'human') {
  if (!game || game.winner || (actor === 'human' && !humanCanAct())) return;
  if (actor === 'human' && game.canClaimOpening()) silentDeclineSwap();
  snapshots.push(snapshot());
  const result = game.applyMove(move);
  if (!result.ok) {
    snapshots.pop();
    toast('\u042d\u0442\u043e\u0442 \u0441\u0442\u0440\u043e\u0439 \u0442\u0430\u043a \u043d\u0435 \u0434\u0432\u0438\u0433\u0430\u0435\u0442\u0441\u044f');
    buzz('error');
    return;
  }

  selected = [];
  deployMode = false;
  el.boardFrame.classList.remove('deploy-mode');
  if (result.move.kind === 'deploy') {
    toast('\u041f\u043e\u0434\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u0438\u0435 \u0432\u0435\u0440\u043d\u0443\u043b\u043e\u0441\u044c \u0432 \u0441\u0442\u0440\u043e\u0439');
    sound('deploy', result.player);
  } else if (result.move.kind === 'push') {
    el.boardFrame.classList.remove('push-kick');
    void el.boardFrame.offsetWidth;
    el.boardFrame.classList.add('push-kick');
    sound(result.ejected.length ? 'eject' : 'push', result.player);
  } else {
    sound(result.move.kind === 'broadside' ? 'slide' : 'move', result.player);
  }
  buzz(result.move.kind === 'push' ? 'push' : 'move');

  if (result.centerClaim?.player === result.player && result.centerClaim.replies === 0) {
    toast(`${NAME[result.player]} \u0437\u0430\u044f\u0432\u043b\u044f\u0435\u0442 \u041e\u0441\u044c`);
  }

  if (!game.winner && game.legalMoves().length === 0) {
    game.winner = result.player;
    game.winReason = 'immobilized';
  }

  saveGame();
  render();
  if (game.winner) setTimeout(showResult, 360);
  else if (actor === 'human') maybeAI();
}

function maybeAI() {
  if (!game || mode !== 'ai' || game.winner || actorSeat() !== 2 || aiBusy) return;
  aiBusy = true;
  selected = [];
  deployMode = false;
  el.thinkingText.textContent = THINKING[aiStyle];
  el.thinking.classList.remove('hidden');
  render();

  setTimeout(() => {
    if (!game || game.winner || actorSeat() !== 2) {
      aiBusy = false;
      el.thinking.classList.add('hidden');
      return;
    }

    if (game.canClaimOpening()) {
      if (shouldSwapOpening(game, aiStyle)) {
        snapshots.push(snapshot());
        game.claimOpening();
        seatForColor = { 1: seatForColor[2], 2: seatForColor[1] };
        swapDeclined = true;
        aiBusy = false;
        el.thinking.classList.add('hidden');
        toast('\u041a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440 \u0437\u0430\u0431\u0440\u0430\u043b \u043f\u0435\u0440\u0432\u044b\u0439 \u0441\u0442\u0440\u043e\u0439');
        saveGame();
        render();
        maybeAI();
        return;
      }
      silentDeclineSwap();
    }

    const move = chooseAIMove(game, { level, style: aiStyle });
    aiBusy = false;
    el.thinking.classList.add('hidden');
    if (move) performMove(move, 'ai');
    else {
      game.winner = 3 - game.turn;
      game.winReason = 'immobilized';
      saveGame();
      render();
      showResult();
    }
  }, level === 'sharp' ? 420 : level === 'calm' ? 250 : 330);
}

