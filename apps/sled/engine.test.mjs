import assert from 'node:assert/strict';
import {
  KOMI,
  PASS,
  applyMove,
  boardCellCount,
  chooseAIMove,
  createBoard,
  createGame,
  directionForMove,
  directionFromDelta,
  forceTimeLoss,
  isClaimed,
  legalDestinations,
  legalMoves,
  ownerOf,
  rawScores,
  restoreGame,
  rotateIndex180,
  scoreState,
  serializeGame,
  territoryForecast
} from './engine.mjs';

for (const [radius, count] of [[3, 37], [4, 61], [5, 91]]) {
  const board = createBoard(radius);
  assert.equal(board.count, count);
  assert.equal(boardCellCount(radius), count);
  assert.equal(board.cells.length, count);
  assert.equal(board.neighbors[board.indexByKey.get('0,0')].filter((index) => index >= 0).length, 6);
  for (let index = 0; index < board.count; index += 1) {
    const rotated = rotateIndex180(radius, index);
    assert.equal(rotateIndex180(radius, rotated), index);
  }
  assert.equal(rotateIndex180(radius, board.starts[0]), board.starts[1]);
}

{
  const game = createGame({ radius: 3 });
  assert.equal(game.komi, KOMI);
  assert.equal(legalDestinations(game, 0).length, 6);
  assert.equal(legalDestinations(game, 1).length, 6);
  assert.equal(legalMoves(game).length, 6);
  assert.deepEqual(scoreState(game), [0, 0.5]);
}

{
  const game = createGame({ radius: 3 });
  const destination = legalDestinations(game, 0)[0];
  const from = game.positions[0];
  const moved = applyMove(game, destination);
  assert.equal(moved.positions[0], destination);
  assert.equal(moved.current, 1);
  assert.equal(isClaimed(moved, from), true);
  assert.equal(ownerOf(moved, from), 0);
  assert.deepEqual(rawScores(moved), [1, 0]);
  assert.equal(legalDestinations(moved, 1).includes(destination), false, 'occupied hex is never legal');
  assert(directionForMove(game, 0, destination));
}

{
  let game = createGame({ radius: 3 });
  const board = createBoard(3);
  const current = game.positions[0];
  const allowed = board.neighbors[current].find((index) => index >= 0 && index !== game.positions[1]);
  let mask = 0n;
  for (const index of board.neighbors[current]) if (index >= 0 && index !== allowed) mask |= 1n << BigInt(index);
  game = { ...game, claimed: [mask, 0n] };
  assert.deepEqual(legalMoves(game), [allowed]);
}

{
  let game = createGame({ radius: 3 });
  const board = createBoard(3);
  const blocked = [...new Set([
    ...board.neighbors[game.positions[0]],
    ...board.neighbors[game.positions[1]]
  ].filter((index) => index >= 0 && !game.positions.includes(index)))];
  assert.equal(blocked.length % 2, 0);
  blocked.forEach((index, order) => {
    game.claimed[order % 2] |= 1n << BigInt(index);
  });
  assert.deepEqual(legalMoves(game), [PASS]);
  game = applyMove(game, PASS);
  assert.equal(game.ended, false);
  assert.equal(game.current, 1);
  assert.deepEqual(legalMoves(game), [PASS]);
  game = applyMove(game, PASS);
  assert.equal(game.ended, true);
  assert.equal(game.reason, 'territory');
  assert.equal(game.winner, 1, 'half-point komi resolves a 0:0 board for the second seat');
}

{
  let game = createGame({ radius: 4 });
  game = applyMove(game, legalDestinations(game, 0)[2]);
  game = applyMove(game, legalDestinations(game, 1)[3]);
  const restored = restoreGame(serializeGame(game));
  assert(restored);
  assert.deepEqual(restored.positions, game.positions);
  assert.deepEqual(restored.claimed, game.claimed);
  assert.deepEqual(scoreState(restored), scoreState(game));
  assert.equal(restoreGame({ ...serializeGame(game), schema: 2 }), null);
}

{
  const game = createGame({ radius: 3 });
  const forecast = territoryForecast(game);
  assert.equal(forecast.control[0], forecast.control[1]);
  assert(forecast.contested > 0);
}

{
  const game = createGame({ radius: 3 });
  for (const level of ['cutter', 'tactician', 'architect']) {
    const move = chooseAIMove(game, level);
    assert(legalMoves(game).includes(move));
  }
}

{
  const timed = forceTimeLoss(createGame({ radius: 3 }), 0);
  assert.equal(timed.ended, true);
  assert.equal(timed.winner, 1);
  assert.equal(timed.reason, 'time');
}

assert.equal(directionFromDelta(40, 0), 'E');
assert.equal(directionFromDelta(20, -36), 'NE');
assert.equal(directionFromDelta(-20, -36), 'NW');
assert.equal(directionFromDelta(-40, 0), 'W');
assert.equal(directionFromDelta(-20, 36), 'SW');
assert.equal(directionFromDelta(20, 36), 'SE');
assert.equal(directionFromDelta(2, 3), null);

console.log('СЛЕД 2.0 engine tests: ok');
