import assert from 'node:assert/strict';
import {
  applyMove,
  chooseAIMove,
  createGame,
  forceTimeLoss,
  isBurned,
  legalMoves,
  restoreGame,
  serializeGame,
  shortestPathToGoal
} from './engine.mjs';

{
  const game = createGame({ size: 7, pieRule: true });
  assert.deepEqual(legalMoves(game).sort(), ['E', 'N', 'S', 'W']);
  const moved = applyMove(game, 'N');
  assert.equal(moved.current, 1);
  assert.equal(moved.swapAvailable, true);
  assert.equal(isBurned(moved, 3, 3), true);
  assert.equal(moved.x, 3);
  assert.equal(moved.y, 2);
}

{
  let game = createGame({ size: 7, pieRule: true });
  game = applyMove(game, 'N');
  game = applyMove(game, 'SWAP');
  assert.deepEqual(game.goals, ['south', 'north']);
  assert.equal(game.current, 0);
  assert.equal(game.swapUsed, true);
}

{
  let game = createGame({ size: 7, pieRule: false });
  game = { ...game, x: 3, y: 0, current: 0 };
  assert(legalMoves(game).includes('EXIT_N'));
  game = applyMove(game, 'EXIT_N');
  assert.equal(game.ended, true);
  assert.equal(game.winner, 0);
  assert.equal(game.reason, 'exit');
}

{
  const game = createGame({ size: 9 });
  const restored = restoreGame(serializeGame(applyMove(game, 'E')));
  assert(restored);
  assert.equal(restored.burned, 1n << 40n);
  assert.equal(shortestPathToGoal(restored, 0), 5);
}

{
  const game = forceTimeLoss(createGame(), 0);
  assert.equal(game.winner, 1);
  assert.equal(game.reason, 'time');
}

{
  let game = createGame({ size: 7, pieRule: false });
  game = { ...game, x: 2, y: 0, current: 0 };
  assert.equal(chooseAIMove(game, 'cutter'), 'EXIT_N');
}

console.log('СЛЕД engine tests: ok');
