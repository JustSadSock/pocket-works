import assert from 'node:assert/strict';
import {
  applyMove,
  chooseAIMove,
  createGame,
  forceTimeLoss,
  isBurned,
  isCracked,
  legalMoves,
  restoreGame,
  serializeGame,
  shortestPathToGoal
} from './engine.mjs';

{
  const game = createGame({ size: 7 });
  assert.equal(game.pieRule, false);
  assert.deepEqual(legalMoves(game).sort(), ['E', 'N', 'S', 'W']);
  const moved = applyMove(game, 'N');
  assert.equal(moved.current, 1);
  assert.equal(moved.swapAvailable, false);
  assert.equal(isCracked(moved, 3, 3), true);
  assert.equal(isBurned(moved, 3, 3), false);
  assert(legalMoves(moved).includes('S'));
}

{
  let game = createGame({ size: 7 });
  game = applyMove(game, 'N');
  game = applyMove(game, 'S');
  assert.equal(isCracked(game, 3, 2), true);
  game = applyMove(game, 'N');
  assert.equal(isBurned(game, 3, 3), true);
  assert.equal(isCracked(game, 3, 3), false);
  assert.equal(legalMoves(game).includes('S'), false);
}

{
  let game = createGame({ size: 7, pieRule: true });
  game = applyMove(game, 'N');
  assert.equal(game.swapAvailable, true);
  game = applyMove(game, 'SWAP');
  assert.deepEqual(game.goals, ['south', 'north']);
  assert.equal(game.current, 0);
  assert.equal(game.swapUsed, true);
}

{
  let game = createGame({ size: 7 });
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
  assert.equal(restored.schema, 2);
  assert.equal(restored.cracked, 1n << 40n);
  assert.equal(restored.burned, 0n);
  assert.equal(shortestPathToGoal(restored, 0), 5);
}

{
  const legacy = restoreGame({
    schema: 1,
    size: 7,
    x: 3,
    y: 2,
    burned: (1n << 24n).toString(16),
    current: 1,
    goals: ['north', 'south'],
    pieRule: false,
    plies: 1,
    swapAvailable: false,
    swapUsed: false,
    ended: false,
    winner: null,
    reason: null
  });
  assert(legacy);
  assert.equal(legacy.schema, 2);
  assert.equal(legacy.cracked, 0n);
  assert.equal(isBurned(legacy, 3, 3), true);
}

{
  const game = forceTimeLoss(createGame(), 0);
  assert.equal(game.winner, 1);
  assert.equal(game.reason, 'time');
}

{
  let game = createGame({ size: 7 });
  game = { ...game, x: 2, y: 0, current: 0 };
  assert.equal(chooseAIMove(game, 'cutter'), 'EXIT_N');
}

console.log('СЛЕД 1.1 engine tests: ok');
